#!/usr/bin/env bash
set -Eeuo pipefail
# .NET 8 System.Net.Quic on Ubuntu needs native libmsquic (not bundled).
# Signed Microsoft apt metadata verifies the package. Never downgrade the test
# to an HTTP fallback or ignore QuicConnection.IsSupported.
test "$(uname -s)" = Linux
. /etc/os-release
test "$ID" = ubuntu
test "$VERSION_ID" = "24.04"
if ! ldconfig -p | grep -q 'libmsquic.so'; then
  curl --fail --silent --show-error --location \
    https://packages.microsoft.com/config/ubuntu/24.04/packages-microsoft-prod.deb \
    --output /tmp/truyn-packages-microsoft-prod.deb
  sudo dpkg -i /tmp/truyn-packages-microsoft-prod.deb
  sudo apt-get update -qq
  sudo apt-get install -y --no-install-recommends libmsquic=2.4.20
fi
ldconfig -p | grep libmsquic
