using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Truyn.Sdk;

public sealed record EnvelopeCheck(bool Ok, string? Reason = null, string? Detail = null);
/// <summary>Opt-in signed metadata. NegotiatedSemantics must come from the authenticated agreement.</summary>
public static class EnvelopeExtensions
{
    public const string Semantic = "truyn.envelope.ext/1";
    private static readonly HashSet<string> Known = new() { "traceId", "expiresAt", "priority", "contentType", "crit" };
    private static bool Match(string? text, string pattern) => text is not null && Regex.IsMatch(text, "\\A(?:" + pattern + ")\\z", RegexOptions.CultureInvariant);
    private static string? Text(JsonElement value) => value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static EnvelopeCheck Fail(string reason, string detail) => new(false, reason, detail);
    public static EnvelopeCheck Verify(JsonElement envelope, IReadOnlyCollection<string> negotiatedSemantics, DateTimeOffset? now = null)
    {
        if (!TruynClient.VerifyEnvelope(envelope)) return new(false, "invalid_signature");
        return Validate(envelope, negotiatedSemantics, now);
    }
    public static EnvelopeCheck Validate(JsonElement envelope, IReadOnlyCollection<string> negotiatedSemantics, DateTimeOffset? now = null)
    {
        if (!negotiatedSemantics.Contains(Semantic) || !envelope.TryGetProperty("ext", out var ext)) return new(true);
        if (ext.ValueKind != JsonValueKind.Object || ext.EnumerateObject().Count() > 16) return Fail("invalid_argument", "invalid_ext");
        foreach (var property in ext.EnumerateObject())
        {
            var key = property.Name; var value = property.Value;
            if (!Match(key, "[A-Za-z][A-Za-z0-9]{0,31}")) return Fail("invalid_argument", "invalid_ext");
            if (key == "crit")
            {
                if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() > 16) return Fail("invalid_argument", "invalid_ext:crit");
                var seen = new HashSet<string>();
                foreach (var item in value.EnumerateArray())
                {
                    var k = Text(item);
                    if (!Match(k, "[A-Za-z][A-Za-z0-9]{0,31}") || k == "crit" || !ext.TryGetProperty(k!, out _) || !seen.Add(k!)) return Fail("invalid_argument", "invalid_ext:crit");
                }
            }
            else if (!Match(Text(value), "[A-Za-z0-9._:;=/+\\-]{1,128}")) return Fail("invalid_argument", "invalid_ext:" + key);
        }
        if (CanonicalJson.Serialize(ext).Length > 1024) return Fail("invalid_argument", "invalid_ext");
        if (ext.TryGetProperty("traceId", out var trace) && (!Match(Text(trace), "[0-9a-f]{32}") || Text(trace) == new string('0', 32))) return Fail("invalid_argument", "invalid_ext:traceId");
        DateTimeOffset? expires = null;
        if (ext.TryGetProperty("expiresAt", out var expiry))
        {
            if (!DateTimeOffset.TryParseExact(Text(expiry), "yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed) ||
                !DateTimeOffset.TryParse(envelope.GetProperty("createdAt").GetString(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var created) || parsed <= created)
                return Fail("invalid_argument", "invalid_ext:expiresAt");
            expires = parsed;
        }
        if (ext.TryGetProperty("priority", out var priority) && !new[] { "background", "normal", "critical" }.Contains(Text(priority))) return Fail("invalid_argument", "invalid_ext:priority");
        if (ext.TryGetProperty("contentType", out var content) && !Match(Text(content), "application/json(?:;profile=[a-z0-9][a-z0-9._/\\-]{0,95})?")) return Fail("invalid_argument", "invalid_ext:contentType");
        if (ext.TryGetProperty("crit", out var crit)) foreach (var item in crit.EnumerateArray()) if (!Known.Contains(item.GetString()!)) return Fail("version_mismatch", "required_semantic_unavailable:" + item.GetString());
        if (expires.HasValue && (now ?? DateTimeOffset.UtcNow) - expires.Value > TimeSpan.FromSeconds(30)) return Fail("deadline_exceeded", "envelope_expired");
        if (ext.TryGetProperty("contentType", out content) && !new[] { "application/json", "application/json;profile=truyn." + envelope.GetProperty("type").GetString()!.ToLowerInvariant() + "/1" }.Contains(Text(content))) return Fail("unimplemented", "unsupported_content_type");
        return new(true);
    }
}
