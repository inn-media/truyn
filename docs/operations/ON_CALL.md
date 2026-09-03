# Production On-Call Rotation

**Status:** production on-call commitment and validation contract implemented. Actual human names, phone numbers, pager destinations and private schedules are operational data and are not committed to this public repository.

TRUYN production operations require continuous coverage with two distinct human responder slots:

```text
PRIMARY -> SECONDARY -> INCIDENT COMMANDER -> SERVICE OWNER
```

The production schedule source MUST always resolve both `primary` and `secondary`. The same human cannot occupy both roles in one window. Schedule windows must be contiguous: no gaps and no overlaps that make responsibility ambiguous.

`operations/on-call.js` validates these invariants and the required service ownership map.

## Rotation cadence

The reference operational cadence is a seven-day primary/secondary rotation. A private scheduling/pager system may use a different bounded cadence, but it MUST preserve continuous coverage, distinct primary/secondary humans and the escalation deadlines below.

Human identity/contact data belongs in the private on-call system. Public evidence may use opaque operator/role IDs.

## Escalation policy

| Severity | Primary acknowledgement | Secondary escalation | Incident commander | Service owner |
| --- | ---: | ---: | ---: | ---: |
| SEV1 | <=5 min | 5 min | 10 min | 15 min |
| SEV2 | <=15 min | 15 min | 30 min | 30 min |
| SEV3 | <=4 h | 4 h | as needed | <=8 h |

Fast/sustained SLO burn pages and zero-budget security/financial correctness alerts are page-capable. Slow-burn reliability alerts are tickets unless another condition raises severity.

No acknowledgement by the primary at the deadline automatically escalates to secondary. A SEV1 may not depend on one person's availability.

## Ownership

A production roster MUST name an accountable service owner for every operational domain:

- Relay;
- Network/DHT;
- Provider runtimes;
- Authorization;
- Billing/entitlement;
- Semantic retrieval;
- External A2A/MCP;
- Infrastructure;
- Security/rotation.

Ownership means responsibility for runbooks, alert quality, corrective actions and approval of material operational changes. The on-call responder may coordinate mitigation without being the code owner for every subsystem.

## Handoff

Every primary handoff must be acknowledged by both the incoming primary and incoming secondary and cover:

1. active incidents;
2. active pages and temporary silences;
3. current SLO/error-budget state;
4. deployments, migrations and risky changes in flight;
5. credentials/identities/trust records approaching rotation or expiry;
6. open postmortems, corrective actions and known risks.

A silent calendar change is not a valid handoff. `recordOnCallHandoff()` rejects incomplete handoffs.

## Incident authority

The primary may declare/raise severity and begin containment. The incident commander owns coordination, timeline and decision log for SEV1/SEV2. Service owners own follow-up corrective work. Security or billing ambiguity may require immediate fail-closed action even when availability remains green.

## Acceptance

Repository-level on-call acceptance requires:

- primary and secondary roles are mandatory and distinct;
- continuous schedule windows are machine-validated;
- escalation deadlines are defined;
- every production domain has explicit ownership;
- handoff requires acknowledgement plus the full checklist;
- public artifacts contain no personal contact/pager data;
- regression tests pass on the accepted exact SHA.

Operational deployment acceptance additionally requires a private roster populated with real humans, pager routes bound to those roles, and a controlled test-fire proving primary -> secondary escalation and acknowledgement timestamps. Those private identities and destinations must remain outside this repository.
