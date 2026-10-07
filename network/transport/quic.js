import { createHmac, randomFillSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { QUICSocket, QUICServer, QUICClient, events } from '@matrixai/quic';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import { verifyEnvelope } from '../../core/protocol/index.js';
import { BoundedAdmissionQueue } from '../admission/bounded-queue.js';
import { sharedEventLoopMonitor } from '../admission/load-monitor.js';
import { createSessionHello, createSessionAccept, verifySessionHello, verifySessionAccept, sessionHandshakeBinding, sessionId, SessionReplayCache } from '../sessions/authenticated-session.js';

export const TRUYN_QUIC_ALPN = 'truyn/1';

export function createQuicLogger(level = process.env.TRUYN_QUIC_LOG_LEVEL) {
  const levels = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
    silent: LogLevel.SILENT
  };
  return new Logger('TruynQuic', levels[String(level || '').toLowerCase()] ?? LogLevel.WARN, [new StreamHandler()]);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const TRANSIENT_UDP_SEND_CODES = new Set(['EPERM', 'ENOBUFS', 'EAGAIN', 'EWOULDBLOCK']);

export function normalizeTransientQuicUdpSendError(error) {
  if (!TRANSIENT_UDP_SEND_CODES.has(error?.code)) return error;
  const normalized = new Error('quic_udp_send_temporarily_unavailable', { cause: error });
  // @matrixai/quic@2.0.9 treats unknown send_ errors as internal/fatal. Linux
  // netfilter packet drops can surface as EPERM from dgram.send(); ENETUNREACH
  // is already classified by the upstream client/server as a non-fatal send
  // dropout. Preserve the original error as cause and translate only EPERM.
  normalized.code = 'ENETUNREACH';
  normalized.originalCode = error.code;
  if (typeof error?.syscall === 'string') normalized.syscall = error.syscall;
  if (typeof error?.address === 'string') normalized.address = error.address;
  if (Number.isInteger(error?.port)) normalized.port = error.port;
  normalized.transient = true;
  return normalized;
}

class TruynQuicSocket extends QUICSocket {
  async send_(...params) {
    try {
      return await super.send_(...params);
    } catch (error) {
      throw normalizeTransientQuicUdpSendError(error);
    }
  }
}

function arrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function serverCrypto() {
  const key = arrayBuffer(randomBytes(32));
  return {
    key,
    ops: {
      async sign(secret, data) {
        return arrayBuffer(createHmac('sha256', Buffer.from(secret)).update(Buffer.from(data)).digest());
      },
      async verify(secret, data, signature) {
        const expected = createHmac('sha256', Buffer.from(secret)).update(Buffer.from(data)).digest();
        const actual = Buffer.from(signature);
        return actual.length === expected.length && timingSafeEqual(actual, expected);
      }
    }
  };
}

const clientCrypto = { ops: { async randomBytes(data) { randomFillSync(new Uint8Array(data)); } } };

async function readAll(readable, maxBytes = 1_048_576) {
  const reader = readable.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      size += chunk.length;
      if (size > maxBytes) throw new Error('quic_message_too_large');
      chunks.push(chunk);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

async function writeJson(stream, value) {
  const writer = stream.writable.getWriter();
  try {
    await writer.write(encoder.encode(JSON.stringify(value)));
    await writer.close();
  } finally { writer.releaseLock(); }
}

async function requestJson(connection, value, maxBytes) {
  const stream = connection.newStream('bidi');
  const responseP = readAll(stream.readable, maxBytes);
  await writeJson(stream, value);
  const body = await responseP;
  return JSON.parse(decoder.decode(body));
}

function boundedHandlerError(error, fallback) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_:-]{1,96}$/.test(error.code) ? error.code : null;
  const message = typeof error?.message === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(error.message) ? error.message : null;
  return code || message || fallback;
}

