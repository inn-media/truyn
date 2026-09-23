# Planned Modules Registry

**Snapshot:** 2026-09-23  
**Replaces:** 112 empty `.gitkeep` placeholder directories removed from the tree.

Empty directories advertised architecture that has no code (provider adapters, installers, `config/mainnet`, trust sub-engines). Contributors, auditors and investors read directory names as capability claims, and `git` cannot represent an empty directory without a fake file. This registry is the single place where *planned* ownership is recorded; the directory is created together with its first real file.

Rules:

1. A directory exists only when it contains at least one real file. `.gitkeep` is rejected by `scripts/check-repository-hygiene.mjs`.
2. When code for a planned path lands, delete its row here in the same PR.
3. **Current implementation** points at where equivalent code already lives. Where it is filled in, new work extends that code instead of starting a parallel module.
4. `—` means no code exists anywhere today.

Canonical maturity remains `docs/architecture/IMPLEMENTATION_STATUS.md`.

## `.github/`

| Planned path | Current implementation |
|---|---|
| `.github/ISSUE_TEMPLATE/` | — |

## `adapters/`

| Planned path | Current implementation |
|---|---|
| `adapters/amazon-q/` | — |
| `adapters/anthropic/` | `adapters/providers/anthropic.js` |
| `adapters/autogen/` | — |
| `adapters/cohere/` | — |
| `adapters/crewai/` | — |
| `adapters/cursor/` | — |
| `adapters/deepseek/` | — |
| `adapters/gemini/` | `adapters/providers/vertex-gemini.js` |
| `adapters/github-copilot/` | — |
| `adapters/grok/` | — |
| `adapters/grpc/` | — |
| `adapters/langgraph/` | — |
| `adapters/llama-cpp/` | — |
| `adapters/llama/` | — |
| `adapters/microsoft/` | `adapters/providers/azure-*.js` |
| `adapters/mistral/` | — |
| `adapters/nvidia/` | — |
| `adapters/ollama/` | — |
| `adapters/openai/` | `adapters/providers/openai.js` |
| `adapters/perplexity/` | — |
| `adapters/qwen/` | — |
| `adapters/semantic-kernel/` | — |
| `adapters/vllm/` | — |
| `adapters/websocket/` | `network/relay/server.js` (ws relay) |
| `adapters/windsurf/` | — |

## `benchmarks/`

| Planned path | Current implementation |
|---|---|
| `benchmarks/bandwidth/` | — |
| `benchmarks/inference-cost/` | — |
| `benchmarks/latency/` | — |
| `benchmarks/throughput/` | — |
| `benchmarks/tokens/` | — |
| `benchmarks/trust/` | — |

## `bootstrap/`

| Planned path | Current implementation |
|---|---|
| `bootstrap/discovery/` | — |
| `bootstrap/nodes/` | — |

## `cli/`

| Planned path | Current implementation |
|---|---|
| `cli/truyn/` | `cli/index.js` |

## `compute/`

| Planned path | Current implementation |
|---|---|
| `compute/executor/` | — |
| `compute/placement/` | — |
| `compute/policies/` | — |
| `compute/sandbox/` | — |

## `config/`

| Planned path | Current implementation |
|---|---|
| `config/mainnet/` | — |

## `core/`

| Planned path | Current implementation |
|---|---|
| `core/capability/` | — |
| `core/crypto/` | `core/identity/index.js` (Ed25519 signing) |
| `core/intent/` | `core/protocol/index.js` (NEED envelope) |
| `core/policy/` | `core/security/*` |
| `core/routing/` | `network/dht/kademlia.js`, `core/context/semantic-router-v2.js` |
| `core/state/` | `network/state/persistent-state.js` |

## `examples/`

| Planned path | Current implementation |
|---|---|
| `examples/codex-claude/` | — |
| `examples/gemini-llama/` | — |
| `examples/local-network/` | `examples/mvp-demo.js` |
| `examples/trust-verification/` | `tests/*trust*.test.js` |
| `examples/two-agents/` | — |
| `examples/two-nodes/` | `examples/mvp-demo.js` |
| `examples/weather/` | — |

## `gateways/`

| Planned path | Current implementation |
|---|---|
| `gateways/http/` | — |
| `gateways/legacy/` | — |
| `gateways/rest/` | — |
| `gateways/webhook/` | — |

## `installers/`

