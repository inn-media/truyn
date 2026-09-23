#!/usr/bin/env bash
# Shared release gate for registry publication workflows (Maven Central, NuGet.org).
#
# Usage: resolve-release-gates.sh <tag-prefix> <version-file-kind>
#   <tag-prefix>        e.g. sdk/maven/v  or  sdk/nuget/v
#   <version-file-kind> maven | nuget
#
# Requires: GH_TOKEN, GITHUB_REPOSITORY, GITHUB_REF (refs/tags/<prefix><version>), GITHUB_OUTPUT.
# Enforces the same contract as publish-npm.yml:
#   1. the tag matches <prefix><version> and <version> equals the package manifest version;
#   2. the tagged commit is exactly current origin/main;
#   3. ordinary CI (push, main) and hosted CodeQL succeeded on that exact SHA.
# Emits: version, source_sha, ci_run_id, codeql_run_id.
set -euo pipefail

prefix="${1:?tag prefix}"
kind="${2:?maven|nuget}"

tag="${GITHUB_REF#refs/tags/}"
case "$tag" in
  "$prefix"*) ;;
  *) echo "Unexpected release ref: $GITHUB_REF (expected ${prefix}*)" >&2; exit 1 ;;
esac
version="${tag#"$prefix"}"
test -n "$version"

case "$kind" in
  maven) declared="$(python3 -c 'import xml.etree.ElementTree as E;n={"m":"http://maven.apache.org/POM/4.0.0"};print(E.parse("sdk/java/pom.xml").getroot().find("m:version",n).text.strip())')" ;;
  nuget) declared="$(python3 -c 'import xml.etree.ElementTree as E;print(E.parse("sdk/dotnet/Truyn.Sdk.csproj").getroot().find("./PropertyGroup/Version").text.strip())')" ;;
  *) echo "unknown kind: $kind" >&2; exit 1 ;;
esac
if [[ "$declared" != "$version" ]]; then
  echo "Tag version $version does not match declared $kind version $declared" >&2
  exit 1
fi

source_sha="$(git rev-parse HEAD)"
git fetch --no-tags origin main:refs/remotes/origin/main
current_main="$(git rev-parse refs/remotes/origin/main)"
if [[ "$source_sha" != "$current_main" ]]; then
  echo "Tagged source $source_sha is not exact current main $current_main" >&2
  exit 1
fi
remote_tag="$(gh api "repos/$GITHUB_REPOSITORY/git/ref/tags/$tag" --jq '.object.sha')"
test "$remote_tag" = "$source_sha"

runs="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs?head_sha=$source_sha&status=completed&per_page=100")"
ci_run_id="$(jq -r --arg s "$source_sha" '[.workflow_runs[] | select(.path == ".github/workflows/ci.yml" and .event == "push" and .head_branch == "main" and .head_sha == $s and .conclusion == "success")] | first | .id // empty' <<<"$runs")"
codeql_run_id="$(jq -r --arg s "$source_sha" '[.workflow_runs[] | select(.path == "dynamic/github-code-scanning/codeql" and .head_sha == $s and .conclusion == "success")] | first | .id // empty' <<<"$runs")"
test -n "$ci_run_id" || { echo "No successful exact-main CI run for $source_sha" >&2; exit 1; }
test -n "$codeql_run_id" || { echo "No successful hosted CodeQL run for $source_sha" >&2; exit 1; }
codeql_jobs="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$codeql_run_id/jobs?per_page=100")"
test "$(jq '[.jobs[] | select(.conclusion != "success")] | length' <<<"$codeql_jobs")" = '0'
test "$(jq '.jobs | length' <<<"$codeql_jobs")" -gt 0

{
  echo "version=$version"
  echo "source_sha=$source_sha"
  echo "ci_run_id=$ci_run_id"
  echo "codeql_run_id=$codeql_run_id"
} >> "$GITHUB_OUTPUT"
