# Manual Runtime Validation Report

**Generated:** 2026-07-01T15:03:28.170Z
**Gate:** RC1 v1.2.0

| Passed | Failed | Warnings |
|--------|--------|----------|
| 43 | 0 | 0 |

- [PASS] setupWizardModal: معالج الإعداد الأولي
- [PASS] FirstRun.restartSetupWizard: تشغيل معالج الإعداد
- [PASS] FirstRun.restartProductTour: الجولة التعريفية
- [PASS] sys_setup_wizard: feature: setup wizard
- [PASS] sys_product_tour: feature: product tour
- [PASS] sys_readiness: feature: readiness card
- [PASS] sys_health_check: feature: health check
- [PASS] dash-readiness-card: بطاقة جاهزية النظام
- [PASS] set-panel-help: إعدادات المساعدة والجاهزية
- [PASS] evaluateReadiness: فحص جاهزية النظام API
- [PASS] renderHealthCheckUI: Health Check UI
- [PASS] WIZARD_STEPS: wizard steps defined
- [PASS] evaluateReadiness-runtime: 8/14 (57%)
- [PASS] health-checks-runtime: 14 checks
- [PASS] health-license-check: الترخيص سليم
- [PASS] health-integrity-check: البيانات مترابطة وسليمة
- [PASS] license-builder-generate: TDWI2-P03AA-CXU
- [PASS] license-activation: ok
- [PASS] activate-persist: L000001
- [PASS] license-renewal: ok
- [PASS] upgrade: 04
- [PASS] upgrade-key-valid: ok
- [PASS] downgrade: 02
- [PASS] suspend: blocks upgrade
- [PASS] resume: status restored
- [PASS] repair: bundle rebuilt
- [PASS] export-import: round-trip ok
- [PASS] backup-restore-delete-recover: ok
- [PASS] offline-activation: disk bundle
- [PASS] license-builder-ui: 6-step builder
- [PASS] upgrade-wizard-ui: 5-step wizard
- [PASS] shard-persist: L000001
- [PASS] bundle-persist: L000001
- [PASS] localStorage-roundtrip: ok
- [PASS] electron-read-bundle: ok
- [PASS] offline-validation: disk fallback
- [PASS] restart-consistency: state stable
- [PASS] license-console-clean: clean
- [PASS] import:license-env.js: loaded
- [PASS] import:license-v2-drawer.js: loaded
- [PASS] import:upgrade-wizard.js: loaded
- [PASS] import:package-builder.js: loaded
- [PASS] no-unhandled-imports: all license modules use script tags
