using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Crypto.Signers;
using Org.BouncyCastle.Security;
using Org.BouncyCastle.X509;

namespace Truyn.Sdk;

internal sealed class LocalIdentity
{
    private readonly Ed25519PrivateKeyParameters _privateKey;

    private LocalIdentity(Ed25519PrivateKeyParameters privateKey, string publicKeyPem, string nodeId)
    {
        _privateKey = privateKey;
        PublicKeyPem = publicKeyPem;
        NodeId = nodeId;
    }

    public string NodeId { get; }
    public string PublicKeyPem { get; }
    public const string Algorithm = "Ed25519";

    public static LocalIdentity Create()
    {
        var privateKey = new Ed25519PrivateKeyParameters(new SecureRandom());
        var publicKey = privateKey.GeneratePublicKey();
        var der = SubjectPublicKeyInfoFactory.CreateSubjectPublicKeyInfo(publicKey).GetEncoded();
        var pem = Pem("PUBLIC KEY", der);
        var nodeId = "truyn:node:" + Convert.ToHexString(SHA256.HashData(der)).ToLowerInvariant();
        return new LocalIdentity(privateKey, pem, nodeId);
    }

    public string Sign(ReadOnlySpan<byte> message)
    {
        var signer = new Ed25519Signer();
        signer.Init(true, _privateKey);
        var bytes = message.ToArray();
        signer.BlockUpdate(bytes, 0, bytes.Length);
        return Convert.ToBase64String(signer.GenerateSignature());
    }

    public static bool Verify(string publicKeyPem, ReadOnlySpan<byte> message, string signature)
    {
        try
        {
            var der = DecodePem(publicKeyPem);
            var publicKey = PublicKeyFactory.CreateKey(der) as Ed25519PublicKeyParameters;
            if (publicKey is null) return false;
            var signer = new Ed25519Signer();
            signer.Init(false, publicKey);
            var bytes = message.ToArray();
            signer.BlockUpdate(bytes, 0, bytes.Length);
            return signer.VerifySignature(Convert.FromBase64String(signature));
        }
        catch
        {
            return false;
        }
    }

    public static string NodeIdFromPublicKey(string publicKeyPem)
    {
        var der = DecodePem(publicKeyPem);
        return "truyn:node:" + Convert.ToHexString(SHA256.HashData(der)).ToLowerInvariant();
    }

    private static string Pem(string label, byte[] der)
    {
        var body = Convert.ToBase64String(der);
        var builder = new StringBuilder($"-----BEGIN {label}-----\n");
        for (var offset = 0; offset < body.Length; offset += 64)
            builder.Append(body.AsSpan(offset, Math.Min(64, body.Length - offset))).Append('\n');
        return builder.Append($"-----END {label}-----\n").ToString();
    }

    private static byte[] DecodePem(string pem)
    {
        var lines = pem.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
            .Where(line => !line.StartsWith("-----", StringComparison.Ordinal));
        return Convert.FromBase64String(string.Concat(lines));
    }
}

internal static class CanonicalJson
{
    public static readonly JsonSerializerOptions WireOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    public static byte[] Serialize(object? value)
    {
        var element = JsonSerializer.SerializeToElement(value, WireOptions);
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Indented = false })) Write(element, writer);
        return stream.ToArray();
    }

    private static void Write(JsonElement element, Utf8JsonWriter writer)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                writer.WriteStartObject();
                foreach (var property in element.EnumerateObject().OrderBy(property => property.Name, StringComparer.Ordinal))
                {
                    writer.WritePropertyName(property.Name);
                    Write(property.Value, writer);
                }
                writer.WriteEndObject();
                break;
            case JsonValueKind.Array:
                writer.WriteStartArray();
                foreach (var item in element.EnumerateArray()) Write(item, writer);
                writer.WriteEndArray();
                break;
            default:
                element.WriteTo(writer);
                break;
        }
    }
}
