package truyn

import (
    "bytes"
    "encoding/json"
    "os"
    "testing"
)

func TestTCJ1SharedGoldenVectors(t *testing.T) {
    raw, err := os.ReadFile("../conformance/v1/tcj1-wire-freeze-vectors.json")
    if err != nil { t.Fatal(err) }
    var corpus struct {
        Cases []struct {
            ID string `json:"id"`
            Input json.RawMessage `json:"input"`
            Expected string `json:"canonicalUnsigned"`
        } `json:"cases"`
    }
    if err := json.Unmarshal(raw, &corpus); err != nil { t.Fatal(err) }
    if len(corpus.Cases) < 14 { t.Fatalf("insufficient cases: %d", len(corpus.Cases)) }
    for _, vector := range corpus.Cases {
        t.Run(vector.ID, func(t *testing.T) {
            decoder := json.NewDecoder(bytes.NewReader(vector.Input))
            decoder.UseNumber()
            var input any
            if err := decoder.Decode(&input); err != nil { t.Fatal(err) }
            actual, err := canonicalJSON(input)
            if err != nil { t.Fatal(err) }
            if !bytes.Equal(actual, []byte(vector.Expected)) {
                t.Fatalf("TCJ1 mismatch actual=%q expected=%q", actual, vector.Expected)
            }
        })
    }
}
