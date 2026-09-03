# Examples

Public examples are deliberately limited to **loopback local development** or **credentials supplied by the person running the example**.

## Included demo boundary

- `mvp-demo.js` — local loopback relay, deterministic nodes, no paid AI;
- `ai-mvp-demo.js` — local loopback relay with deterministic function adapters, no paid AI;
- `live-ai-demo.js` — local loopback relay plus the local user's own OpenAI/Anthropic credentials (BYOK); it does not use or expose TRUYN-operated provider credentials;
- `sdk/hello-need-result.ts` — TypeScript Developer Release source-checkout `NEED -> RESULT` onboarding example, no paid AI;
- `sdk/hello_need_result.py` — Python Developer Release source-checkout `NEED -> RESULT` onboarding example against a loopback relay, no paid AI.

The TypeScript/Python examples remain deliberately small source-checkout examples. They do not imply that only those two first-party SDKs exist: Go, Java and C#/.NET are implemented Developer Release clients and participate in the common five-language executable conformance gate.

Operational cross-cloud proofs, owner-cloud deployment workflows, private provider bootstraps and raw production benchmark execution tooling do not belong in this public examples directory.

## Package-publication boundary

The repository can build and verify the five Developer Release package artifacts with exact source/digest provenance. These examples are **not** evidence that native public registries already serve those packages. Until public publication is externally observed, source-checkout commands remain the reproducible onboarding path shown here.

## Security rules

Examples MUST NOT contain:

- real API keys, private keys or client secrets;
- live private origins/backchannels;
- owner cloud/service-account/managed-identity topology;
- private provider node IDs or allowlists;
- live quota/cost ceilings or billing identifiers;
- credential-bearing URLs;
- sensitive prompts, outputs or customer data.

A live-provider example is BYOK only. Publishing adapter or SDK code never makes any provider account a public TRUYN resource and never moves provider authorization/billing authority into the client.

See `../docs/getting-started/BYOK.md`, `../docs/getting-started/SDK_QUICKSTART.md`, `../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`, `../SECURITY.md` and `../docs/architecture/THREAT_MODEL.md`.
