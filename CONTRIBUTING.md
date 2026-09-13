# Contributing to TRUYN Open

TRUYN Open is the public Apache-2.0 protocol, SDK, Node/Relay reference implementation, conformance and benchmark layer of the wider TRUYN architecture.

Contributions are welcome across protocol design, distributed systems, networking, cryptography, Trustability/provenance, provider authorization/BYOK, A2A/MCP interoperability, SDK/DX, public benchmarks, documentation, governance, standards and adversarial testing.

## Choose the repository first

TRUYN has two codebases:

- `inn-media/truyn` — **TRUYN Open** (this public repository);
- `inn-media/truyn-platform` — **TRUYN Platform** (private managed/commercial implementation).

Before implementation, classify the task using `docs/architecture/OPEN_CORE_BOUNDARY.md` and `docs/architecture/CROSS_REPO_TASK_ROUTING.md`:

- `OPEN` — protocol, SDK, Node/Relay reference implementation, conformance, public benchmark or self-hosting/reference behavior;
- `PRIVATE` — managed/global/commercial/private-operations implementation; do not implement it here;
- `BOTH` — a public contract changes and TRUYN Platform needs a linked compatibility PR.

Ambiguous work should be classified before code is written. Do not add a new managed/private implementation to the public tree merely because similar legacy code is still listed as a temporary migration exception.

## Cross-repository rules

Public code must never import private code.

A BOTH change uses independent PRs. Public contract/release work happens here; the private consumer pins the released/versioned artifact separately. Private production code must not consume this repository by branch, source checkout, raw GitHub URL, sibling path, submodule or vendored repo snapshot.

D-200 is OPEN by default. Its scripts, benchmark logic, predicates and evidence stay public. Managed routing/ranking/private telemetry belongs to TRUYN Platform.

## Governance before normative changes

A PR does not acquire normative authority merely because it changes the reference implementation.

Before a normative protocol, stable compatibility, official extension or governance change, read:

- `GOVERNANCE.md`;
- `MAINTAINERS.md`;
- `docs/governance/RFC_PROCESS.md`;
- `docs/governance/EXTENSIONS.md`;
- `docs/governance/DECISION_PROCESS.md`;
- `docs/governance/CONTRIBUTION_IP_POLICY.md`.

Routine non-normative implementation work can use the normal PR process.

## License / DCO

TRUYN Open is licensed under Apache License 2.0. Contributions are accepted under Apache-2.0 unless explicitly governed otherwise.

Every new contribution commit requires **DCO 1.1** sign-off with an author-matching trailer:

```text
Signed-off-by: Your Name <your.email@example.com>
```

Use `git commit -s`. CI verifies every contribution commit. This requirement applies to code, specs, tests, SDKs, adapters, docs, benchmark changes, governance records and repository configuration.

TRUYN Open does not currently require a CLA, copyright assignment or InnMedia-specific relicensing grant.

## Principles

- keep public protocol semantics vendor-neutral;
- preserve the open/private repository boundary;
- separate protocol governance, repository ownership, infrastructure operation and commercial ownership;
- prefer extensions/adapters before expanding stable core;
- preserve compatibility once a generation is declared stable;
- prefer measured claims over marketing claims;
- document failure/threat models;
- keep capability discovery separate from provider authorization;
- preserve private-by-default provider behavior;
- do not create execution paths that bypass central authorization;
- keep provider credentials at the user/provider runtime boundary;
- do not expose private providers/topology/allowlists/quotas through public metadata;
- do not commit secrets/private keys;
- protect published benchmark evidence with redact-not-delete handling.

## Normative decision classes

- Class A — routine/non-normative;
- Class B — compatible normative change;
- Class C — core/normative architecture change;
- Class D — breaking stable-generation change;
- Governance change — governance/TSC/stewardship/provenance rules.

Class B–D and governance changes use the applicable public RFC/decision process.

## SDK / developer experience

Required first-party public SDKs:

- JavaScript/TypeScript;
- Python;
- Go;
- Java;
- C#/.NET.

SDK work must preserve equivalent TRUYN semantics while remaining idiomatic. SDKs must not invent protocol behavior or move authoritative provider-policy decisions into clients.

Shared conformance should cover Descriptor verification, version handling, identity, authorization-aware discovery, OFFER publish/revoke, NEED→RESULT correlation, cancellation, references, normalized errors and negative security behavior.

Agent Descriptor remains bootstrap/self-description; OFFER remains dynamic availability/conditions. Neither grants authorization.

## Provider security / interoperability

Changes affecting routing, discovery, provider registration, A2A/MCP/HTTP/WebSocket/SDK execution, billing/quotas or adapters should explain:

- requester/provider ownership impact;
- authorization boundary;
- protocol/version/fallback behavior;
- mapping into TRUYN OFFER/NEED/RESULT/reference semantics;
- fail-closed behavior;
- whether unauthorized input can cause upstream provider execution;
- private-provider discovery exposure;
- BYOK/private-default compatibility;
- required negative/adversarial tests.

A capability match, Descriptor entry, A2A/MCP transport credential or SDK discovery result is never sufficient to bypass provider policy.

## Pull-request metadata

Use the repository PR template and declare:

- Scope: `OPEN` or `BOTH` (`PRIVATE` work belongs in TRUYN Platform);
- public contract impact;
- linked private PR/issue when BOTH;
- D-200 impact;
- validation/evidence;
- security/privacy impact;
- DCO certification.

See `ROADMAP.md`, `GOVERNANCE.md`, `SECURITY.md`, `DCO`, `spec/`, `sdk/`, `docs/governance/` and `docs/architecture/`.
