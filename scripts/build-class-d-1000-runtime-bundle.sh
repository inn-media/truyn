#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT="${1:?usage: build-class-d-1000-runtime-bundle.sh OUTPUT_TGZ}"
SOURCE_SHA="${TRUYN_TESTED_COMMIT:-$(git rev-parse HEAD)}"
[[ "$(git rev-parse HEAD)" == "$SOURCE_SHA" ]]
[[ -d node_modules ]]
for tool in node npm jq curl openssl; do command -v "$tool" >/dev/null; done

STAGE="$(mktemp -d)"
VERIFY="$(mktemp -d)"
SMOKE_PID=''
cleanup() {
  if [[ -n "$SMOKE_PID" ]]; then
    kill "$SMOKE_PID" >/dev/null 2>&1 || true
    wait "$SMOKE_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$STAGE" "$VERIFY"
}
trap cleanup EXIT
mkdir -p "$STAGE/app" "$STAGE/runtime/bin" "$STAGE/runtime/tool-bin" "$STAGE/runtime/lib"

# Only tracked source from the exact tested SHA is admitted to app/. Dependencies
# are the already-resolved CI node_modules tree; VMs never contact npm.
git archive "$SOURCE_SHA" | tar -xf - -C "$STAGE/app"
cp -a node_modules "$STAGE/app/node_modules"
cp "$(command -v node)" "$STAGE/runtime/bin/node"
chmod 0755 "$STAGE/runtime/bin/node"

# Never shadow the Ubuntu 22.04 base ABI through LD_LIBRARY_PATH. The previous
# bundle placed libc and every tool dependency in one shared directory. That can
# make an Ubuntu 22.04 VM load a runner-patch libc (or another tool's same-name
# library) into openssl/curl/jq. Keep only non-base dependencies and isolate them
# per tool.
is_base_abi_library() {
  case "$(basename "$1")" in
    libc.so.*|libm.so.*|libpthread.so.*|libdl.so.*|librt.so.*|libresolv.so.*|libgcc_s.so.*|libstdc++.so.*|ld-linux-*.so.*)
      return 0 ;;
    *)
      return 1 ;;
  esac
}

copy_tool() {
  local name="$1" src lib libdir
  src="$(command -v "$name")"
  libdir="$STAGE/runtime/lib/$name"
  mkdir -p "$libdir"
  cp "$src" "$STAGE/runtime/tool-bin/$name"
  chmod 0755 "$STAGE/runtime/tool-bin/$name"
  while IFS= read -r lib; do
    [[ -n "$lib" && -f "$lib" ]] || continue
    is_base_abi_library "$lib" && continue
    cp -L "$lib" "$libdir/$(basename "$lib")"
  done < <(ldd "$src" | awk '/=> \// {print $3} /^\// {print $1}')
  cat >"$STAGE/runtime/bin/$name" <<'WRAP'
#!/usr/bin/env bash
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LD_LIBRARY_PATH="$HERE/../lib/__TOOL__${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$HERE/../tool-bin/__TOOL__" "$@"
WRAP
  sed -i "s/__TOOL__/$name/g" "$STAGE/runtime/bin/$name"
  chmod 0755 "$STAGE/runtime/bin/$name"
}

copy_tool jq
copy_tool curl
copy_tool openssl

# This repository intentionally has no committed npm lockfile today. Record the
# exact package.json plus the fully resolved dependency tree that is actually
# placed in the immutable bundle. The bundle SHA-256 remains the VM admission
# authority, so every host receives byte-identical runtime/dependencies.
npm ls --all --json >"$STAGE/dependency-tree.json"
node_version="$($STAGE/runtime/bin/node --version)"
package_json_sha="$(sha256sum package.json | awk '{print $1}')"
dependency_tree_sha="$(sha256sum "$STAGE/dependency-tree.json" | awk '{print $1}')"
python3 - "$STAGE/manifest.json" "$SOURCE_SHA" "$node_version" "$package_json_sha" "$dependency_tree_sha" <<'PY'
import json, sys
path, source, node_version, package_sha, dependency_sha = sys.argv[1:]
with open(path, 'w', encoding='utf-8') as f:
    json.dump({
        'schema': 'truyn.class-d1000.runtime-bundle.v1',
        'sourceSha': source,
        'nodeVersion': node_version,
        'packageJsonSha256': package_sha,
        'dependencyTreeSha256': dependency_sha,
        'osCompatibility': 'ubuntu-22.04-amd64',
        'runtimeLibraryPolicy': 'tool-scoped-non-base-abi',
        'contents': ['tracked-source', 'node_modules', 'node', 'jq', 'curl', 'openssl', 'dependency-tree']
    }, f, sort_keys=True, separators=(',', ':'))
    f.write('\n')
PY

mkdir -p "$(dirname "$OUT")"
tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
  -czf "$OUT" -C "$STAGE" app runtime manifest.json dependency-tree.json
