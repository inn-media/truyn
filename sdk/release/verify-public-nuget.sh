#!/usr/bin/env bash
set -Eeuo pipefail

cleanroom="$(mktemp -d)"
trap 'rm -rf "$cleanroom"' EXIT

cd "$cleanroom"
dotnet new console --framework net8.0 --force >/dev/null
dotnet add package Truyn.Sdk --version 0.1.0-alpha.1 --source https://api.nuget.org/v3/index.json >/dev/null
cat > Program.cs <<'CS'
using System;
using Truyn.Sdk;

var client = new TruynClient(new Uri("https://example.invalid/"));
if (client.GetType().FullName != "Truyn.Sdk.TruynClient")
    throw new InvalidOperationException("unexpected SDK class");
Console.WriteLine("truyn-nuget-cleanroom-ok");
CS

dotnet restore --force --source https://api.nuget.org/v3/index.json >/dev/null
dotnet build --no-restore >/dev/null
output="$(dotnet run --no-build)"
printf '%s\n' "$output" | grep -Fx 'truyn-nuget-cleanroom-ok'
dotnet list package | grep -E 'Truyn\.Sdk[[:space:]]+0\.1\.0-alpha\.1[[:space:]]+0\.1\.0-alpha\.1'
