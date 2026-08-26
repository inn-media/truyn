// Package truyn contains the DX-2 Go SDK skeleton for the TRUYN/1 client surface.
//
// This package intentionally defines the stable shape that must be driven by the
// shared SDK conformance fixtures before public package publication. Methods are
// fail-closed placeholders until the Go transport binding is implemented.
package truyn

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

const (
	// Protocol is the TRUYN protocol generation targeted by this skeleton.
	Protocol = "TRUYN/1"

	// AgentDescriptorSchema is the Agent Descriptor schema expected by DX-2.
	AgentDescriptorSchema = "truyn.agent-descriptor/v1"

	// StableSDKAPIVersion versions the cross-language DX-3 SDK compatibility surface.
	StableSDKAPIVersion = "1"
)

// ClientConfig configures a TRUYN client without embedding provider credentials.
type ClientConfig struct {
	BaseURL            string
	AuthToken          string
	SupportedProtocols []string
	Timeout            time.Duration
}

// Client is the idiomatic Go entrypoint for TRUYN SDK operations.
type Client struct {
	config ClientConfig
}

// NewClient creates a client. Network behavior is intentionally deferred until
// the DX-2 transport implementation; construction validates only local shape.
func NewClient(config ClientConfig) (*Client, error) {
	if config.BaseURL == "" {
		return nil, NewError(InvalidArgument, "base URL is required", false)
	}
	return &Client{config: config}, nil
}

// Identity returns the requester identity.
func (c *Client) Identity(ctx context.Context) (*Identity, error) {
	return nil, c.unimplemented(ctx, "Identity")
}

// AgentDescriptor fetches and verifies a TRUYN Agent Descriptor.
func (c *Client) AgentDescriptor(ctx context.Context, url string) (*AgentDescriptor, error) {
	if url == "" {
		return nil, NewError(InvalidArgument, "descriptor URL is required", false)
	}
	return nil, c.unimplemented(ctx, "AgentDescriptor")
}

// Discover returns requester-authorized capabilities/providers only.
func (c *Client) Discover(ctx context.Context, capability string) ([]Offer, error) {
	if capability == "" {
		return nil, NewError(InvalidArgument, "capability is required", false)
	}
	return nil, c.unimplemented(ctx, "Discover")
}

// PublishOffer publishes an OFFER envelope.
func (c *Client) PublishOffer(ctx context.Context, offer Offer) (*Offer, error) {
	return nil, c.unimplemented(ctx, "PublishOffer")
}

// RevokeOffer revokes a previously published offer.
func (c *Client) RevokeOffer(ctx context.Context, offerID string) error {
	if offerID == "" {
		return NewError(InvalidArgument, "offer ID is required", false)
	}
	return c.unimplemented(ctx, "RevokeOffer")
}

// SubmitNeed submits a NEED envelope.
func (c *Client) SubmitNeed(ctx context.Context, need Need) (*Need, error) {
	return nil, c.unimplemented(ctx, "SubmitNeed")
}

// Result retrieves or waits for a RESULT correlated to a NEED.
func (c *Client) Result(ctx context.Context, needID string) (*Result, error) {
	if needID == "" {
		return nil, NewError(InvalidArgument, "need ID is required", false)
	}
	return nil, c.unimplemented(ctx, "Result")
}

func (c *Client) unimplemented(ctx context.Context, operation string) error {
	select {
	case <-ctx.Done():
		return NewError(DeadlineExceeded, ctx.Err().Error(), true)
	default:
		return NewError(Unimplemented, operation+" is not implemented in the Go DX-2 skeleton", false)
	}
}

// DTOs shared with the language-neutral conformance contract.
type Identity struct {
	NodeID    string `json:"nodeId"`
	PublicKey string `json:"publicKey"`
}

type AgentDescriptor struct {
	Schema            string       `json:"schema"`
	DescriptorVersion string       `json:"descriptorVersion"`
	Identity          string       `json:"identity"`
	Protocols         []string     `json:"protocols"`
	Interfaces        []Interface  `json:"interfaces"`
	Capabilities      []Capability `json:"capabilities"`
	IssuedAt          string       `json:"issuedAt"`
	ExpiresAt         string       `json:"expiresAt"`
	Signature         string       `json:"signature,omitempty"`
	Signatures        []Signature  `json:"signatures,omitempty"`
}

type Interface struct {
	Type string `json:"type"`
	URL  string `json:"url"`
}

type Signature struct {
	Alg       string `json:"alg"`
	Value     string `json:"value"`
	CreatedAt string `json:"createdAt,omitempty"`
}

type Capability struct {
	ID   string `json:"id,omitempty"`
	Name string `json:"name,omitempty"`
}

