#!/usr/bin/env bash
# One-shot immutable SDK recovery. Source and package bytes remain exactly at frozen SHA.
set -Eeuo pipefail
prefix="$1"; kind="$2"
test "$GITHUB_REPOSITORY" = "inn-media/truyn"
test "$GITHUB_EVENT_NAME" = push
test "$GITHUB_REF" = "refs/heads/main"
test "$GITHUB_RUN_ATTEMPT" = 1
test "$GITHUB_ACTOR" != "github-actions[bot]"
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
request=.github/wire-freeze/recovery-request.json
test -s "$request"
frozen=57971b134a41c3e3ea4b42f68e86a7d117036006
ci=38154701595; codeql=38154701311
tag="${TRUYN_RELEASE_TAG:?}"
case "$kind" in
  npm) expected=sdk/npm/v0.1.0-alpha.5; version=0.1.0-alpha.5 ;;
  pypi) expected=sdk/python/v0.1.0a2; version=0.1.0a2 ;;
  maven) expected=sdk/maven/v0.1.0-alpha.2; version=0.1.0-alpha.2 ;;
  nuget) expected=sdk/nuget/v0.1.0-alpha.2; version=0.1.0-alpha.2 ;;
  *) exit 81 ;;
esac
test "$tag" = "$expected"
case "$tag" in "$prefix"*) ;; *) exit 82 ;; esac
jq -e --arg sha "$frozen" --arg tag "$tag" --arg ci "$ci" --arg codeql "$codeql" '
  .schema=="truyn.wire-freeze-registry-recovery/v1"
  and .task=="truyn1-immutable-successor-publication-20261011"
  and .mode=="one-shot-protected-main-push" and .attempt==1
  and .frozenSourceSha==$sha and (.ciRunId|tostring)==$ci and (.codeqlRunId|tostring)==$codeql
  and .controllerRunId==38154701575
  and .tags=={"npm":"sdk/npm/v0.1.0-alpha.5","pypi":"sdk/python/v0.1.0a2","go":"sdk/go/v0.1.0-alpha.2","maven":"sdk/maven/v0.1.0-alpha.2","nuget":"sdk/nuget/v0.1.0-alpha.2"}
  and (.tags|to_entries|map(.value)|index($tag))!=null
  and .cloudMutationAllowed==false and .managedCanaryAllowed==false and .mainnetAdmissionAllowed==false
' "$request" >/dev/null
git fetch --no-tags origin main:refs/remotes/origin/main
git merge-base --is-ancestor "$GITHUB_SHA" refs/remotes/origin/main || { echo RECOVERY_ABORT_UNMERGED_REQUEST; exit 83; }
git merge-base --is-ancestor "$frozen" "$GITHUB_SHA"
# Publisher steps must check out the exact frozen SHA after this preflight; mutable main is not a package source.
for imm in sdk/npm/v0.1.0-alpha.5 sdk/python/v0.1.0a2 sdk/go/v0.1.0-alpha.2 sdk/maven/v0.1.0-alpha.2 sdk/nuget/v0.1.0-alpha.2; do
  test "$(gh api "repos/$GITHUB_REPOSITORY/git/ref/tags/$imm" --jq .object.sha)" = "$frozen" || exit 84
done
for id in "$ci" "$codeql"; do
  data="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$id")"
  jq -e --arg s "$frozen" '.head_sha==$s and .status=="completed" and .conclusion=="success"' <<<"$data" >/dev/null
done
ci_jobs="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$ci/jobs?per_page=100")"
for job in mandatory-security-safety sdk-release integration network component regression full-qualification test; do
  jq -e --arg j "$job" '[.jobs[]|select(.name==$j and .conclusion=="success")]|length==1' <<<"$ci_jobs" >/dev/null
done
codeql_jobs="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$codeql/jobs?per_page=100")"
jq -e '.jobs|length==7 and all(.[];.conclusion=="success")' <<<"$codeql_jobs" >/dev/null
case "$kind" in
 npm) actual="$(git show "$frozen:sdk/typescript/package.json" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>console.log(JSON.parse(s).version))')" ;;
 pypi) actual="$(git show "$frozen:sdk/python/pyproject.toml" | python3 -c 'import sys,tomllib;print(tomllib.loads(sys.stdin.read())["project"]["version"])')" ;;
 maven) actual="$(git show "$frozen:sdk/java/pom.xml" | python3 -c 'import sys,xml.etree.ElementTree as E;n={"m":"http://maven.apache.org/POM/4.0.0"};print(E.fromstring(sys.stdin.read()).find("m:version",n).text.strip())')" ;;
 nuget) actual="$(git show "$frozen:sdk/dotnet/Truyn.Sdk.csproj" | python3 -c 'import sys,xml.etree.ElementTree as E;print(E.fromstring(sys.stdin.read()).find("./PropertyGroup/Version").text.strip())')" ;;
esac
test "$actual" = "$version" || exit 85
{ echo "version=$version"; echo "source_sha=$frozen"; echo "ci_run_id=$ci"; echo "codeql_run_id=$codeql"; echo "dist_tag=alpha"; } >> "$GITHUB_OUTPUT"
echo "TRUYN_IMMUTABLE_RECOVERY_ADMITTED=$kind:$tag@$frozen"
