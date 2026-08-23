#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT="${1:?usage: build-class-d-1000-runtime-bundle.sh OUTPUT_TGZ}"
SOURCE_SHA="${TRUYN_TESTED_COMMIT:-$(git rev-parse HEAD)}"
[[ "$(git rev-parse HEAD)" == "$SOURCE_SHA" ]]
[[ -d node_modules ]]
for tool in node jq curl openssl; do command -v "$tool" >/dev/null; done

STAGE="$(mktemp -d)"
VERIFY="$(mktemp -d)"
trap 'rm -rf "$STAGE" "$VERIFY"' EXIT
mkdir -p "$STAGE/app" "$STAGE/runtime/bin" "$STAGE/runtime/tool-bin" "$STAGE/runtime/lib"

git archive "$SOURCE_SHA" | tar -xf - -C "$STAGE/app"
cp -a node_modules "$STAGE/app/node_modules"
cp "$(command -v node)" "$STAGE/runtime/bin/node"
chmod 0755 "$STAGE/runtime/bin/node"

copy_tool() {
  local name="$1" src lib
  src="$(command -v "$name")"
  cp "$src" "$STAGE/runtime/tool-bin/$name"
  chmod 0755 "$STAGE/runtime/tool-bin/$name"
  while IFS= read -r lib; do
    [[ -n "$lib" && -f "$lib" ]] || continue
    cp -L "$lib" "$STAGE/runtime/lib/$(basename "$lib")"
  done < <(ldd "$src" | awk '/=> \// {print $3} /^\// {print $1}')
  cat >"$STAGE/runtime/bin/$name" <<'WRAP'
#!/usr/bin/env bash
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LD_LIBRARY_PATH="$HERE/../lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$HERE/../tool-bin/__TOOL__" "$@"
WRAP
  sed -i "s/__TOOL__/$name/g" "$STAGE/runtime/bin/$name"
  chmod 0755 "$STAGE/runtime/bin/$name"
}

copy_tool jq
copy_tool curl
copy_tool openssl

node_version="$($STAGE/runtime/bin/node --version)"
package_lock_sha="$(sha256sum package-lock.json | awk '{print $1}')"
python3 - "$STAGE/manifest.json" "$SOURCE_SHA" "$node_version" "$package_lock_sha" <<'PY'
import json, sys
path, source, node_version, lock_sha = sys.argv[1:]
with open(path, 'w', encoding='utf-8') as f:
    json.dump({
        'schema': 'truyn.class-d1000.runtime-bundle.v1',
        'sourceSha': source,
        'nodeVersion': node_version,
        'packageLockSha256': lock_sha,
        'osCompatibility': 'ubuntu-22.04-amd64',
        'contents': ['tracked-source', 'node_modules', 'node', 'jq', 'curl', 'openssl']
    }, f, sort_keys=True, separators=(',', ':'))
    f.write('\n')
PY

mkdir -p "$(dirname "$OUT")"
tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner -czf "$OUT" -C "$STAGE" app runtime manifest.json
sha256sum "$OUT" >"$OUT.sha256"

tar -xzf "$OUT" -C "$VERIFY"
"$VERIFY/runtime/bin/node" -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
"$VERIFY/runtime/bin/jq" --version >/dev/null
"$VERIFY/runtime/bin/curl" --version >/dev/null
"$VERIFY/runtime/bin/openssl" version >/dev/null
test -f "$VERIFY/app/network/testnet/node-service.js"
test -d "$VERIFY/app/node_modules"
echo "TRUYN_CLASS_D1000_RUNTIME_BUNDLE=PASS sourceSha=${SOURCE_SHA} sha256=$(awk '{print $1}' "$OUT.sha256")"
