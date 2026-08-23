/**
 * مركز الحجامة — طباعة ملف العميل A4 (تصميم Lovable — صفحتان)
 */
(function (global) {
  'use strict';

  const TEAR_HEIGHT = '90mm';
  const FOLLOW_ROWS = 4;

  const DEFAULT_CLIENT_FILE_FIELDS = {
    fileNo: true, date: true, cups: true, price: true,
    name: true, patientId: true, nationality: true, age: true, phone: true, address: true, emergency: true,
    gender: true, pregnancy: true,
    bp: true, sugar: true, bloodThinners: true, chronic: true, temp: true, allergies: true,
    symptoms: true, prevCupping: true, purpose: true,
    hepatitisB: true, hepatitisC: true, heartDisease: true, hiv: true, anemia: true, kidneyDisease: true,
    infectiousDiseases: true, consent: true, specialist: true,
    followTable: true, precautions: true, maps: true
  };

  const POST_CUPPING_PRECAUTIONS = [
    { ar: 'الإكثار من شرب الماء والسوائل الدافئة.', en: 'Drink plenty of water and warm fluids.' },
    { ar: 'تجنب التعرض لأشعة الشمس المباشرة والحرارة العالية.', en: 'Avoid direct sun exposure and high heat.' },
    { ar: 'تجنب المجهود البدني الشديد لمدة 24 ساعة.', en: 'Avoid strenuous activity for 24 hours.' },
    { ar: 'تجنب الاستحمام بالماء الساخن لمدة 24 ساعة.', en: 'Avoid hot showers or baths for 24 hours.' },
    { ar: 'تناول غذاء صحي خفيف وتجنب الأطعمة الدسمة.', en: 'Eat light, healthy meals; avoid heavy or fatty food.' },
    { ar: 'النوم المبكر وأخذ قسط كافٍ من الراحة.', en: 'Get adequate rest and sleep early.' },
    { ar: 'عند الشعور بدوخة أو تعب شديد، استرح وأخبر الأخصائي.', en: 'If dizzy or very tired, rest and inform your specialist.' }
  ];

  function getAppSettings() {
    if (global.settings) return global.settings;
    return global.DB?.get('settings', {}) || {};
  }
  function getAppBookings() {
    return global.bookings || global.DB?.get('bookings', []) || [];
  }
  function getAppNextSessions() {
    return global.nextSessions || global.DB?.get('nextSessions', []) || [];
  }
  function getClientFileFieldSettings(settings) {
    settings = settings || getAppSettings();
    const fields = { ...DEFAULT_CLIENT_FILE_FIELDS, ...(settings.clientFileFields || {}) };
    if (fields.infectiousDiseases === undefined) {
      fields.infectiousDiseases = fields.hepatitisB !== false || fields.hepatitisC !== false || fields.hiv !== false;
    }
    return fields;
  }
  function fieldOn(key, fields) {
    return fields[key] !== false;
  }
  function asSet(v) {
    if (v instanceof Set) return v;
    return new Set(Array.isArray(v) ? v : []);
  }
  function attrSrc(s) {
    return String(s == null ? '' : s).replace(/"/g, '&quot;');
  }
  function resolveAssetUrl(src) {
    if (typeof global.resolveAssetUrl === 'function') return global.resolveAssetUrl(src);
    if (!src) return '';
    if (/^(data:|https?:|blob:|file:)/i.test(src)) return src;
    try {
      const base = (typeof global.location !== 'undefined' && global.location.href)
        ? global.location.href
        : 'file:///';
      return new URL(src, base).href;
    } catch {
      return src;
    }
  }
  function getAppBaseHref() {
    try {
      const href = global.location?.href || '';
      if (!href || href === 'about:blank') return '';
      return href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    } catch {
      return '';
    }
  }
  function normPhone(s) {
    return String(s || '').replace(/\D/g, '');
  }
  function isBlankish(v) {
    return v == null || v === '' || v === '—' || v === '-';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function val(v, blank) { return blank ? '' : (v == null || v === '' ? '' : v); }
  function displayVal(v, blank) {
    if (blank) return '';
    if (v == null || v === '') return '';
    return String(v);
  }
  function cell(v, blank) {
    const t = displayVal(v, blank);
    return t === '' ? '&nbsp;' : esc(t);
  }
  function box(v, blank) {
    const t = displayVal(v, blank);
    return `<div class="box${t ? ' filled' : ''}">${blank ? '' : esc(t)}</div>`;
  }
  function input(v, blank) {
    const t = displayVal(v, blank);
    return `<span class="input${t ? ' filled' : ''}">${blank ? '' : esc(t)}</span>`;
  }
  function money(v, blank) {
    if (blank || v === '' || v == null || Number.isNaN(Number(v))) return '';
    const n = Number(v);
    return esc(global.fmtMoney ? global.fmtMoney(n) : n.toFixed(2));
  }
  function chk(checked, blank) {
    return `<span class="chk${!blank && checked ? ' on' : ''}"></span>`;
  }
  /** Empty/null medical yes-no defaults to «لا» on print (لا يوجد مرض). */
  function yesNoState(v, blank) {
    if (blank) return { yes: false, no: false };
    return { yes: v === true, no: v !== true };
  }
  function buildYesNoField(label, en, v, blank, f, key) {
    if (!fieldOn(key, f)) return '';
    const st = yesNoState(v, blank);
    return `<div class="field">
      <label>${label}<span class="en">${en}</span></label>
      <div class="chk-group compact">
        <span>${chk(st.yes, blank)}نعم / Yes</span>
        <span>${chk(st.no, blank)}لا / No</span>
      </div>
    </div>`;
  }
  function buildInfectiousDiseasesBlock(d, b, f) {
    if (!fieldOn('infectiousDiseases', f)) return '';
    const hbv = yesNoState(d.hepatitisB, b);
    const hcv = yesNoState(d.hepatitisC, b);
    const hivSt = yesNoState(d.hiv, b);
    const none = b ? false : !(d.hepatitisB === true || d.hepatitisC === true || d.hiv === true);
    return `<div class="infectious-block field-full">
      <div class="infectious-title"><span class="ar">الأمراض المعدية</span><span class="en">Infectious Diseases</span></div>
      <div class="infectious-grid">
        <span class="inf-item">${chk(hbv.yes, b)}Hepatitis B (HBV)</span>
        <span class="inf-item">${chk(hcv.yes, b)}Hepatitis C (HCV)</span>
        <span class="inf-item">${chk(hivSt.yes, b)}HIV</span>
        <span class="inf-item">${chk(none, b)}لا يوجد</span>
      </div>
    </div>`;
  }
  const CONSENT_AR = 'أقر بأني أتيت لعمل الحجامة برغبتي الشخصية و أتحمل كامل النتائج المترتبة علي قراري هذا كما أقر بصحة المعلومات أعلاه و علي ذلك أوقع.';
  function isMale(g) { return g === 'ذكر' || String(g).toLowerCase() === 'm'; }
  function isFemale(g) { return g === 'أنثى' || String(g).toLowerCase() === 'f' || String(g).includes('أنث'); }

  function renderMap(mapId, opts) {
    if (typeof global.renderImageMap === 'function') return global.renderImageMap(mapId, opts);
    return '';
  }

  function calcSessionTotal(cups, cupPrice) {
    if (cups === '' || cups == null) return '';
    const c = Number(cups);
    if (Number.isNaN(c)) return '';
    if (typeof global.getDiscountCalc === 'function') {
      const d = global.getDiscountCalc(c);
      if (d && d.total != null && !Number.isNaN(d.total)) return d.total;
    }
    const p = Number(cupPrice);
    return c * (Number.isNaN(p) ? 0 : p);
  }

  function getRegistry() {
    return global.clientsRegistry || global.DB?.get('clientsRegistry', []) || [];
  }

  function collectClientFileOpts(prefix) {
    prefix = prefix || 'f';
    const isForm = prefix === 'f';
    const nameEl = document.getElementById(isForm ? 'f-name' : 'ce-name');
    const phoneEl = document.getElementById(isForm ? 'f-phone' : 'ce-phone');
    const name = nameEl?.value.trim() || '';
    const phone = phoneEl?.value.trim() || '';
    const profile = typeof global.readClientProfileForm === 'function'
      ? global.readClientProfileForm(prefix)
      : {};
    const doc = isForm && typeof global.getSelectedDoctor === 'function'
      ? global.getSelectedDoctor('f')
      : null;
    let cups = '';
    let sessionTotal = '';
    let cupPrice = '';
    if (isForm) {
      const cupsEl = document.getElementById('f-cups');
      const cupsRaw = typeof global.getFormCupsTotal === 'function'
        ? global.getFormCupsTotal()
        : parseFloat(cupsEl?.value);
      if (cupsEl?.value !== '' && cupsEl?.value != null) cups = cupsRaw;
      const calc = cups !== '' && typeof global.getDiscountCalc === 'function'
        ? global.getDiscountCalc(cups) : null;
      const manualTotal = typeof global.getManualTotal === 'function' ? global.getManualTotal() : null;
      sessionTotal = manualTotal != null ? manualTotal : (calc?.total ?? '');
      cupPrice = calc?.unitPrice ?? getAppSettings().cupPrice ?? '';
    }
    const fileEl = document.getElementById(isForm ? 'f-file-no' : 'ce-file-no');
    const rawFileNo = (fileEl?.value || '').replace('— جديد —', '').replace(/^—$/, '').trim();
    const lookupKey = typeof global.getClientLookupKey === 'function'
      ? global.getClientLookupKey(phone, name)
      : (phone || name);
    let reg = typeof global.findClientInRegistry === 'function'
      ? global.findClientInRegistry(lookupKey)
      : null;
    if (!reg && rawFileNo && typeof global.findClientByFileNo === 'function') {
      reg = global.findClientByFileNo(rawFileNo);
    }
    if (!reg && typeof global.resolveClientForFile === 'function') {
      reg = global.resolveClientForFile(lookupKey, { phone, name, fileNo: rawFileNo }).reg;
    }
    return {
      name: name || reg?.name || '',
      phone: phone || reg?.phone || '',
      fileNo: rawFileNo || reg?.fileNo || '',
      patientId: document.getElementById(isForm ? 'f-id' : 'ce-id')?.value.trim() || reg?.patientId || '',
      nationality: document.getElementById(isForm ? 'f-nationality' : 'ce-nationality')?.value || reg?.nationality || '',
      cups,
      sessionTotal,
      cupPrice,
      doctorName: doc?.name || '',
      profile: { ...(reg?.fileProfile || {}), ...profile }
    };
  }

  function getClientBookings(phone, name) {
    const p = normPhone(phone);
    return getAppBookings()
      .filter(b => {
        if (['cancelled', 'absent'].includes(b.status)) return false;
        if (p && normPhone(b.phone) === p) return true;
        if (name && b.name && b.name.trim() === name.trim()) return true;
        return false;
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
  }

  function getClientNextSessions(sessionKey, clientKey) {
    const keys = new Set([sessionKey, clientKey].filter(Boolean));
    return getAppNextSessions()
      .filter(s => keys.has(s.clientKey))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }

  function resolveAttendance(dateStr, ctx, isCurrentSession) {
    if (!dateStr) return '';
    if (isCurrentSession) return 'حضور';
    const casesOnDate = (ctx.clientCases || []).filter(c => c.date === dateStr);
    if (casesOnDate.length) return 'حضور';
    const p = normPhone(ctx.phone);
    const bookings = getAppBookings().filter(b => {
      if (b.date !== dateStr) return false;
      if (p && normPhone(b.phone) === p) return true;
      if (ctx.name && b.name && b.name.trim() === ctx.name.trim()) return true;
      return false;
    });
    if (bookings.some(b => b.status === 'noshow' || b.status === 'absent')) return 'غياب';
    const today = ctx.dateStr || new Date().toISOString().slice(0, 10);
    if (dateStr < today && bookings.length) return 'غياب';
    return '';
  }

  function buildFollowRows(opts, ctx) {
    if (opts.blank) {
      return Array.from({ length: FOLLOW_ROWS }, (_, i) => ({
        seq: i + 1, date: '', specialist: '', attendance: ''
      }));
    }

    const today = ctx.dateStr || new Date().toISOString().slice(0, 10);
    const rows = [];
    const upcoming = [];

    getClientBookings(ctx.phone, ctx.name).forEach(b => {
      if ((b.date || '') >= today) {
        upcoming.push({
          date: b.date || '',
          specialist: isBlankish(b.doctorName) ? '' : b.doctorName
        });
      }
    });
    getClientNextSessions(ctx.sessionKey, ctx.clientKey).forEach(s => {
      if ((s.date || '') >= today) upcoming.push({ date: s.date || '', specialist: '' });
    });
    upcoming.sort((a, b) => a.date.localeCompare(b.date));
    const seen = new Set();
    const deduped = upcoming.filter(u => {
      const k = u.date + '|' + u.specialist;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    rows.push({
      seq: 1,
      date: opts.currentSession?.date || today,
      specialist: opts.currentSession?.specialist || ctx.doctorName || '',
      attendance: resolveAttendance(opts.currentSession?.date || today, ctx, true)
    });

    deduped.forEach(u => {
      if (rows.length >= FOLLOW_ROWS) return;
      rows.push({
        seq: rows.length + 1,
        date: u.date,
        specialist: u.specialist,
        attendance: resolveAttendance(u.date, ctx, false)
      });
    });

    while (rows.length < FOLLOW_ROWS) {
      rows.push({ seq: rows.length + 1, date: '', specialist: '', attendance: '' });
    }
    return rows.slice(0, FOLLOW_ROWS);
  }

  function mergeProfile(reg, opts) {
    const live = opts?.profile || {};
    const saved = reg?.fileProfile || {};
    return { ...saved, ...live };
  }

  function getMapPointSets(profile, reg) {
    const session = asSet(profile.usedPoints || []);
    const savedRaw = asSet(reg?.fileProfile?.usedPoints || profile.savedPoints || []);
    const saved = new Set([...savedRaw].filter(k => !session.has(k)));
    return { session, saved };
  }

  function getClientFileData(clientKey, opts) {
    opts = opts || {};
    const blank = !!opts.blank;
    const settings = getAppSettings();
    const fields = getClientFileFieldSettings(settings);
    const resolved = typeof global.resolveClientForFile === 'function'
      ? global.resolveClientForFile(clientKey, opts)
      : { reg: null, clientCases: [], phone: opts.phone || '', name: opts.name || '', sessionKey: clientKey };
    const { reg, clientCases, phone, name, sessionKey } = resolved;
    const sample = clientCases.length ? clientCases[clientCases.length - 1] : null;
    const profile = blank ? {} : mergeProfile(reg, opts);
    const live = opts || {};
    const today = new Date();
    const dateStr = blank ? '' : (live.date || sample?.date || today.toISOString().slice(0, 10));

    let cups = blank ? '' : live.cups;
    if (!blank && (cups === undefined || cups === null || cups === '')) cups = sample?.cups ?? '';
    if (!blank && cups !== '' && cups != null && !Number.isNaN(Number(cups))) cups = Number(cups);

    const cupPrice = blank ? '' : (live.cupPrice != null ? live.cupPrice : (settings.cupPrice || 50));
    let totalPrice = blank ? '' : live.sessionTotal;
    if (!blank && (totalPrice === undefined || totalPrice === null || totalPrice === '')) {
      totalPrice = calcSessionTotal(cups, cupPrice);
    }
    if (!blank && (totalPrice === '' || totalPrice == null) && sample?.total != null) {
      totalPrice = sample.total;
    }

    const doctorName = blank ? '' : (live.doctorName || sample?.doctorName || '');
    const clientPhone = live.phone || phone || reg?.phone || sample?.phone || '';
    const clientName = live.name || name || reg?.name || sample?.name || '';
    const followRows = buildFollowRows(opts, {
      dateStr,
      doctorName,
      phone: clientPhone,
      name: clientName,
      sessionKey,
      clientKey,
      clientCases
    });
    const mapPoints = blank ? { session: new Set(), saved: new Set() } : getMapPointSets(profile, reg);
    const gender = profile.gender || opts.gender || '';
    return {
      blank,
      fields,
      centerName: settings.centerName || 'مركز الحجامة للحجامة',
      centerNameEn: settings.centerNameEn || 'Cupping Center',
      logo: global.getCenterBrandLogo?.() || settings.brandLogo || 'branding/Center-Logo.png',
      centerAddress: settings.address || '',
      centerPhone: settings.centerPhone || settings.phone || '',
      waNum: (settings.waNumber || settings.phone || '').replace(/\D/g, ''),
      siteUrl: settings.siteUrl || '',
      fileNo: blank ? '' : (live.fileNo || (reg && reg.fileNo) || sample?.fileNo || ''),
      date: dateStr,
      name: clientName,
      patientId: blank ? '' : (live.patientId || reg?.patientId || sample?.patientId || ''),
      gender,
      age: profile.age || live.age || '',
      nationality: blank ? '' : (live.nationality || reg?.nationality || sample?.nationality || ''),
      phone: clientPhone,
      address: profile.address || '',
      emergencyContact: profile.emergencyContact || '',
      purpose: profile.purpose || '',
      bloodThinners: blank ? null : profile.bloodThinners,
      prevCupping: blank ? null : profile.prevCupping,
      chronicConditions: profile.chronicConditions || '',
      tempConditions: profile.tempConditions || '',
      allergies: profile.allergies || '',
      symptoms: profile.symptoms || '',
      bloodPressure: profile.bloodPressure || '',
      bloodSugar: profile.bloodSugar || '',
      pregnancy: blank ? null : profile.pregnancy,
      hepatitisB: blank ? null : profile.hepatitisB,
      hepatitisC: blank ? null : profile.hepatitisC,
      heartDisease: blank ? null : profile.heartDisease,
      hiv: blank ? null : profile.hiv,
      anemia: blank ? null : profile.anemia,
      kidneyDisease: blank ? null : profile.kidneyDisease,
      cups: cups === 0 ? 0 : cups,
      totalPrice,
      doctorName,
      followRows,
      mapPoints,
      isFemale: isFemale(gender)
    };
  }

  function buildFollowTable(rows, blank) {
    const body = (rows || []).slice(0, FOLLOW_ROWS).map((r, i) => `<tr>
      <td class="c-num">${blank ? (i + 1) : esc(r.seq || (i + 1))}</td>
      <td class="c-date" dir="ltr">${cell(r.date, blank)}</td>
      <td class="c-spec">${cell(r.specialist, blank)}</td>
      <td class="c-att">${cell(r.attendance, blank)}</td>
    </tr>`).join('');
    return `<table class="followup">
      <thead><tr>
        <th>تسلسل<span class="en">No</span></th>
        <th>تاريخ الجلسة<span class="en">Date</span></th>
        <th>الأخصائي<span class="en">Specialist</span></th>
        <th>الحضور<span class="en">Attend.</span></th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  }

  function mapRenderOpts(d, which) {
    return {
      hideLabels: false,
      pointDots: false,
      showLabels: true,
      sessionPoints: d.mapPoints?.session,
      savedPoints: d.mapPoints?.saved,
      mini: which === 'mini'
    };
  }

  const MAP_PRINT_OPTS = { mini: false, legend: false, showLabels: false, quiet: true };

  function buildFullMapsArea(d) {
    if (typeof global.renderClientFileMapHtml === 'function') {
      return `<div class="maps-full client-file-maps">${global.renderClientFileMapHtml('full', mapRenderOpts(d, 'full'))}</div>`;
    }
    const layout = typeof global.getCuppingTemplateLayout === 'function'
      ? global.getCuppingTemplateLayout().full
      : null;
    if (layout?.mode === 'free' && layout.layers && typeof global.renderFreeformPrintHtml === 'function') {
      return `<div class="maps-full client-file-maps">${global.renderFreeformPrintHtml('full', false, null, mapRenderOpts(d, 'full'))}</div>`;
    }
    const maps = typeof global.getCuppingPrintMaps === 'function'
      ? global.getCuppingPrintMaps('full')
      : ['front', 'back', 'head', 'limbs'].map(id => ({ id }));
    const cells = maps.map(({ id }) => `<div class="map-cell">
        ${renderMap(id, { ...MAP_PRINT_OPTS, ...mapRenderOpts(d, 'full') })}
      </div>`).join('');
    return `<div class="maps-grid client-file-maps">${cells}</div>`;
  }

  function buildMiniMapArea(d) {
    if (typeof global.renderClientFileMapHtml === 'function') {
      return `<div class="maps-mini-wrap client-file-maps">${global.renderClientFileMapHtml('mini', mapRenderOpts(d, 'mini'))}</div>`;
    }
    const layout = typeof global.getCuppingTemplateLayout === 'function'
      ? global.getCuppingTemplateLayout().mini
      : null;
    if (layout?.mode === 'free' && layout.layers && typeof global.renderFreeformPrintHtml === 'function') {
      return global.renderFreeformPrintHtml('mini', true, null, mapRenderOpts(d, 'mini'));
    }
    const maps = typeof global.getCuppingPrintMaps === 'function'
      ? global.getCuppingPrintMaps('mini')
      : ['head', 'limbs', 'front', 'back'].map(id => ({ id }));
    return maps.map(({ id }) => renderMap(id, { mini: true, legend: false, showLabels: false, quiet: true, ...mapRenderOpts(d, 'mini') })).join('');
  }

  function buildLogo(d) {
    if (d.logo) return `<div class="logo-box has-logo"><img src="${attrSrc(resolveAssetUrl(d.logo))}" alt=""></div>`;
    return '<div class="logo-box logo-empty"></div>';
  }

  function buildQrBlock(label, en, url, blank) {
    if (blank || !url) {
      return `<div class="foot-col"><div class="qr qr-ph">QR</div><div class="lbl">${esc(label)}</div><div class="en">${esc(en)}</div></div>`;
    }
    let src = '';
    if (typeof globalThis.CuppingQr !== 'undefined' && globalThis.CuppingQr.makeDataUrl) {
      src = globalThis.CuppingQr.makeDataUrl(url, { size: 128, ecc: 'M', marginModules: 2 }) || '';
    } else if (typeof window !== 'undefined' && window.CuppingQr && window.CuppingQr.makeDataUrl) {
      src = window.CuppingQr.makeDataUrl(url, { size: 128, ecc: 'M', marginModules: 2 }) || '';
    }
    if (!src) {
      return `<div class="foot-col"><div class="qr qr-ph">QR</div><div class="lbl">${esc(label)}</div><div class="en">${esc(en)}</div></div>`;
    }
    return `<div class="foot-col">
      <div class="qr"><img src="${src}" width="64" height="64" alt=""></div>
      <div class="lbl">${esc(label)}</div>
      <div class="en">${esc(en)}</div>
    </div>`;
  }

  function buildClientFileSheetHtml(d) {
    const b = !!d.blank;
    const f = d.fields || DEFAULT_CLIENT_FILE_FIELDS;
    const precautions = POST_CUPPING_PRECAUTIONS.map(t =>
      `<li><span class="prec-ar">${esc(t.ar)}</span><span class="prec-en">${esc(t.en)}</span></li>`
    ).join('');
    const waUrl = d.waNum ? `https://wa.me/${d.waNum}` : '';
    const specName = b ? '' : esc(val(d.doctorName, b));

    const page1 = `
    <div class="page">
      <div class="page-body">
        <header class="header">
          <div class="meta">
            ${fieldOn('fileNo', f) ? `<div class="row"><div class="lbl">رقم الملف<span class="en">FILE</span></div>${box(d.fileNo, b)}</div>` : ''}
            ${fieldOn('date', f) ? `<div class="row"><div class="lbl">التاريخ<span class="en">DATE</span></div>${box(d.date, b)}</div>` : ''}
          </div>
          <div class="brand">
            ${buildLogo(d)}
            <h1>${esc(d.centerName)}</h1>
            <div class="en brand-en-name">${esc(d.centerNameEn)}</div>
          </div>
          <div class="session-meta">
            ${fieldOn('cups', f) ? `<div class="price-row"><div class="lbl">عدد الكاسات<span class="en">CUPS</span></div>${box(d.cups, b)}</div>` : ''}
            ${fieldOn('price', f) ? `<div class="price-row"><div class="lbl">السعر<span class="en">PRICE</span></div><div class="box filled">${money(d.totalPrice, b)}</div></div>` : ''}
          </div>
        </header>

        <section class="sec">
          <div class="sec-head">
            <div class="sec-num">1</div>
            <div class="sec-title"><span class="ar">بيانات العميل</span><span class="en">Patient Information</span></div>
            <div class="sec-rule"></div>
          </div>
          <div class="card tinted">
            <div class="grid-med">
              ${fieldOn('name', f) ? `<div class="field"><label>الاسم<span class="en">Full Name</span></label>${input(d.name, b)}</div>` : ''}
              ${fieldOn('patientId', f) ? `<div class="field"><label>رقم الهوية<span class="en">ID No.</span></label>${input(d.patientId, b)}</div>` : ''}
              ${fieldOn('nationality', f) ? `<div class="field"><label>الجنسية<span class="en">Nationality</span></label>${input(d.nationality, b)}</div>` : ''}
              ${fieldOn('age', f) ? `<div class="field"><label>العمر<span class="en">Age</span></label>${input(d.age, b)}</div>` : ''}
              ${fieldOn('gender', f) ? `<div class="field">
                <label>الجنس<span class="en">Gender</span></label>
                <div class="chk-group compact">
                  <span>${chk(!b && isMale(d.gender), b)}ذكر / M</span>
                  <span>${chk(!b && isFemale(d.gender), b)}أنثى / F</span>
                </div>
              </div>` : ''}
              ${fieldOn('phone', f) ? `<div class="field"><label>رقم الجوال<span class="en">Mobile</span></label>${input(d.phone, b)}</div>` : ''}
              ${fieldOn('address', f) ? `<div class="field field-full"><label>العنوان<span class="en">Address</span></label>${input(d.address, b)}</div>` : ''}
              ${fieldOn('emergency', f) ? `<div class="field"><label>جهة طوارئ<span class="en">Emergency</span></label>${input(d.emergencyContact, b)}</div>` : ''}
              ${(b || d.isFemale) && fieldOn('pregnancy', f) ? `<div class="field">
                <label>الحمل<span class="en">Pregnancy</span></label>
                <div class="chk-group compact">
                  <span>${chk(yesNoState(d.pregnancy, b).yes, b)}نعم / Yes</span>
                  <span>${chk(yesNoState(d.pregnancy, b).no, b)}لا / No</span>
                </div>
              </div>` : ''}
            </div>
          </div>
        </section>

        <section class="sec sec-med">
          <div class="sec-head">
            <div class="sec-num alt">2</div>
            <div class="sec-title"><span class="ar alt">التقييم الطبي</span><span class="en">Medical Assessment</span></div>
            <div class="sec-rule alt"></div>
          </div>
          <div class="card alt">
            <div class="grid-med">
              ${fieldOn('bp', f) ? `<div class="field"><label>ضغط الدم<span class="en">BP</span></label>${input(d.bloodPressure, b)}</div>` : ''}
              ${fieldOn('sugar', f) ? `<div class="field"><label>السكر<span class="en">Glucose</span></label>${input(d.bloodSugar, b)}</div>` : ''}
              ${buildInfectiousDiseasesBlock(d, b, f)}
              ${buildYesNoField('أمراض قلبية', 'Heart', d.heartDisease, b, f, 'heartDisease')}
              ${buildYesNoField('أمراض كلية', 'Kidney', d.kidneyDisease, b, f, 'kidneyDisease')}
              ${buildYesNoField('أنيميا', 'Anemia', d.anemia, b, f, 'anemia')}
              ${fieldOn('bloodThinners', f) ? `<div class="field">
                <label>سيولة الدم<span class="en">Anticoag.</span></label>
                <div class="chk-group compact">
                  <span>${chk(yesNoState(d.bloodThinners, b).yes, b)}نعم</span>
                  <span>${chk(yesNoState(d.bloodThinners, b).no, b)}لا</span>
                </div>
              </div>` : ''}
              ${fieldOn('chronic', f) ? `<div class="field field-full"><label>أمراض مزمنة<span class="en">Chronic</span></label>${input(d.chronicConditions, b)}</div>` : ''}
              ${fieldOn('temp', f) ? `<div class="field field-full"><label>أمراض مؤقتة<span class="en">Acute</span></label>${input(d.tempConditions, b)}</div>` : ''}
              ${fieldOn('allergies', f) ? `<div class="field field-full"><label>حساسية<span class="en">Allergies</span></label>${input(d.allergies, b)}</div>` : ''}
              ${fieldOn('symptoms', f) ? `<div class="field field-full"><label>الأعراض الحالية<span class="en">Symptoms</span></label>${input(d.symptoms, b)}</div>` : ''}
              ${fieldOn('prevCupping', f) ? `<div class="field">
                <label>حجامة سابقة<span class="en">Prior</span></label>
                <div class="chk-group compact">
                  <span>${chk(yesNoState(d.prevCupping, b).yes, b)}نعم / Yes</span>
                  <span>${chk(yesNoState(d.prevCupping, b).no, b)}لا / No</span>
                </div>
              </div>` : ''}
              ${fieldOn('purpose', f) ? `<div class="field">
                <label>غرض الحجامة<span class="en">Purpose</span></label>
                <div class="chk-group compact">
                  <span>${chk(!b && d.purpose === 'وقائية', b)}وقائية</span>
                  <span>${chk(!b && d.purpose === 'علاجية', b)}علاجية</span>
                </div>
              </div>` : ''}
            </div>
          </div>
        </section>

        ${fieldOn('consent', f) || fieldOn('specialist', f) ? `<section class="consent-block">
          ${fieldOn('consent', f) ? `<p class="consent-text">${CONSENT_AR}</p>` : ''}
          ${fieldOn('specialist', f) ? `<div class="sig-row">
            <div class="sig">
              <div class="line sig-name">${specName}</div>
              <div class="lbl">الأخصائي</div>
              <div class="en">SPECIALIST</div>
            </div>
            <div class="sig">
              <div class="line"></div>
              <div class="lbl">توقيع العميل</div>
              <div class="en">PATIENT SIGNATURE</div>
            </div>
          </div>` : ''}
        </section>` : ''}
      </div>

      <div class="tear-off">
        <div class="cut-line"></div>
        <div class="tear-inner">
          <div class="tear-content">
            <div class="bottom-grid">
              ${fieldOn('followTable', f) ? `<div class="follow-wrap">
                <div class="sec-head compact">
                  <div class="sec-num">3</div>
                  <div class="sec-title"><span class="ar">جدول المتابعة</span><span class="en">Follow-up</span></div>
                  <div class="sec-rule"></div>
                </div>
                ${buildFollowTable(d.followRows, b)}
              </div>` : ''}
              ${fieldOn('precautions', f) ? `<div class="care-wrap">
                <div class="sec-head compact">
                  <div class="sec-num alt">4</div>
                  <div class="sec-title"><span class="ar alt">احتياطات ما بعد الحجامة</span><span class="en">Post-Care</span></div>
                  <div class="sec-rule alt"></div>
                </div>
                <div class="care">
                  <ol>${precautions}</ol>
                  <div class="note">للمساعدة فقط — لا تغني عن استشارة الطبيب.<span class="en"> Guidance only.</span></div>
                </div>
              </div>` : ''}
            </div>
          </div>
          <footer class="footer">
            ${buildQrBlock('واتساب', 'WHATSAPP', waUrl, b)}
            <div class="addr-block">
              <div class="ttl">عنوان المركز<span class="en">ADDRESS</span></div>
              <div class="addr">${esc(d.centerAddress)}</div>
              ${d.centerPhone ? `<div class="phone" dir="ltr">📞 ${esc(d.centerPhone)}</div>` : ''}
            </div>
            ${buildQrBlock('الموقع', 'LOCATION', d.siteUrl, b)}
          </footer>
        </div>
      </div>
    </div>`;

    const page2 = fieldOn('maps', f) ? `
    <div class="page">
      <div class="page-body">
        <div class="back-head">
          <h2>خريطة الجسم — مواضع الحجامة</h2>
          <div class="en">Body Map · Cupping Points</div>
        </div>
        ${buildFullMapsArea(d)}
      </div>
      <div class="tear-off tear-off--maps">
        <div class="cut-line"></div>
        <div class="tear-inner tear-maps">
          <div class="mini-map-head">
            <span>خريطة الجلسة (الجزء المقصوص)</span>
            <span class="en">SESSION MAP · TEAR-OFF</span>
          </div>
          <div class="mini-map-box">
            <div class="inner">${buildMiniMapArea(d)}</div>
          </div>
        </div>
      </div>
    </div>` : '';

    return page1 + page2;
  }

  const MAP_CSS = `
    .cf-map-freeform{position:relative;width:100%;height:100%;min-height:0}
    .cf-full-maps,.cf-mini-maps{position:relative;width:100%;height:100%;min-height:0}
    .cf-free-map{position:absolute;display:flex;flex-direction:column;min-height:0;overflow:visible}
    .cf-free-map-inner{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;width:100%;height:100%}
    .cf-free-fit{width:100%;height:100%;min-height:0;display:flex;align-items:center;justify-content:center}
    .cf-free-fit .cup-img-map{width:100%;height:100%;min-height:0;aspect-ratio:unset!important}
    .cf-free-fit .cup-img-base{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
    .cup-img-map{position:relative;width:100%;background:transparent;border:0.35pt solid rgba(11,110,95,.12);border-radius:3pt;overflow:hidden}
    .cup-img-empty{display:flex;align-items:center;justify-content:center;min-height:12mm;padding:2mm;text-align:center;font-size:7pt;color:#888}
    .cup-img-base{display:block;width:100%;height:100%;object-fit:contain;position:absolute;inset:0;background:transparent}
    .cup-img-overlay{position:absolute;inset:0;pointer-events:none}
    .cup-img-map--interactive .cup-img-overlay{pointer-events:auto}
    .cup-img-pt{position:absolute;transform:translate(-50%,-50%);z-index:2}
    .cup-img-pt-dot{display:block;width:2.4mm;height:2.4mm;border-radius:50%;border:0.5pt solid #fff;box-shadow:0 0 0 0.4pt rgba(0,0,0,.3)}
    .cup-img-pt--session .cup-img-pt-dot{width:3.4mm;height:3.4mm;background:#1565C0}
    .cup-img-pt--saved .cup-img-pt-dot{width:3mm;height:3mm;background:#C6A15B}
    .cup-img-pt-lbl{display:flex;align-items:center;justify-content:center;min-width:12px;height:12px;padding:0 2px;border-radius:50%;font-size:5.5px;font-weight:800;color:#fff;border:1.2px solid #fff;font-family:Arial,sans-serif}
    .cup-img-pt--session .cup-img-pt-lbl{background:#1565C0!important}
    .cup-img-pt--saved .cup-img-pt-lbl{background:#C6A15B!important;color:#1a1a1a!important}
    .cup-img-pt--g .cup-img-pt-lbl{background:#0B6E5F}
    .cup-img-pt--o .cup-img-pt-lbl{background:#8B1E2D}
    .maps-full .cf-map-freeform,.maps-full .cf-full-maps{height:100%;min-height:175mm}
    .maps-mini-wrap .cf-map-freeform,.maps-mini-wrap .cf-mini-maps{height:100%;min-height:58mm}
    .maps-grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:2mm;flex:1;min-height:175mm}
    .map-cell{border:0.5pt solid var(--emerald-line);border-radius:6pt;padding:1.5mm;min-height:0;overflow:hidden;display:flex}
    .map-cell .cup-img-map{flex:1;min-height:82mm}
    .client-file-maps .cf-free-map-inner{transform-origin:center center}
    .client-file-maps .cup-img-map{min-height:78mm}
    .client-file-maps .cf-free-fit .cup-img-map{min-height:0;height:100%}
  `;

  const CLIENT_FILE_CSS = `
:root{
  --emerald:#0B6E5F;--emerald-dark:#064E44;--emerald-soft:#E6F2F0;--emerald-line:#0B6E5F33;
  --maroon:#8B1E2D;--gold:#C6A15B;--ink:#0E1B1A;--muted:#6B7280;--cream:#FAF7F1;--light:#F4F7F6;
  --tear:${TEAR_HEIGHT};
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{background:#e9ecef;font-family:'Cairo','Inter',sans-serif;color:var(--ink);direction:rtl}
.page{width:210mm;height:297mm;background:#fff;margin:10mm auto;padding:7mm 9mm 0;display:flex;flex-direction:column;box-shadow:0 6px 30px rgba(0,0,0,.10);page-break-after:always}
.page:last-child{page-break-after:auto}
.page-body{flex:1 1 auto;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:0.5mm}
.tear-off{flex:0 0 var(--tear);height:var(--tear);max-height:var(--tear);display:flex;flex-direction:column;min-height:var(--tear)}
.cut-line{flex:0 0 auto;border-top:0.7pt dashed var(--maroon);margin:0;position:relative;height:0}
.cut-line::before{content:"✂  قص من هنا  ·  CUT HERE";position:absolute;top:-2.4mm;left:50%;transform:translateX(-50%);background:#fff;padding:0 2.5mm;color:var(--maroon);font-size:7pt;font-weight:700;white-space:nowrap}
.tear-inner{flex:1;min-height:0;display:flex;flex-direction:column;padding-top:1.5mm;overflow:hidden}
.tear-content{flex:1 1 auto;min-height:0;overflow:hidden;display:flex;flex-direction:column}
@page{size:A4 portrait;margin:0}
@media print{html,body{background:#fff}.page{margin:0;box-shadow:none}}

.header{display:grid;grid-template-columns:1fr auto 1fr;align-items:stretch;gap:3mm;padding-bottom:2.5mm;border-bottom:0.8pt solid var(--emerald);margin-bottom:1.5mm;position:relative}
.header::after{content:"";position:absolute;left:0;right:0;bottom:-1mm;height:0.4mm;background:linear-gradient(90deg,transparent,var(--gold),transparent)}
.meta,.session-meta{display:flex;flex-direction:column;justify-content:center;gap:2mm}
.meta .row,.price-row{display:flex;align-items:center;gap:1.5mm;font-size:8pt}
.meta .row .lbl,.price-row .lbl{color:var(--emerald);font-weight:700;min-width:17mm;font-size:7.8pt;flex-shrink:0}
.meta .row .lbl .en,.price-row .lbl .en{display:block;font-family:'Inter',sans-serif;font-size:5.8pt;color:var(--muted);font-weight:500}
.box,.input{flex:1;min-height:6.5mm;border-radius:4pt;background:var(--cream);border:0.5pt solid var(--emerald-line)}
.box.filled,.input.filled{display:flex;align-items:center;padding:0 1.8mm;font-weight:700;font-size:8.5pt;color:var(--ink)}
.price-row .box.filled{border-color:rgba(198,161,91,.55);background:#FFFBF1}
.brand{text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.4mm;padding:0 2mm}
.logo-box{width:15mm;height:15mm;border:0.5pt dashed var(--emerald-line);border-radius:50%;background:var(--emerald-soft);overflow:hidden;display:flex;align-items:center;justify-content:center}
.logo-box.has-logo img{width:100%;height:100%;object-fit:contain}
.logo-box.logo-empty::after{content:"";width:8mm;height:8mm;border-radius:50%;background:var(--emerald-line)}
.brand h1{font-size:15pt;color:var(--emerald);font-weight:800;line-height:1.1;margin-top:0.5mm}
.brand .brand-en-name{font-family:'Inter',sans-serif;font-size:8pt;color:var(--maroon);letter-spacing:1.5px;font-weight:800;text-transform:uppercase}
.session-meta{display:flex;flex-direction:column;gap:2mm;width:100%}

.sec{margin-top:1.2mm}
.sec-med{margin-top:1mm}
.sec-head{display:flex;align-items:center;gap:2.5mm;margin-bottom:1mm}
.sec-head.compact{margin-bottom:0.8mm}
.sec-num{width:6mm;height:6mm;border-radius:5pt;background:var(--emerald);color:#fff;font-weight:800;font-size:9pt;display:flex;align-items:center;justify-content:center;font-family:'Inter',sans-serif}
.sec-num.alt{background:var(--maroon)}
.sec-title .ar{color:var(--emerald-dark);font-weight:800;font-size:10pt;line-height:1.1}
.sec-title .ar.alt{color:var(--maroon)}
.sec-title .en{font-family:'Inter',sans-serif;font-size:6.5pt;color:var(--muted);letter-spacing:1px;text-transform:uppercase}
.sec-rule{flex:1;height:0.3pt;background:var(--emerald-line)}
.card{border:0.5pt solid var(--emerald-line);border-radius:8pt;padding:2mm 2.5mm}
.card.tinted{background:var(--emerald-soft)}
.card.alt{border-color:#8B1E2D33}
.grid-med{display:grid;grid-template-columns:1fr 1fr;gap:1.5mm 3.5mm;align-items:start}
.grid-med .field-full{grid-column:1/-1}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:2.5mm 4mm}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2.5mm 3mm}
.field-full{grid-column:1/-1}
.field{display:flex;align-items:center;gap:1.5mm;font-size:8pt;min-height:5mm}
.field label{color:var(--emerald-dark);font-weight:700;font-size:7.5pt;min-width:18mm;line-height:1.05}
.field label .en{display:block;font-family:'Inter',sans-serif;font-size:6pt;color:var(--muted)}
.field .input{flex:1;height:5mm;border:0.5pt solid var(--emerald-line);border-radius:3pt;background:var(--cream)}
.chk-group{display:flex;flex-wrap:wrap;gap:3.5mm;align-items:center;font-size:8pt}
.chk-group.compact{gap:2.5mm;font-size:7.5pt}
.infectious-block{padding:1.8mm 2mm;background:rgba(11,110,95,.04);border:0.4pt solid var(--emerald-line);border-radius:5pt}
.infectious-title{font-weight:800;font-size:8pt;color:var(--emerald-dark);margin-bottom:1.2mm;line-height:1.2}
.infectious-title .en{display:inline;font-family:'Inter',sans-serif;font-size:6.5pt;color:var(--muted);font-weight:600;margin-inline-start:2mm}
.infectious-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.2mm 4mm}
.inf-item{display:flex;align-items:center;gap:1mm;font-size:7.5pt;font-family:'Inter','Cairo',sans-serif;white-space:nowrap}
.chk{width:3.2mm;height:3.2mm;border:0.5pt solid var(--emerald);border-radius:1.2pt;display:inline-block;background:#fff;margin-inline-end:1mm;vertical-align:middle}
.chk.on{background:var(--emerald);box-shadow:inset 0 0 0 0.65mm #fff}
.sig-row{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:1mm}
.consent-block{margin-top:auto;flex-shrink:0;padding:2mm 2.5mm;border:0.5pt solid var(--emerald-line);border-radius:6pt;background:var(--cream)}
.consent-text{font-size:7.5pt;line-height:1.55;font-weight:600;text-align:justify;color:var(--ink);margin-bottom:1.5mm}
.sig .line{height:7mm;border:0.5pt solid var(--emerald-line);border-radius:3pt;background:var(--cream)}
.sig .line.sig-name{display:flex;align-items:center;justify-content:center;font-weight:700;font-size:9pt;color:var(--emerald-dark)}
.sig .lbl{font-weight:700;text-align:center;font-size:8.5pt;margin-top:0.8mm;color:var(--emerald-dark)}
.sig .en{font-family:'Inter',sans-serif;color:var(--muted);font-size:6pt;text-align:center}

.bottom-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:3mm;flex:1;min-height:0}
.follow-wrap,.care-wrap{min-height:0;display:flex;flex-direction:column}
table.followup{width:100%;border-collapse:collapse;font-size:7.8pt;border:0.5pt solid var(--emerald-line);border-radius:6pt;overflow:hidden;table-layout:fixed}
table.followup th{background:var(--emerald);color:#fff;font-weight:700;padding:1.2mm 1mm;font-size:7.5pt}
table.followup th .en{display:block;font-family:'Inter',sans-serif;font-size:5.8pt;color:#D8EAE7;font-weight:500}
table.followup td{border-top:0.35pt solid var(--emerald-line);padding:1mm 0.8mm;height:5.5mm;vertical-align:middle;font-size:7.5pt;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
table.followup .c-num{width:12%;text-align:center;font-weight:700}
table.followup .c-date{width:26%}
table.followup .c-spec{width:38%}
table.followup .c-att{width:24%}
table.followup tbody tr:nth-child(odd) td{background:var(--light)}
.care{border:0.5pt solid var(--gold);border-radius:5pt;padding:2mm 2.5mm;background:#FFFDF7;font-size:6.8pt;line-height:1.2;flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column}
.care ol{padding-inline-start:3mm;display:flex;flex-direction:column;gap:0.3mm;flex:1;overflow:hidden}
.care li{display:flex;flex-direction:column;gap:0.1mm}
.care .prec-ar{font-weight:600;font-size:7pt}
.care .prec-en{font-family:'Inter',sans-serif;font-size:6pt;color:var(--muted);line-height:1.15}
.care .note{margin-top:1mm;padding-top:1mm;border-top:0.3pt dotted var(--emerald-line);font-size:6.5pt;color:var(--muted);flex-shrink:0}
.care .note .en{font-family:'Inter',sans-serif;font-style:normal}

.footer{flex:0 0 20mm;margin-top:1.5mm;padding:2mm 3mm;border-radius:6pt;background:linear-gradient(135deg,var(--emerald-soft) 0%,#FFFDF7 45%,var(--emerald-soft) 100%);border:0.6pt solid var(--emerald-line);display:grid;grid-template-columns:auto 1fr auto;gap:3mm;align-items:center;box-shadow:inset 0 0 0 0.4pt rgba(255,255,255,.8)}
.foot-col{text-align:center}
.qr{width:16mm;height:16mm;border:0.5pt dashed var(--gold);border-radius:4pt;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#FFFDF7}
.qr img{width:100%;height:100%;object-fit:contain}
.qr-ph{font-size:6pt;color:var(--muted)}
.foot-col .lbl{font-weight:700;font-size:8pt;color:var(--emerald-dark)}
.foot-col .en{font-family:'Inter',sans-serif;font-size:6pt;color:var(--muted)}
.addr-block{text-align:center;font-size:8pt;line-height:1.35}
.addr-block .ttl{color:var(--maroon);font-weight:800;font-size:8.5pt}
.addr-block .ttl .en{display:block;font-family:'Inter',sans-serif;font-size:6pt;color:var(--muted)}
.addr-block .phone{margin-top:1mm;display:inline-flex;font-family:'Inter',sans-serif;direction:ltr;font-weight:700;color:#fff;background:var(--emerald);padding:1mm 3mm;border-radius:12pt;font-size:8pt}

.back-head{text-align:center;padding:1.5mm 0 2mm;border-bottom:0.6pt solid var(--emerald);margin-bottom:1.5mm;flex-shrink:0}
.back-head h2{color:var(--emerald-dark);font-size:13pt;font-weight:800}
.back-head .en{font-family:'Inter',sans-serif;font-size:7.5pt;color:var(--maroon);letter-spacing:1.5px}
.map-legend-inline{display:flex;justify-content:center;gap:4mm;margin-top:1.5mm;font-size:7pt;flex-wrap:wrap}
.map-legend-inline span{display:inline-flex;align-items:center;gap:1mm}
.leg-dot{display:inline-block;width:2.5mm;height:2.5mm;border-radius:50%;border:0.4pt solid #fff;box-shadow:0 0 0 0.3pt rgba(0,0,0,.2)}
.leg-session{background:#1565C0}.leg-saved{background:#C6A15B}.leg-atlas{background:rgba(11,110,95,.4)}
.maps-full{flex:1;min-height:0;position:relative}
.tear-maps{display:flex;flex-direction:column;min-height:0}
.mini-map-head{display:flex;justify-content:space-between;align-items:center;font-size:8pt;font-weight:800;color:var(--emerald-dark);margin-bottom:1mm;flex-shrink:0}
.mini-map-head .en{font-family:'Inter',sans-serif;font-size:6pt;color:var(--muted);font-weight:600}
.mini-map-box{flex:1;min-height:0;border:0.5pt solid var(--emerald-line);border-radius:6pt;padding:1.5mm;background:#fff;display:flex;flex-direction:column}
.mini-map-box .inner{flex:1;min-height:58mm;position:relative;overflow:hidden;border-radius:4pt;background:var(--light)}
.client-file-maps .cf-map-lbl,.client-file-maps .cf-mini-lbl,.client-file-maps .map-cell-lbl{display:none!important}

${MAP_CSS}
@media print{html,body{background:#fff}.page{margin:0;box-shadow:none}}
  `;

  function buildClientFilePrintDocument(html) {
    const baseHref = getAppBaseHref();
    const baseTag = baseHref ? `<base href="${attrSrc(baseHref)}">` : '';
    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">${baseTag}
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
      <style>${CLIENT_FILE_CSS}</style></head><body>${html}</body></html>`;
  }

  function openClientFileWindow(html, auditMeta, autoPrint) {
    const doc = buildClientFilePrintDocument(html);
    if (autoPrint && typeof global.HardwareBridge !== 'undefined' && typeof global.HardwareBridge.printA4 === 'function') {
      global.HardwareBridge.printA4(doc, { documentTitle: 'ملف العميل — مركز الحجامة' });
      if (auditMeta && global.logAudit) global.logAudit(auditMeta.action, auditMeta.message, auditMeta.data || {});
      return;
    }
    const pw = window.open('', '_blank', 'width=920,height=800');
    if (!pw) { global.notify?.('⚠️ السماح بالنوافذ المنبثقة مطلوب', 'danger'); return; }
    const printScript = autoPrint
      ? `<script>window.onload=function(){setTimeout(function(){window.print();setTimeout(function(){window.close();},800);},400);};<\/script>`
      : '';
    pw.document.write(doc + printScript);
    pw.document.close();
    if (auditMeta && global.logAudit) global.logAudit(auditMeta.action, auditMeta.message, auditMeta.data || {});
  }

  function openClientFilePrintWindow(html, auditMeta) {
    openClientFileWindow(html, auditMeta, true);
  }

  function buildClientFileSheetFromKey(clientKey, options) {
    if (typeof global.syncAppGlobals === 'function') global.syncAppGlobals();
    if (typeof global.ensureCuppingMapsReady === 'function') global.ensureCuppingMapsReady();
    options = options || {};
    const data = getClientFileData(clientKey, options);
    if (!options.blank && !data.name) return null;
    return { data, html: buildClientFileSheetHtml(data) };
  }

  function printClientFileSheet(clientKey, options) {
    if (global.isFeatureEnabled && !global.isFeatureEnabled('ops_client_file')) {
      global.notify?.('⚠️ ميزة طباعة ملف العميل غير مفعّلة', 'danger'); return;
    }
    const built = buildClientFileSheetFromKey(clientKey, options);
    if (!built) {
      global.notify?.('⚠️ أدخل اسم العميل أو استخدم «ملف فارغ»', 'danger'); return;
    }
    openClientFilePrintWindow(built.html, {
      action: 'CLIENT_FILE_PRINT', message: `طباعة ملف: ${built.data.name || 'فارغ'}`, data: { fileNo: built.data.fileNo, blank: !!options.blank }
    });
  }

  function previewClientFileSheet(clientKey, options) {
    if (global.isFeatureEnabled && !global.isFeatureEnabled('ops_client_file')) {
      global.notify?.('⚠️ ميزة ملف العميل غير مفعّلة', 'danger'); return;
    }
    const built = buildClientFileSheetFromKey(clientKey, options);
    if (!built) {
      global.notify?.('⚠️ لا توجد بيانات كافية لعرض الملف', 'danger'); return;
    }
    openClientFileWindow(built.html, {
      action: 'CLIENT_FILE_PREVIEW', message: `استعراض ملف: ${built.data.name || 'فارغ'}`, data: { fileNo: built.data.fileNo }
    }, false);
  }

  function printBlankClientFileSheet() { printClientFileSheet(null, { blank: true }); }

  function printClientFileFromRow(btn) {
    if (!btn) return;
    printClientFileSheet(decodeURIComponent(btn.getAttribute('data-client-key') || ''), {
      name: decodeURIComponent(btn.getAttribute('data-client-name') || ''),
      phone: decodeURIComponent(btn.getAttribute('data-client-phone') || ''),
      fileNo: decodeURIComponent(btn.getAttribute('data-client-file') || '')
    });
  }

  function readLiveFormOverrides() {
    return collectClientFileOpts('f');
  }

  function printClientFileFromForm() {
    const live = collectClientFileOpts('f');
    if (!live.name) { global.notify?.('⚠️ أدخل اسم العميل أولاً', 'danger'); return; }
    const today = new Date().toISOString().slice(0, 10);
    printClientFileSheet(live.phone || live.name, {
      ...live,
      date: today,
      currentSession: { date: today, specialist: live.doctorName, attendance: '' }
    });
  }

  global.collectClientFileOpts = collectClientFileOpts;

  global.DEFAULT_CLIENT_FILE_FIELDS = DEFAULT_CLIENT_FILE_FIELDS;
  global.getClientFileFieldSettings = getClientFileFieldSettings;
  global.getClientFileData = getClientFileData;
  global.buildClientFileSheetHtml = buildClientFileSheetHtml;
  global.buildClientFilePrintDocument = buildClientFilePrintDocument;
  global.previewClientFileSheet = previewClientFileSheet;
  global.printClientFileSheet = printClientFileSheet;
  global.printBlankClientFileSheet = printBlankClientFileSheet;
  global.printClientFileFromForm = printClientFileFromForm;
  global.printClientFileFromRow = printClientFileFromRow;
  global.readLiveFormOverrides = readLiveFormOverrides;

})(typeof window !== 'undefined' ? window : globalThis);
