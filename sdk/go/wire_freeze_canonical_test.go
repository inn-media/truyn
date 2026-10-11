package truyn

import (
 "testing"
)
func TestTCJ1WireFreezeLiteralAndUnicode(t *testing.T) {
 cases := []struct{name string; value any; expected string}{
 {"html", map[string]any{"q":"R&D <b>"}, `{"q":"R&D <b>"}`},
 {"emoji", map[string]any{"q":"🚀"}, `{"q":"🚀"}`},
 {"separator", map[string]any{"q":"a\u2028b\u2029c"}, "{\"q\":\"a\u2028b\u2029c\"}"},
 {"negativezero",map[string]any{"n":float64(0)},`{"n":0}`},
 }
 for _,tc:=range cases {
 t.Run(tc.name,func(t *testing.T){ got,err:=canonicalJSON(tc.value); if err!=nil{t.Fatal(err)};if string(got)!=tc.expected {t.Fatalf("canonical byte mismatch: got %q want %q",got,tc.expected)} })
 }
}
