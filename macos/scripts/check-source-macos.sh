#!/bin/bash

set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd -P)"

check_node_source() {
  if [ -n "${WEIXIN_SKIN_SOURCE_NODE:-}" ]; then
    "$WEIXIN_SKIN_SOURCE_NODE" --check "$1"
  else
    /usr/bin/env node --check "$1"
  fi
}

for script in scripts/*.sh; do
  /bin/bash -n "$script"
done

for launcher in *.command; do
  /bin/bash -n "$launcher"
done

for module in scripts/*.mjs; do
  check_node_source "$module"
done

for module in assets/*.mjs; do
  check_node_source "$module"
done

check_node_source assets/renderer-inject.js
