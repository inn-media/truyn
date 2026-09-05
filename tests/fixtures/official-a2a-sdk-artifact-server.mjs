import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import express from 'express';
import {
  A2A_PROTOCOL_VERSION,
  AGENT_CARD_PATH,
  TaskState
} from '@a2a-js/sdk';
import {
  AgentEvent,
  DefaultRequestHandler,
  InMemoryTaskStore
} from '@a2a-js/sdk/server';
import {
  agentCardHandler,
  jsonRpcHandler,
  UserBuilder
} from '@a2a-js/sdk/server/express';

const SDK_PACKAGE = '@a2a-js/sdk';
const SDK_VERSION = '1.0.1';
const HOST = '127.0.0.1';
const MAX_BIND_ATTEMPTS = 3;
const PROOF_BYTES = Buffer.from('TRUYN Sprint E interop proof\n', 'utf8');
const PROOF_FILENAME = 'interop-proof.bin';
const PROOF_MEDIA_TYPE = 'application/octet-stream';
const PROOF_DIGEST = createHash('sha256').update(PROOF_BYTES).digest('hex');
const INTEGRITY_KEY = 'io.truyn/integrity';

const stats = {
  executionCount: 0,
  artifactFetchCount: 0,
  messageIds: [],
  modes: [],
  requests: []
};

let artifactUrl = null;

class IndependentArtifactExecutor {
  cancelTask = async () => {};

  async execute(requestContext, eventBus) {
    stats.executionCount += 1;
    stats.messageIds.push(requestContext.userMessage.messageId);

    const textPart = requestContext.userMessage.parts.find((part) => part.content?.$case === 'text');
    const mode = textPart?.content?.$case === 'text' ? textPart.content.value : 'ok';
    stats.modes.push(mode);

    const taskId = requestContext.taskId;
    const contextId = requestContext.contextId;
    const taskSnapshot = requestContext.task ?? {
      id: taskId,
      contextId,
      status: {
        state: TaskState.TASK_STATE_SUBMITTED,
        timestamp: new Date().toISOString(),
        message: undefined
      },
      artifacts: [],
      history: [requestContext.userMessage],
      metadata: requestContext.userMessage.metadata
    };
    eventBus.publish(AgentEvent.task(taskSnapshot));

    const integrity = {
      algorithm: 'sha256',
      digest: mode === 'corrupt-digest' ? '0'.repeat(64) : PROOF_DIGEST,
      sizeBytes: mode === 'corrupt-size' ? PROOF_BYTES.length + 1 : PROOF_BYTES.length,
      encoding: 'raw'
    };
    const artifact = {
      artifactId: randomUUID(),
      name: 'Sprint E referenced artifact',
      description: 'Referenced file emitted by the official @a2a-js/sdk black-box fixture.',
      parts: [{
        content: { $case: 'url', value: artifactUrl },
        metadata: { [INTEGRITY_KEY]: integrity },
        filename: PROOF_FILENAME,
        mediaType: PROOF_MEDIA_TYPE
      }],
      metadata: {
        fixture: 'sprint-e-independent-a2a-artifact',
        sdkPackage: SDK_PACKAGE,
        sdkVersion: SDK_VERSION
      },
      extensions: []
    };

    eventBus.publish(AgentEvent.artifactUpdate({
      taskId,
      contextId,
      artifact,
      lastChunk: true,
      append: false,
      metadata: undefined
    }));
    eventBus.publish(AgentEvent.statusUpdate({
      taskId,
      contextId,
      status: {
        state: TaskState.TASK_STATE_COMPLETED,
        timestamp: new Date().toISOString(),
        message: undefined
      },
      metadata: undefined
    }));
  }
}

