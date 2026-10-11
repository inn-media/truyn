using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
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
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    public static byte[] Serialize(object? value)
    {
        var element = JsonSerializer.SerializeToElement(value, WireOptions);
        var builder = new StringBuilder();
        Write(element, builder);
        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    private static string EcmaNumber(double number)
    {
        if (number == 0d) return "0";
        var text = number.ToString("R", System.Globalization.CultureInfo.InvariantCulture);
        var negative = text.StartsWith("-", StringComparison.Ordinal);
        var unsigned = negative ? text[1..] : text;
        var parts = unsigned.Split('E', 'e');
        var mantissa = parts[0];
        var exp = parts.Length == 2 ? int.Parse(parts[1], System.Globalization.CultureInfo.InvariantCulture) : 0;
        var before = mantissa.IndexOf('.');
        if (before < 0) before = mantissa.Length;
        var digits = mantissa.Replace(".", "").TrimStart('0');
        if (digits.Length == 0) return "0";
        var leadingZeros = mantissa.Replace(".", "").Length - mantissa.Replace(".", "").TrimStart('0').Length;
        var effectiveExponent = before + exp - leadingZeros - 1;
        var sign = negative ? "-" : "";
        if (effectiveExponent >= -6 && effectiveExponent < 21)
        {
            var offset = effectiveExponent + 1;
            if (offset <= 0) return sign + "0." + new string('0', -offset) + digits.TrimEnd('0');
            if (offset >= digits.Length) return sign + digits + new string('0', offset - digits.Length);
            return sign + digits[..offset] + "." + digits[offset..].TrimEnd('0');
        }
        var trimmed = digits.TrimEnd('0');
        return sign + trimmed[0] + (trimmed.Length > 1 ? "." + trimmed[1..] : "") + "e" + (effectiveExponent >= 0 ? "+" : "") + effectiveExponent.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }

    private static void WriteString(string value, StringBuilder output)
    {
        output.Append('"');
        for (int i = 0; i < value.Length;)
        {
            if (!Rune.TryGetRuneAt(value, i, out var rune))
                throw new JsonException("TCJ1 prohibits lone UTF-16 surrogate");
            int ch = rune.Value;
            switch (ch)
            {
                case 34: output.Append("\\\""); break;
                case 92: output.Append("\\\\"); break;
                case 8: output.Append("\\b"); break;
                case 12: output.Append("\\f"); break;
                case 10: output.Append("\\n"); break;
                case 13: output.Append("\\r"); break;
                case 9: output.Append("\\t"); break;
                default:
                    if (ch < 32) output.Append("\\u").Append(ch.ToString("x4", System.Globalization.CultureInfo.InvariantCulture));
                    else output.Append(value, i, rune.Utf16SequenceLength);
                    break;
            }
            i += rune.Utf16SequenceLength;
        }
        output.Append('"');
    }

    private static void Write(JsonElement element, StringBuilder output)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                output.Append('{');
                var first = true;
                foreach (var property in element.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal))
                {
                    if (!first) output.Append(',');
                    first = false;
                    WriteString(property.Name, output);
                    output.Append(':');
                    Write(property.Value, output);
                }
                output.Append('}');
                break;
            case JsonValueKind.Array:
                output.Append('[');
                var firstItem = true;
                foreach (var item in element.EnumerateArray())
                {
                    if (!firstItem) output.Append(',');
                    firstItem = false;
                    Write(item, output);
                }
                output.Append(']');
                break;
            case JsonValueKind.String:
                WriteString(element.GetString()!, output);
                break;
            case JsonValueKind.Number:
                if (!element.TryGetDouble(out var number) || !double.IsFinite(number))
                    throw new JsonException("TCJ1 requires a finite ECMAScript number");
                output.Append(EcmaNumber(number));
                break;
            case JsonValueKind.True: output.Append("true"); break;
            case JsonValueKind.False: output.Append("false"); break;
            case JsonValueKind.Null: output.Append("null"); break;
            default: throw new JsonException("Unsupported TCJ1 value kind");
        }
    }
}
