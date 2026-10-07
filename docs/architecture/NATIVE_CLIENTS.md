# TRUYN Native Clients

**Status:** source implementation added; exact-head four-platform installer qualification is performed by `.github/workflows/native-clients.yml`.

TRUYN's native-client program is distinct from the managed-client platform bundles and from the five first-party language SDKs.

## Product boundary

One Tauri 2 application source implements the requester GUI for:

| Platform | Required artifact | Build target |
|---|---|---|
| Windows | `.exe` | NSIS installer |
| macOS | `.dmg` | Apple Disk Image |
| Linux | `.deb` | Debian package |
| Android | `.apk` | installable debug preview / later production-signed APK |

The application is not a remote website wrapper. UI assets are embedded in the application, and relay networking is implemented in Rust.

## Requester lifecycle

The native client:

1. creates or loads a stable local Ed25519 identity with an exclusive first-writer filesystem claim;
2. derives `truyn:node:<sha256(spki)>`;
3. signs/verifies TRUYN/1 envelopes using explicit TCJ1 canonicalization, including UTF-16 object-key ordering and ECMAScript-compatible number rendering;
4. registers with the relay, tracks `expiresInMs`, refreshes before expiry, rejects unrepresentable TTLs, and re-registers once when an authenticated request receives HTTP 401;
5. performs authorization-aware discovery and strips relay-added trust metadata only for provider-signature verification;
6. durably records the generated NEED ID and relay recovery metadata before dispatch, submits one active NEED at a time, and requires the relay receipt ID to equal the signed envelope ID;
7. binds active work to the original relay and matched provider, preserving ambiguous submissions until requester-scoped reconciliation proves whether the relay accepted them;
8. polls relay-native `GET /v1/requests/{requestId}`;
9. verifies envelope and RESULT timestamps, signature, node-ID/public-key binding, request correlation, matched-provider identity, required output field and optional metadata object semantics before marking output verified; malformed terminal output is rejected but still releases the local active-request gate;
10. retries transient status failures and reconstructs active-request polling after process restart using the same stable node identity; recovery writes use synced staging plus backup fallback;
11. cancels with a requester-signed REVOKE at `POST /v1/revoke`, reconciling already-terminal/not-found relay state back into a released local state;
12. prevents relay changes while a request remains active.

Provider execution credentials remain absent. Provider visibility and dispatch remain relay policy decisions.

## Native security boundary

The Rust transport rejects credential-bearing URLs, public plaintext HTTP, nested relay paths, redirects and public hostnames resolving to loopback/private/link-local/CGNAT/unspecified/multicast addresses. Response bodies are bounded while streaming rather than only after allocation.

The node private key is stored only in application data. Unix-like systems force `0600`; first creation writes and fsyncs a unique staging file before an atomic hard-link claim publishes the final identity path, so an interrupted write cannot publish an empty identity and concurrent first launches cannot overwrite each other's key. Android generated manifests are hardened with legacy and Android 12+ backup rules that exclude the application file domain from cloud backup and device transfer. Relay session tokens are memory-only.

## Distribution/provenance boundary

Pull-request native jobs explicitly check out `github.event.pull_request.head.sha`; workflow-dispatch builds use `github.sha`. Artifact names use the same expression, so exact-head qualification refers to the bytes that were actually built.

Build qualification and public distribution remain different gates. macOS direct distribution requires Apple signing/notarization, Windows should use Authenticode, and Play releases require a production Android signing key.

- **source implemented** - GUI/native code exists;
- **build-qualified** - one exact source SHA produced all four installable formats;
- **production-signed** - platform signing/notarization is independently proven;
- **store/public released** - immutable public download/store evidence exists.

No later state is implied by an earlier one.