const app = express();
const agentCard = {
  name: 'Sprint E official A2A SDK artifact agent',
  description: 'Independent A2A v1.0 server returning a referenced binary artifact.',
  supportedInterfaces: [{
    url: `http://${HOST}:0/a2a/jsonrpc`,
    protocolBinding: 'JSONRPC',
    tenant: '',
    protocolVersion: A2A_PROTOCOL_VERSION
  }],
  provider: {
    organization: 'A2A Project SDK black-box fixture',
    url: 'https://github.com/a2aproject/a2a-js'
  },
  version: '1.0.0-sprint-e',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    extensions: [],
    extendedAgentCard: false
  },
  securitySchemes: {},
  securityRequirements: [],
  defaultInputModes: ['text/plain'],
  defaultOutputModes: [PROOF_MEDIA_TYPE],
  skills: [{
    id: 'artifact',
    name: 'Referenced artifact',
    description: 'Return a deterministic referenced artifact with integrity metadata.',
    tags: ['sprint-e', 'artifact', 'black-box', 'independent'],
    examples: ['ok'],
    inputModes: ['text/plain'],
    outputModes: [PROOF_MEDIA_TYPE],
    securityRequirements: []
  }],
  documentationUrl: 'https://github.com/a2aproject/a2a-js',
  signatures: []
};

const requestHandler = new DefaultRequestHandler(
  agentCard,
  new InMemoryTaskStore(),
  new IndependentArtifactExecutor()
);

app.get('/__truyn_black_box_stats', (_req, res) => {
  res.json({
    sdkPackage: SDK_PACKAGE,
    sdkVersion: SDK_VERSION,
    protocolVersion: A2A_PROTOCOL_VERSION,
    proofFilename: PROOF_FILENAME,
    proofMediaType: PROOF_MEDIA_TYPE,
    proofSizeBytes: PROOF_BYTES.length,
    proofSha256: PROOF_DIGEST,
    artifactUrl,
    ...stats
  });
});

app.get('/__truyn_artifact/interop-proof.bin', (_req, res) => {
  stats.artifactFetchCount += 1;
  res.writeHead(200, {
    'content-type': PROOF_MEDIA_TYPE,
    'content-length': PROOF_BYTES.length,
    'cache-control': 'no-store'
  });
  res.end(PROOF_BYTES);
});

app.use((req, _res, next) => {
  stats.requests.push({
    method: req.method,
    path: req.path,
    a2aVersion: req.get('a2a-version') ?? null
  });
  next();
});

app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: requestHandler }));
app.use('/a2a/jsonrpc', jsonRpcHandler({
  requestHandler,
  userBuilder: UserBuilder.noAuthentication
}));

function listen(candidate) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      candidate.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      candidate.off('error', onError);
      resolve();
    };
    candidate.once('error', onError);
    candidate.once('listening', onListening);
    candidate.listen({ port: 0, host: HOST, exclusive: true });
  });
}

async function bindEphemeralServer() {
  let lastError;
  for (let attempt = 1; attempt <= MAX_BIND_ATTEMPTS; attempt += 1) {
    const candidate = createServer(app);
    try {
      await listen(candidate);
      return candidate;
    } catch (error) {
      lastError = error;
      if (error?.code !== 'EADDRINUSE' || attempt === MAX_BIND_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }
  throw lastError ?? new Error('Unable to bind independent A2A artifact fixture');
}

const server = await bindEphemeralServer();
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Unable to resolve independent A2A artifact fixture port');

const baseUrl = `http://${HOST}:${address.port}`;
const rpcUrl = `${baseUrl}/a2a/jsonrpc`;
const cardUrl = `${baseUrl}/${AGENT_CARD_PATH}`;
const statsUrl = `${baseUrl}/__truyn_black_box_stats`;
artifactUrl = `${baseUrl}/__truyn_artifact/interop-proof.bin`;
agentCard.supportedInterfaces[0].url = rpcUrl;

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!server.listening) {
    process.exit(0);
    return;
  }
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.stdout.write(`${JSON.stringify({
  type: 'ready',
  sdkPackage: SDK_PACKAGE,
  sdkVersion: SDK_VERSION,
  protocolVersion: A2A_PROTOCOL_VERSION,
  cardUrl,
  rpcUrl,
  statsUrl,
  artifactUrl,
  proofFilename: PROOF_FILENAME,
  proofMediaType: PROOF_MEDIA_TYPE,
  proofSizeBytes: PROOF_BYTES.length,
  proofSha256: PROOF_DIGEST
})}\n`);
