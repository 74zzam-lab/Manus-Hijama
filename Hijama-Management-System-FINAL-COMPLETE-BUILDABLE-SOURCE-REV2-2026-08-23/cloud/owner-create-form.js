/**
 * V2-5.8 — Shared Owner create/confirm form (mandatory password).
 * Never logs password values.
 */
(function (global) {
  'use strict';

  const MIN_PASSWORD_LENGTH = 8;

  function validatePasswordPair(password, confirm) {
    const p = String(password || '');
    const c = String(confirm == null ? password : confirm);
    if (!p) return { ok: false, error: 'password_required', code: 'owner_password_required' };
    if (p.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, error: 'password_too_short', code: 'owner_password_weak', min: MIN_PASSWORD_LENGTH };
    }
    if (c !== p) return { ok: false, error: 'password_mismatch', code: 'owner_password_mismatch' };
    return { ok: true };
  }

  function validateCreateInput(input) {
    input = input || {};
    const fullName = String(input.fullName || input.name || '').trim();
    const email = String(input.email || '').trim();
    const username = String(input.username || email.split('@')[0] || '').trim().toLowerCase();
    const recoveryCode = String(input.recoveryCode || input.recoveryPin || '').trim();
    const orgAccepted = input.acceptOrganization === true || input.acceptOrganization === 'true' || input.acceptOrganization === 1;

    if (!fullName) return { ok: false, error: 'name_required' };
    if (!email || !/@/.test(email)) return { ok: false, error: 'email_required' };
    if (!username) return { ok: false, error: 'username_required' };
    if (!recoveryCode) return { ok: false, error: 'recovery_required' };
    if (!orgAccepted) return { ok: false, error: 'org_accept_required' };

    const pw = validatePasswordPair(input.password, input.passwordConfirm);
    if (!pw.ok) return pw;

    return {
      ok: true,
      value: {
        fullName,
        email,
        username,
        password: String(input.password),
        recoveryCode,
        acceptOrganization: true
      }
    };
  }

  function renderFormHtml(opts) {
    opts = opts || {};
    const idPrefix = opts.idPrefix || 'ocf';
    return `
<form id="${idPrefix}-form" class="tdw-form ocf-form" autocomplete="off" novalidate>
  <div class="form-group">
    <label for="${idPrefix}-name">الاسم الكامل</label>
    <input type="text" id="${idPrefix}-name" class="form-control" required autocomplete="name">
    <div class="tdw-field-error" id="${idPrefix}-name-err" hidden></div>
  </div>
  <div class="form-group">
    <label for="${idPrefix}-email">البريد الإلكتروني</label>
    <input type="email" id="${idPrefix}-email" class="form-control" required autocomplete="email" dir="ltr">
    <div class="tdw-field-error" id="${idPrefix}-email-err" hidden></div>
  </div>
  <div class="form-group">
    <label for="${idPrefix}-username">اسم المستخدم</label>
    <input type="text" id="${idPrefix}-username" class="form-control" required autocomplete="username" dir="ltr">
    <div class="tdw-field-error" id="${idPrefix}-username-err" hidden></div>
  </div>
  <div class="form-group">
    <label for="${idPrefix}-password">كلمة المرور (إلزامية — ${MIN_PASSWORD_LENGTH}+)</label>
    <div class="tdw-password-row">
      <input type="password" id="${idPrefix}-password" class="form-control" required minlength="${MIN_PASSWORD_LENGTH}" autocomplete="new-password">
      <button type="button" class="btn btn-ghost btn-sm tdw-toggle-pw" data-target="${idPrefix}-password" aria-label="إظهار كلمة المرور">إظهار</button>
    </div>
    <div class="tdw-field-error" id="${idPrefix}-password-err" hidden></div>
  </div>
  <div class="form-group">
    <label for="${idPrefix}-confirm">تأكيد كلمة المرور</label>
    <div class="tdw-password-row">
      <input type="password" id="${idPrefix}-confirm" class="form-control" required minlength="${MIN_PASSWORD_LENGTH}" autocomplete="new-password">
      <button type="button" class="btn btn-ghost btn-sm tdw-toggle-pw" data-target="${idPrefix}-confirm" aria-label="إظهار التأكيد">إظهار</button>
    </div>
    <div class="tdw-field-error" id="${idPrefix}-confirm-err" hidden></div>
  </div>
  <div class="form-group">
    <label for="${idPrefix}-recovery">وسيلة الاسترداد (رمز / PIN)</label>
    <input type="text" id="${idPrefix}-recovery" class="form-control" required autocomplete="off" dir="ltr">
    <div class="tdw-field-error" id="${idPrefix}-recovery-err" hidden></div>
  </div>
  <div class="form-group" style="display:flex;gap:8px;align-items:flex-start">
    <input type="checkbox" id="${idPrefix}-accept" style="width:auto;min-height:auto;margin-top:4px">
    <label for="${idPrefix}-accept" style="font-weight:600">أوافق على ربط حساب المالك بهذه المؤسسة</label>
  </div>
  <div class="tdw-field-error" id="${idPrefix}-form-err" hidden></div>
</form>`;
  }

  function bindPasswordToggles(root) {
    root = root || document;
    root.querySelectorAll('.tdw-toggle-pw').forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-target');
        const input = document.getElementById(id);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? 'إخفاء' : 'إظهار';
      });
    });
  }

  function readForm(idPrefix) {
    idPrefix = idPrefix || 'ocf';
    return {
      fullName: document.getElementById(`${idPrefix}-name`)?.value || '',
      email: document.getElementById(`${idPrefix}-email`)?.value || '',
      username: document.getElementById(`${idPrefix}-username`)?.value || '',
      password: document.getElementById(`${idPrefix}-password`)?.value || '',
      passwordConfirm: document.getElementById(`${idPrefix}-confirm`)?.value || '',
      recoveryCode: document.getElementById(`${idPrefix}-recovery`)?.value || '',
      acceptOrganization: !!document.getElementById(`${idPrefix}-accept`)?.checked
    };
  }

  function showFieldError(idPrefix, field, message) {
    const el = document.getElementById(`${idPrefix}-${field}-err`);
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  async function createOwnerFromForm(idPrefix) {
    idPrefix = idPrefix || 'ocf';
    ['name', 'email', 'username', 'password', 'confirm', 'recovery', 'form'].forEach((f) => showFieldError(idPrefix, f, ''));
    const raw = readForm(idPrefix);
    const validated = validateCreateInput(raw);
    if (!validated.ok) {
      const map = {
        name_required: ['name', 'الاسم مطلوب'],
        email_required: ['email', 'بريد إلكتروني صالح مطلوب'],
        username_required: ['username', 'اسم المستخدم مطلوب'],
        recovery_required: ['recovery', 'وسيلة الاسترداد مطلوبة'],
        org_accept_required: ['form', 'يجب الموافقة على ربط المالك بالمؤسسة'],
        password_required: ['password', 'كلمة المرور إلزامية'],
        password_too_short: ['password', `كلمة المرور ${MIN_PASSWORD_LENGTH} أحرف على الأقل`],
        password_mismatch: ['confirm', 'كلمتا المرور غير متطابقتين']
      };
      const row = map[validated.error] || ['form', validated.error || 'تعذّر التحقق'];
      showFieldError(idPrefix, row[0], row[1]);
      return { ok: false, error: validated.error, code: validated.code || validated.error };
    }

    if (global.OwnerProfile?.hasProfile?.()) {
      showFieldError(idPrefix, 'form', 'حساب المالك موجود مسبقاً');
      return { ok: false, error: 'profile_exists', code: 'owner_duplicate' };
    }

    const v = validated.value;

    // Electron first-owner authority is issued only by main after validation of a
    // signed cached license and one-time setup token. This form may not fall back
    // to deriving owner credentials or roles in the compromised renderer.
    if (global.cuppingElectron || global.tadawi) {
      showFieldError(idPrefix, 'form', 'استخدم رمز إعداد المنظمة لإنشاء المالك الأول.');
      return { ok: false, error: 'main_owner_provisioning_required' };
    }

    if (global.OwnerLifecycleAuthority) {
      const prior = global.OwnerLifecycleAuthority.findCommittedOwner?.(v);
      if (prior?.ok) return prior;
      if (global.OwnerLifecycleAuthority.isCreateBlocked?.()) {
        showFieldError(idPrefix, 'form', 'مسار استرداد — لا يمكن إنشاء مالك جديد');
        return { ok: false, error: 'owner_create_blocked', code: 'EXISTING_NO_CREATE' };
      }
    }

    if (global.OwnerManagement?.setupCommitOwner) {
      return global.OwnerManagement.setupCommitOwner({
        ...v,
        passwordConfirm: v.password,
        idPrefix,
      });
    }

    const res = await global.OwnerProfile.createProfile({
      username: v.username,
      password: v.password,
      recoveryCode: v.recoveryCode,
      email: v.email,
      fullName: v.fullName
    });
    if (!res?.ok) {
      const ue = global.ActivationErrors?.toUserError?.(res, res.error === 'profile_exists' ? 'owner_duplicate' : 'unknown');
      showFieldError(idPrefix, 'form', ue ? ue.title : (res.error || 'فشل الإنشاء'));
      return res;
    }

    // Ensure a login user with role owner exists (hashed via app helpers when available).
    try {
      const users = global.users || global.DB?.get?.('users', []) || [];
      let ownerUser = users.find((u) => u && String(u.username || '').toLowerCase() === v.username);
      const hash = typeof global.hashPW === 'function'
        ? await global.hashPW(v.password, v.username)
        : `pending:${Date.now()}`;
      if (!ownerUser) {
        ownerUser = {
          id: 'owner-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
          fullName: v.fullName,
          username: v.username,
          password: hash,
          role: 'owner',
          email: v.email,
          active: true,
          empNum: '',
          doctorId: ''
        };
        users.push(ownerUser);
      } else {
        ownerUser.role = 'owner';
        ownerUser.fullName = v.fullName;
        ownerUser.email = v.email;
        ownerUser.password = hash;
        ownerUser.active = true;
      }
      if (global.OwnerManagement?.bindOwnerToCurrentContext) {
        global.OwnerManagement.bindOwnerToCurrentContext(ownerUser);
      } else if (global.BranchScope?.applyDefaultScopeToUser) {
        global.BranchScope.applyDefaultScopeToUser(ownerUser);
      }
      global.users = users;
      global.DB?.set?.('users', users);
      try { global.OwnerMigration?.promoteUserToOwnerRole?.(v.username); } catch { /* empty */ }
      global.OwnerSetupState?.clearRequired?.();
    } catch (err) {
      return { ok: false, error: 'user_sync_failed', message: String(err && err.message || err) };
    }

    return { ok: true, username: v.username, email: v.email };
  }

  const api = {
    MIN_PASSWORD_LENGTH,
    validatePasswordPair,
    validateCreateInput,
    renderFormHtml,
    bindPasswordToggles,
    readForm,
    showFieldError,
    createOwnerFromForm
  };
  global.OwnerCreateForm = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
