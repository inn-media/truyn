package truyn

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"
)

func TestDeveloperReleaseConformance(t *testing.T) {
	relay := os.Getenv("TRUYN_CONFORMANCE_RELAY")
	if relay == "" {
		t.Skip("TRUYN_CONFORMANCE_RELAY is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	provider, err := Connect(ctx, ClientConfig{BaseURL: relay}, "go-provider")
	if err != nil { t.Fatal(err) }
	requester, err := Connect(ctx, ClientConfig{BaseURL: relay}, "go-requester")
	if err != nil { t.Fatal(err) }
	capability := fmt.Sprintf("sdk.release.go.%d", time.Now().UnixNano())
	if _, err := provider.Offer(ctx, capability, map[string]any{"language":"go"}); err != nil { t.Fatal(err) }
	receipt, err := requester.Need(ctx, capability, map[string]any{"question":"hello"}, nil)
	if err != nil { t.Fatal(err) }
	need, err := provider.NextNeed(ctx)
	if err != nil { t.Fatal(err) }
	if need.NeedID != receipt.NeedID || need.Requester != requester.NodeID() || need.Capability != capability { t.Fatalf("unexpected NEED event: %#v", need) }
	if _, err := provider.SendResult(ctx, need.NeedID, map[string]any{"ok":true,"language":"go"}, nil); err != nil { t.Fatal(err) }
	result, err := requester.WaitForResult(ctx, receipt.NeedID)
	if err != nil { t.Fatal(err) }
	if result.Provider != provider.NodeID() || !result.Verification.Ok { t.Fatalf("unexpected RESULT event: %#v", result) }
	cancelReceipt, err := requester.Need(ctx, capability, map[string]any{"cancel":true}, nil)
	if err != nil { t.Fatal(err) }
	if err := requester.CancelNeed(ctx, cancelReceipt.NeedID, "sdk_conformance_cancel"); err != nil { t.Fatal(err) }
}