| Planned path | Current implementation |
|---|---|
| `installers/docker/` | — |
| `installers/linux/` | — |
| `installers/macos/` | — |
| `installers/uninstall/` | — |
| `installers/windows/` | — |

## `migrations/`

| Planned path | Current implementation |
|---|---|
| `migrations/config/` | — |
| `migrations/protocol/` | — |
| `migrations/storage/` | — |

## `network/`

| Planned path | Current implementation |
|---|---|
| `network/cache/` | — |
| `network/pubsub/` | — |

## `node/`

| Planned path | Current implementation |
|---|---|
| `node/config/` | `runtime/*-config.js` |
| `node/health/` | `runtime/relay-readiness.js` |
| `node/runtime/` | `node/index.js`, `runtime/*` |
| `node/scheduler/` | — |
| `node/service/` | `runtime/service.js` |
| `node/storage/` | `network/state/persistent-state.js` |
| `node/telemetry/` | `observability/*` |

## `packaging/`

| Planned path | Current implementation |
|---|---|
| `packaging/checksums/` | — |
| `packaging/deb/` | — |
| `packaging/docker/` | — |
| `packaging/homebrew/` | — |
| `packaging/rpm/` | — |
| `packaging/winget/` | — |

## `simulations/`

| Planned path | Current implementation |
|---|---|
| `simulations/network-failure/` | — |
| `simulations/nodes-10/` | — |
| `simulations/nodes-100/` | — |
| `simulations/nodes-1000/` | — |
| `simulations/sybil/` | — |
| `simulations/trust-scale/` | — |

## `spec/`

| Planned path | Current implementation |
|---|---|
| `spec/schemas/v2/` | — |

## `storage/`

| Planned path | Current implementation |
|---|---|
| `storage/cache/` | `core/context/semantic-index-store.js`, `core/context/sharded-semantic-index-store.js` |
| `storage/claims/` | `core/claims/index.js` |
| `storage/identity/` | `core/identity/index.js` |
| `storage/migrations/` | — |
| `storage/state/` | `network/state/persistent-state.js`, `core/security/durable-json-store.js` |

## `tests/`

| Planned path | Current implementation |
|---|---|
| `tests/adversarial/` | flat `tests/*.test.js` suites, selected via `scripts/run-test-suite.mjs` |
| `tests/compute/` | flat `tests/*.test.js` suites, selected via `scripts/run-test-suite.mjs` |
| `tests/integration/` | flat `tests/*.test.js` suites, selected via `scripts/run-test-suite.mjs` |
| `tests/interoperability/` | flat `tests/*.test.js` suites, selected via `scripts/run-test-suite.mjs` |
| `tests/network/` | flat `tests/*.test.js` suites, selected via `scripts/run-test-suite.mjs` |
| `tests/security/` | flat `tests/*.test.js` suites, selected via `scripts/run-test-suite.mjs` |
| `tests/trust/` | flat `tests/*.test.js` suites, selected via `scripts/run-test-suite.mjs` |
| `tests/unit/` | flat `tests/*.test.js` suites, selected via `scripts/run-test-suite.mjs` |

## `trust/`

| Planned path | Current implementation |
|---|---|
| `trust/anomaly/` | — |
| `trust/engine/` | `core/trust/index.js`, `core/trust/network.js`, `node/active-trust-network.js` |
| `trust/independence/` | — |
| `trust/policies/` | `core/trust/claim-verification.js`, `node/trust-verification.js` |
| `trust/provenance/` | `core/provenance/index.js` |
| `trust/reputation/` | — |
| `trust/scoring/` | `core/trust/index.js` |
| `trust/sybil/` | — |

## `updater/`

| Planned path | Current implementation |
|---|---|
| `updater/channels/` | — |
| `updater/migrations/` | — |
| `updater/rollback/` | — |
| `updater/verification/` | — |

## Removed accidental duplicate

`adapters/nlweb/` also contained a byte-identical copy of `adapters/{a2a,mcp,http,compatibility,providers,sdk}` plus `adapters/nlweb/nlweb/*` (49 files) and 25 provider placeholders, introduced by the replay commit `6e7f3c7`. Its relative imports (for example `../../core/protocol/index.js`) did not resolve, so nothing could load it. Only the six NLWeb bridge modules restored in `a28cba1` remain: `ask.js`, `bridge-matrix.js`, `client.js`, `provider-edge.js`, `response.js`, `who.js`.
