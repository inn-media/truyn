# TRUYN Open Governance

TRUYN Open is intended to become an open, vendor-neutral technical standard and intelligence-network interoperability layer. Open-source code alone is not sufficient: normative protocol, compatibility, conformance and governance changes must remain public, reviewable and able to evolve beyond one vendor.

## Current governance state

TRUYN Open is in **bootstrap governance**. InnMedia is the **Founding Steward** and currently performs project-level functions that a future multi-organization Technical Steering Committee (TSC) should perform.

This is not a claim that neutral governance already exists.

Target progression:

```text
founding stewardship
        ↓
open maintainer model
        ↓
multi-organization TSC
        ↓
neutral legal stewardship
        ↓
stable ecosystem governance
```

## Relationship to TRUYN Platform

`inn-media/truyn-platform` is the private proprietary TRUYN Platform codebase operated commercially by InnMedia.

TRUYN Platform ownership and TRUYN Open normative governance are separate.

Private platform owners may make private product, operations, pricing and infrastructure decisions, but they do **not** gain a private channel to redefine:

- TRUYN/1 semantics;
- public wire/schema compatibility;
- Agent Descriptor semantics;
- first-party SDK conformance;
- official public extensions;
- public D-200 predicates/evidence;
- public stability/deprecation policy.

If a private-platform requirement needs a public contract change, it enters the normal public RFC/PR/governance process and is routed as `BOTH` under `docs/architecture/CROSS_REPO_TASK_ROUTING.md`.

## Governance scope

Public project governance applies to:

- normative TRUYN protocol/specification changes;
- wire/schema compatibility;
- public identity/security/authorization semantics;
- official extensions and bindings;
- Agent Descriptor compatibility;
- first-party SDK conformance;
- official interoperability profiles;
- public release/stability/deprecation policy;
- public conformance programs;
- contribution provenance/IP policy;
- public project governance itself.

Governance does not control third-party products, private provider infrastructure, commercial pricing, cloud accounts or independently operated TRUYN networks.

## Principles

1. **Vendor neutrality by structure, not slogan.**
2. **Public technical record for normative decisions.**
3. **Earned maintainer authority.**
4. **Protocol stability after a stable generation is declared.**
5. **Extension before core when possible.**
6. **Security and compatibility are mandatory review dimensions.**
7. **Open participation.**
8. **No hidden normative channel.**
9. **Conflict transparency and recusal.**
10. **No false maturity claims.**
11. **DCO-based contribution provenance without vendor-specific copyright capture.**
12. **Private platform ownership never implies private normative protocol authority.**

## Contribution provenance

TRUYN Open uses **Developer Certificate of Origin (DCO) 1.1** for new contribution commits. Every contribution commit must contain an author-matching `Signed-off-by` trailer and CI enforces this requirement.

Contributors retain copyright and submit contributions under the applicable public project license. TRUYN Open does not currently require a CLA, copyright assignment or InnMedia-specific relicensing grant.

A future change to DCO/CLA/copyright-assignment policy is a Governance change.

## Roles

### Contributor

Any participant who proposes, documents, tests, implements or reviews public TRUYN Open work.

### Maintainer

A contributor trusted to review/merge within an assigned public scope. Maintainers cannot bypass protocol governance or DCO requirements.

### Subsystem Maintainer

A Maintainer with responsibility for networking, protocol/spec, security, SDK/DX, interoperability, Trustability, conformance or other public subsystems.

### Technical Steering Committee

The future TSC is the highest technical governance body for normative public-project decisions. During bootstrap, the Founding Steward performs these functions transparently under published process where practical.

### Security Response Team

A small trusted group may privately coordinate vulnerability disclosure and embargoed fixes. Confidentiality affects disclosure timing, not permanent normative authority. Material permanent protocol/security changes enter the public record when safe.

## Maintainer admission / TSC target

Maintainer authority is earned through sustained contribution/review, architecture/security understanding, reliable judgment and constructive participation.

The steady-state TSC target is multi-organization:

- at least three independent organizations/constituencies before claiming multi-organization governance;
- no single organization may hold a voting majority;
- the project should move toward no organization holding more than one third of voting seats as it grows;
- affiliations and seat changes are public.

## Decision classes

- **Class A** — routine/non-normative implementation/docs/tests/refactoring.
- **Class B** — compatible normative change.
- **Class C** — core/normative architecture/security/identity/conformance change.
- **Class D** — breaking stable-generation change requiring a new major/generation boundary.
- **Governance change** — governance/TSC/stewardship/contribution-provenance policy.

Class B–D and Governance changes require the applicable public RFC/decision process.

## Voting / consensus target

The project prefers rough consensus backed by evidence. Once a formal TSC exists:

- quorum is a majority of active voting members;
- ordinary decisions require simple majority with quorum;
- governance changes, breaking stable-core decisions and neutral-stewardship changes require at least two-thirds of the full active voting TSC;
- conflicts should cause recusal;
- decisions/rationale remain public.

During bootstrap there is no fictional multi-party vote; the Founding Steward records bootstrap decisions explicitly.

## RFC / extension processes

Normative changes follow `docs/governance/RFC_PROCESS.md`. Extensions follow `docs/governance/EXTENSIONS.md`.

Third parties may create Community Extensions in their own namespace without permission. Official `truyn.org` extension status requires public project approval.

## Open/private routing

Repository placement is governed by `docs/architecture/OPEN_CORE_BOUNDARY.md`:

- protocol/reference/self-hosting/conformance work → `OPEN`;
- managed/global/commercial/private-ops implementation → `PRIVATE` in TRUYN Platform;
- a public contract plus private consumer change → `BOTH` using independent linked PRs.

A private commercial concern is not, by itself, a reason to make a public protocol decision private.

## Neutral stewardship target

TRUYN Open intends to move toward a neutral legal/stewardship structure suitable for an open technical standard. No document may claim that transition is complete until legal and organizational facts exist.

## Governance maturity

| Stage | Meaning |
|---|---|
| G0 | founder governed, incomplete public process |
| G1 | public governance/RFC/contribution contracts defined |
| G2 | open maintainer model operating |
| G3 | multi-organization TSC |
| G4 | neutral legal stewardship |
| G5 | stable ecosystem governance |

Current public status is **G1**, with bootstrap operational control still transitioning from G0.

See `MAINTAINERS.md`, `DCO`, `docs/governance/`, `docs/architecture/GOVERNANCE_ARCHITECTURE.md`, `docs/architecture/OPEN_CORE_BOUNDARY.md` and `ROADMAP.md`.
