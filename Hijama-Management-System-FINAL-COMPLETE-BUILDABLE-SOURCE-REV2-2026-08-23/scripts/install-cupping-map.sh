#!/usr/bin/env bash
# تثبيت صور خرائط الحجامة الأربع فقط — خام بدون معالجة
# استخدام فردي: ./scripts/install-cupping-map.sh front /path/to/front.png
# استخدام الكل:   ./scripts/install-cupping-maps-all.sh F B H L
set -euo pipefail
MAP="${1:?map id: front|back|head|limbs}"
SRC="${2:?path to PNG file}"
case "$MAP" in front|back|head|limbs) ;; *) echo "خريطة غير معروفة: $MAP" >&2; exit 1 ;; esac
[[ -f "$SRC" ]] || { echo "الملف غير موجود: $SRC" >&2; exit 1; }
file -b "$SRC" | rg -qi 'png' || { echo "يجب أن يكون الملف PNG" >&2; exit 1; }
DEST_DIR="assets/cupping-maps"
DEST="${DEST_DIR}/${MAP}.png"
mkdir -p "$DEST_DIR"
cp -- "$SRC" "$DEST"
# إبقاء الملفات الأربع فقط
for f in "$DEST_DIR"/*; do
  [[ -e "$f" ]] || continue
  base=$(basename "$f")
  case "$base" in front.png|back.png|head.png|limbs.png|.gitkeep) ;; *) rm -f "$f"; echo "🗑️ حذف صورة غير مسموحة: $base" ;; esac
done
echo "✅ تم نسخ $SRC → $DEST (خام بدون تعديل)"
