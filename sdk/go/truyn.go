package truyn

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	Protocol              = "TRUYN/1"
	AgentDescriptorSchema = "truyn.agent-descriptor/v1"
	StableSDKAPIVersion   = "1"
)

type ClientConfig struct {
	BaseURL            string
	AuthToken          string
	SupportedProtocols []string
	Timeout            time.Duration
	HTTPClient         *http.Client
	Identity           *LocalIdentity
}

type LocalIdentity struct {
	NodeID        string `json:"nodeId"`
	PublicKeyPEM  string `json:"publicKey"`
	PrivateKeyPEM string `json:"-"`
	Algorithm     string `json:"algorithm"`
	privateKey    ed25519.PrivateKey
}

func CreateLocalIdentity() (*LocalIdentity, error) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	publicDER, err := x509.MarshalPKIXPublicKey(publicKey)
	if err != nil {
		return nil, err
	}
	privateDER, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		return nil, err
	}
	publicPEM := string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER}))
	privatePEM := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privateDER}))
	sum := sha256.Sum256(publicDER)
	return &LocalIdentity{
		NodeID:        "truyn:node:" + hex.EncodeToString(sum[:]),
		PublicKeyPEM:  publicPEM,
		PrivateKeyPEM: privatePEM,
		Algorithm:     "Ed25519",
		privateKey:    privateKey,
	}, nil
}

func (i *LocalIdentity) ensurePrivateKey() error {
	if len(i.privateKey) == ed25519.PrivateKeySize {
		return nil
	}
	block, _ := pem.Decode([]byte(i.PrivateKeyPEM))
	if block == nil {
		return errors.New("identity private key PEM is invalid")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return err
	}
	privateKey, ok := key.(ed25519.PrivateKey)
	if !ok {
		return errors.New("identity private key must be Ed25519")
	}
	i.privateKey = privateKey
	return nil
}

func nodeIDFromPublicKeyPEM(publicKeyPEM string) (string, error) {
	block, _ := pem.Decode([]byte(publicKeyPEM))
	if block == nil {
		return "", errors.New("public key PEM is invalid")
	}
	key, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return "", err
	}
	if _, ok := key.(ed25519.PublicKey); !ok {
		return "", errors.New("public key must be Ed25519")
	}
	sum := sha256.Sum256(block.Bytes)
	return "truyn:node:" + hex.EncodeToString(sum[:]), nil
}

func canonicalJSON(value any) ([]byte, error) { return json.Marshal(value) }

func (i *LocalIdentity) envelope(kind string, payload map[string]any, to *string) (map[string]any, error) {
	switch kind {
	case "IDENTITY", "OFFER", "NEED", "RESULT", "REVOKE":
	default:
		return nil, fmt.Errorf("unsupported message type: %s", kind)
	}
	if err := i.ensurePrivateKey(); err != nil {
		return nil, err
	}
	expected, err := nodeIDFromPublicKeyPEM(i.PublicKeyPEM)
	if err != nil {
		return nil, err
	}
	if expected != i.NodeID {
		return nil, errors.New("sender node ID does not match the supplied public key")
	}
	idBytes := make([]byte, 16)
	if _, err := rand.Read(idBytes); err != nil {
		return nil, err
	}
	idBytes[6] = (idBytes[6] & 0x0f) | 0x40
	idBytes[8] = (idBytes[8] & 0x3f) | 0x80
	id := fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", idBytes[0:4], idBytes[4:6], idBytes[6:8], idBytes[8:10], idBytes[10:16])
	var toValue any = nil
	if to != nil {
		toValue = *to
	}
	unsigned := map[string]any{
		"protocol": Protocol,
		"type": kind,
		"id": id,
		"from": i.NodeID,
		"to": toValue,
		"createdAt": time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
		"publicKey": i.PublicKeyPEM,
		"payload": payload,
	}
	canonical, err := canonicalJSON(unsigned)
	if err != nil {
		return nil, err
	}
	signature := ed25519.Sign(i.privateKey, canonical)
	envelope := make(map[string]any)
	for k, v := range unsigned {
		envelope[k] = v
	}
	envelope["signature"] = base64.StdEncoding.EncodeToString(signature)
	return envelope, nil
}

