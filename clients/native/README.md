# TRUYN Native Client

This directory contains the first-party installable GUI requester for TRUYN.

It is intentionally separate from the existing platform-labelled managed-client `.tgz` bundles. Those bundles package SDK/runtime material; this application is a real Tauri GUI with native installers.

## Implemented requester flow

- create/load one stable local Ed25519 TRUYN node identity using exclusive first-writer creation;
- connect and register with a TRUYN relay;
- track relay session expiry, reject unrepresentable lifetimes, transparently re-register before expiry, and refresh once after an authenticated 401 caused by external session revocation;
- authorization-aware OFFER discovery while verifying only the provider-signed envelope, not relay-added trust metadata;
- create and sign canonical TCJ1 `NEED` and `REVOKE` envelopes;
- persist the signed NEED ID and relay recovery metadata before dispatch, then bind the accepted receipt to that exact request ID and matched provider;
- poll the relay-native requester status route;
- verify RESULT signature, node-ID/public-key binding, original NEED correlation and the matched provider identity before displaying output;
- retry transient polling failures without orphaning active work and recover an active request after application restart without persisting the session token;
- persist active-request recovery state through a synced staging file with backup fallback, and remove both primary/backup recovery records on terminal cleanup;
- treat a signed but semantically invalid terminal RESULT as terminal-unverified, release local work state and visibly reject the output;
- cancel requester-owned work through signed `REVOKE` on `/v1/revoke`; if completion wins the race, keep the request active and retrieve/verify its RESULT instead of discarding paid output;
- prevent concurrent paid submissions across both async handlers and separate OS processes with an exclusive active-work file lock; relay changes remain blocked while work is active.
- re-resolve and revalidate all relay DNS addresses when an authenticated session must be rebuilt after expiry, 401 or transport failure; IPv4-mapped IPv6 private addresses remain forbidden.
- preserve the user's exact prompt whitespace while rejecting whitespace-only input.

The one-active-work invariant is enforced across separate GUI processes with an OS-level exclusive file lock; after acquiring that lock, a process re-reads recovery state before it may create a new NEED. Relay session tokens are held in process memory only. Active-request recovery persists only the request ID, provider binding, relay origin and non-secret recovery metadata. The native client does not contain provider API keys and does not bypass TRUYN provider authorization. Android backup/device-transfer rules exclude the application file domain containing the signing identity.

## Build targets

The permanent `.github/workflows/native-clients.yml` gate builds:

- Windows: NSIS setup `.exe`;
- macOS: `.dmg`;
- Linux: Debian `.deb`;
- Android: debug-signed installable `.apk` preview.

Pull-request builds explicitly check out the PR head SHA so artifact labels and executable bytes refer to the same source revision. Production code signing/notarization/store publication is a separate distribution gate.

See `../../docs/getting-started/NATIVE_CLIENTS.md`.
