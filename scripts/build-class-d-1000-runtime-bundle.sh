#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT="${1:?usage: build-class-d-1000-runtime-bundle.sh OUTPUT_TGZ}"
SOURCE_SHA="${TRUYN_TESTED_COMMIT:-$(git rev-parse HEAD)}"
[[ "$(git rev-parse HEAD)" == "$SOURCE_SHA" ]]
[[ -d node_modules ]]
for tool in node npm jq curl openssl ldd; do command -v "$tool" >/dev/null; done

STAGE="$(mktemp -d)"
VERIFY="$(mktemp -d)"
trap 'rm -rf "$STAGE" "$VERIFY"' EXIT
mkdir -p "$STAGE/app" "$STAGE/runtime/bin" "$STAGE/runtime/tool-bin" "$STAGE/runtime/lib"

# Only tracked source from the exact tested SHA is admitted to app/. Dependencies
# are the already-resolved CI node_modules tree; VMs never contact npm.
git archive "$SOURCE_SHA" | tar -xf - -C "$STAGE/app"
cp -a node_modules "$STAGE/app/node_modules"

RUNTIME_LOADER=''
copy_tool() {
  local name="$1" src lib loader loader_name
  src="$(command -v "$name")"
  test -x "$src"
  cp "$src" "$STAGE/runtime/tool-bin/$name"
  chmod 0755 "$STAGE/runtime/tool-bin/$name"

  loader="$(ldd "$src" | awk '/ld-linux|ld-musl/ {for (i=1; i<=NF; i++) if ($i ~ /^\//) {print $i; exit}}')"
  test -n "$loader"
  test -f "$loader"
  loader_name="$(basename "$loader")"
  if [[ -z "$RUNTIME_LOADER" ]]; then
    RUNTIME_LOADER="$loader_name"
  else
    test "$RUNTIME_LOADER" = "$loader_name"
  fi

  while IFS= read -r lib; do
    [[ -n "$lib" && -f "$lib" ]] || continue
    cp -L "$lib" "$STAGE/runtime/lib/$(basename "$lib")"
  done < <(ldd "$src" | awk '/=> \// {print $3} /^\// {print $1}')
  cp -L "$loader" "$STAGE/runtime/lib/$loader_name"
  chmod 0755 "$STAGE/runtime/lib/$loader_name"

  cat >"$STAGE/runtime/bin/$name" <<'WRAP'
#!/usr/bin/env bash
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOADER="$HERE/../lib/__LOADER__"
test -x "$LOADER"
exec "$LOADER" --library-path "$HERE/../lib" "$HERE/../tool-bin/__TOOL__" "$@"
WRAP
  sed -i "s/__TOOL__/$name/g; s/__LOADER__/$loader_name/g" "$STAGE/runtime/bin/$name"
  chmod 0755 "$STAGE/runtime/bin/$name"
}

# Node and every native helper use the same bundled ELF loader and the exact
# shared libraries captured on the tested runner. Guest VMs therefore do not
# depend on their patch-level glibc/libssl/libstdc++ state.
copy_tool node
copy_tool jq
copy_tool curl
copy_tool openssl
test -n "$RUNTIME_LOADER"
test -x "$STAGE/runtime/lib/$RUNTIME_LOADER"

# This repository intentionally has no committed npm lockfile today. Record the
# exact package.json plus the fully resolved dependency tree that is actually
# placed in the immutable bundle. The bundle SHA-256 remains the VM admission
# authority, so every host receives byte-identical runtime/dependencies.
npm ls --all --json >"$STAGE/dependency-tree.json"
node_version="$($STAGE/runtime/bin/node --version)"
package_json_sha="$(sha256sum package.json | awk '{print $1}')"
dependency_tree_sha="$(sha256sum "$STAGE/dependency-tree.json" | awk '{print $1}')"
python3 - "$STAGE/manifest.json" "$SOURCE_SHA" "$node_version" "$package_json_sha" "$dependency_tree_sha" "$RUNTIME_LOADER" <<'PY'
import json, sys
path, source, node_version, package_sha, dependency_sha, loader = sys.argv[1:]
with open(path, 'w', encoding='utf-8') as f:
    json.dump({
        'schema': 'truyn.class-d1000.runtime-bundle.v1',
        'sourceSha': source,
        'nodeVersion': node_version,
        'packageJsonSha256': package_sha,
        'dependencyTreeSha256': dependency_sha,
        'osCompatibility': 'ubuntu-22.04-amd64',
        'runtimeLoader': loader,
        'contents': ['tracked-source', 'node_modules', 'node', 'jq', 'curl', 'openssl', 'elf-loader', 'shared-libraries', 'dependency-tree']
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
test -f "$VERIFY/app/network/testnet/node-service.js"
test -d "$VERIFY/app/node_modules"
test -s "$VERIFY/dependency-tree.json"
python3 - "$VERIFY/manifest.json" "$SOURCE_SHA" <<'PY'
import json, os, sys
manifest = json.load(open(sys.argv[1], encoding='utf-8'))
assert manifest['schema'] == 'truyn.class-d1000.runtime-bundle.v1'
assert manifest['sourceSha'] == sys.argv[2]
assert manifest['packageJsonSha256']
assert manifest['dependencyTreeSha256']
assert manifest['runtimeLoader']
loader = os.path.join(os.path.dirname(sys.argv[1]), 'runtime', 'lib', manifest['runtimeLoader'])
assert os.path.isfile(loader) and os.access(loader, os.X_OK)
PY
echo "TRUYN_CLASS_D1000_RUNTIME_BUNDLE=PASS sourceSha=${SOURCE_SHA} sha256=$(awk '{print $1}' "$OUT.sha256") loader=${RUNTIME_LOADER}"