func VerifyEnvelope(envelope map[string]any) (bool, string) {
	if envelope == nil || envelope["protocol"] != Protocol {
		return false, "unsupported_protocol"
	}
	from, ok1 := envelope["from"].(string)
	publicPEM, ok2 := envelope["publicKey"].(string)
	sigText, ok3 := envelope["signature"].(string)
	if !ok1 || !ok2 || !ok3 || from == "" || publicPEM == "" || sigText == "" {
		return false, "missing_required_field"
	}
	expected, err := nodeIDFromPublicKeyPEM(publicPEM)
	if err != nil || expected != from {
		return false, "node_id_key_mismatch"
	}
	block, _ := pem.Decode([]byte(publicPEM))
	if block == nil {
		return false, "invalid_signature"
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return false, "invalid_signature"
	}
	publicKey, ok := parsed.(ed25519.PublicKey)
	if !ok {
		return false, "invalid_signature"
	}
	signature, err := base64.StdEncoding.DecodeString(sigText)
	if err != nil {
		return false, "invalid_signature"
	}
	unsigned := make(map[string]any)
	for k, v := range envelope {
		if k != "signature" {
			unsigned[k] = v
		}
	}
	canonical, err := canonicalJSON(unsigned)
	if err != nil {
		return false, "invalid_signature"
	}
	if !ed25519.Verify(publicKey, canonical, signature) {
		return false, "invalid_signature"
	}
	return true, ""
}

type Client struct {
	config        ClientConfig
	baseURL       string
	httpClient    *http.Client
	identity      *LocalIdentity
	sessionToken  string
	mu            sync.Mutex
	pendingEvents []Event
}

func NewClient(config ClientConfig) (*Client, error) {
	if strings.TrimSpace(config.BaseURL) == "" {
		return nil, NewError(InvalidArgument, "base URL is required", false)
	}
	parsed, err := url.Parse(config.BaseURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return nil, NewError(InvalidArgument, "base URL must be an absolute HTTP(S) URL", false)
	}
	identity := config.Identity
	if identity == nil {
		identity, err = CreateLocalIdentity()
		if err != nil {
			return nil, err
		}
	}
	timeout := config.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: timeout}
	}
	protocols := config.SupportedProtocols
	if len(protocols) == 0 {
		protocols = []string{Protocol}
	}
	config.SupportedProtocols = protocols
	return &Client{config: config, baseURL: strings.TrimRight(config.BaseURL, "/"), httpClient: httpClient, identity: identity, sessionToken: config.AuthToken}, nil
}

func Connect(ctx context.Context, config ClientConfig, name string) (*Client, error) {
	client, err := NewClient(config)
	if err != nil {
		return nil, err
	}
	if err := client.Register(ctx, name); err != nil {
		return nil, err
	}
	return client, nil
}

func (c *Client) NodeID() string { return c.identity.NodeID }

func (c *Client) Identity(ctx context.Context) (*Identity, error) {
	select {
	case <-ctx.Done():
		return nil, NewError(Cancelled, ctx.Err().Error(), false)
	default:
		return &Identity{NodeID: c.identity.NodeID, PublicKey: c.identity.PublicKeyPEM}, nil
	}
}

func (c *Client) Register(ctx context.Context, name string) error {
	payload := map[string]any{
		"nodeId": c.identity.NodeID,
		"algorithm": c.identity.Algorithm,
		"protocols": c.config.SupportedProtocols,
		"name": nil,
	}
	if name != "" {
		payload["name"] = name
	}
	envelope, err := c.identity.envelope("IDENTITY", payload, nil)
	if err != nil {
		return err
	}
	var body map[string]any
	if err := c.requestJSON(ctx, http.MethodPost, "/v1/register", map[string]any{"envelope": envelope}, false, &body); err != nil {
		return err
	}
	token, ok := body["sessionToken"].(string)
	if !ok || token == "" {
		return NewError(InvalidResponse, "relay returned an invalid registration response", false)
	}
	c.sessionToken = token
	return nil
}

