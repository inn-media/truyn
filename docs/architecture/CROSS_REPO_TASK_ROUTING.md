# Cross-Repository Task Routing

No contributor, automation or AI executor should need to remember the second repository implicitly.

## Required scope declaration

Every architecture-relevant task and PR declares exactly one:

- `OPEN` — public protocol, SDK, Node/Relay reference implementation, conformance, public benchmark, self-hostable/reference behavior;
- `PRIVATE` — managed/global/commercial/production-platform implementation; this work belongs in `inn-media/truyn-platform`;
- `BOTH` — an open stable contract changes and the private platform needs an independently reviewed compatibility change.

Ambiguous work stops for classification instead of silently choosing a repository.

## BOTH changes

A BOTH change is two independent PRs, not one cross-repository mutation surface.

1. change/qualify the open contract here;
2. publish the required released/versioned artifact when code consumption is needed;
3. update the immutable private dependency pin;
4. implement and qualify the private consumer;
5. merge in the declared compatibility order.

Private automation is not allowed to write, push, dispatch workflows or open mutation branches in this public repository. Public automation likewise has no private-code dependency.

## D-200 routing

D-200 is OPEN by default.

- benchmark implementation, network scripts, predicates and evidence → `inn-media/truyn` only;
- protocol/SDK/Descriptor contract change required by D-200 → `BOTH`, with linked private compatibility work;
- managed routing/ranking intelligence, private fleet telemetry or commercial policy → `inn-media/truyn-platform` only.

## Pull-request metadata

Every relevant public PR records:

- Scope: `OPEN | BOTH` (`PRIVATE` work must move to the private repository);
- Contract impact: `none | additive | breaking`;
- Counterpart private PR/issue when BOTH;
- Public artifact/release coordinate affected, when applicable;
- D-200 impact: `none | public-only | compatibility-update`;
- Security/privacy impact.

## Fail-closed rules

- public code never imports private code;
- private production code never consumes this repository by branch, source checkout, raw URL, sibling path, submodule or vendored snapshot;
- no private consumer may claim a not-yet-released public artifact as an accepted dependency;
- missing counterpart metadata blocks completion of a declared BOTH change;
- migration exceptions in `config/open-core-boundary.json` may only shrink.
