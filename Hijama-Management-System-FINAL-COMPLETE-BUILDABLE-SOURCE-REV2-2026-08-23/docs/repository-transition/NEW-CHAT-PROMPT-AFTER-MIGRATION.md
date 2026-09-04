# Prompt to paste in the NEW chat (after the new repo exists)

Copy everything inside the box into the new Cursor chat **opened on the new production repository**.

---

```text
أنت على الريبو الإنتاجي الجديد (Production SoT) لمشروع تداوي / Hijama Management.

السياق:
- الريبو القديم Cupping-System-Management = أرشيف تطوير فقط
- النقل حصل قبل Production Candidate بقرار المالك؛ التجربة الحية A–E هتتم هنا
- لا تعلن Production Candidate ولا Ready for production بدون دليل Installed Setup EXE
- لا تضخّم الدرجات (baseline Overall 58) بدون مراجعة مستقلة جديدة بعد A–E

اقرأ أولاً:
- docs/integration-v2-5-10/OPERATOR-HANDOFF.md
- docs/integration-v2-5-10/OPERATOR-LIVE-UAT.md
- docs/integration-v2-5-10/CURRENT-STATUS.md
- docs/repository-transition/RELEASE-MIGRATION-PLAN.md

المطلوب بالترتيب:
1) تأكد أن الشجرة كاملة (package.json، electron، cloud، database، tests، workflows)
2) شغّل npm ci && npm test && npm run verify:v2-5-10-stage1
3) جهّز/أصلح CI لبناء Windows Setup EXE ونشره على GitHub Releases (قناة UAT) بدون الاعتماد على Actions Artifacts الكبيرة
4) اكتب في CURRENT-STATUS أن Source of Truth = هذا الريبو، والقديم = archive
5) بعد نجاح نشر الـ EXE، أعطني رابط الـ Release + SHA-256
6) جهّزني لسيناريوهات A→E (أنا هجرّب بنفسي على جهازين Windows)
7) بعد ما أسلّم الأدلة: validate-ae ثم Requirements ثم Production Candidate فقط من الدليل

ممنوع:
- نقل/mirror إضافي أو rewrite تاريخ بدون طلب
- حذف الريبو القديم
- إعلان PC أو scores ≥90 بدون A–E
```

---

## If the new repo is still empty

First create the empty GitHub repo as `7uzzam`, then either push with §4 of `RELEASE-MIGRATION-PLAN.md`, **or** paste this shorter bootstrap prompt:

```text
هذا ريبو إنتاجي فاضي. المصدر: https://github.com/7uzzam/Cupping-System-Management
الفرع البذرة: cursor/v2-5-10-quality-consolidation-c2ea

1) انقل شجرة الإنتاج النظيفة إلى main هنا (بدون tarballs مصدرية)
2) اتبع docs/repository-transition/RELEASE-MIGRATION-PLAN.md
3) بعد النقل نفّذ برومبت NEW-CHAT-PROMPT-AFTER-MIGRATION.md بالكامل
```