func (c *Client) authHeader() (string, error) {
	if c.sessionToken == "" {
		return "", NewError(Unauthenticated, "a relay session token is required", false)
	}
	return "Bearer " + c.sessionToken, nil
}

func (c *Client) requestJSON(ctx context.Context, method, path string, payload any, auth bool, out any) error {
	var reader io.Reader
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("accept", "application/json")
	if payload != nil {
		req.Header.Set("content-type", "application/json")
	}
	if auth {
		header, err := c.authHeader()
		if err != nil {
			return err
		}
		req.Header.Set("authorization", header)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return NewError(Cancelled, err.Error(), false)
		}
		if errors.Is(err, context.DeadlineExceeded) {
			return NewError(DeadlineExceeded, err.Error(), true)
		}
		return NewError(Transport, err.Error(), true)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return NewError(Transport, err.Error(), true)
	}
	var probe map[string]any
	if err := json.Unmarshal(raw, &probe); err != nil {
		return NewError(InvalidResponse, fmt.Sprintf("relay returned non-JSON response (HTTP %d)", resp.StatusCode), false)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		code, _ := probe["error"].(string)
		if code == "" {
			code = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return normalizeHTTPError(resp.StatusCode, code)
	}
	if out != nil {
		if err := json.Unmarshal(raw, out); err != nil {
			return NewError(InvalidResponse, err.Error(), false)
		}
	}
	return nil
}

func (c *Client) Offer(ctx context.Context, capability string, metadata map[string]any) (map[string]any, error) {
	if strings.TrimSpace(capability) == "" {
		return nil, NewError(InvalidArgument, "capability is required", false)
	}
	if metadata == nil {
		metadata = map[string]any{}
	}
	envelope, err := c.identity.envelope("OFFER", map[string]any{"capability": map[string]any{"name": capability}, "metadata": metadata}, nil)
	if err != nil {
		return nil, err
	}
	var body map[string]any
	err = c.requestJSON(ctx, http.MethodPost, "/v1/offers", map[string]any{"envelope": envelope}, true, &body)
	return body, err
}

func (c *Client) PublishOffer(ctx context.Context, offer Offer) (*Offer, error) {
	var body map[string]any
	if err := c.requestJSON(ctx, http.MethodPost, "/v1/offers", map[string]any{"envelope": offer}, true, &body); err != nil {
		return nil, err
	}
	return &offer, nil
}

func (c *Client) Discover(ctx context.Context, capability string) ([]Offer, error) {
	if strings.TrimSpace(capability) == "" {
		return nil, NewError(InvalidArgument, "capability is required", false)
	}
	var body struct{ Offers []Offer `json:"offers"` }
	if err := c.requestJSON(ctx, http.MethodGet, "/v1/offers?capability="+url.QueryEscape(capability), nil, true, &body); err != nil {
		return nil, err
	}
	return body.Offers, nil
}

type NeedReceipt struct {
	Ok            bool   `json:"ok"`
	NeedID        string `json:"needId"`
	Provider      string `json:"provider"`
	ProviderTrust any    `json:"providerTrust,omitempty"`
}

func (c *Client) Need(ctx context.Context, capability string, input any, policy map[string]any) (*NeedReceipt, error) {
	if strings.TrimSpace(capability) == "" {
		return nil, NewError(InvalidArgument, "capability is required", false)
	}
	if policy == nil {
		policy = map[string]any{}
	}
	envelope, err := c.identity.envelope("NEED", map[string]any{"capability": map[string]any{"name": capability}, "input": input, "policy": policy}, nil)
	if err != nil {
		return nil, err
	}
	var receipt NeedReceipt
	if err := c.requestJSON(ctx, http.MethodPost, "/v1/needs", map[string]any{"envelope": envelope}, true, &receipt); err != nil {
		return nil, err
	}
	if !receipt.Ok || receipt.NeedID == "" || receipt.Provider == "" {
		return nil, NewError(InvalidResponse, "relay returned an invalid NEED receipt", false)
	}
	return &receipt, nil
}

func (c *Client) SubmitNeed(ctx context.Context, need Need) (*Need, error) {
	var receipt NeedReceipt
	if err := c.requestJSON(ctx, http.MethodPost, "/v1/needs", map[string]any{"envelope": need}, true, &receipt); err != nil {
		return nil, err
	}
	return &need, nil
}

