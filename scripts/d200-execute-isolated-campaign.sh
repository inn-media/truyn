#!/usr/bin/env bash
set -Eeuo pipefail

# Stable D-200 cloud execution entrypoint. The launcher supplies Azure/runtime
# environment, this script owns only the canonical source ordering.
source benchmarks/scale/class-d-azure-1000-provision.sh
source scripts/d200-stage-isolated-campaign.sh
