package truyn

import (
    "encoding/json"
    "os"
    "testing"
)

func TestP10SharedNormalizedErrorMatrix(t *testing.T) {
    data, err := os.ReadFile("../conformance/v1/p10-error-mapping.json")
    if err != nil { t.Fatal(err) }
    var matrix struct {
        Cases []struct {
            ID string `json:"id"`
            Source struct {
                HTTPStatus int `json:"httpStatus"`
                RelayCode string `json:"relayCode"`
            } `json:"source"`
            Expect struct {
                Code string `json:"code"`
                Retryable bool `json:"retryable"`
            } `json:"expect"`
        } `json:"cases"`
    }
    if err := json.Unmarshal(data, &matrix); err != nil { t.Fatal(err) }
    if len(matrix.Cases) < 15 { t.Fatal("P10 shared matrix incomplete") }
    for _, entry := range matrix.Cases {
        t.Run(entry.ID, func(t *testing.T) {
            mapped, ok := normalizeHTTPError(entry.Source.HTTPStatus, entry.Source.RelayCode, "bounded").(NormalizedError)
            if !ok { t.Fatal("expected NormalizedError") }
            if string(mapped.Code) != entry.Expect.Code || mapped.Retryable != entry.Expect.Retryable {
                t.Fatalf("got %s retry=%v; want %s retry=%v",mapped.Code,mapped.Retryable,entry.Expect.Code,entry.Expect.Retryable)
            }
        })
    }
}