sha256sum "$OUT" >"$OUT.sha256"

tar -xzf "$OUT" -C "$VERIFY"
"$VERIFY/runtime/bin/node" -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
"$VERIFY/runtime/bin/jq" --version >/dev/null
"$VERIFY/runtime/bin/curl" --version >/dev/null
"$VERIFY/runtime/bin/openssl" version >/dev/null

# The package-level smoke test must exercise the exact operations used by VM
# bootstrap, not only --version. Generate TLS material and boot a real node
# service from the extracted immutable bundle.
mkdir -p "$VERIFY/smoke/etc" "$VERIFY/smoke/state"
"$VERIFY/runtime/bin/openssl" req -x509 -newkey rsa:2048 -nodes \
  -keyout "$VERIFY/smoke/etc/key.pem" \
  -out "$VERIFY/smoke/etc/cert.pem" \
  -subj '/CN=127.0.0.1' -days 1 -addext 'subjectAltName=IP:127.0.0.1' \
  >/dev/null 2>&1

read -r quic_port control_port < <(python3 - <<'PY'
import socket
u = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
u.bind(('127.0.0.1', 0))
q = u.getsockname()[1]
u.close()
t = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
t.bind(('127.0.0.1', 0))
c = t.getsockname()[1]
t.close()
print(q, c)
PY
)
(
  cd "$VERIFY/app"
  env \
    TRUYN_IDENTITY_PATH="$VERIFY/smoke/state/node-0-identity.json" \
    TRUYN_NETWORK_STATE_PATH="$VERIFY/smoke/state/node-0-state.json" \
    TRUYN_TLS_KEY_PATH="$VERIFY/smoke/etc/key.pem" \
    TRUYN_TLS_CERT_PATH="$VERIFY/smoke/etc/cert.pem" \
    TRUYN_ADVERTISE_HOST=127.0.0.1 \
    TRUYN_QUIC_HOST=127.0.0.1 \
    TRUYN_QUIC_PORT="$quic_port" \
    TRUYN_CONTROL_HOST=127.0.0.1 \
    TRUYN_CONTROL_PORT="$control_port" \
    TRUYN_PEER_RECORD_TTL_MS=14400000 \
    TRUYN_DHT_REPLICATION_FACTOR=3 \
    TRUYN_DHT_WRITE_QUORUM=2 \
    TRUYN_DHT_RPC_TIMEOUT_MS=5000 \
    "$VERIFY/runtime/bin/node" network/testnet/node-service.js \
    >"$VERIFY/smoke/node.out" 2>"$VERIFY/smoke/node.err"
) &
SMOKE_PID=$!
smoke_ready=0
for _ in $(seq 1 80); do
  if "$VERIFY/runtime/bin/curl" -fsS --max-time 1 "http://127.0.0.1:${control_port}/status" >"$VERIFY/smoke/status.json" 2>/dev/null; then
    smoke_ready=1
    break
  fi
  if ! kill -0 "$SMOKE_PID" >/dev/null 2>&1; then
    cat "$VERIFY/smoke/node.out" >&2 || true
    cat "$VERIFY/smoke/node.err" >&2 || true
    break
  fi
  sleep 0.1
done
[[ "$smoke_ready" == 1 ]]
jq -e '.ok == true and .started == true' "$VERIFY/smoke/status.json" >/dev/null
kill "$SMOKE_PID" >/dev/null 2>&1 || true
wait "$SMOKE_PID" >/dev/null 2>&1 || true
SMOKE_PID=''

test -f "$VERIFY/app/network/testnet/node-service.js"
test -d "$VERIFY/app/node_modules"
test -s "$VERIFY/dependency-tree.json"
if find "$VERIFY/runtime/lib" -type f \( \
  -name 'libc.so.*' -o -name 'libm.so.*' -o -name 'libpthread.so.*' -o \
  -name 'libdl.so.*' -o -name 'librt.so.*' -o -name 'libresolv.so.*' -o \
  -name 'libgcc_s.so.*' -o -name 'libstdc++.so.*' -o -name 'ld-linux-*.so.*' \
\) -print -quit | grep -q .; then
  echo 'D-1000 runtime bundle unexpectedly contains a base ABI library' >&2
  exit 1
fi
python3 - "$VERIFY/manifest.json" "$SOURCE_SHA" <<'PY'
import json, sys
manifest = json.load(open(sys.argv[1], encoding='utf-8'))
assert manifest['schema'] == 'truyn.class-d1000.runtime-bundle.v1'
assert manifest['sourceSha'] == sys.argv[2]
assert manifest['packageJsonSha256']
assert manifest['dependencyTreeSha256']
assert manifest['runtimeLibraryPolicy'] == 'tool-scoped-non-base-abi'
PY
echo "TRUYN_CLASS_D1000_RUNTIME_BUNDLE=PASS sourceSha=${SOURCE_SHA} sha256=$(awk '{print $1}' "$OUT.sha256")"
