#!/bin/bash

set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd -P)"

for script in scripts/*.sh; do
  /bin/bash -n "$script"
done

for module in scripts/*.mjs; do
  /usr/bin/env node --check "$module"
done

for module in assets/*.mjs; do
  /usr/bin/env node --check "$module"
done

/usr/bin/env node --check assets/renderer-inject.js