type SignedEnvelope[T any] struct {
	Protocol  string `json:"protocol"`
	Type      string `json:"type"`
	ID        string `json:"id"`
	From      string `json:"from"`
	To        string `json:"to,omitempty"`
	CreatedAt string `json:"createdAt"`
	PublicKey string `json:"publicKey"`
	Payload   T      `json:"payload"`
	Signature string `json:"signature"`
}

type OfferPayload struct {
	Capability Capability        `json:"capability"`
	Metadata   map[string]string `json:"metadata,omitempty"`
}

type NeedPayload struct {
	Capability Capability        `json:"capability"`
	Input      any               `json:"input"`
	Policy     map[string]string `json:"policy,omitempty"`
}

type ResultPayload struct {
	RequestID   string            `json:"requestId"`
	Output      any               `json:"output"`
	CompletedAt string            `json:"completedAt"`
	Metadata    map[string]string `json:"metadata,omitempty"`
}

type Offer = SignedEnvelope[OfferPayload]
type Need = SignedEnvelope[NeedPayload]
type Result = SignedEnvelope[ResultPayload]

type ArtifactRef string

// ObjectPayload carries small structured data directly inside a TRUYN message.
type ObjectPayload struct {
	Kind     string         `json:"kind"`
	Value    any            `json:"value"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

// ArtifactPayload carries only an integrity-bound reference to binary/media data.
type ArtifactPayload struct {
	Kind      string         `json:"kind"`
	Ref       string         `json:"ref"`
	MediaType string         `json:"mediaType"`
	Bytes     *int64         `json:"bytes,omitempty"`
	SHA256    string         `json:"sha256,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
}

func NewObjectPayload(value any, metadata map[string]any) ObjectPayload {
	return ObjectPayload{Kind: "object", Value: value, Metadata: metadata}
}

var sha256Pattern = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)

func NewArtifactPayload(ref, mediaType string, bytes *int64, sha256 string, metadata map[string]any) (ArtifactPayload, error) {
	if strings.TrimSpace(ref) == "" {
		return ArtifactPayload{}, NewError(InvalidArgument, "artifact ref is required", false)
	}
	if strings.TrimSpace(mediaType) == "" {
		return ArtifactPayload{}, NewError(InvalidArgument, "artifact media type is required", false)
	}
	if bytes != nil && *bytes < 0 {
		return ArtifactPayload{}, NewError(InvalidArgument, "artifact bytes must be non-negative", false)
	}
	if sha256 != "" && !sha256Pattern.MatchString(sha256) {
		return ArtifactPayload{}, NewError(InvalidArgument, "artifact sha256 must be 64 hexadecimal characters", false)
	}
	return ArtifactPayload{Kind: "artifact", Ref: ref, MediaType: mediaType, Bytes: bytes, SHA256: strings.ToLower(sha256), Metadata: metadata}, nil
}

// StreamItem provides language-neutral sequence numbering for SDK event streams.
type StreamItem[T any] struct {
	Sequence int64 `json:"sequence"`
	Item     T     `json:"item"`
}

func NewStreamItem[T any](sequence int64, item T) (StreamItem[T], error) {
	if sequence < 0 {
		return StreamItem[T]{}, NewError(InvalidArgument, fmt.Sprintf("stream sequence must be non-negative: %d", sequence), false)
	}
	return StreamItem[T]{Sequence: sequence, Item: item}, nil
}

type ErrorCode string

const (
	VersionMismatch  ErrorCode = "version_mismatch"
	Unauthenticated  ErrorCode = "unauthenticated"
	PermissionDenied ErrorCode = "permission_denied"
	DeadlineExceeded ErrorCode = "deadline_exceeded"
	InvalidArgument  ErrorCode = "invalid_argument"
	Unimplemented    ErrorCode = "unimplemented"
)

// NormalizedError is the SDK projection of protocol, relay and client failures.
type NormalizedError struct {
	Code      ErrorCode `json:"code"`
	Message   string    `json:"message"`
	Retryable bool      `json:"retryable"`
	Source    any       `json:"source,omitempty"`
}

func (e NormalizedError) Error() string {
	if e.Message == "" {
		return string(e.Code)
	}
	return string(e.Code) + ": " + e.Message
}

// Is allows errors.Is checks against the sentinel unimplemented error.
func (e NormalizedError) Is(target error) bool {
	return target == ErrUnimplemented && e.Code == Unimplemented
}

var ErrUnimplemented = errors.New("truyn sdk operation is not implemented")

func NewError(code ErrorCode, message string, retryable bool) NormalizedError {
	return NormalizedError{Code: code, Message: message, Retryable: retryable}
}
