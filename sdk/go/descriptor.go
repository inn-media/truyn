package truyn

import (
	"context"
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type DescriptorSelection struct {
	DescriptorVersion string         `json:"descriptorVersion"`
	Protocol          string         `json:"protocol"`
	Interface         map[string]any `json:"interface"`
}

type VerifiedAgentDescriptor struct {
	Descriptor AgentDescriptor     `json:"descriptor"`
	Selection  DescriptorSelection `json:"selection"`
	Signer     map[string]string   `json:"signer"`
}

func descriptorSignatures(raw map[string]any) []string {
	values := []string{}
	if value, ok := raw["signature"].(string); ok && value != "" { values = append(values, value) }
	if list, ok := raw["signatures"].([]any); ok {
		for _, item := range list {
			switch value := item.(type) {
			case string:
				if value != "" { values = append(values, value) }
			case map[string]any:
				if text, ok := value["value"].(string); ok && text != "" { values = append(values, text) }
			}
		}
	}
	return values
}

func parseDescriptorTime(value any) (time.Time, bool) {
	text, ok := value.(string); if !ok || text == "" { return time.Time{}, false }
	parsed, err := time.Parse(time.RFC3339, text); return parsed, err == nil
}

func validateDescriptor(raw map[string]any, now time.Time) error {
	if raw["schema"] != AgentDescriptorSchema || raw["descriptorVersion"] != "1" { return NewError(VersionMismatch, "unsupported Agent Descriptor schema/version", false) }
	identity, ok := raw["identity"].(string); if !ok || !strings.HasPrefix(identity, "truyn:node:") { return NewError(InvalidArgument, "invalid Agent Descriptor identity", false) }
	protocols, ok := raw["protocols"].([]any); if !ok || len(protocols) == 0 { return NewError(InvalidArgument, "Agent Descriptor protocols are required", false) }
	interfaces, ok := raw["interfaces"].([]any); if !ok || len(interfaces) == 0 { return NewError(InvalidArgument, "Agent Descriptor interfaces are required", false) }
	if _, ok := raw["capabilities"].([]any); !ok { return NewError(InvalidArgument, "Agent Descriptor capabilities are invalid", false) }
	issued, ok := parseDescriptorTime(raw["issuedAt"]); if !ok { return NewError(InvalidArgument, "Agent Descriptor issuedAt is invalid", false) }
	expires, ok := parseDescriptorTime(raw["expiresAt"]); if !ok || !expires.After(issued) { return NewError(InvalidArgument, "Agent Descriptor expiry window is invalid", false) }
	if !expires.After(now) { return NewError(InvalidArgument, "Agent Descriptor has expired", false) }
	if len(descriptorSignatures(raw)) == 0 { return NewError(Unauthenticated, "Agent Descriptor signature is required", false) }
	return nil
}

func verifyDescriptor(raw map[string]any, publicKeyPEM string) error {
	identity := raw["identity"].(string)
	resolved, err := nodeIDFromPublicKeyPEM(publicKeyPEM); if err != nil || resolved != identity { return NewError(Unauthenticated, "Agent Descriptor identity key mismatch", false) }
	block, _ := pem.Decode([]byte(publicKeyPEM)); if block == nil { return NewError(Unauthenticated, "invalid Agent Descriptor public key", false) }
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes); if err != nil { return NewError(Unauthenticated, "invalid Agent Descriptor public key", false) }
	key, ok := parsed.(ed25519.PublicKey); if !ok { return NewError(Unauthenticated, "Agent Descriptor public key must be Ed25519", false) }
	unsigned := make(map[string]any, len(raw)); for keyName, value := range raw { if keyName != "signature" && keyName != "signatures" { unsigned[keyName] = value } }
	payload, err := canonicalJSON(unsigned); if err != nil { return err }
	for _, encoded := range descriptorSignatures(raw) {
		signature, err := base64.StdEncoding.DecodeString(encoded); if err == nil && len(signature) == ed25519.SignatureSize && ed25519.Verify(key, payload, signature) { return nil }
	}
	return NewError(Unauthenticated, "Agent Descriptor signature verification failed", false)
}

func (c *Client) FetchAgentDescriptor(ctx context.Context, descriptorURL string, publicKeyPEM string, supportedInterfaces []string) (*VerifiedAgentDescriptor, error) {
	parsedURL, err := url.Parse(descriptorURL); if err != nil || parsedURL.Host == "" || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") { return nil, NewError(InvalidArgument, "Agent Descriptor URL must be absolute HTTP(S)", false) }
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsedURL.String(), nil); if err != nil { return nil, err }; req.Header.Set("accept", "application/json")
	resp, err := c.httpClient.Do(req); if err != nil { if errors.Is(err, context.Canceled) { return nil, NewError(Cancelled, err.Error(), false) }; return nil, NewError(Transport, err.Error(), true) }
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 { return nil, normalizeHTTPError(resp.StatusCode, "descriptor_http_error") }
	var raw map[string]any; if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil { return nil, NewError(InvalidResponse, "Agent Descriptor response is invalid JSON", false) }
	if err := validateDescriptor(raw, time.Now()); err != nil { return nil, err }
	identity := raw["identity"].(string)
	if strings.TrimSpace(publicKeyPEM) == "" {
		var remote Identity
		if err := c.requestJSON(ctx, http.MethodGet, "/v1/nodes/"+url.PathEscape(identity), nil, true, &remote); err != nil { return nil, err }
		publicKeyPEM = remote.PublicKey
	}
	if err := verifyDescriptor(raw, publicKeyPEM); err != nil { return nil, err }
	protocol := ""; advertisedProtocols := map[string]bool{}; for _, value := range raw["protocols"].([]any) { if text, ok := value.(string); ok { advertisedProtocols[text] = true } }; for _, candidate := range c.config.SupportedProtocols { if advertisedProtocols[candidate] { protocol = candidate; break } }; if protocol == "" { return nil, NewError(VersionMismatch, "no mutually supported TRUYN protocol", false) }
	if len(supportedInterfaces) == 0 { supportedInterfaces = []string{"https", "websocket", "truyn-quic", "mcp"} }
	allowed := map[string]bool{}; for _, value := range supportedInterfaces { allowed[value] = true }
	var selected map[string]any; for _, value := range raw["interfaces"].([]any) { if candidate, ok := value.(map[string]any); ok { if kind, ok := candidate["type"].(string); ok && allowed[kind] { selected = candidate; break } } }; if selected == nil { return nil, NewError(VersionMismatch, "no mutually supported Agent Descriptor interface", false) }
	encoded, _ := json.Marshal(raw); var descriptor AgentDescriptor; if err := json.Unmarshal(encoded, &descriptor); err != nil { return nil, NewError(InvalidResponse, err.Error(), false) }
	return &VerifiedAgentDescriptor{Descriptor: descriptor, Selection: DescriptorSelection{DescriptorVersion:"1", Protocol:protocol, Interface:selected}, Signer:map[string]string{"identity":identity,"keyBinding":"identity"}}, nil
}
