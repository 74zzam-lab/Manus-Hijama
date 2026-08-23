#!/usr/bin/env bash
# Build a clean production seed archive from the current checkout tip.
# Does NOT create a GitHub repo and does NOT push.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
OUT_DIR="${1:-/tmp/tadawi-production-seed}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SHA="$(git rev-parse --short HEAD)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$OUT_DIR/tadawi-v2-5-10-seed-${SHA}-${STAMP}.tar.gz"

mkdir -p "$OUT_DIR"
rm -f "$ARCHIVE"

# Export tracked files only from HEAD (no untracked tarballs / comparison noise)
git archive --format=tar.gz --prefix="tadawi-production/" -o "$ARCHIVE" HEAD

cat > "$OUT_DIR/SEED-MANIFEST.txt" <<EOF
program: V2-5.10
sourceRepo: 7uzzam/Cupping-System-Management
branch: ${BRANCH}
commit: $(git rev-parse HEAD)
short: ${SHA}
archive: $(basename "$ARCHIVE")
sha256: $(sha256sum "$ARCHIVE" | awk '{print $1}')
createdAtUtc: ${STAMP}
note: Clean tracked tree only. UAT / PC still required. Old repo remains archive.
EOF

echo "Wrote $ARCHIVE"
echo "Manifest $OUT_DIR/SEED-MANIFEST.txt"
cat "$OUT_DIR/SEED-MANIFEST.txt"
