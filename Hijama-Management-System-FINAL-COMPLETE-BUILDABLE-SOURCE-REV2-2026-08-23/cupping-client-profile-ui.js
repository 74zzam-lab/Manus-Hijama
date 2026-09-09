/**
 * مركز الحجامة — واجهة الملف الطبي المشتركة (تسجيل حالة + تعديل عميل)
 */
(function (global) {
  'use strict';

  const _cuppingStates = { f: { selected: new Set(), savedPoints: new Set() }, ce: { selected: new Set(), savedPoints: new Set() } };

  function pid(prefix, name) {
    return prefix + '-' + name;
  }

  function getCuppingState(prefix) {
    if (!_cuppingStates[prefix]) _cuppingStates[prefix] = { selected: new Set(), savedPoints: new Set() };
    return _cuppingStates[prefix];
  }

  function applyClientFileFieldVisibility(prefix) {
    const fields = typeof global.getClientFileFieldSettings === 'function'
      ? global.getClientFileFieldSettings()
      : {};
    const map = {
      gender: 'gender', age: 'age', address: 'address', emergency: 'emergency',
      purpose: 'purpose', 'prev-cupping': 'prevCupping', 'blood-thinners': 'bloodThinners',
      allergies: 'allergies', 'temp-conditions': 'temp', 'chronic-conditions': 'chronic',
      bp: 'bp', sugar: 'sugar', pregnancy: 'pregnancy', symptoms: 'symptoms',
      'hep-b': 'infectiousDiseases', 'hep-c': 'infectiousDiseases', hiv: 'infectiousDiseases',
      'heart-disease': 'heartDisease', anemia: 'anemia', 'kidney-disease': 'kidneyDisease'
    };
    Object.entries(map).forEach(([idSuffix, key]) => {
      const el = document.getElementById(pid(prefix, idSuffix))?.closest('.form-group');
      if (el) el.style.display = fields[key] === false ? 'none' : '';
    });
    const infHead = document.getElementById(pid(prefix, 'hep-b'))?.closest('.form-grid')?.querySelector('[style*="الأمراض المعدية"]')?.closest('.form-group');
    if (infHead) infHead.style.display = fields.infectiousDiseases === false ? 'none' : '';
    const mapHost = document.getElementById(pid(prefix, 'cupping-map'));
    if (mapHost) {
      mapHost.style.display = fields.maps === false ? 'none' : '';
      const hint = mapHost.previousElementSibling;
      const title = hint?.previousElementSibling;
      if (hint) hint.style.display = fields.maps === false ? 'none' : '';
      if (title) title.style.display = fields.maps === false ? 'none' : '';
    }
  }

  function toggleClientProfileDrawer(prefix) {
    prefix = prefix || 'ce';
    const drawer = document.getElementById(pid(prefix, 'profile-drawer'));
    const toggle = document.getElementById(pid(prefix, 'drawer-toggle'));
    const modal = document.getElementById('clientEditModalBox');
    if (!drawer || !toggle) return;
    const open = !drawer.classList.contains('open');
    drawer.classList.toggle('open', open);
    toggle.classList.toggle('open', open);
    if (prefix === 'ce' && modal) modal.classList.toggle('open-profile', open);
    if (open) {
      applyClientFileFieldVisibility(prefix);
      initClientProfileCuppingMap(prefix);
    }
  }

  function closeClientProfileDrawer(prefix) {
    prefix = prefix || 'ce';
    const drawer = document.getElementById(pid(prefix, 'profile-drawer'));
    const toggle = document.getElementById(pid(prefix, 'drawer-toggle'));
    if (drawer) drawer.classList.remove('open');
    if (toggle) toggle.classList.remove('open');
    if (prefix === 'ce') document.getElementById('clientEditModalBox')?.classList.remove('open-profile');
  }

  function onProfileGenderChange(prefix) {
    const g = document.getElementById(pid(prefix, 'gender'))?.value || '';
    const wrap = document.getElementById(pid(prefix, 'pregnancy-wrap'));
    if (wrap) wrap.style.display = g === 'أنثى' ? '' : 'none';
  }

  function readTri(prefix, id) {
    const v = document.getElementById(pid(prefix, id))?.value;
    return v === 'yes' ? true : v === 'no' ? false : null;
  }

  function readClientProfileForm(prefix) {
    const st = getCuppingState(prefix);
    return {
      gender: document.getElementById(pid(prefix, 'gender'))?.value || '',
      age: document.getElementById(pid(prefix, 'age'))?.value || '',
      address: document.getElementById(pid(prefix, 'address'))?.value.trim() || '',
      purpose: document.getElementById(pid(prefix, 'purpose'))?.value || '',
      bloodThinners: readTri(prefix, 'blood-thinners'),
      tempConditions: document.getElementById(pid(prefix, 'temp-conditions'))?.value.trim() || '',
      chronicConditions: document.getElementById(pid(prefix, 'chronic-conditions'))?.value.trim() || '',
      bloodPressure: document.getElementById(pid(prefix, 'bp'))?.value.trim() || '',
      bloodSugar: document.getElementById(pid(prefix, 'sugar'))?.value.trim() || '',
      pregnancy: readTri(prefix, 'pregnancy'),
      allergies: document.getElementById(pid(prefix, 'allergies'))?.value.trim() || '',
      symptoms: document.getElementById(pid(prefix, 'symptoms'))?.value.trim() || '',
      prevCupping: readTri(prefix, 'prev-cupping'),
      hepatitisB: readTri(prefix, 'hep-b'),
      hepatitisC: readTri(prefix, 'hep-c'),
      heartDisease: readTri(prefix, 'heart-disease'),
      hiv: readTri(prefix, 'hiv'),
      anemia: readTri(prefix, 'anemia'),
      kidneyDisease: readTri(prefix, 'kidney-disease'),
      emergencyContact: document.getElementById(pid(prefix, 'emergency'))?.value.trim() || '',
      usedPoints: [...(st.selected || [])],
      savedPoints: [...(st.savedPoints || [])]
    };
  }

  function fillClientProfileForm(prefix, profile) {
    profile = profile || {};
    const set = (name, v) => {
      const el = document.getElementById(pid(prefix, name));
      if (el) el.value = v ?? '';
    };
    set('gender', profile.gender);
    set('age', profile.age);
    set('address', profile.address);
    set('purpose', profile.purpose);
    set('blood-thinners', profile.bloodThinners === true ? 'yes' : profile.bloodThinners === false ? 'no' : '');
    set('temp-conditions', profile.tempConditions);
    set('chronic-conditions', profile.chronicConditions);
    set('bp', profile.bloodPressure);
    set('sugar', profile.bloodSugar);
    set('pregnancy', profile.pregnancy === true ? 'yes' : profile.pregnancy === false ? 'no' : '');
    set('allergies', profile.allergies);
    set('symptoms', profile.symptoms);
    set('prev-cupping', profile.prevCupping === true ? 'yes' : profile.prevCupping === false ? 'no' : '');
    set('hep-b', profile.hepatitisB === true ? 'yes' : profile.hepatitisB === false ? 'no' : '');
    set('hep-c', profile.hepatitisC === true ? 'yes' : profile.hepatitisC === false ? 'no' : '');
    set('heart-disease', profile.heartDisease === true ? 'yes' : profile.heartDisease === false ? 'no' : '');
    set('hiv', profile.hiv === true ? 'yes' : profile.hiv === false ? 'no' : '');
    set('anemia', profile.anemia === true ? 'yes' : profile.anemia === false ? 'no' : '');
    set('kidney-disease', profile.kidneyDisease === true ? 'yes' : profile.kidneyDisease === false ? 'no' : '');
    set('emergency', profile.emergencyContact);
    onProfileGenderChange(prefix);
    const st = getCuppingState(prefix);
    const historical = profile.savedPoints || profile.usedPoints || [];
    st.savedPoints = new Set(historical);
    st.selected = new Set(profile.usedPoints || []);
  }

  function resetClientProfileForm(prefix) {
    fillClientProfileForm(prefix, {});
    closeClientProfileDrawer(prefix);
    const mapHost = document.getElementById(pid(prefix, 'cupping-map'));
    if (mapHost) mapHost.innerHTML = '';
  }

  function initClientProfileCuppingMap(prefix) {
    const host = document.getElementById(pid(prefix, 'cupping-map'));
    if (!host) return;
    const st = getCuppingState(prefix);
    const mount = typeof global.mountPuzzleCuppingMap === 'function'
      ? global.mountPuzzleCuppingMap
      : global.mountInteractiveCuppingMap;
    if (typeof mount !== 'function') return;
    mount(host, st, {
      onSelectionChange: (pts) => { st.selected = new Set(pts); }
    });
  }

  function saveProfileToClient(client) {
    if (!client) return;
    const profile = readClientProfileForm('f');
    const merged = [...new Set([...(profile.savedPoints || []), ...(profile.usedPoints || [])])];
    profile.usedPoints = merged;
    client.fileProfile = profile;
    client.updatedAt = new Date().toISOString();
  }

  function loadProfileFromClient(client) {
    fillClientProfileForm('f', client?.fileProfile || {});
    if (typeof initClientProfileCuppingMap === 'function') {
      const drawer = document.getElementById('f-profile-drawer');
      if (drawer?.classList.contains('open')) initClientProfileCuppingMap('f');
    }
  }

  global.toggleClientProfileDrawer = toggleClientProfileDrawer;
  global.closeClientProfileDrawer = closeClientProfileDrawer;
  global.onProfileGenderChange = onProfileGenderChange;
  global.readClientProfileForm = readClientProfileForm;
  global.fillClientProfileForm = fillClientProfileForm;
  global.resetClientProfileForm = resetClientProfileForm;
  global.initClientProfileCuppingMap = initClientProfileCuppingMap;
  global.saveProfileToClient = saveProfileToClient;
  global.loadProfileFromClient = loadProfileFromClient;
  global.getCuppingState = getCuppingState;
  global.applyClientFileFieldVisibility = applyClientFileFieldVisibility;

})(typeof window !== 'undefined' ? window : globalThis);
