/**
 * مركز الحجامة — أطلس الحجامة (صور + نقاط فوقية)
 */
(function (global) {
  'use strict';

  const GREEN = '#2E7D32';
  const ORANGE = '#E65100';
  const ATLAS_ASSET_VER = '20260621-user-maps';
  const BUNDLED_MAP_PATHS = {
    head: 'assets/cupping-maps/head.png',
    back: 'assets/cupping-maps/back.png',
    front: 'assets/cupping-maps/front.png',
    limbs: 'assets/cupping-maps/limbs.png'
  };
  const BUNDLED_MAP_ASPECTS = {
    front: '1182 / 2560',
    back: '541 / 1279',
    head: '827 / 1128',
    limbs: '891 / 707'
  };
  const ALLOWED_MAP_FILES = new Set(Object.values(BUNDLED_MAP_PATHS));
  /** صور المستخدم الأربع فقط في assets/cupping-maps/ — تُعرض خاماً بدون معالجة */

  function defaultAtlasImage(id) {
    return BUNDLED_MAP_PATHS[id] || '';
  }

  function resolveAssetUrl(src) {
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

  function isEmbeddedMapImage(src) {
    return typeof src === 'string' && src.startsWith('data:');
  }

  function isAllowedMapImageSrc(src, mapId) {
    if (!src) return true;
    const bundled = defaultAtlasImage(mapId);
    if (src === bundled) return true;
    if (isEmbeddedMapImage(src) && src.startsWith('data:image/png')) return true;
    return false;
  }

  function sanitizeMapImageSrc(src, mapId) {
    const bundled = defaultAtlasImage(mapId);
    if (isAllowedMapImageSrc(src, mapId)) return src || bundled;
    return bundled;
  }

  function sanitizeCuppingAtlasMaps(maps) {
    maps = maps || {};
    const out = {};
    MAP_IDS.forEach(id => {
      const prev = maps[id] || {};
      out[id] = {
        aspect: prev.aspect || BUNDLED_MAP_ASPECTS[id] || '3 / 2',
        image: sanitizeMapImageSrc(prev.image, id)
      };
    });
    return out;
  }

  function stripComposedMapImages(template) {
    if (!template) return template;
    ['mini', 'full'].forEach(key => {
      if (template[key]?.composedImage) delete template[key].composedImage;
    });
    return template;
  }

  function migrateCuppingAtlasConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return { cfg: null, changed: false };
    if (cfg.atlasAssetVer === ATLAS_ASSET_VER) return { cfg, changed: false };

    const defaults = getDefaultAtlasMaps();
    const next = JSON.parse(JSON.stringify(cfg));
    next.atlasAssetVer = ATLAS_ASSET_VER;
    next.maps = sanitizeCuppingAtlasMaps(next.maps);
    MAP_IDS.forEach(id => {
      if (!next.maps[id]?.image) next.maps[id].image = defaults[id].image;
    });
    stripComposedMapImages(next.template);
    return { cfg: next, changed: true };
  }

  function getDefaultAtlasMaps() {
    return MAP_IDS.reduce((acc, id) => {
      acc[id] = { image: defaultAtlasImage(id), aspect: BUNDLED_MAP_ASPECTS[id] || '3 / 2' };
      return acc;
    }, {});
  }

  function prophetic(n, region, zone, conditions) {
    return { n, type: 'prophetic', region, zone, conditions };
  }
  function therapeutic(n, region, zone, conditions) {
    return { n, type: 'therapeutic', region, zone, conditions };
  }

  function buildPointInfoDb() {
    const db = {};
    const add = (p) => { db[p.n] = p; };
    add(prophetic(1, 'head_crown', 'بين قرني الرأس', ['الصُداع', 'الشقيقة', 'النسيان', 'الأرق']));
    add(prophetic(2, 'head_crown', 'قرن الرأس الأيسر', ['صداع جانبي', 'آلام الرقبة', 'دوخة']));
    add(prophetic(3, 'head_crown', 'قرن الرأس / أعلى الصدر', ['صداع', 'آلام الكتف', 'قلق']));
    add(prophetic(4, 'back_neck', 'أعلى العمود الفقري', ['آلام الرقبة', 'صداع العنق']));
    add(prophetic(5, 'back_upper', 'الظهر العلوي', ['آلام الظهر', 'ضيق تنفس', 'سعال']));
    add(prophetic(6, 'back_mid', 'وسط الظهر', ['آلام الظهر', 'تعب', 'هضم']));
    add(prophetic(7, 'back_lower', 'أسفل الظهر', ['آلام الخصر', 'انزلاق غضروفي خفيف']));
    add(prophetic(8, 'back_sacrum', 'العجز', ['آلام الحوض', 'بواسير', 'الدورة']));
    add(prophetic(9, 'limb_shoulder', 'الكتف', ['آلام الكتف', 'تيبس الرقبة']));
    add(prophetic(10, 'front_chest', 'منتصف الصدر', ['كحة', 'ضيق صدر', 'قلق']));
    add(therapeutic(98, 'head_nape', 'القفا', ['صداع خلفي', 'تيبس الرقبة']));
    for (let n = 11; n <= 18; n++) add(therapeutic(n, 'head_forehead', `الجبهة (${n})`, ['صداع أمامي', 'جيوب', 'إجهاد']));
    [19, 20, 21].forEach((n) => add(therapeutic(n, 'head_temple', `الصدغ (${n})`, ['صداع جانبي', 'طنين'])));
    for (let n = 19; n <= 47; n++) if (!db[n]) add(therapeutic(n, 'back_upper', `الظهر (${n})`, ['آلام ظهر', 'شد عضلي', 'روماتيزم']));
    for (let n = 83; n <= 90; n++) add(therapeutic(n, 'back_sacrum', `العجز (${n})`, ['آلام عجز', 'حوض', 'دورة']));
    for (let n = 22; n <= 35; n++) add(therapeutic(n, 'front_chest', `الصدر (${n})`, ['صدر', 'كحة', 'ضيق']));
    for (let n = 36; n <= 58; n++) add(therapeutic(n, 'front_abdomen', `البطن (${n})`, ['بطن', 'هضم', 'انتفاخ']));
    for (let n = 59; n <= 73; n++) add(therapeutic(n, 'front_pelvis', `الحوض (${n})`, ['حوض', 'دورة']));
    for (let n = 74; n <= 97; n++) add(therapeutic(n, 'limb_arm', `الأطراف (${n})`, ['مفاصل', 'أعصاب', 'شد عضلي']));
    return db;
  }

  const CUPPING_POINT_INFO = buildPointInfoDb();
  const MAP_IDS = ['head', 'back', 'front', 'limbs'];
  const REGION_DEFAULT_MAP = {
    head_crown: 'head', head_forehead: 'head', head_temple: 'head', head_nape: 'head',
    back_neck: 'back', back_upper: 'back', back_mid: 'back', back_lower: 'back', back_sacrum: 'back',
    front_chest: 'front', front_abdomen: 'front', front_pelvis: 'front',
    limb_shoulder: 'limbs', limb_arm: 'limbs'
  };

  function getUserPointDb() {
    return global._cuppingPointDb || global.settings?.cuppingAtlas?.pointDb || {};
  }

  function normalizePointDbEntry(raw, n) {
    if (!raw || raw.deleted) return null;
    const num = parseInt(raw.n != null ? raw.n : n, 10);
    if (!num) return null;
    const base = CUPPING_POINT_INFO[num] || {};
    const type = raw.type || base.type || 'therapeutic';
    return {
      n: num,
      type,
      region: raw.region || base.region || null,
      zone: raw.zone || base.zone || `موضع ${num}`,
      conditions: (raw.conditions && raw.conditions.length) ? raw.conditions.slice() : (base.conditions || []).slice(),
      defaultMap: raw.defaultMap || REGION_DEFAULT_MAP[raw.region || base.region] || null,
      color: raw.color || (type === 'prophetic' ? 'g' : 'o')
    };
  }

  function getPointDbEntry(n, userDb) {
    const num = parseInt(n, 10);
    if (!num) return null;
    userDb = userDb || getUserPointDb();
    const key = String(num);
    if (userDb[key]?.deleted) return null;
    if (userDb[key]) return normalizePointDbEntry(userDb[key], num);
    const base = CUPPING_POINT_INFO[num];
    if (!base) return null;
    return normalizePointDbEntry(base, num);
  }

  function listPointDbEntries(userDb) {
    userDb = userDb || getUserPointDb();
    const nums = new Set(Object.keys(CUPPING_POINT_INFO).map(Number));
    Object.keys(userDb).forEach(k => {
      const n = parseInt(k, 10);
      if (n && !userDb[k]?.deleted) nums.add(n);
    });
    return [...nums].sort((a, b) => a - b)
      .map(n => getPointDbEntry(n, userDb))
      .filter(Boolean);
  }

  function defaultMapForPoint(n, userDb) {
    const entry = getPointDbEntry(n, userDb);
    return entry?.defaultMap || 'back';
  }

  function pointDbColor(n, userDb) {
    const entry = getPointDbEntry(n, userDb);
    if (!entry) return 'o';
    const c = entry.color;
    return c === 'g' ? 'g' : c === 'y' ? 'y' : 'o';
  }
  const SLOT_KEYS = { tr: [1, 1], tl: [2, 1], br: [1, 2], bl: [2, 2] };
  const DEFAULT_SLOT = { back: 'tr', head: 'tl', limbs: 'br', front: 'bl' };
  const DEFAULT_PRINT_ORDER = ['back', 'head', 'limbs', 'front'];

  function getDefaultCuppingTemplate() {
    const mk = (layers) => ({
      mode: 'free',
      visible: { head: true, back: true, front: true, limbs: true },
      order: DEFAULT_PRINT_ORDER.slice(),
      slots: { ...DEFAULT_SLOT },
      layers
    });
    const fullLayers = typeof global.DEFAULT_LAYERS_FULL === 'object'
      ? JSON.parse(JSON.stringify(global.DEFAULT_LAYERS_FULL))
      : null;
    const miniLayers = typeof global.DEFAULT_LAYERS_MINI === 'object'
      ? JSON.parse(JSON.stringify(global.DEFAULT_LAYERS_MINI))
      : null;
    return {
      mini: mk(miniLayers || {
        back: { visible: true, x: 51, y: 1, w: 48, h: 48, z: 1, fit: 'contain', scale: 100 },
        head: { visible: true, x: 1, y: 1, w: 48, h: 48, z: 2, fit: 'contain', scale: 100 },
        limbs: { visible: true, x: 51, y: 51, w: 48, h: 48, z: 3, fit: 'contain', scale: 100 },
        front: { visible: true, x: 1, y: 51, w: 48, h: 48, z: 4, fit: 'contain', scale: 100 }
      }),
      full: mk(fullLayers || {
        front: { visible: true, x: 1, y: 10, w: 48, h: 86, z: 1, fit: 'contain', scale: 100 },
        back: { visible: true, x: 51, y: 10, w: 48, h: 86, z: 2, fit: 'contain', scale: 100 },
        head: { visible: true, x: 28, y: 1, w: 44, h: 34, z: 4, fit: 'contain', scale: 100 },
        limbs: { visible: true, x: 15, y: 55, w: 70, h: 42, z: 3, fit: 'contain', scale: 100 }
      })
    };
  }

  function getCuppingTemplateLayout() {
    const defaults = getDefaultCuppingTemplate();
    const t = global.settings?.cuppingAtlas?.template || global._cuppingTemplate || {};
    const merge = (key) => {
      const base = defaults[key];
      const src = t[key] || {};
      const layers = { ...base.layers, ...(src.layers || {}) };
      MAP_IDS.forEach(id => {
        if (!layers[id]) layers[id] = { ...base.layers[id] };
      });
      return {
        mode: src.mode || base.mode || 'free',
        visible: { ...base.visible, ...(src.visible || {}) },
        order: (src.order && src.order.length) ? src.order.slice() : base.order.slice(),
        slots: { ...base.slots, ...(src.slots || {}) },
        layers
      };
    };
    return { mini: merge('mini'), full: merge('full') };
  }

  function getCuppingPrintMaps(which) {
    const sec = getCuppingTemplateLayout()[which] || getDefaultCuppingTemplate()[which];
    if (sec.mode === 'free' && sec.layers) {
      return MAP_IDS
        .filter(id => sec.layers[id]?.visible !== false)
        .map(id => ({ id, mode: 'free', layer: sec.layers[id] }));
    }
    return (sec.order || DEFAULT_PRINT_ORDER)
      .filter(id => sec.visible?.[id] !== false)
      .map(id => ({
        id,
        mode: 'grid',
        slot: sec.slots?.[id] || DEFAULT_SLOT[id] || 'tr',
        grid: SLOT_KEYS[sec.slots?.[id] || DEFAULT_SLOT[id] || 'tr'] || [1, 1]
      }));
  }

  function p(n, xp, yp, side) {
    const info = CUPPING_POINT_INFO[n] || {};
    return {
      n, xp, yp, side: side || null,
      g: info.type === 'prophetic' ? 'g' : 'o',
      label: side ? `${n}/${side}` : String(n)
    };
  }

  function grid(mapId, start, end, x0, y0, w, h, cols) {
    const pts = [];
    const count = end - start + 1;
    const rows = Math.ceil(count / cols);
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      pts.push(p(start + i, x0 + ((col + 0.5) / cols) * w, y0 + ((row + 0.5) / rows) * h));
    }
    return pts.map(pt => ({ ...pt, map: mapId }));
  }

  const CUPPING_MAPS = {
    head: {
      title: 'الرأس', image: defaultAtlasImage('head'), aspect: BUNDLED_MAP_ASPECTS.head,
      points: [
        { ...p(1, 50, 19.9), map: 'head' },
        { ...p(2, 44, 26), map: 'head' },
        { ...p(3, 56, 26), map: 'head' },
        { ...p(11, 43.9, 30), map: 'head' },
        { ...p(12, 48, 30), map: 'head' },
        { ...p(13, 52, 30), map: 'head' },
        { ...p(14, 56, 30), map: 'head' },
        { ...p(15, 42, 34), map: 'head' },
        { ...p(16, 46, 34), map: 'head' },
        { ...p(17, 50, 34), map: 'head' },
        { ...p(18, 54, 34), map: 'head' },
        { ...p(98, 50, 38), map: 'head' },
        { ...p(19, 20, 56), map: 'head' },
        { ...p(20, 18, 48), map: 'head' },
        { ...p(21, 21.9, 64), map: 'head' },
        { ...p(19, 79.9, 56, '2'), map: 'head' },
        { ...p(20, 81.9, 48, '2'), map: 'head' },
        { ...p(21, 78, 64, '2'), map: 'head' }
      ]
    },
    back: {
      title: 'الظهر', image: defaultAtlasImage('back'), aspect: BUNDLED_MAP_ASPECTS.back,
      points: [
        { ...p(1, 50, 6.9), map: 'back' },
        { ...p(4, 50, 14), map: 'back' },
        { ...p(5, 50, 22), map: 'back' },
        { ...p(6, 50, 30), map: 'back' },
        { ...p(7, 50, 38), map: 'back' },
        { ...p(8, 50, 48), map: 'back' },
        { ...p(9, 36, 19.9), map: 'back' },
        { ...p(19, 43, 18), map: 'back' },
        { ...p(20, 57, 18), map: 'back' },
        { ...p(21, 43, 23.2), map: 'back' },
        { ...p(22, 57, 23.2), map: 'back' },
        { ...p(23, 43, 28.3), map: 'back' },
        { ...p(24, 57, 28.3), map: 'back' },
        { ...p(25, 43, 33.6), map: 'back' },
        { ...p(26, 57, 33.6), map: 'back' },
        { ...p(27, 43, 38.8), map: 'back' },
        { ...p(28, 57, 38.8), map: 'back' },
        { ...p(29, 43, 44), map: 'back' },
        { ...p(30, 57, 44), map: 'back' },
        { ...p(31, 43, 49.1), map: 'back' },
        { ...p(32, 57, 49.1), map: 'back' },
        { ...p(33, 43, 54.4), map: 'back' },
        { ...p(34, 57, 54.4), map: 'back' },
        { ...p(35, 43, 59.6), map: 'back' },
        { ...p(36, 57, 59.6), map: 'back' },
        { ...p(37, 43, 64.8), map: 'back' },
        { ...p(38, 57, 64.8), map: 'back' },
        { ...p(39, 43, 69.9), map: 'back' },
        { ...p(40, 57, 69.9), map: 'back' },
        { ...p(41, 43, 75.2), map: 'back' },
        { ...p(42, 57, 75.2), map: 'back' },
        { ...p(43, 43, 80.4), map: 'back' },
        { ...p(44, 57, 80.4), map: 'back' },
        { ...p(45, 43, 85.6), map: 'back' },
        { ...p(46, 57, 85.6), map: 'back' },
        { ...p(47, 43, 90.7), map: 'back' },
        { ...p(83, 38, 53.9), map: 'back' },
        { ...p(84, 46, 53.9), map: 'back' },
        { ...p(85, 54, 53.9), map: 'back' },
        { ...p(86, 62, 53.9), map: 'back' },
        { ...p(87, 38, 60), map: 'back' },
        { ...p(88, 46, 60), map: 'back' },
        { ...p(89, 54, 60), map: 'back' },
        { ...p(90, 62, 60), map: 'back' }
      ]
    },
    front: {
      title: 'الأمام', image: defaultAtlasImage('front'), aspect: BUNDLED_MAP_ASPECTS.front,
      points: [
        { ...p(3, 50, 11.9), map: 'front' },
        { ...p(9, 37, 18), map: 'front' },
        { ...p(10, 50, 23.9), map: 'front' },
        { ...p(22, 34, 30), map: 'front' },
        { ...p(23, 41, 30), map: 'front' },
        { ...p(24, 48, 30), map: 'front' },
        { ...p(25, 55, 30), map: 'front' },
        { ...p(26, 62, 30), map: 'front' },
        { ...p(27, 34, 35), map: 'front' },
        { ...p(28, 41, 35), map: 'front' },
        { ...p(29, 48, 35), map: 'front' },
        { ...p(30, 54.9, 35), map: 'front' },
        { ...p(31, 62, 35), map: 'front' },
        { ...p(32, 41, 40), map: 'front' },
        { ...p(33, 48, 40), map: 'front' },
        { ...p(34, 55, 40), map: 'front' },
        { ...p(35, 62, 40), map: 'front' },
        { ...p(36, 32.9, 46), map: 'front' },
        { ...p(37, 39.5, 46), map: 'front' },
        { ...p(38, 46, 46), map: 'front' },
        { ...p(39, 52.5, 46), map: 'front' },
        { ...p(40, 59, 46), map: 'front' },
        { ...p(41, 65.5, 46), map: 'front' },
        { ...p(42, 32.9, 50.5), map: 'front' },
        { ...p(43, 39.5, 50.5), map: 'front' },
        { ...p(44, 46, 50.5), map: 'front' },
        { ...p(45, 52.5, 50.5), map: 'front' },
        { ...p(46, 59, 50.5), map: 'front' },
        { ...p(47, 65.5, 50.5), map: 'front' },
        { ...p(48, 32.9, 55), map: 'front' },
        { ...p(49, 39.5, 55), map: 'front' },
        { ...p(50, 46, 55), map: 'front' },
        { ...p(51, 52.5, 55), map: 'front' },
        { ...p(52, 59, 55), map: 'front' },
        { ...p(53, 65.5, 55), map: 'front' },
        { ...p(54, 32.9, 59.5), map: 'front' },
        { ...p(55, 39.5, 59.5), map: 'front' },
        { ...p(56, 46, 59.5), map: 'front' },
        { ...p(57, 52.5, 59.5), map: 'front' },
        { ...p(58, 59, 59.5), map: 'front' },
        { ...p(59, 35, 64), map: 'front' },
        { ...p(60, 42, 64), map: 'front' },
        { ...p(61, 49, 64), map: 'front' },
        { ...p(62, 56, 64), map: 'front' },
        { ...p(63, 63, 64), map: 'front' },
        { ...p(64, 35, 68), map: 'front' },
        { ...p(65, 42, 68), map: 'front' },
        { ...p(66, 49, 68), map: 'front' },
        { ...p(67, 56, 68), map: 'front' },
        { ...p(68, 63, 68), map: 'front' },
        { ...p(69, 35, 72), map: 'front' },
        { ...p(70, 42, 72), map: 'front' },
        { ...p(71, 49, 72), map: 'front' },
        { ...p(72, 56, 72), map: 'front' },
        { ...p(73, 63, 72), map: 'front' }
      ]
    },
    limbs: {
      title: 'الأطراف', image: defaultAtlasImage('limbs'), aspect: BUNDLED_MAP_ASPECTS.limbs,
      points: [
        { ...p(9, 72, 18), map: 'limbs' },
        { ...p(74, 15.9, 20, '1'), map: 'limbs' },
        { ...p(75, 15.9, 28, '1'), map: 'limbs' },
        { ...p(76, 15.9, 36, '1'), map: 'limbs' },
        { ...p(77, 15.9, 44, '1'), map: 'limbs' },
        { ...p(78, 15.9, 52, '1'), map: 'limbs' },
        { ...p(79, 15.9, 60, '1'), map: 'limbs' },
        { ...p(80, 35, 20, '1'), map: 'limbs' },
        { ...p(81, 35, 28, '1'), map: 'limbs' },
        { ...p(82, 35, 36, '1'), map: 'limbs' },
        { ...p(83, 35, 44, '1'), map: 'limbs' },
        { ...p(84, 35, 52, '1'), map: 'limbs' },
        { ...p(85, 35, 60, '1'), map: 'limbs' },
        { ...p(80, 52, 20, '2'), map: 'limbs' },
        { ...p(81, 52, 28, '2'), map: 'limbs' },
        { ...p(82, 52, 36, '2'), map: 'limbs' },
        { ...p(83, 52, 44, '2'), map: 'limbs' },
        { ...p(84, 52, 52, '2'), map: 'limbs' },
        { ...p(85, 52, 60, '2'), map: 'limbs' },
        { ...p(86, 68, 52, '2'), map: 'limbs' },
        { ...p(87, 68, 55.5, '2'), map: 'limbs' },
        { ...p(88, 68, 59, '2'), map: 'limbs' },
        { ...p(89, 68, 62.5, '2'), map: 'limbs' },
        { ...p(90, 68, 66, '2'), map: 'limbs' },
        { ...p(91, 68, 69.5, '2'), map: 'limbs' },
        { ...p(92, 68, 73, '2'), map: 'limbs' },
        { ...p(93, 68, 76.5, '2'), map: 'limbs' },
        { ...p(94, 68, 80, '2'), map: 'limbs' },
        { ...p(95, 68, 83.5, '2'), map: 'limbs' },
        { ...p(96, 68, 86, '2'), map: 'limbs' },
        { ...p(97, 68, 89, '2'), map: 'limbs' },
        { ...p(86, 72, 22.5, '1'), map: 'limbs' },
        { ...p(87, 72, 29, '1'), map: 'limbs' },
        { ...p(88, 72, 35.5, '1'), map: 'limbs' },
        { ...p(89, 72, 42, '1'), map: 'limbs' },
        { ...p(90, 72, 48.5, '1'), map: 'limbs' },
        { ...p(91, 72, 55, '1'), map: 'limbs' },
        { ...p(92, 72, 61.5, '1'), map: 'limbs' },
        { ...p(93, 72, 68, '1'), map: 'limbs' },
        { ...p(94, 72, 74.5, '1'), map: 'limbs' },
        { ...p(95, 72, 81, '1'), map: 'limbs' },
        { ...p(96, 72, 86, '1'), map: 'limbs' },
        { ...p(97, 72, 89, '1'), map: 'limbs' }
      ]
    }
  };

  function ptColorClass(pt) {
    const c = pt.color || (pt.g === 'g' ? 'g' : 'o');
    if (c === 'g') return 'g';
    if (c === 'y') return 'y';
    return 'o';
  }

  function getPointInfo(n) {
    const entry = getPointDbEntry(n);
    if (entry) return { ...entry, n: entry.n };
    const key = String(n);
    const legacy = global._cuppingPointMeta?.[key] || global.settings?.cuppingAtlas?.pointMeta?.[key];
    if (legacy && !legacy.deleted) {
      return {
        n: parseInt(n, 10),
        type: legacy.type || 'therapeutic',
        zone: legacy.zone || `موضع ${n}`,
        conditions: legacy.conditions || [],
        region: legacy.region || null
      };
    }
    return { n: parseInt(n, 10) || 0, type: 'therapeutic', zone: `موضع ${n}`, conditions: [], region: null };
  }

  function pointKey(pt) {
    return pt.side ? `${pt.n}/${pt.side}` : String(pt.n);
  }

  function resolveClientForFile(clientKey, opts) {
    opts = opts || {};
    const cases = global.cases || global.DB?.get('cases', []) || [];
    const clientsRegistry = global.clientsRegistry || global.DB?.get('clientsRegistry', []) || [];
    const findReg = typeof global.findClientInRegistry === 'function'
      ? global.findClientInRegistry
      : (k) => clientsRegistry.find(c => c.key === k);

    let reg = clientKey ? findReg(clientKey) : null;
    let phone = opts.phone || '';
    let name = opts.name || '';

    if (!reg && clientKey) {
      reg = clientsRegistry.find(c => c.key === clientKey || c.phone === clientKey || c.name === clientKey || c.fileNo === clientKey);
    }
    if (!reg && clientKey && clientKey.startsWith('ph:')) {
      phone = clientKey.slice(3);
      reg = clientsRegistry.find(c => c.phone === phone);
    }
    if (!reg && clientKey && clientKey.startsWith('nm:')) {
      name = clientKey.slice(3);
      reg = clientsRegistry.find(c => c.name === name);
    }
    if (reg) {
      if (!phone) phone = reg.phone || '';
      if (!name) name = reg.name || '';
    }

    const tryKeys = new Set([clientKey, phone, name, reg?.key, reg?.phone, reg?.name].filter(Boolean));
    let clientCases = cases.filter(c => tryKeys.has(c.phone || c.name) || tryKeys.has(c.phone) || tryKeys.has(c.name));
    if (!clientCases.length && reg?.fileNo) clientCases = cases.filter(c => c.fileNo === reg.fileNo);
    if (!clientCases.length && opts.fileNo) clientCases = cases.filter(c => c.fileNo === opts.fileNo);
    const sessionKey = reg ? (reg.phone || reg.name || reg.key) : (phone || name || clientKey);
    return { reg, clientCases, phone, name, sessionKey: sessionKey || clientKey };
  }

  function asPointSet(v) {
    if (v instanceof Set) return v;
    return new Set(v || []);
  }

  function renderImageMap(mapId, opts) {
    opts = opts || {};
    const m = CUPPING_MAPS[mapId];
    if (!m) return '';
    const selected = asPointSet(opts.selected);
    const sessionPts = asPointSet(opts.sessionPoints);
    const savedPts = asPointSet(opts.savedPoints);
    const mini = !!opts.mini;
    const interactive = !!opts.interactive;
    const quiet = !!opts.quiet;
    const pointDots = !!opts.pointDots;
    const showLabels = pointDots ? false : (quiet ? false : (opts.showLabels !== false));
    const outlineSelection = !!opts.outlineSelection;
    const pts = (m.points || []).map(pt => {
      const pk = pointKey(pt);
      const isSelected = selected.has(pk);
      const isSession = !outlineSelection && (sessionPts.has(pk) || isSelected);
      const isSaved = !outlineSelection && savedPts.has(pk) && !isSession;
      if (pointDots && !isSession && !isSaved && !isSelected) return '';
      if (!pointDots && !interactive && !isSession && !isSaved) return '';
      const col = ptColorClass(pt);
      const cls = [
        'cup-img-pt', 'cup-img-pt--' + col,
        interactive ? 'cup-img-pt--interactive' : '',
        isSession ? 'cup-img-pt--session' : '',
        isSaved ? 'cup-img-pt--saved' : '',
        outlineSelection && isSelected ? 'cup-img-pt--outline-selected' : '',
        !outlineSelection && isSelected ? 'cup-img-pt--selected' : ''
      ].filter(Boolean).join(' ');
      const attrs = interactive ? ` data-point-key="${pk}" data-point-n="${pt.n}" tabindex="0" role="button"` : '';
      let inner = '';
      if (pointDots) {
        inner = '<span class="cup-img-pt-dot"></span>';
      } else {
        const label = showLabels ? `<span class="cup-img-pt-lbl">${pt.label}</span>` : '';
        const ring = outlineSelection && isSelected
          ? '<span class="cup-img-pt-outline"></span>'
          : ((!outlineSelection && isSelected) ? '<span class="cup-img-pt-ring"></span>' : '');
        inner = ring + label;
      }
      return `<div class="${cls}" style="left:${pt.xp}%;top:${pt.yp}%"${attrs}>${inner}</div>`;
    }).filter(Boolean).join('');

    const leg = opts.legend === false ? '' : `<div class="cup-img-legend">
      <span><i class="dot dot-g"></i>نبوية</span><span><i class="dot dot-o"></i>علاجية</span><span><i class="dot dot-y"></i>علاجية (فاتح)</span></div>`;

    const imgSrc = resolveAssetUrl(m.image);
    const imgHtml = imgSrc
      ? `<img class="cup-img-base" src="${imgSrc}" alt="" loading="eager" decoding="async">`
      : (quiet
        ? '<div class="cup-img-empty cup-img-empty--quiet"></div>'
        : `<div class="cup-img-empty"><span>📷 ${m.title} — ارفع الصورة من الإعدادات</span></div>`);

    return `<div class="cup-img-map${mini ? ' cup-img-map--mini' : ''}${interactive ? ' cup-img-map--interactive' : ''}" data-map-id="${mapId}" style="${mini ? '' : 'width:100%;height:100%;'}aspect-ratio:${m.aspect || '1'}">
      ${imgHtml}
      <div class="cup-img-overlay">${pts}</div>
      ${leg}
    </div>`;
  }

  function formatPointInfoHtml(n) {
    const info = getPointInfo(n);
    const typeLabel = info.type === 'prophetic' ? '🟢 موضع نبوي' : '🟠 موضع علاجي';
    const conds = (info.conditions || []).map(c => `<li>${c}</li>`).join('');
    return `<div class="cup-info-type">${typeLabel}</div>
      <div class="cup-info-title">موضع ${n} — ${info.zone || ''}</div>
      ${conds ? `<ul class="cup-info-conds">${conds}</ul>` : '<div class="cup-info-zone" style="color:#888">لا توجد بيانات إضافية</div>'}`;
  }

  function renderClientFileMapHtml(which, mapOpts) {
    mapOpts = mapOpts || {};
    ensureCuppingMapsReady();
    if (typeof global.renderFreeformPrintHtml === 'function') {
      return global.renderFreeformPrintHtml(which, which === 'mini', null, mapOpts);
    }
    const maps = getCuppingPrintMaps(which);
    return maps.map(({ id }) => renderImageMap(id, {
      mini: which === 'mini',
      legend: false,
      quiet: false,
      pointDots: !!mapOpts.pointDots,
      sessionPoints: mapOpts.sessionPoints,
      savedPoints: mapOpts.savedPoints,
      interactive: !!mapOpts.interactive,
      selected: mapOpts.selected,
      outlineSelection: !!mapOpts.outlineSelection
    })).join('');
  }

  function mountPuzzleCuppingMap(container, state, callbacks) {
    if (!container) return;
    ensureCuppingMapsReady();
    callbacks = callbacks || {};
    state = state || { selected: new Set(), savedPoints: new Set() };
    if (!(state.selected instanceof Set)) state.selected = new Set(state.selected || []);
    if (!(state.savedPoints instanceof Set)) state.savedPoints = new Set(state.savedPoints || []);

    container.innerHTML = `<div class="cup-puzzle-shell">
      <div class="cup-puzzle-legend">
        <span><i class="cup-leg-dot cup-leg-dot--session"></i>مواضع الجلسة الحالية</span>
        <span><i class="cup-leg-dot cup-leg-dot--saved"></i>مواضع سابقة</span>
        <span class="cup-puzzle-hint">Ctrl+نقرة لتحديد/إلغاء الموضع</span>
      </div>
      <div class="cup-puzzle-stage" id="cup-puzzle-stage"></div>
      <div class="cup-map-info" id="cup-puzzle-info"><span class="cup-info-hint">انقر رقماً لعرض التفاصيل — الخريطة الكاملة (الأحجية)</span></div>
    </div>`;

    const stage = container.querySelector('#cup-puzzle-stage');
    const info = container.querySelector('#cup-puzzle-info');

    function renderStage() {
      stage.innerHTML = renderClientFileMapHtml('full', {
        interactive: true,
        hideLabels: false,
        pointDots: false,
        outlineSelection: true,
        legend: false,
        selected: state.selected,
        sessionPoints: new Set(),
        savedPoints: new Set()
      });
      stage.querySelectorAll('.cup-img-pt--interactive').forEach(el => {
        el.addEventListener('click', (ev) => {
          const pk = el.getAttribute('data-point-key');
          const pn = parseInt(el.getAttribute('data-point-n'), 10);
          if (ev.ctrlKey || ev.metaKey || ev.shiftKey) {
            if (state.selected.has(pk)) state.selected.delete(pk);
            else state.selected.add(pk);
            renderStage();
            if (callbacks.onSelectionChange) callbacks.onSelectionChange([...state.selected]);
            return;
          }
          info.innerHTML = formatPointInfoHtml(pn);
          if (callbacks.onPointClick) callbacks.onPointClick(pn, pk);
        });
      });
    }
    renderStage();
  }

  function mountInteractiveCuppingMap(container, state, callbacks) {
    if (!container) return;
    callbacks = callbacks || {};
    state = state || { mapId: 'back', selected: new Set() };
    if (!(state.selected instanceof Set)) state.selected = new Set(state.selected || []);
    const mapIds = ['head', 'back', 'front', 'limbs'];

    container.innerHTML = `<div class="cup-map-shell">
      <div class="cup-map-tabs">${mapIds.map(id => {
        const active = id === state.mapId ? ' cup-map-tab--active' : '';
        return `<button type="button" class="cup-map-tab${active}" data-map-tab="${id}">${CUPPING_MAPS[id].title}</button>`;
      }).join('')}</div>
      <div class="cup-map-stage" id="cup-map-stage"></div>
      <div class="cup-map-info" id="cup-map-info"><span class="cup-info-hint">انقر رقماً لعرض الأمراض — Ctrl+نقرة لتسجيل الموضع</span></div>
    </div>`;

    const stage = container.querySelector('#cup-map-stage');
    const info = container.querySelector('#cup-map-info');

    function renderStage() {
      stage.innerHTML = renderImageMap(state.mapId, { interactive: true, selected: state.selected, legend: true });
      stage.querySelectorAll('.cup-img-pt--interactive').forEach(el => {
        el.addEventListener('click', (ev) => {
          const pk = el.getAttribute('data-point-key');
          const pn = parseInt(el.getAttribute('data-point-n'), 10);
          if (ev.ctrlKey || ev.metaKey || ev.shiftKey) {
            if (state.selected.has(pk)) state.selected.delete(pk);
            else state.selected.add(pk);
            renderStage();
            if (callbacks.onSelectionChange) callbacks.onSelectionChange([...state.selected]);
          }
          info.innerHTML = formatPointInfoHtml(pn);
          if (callbacks.onPointClick) callbacks.onPointClick(pn, pk);
        });
      });
    }

    container.querySelectorAll('[data-map-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.mapId = btn.getAttribute('data-map-tab');
        container.querySelectorAll('.cup-map-tab').forEach(b => b.classList.toggle('cup-map-tab--active', b === btn));
        renderStage();
      });
    });
    renderStage();
  }

  function applyCuppingAtlasConfig(cfg) {
    if (!cfg) cfg = {};
    const { cfg: migrated, changed } = migrateCuppingAtlasConfig(cfg);
    cfg = migrated;
    cfg.maps = sanitizeCuppingAtlasMaps(cfg.maps);
    stripComposedMapImages(cfg.template);
    const defaults = getDefaultAtlasMaps();
    const ids = ['head', 'back', 'front', 'limbs'];
    ids.forEach(id => {
      const img = sanitizeMapImageSrc(cfg.maps?.[id]?.image, id);
      CUPPING_MAPS[id].image = img || defaults[id].image || '';
      if (cfg.maps?.[id]?.aspect) CUPPING_MAPS[id].aspect = cfg.maps[id].aspect;
    });
    if (cfg.points?.length) {
      ids.forEach(id => {
        CUPPING_MAPS[id].points = cfg.points.filter(p => p.map === id).map(p => ({
          n: p.n,
          xp: p.xp,
          yp: p.yp,
          side: p.side || null,
          color: p.color || 'o',
          g: (p.color === 'g') ? 'g' : 'o',
          label: p.label || (p.side ? `${p.n}/${p.side}` : String(p.n)),
          map: id
        }));
      });
    }
    global._cuppingPointMeta = cfg.pointMeta || {};
    global._cuppingPointDb = cfg.pointDb || {};
    if (cfg.template) global._cuppingTemplate = stripComposedMapImages(cfg.template);
    return changed ? cfg : null;
  }

  function ensureCuppingMapsReady() {
    const cfg = global.settings?.cuppingAtlas;
    if (cfg) applyCuppingAtlasConfig(cfg);
    else {
      const defaults = getDefaultAtlasMaps();
      MAP_IDS.forEach(id => {
        CUPPING_MAPS[id].image = defaults[id].image;
        if (!CUPPING_MAPS[id].aspect) CUPPING_MAPS[id].aspect = defaults[id].aspect;
      });
    }
    return CUPPING_MAPS;
  }

  global.resolveAssetUrl = resolveAssetUrl;
  global.sanitizeMapImageSrc = sanitizeMapImageSrc;
  global.sanitizeCuppingAtlasMaps = sanitizeCuppingAtlasMaps;
  global.ALLOWED_MAP_FILES = ALLOWED_MAP_FILES;

  global.CUPPING_POINT_INFO = CUPPING_POINT_INFO;
  global.getPointDbEntry = getPointDbEntry;
  global.listPointDbEntries = listPointDbEntries;
  global.defaultMapForPoint = defaultMapForPoint;
  global.pointDbColor = pointDbColor;
  global.REGION_DEFAULT_MAP = REGION_DEFAULT_MAP;
  global.CUPPING_MAPS = CUPPING_MAPS;
  global.getPointInfo = getPointInfo;
  global.resolveClientForFile = resolveClientForFile;
  global.renderImageMap = renderImageMap;
  global.renderAtlasMapSvg = renderImageMap;
  global.renderCuppingMapSvg = renderImageMap;
  global.formatPointInfoHtml = formatPointInfoHtml;
  global.mountInteractiveCuppingMap = mountInteractiveCuppingMap;
  global.mountPuzzleCuppingMap = mountPuzzleCuppingMap;
  global.renderClientFileMapHtml = renderClientFileMapHtml;
  global.getDefaultAtlasMaps = getDefaultAtlasMaps;
  global.defaultAtlasImage = defaultAtlasImage;
  global.BUNDLED_MAP_PATHS = BUNDLED_MAP_PATHS;
  global.ATLAS_ASSET_VER = ATLAS_ASSET_VER;
  global.migrateCuppingAtlasConfig = migrateCuppingAtlasConfig;
  global.applyCuppingAtlasConfig = applyCuppingAtlasConfig;
  global.ensureCuppingMapsReady = ensureCuppingMapsReady;
  global.getCuppingTemplateLayout = getCuppingTemplateLayout;
  global.getCuppingPrintMaps = getCuppingPrintMaps;
  global.getDefaultCuppingTemplate = getDefaultCuppingTemplate;
  global.cuppingPointKey = pointKey;

})(typeof window !== 'undefined' ? window : globalThis);