func (c *Client) SendResult(ctx context.Context, requestID string, output any, metadata map[string]any) (map[string]any, error) {
	if requestID == "" {
		return nil, NewError(InvalidArgument, "request ID is required", false)
	}
	if metadata == nil {
		metadata = map[string]any{}
	}
	envelope, err := c.identity.envelope("RESULT", map[string]any{"requestId": requestID, "output": output, "completedAt": time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), "metadata": metadata}, nil)
	if err != nil {
		return nil, err
	}
	var body map[string]any
	err = c.requestJSON(ctx, http.MethodPost, "/v1/results", map[string]any{"envelope": envelope}, true, &body)
	return body, err
}

type Event struct {
	Kind         string         `json:"kind"`
	Envelope     map[string]any `json:"envelope"`
	Trust        any            `json:"trust,omitempty"`
	Verification Verification   `json:"-"`
}

type Verification struct{ Ok bool; Reason string }

func (c *Client) Poll(ctx context.Context) ([]Event, error) {
	var body struct{ Events []Event `json:"events"` }
	if err := c.requestJSON(ctx, http.MethodGet, "/v1/events?nodeId="+url.QueryEscape(c.identity.NodeID), nil, true, &body); err != nil {
		return nil, err
	}
	for i := range body.Events {
		ok, reason := VerifyEnvelope(body.Events[i].Envelope)
		body.Events[i].Verification = Verification{Ok: ok, Reason: reason}
	}
	return body.Events, nil
}

func (c *Client) nextMatchingEvent(ctx context.Context, predicate func(Event) bool) (Event, error) {
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()
	for {
		c.mu.Lock()
		for i, event := range c.pendingEvents {
			if predicate(event) {
				c.pendingEvents = append(c.pendingEvents[:i], c.pendingEvents[i+1:]...)
				c.mu.Unlock()
				return event, nil
			}
		}
		c.mu.Unlock()
		events, err := c.Poll(ctx)
		if err != nil {
			return Event{}, err
		}
		for i, event := range events {
			if predicate(event) {
				c.mu.Lock()
				c.pendingEvents = append(c.pendingEvents, append(events[:i], events[i+1:]...)...)
				c.mu.Unlock()
				return event, nil
			}
		}
		c.mu.Lock()
		c.pendingEvents = append(c.pendingEvents, events...)
		c.mu.Unlock()
		select {
		case <-ctx.Done():
			return Event{}, NewError(DeadlineExceeded, ctx.Err().Error(), true)
		case <-ticker.C:
		}
	}
}

type NeedEvent struct {
	NeedID       string
	Requester    string
	Capability   string
	Input        any
	Policy       any
	Envelope     map[string]any
	Verification Verification
}

func (c *Client) NextNeed(ctx context.Context) (*NeedEvent, error) {
	event, err := c.nextMatchingEvent(ctx, func(event Event) bool { return event.Kind == "NEED" })
	if err != nil {
		return nil, err
	}
	if !event.Verification.Ok {
		return nil, NewError(InvalidResponse, "received NEED failed signature verification: "+event.Verification.Reason, false)
	}
	payload, _ := event.Envelope["payload"].(map[string]any)
	capabilityValue := payload["capability"]
	capability := ""
	if value, ok := capabilityValue.(map[string]any); ok {
		capability, _ = value["name"].(string)
	} else {
		capability, _ = capabilityValue.(string)
	}
	id, _ := event.Envelope["id"].(string)
	requester, _ := event.Envelope["from"].(string)
	if id == "" || requester == "" || capability == "" {
		return nil, NewError(InvalidResponse, "received invalid NEED event", false)
	}
	return &NeedEvent{NeedID: id, Requester: requester, Capability: capability, Input: payload["input"], Policy: payload["policy"], Envelope: event.Envelope, Verification: event.Verification}, nil
}

type ResultEvent struct {
	NeedID       string
	Provider     string
	Output       any
	Metadata     any
	Trust        any
	Envelope     map[string]any
	Verification Verification
}

