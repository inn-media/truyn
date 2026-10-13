#pragma warning disable CA2252 // System.Net.Quic is explicitly gated by QuicConnection.IsSupported
using System;
using System.Buffers;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Quic;
using System.Net.Security;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;

namespace Truyn.Sdk;

/// <summary>
/// Real native .NET QUIC/UDP client for the TRUYN/1 five-method DHT control surface.
/// Not an HTTP/Node relay adapter. An authenticated signed HELLO/ACCEPT is mandatory
/// before control RPC. Zero certificate-bypass modes and no automatic write retries.
/// </summary>
public sealed class QuicDhtClient : IAsyncDisposable
{
    private const int MaxJsonBytes = 1_048_576;
    private const string SessionProtocol = "truyn-peer-session-v1";
    private readonly LocalIdentity _identity;
    private readonly QuicConnection _connection;
    private readonly string _sessionId;
    private readonly string _remoteNodeId;

    private QuicDhtClient(LocalIdentity identity, QuicConnection connection,
        string sessionId, string remoteNodeId)
    {
        _identity = identity;
        _connection = connection;
        _sessionId = sessionId;
        _remoteNodeId = remoteNodeId;
    }

    public string NodeId => _identity.NodeId;
    public string RemoteNodeId => _remoteNodeId;
    public static bool IsSupported => QuicConnection.IsSupported;

