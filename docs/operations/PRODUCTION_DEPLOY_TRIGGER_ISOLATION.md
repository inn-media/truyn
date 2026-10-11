# Production deploy triggers — source isolation

The following Azure production provisioning workflows validate on pull requests when workflow code or tests change, but their `push/main` **apply** jobs are triggered only by changes to actual IaC/runtime configuration: Production DR Foundation, Production Trace Backend, Production Logs Retention, Production Metrics Backend and Production Metrics Collector.

A general shared security test or workflow YAML edit **must not redeploy Azure**. PR validation and standard DCO/CI/CodeQL remain mandatory. If the deployment logic changes without changes to IaC/runtime inputs, a subsequent independently authorized material source change/release is required for live rollout.

This avoids the 2026-10-11 P13 documentation repair unexpectedly launching production provisioning through `tests/public-repository.test.js`. Existing live negative gates and private networking/backup/retention policies remain unchanged. Red live deployments are retained as evidence; this is trigger safety, not proof their underlying cloud failures are repaired.
