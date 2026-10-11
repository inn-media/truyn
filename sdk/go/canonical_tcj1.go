package truyn

import (
    "bytes"
    "encoding/json"
    "errors"
    "fmt"
    "math"
    "sort"
    "strconv"
    "strings"
    "unicode/utf16"
    "unicode/utf8"
)

// canonicalTCJ1 uses the existing TRUYN/1 signed JSON byte domain.
// Never re-sign historical envelopes or silently negotiate a different codec.
func canonicalTCJ1(value any) ([]byte, error) {
    raw, err := json.Marshal(value)
    if err != nil { return nil, err }
    decoder := json.NewDecoder(bytes.NewReader(raw))
    decoder.UseNumber()
    var decoded any
    if err := decoder.Decode(&decoded); err != nil { return nil, err }
    var out strings.Builder
    if err := writeTCJ1(&out, decoded); err != nil { return nil, err }
    return []byte(out.String()), nil
}

func lessTCJ1Key(a, b string) bool {
    aa, bb := utf16.Encode([]rune(a)), utf16.Encode([]rune(b))
    for i := 0; i < len(aa) && i < len(bb); i++ {
        if aa[i] != bb[i] { return aa[i] < bb[i] }
    }
    return len(aa) < len(bb)
}

func writeTCJ1String(out *strings.Builder, s string) error {
    if !utf8.ValidString(s) { return errors.New("TCJ1 string requires valid UTF-8") }
    out.WriteByte('"')
    for _, r := range s {
        switch r {
        case '"': out.WriteString("\\\"")
        case '\\': out.WriteString("\\\\")
        case '\b': out.WriteString("\\b")
        case '\f': out.WriteString("\\f")
        case '\n': out.WriteString("\\n")
        case '\r': out.WriteString("\\r")
        case '\t': out.WriteString("\\t")
        default:
            if r < 0x20 { fmt.Fprintf(out, "\\u%04x", r) } else { out.WriteRune(r) }
        }
    }
    out.WriteByte('"')
    return nil
}

func writeTCJ1(out *strings.Builder, value any) error {
    switch x := value.(type) {
    case nil: out.WriteString("null")
    case bool: if x { out.WriteString("true") } else { out.WriteString("false") }
    case string: return writeTCJ1String(out, x)
    case json.Number:
        f, err := strconv.ParseFloat(string(x), 64)
        if err != nil || math.IsNaN(f) || math.IsInf(f, 0) { return errors.New("TCJ1 number not finite double") }
        if f == 0 { out.WriteByte('0'); return nil }
        if math.Abs(f) >= 1e-6 && math.Abs(f) < 1e21 {
            out.WriteString(strconv.FormatFloat(f, 'f', -1, 64))
        } else {
            parts := strings.SplitN(strconv.FormatFloat(f, 'e', -1, 64), "e", 2)
            exponent, _ := strconv.Atoi(parts[1])
            sign := ""
            if exponent >= 0 { sign = "+" }
            out.WriteString(parts[0] + "e" + sign + strconv.Itoa(exponent))
        }
    case []any:
        out.WriteByte('[')
        for i, v := range x { if i != 0 { out.WriteByte(',') }; if err := writeTCJ1(out, v); err != nil { return err } }
        out.WriteByte(']')
    case map[string]any:
        keys := make([]string, 0, len(x))
        for k := range x { keys = append(keys, k) }
        sort.Slice(keys, func(i, j int) bool { return lessTCJ1Key(keys[i], keys[j]) })
        out.WriteByte('{')
        for i, k := range keys {
            if i != 0 { out.WriteByte(',') }
            if err := writeTCJ1String(out, k); err != nil { return err }
            out.WriteByte(':')
            if err := writeTCJ1(out, x[k]); err != nil { return err }
        }
        out.WriteByte('}')
    default: return fmt.Errorf("unsupported TCJ1 value: %T", x)
    }
    return nil
}
