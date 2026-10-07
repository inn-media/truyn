# Native Client Quickstart

The TRUYN native GUI lives in `clients/native/`.

## Local prerequisites

Install the current Tauri 2 prerequisites for your operating system, Rust 1.90+ and Node.js 22.

Install deterministically from the committed npm and Cargo lockfiles:

```bash
cd clients/native
npm ci --ignore-scripts --no-audit --no-fund
npm run tauri -- icon icon.svg
```

Desktop development:

```bash
npm run tauri -- dev
```

Desktop packaging examples:

```bash
npm run tauri -- build --bundles nsis   # Windows
npm run tauri -- build --bundles dmg    # macOS
npm run tauri -- build --bundles deb    # Debian/Ubuntu
```

Android requires the Android SDK, NDK and Java. Initialize with the repository hardening wrapper so backup/device-transfer exclusions are applied before build:

```bash
npm run android:init
npm run tauri -- icon icon.svg
npm run android:harden
npm run tauri -- android build --debug --apk --ci
```

## Using the application

1. Launch TRUYN.
2. Enter the relay origin and connect. Public relay URLs require HTTPS.
3. The app shows its stable local `truyn:node:...` identity.
4. Discover a capability such as `reasoning.general`.
5. Enter a request and send one signed NEED.
6. While that NEED is active, the app prevents a second submission or relay switch.
7. Temporary polling failures are retried without abandoning the request. If the relay revokes a still-unexpired session, the client re-registers once after HTTP 401. If the app restarts, atomic non-secret recovery state re-registers the same node identity and resumes requester-scoped polling.
8. A lost/ambiguous submission acknowledgement is reconciled by the original signed NEED ID rather than creating a second paid request.
9. A RESULT is shown as verified only after envelope timestamps, Ed25519 signature, provider node-ID/public-key binding, original NEED ID, matched-provider identity and RESULT payload semantics all pass. A malformed terminal RESULT is shown as rejected and does not permanently lock the client.

Local development mode permits loopback relay testing only.

## Qualification and release note

The permanent Native Clients workflow has produced all four installer formats from one exact qualified source: Windows NSIS `.exe`, macOS `.dmg`, Linux Debian `.deb`, and Android installable debug `.apk`. The accepted build qualification is run `37632795987` on source `90e0b2c8bd4c51549756980479121a392b73325f`; the hardening is merged into public main through PR #904.

Build qualification is not the same as public distribution. The CI APK is intentionally debug-signed so it is installable without storing a production Android signing key in the public repository. Windows/macOS public distribution still requires the appropriate production signing/notarization credentials, and an immutable public installer release remains a separate gate.