    /// <summary>
    /// Connects over native QUIC/UDP. The caller may pin one exact certificate
    /// for development/private CA, but a hostname mismatch always rejects.
    /// </summary>
    public static async Task<QuicDhtClient> ConnectAsync(string host, int port,
        string? serverName = null, string? expectedPeerNodeId = null,
        X509Certificate2? pinnedServerCertificate = null,
        CancellationToken cancellationToken = default)
    {
        if (!IsSupported) throw new PlatformNotSupportedException("native QUIC is unavailable");
        if (string.IsNullOrWhiteSpace(host) || port is < 1 or > 65535)
            throw new ArgumentException("invalid QUIC destination");
        serverName ??= host;
        if (string.IsNullOrWhiteSpace(serverName))
            throw new ArgumentException("QUIC serverName is required");
        var tls = new SslClientAuthenticationOptions {
            TargetHost = serverName,
            EnabledSslProtocols = SslProtocols.Tls13,
            ApplicationProtocols = [new SslApplicationProtocol("truyn/1")],
            RemoteCertificateValidationCallback = (_, cert, _, errors) =>
            {
                if (cert is null) return false;
                if (errors == SslPolicyErrors.None) return true;
                // Explicit pin may accept a private self-signed leaf, never a
                // missing certificate or a hostname mismatch.
                if (pinnedServerCertificate is null ||
                    errors != SslPolicyErrors.RemoteCertificateChainErrors) return false;
                return CryptographicOperations.FixedTimeEquals(
                    SHA256.HashData(cert.GetRawCertData()),
                    SHA256.HashData(pinnedServerCertificate.RawData));
            }
        };
        var opts = new QuicClientConnectionOptions {
            RemoteEndPoint = new DnsEndPoint(host, port),
            ClientAuthenticationOptions = tls,
            DefaultStreamErrorCode = 0,
            DefaultCloseErrorCode = 0
        };
        var connection = await QuicConnection.ConnectAsync(opts, cancellationToken).ConfigureAwait(false);
        try
        {
            if (connection.NegotiatedApplicationProtocol != new SslApplicationProtocol("truyn/1"))
                throw new AuthenticationException("quic_alpn_mismatch");
            var identity = LocalIdentity.Create();
            var issuedAt = Now();
            var nonce = Base64Url(RandomNumberGenerator.GetBytes(24));
            var body = new Dictionary<string, object?> {
                ["protocol"] = SessionProtocol, ["kind"] = "HELLO",
                ["nodeId"] = identity.NodeId, ["transport"] = "quic",
                ["endpoints"] = Array.Empty<string>(), ["nonce"] = nonce,
                ["issuedAt"] = issuedAt, ["protocols"] = new[] { "TRUYN/1" },
                ["semantics"] = Array.Empty<string>(), ["requiredSemantics"] = Array.Empty<string>()
            };
            var hello = new Dictionary<string, object?>(body) {
                ["publicKey"] = identity.PublicKeyPem,
                ["signature"] = identity.Sign(CanonicalJson.Serialize(body))
            };
            using var handshake = await ExchangeAsync(connection,
                new { kind = "session-hello", hello }, cancellationToken).ConfigureAwait(false);
            var root = handshake.RootElement;
            if (!Boolean(root, "ok")) throw new AuthenticationException("quic_hello_rejected:" + String(root, "error"));
            var accept = root.GetProperty("accept");
            var acceptBody = Without(accept, "publicKey", "signature");
            var peerKey = String(accept, "publicKey") ?? throw new AuthenticationException("accept_missing_key");
            var peerId = String(accept, "nodeId") ?? throw new AuthenticationException("accept_missing_node");
            var signature = String(accept, "signature") ?? throw new AuthenticationException("accept_missing_signature");
            if (LocalIdentity.NodeIdFromPublicKey(peerKey) != peerId ||
                !LocalIdentity.Verify(peerKey, CanonicalJson.Serialize(acceptBody), signature))
                throw new AuthenticationException("invalid_signed_quic_accept");
            if (expectedPeerNodeId is not null && peerId != expectedPeerNodeId)
                throw new AuthenticationException("unexpected_QUIC_peer_identity");
            var helloDigest = Sha256(CanonicalJson.Serialize(Without(JsonSerializer.SerializeToElement(hello), "signature")));
            var binding = "quic:hello:" + helloDigest;
            if (String(accept, "protocol") != SessionProtocol ||
                String(accept, "kind") != "ACCEPT" ||
                String(accept, "peerNodeId") != identity.NodeId ||
                String(accept, "helloNonce") != nonce ||
                String(accept, "helloDigest") != helloDigest ||
                String(accept, "transport") != "quic" ||
                String(accept, "transportBinding") != binding ||
                String(accept, "negotiatedProtocol") != "TRUYN/1" ||
                !ValidTimestamp(String(accept, "issuedAt")))
                throw new AuthenticationException("quic_accept_binding_or_version_mismatch");
            if (!accept.TryGetProperty("supportedProtocols", out var supported) ||
                supported.ValueKind != JsonValueKind.Array ||
                !supported.EnumerateArray().Any(e => e.ValueKind == JsonValueKind.String && e.GetString() == "TRUYN/1"))
                throw new AuthenticationException("quic_unsupported_protocol");
            if (!accept.TryGetProperty("negotiatedSemantics", out var negotiated) ||
                negotiated.ValueKind != JsonValueKind.Array || negotiated.GetArrayLength() != 0)
                throw new AuthenticationException("quic_unexpected_semantics");
            var acceptNonce = String(accept, "nonce") ?? throw new AuthenticationException("quic_accept_missing_nonce");
            var computedId = "truyn:session:" + Sha256(CanonicalJson.Serialize(new {
                helloNodeId = identity.NodeId, acceptNodeId = peerId,
                helloNonce = nonce, acceptNonce, transportBinding = binding
            }));
            if (String(root, "sessionId") != computedId)
                throw new AuthenticationException("quic_session_id_mismatch");
            return new QuicDhtClient(identity, connection, computedId, peerId);
        }
        catch
        {
            await connection.DisposeAsync().ConfigureAwait(false);
            throw;
        }
    }

