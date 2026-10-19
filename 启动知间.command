#!/bin/zsh
set -eu
cd "$(dirname "$0")"
exec /bin/zsh scripts/run.sh
