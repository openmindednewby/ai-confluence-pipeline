#!/usr/bin/env bash
# Publish Katastasi to npm under BOTH names from a single build:
#   - katastasi              (unscoped, for reach: `npx katastasi`)
#   - @dloizides/katastasi   (scoped, on-brand alias)
# Both ship the identical tarball; only the package.json "name" differs at publish time.
# Idempotent: a name already published at this version is skipped, so re-running is safe.
#
# Credential-gated: requires `npm login` first. Usage:
#   bash scripts/publish-npm.sh            # publish both (skips what already exists)
#   bash scripts/publish-npm.sh --dry-run  # pack only, publish nothing
set -euo pipefail
cd "$(dirname "$0")/.."

DRY=""
[ "${1:-}" = "--dry-run" ] && DRY="--dry-run"

PKG="package.json"
BACKUP="$(mktemp)"
cp "$PKG" "$BACKUP"
restore() { cp "$BACKUP" "$PKG"; rm -f "$BACKUP"; }
trap restore EXIT

VERSION="$(node -p "require('./package.json').version")"

publish_as() {
  local name="$1"
  if npm view "${name}@${VERSION}" version >/dev/null 2>&1; then
    echo "==> skip ${name}@${VERSION} (already published)"
    return 0
  fi
  echo "==> Publishing ${name}@${VERSION}"
  npm pkg set name="$name" >/dev/null
  npm publish --access public $DRY
}

echo "==> Building"
npm run build >/dev/null

publish_as "katastasi"
publish_as "@dloizides/katastasi"

echo "==> Done."