export class TruynQuicTransport {
  constructor({
    identity,
    host = '0.0.0.0',
    port = 0,
    tls,
    maxMessageBytes = 1_048_576,
    maxInboundInFlight = 64,
    maxInboundQueued = 256,
    maxControlInFlight = 64,
    maxControlQueued = 512,
    maxCriticalInFlight = 64,
    maxCriticalQueued = 1024,
    backgroundShedLagMs = 150,
    loadMonitor = null
  } = {}) {
    if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem) throw new Error('QUIC transport identity is required');
    if (!tls?.key || !tls?.cert) throw new Error('QUIC server TLS key and certificate are required');
    this.identity = identity;
    this.host = host;
    this.port = port;
    this.tls = tls;
    this.maxMessageBytes = maxMessageBytes;
    this.logger = createQuicLogger();
    this.socket = new TruynQuicSocket({ logger: this.logger.getChild('QUICSocket') });
    this.server = null;
    this.clients = new Set();
    this.serverSessions = new WeakMap();
    this.clientSessions = new WeakMap();
    this.replayCache = new SessionReplayCache();
    this.inboundAdmission = new BoundedAdmissionQueue({
      maxInFlight: maxInboundInFlight,
      maxQueued: maxInboundQueued,
      errorCode: 'TRUYN_BACKPRESSURE',
      errorMessage: 'inbound_backpressure'
    });
    this.criticalAdmission = new BoundedAdmissionQueue({
      maxInFlight: maxCriticalInFlight,
      maxQueued: maxCriticalQueued,
      errorCode: 'TRUYN_BUSY',
      errorMessage: 'critical_control_backpressure'
    });
    this.controlAdmission = new BoundedAdmissionQueue({
      maxInFlight: maxControlInFlight,
      maxQueued: maxControlQueued,
      errorCode: 'TRUYN_BUSY',
      errorMessage: 'control_backpressure'
    });
    this.backgroundShedLagMs = backgroundShedLagMs;
    this.loadMonitor = loadMonitor;
    this.shedStats = { background: 0, backpressure: 0 };
    this.envelopeHandler = null;
    this.controlHandler = null;
  }

  controlAdmissionSnapshot() {
    return {
      critical: this.criticalAdmission.snapshot(),
      control: this.controlAdmission.snapshot(),
      backgroundShedLagMs: this.backgroundShedLagMs,
      shed: { ...this.shedStats },
      eventLoop: this.loadMonitor?.snapshot?.() || null
    };
  }

  onEnvelope(handler) {
    this.envelopeHandler = typeof handler === 'function' ? handler : null;
    return this;
  }

  onControl(handler) {
    this.controlHandler = typeof handler === 'function' ? handler : null;
    return this;
  }

  admissionSnapshot() { return this.inboundAdmission.snapshot(); }

  async start() {
    if (!this.loadMonitor) this.loadMonitor = sharedEventLoopMonitor();
    await this.socket.start({ host: this.host, port: this.port, reuseAddr: true });
    this.server = new QUICServer({
      crypto: serverCrypto(),
      socket: this.socket,
      logger: this.logger.getChild('QUICServer'),
      config: {
        key: this.tls.key,
        cert: this.tls.cert,
        ca: this.tls.ca,
        verifyPeer: false,
        applicationProtos: [TRUYN_QUIC_ALPN],
        maxIdleTimeout: 30_000,
        keepAliveIntervalTime: 10_000
      }
    });
    this.server.addEventListener(events.EventQUICServerConnection.name, (event) => this.#attachServerConnection(event.detail));
    await this.server.start();
    this.host = this.socket.host;
    this.port = this.socket.port;
    return { host: this.host, port: this.port, endpoint: `quic://${this.host}:${this.port}` };
  }

  #attachServerConnection(connection) {
    connection.addEventListener(events.EventQUICConnectionStream.name, (event) => {
      void this.#handleServerStream(connection, event.detail).catch(() => event.detail.cancel?.(new Error('truyn_quic_stream_failed')));
    });
  }

  async #handleServerStream(connection, stream) {
    const bytes = await readAll(stream.readable, this.maxMessageBytes);
    let message;
    try { message = JSON.parse(decoder.decode(bytes)); } catch { await writeJson(stream, { ok: false, error: 'invalid_json' }); return; }

    if (message?.kind === 'session-hello') {
      const verification = verifySessionHello(message.hello, { replayCache: this.replayCache });
      if (!verification.ok) { await writeJson(stream, { ok: false, error: verification.reason }); return; }
      const binding = sessionHandshakeBinding(message.hello);
      const accept = createSessionAccept({ identity: this.identity, hello: message.hello, transportBinding: binding });
      const id = sessionId(message.hello, accept);
      this.serverSessions.set(connection, { id, peerNodeId: message.hello.nodeId, peerPublicKey: message.hello.publicKey, binding });
      await writeJson(stream, { ok: true, accept, sessionId: id });
      return;
    }

    const session = this.serverSessions.get(connection);
    if (!session || message.sessionId !== session.id) { await writeJson(stream, { ok: false, error: 'quic_session_required' }); return; }

    if (message?.kind === 'control') {
      if (typeof message.method !== 'string' || !message.method.trim()) { await writeJson(stream, { ok: false, error: 'quic_control_method_required' }); return; }
      if (!this.controlHandler) { await writeJson(stream, { ok: false, error: 'no_control_handler' }); return; }
      const lane = message.lane === 'critical' || message.lane === 'background' ? message.lane : 'control';
      if (lane === 'background' && (
        this.loadMonitor?.overloaded?.(this.backgroundShedLagMs) ||
        this.controlAdmission.inFlight >= this.controlAdmission.maxInFlight
      )) {
        this.shedStats.background += 1;
        await writeJson(stream, { ok: false, error: 'TRUYN_BUSY' });
        return;
      }
      const admission = lane === 'critical' ? this.criticalAdmission : this.controlAdmission;
      try {
        const result = await admission.run(() => this.controlHandler(message.method, message.payload ?? null, {
          peerNodeId: session.peerNodeId,
          peerPublicKey: session.peerPublicKey,
          transport: 'quic',
          lane,
          connection
        }));
        await writeJson(stream, { ok: true, result: result ?? null });
      } catch (error) {
        if (error?.code === 'TRUYN_BUSY') this.shedStats.backpressure += 1;
        await writeJson(stream, { ok: false, error: boundedHandlerError(error, 'quic_control_handler_failed') });
      }
      return;
    }

    if (message?.kind === 'envelope') {
      const verification = verifyEnvelope(message.envelope);
      if (!verification.ok) { await writeJson(stream, { ok: false, error: verification.reason }); return; }
      if (message.envelope.from !== session.peerNodeId || message.envelope.publicKey !== session.peerPublicKey) { await writeJson(stream, { ok: false, error: 'quic_session_sender_mismatch' }); return; }
      if (!this.envelopeHandler) { await writeJson(stream, { ok: false, error: 'no_envelope_handler' }); return; }
      try {
        const result = await this.inboundAdmission.run(() => this.envelopeHandler(message.envelope, {
          peerNodeId: session.peerNodeId,
          transport: 'quic',
          connection
        }));
        await writeJson(stream, { ok: true, result: result ?? null });
      } catch (error) {
        await writeJson(stream, { ok: false, error: boundedHandlerError(error, 'quic_envelope_handler_failed') });
      }
      return;
    }

    await writeJson(stream, { ok: false, error: 'unsupported_quic_message' });
  }

  async connect({ host, port, serverName = host, ca = this.tls.ca } = {}) {
    const client = await QUICClient.createQUICClient({
      host,
      port,
      serverName,
      socket: this.socket,
      crypto: clientCrypto,
      logger: this.logger.getChild('QUICClient'),
      config: {
        ca,
        verifyPeer: Boolean(ca),
        applicationProtos: [TRUYN_QUIC_ALPN],
        maxIdleTimeout: 30_000,
        keepAliveIntervalTime: 10_000
      }
    });
    this.clients.add(client);
    const hello = createSessionHello({ identity: this.identity, endpoints: [`quic://${this.host}:${this.port}`] });
    const response = await requestJson(client.connection, { kind: 'session-hello', hello }, this.maxMessageBytes);
    if (!response?.ok) { await this.disconnect(client); throw new Error(response?.error || 'quic_session_rejected'); }
    const binding = sessionHandshakeBinding(hello);
    const verification = verifySessionAccept(response.accept, hello, { expectedTransportBinding: binding });
    if (!verification.ok) { await this.disconnect(client); throw new Error(`quic_session_accept_invalid:${verification.reason}`); }
    const expectedSessionId = sessionId(hello, response.accept);
    if (response.sessionId !== expectedSessionId) { await this.disconnect(client); throw new Error('quic_session_id_mismatch'); }
    this.clientSessions.set(client.connection, { id: expectedSessionId, peerNodeId: response.accept.nodeId, peerPublicKey: response.accept.publicKey, binding });
    return client;
  }

  async disconnect(client) {
    if (!client) return;
    this.clients.delete(client);
    this.clientSessions.delete(client.connection);
    await client.destroy({ force: true });
  }

  async requestControl(client, method, payload = null, { lane = null } = {}) {
    const session = this.clientSessions.get(client?.connection);
    if (!session) throw new Error('authenticated QUIC session is required');
    const message = { kind: 'control', sessionId: session.id, method, payload };
    if (lane === 'critical' || lane === 'control' || lane === 'background') message.lane = lane;
    const response = await requestJson(client.connection, message, this.maxMessageBytes);
    if (!response?.ok) {
      const error = new Error(response?.error || 'quic_control_rejected');
      error.remoteRejection = response?.error !== 'quic_session_required';
      if (response?.error === 'TRUYN_BUSY') error.code = 'TRUYN_BUSY';
      throw error;
    }
    return response.result;
  }

  async sendEnvelope(client, envelope) {
    const session = this.clientSessions.get(client?.connection);
    if (!session) throw new Error('authenticated QUIC session is required');
    const verification = verifyEnvelope(envelope);
    if (!verification.ok) throw new Error(`invalid envelope: ${verification.reason}`);
    if (envelope.from !== this.identity.nodeId) throw new Error('outbound envelope sender mismatch');
    const response = await requestJson(client.connection, { kind: 'envelope', sessionId: session.id, envelope }, this.maxMessageBytes);
    if (!response?.ok) {
      const error = new Error(response?.error || 'quic_envelope_rejected');
      error.code = response?.error || 'TRUYN_QUIC_ENVELOPE_REJECTED';
      throw error;
    }
    return response.result;
  }

  async close() {
    const clients = [...this.clients];
    this.clients.clear();
    await Promise.allSettled(clients.map((client) => this.disconnect(client)));
    if (this.server) await this.server.stop({ force: true });
    await this.socket.stop({ force: true });
    this.server = null;
  }
}