func (c *Client) WaitForResult(ctx context.Context, needID string) (*ResultEvent, error) {
	if needID == "" {
		return nil, NewError(InvalidArgument, "need ID is required", false)
	}
	event, err := c.nextMatchingEvent(ctx, func(event Event) bool {
		if event.Kind != "RESULT" {
			return false
		}
		payload, _ := event.Envelope["payload"].(map[string]any)
		id, _ := payload["requestId"].(string)
		return id == needID
	})
	if err != nil {
		return nil, err
	}
	if !event.Verification.Ok {
		return nil, NewError(InvalidResponse, "received RESULT failed signature verification: "+event.Verification.Reason, false)
	}
	payload, _ := event.Envelope["payload"].(map[string]any)
	provider, _ := event.Envelope["from"].(string)
	if provider == "" {
		return nil, NewError(InvalidResponse, "received invalid RESULT event", false)
	}
	return &ResultEvent{NeedID: needID, Provider: provider, Output: payload["output"], Metadata: payload["metadata"], Trust: event.Trust, Envelope: event.Envelope, Verification: event.Verification}, nil
}

func (c *Client) Result(ctx context.Context, needID string) (*Result, error) {
	event, err := c.WaitForResult(ctx, needID)
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(event.Envelope)
	if err != nil {
		return nil, err
	}
	var result Result
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, NewError(InvalidResponse, err.Error(), false)
	}
	return &result, nil
}

func (c *Client) Revoke(ctx context.Context, targetID, targetKind, reason string) (map[string]any, error) {
	if targetID == "" {
		return nil, NewError(InvalidArgument, "target ID is required", false)
	}
	if targetKind != "offer" && targetKind != "need" {
		return nil, NewError(InvalidArgument, "targetKind must be need or offer", false)
	}
	if reason == "" {
		reason = "revoked_by_owner"
	}
	envelope, err := c.identity.envelope("REVOKE", map[string]any{"targetId": targetID, "targetKind": targetKind, "reason": reason}, nil)
	if err != nil {
		return nil, err
	}
	var body map[string]any
	err = c.requestJSON(ctx, http.MethodPost, "/v1/revoke", map[string]any{"envelope": envelope}, true, &body)
	return body, err
}

func (c *Client) RevokeOffer(ctx context.Context, offerID string) error {
	_, err := c.Revoke(ctx, offerID, "offer", "revoked_by_owner")
	return err
}

func (c *Client) CancelNeed(ctx context.Context, needID, reason string) error {
	_, err := c.Revoke(ctx, needID, "need", reason)
	return err
}

func (c *Client) AgentDescriptor(context.Context, string) (*AgentDescriptor, error) {
	return nil, NewError(Unimplemented, "Agent Descriptor serving/discovery lifecycle is not part of the Developer Release Layer", false)
}

type Identity struct { NodeID string `json:"nodeId"`; PublicKey string `json:"publicKey"` }
type AgentDescriptor struct { Schema string `json:"schema"`; DescriptorVersion string `json:"descriptorVersion"`; Identity string `json:"identity"`; Protocols []string `json:"protocols"`; Interfaces []Interface `json:"interfaces"`; Capabilities []Capability `json:"capabilities"`; IssuedAt string `json:"issuedAt"`; ExpiresAt string `json:"expiresAt"`; Signature string `json:"signature,omitempty"`; Signatures []Signature `json:"signatures,omitempty"` }
type Interface struct { Type string `json:"type"`; URL string `json:"url"` }
type Signature struct { Alg string `json:"alg"`; Value string `json:"value"`; CreatedAt string `json:"createdAt,omitempty"` }
type Capability struct { ID string `json:"id,omitempty"`; Name string `json:"name,omitempty"` }
type SignedEnvelope[T any] struct { Protocol string `json:"protocol"`; Type string `json:"type"`; ID string `json:"id"`; From string `json:"from"`; To string `json:"to,omitempty"`; CreatedAt string `json:"createdAt"`; PublicKey string `json:"publicKey"`; Payload T `json:"payload"`; Signature string `json:"signature"` }
type OfferPayload struct { Capability Capability `json:"capability"`; Metadata map[string]any `json:"metadata,omitempty"` }
type NeedPayload struct { Capability Capability `json:"capability"`; Input any `json:"input"`; Policy map[string]any `json:"policy,omitempty"` }
type ResultPayload struct { RequestID string `json:"requestId"`; Output any `json:"output"`; CompletedAt string `json:"completedAt"`; Metadata map[string]any `json:"metadata,omitempty"` }
type Offer = SignedEnvelope[OfferPayload]
type Need = SignedEnvelope[NeedPayload]
type Result = SignedEnvelope[ResultPayload]
type ArtifactRef string
type ObjectPayload struct { Kind string `json:"kind"`; Value any `json:"value"`; Metadata map[string]any `json:"metadata,omitempty"` }
type ArtifactPayload struct { Kind string `json:"kind"`; Ref string `json:"ref"`; MediaType string `json:"mediaType"`; Bytes *int64 `json:"bytes,omitempty"`; SHA256 string `json:"sha256,omitempty"`; Metadata map[string]any `json:"metadata,omitempty"` }

