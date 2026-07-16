#!/bin/bash

set -euo pipefail

cd "$(dirname "$0")"

exec bash scripts/restart.sh "${1:-start}"
