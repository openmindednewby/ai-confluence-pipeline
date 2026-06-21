#!/usr/bin/env bash
# Publish Katastasi to npm under BOTH names from a single build:
#   - katastasi              (unscoped, for reach: `npx katastasi`)
#   - @dloizides/katastasi   (scoped, on-brand alias)
# Both ship the identical tarball; only the package.json "name" differs at publish time.
#
# Credential-gated: requires `npm login` first. Usage:
#   bash scripts/publish-npm.sh            # publish both
#   bash scripts/publish-npm.sh --dry-run  # pack only, publish nothing
set -euo pipefail
cd "$(dirname "$0")/.."

DRY=""
[ "${1:-}" = "--dry-run" ] && DRY="--dry-run"

SCOPED="@dloizides/katastasi"
PRIMARY="katastasi"
PKG="package.json"
BACKUP="$(mktemp)"
cp "$PKG" "$BACKUP"
restore() { cp "$BACKUP" "$PKG"; rm -f "$BACKUP"; }
trap restore EXIT

echo "==> Building"
npm run build >/dev/null

echo "==> Publishing ${PRIMARY} (public)"
npm pkg set name="$PRIMARY" >/dev/null
npm publish --access public $DRY

echo "==> Publishing ${SCOPED} (public alias)"
npm pkg set name="$SCOPED" >/dev/null
npm publish --access public $DRY

echo "==> Done. Restored ${PKG} name to its committed value."