func NewObjectPayload(value any, metadata map[string]any) ObjectPayload { return ObjectPayload{Kind: "object", Value: value, Metadata: metadata} }

var sha256Pattern = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)

func NewArtifactPayload(ref, mediaType string, bytesCount *int64, sha256Text string, metadata map[string]any) (ArtifactPayload, error) {
	if strings.TrimSpace(ref) == "" { return ArtifactPayload{}, NewError(InvalidArgument, "artifact ref is required", false) }
	if strings.TrimSpace(mediaType) == "" { return ArtifactPayload{}, NewError(InvalidArgument, "artifact media type is required", false) }
	if bytesCount != nil && *bytesCount < 0 { return ArtifactPayload{}, NewError(InvalidArgument, "artifact bytes must be non-negative", false) }
	if sha256Text != "" && !sha256Pattern.MatchString(sha256Text) { return ArtifactPayload{}, NewError(InvalidArgument, "artifact sha256 must be 64 hexadecimal characters", false) }
	return ArtifactPayload{Kind: "artifact", Ref: ref, MediaType: mediaType, Bytes: bytesCount, SHA256: strings.ToLower(sha256Text), Metadata: metadata}, nil
}

type StreamItem[T any] struct { Sequence int64 `json:"sequence"`; Item T `json:"item"` }
func NewStreamItem[T any](sequence int64, item T) (StreamItem[T], error) { if sequence < 0 { return StreamItem[T]{}, NewError(InvalidArgument, fmt.Sprintf("stream sequence must be non-negative: %d", sequence), false) }; return StreamItem[T]{Sequence: sequence, Item: item}, nil }

type ErrorCode string
const (
	VersionMismatch ErrorCode = "version_mismatch"
	Unauthenticated ErrorCode = "unauthenticated"
	PermissionDenied ErrorCode = "permission_denied"
	DeadlineExceeded ErrorCode = "deadline_exceeded"
	InvalidArgument ErrorCode = "invalid_argument"
	Unimplemented ErrorCode = "unimplemented"
	Cancelled ErrorCode = "cancelled"
	Transport ErrorCode = "transport_error"
	InvalidResponse ErrorCode = "invalid_response"
)
type NormalizedError struct { Code ErrorCode `json:"code"`; Message string `json:"message"`; Retryable bool `json:"retryable"`; Source any `json:"source,omitempty"` }
func (e NormalizedError) Error() string { if e.Message == "" { return string(e.Code) }; return string(e.Code) + ": " + e.Message }
func (e NormalizedError) Is(target error) bool { return target == ErrUnimplemented && e.Code == Unimplemented }
var ErrUnimplemented = errors.New("truyn sdk operation is not implemented")
func NewError(code ErrorCode, message string, retryable bool) NormalizedError { return NormalizedError{Code: code, Message: message, Retryable: retryable} }
func normalizeHTTPError(status int, message string) error { switch status { case 401: return NewError(Unauthenticated, message, false); case 403: return NewError(PermissionDenied, message, false); case 408, 429, 500, 502, 503, 504: return NewError(Transport, message, true); default: return NewError(InvalidResponse, message, false) } }
