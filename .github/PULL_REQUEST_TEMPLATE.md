## Summary

Describe the change and why it is needed.

## Two-repository routing

- Scope: `OPEN` / `BOTH` (`PRIVATE` work belongs in `inn-media/truyn-platform`)
- Public contract impact: `none` / `additive` / `breaking`
- Counterpart private PR/issue (required for `BOTH`):
- Public dependency coordinate or immutable contract identity affected (if any):
- D-200 impact: `none` / `public-only` / `compatibility-update`
- NLWeb impact: `none` / `public-interoperability` / `managed-compatibility` / `both`

## Protocol / compatibility impact

- [ ] No wire/protocol impact
- [ ] TRUYN/1 behavior changes
- [ ] Migration required
- Decision class (if applicable): Class A / B / C / D / Governance / N/A

## Boundary checklist

- [ ] I classified this work using `docs/architecture/OPEN_PRIVATE_BOUNDARY.md` and `docs/architecture/CROSS_REPO_TASK_ROUTING.md`.
- [ ] Public code does not import, fetch or otherwise depend on `inn-media/truyn-platform`.
- [ ] Any `BOTH` change has an explicit counterpart and compatibility order.
- [ ] D-200 implementation/evidence remains public and this change does not weaken D-200/D-1000 acceptance thresholds.
- [ ] No managed/private implementation is being restored to the public tree merely to satisfy a test.

## Security / Trustability / privacy impact

Describe security, privacy, provider, billing, or Trustability effects.

## Validation / evidence

Describe exact-SHA tests, CI, CodeQL, boundary checks, compatibility evidence, and any affected immutable public-contract identity.

## Documentation

- [ ] Updated
- [ ] Not applicable

## Contributor certification

- [ ] Every contribution commit is signed off under **DCO 1.1** with `Signed-off-by: Name <email>` (normally `git commit -s`).
- [ ] I have read `DCO` and `docs/governance/CONTRIBUTION_IP_POLICY.md`.

The checkbox is a reminder only. The authoritative certification is the author-matching `Signed-off-by` trailer on every contribution commit and CI verifies it.
