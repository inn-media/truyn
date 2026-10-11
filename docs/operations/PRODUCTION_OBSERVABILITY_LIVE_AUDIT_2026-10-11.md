# Production observability — read-only live evidence audit (2026-10-11)

**Outcome: PARTIALLY VERIFIED / END-TO-END PRODUCTION OBSERVABILITY NOT PROVEN.** This is an independent read-only examination of real GitHub Actions deploy/proof logs; it is not a new Azure or GCP probe execution, a deployed pager test, or a 28-day SLO PASS. This audit did not change cloud resources.

## Verified deployment and ingestion evidence

| Component | Evidence and result | Assessment |
| --- | --- | --- |
| Private VictoriaMetrics metrics backend | [Run 37917477738](https://github.com/inn-media/truyn/actions/runs/37917477738), job `113777080711`, completed SUCCESS on 2026-10-09. Runtime configured `-retentionPeriod=90d`; actual remote-write accepted one backend canary plus `truyn_synthetic_probe_retention_series`, both independently returned by PromQL. Sanitized artifact `production-metrics-backend-evidence`, ID `11610836098`. | **PASS** for backend canary ingestion/read-back, private ingress policy and configured 90-day SLO/probe-series retention; **NOT** proof of actual ongoing public edge synthetic probes or 90 elapsed days |
| Production relay metrics collector | [Run 37917477956](https://github.com/inn-media/truyn/actions/runs/37917477956), job `113777080941` failed at collector/relay ARM deployment with `ManagedEnvironmentNotProvisioned`. | **FAIL / NO LIVE REAL-RELAY METRICS PROOF** |
| OTLP traces / Tempo | [Run 37917477946](https://github.com/inn-media/truyn/actions/runs/37917477946), job `113777081125` failed at trace backend/runtime deployment with `ManagedEnvironmentNotProvisioned`. | **FAIL / NO DEPLOYED TRACE INGEST+READ-BACK PROOF** |
| Microsoft.Monitor provider registration | [Run 37917477894](https://github.com/inn-media/truyn/actions/runs/37917477894), job `113777081030` failed with `AuthorizationFailed` for subscription-level `Microsoft.Monitor/register/action`. | **FAIL / REGISTRATION NOT PROVEN**, requires authorized operator; no privilege elevation assumed |
| Production logs hot/archive | [Run 37917477783](https://github.com/inn-media/truyn/actions/runs/37917477783), job `113777080529`: storage/workspace provisioning and log routing steps succeeded, but final policy proof failed with `jq: explode input must be a string`. | **PARTIAL / FINAL POLICY AND LIVE READ-BACK NOT PROVEN** |
| Alertmanager / burn-rate rule trigger / pager PRIMARY and SECONDARY | Repository [alert rules](ALERTING.md) and [on-call](ON_CALL.md) contracts exist, but no end-to-end alert firing, delivered page and acknowledgement/escalation receipt was verified. | **NOT PROVEN** |
| Independent Azure public-edge HTTP and authenticated WebSocket probes | No verified real one-per-minute Azure external probe samples that reach the intended public edge and are independently queryable from the SLO backend. | **NOT PROVEN** |
| Independent GCP public-edge HTTP and authenticated WebSocket probes | No verified real one-per-minute GCP external probe samples, backend ingests/read-back or independently attested origin. | **NOT PROVEN** |

## 90-day protected retention: distinguish data classes

- **Production SLO metrics and synthetic probe series:** private VictoriaMetrics runtime configured `90d`; successful on-the-wire remote-write + PromQL canary read-back in run `37917477738`. Runtime configuration and immediate read-back are proven **at that run time**. No one has observed 90 elapsed historical days or validated a real SLO probe time series here.
- **Traces:** normal retention defined as 30 days and incident-retained traces as 90 days. Trace backend deployment failed, so no actual trace 90-day persistence or readback is proven.
- **Logs:** configured hot 30 days, archive 180 days (longer than 90), but final live policy proof failed. A deployed storage account/diagnostic route alone is not proof of archived real logs or 180-day persistence.
- **Alerts:** alert thresholds and routing labels are checked into Git, but actual delivery/acknowledgement of a page is not proven.

## Required next read-only and bounded live proofs

1. Query the exact selected production Container Apps managed environment and its ARM failed deployment operations; correct `ManagedEnvironmentNotProvisioned` before touching collector/trace runtime. Do not mutate unrelated deployments; requalify exact source and verify a **real relay-request** metric and distributed trace with an independent query.
2. Obtain subscription-level `Microsoft.Monitor` registration from an authorized owner, or show it already Registered; do not treat failed OIDC registration as success.
3. Correct `jq` verification for actual Azure JSON field types **without weakening the retention, log routing, no-public-ingress or policy checks**; re-run read-only retention proof and query actual archived production log events.
4. Run independent Azure and GCP external probes at least once a minute each against the **actual public hostname** for HTTP and WebSocket upgrade **plus authenticated session-ready**. Record UTC, probe region/cloud, exact qualifying outcome, synthetic marker and source release. Verify samples are delivered to the private backend and independently read back from each cloud's series.
5. Test actual burn-rate alarm delivery via Alertmanager -> human PRIMARY acknowledgement -> SECONDARY escalation, and separately trigger a zero-budget safety alert; archive sanitized receipts without pager identities or secret endpoints.
6. Read back actual retention runtime flags, network/private ACL and role policies, source SHA, event samples, query outputs, artifact digests and 28-day completeness. Missing telemetry is `UNKNOWN`, not `PASS`; maintenance outages count per [PRODUCTION_SLO.md](PRODUCTION_SLO.md).

**Do not declare `PRODUCTION_OBSERVABILITY_PASS` or A-SLO 28d PASS.** A 90-day synthetic *retention-class canary* is not an independent Azure/GCP *external availability probe*, and 90-day configuration is not 90 days of collected history.

## Later same-day follow-up (2026-10-11)

The Microsoft.Monitor failure recorded above was subsequently repaired: protected operator run [38155580879](https://github.com/inn-media/azure-control-plane/actions/runs/38155580879) and public workflow [38155616438 Attempt 2](https://github.com/inn-media/truyn/actions/runs/38155616438) both verified `Registered`. Later collector [38156048855](https://github.com/inn-media/truyn/actions/runs/38156048855) and Tempo [38156859871](https://github.com/inn-media/truyn/actions/runs/38156859871) deployments succeeded but terminal read-back checks FAILED. Independent audit [38156735307](https://github.com/inn-media/azure-control-plane/actions/runs/38156735307) classified collector readback as `LOGSTREAM_RBAC_DENIED`. All historical failed attempts remain preserved; this update does **not** declare production observability or 28-day SLO PASS.
