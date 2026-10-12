package truyn

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestDescriptorInterfaceJSONProjection(t *testing.T) {
	field, ok := reflect.TypeOf(Interface{}).FieldByName("URL")
	if !ok || field.Tag.Get("json") != "endpoint,omitempty" {
		t.Fatal("public URL field must map to optional endpoint")
	}
	for _, input := range []string{`{"type":"https"}`, `{"type":"https","endpoint":"https://example.invalid/agent"}`, `{"type":" ","endpoint":" "}`} {
		var value Interface
		if err := json.Unmarshal([]byte(input), &value); err != nil {
			t.Fatal(err)
		}
		output, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		var before, after map[string]any
		if err := json.Unmarshal([]byte(input), &before); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(output, &after); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(before, after) {
			t.Fatalf("wire projection mismatch: %s => %s", input, output)
		}
	}
}
