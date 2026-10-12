package truyn

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"
)

func TestDescriptorInterfaceParity(t *testing.T) {
	input := os.Getenv("TRUYN_DESCRIPTOR_CASES_FILE")
	if input == "" {
		t.Skip("requires shared Descriptor HTTP fixture")
	}
	var suite struct {
		BaseURL             string   `json:"baseUrl"`
		SupportedInterfaces []string `json:"supportedInterfaces"`
		PublicKeyPEM        string   `json:"publicKeyPem"`
		Cases               []struct {
			ID  string `json:"id"`
			URL string `json:"url"`
		} `json:"cases"`
	}
	data, err := os.ReadFile(input)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &suite); err != nil {
		t.Fatal(err)
	}
	client, err := NewClient(ClientConfig{BaseURL: suite.BaseURL})
	if err != nil {
		t.Fatal(err)
	}
	rows := []map[string]any{}
	for _, item := range suite.Cases {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		value, err := client.FetchAgentDescriptor(ctx, item.URL, suite.PublicKeyPEM, suite.SupportedInterfaces)
		cancel()
		if err != nil {
			rows = append(rows, map[string]any{"id": item.ID, "ok": false, "message": err.Error()})
		} else {
			if len(value.Descriptor.Interfaces) == 0 {
				t.Fatalf("%s: missing typed interfaces", item.ID)
			}
			typed := value.Descriptor.Interfaces[0]
			if typed.Type != value.Selection.Interface["type"] {
				t.Fatalf("%s: typed type lost", item.ID)
			}
			expectedEndpoint, supplied := value.Selection.Interface["endpoint"]
			if supplied && typed.URL != expectedEndpoint {
				t.Fatalf("%s: typed endpoint lost", item.ID)
			}
			if !supplied && typed.URL != "" {
				t.Fatalf("%s: omitted endpoint synthesized", item.ID)
			}
			projectionBytes, marshalErr := json.Marshal(typed)
			if marshalErr != nil {
				t.Fatal(marshalErr)
			}
			var projection map[string]any
			if err := json.Unmarshal(projectionBytes, &projection); err != nil {
				t.Fatal(err)
			}
			if _, legacy := projection["url"]; legacy {
				t.Fatalf("%s: legacy url field emitted", item.ID)
			}
			_, emitted := projection["endpoint"]
			if emitted != supplied {
				t.Fatalf("%s: endpoint omission changed", item.ID)
			}
			rows = append(rows, map[string]any{"id": item.ID, "ok": true, "identity": value.Descriptor.Identity, "protocol": value.Selection.Protocol, "interface": value.Selection.Interface, "typedInterface": projection, "keyBinding": value.Signer["keyBinding"]})
		}
	}
	encoded, err := json.Marshal(rows)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(os.Getenv("TRUYN_DESCRIPTOR_RESULT_FILE"), encoded, 0600); err != nil {
		t.Fatal(err)
	}
}
