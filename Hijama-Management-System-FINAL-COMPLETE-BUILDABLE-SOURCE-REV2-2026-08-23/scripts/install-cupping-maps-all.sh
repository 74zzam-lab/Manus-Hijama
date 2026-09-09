#!/usr/bin/env bash
# تثبيت الخرائط الأربع دفعة واحدة وحذف أي صور أخرى
# ./scripts/install-cupping-maps-all.sh front.png back.png head.png limbs.png
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FRONT="${1:?front.png}"; BACK="${2:?back.png}"; HEAD="${3:?head.png}"; LIMBS="${4:?limbs.png}"
for f in "$FRONT" "$BACK" "$HEAD" "$LIMBS"; do
  [[ -f "$f" ]] || { echo "ملف غير موجود: $f" >&2; exit 1; }
done
"$(dirname "$0")/install-cupping-map.sh" front "$FRONT"
"$(dirname "$0")/install-cupping-map.sh" back "$BACK"
"$(dirname "$0")/install-cupping-map.sh" head "$HEAD"
"$(dirname "$0")/install-cupping-map.sh" limbs "$LIMBS"
echo "✅ الخرائط الأربع فقط موجودة في assets/cupping-maps/"
ls -la assets/cupping-maps/