    private static bool ValidTimestamp(string? value) =>
        DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal, out var when) &&
        Math.Abs((DateTimeOffset.UtcNow - when).TotalSeconds) <= 30;

    private static string Now() =>
        DateTimeOffset.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
    private static string Base64Url(byte[] value) =>
        Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    private static string Sha256(byte[] bytes) =>
        Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    private static string String(JsonElement value, string name) =>
        value.TryGetProperty(name, out var field) && field.ValueKind == JsonValueKind.String
            ? field.GetString()! : null!;
    private static bool Boolean(JsonElement value, string name) =>
        value.TryGetProperty(name, out var field) && field.ValueKind == JsonValueKind.True;
    private static Dictionary<string, object?> Without(JsonElement element, params string[] omit)
    {
        if (element.ValueKind != JsonValueKind.Object) throw new AuthenticationException("invalid signed object");
        var result = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var prop in element.EnumerateObject())
            if (!omit.Contains(prop.Name, StringComparer.Ordinal)) result[prop.Name] = prop.Value.Clone();
        return result;
    }

    private static async Task<JsonDocument> ExchangeAsync(QuicConnection connection,
        object payload, CancellationToken ct)
    {
        await using var stream = await connection.OpenOutboundStreamAsync(
            QuicStreamType.Bidirectional, ct).ConfigureAwait(false);
        var bytes = JsonSerializer.SerializeToUtf8Bytes(payload, CanonicalJson.WireOptions);
        if (bytes.Length > MaxJsonBytes) throw new InvalidOperationException("quic_message_too_large");
        await stream.WriteAsync(bytes, ct).ConfigureAwait(false);
        stream.CompleteWrites();
        using var ms = new MemoryStream();
        var buffer = new byte[8192];
        while (true)
        {
            var size = await stream.ReadAsync(buffer, ct).ConfigureAwait(false);
            if (size == 0) break;
            if (ms.Length + size > MaxJsonBytes) throw new InvalidDataException("quic_response_too_large");
            ms.Write(buffer, 0, size);
        }
        if (ms.Length == 0) throw new InvalidDataException("empty_QUIC_response");
        return JsonDocument.Parse(ms.ToArray());
    }

    private async Task<JsonElement> RpcAsync(string method, object? payload, CancellationToken ct)
    {
        using var result = await ExchangeAsync(_connection,
            new { kind = "control", sessionId = _sessionId, method, payload }, ct).ConfigureAwait(false);
        var root = result.RootElement;
        if (!Boolean(root, "ok"))
            throw new InvalidOperationException("quic_control_rejected:" + String(root, "error"));
        return root.GetProperty("result").Clone();
    }

    public async Task<bool> PingAsync(CancellationToken ct = default)
    {
        var result = await RpcAsync("dht.ping", null, ct).ConfigureAwait(false);
        if (!Boolean(result, "pong") || String(result, "nodeId") != RemoteNodeId)
            throw new AuthenticationException("quic_ping_identity_mismatch");
        if (result.TryGetProperty("peerRecord", out var peer) && peer.ValueKind == JsonValueKind.Object)
            VerifyPeer(peer);
        return true;
    }

    public async Task<IReadOnlyList<JsonElement>> FindNodeAsync(string targetNodeId,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(targetNodeId)) throw new ArgumentException("targetNodeId required");
        var root = await RpcAsync("dht.find-node", new { targetNodeId }, ct).ConfigureAwait(false);
        var rows = root.GetProperty("records");
        if (rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() > 256)
            throw new InvalidDataException("invalid_peer_record_set");
        return rows.EnumerateArray().Select(e => { VerifyPeer(e); return e.Clone(); }).ToArray();
    }

    public async Task<JsonElement> AnnounceAsync(IEnumerable<string> endpoints, long sequence = 1,
        CancellationToken ct = default)
    {
        var sorted = endpoints.Distinct(StringComparer.Ordinal).OrderBy(e => e, StringComparer.Ordinal).ToArray();
        if (sorted.Length == 0 || sorted.Any(string.IsNullOrWhiteSpace) || sequence < 1)
            throw new ArgumentException("invalid signed peer announcement");
        var issued = DateTimeOffset.UtcNow;
        var body = new Dictionary<string, object?> {
            ["protocol"] = "truyn-peer-record-v1", ["nodeId"] = NodeId,
            ["dhtId"] = Sha256(Encoding.UTF8.GetBytes(NodeId)), ["endpoints"] = sorted,
            ["capabilities"] = Array.Empty<string>(), ["nat"] = null,
            ["sequence"] = sequence, ["issuedAt"] = issued.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'"),
            ["expiresAt"] = issued.AddMinutes(5).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'")
        };
        var signed = new Dictionary<string, object?>(body) {
            ["recordId"] = "truyn:peer:" + Sha256(CanonicalJson.Serialize(body))
        };
        var record = new Dictionary<string, object?>(signed) {
            ["publicKey"] = _identity.PublicKeyPem, ["signature"] = _identity.Sign(CanonicalJson.Serialize(signed))
        };
        var result = await RpcAsync("peer.announce", new { record }, ct).ConfigureAwait(false);
        if (!Boolean(result, "accepted") || String(result, "nodeId") != NodeId)
            throw new InvalidDataException("invalid_peer_announce_receipt");
        return result;
    }

    public async Task<JsonElement> StoreAsync(string @namespace, string key, object value,
        long sequence = 1, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(@namespace) || string.IsNullOrWhiteSpace(key) || sequence < 1)
            throw new ArgumentException("invalid DHT record");
        var issued = DateTimeOffset.UtcNow;
        var body = new Dictionary<string, object?> {
            ["protocol"] = "truyn-kademlia-v1",
            ["namespace"] = @namespace, ["key"] = key,
            ["keyHash"] = Sha256(Encoding.UTF8.GetBytes(@namespace + ":" + key)),
            ["value"] = value,
            ["valueDigest"] = "sha256:" + Sha256(CanonicalJson.Serialize(value)),
            ["publisherNodeId"] = NodeId, ["sequence"] = sequence,
            ["issuedAt"] = issued.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'"),
            ["expiresAt"] = issued.AddMinutes(5).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'")
        };
        var signed = new Dictionary<string, object?>(body) {
            ["recordId"] = "truyn:dht:" + Sha256(CanonicalJson.Serialize(body))
        };
        var record = new Dictionary<string, object?>(signed) {
            ["publicKey"] = _identity.PublicKeyPem, ["signature"] = _identity.Sign(CanonicalJson.Serialize(signed))
        };
        var receipt = await RpcAsync("dht.store", new { record }, ct).ConfigureAwait(false);
        if (!Boolean(receipt, "stored") || String(receipt, "recordId") != signed["recordId"]?.ToString())
            throw new InvalidDataException("invalid_DHT_store_acknowledgement");
        return receipt;
    }

    public async Task<IReadOnlyList<JsonElement>> FindValueAsync(string @namespace, string key,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(@namespace) || string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("DHT namespace/key required");
        var root = await RpcAsync("dht.find-value", new { @namespace, key }, ct).ConfigureAwait(false);
        var records = root.GetProperty("records");
        if (records.ValueKind != JsonValueKind.Array || records.GetArrayLength() > 256)
            throw new InvalidDataException("invalid_DHT_record_set");
        return records.EnumerateArray().Select(record => { VerifyDht(record); return record.Clone(); }).ToArray();
    }

    private static void VerifyPeer(JsonElement record)
    {
        VerifySigned(record, "truyn-peer-record-v1", "nodeId", "truyn:peer:");
        if (String(record, "dhtId") != Sha256(Encoding.UTF8.GetBytes(String(record, "nodeId"))))
            throw new AuthenticationException("peer_record_dht_id_mismatch");
        var endpoints = record.GetProperty("endpoints");
        if (endpoints.ValueKind != JsonValueKind.Array || endpoints.GetArrayLength() == 0)
            throw new InvalidDataException("peer_record_missing_endpoints");
    }

    private static void VerifyDht(JsonElement record)
    {
        VerifySigned(record, "truyn-kademlia-v1", "publisherNodeId", "truyn:dht:");
        if (String(record, "keyHash") != Sha256(Encoding.UTF8.GetBytes(
                String(record, "namespace") + ":" + String(record, "key"))) ||
            String(record, "valueDigest") != "sha256:" + Sha256(CanonicalJson.Serialize(record.GetProperty("value"))))
            throw new AuthenticationException("dht_content_digest_mismatch");
    }

    private static void VerifySigned(JsonElement record, string protocol, string identityField,
        string idPrefix)
    {
        var nodeId = String(record, identityField);
        var publicKey = String(record, "publicKey");
        var signature = String(record, "signature");
        if (String(record, "protocol") != protocol ||
            string.IsNullOrWhiteSpace(nodeId) || string.IsNullOrWhiteSpace(publicKey) ||
            string.IsNullOrWhiteSpace(signature))
            throw new AuthenticationException("invalid_signed_dht_record");
        string boundNode;
        try { boundNode = LocalIdentity.NodeIdFromPublicKey(publicKey); }
        catch (Exception error) when (error is FormatException or CryptographicException)
        {
            throw new AuthenticationException("dht_record_invalid_public_key", error);
        }
        if (boundNode != nodeId)
            throw new AuthenticationException("dht_record_identity_mismatch");
        var signed = Without(record, "publicKey", "signature");
        var body = Without(record, "publicKey", "signature", "recordId");
        var expected = idPrefix + Sha256(CanonicalJson.Serialize(body));
        if (String(record, "recordId") != expected ||
            !LocalIdentity.Verify(publicKey, CanonicalJson.Serialize(signed), signature))
            throw new AuthenticationException("dht_record_signature_or_ID_mismatch");
        var expiry = String(record, "expiresAt");
        if (!DateTimeOffset.TryParse(expiry, out var date) || DateTimeOffset.UtcNow >= date)
            throw new AuthenticationException("dht_record_expired");
    }

    public async ValueTask DisposeAsync()
    {
        await _connection.DisposeAsync().ConfigureAwait(false);
    }
}
