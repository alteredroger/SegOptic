/* SegOptic — interfaz */
(function () {
  'use strict';
  const O = window.SegOptic;
  const $ = (s, r) => (r || document).querySelector(s);
  const STORE = 'segoptic.v1';

  // ---------------- utilidades ----------------
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
    return e;
  }
  const fmt = (v, d = 3) => {
    if (v === Infinity || v === -Infinity) return 'Infinity';
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(Math.max(1, d - 1));
    return (+v.toFixed(d)).toString();
  };
  function parseNum(s, allowInf) {
    const t = String(s).trim().toLowerCase();
    if (allowInf && (t === '' || t === 'inf' || t === 'infinity' || t === '∞' || t === '0')) return Infinity;
    const v = parseFloat(t.replace(',', '.'));
    return isFinite(v) ? v : NaN;
  }
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  function setupCanvas(cv, w, hgt) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr);
    cv.style.width = w + 'px'; cv.style.aspectRatio = w + ' / ' + hgt; cv.style.height = 'auto';
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = css('--plot-bg'); g.fillRect(0, 0, w, hgt);
    return g;
  }
  const WLCOL = (wl) => { // color aproximado por longitud de onda (µm)
    const l = wl * 1000; let r = 0, g = 0, b = 0;
    if (l < 440) { r = (440 - l) / 60; b = 1; } else if (l < 490) { g = (l - 440) / 50; b = 1; }
    else if (l < 510) { g = 1; b = (510 - l) / 20; } else if (l < 580) { r = (l - 510) / 70; g = 1; }
    else if (l < 645) { r = 1; g = (645 - l) / 65; } else { r = 1; }
    if (l < 400 || l > 780) { r = g = b = 0.7; }
    return `rgb(${Math.round(60 + 195 * r)},${Math.round(60 + 195 * g)},${Math.round(60 + 195 * b)})`;
  };
  const SER = ['#f2a33a', '#5cc8e6', '#b38cf0', '#59c98a', '#ef6b6b', '#e8c35a'];
  function lerpStops(stops, t) {
    t = Math.max(0, Math.min(1, t));
    const n = stops.length - 1, x = t * n, i = Math.min(n - 1, Math.floor(x)), f = x - i;
    return stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  }
  const INFERNO = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
  const DIVERG = [[33, 82, 168], [67, 147, 195], [146, 197, 222], [222, 226, 230], [244, 165, 130], [214, 96, 77], [178, 24, 43]];

  function lineChart(cv, o) {
    const W = o.w || 520, H = o.h || 300, g = setupCanvas(cv, W, H);
    const m = { l: 58, r: 14, t: 14, b: 40 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    let xs = [], ys = [];
    o.series.forEach(s => s.x.forEach((x, i) => { if (isFinite(x) && isFinite(s.y[i]) && (!o.logy || s.y[i] > 0)) { xs.push(x); ys.push(s.y[i]); } }));
    if (!xs.length) { g.fillStyle = css('--ink3'); g.fillText('Sin datos', 20, 30); return; }
    let x0 = o.xmin != null ? o.xmin : Math.min(...xs), x1 = o.xmax != null ? o.xmax : Math.max(...xs);
    let y0 = o.ymin != null ? o.ymin : Math.min(...ys), y1 = o.ymax != null ? o.ymax : Math.max(...ys);
    if (o.logy) { y0 = Math.log10(Math.max(1e-12, y0)); y1 = Math.log10(Math.max(1e-12, y1)); y0 = Math.floor(y0); y1 = Math.ceil(y1); if (y1 === y0) y1 = y0 + 1; }
    else { if (y1 === y0) { y1 += 1; y0 -= 1; } if (o.ymin == null) { const p = (y1 - y0) * 0.06; y0 -= p; y1 += p; } }
    if (x1 === x0) x1 = x0 + 1;
    const X = x => m.l + (x - x0) / (x1 - x0) * pw;
    const Y = y => m.t + ph - ((o.logy ? Math.log10(Math.max(1e-12, y)) : y) - y0) / (y1 - y0) * ph;
    g.font = '11px IBM Plex Mono, monospace'; g.strokeStyle = css('--line'); g.fillStyle = css('--ink3'); g.lineWidth = 1;
    const nt = 5;
    for (let i = 0; i <= nt; i++) {
      const xv = x0 + (x1 - x0) * i / nt, px = X(xv);
      g.beginPath(); g.moveTo(px, m.t); g.lineTo(px, m.t + ph); g.stroke();
      g.textAlign = 'center'; g.fillText(fmt(xv, 2), px, m.t + ph + 14);
    }
    if (o.logy) {
      for (let e = y0; e <= y1; e++) { const py = Y(Math.pow(10, e)); g.beginPath(); g.moveTo(m.l, py); g.lineTo(m.l + pw, py); g.stroke(); g.textAlign = 'right'; g.fillText('1e' + e, m.l - 6, py + 4); }
    } else {
      for (let i = 0; i <= nt; i++) { const yv = y0 + (y1 - y0) * i / nt, py = Y(yv); g.beginPath(); g.moveTo(m.l, py); g.lineTo(m.l + pw, py); g.stroke(); g.textAlign = 'right'; g.fillText(fmt(yv, 2), m.l - 6, py + 4); }
    }
    g.fillStyle = css('--ink2'); g.font = '12px IBM Plex Sans, sans-serif'; g.textAlign = 'center';
    if (o.xlab) g.fillText(o.xlab, m.l + pw / 2, H - 6);
    if (o.ylab) { g.save(); g.translate(13, m.t + ph / 2); g.rotate(-Math.PI / 2); g.fillText(o.ylab, 0, 0); g.restore(); }
    g.save(); g.beginPath(); g.rect(m.l, m.t, pw, ph); g.clip();
    (o.vlines || []).forEach(v => { g.strokeStyle = css('--ink3'); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(v.x), m.t); g.lineTo(X(v.x), m.t + ph); g.stroke(); g.setLineDash([]); if (v.label) { g.fillStyle = css('--ink3'); g.textAlign = 'left'; g.fillText(v.label, X(v.x) + 4, m.t + 12); } });
    (o.hlines || []).forEach(v => { g.strokeStyle = v.color || css('--ink3'); g.setLineDash([5, 4]); g.beginPath(); g.moveTo(m.l, Y(v.y)); g.lineTo(m.l + pw, Y(v.y)); g.stroke(); g.setLineDash([]); if (v.label) { g.fillStyle = v.color || css('--ink3'); g.textAlign = 'right'; g.fillText(v.label, m.l + pw - 4, Y(v.y) - 4); } });
    o.series.forEach((s, si) => {
      g.strokeStyle = s.color || SER[si % SER.length]; g.lineWidth = s.width || 1.8; g.setLineDash(s.dash || []);
      g.beginPath(); let st = false;
      s.x.forEach((x, i) => { const y = s.y[i]; if (!isFinite(x) || !isFinite(y) || (o.logy && y <= 0)) { st = false; return; } const px = X(x), py = Y(y); if (!st) { g.moveTo(px, py); st = true; } else g.lineTo(px, py); });
      g.stroke(); g.setLineDash([]);
    });
    g.restore();
    g.strokeStyle = css('--line2'); g.strokeRect(m.l, m.t, pw, ph);
  }
  function legend(items) { return h('div', { class: 'legend' }, items.map(([c, t]) => h('span', { style: '--c:' + c }, t))); }
  function stat(k, v, cls) { return h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v ' + (cls || ''), html: v })); }
  function num(val, on, step, attrs) {
    return h('input', Object.assign({ type: 'number', value: val, step: step || 'any', onchange: e => on(parseFloat(e.target.value)) }, attrs || {}));
  }

  // ---------------- estado ----------------
  let sys, ctx, par;
  const ui = {
    tab: 'bench', sel: null, insert: null, bview: '2d', bmode: 'move', benchRays: 11, v2: null, v3: null,
    field: 0, wl: null, spotN: 21, spotCommon: false, opdN: 64, removeTilt: true,
    psfN: 128, psfLog: true, layoutZoom: false,
    rnd: { p: 50, t: 1, dR: 0 }, sens: { delta: 20, ra: 55, aphi: 0, nPerGap: 2 },
    loop: { iters: 40, gain: 0.5, sNoise: 2, quant: 5, p0: 2000, t0: 20, drift: 0, calOn: true, calEvery: 10, calNoise: 10 },
    cg: { D: 480, R1: -2425, F: 2940, b: 250, field: 0.273 },
    act: { pitch: 0.5, steps: 200, micro: 16, ratio: 1, lever: 1, wl: 0.55 },
    mc: { trials: 100, p: 30, t: 0.3, dR: 0, N: 40 }
  };

  function jsonOut(o) { return JSON.stringify(o, (k, v) => (v === Infinity ? 'Infinity' : v === -Infinity ? '-Infinity' : v), 1); }
  function jsonIn(s) { return JSON.parse(s, (k, v) => (v === 'Infinity' ? Infinity : v === '-Infinity' ? -Infinity : v)); }
  function normalize(s) {
    s.aperture = Object.assign({ type: 'segmented', D: 480, obsc: 0, nseg: 6, dseg: 150, ringR: 165, rot: 90 }, s.aperture || {});
    s.wavelengths = (s.wavelengths && s.wavelengths.length) ? s.wavelengths : [{ wl: 0.55, w: 1 }];
    s.primary = Math.min(s.primary || 0, s.wavelengths.length - 1);
    s.fields = (s.fields && s.fields.length) ? s.fields : [{ y: 0, w: 1 }];
    s.vary = s.vary || {};
    s.merit = Object.assign({ eflTarget: 0, eflW: 10, grid: 13 }, s.merit || {});
    const n = s.aperture.nseg | 0;
    s.segments = s.segments || [];
    while (s.segments.length < n) s.segments.push({ p: 0, tx: 0, ty: 0, dR: 0 });
    s.segments.length = Math.max(0, n);
    s.perturb = Array.isArray(s.perturb) ? s.perturb : [];
    s.req = Object.assign({ efl: 0, eflTol: 1, fnoEq: 0, fnoTol: 5, bfMin: 200, seeing: 2, budget: 0.5, uniMax: 1.25, planetary: true, strehlMin: 0.8, strehlR: 2, vigMax: 20, distMax: 1, ctMin: 1, etMin: 1 }, s.req || {});
    s.tol = Object.assign({ els: {}, seg: { t: 1, dR: 0.2, p: 50 }, trials: 100, refocus: true }, s.tol || {});
    s.surfaces.forEach(x => { x.a4 = +x.a4 || 0; x.a6 = +x.a6 || 0; x.a8 = +x.a8 || 0; });
    s.surfaces.forEach(x => { x.k = +x.k || 0; x.sd = +x.sd || 0; x.hole = +x.hole || 0; if (x.mat == null) x.mat = ''; if (x.cm == null) x.cm = ''; });
    return s;
  }
  function save() { try { localStorage.setItem(STORE, jsonOut(sys)); } catch (e) { /* almacenamiento no disponible */ } }
  function load() { try { const t = localStorage.getItem(STORE); return t ? normalize(jsonIn(t)) : null; } catch (e) { return null; } }

  function rebuild() {
    ctx = O.buildCtx(sys);
    par = O.paraxial(ctx, sys);
    if (ui.wl == null || ui.wl >= sys.wavelengths.length) ui.wl = sys.primary;
    if (ui.field >= sys.fields.length) ui.field = 0;
  }
  // historial (deshacer/rehacer)
  const hist = { st: [], i: -1, t: null };
  function pushHist() {
    normalize(sys); // estado canónico: evita entradas «distintas» solo por campos por defecto
    const s = jsonOut(sys);
    if (hist.st[hist.i] === s) return;
    hist.st = hist.st.slice(0, hist.i + 1); hist.st.push(s);
    if (hist.st.length > 150) hist.st.shift();
    hist.i = hist.st.length - 1; updUndo();
  }
  function updUndo() { const u = $('#btnUndo'), r = $('#btnRedo'); if (u) u.disabled = hist.i <= 0; if (r) r.disabled = hist.i >= hist.st.length - 1; }
  function undo() { clearTimeout(hist.t); pushHist(); if (hist.i <= 0) return; hist.i--; sys = normalize(jsonIn(hist.st[hist.i])); fixSel(); changed({ lde: true, sys: true, now: true, noHist: true }); updUndo(); }
  function redo() { if (hist.i >= hist.st.length - 1) return; hist.i++; sys = normalize(jsonIn(hist.st[hist.i])); fixSel(); changed({ lde: true, sys: true, now: true, noHist: true }); updUndo(); }
  function fixSel() { if (ui.sel != null && (ui.sel < 1 || ui.sel >= sys.surfaces.length)) ui.sel = null; }
  function selectSurface(i) {
    ui.sel = i; markSelRow();
    if (bench && bench.root.isConnected) bench.onSelect();
  }
  function markSelRow() { const T = $('#lde'); if (!T) return; [...T.rows].forEach((r, k) => r.classList.toggle('sel', k - 1 === ui.sel)); }

  let timer = null;
  function changed(opts) {
    opts = opts || {};
    rebuild(); save(); fixSel();
    if (!opts.noHist) { clearTimeout(hist.t); hist.t = setTimeout(pushHist, 300); }
    if (opts.lde) renderLDE();
    if (opts.sys) renderSys();
    renderQuick();
    clearTimeout(timer);
    timer = setTimeout(renderTab, opts.now ? 0 : 250);
  }

  // ---------------- panel de sistema ----------------
  function renderSys() {
    const P = $('#sysPanel'); P.innerHTML = '';
    const ap = sys.aperture;
    const setAp = (k) => v => { if (!isFinite(v)) return; ap[k] = v; if (k === 'nseg') { normalize(sys); } changed({ now: false }); renderQuick(); };
    const typeSel = h('select', { onchange: e => { ap.type = e.target.value; changed({ sys: true }); } },
      [['segmented', 'Anillo de segmentos circulares'], ['circular', 'Circular (con obstrucción)']].map(([v, t]) => h('option', { value: v, selected: ap.type === v }, t)));
    const g = h('div', { class: 'grid2' }, h('label', null, 'Apertura'), typeSel);
    if (ap.type === 'segmented') {
      g.append(h('label', null, 'Nº segmentos'), num(ap.nseg, v => { if (v >= 1) { ap.nseg = Math.round(v); normalize(sys); changed({}); } }, 1, { min: 1 }));
      g.append(h('label', null, 'Ø segmento [mm]'), num(ap.dseg, setAp('dseg')));
      g.append(h('label', null, 'Radio del anillo [mm]'), num(ap.ringR, setAp('ringR')));
      g.append(h('label', null, 'Rotación [°]'), num(ap.rot, setAp('rot')));
    } else {
      g.append(h('label', null, 'Ø pupila [mm]'), num(ap.D, setAp('D')));
    }
    g.append(h('label', null, 'Obstrucción Ø [mm]'), num(ap.obsc, setAp('obsc')));
    P.append(g);
    P.append(h('p', { class: 'hint' }, ap.type === 'segmented'
      ? 'Marca con la casilla «Seg» la superficie segmentada (normalmente el primario, superficie 1 = pupila de entrada).'
      : 'Pupila circular en la superficie 1.'));

    // longitudes de onda
    P.append(h('h3', null, 'Longitudes de onda [µm]'));
    const tw = h('table', { class: 'mini' }, h('tr', null, h('th', null, 'λ'), h('th', null, 'peso'), h('th', null, 'prim.'), h('th')));
    sys.wavelengths.forEach((w, i) => tw.append(h('tr', null,
      h('td', null, num(w.wl, v => { if (v > 0.2 && v < 15) { w.wl = v; changed({}); } }, 0.01)),
      h('td', null, num(w.w, v => { if (v >= 0) { w.w = v; changed({}); } }, 0.1)),
      h('td', null, h('input', { type: 'radio', name: 'prim', checked: sys.primary === i, onchange: () => { sys.primary = i; changed({}); } })),
      h('td', null, sys.wavelengths.length > 1 ? h('button', { class: 'small', onclick: () => { sys.wavelengths.splice(i, 1); sys.primary = Math.min(sys.primary, sys.wavelengths.length - 1); changed({ sys: true }); } }, '×') : null))));
    P.append(tw, h('button', { class: 'small', onclick: () => { sys.wavelengths.push({ wl: 0.6, w: 1 }); changed({ sys: true }); } }, '+ λ'));

    // campos
    P.append(h('h3', null, 'Campos (ángulo en Y) [°]'));
    const tf = h('table', { class: 'mini' }, h('tr', null, h('th', null, 'θy'), h('th', null, 'peso'), h('th', null, 'imagen'), h('th')));
    sys.fields.forEach((f, i) => tf.append(h('tr', null,
      h('td', null, num(f.y, v => { if (isFinite(v)) { f.y = v; changed({}); } }, 0.01)),
      h('td', null, num(f.w, v => { if (v >= 0) { f.w = v; changed({}); } }, 0.1)),
      h('td', { class: 'hint' }, par ? fmt(par.efl * Math.tan(f.y * Math.PI / 180), 2) + ' mm' : ''),
      h('td', null, sys.fields.length > 1 ? h('button', { class: 'small', onclick: () => { sys.fields.splice(i, 1); changed({ sys: true }); } }, '×') : null))));
    P.append(tf, h('button', { class: 'small', onclick: () => { const l = sys.fields[sys.fields.length - 1]; sys.fields.push({ y: +(l.y + 0.1).toFixed(3), w: 1 }); changed({ sys: true }); } }, '+ campo'));
  }

  // ---------------- editor de superficies ----------------
  function shiftVary(from, delta) {
    const nv = {};
    for (const k in sys.vary) { const [i, p] = k.split(':'); const ii = +i; if (delta < 0 && ii === from) continue; nv[(ii >= from ? ii + delta : ii) + ':' + p] = sys.vary[k]; }
    sys.vary = nv;
    // los grupos de descentrado siguen a sus superficies
    sys.perturb = (sys.perturb || []).filter(g => {
      if (delta > 0) { if (g.from >= from) g.from += delta; if (g.to >= from) g.to += delta; return true; }
      if (g.from > from) g.from--; if (g.to >= from) g.to--;
      return g.to >= g.from && g.from >= 1;
    });
  }
  function renderLDE() {
    const T = $('#lde'); T.innerHTML = '';
    const L = sys.surfaces.length - 1;
    const showA = ui.showAsph || sys.surfaces.some(x => x.a4 || x.a6 || x.a8);
    const cb = $('#chkAsph'); if (cb) cb.checked = showA;
    T.append(h('tr', null, ['#', 'Comentario', 'Radio', 'Espesor', 'Material', 'Semi-Ø', 'Agujero r', 'Cónica'].concat(showA ? ['A4 [mm⁻³]', 'A6 [mm⁻⁵]', 'A8 [mm⁻⁷]'] : []).concat(['Seg', '']).map(t => h('th', null, t))));
    sys.surfaces.forEach((s, i) => {
      const isObj = i === 0, isImg = i === L;
      const inp = (key, allowInf, disabled, cls) => {
        const val = s[key];
        const e = h('input', { type: 'text', class: cls || '', value: key === 'mat' || key === 'cm' ? val : fmt(val, 6), disabled: disabled || false });
        e.addEventListener('change', () => {
          if (key === 'mat' || key === 'cm') { s[key] = e.value.trim(); if (key === 'mat') { const bad = !O.isMirror(s.mat) && !(O.glassIndex(s.mat, 0.55) > 0); e.classList.toggle('bad-in', bad); T.rows[i + 1].classList.toggle('mir', O.isMirror(s.mat)); } }
          else { const v = parseNum(e.value, allowInf); if (isNaN(v)) { e.classList.add('bad-in'); return; } e.classList.remove('bad-in'); s[key] = v; }
          changed({});
        });
        return e;
      };
      const vb = (key) => {
        const k = i + ':' + key, b = h('button', { class: 'vbtn' + (sys.vary[k] ? ' on' : ''), title: 'Variable para optimización' }, 'V');
        b.onclick = () => { if (sys.vary[k]) delete sys.vary[k]; else sys.vary[k] = true; b.classList.toggle('on'); save(); if (ui.tab === 'optim') renderTab(); };
        return b;
      };
      const cell = (el, key) => h('td', null, h('div', { class: 'cellv' }, el, (!isObj && key) ? vb(key) : null));
      const tr = h('tr', { class: O.isMirror(s.mat) ? 'mir' : '' },
        h('td', { class: 'num' }, isObj ? 'OBJ' : isImg ? 'IMA' : i === 1 ? 'STO' : i),
        h('td', null, inp('cm', false, false, 'cm')),
        cell(inp('r', true, isObj), isObj ? null : 'r'),
        cell(inp('t', true, isObj || isImg), (isObj || isImg) ? null : 't'),
        h('td', null, inp('mat', false, isObj || isImg)),
        h('td', null, inp('sd', false, isObj)),
        h('td', null, inp('hole', false, isObj)),
        cell(inp('k', false, isObj), isObj ? null : 'k'),
        showA ? cell(inp('a4', false, isObj), isObj ? null : 'a4') : null,
        showA ? cell(inp('a6', false, isObj), isObj ? null : 'a6') : null,
        showA ? cell(inp('a8', false, isObj), isObj ? null : 'a8') : null,
        h('td', null, (!isObj && !isImg) ? h('input', { type: 'checkbox', checked: !!s.seg, title: 'Superficie segmentada', onchange: e => { sys.surfaces.forEach(x => delete x.seg); if (e.target.checked) s.seg = true; changed({ lde: true }); } }) : ''),
        h('td', null, isImg ? '' : h('button', { class: 'small', title: 'Insertar superficie después', onclick: () => { shiftVary(i + 1, 1); sys.surfaces.splice(i + 1, 0, { cm: '', r: Infinity, t: 10, mat: '', sd: 0, hole: 0, k: 0 }); changed({ lde: true }); } }, '+'),
          ' ', (!isObj && !isImg) ? h('button', { class: 'small', title: 'Eliminar', onclick: () => { shiftVary(i, -1); sys.surfaces.splice(i, 1); changed({ lde: true }); } }, '−') : '')
      );
      tr.addEventListener('click', () => { if (ui.sel !== i && i > 0) selectSurface(i); });
      T.append(tr);
    });
    markSelRow();
  }
  function renderQuick() {
    const q = $('#quick'); q.innerHTML = '';
    if (!par) { q.append(h('span', { class: 'ko' }, 'No se puede calcular el sistema paraxial (revisa la prescripción).')); return; }
    const lp = sys.wavelengths[sys.primary].wl;
    const items = [
      ['EFL', fmt(par.efl, 2) + ' mm'], ['F/# (EPD)', fmt(par.fno, 3)], ['F/# (Ø equiv.)', fmt(par.fnoEq, 3)],
      ['Foco paraxial tras últ. sup.', fmt(par.bfl, 2) + ' mm'], ['EPD', fmt(par.epd, 1) + ' mm'],
      ['Escala', fmt(par.plate, 2) + ' ″/mm'], ['Airy r', fmt(1.22 * lp * Math.abs(par.fno), 2) + ' µm']
    ];
    items.forEach(([k, v]) => q.append(h('span', null, k + ' ', h('b', null, v))));
    $('#sysName').textContent = sys.name || 'Sistema sin nombre';
  }

  // ---------------- pestañas ----------------
  const TABS = [
    ['bench', 'Banco óptico'], ['valid', 'Validación'], ['summary', 'Resumen'], ['layout', 'Layout 2D'], ['spot', 'Spot'], ['opd', 'Frente de onda'], ['psf', 'PSF / MTF'],
    ['segments', 'Segmentos y co-faseo'], ['decenter', 'Descentrados'], ['optim', 'Optimización'], ['tools', 'Herramientas']
  ];
  function renderTabs() {
    const n = $('#tabs'); n.innerHTML = '';
    TABS.forEach(([k, t]) => n.append(h('button', { class: ui.tab === k ? 'on' : '', role: 'tab', onclick: () => { ui.tab = k; renderTabs(); renderTab(); } }, t)));
  }
  function renderTab() {
    const P = $('#panel');
    if (ui.tab === 'bench' && bench && bench.root.isConnected) { try { bench.refresh(); } catch (e) { console.error(e); } return; }
    P.innerHTML = '';
    try { ({ bench: tabBench, valid: tabValid, decenter: tabDecenter, summary: tabSummary, layout: tabLayout, spot: tabSpot, opd: tabOPD, psf: tabPSF, segments: tabSegments, optim: tabOptim, tools: tabTools })[ui.tab](P); }
    catch (e) { console.error(e); P.append(h('div', { class: 'note bad' }, 'Error en el cálculo: ' + e.message)); }
  }
  function selField() {
    return h('label', null, 'Campo', h('select', { onchange: e => { ui.field = +e.target.value; renderTab(); } }, sys.fields.map((f, i) => h('option', { value: i, selected: ui.field === i }, fmt(f.y, 3) + '°'))));
  }
  function selWl() {
    return h('label', null, 'λ', h('select', { onchange: e => { ui.wl = +e.target.value; renderTab(); } }, sys.wavelengths.map((w, i) => h('option', { value: i, selected: ui.wl === i }, w.wl + ' µm'))));
  }
  function defer(P, msg, fn) {
    const b = h('div', { class: 'busy' }, msg || 'Calculando…'); P.append(b);
    setTimeout(() => { b.remove(); try { fn(); } catch (e) { console.error(e); P.append(h('div', { class: 'note bad' }, 'Error: ' + e.message)); } }, 20);
  }

  // ---------- Resumen ----------
  function prescriptionText() {
    const L = sys.surfaces.length - 1;
    const pad = (s, n) => String(s).padEnd(n), lp = (s, n) => String(s).padStart(n);
    let t = `SegOptic — ${sys.name || ''}\nFecha: ${new Date().toISOString().slice(0, 10)}\n\n`;
    const ap = sys.aperture;
    t += ap.type === 'segmented'
      ? `Apertura: ${ap.nseg} segmentos Ø${ap.dseg} mm en anillo R=${ap.ringR} mm, rot ${ap.rot}°, obstrucción Ø${ap.obsc} mm\n`
      : `Apertura: circular Ø${ap.D} mm, obstrucción Ø${ap.obsc} mm\n`;
    t += `λ [µm]: ${sys.wavelengths.map((w, i) => w.wl + (i === sys.primary ? '*' : '')).join(', ')}\nCampos [°]: ${sys.fields.map(f => f.y).join(', ')}\n`;
    if (par) t += `EFL ${fmt(par.efl, 3)} mm · F/# ${fmt(par.fno, 3)} · foco paraxial ${fmt(par.bfl, 3)} mm tras la sup. ${L - 1}\n`;
    t += '\n' + pad('Sup', 5) + pad('Comentario', 34) + lp('Radio', 14) + lp('Espesor', 12) + '  ' + pad('Material', 10) + lp('Semi-Ø', 9) + lp('Agujero', 9) + lp('Cónica', 11) + '\n';
    sys.surfaces.forEach((s, i) => {
      t += pad(i === 0 ? 'OBJ' : i === L ? 'IMA' : (i === 1 ? 'STO' : i), 5) + pad((s.cm || '').slice(0, 33) + (s.seg ? ' [SEG]' : ''), 34) + lp(fmt(s.r, 4), 14) + lp(i === L ? '' : fmt(s.t, 4), 12) + '  ' + pad(s.mat || '', 10) + lp(fmt(s.sd, 2), 9) + lp(fmt(s.hole, 2), 9) + lp(fmt(s.k, 6), 11) + '\n';
    });
    if (ap.type === 'segmented' && sys.segments.some(e => e.p || e.tx || e.ty || e.dR)) {
      t += '\nErrores de segmento (p nm, tx µrad, ty µrad, ΔR mm):\n';
      sys.segments.forEach((e, i) => { t += `  S${i + 1}: ${e.p}, ${e.tx}, ${e.ty}, ${e.dR}\n`; });
    }
    const asp = sys.surfaces.map((x, i) => [i, x]).filter(([i, x]) => x.a4 || x.a6 || x.a8);
    if (asp.length) {
      t += '\nCoeficientes asféricos (sag += A4 r⁴ + A6 r⁶ + A8 r⁸):\n';
      asp.forEach(([i, x]) => { t += `  Sup. ${i}: A4 = ${x.a4.toExponential(6)}  A6 = ${x.a6.toExponential(6)}  A8 = ${x.a8.toExponential(6)}\n`; });
    }
    const pt = (sys.perturb || []).filter(g => g.on !== false && (g.dx || g.dy || g.dz || g.tx || g.ty));
    if (pt.length) {
      t += '\nDescentrados activos (Δx, Δy, Δz mm; tilt X, tilt Y °; pivote Δz mm):\n';
      pt.forEach(g => { t += `  ${g.name || ''} [sup. ${g.from}-${g.to}]: ${g.dx}, ${g.dy}, ${g.dz}; ${g.tx}, ${g.ty}; ${g.piv}\n`; });
    }
    return t;
  }
  function tabSummary(P) {
    if (!par) { P.append(h('div', { class: 'note bad' }, 'El trazado paraxial falla: revisa radios/espesores.')); return; }
    const ap = sys.aperture, lp = sys.wavelengths[sys.primary].wl;
    const st = O.apertureStats(ap);
    const s = h('div', { class: 'stats' });
    s.append(stat('Focal efectiva', fmt(par.efl, 2) + ' <small>mm</small>'));
    s.append(stat('F/# (sobre EPD)', fmt(par.fno, 3)));
    s.append(stat('Ø equivalente (área)', fmt(st.deq, 1) + ' <small>mm</small>'));
    s.append(stat('Área colectora', fmt(st.area / 100, 0) + ' <small>cm²</small>'));
    s.append(stat('Resolución λ/D', fmt(lp * 1e-3 / par.epd * 206264.8, 3) + ' <small>″</small>'));
    s.append(stat('Escala de placa', fmt(par.plate, 2) + ' <small>″/mm</small>'));
    if (ap.type === 'segmented') s.append(stat('Hueco entre segmentos', fmt(st.gap, 2) + ' <small>mm</small>', st.gap < 0 ? 'ko' : ''));
    s.append(stat('Obstrucción lineal', fmt(ap.obsc / par.epd * 100, 1) + ' <small>%</small>'));
    P.append(s);
    const notes = [];
    if (ap.type === 'segmented' && st.gap < 0) notes.push(['bad', 'Los segmentos se solapan: aumenta el radio del anillo o reduce su diámetro.']);
    if (ap.type === 'segmented' && !sys.surfaces.some(x => x.seg)) notes.push(['warn', 'Ninguna superficie está marcada como segmentada: los errores de segmento no se aplicarán.']);
    const last = sys.surfaces[sys.surfaces.length - 2];
    if (Math.abs(last.t - par.bfl) > 0.05) notes.push(['', `El plano imagen está a ${fmt(last.t - par.bfl, 3)} mm del foco paraxial (normal si has hecho autofoco).`]);
    const sp = O.spot(ctx, sys, 0, 15);
    if (sp && sp.lostFrac > 0) notes.push(['warn', `En eje se pierde un ${fmt(sp.lostFrac * 100, 1)} % de los rayos por viñeteo (semi-diámetros / agujeros).`]);
    if (ctx.nPert) notes.push(['warn', `Hay ${ctx.nPert} descentrado(s) activo(s): todos los análisis incluyen esos elementos desplazados (pestaña Descentrados).`]);
    notes.forEach(([c, t]) => P.append(h('div', { class: 'note ' + c }, t)));
    P.append(h('h3', null, 'Spot RMS por campo (rápido)'));
    const tb = h('table', { class: 'tbl' }, h('tr', null, h('th', null, 'Campo [°]'), h('th', null, 'RMS [µm]'), h('th', null, 'GEO [µm]'), h('th', null, 'RMS [″]'), h('th', null, 'Airy r [µm]')));
    sys.fields.forEach(f => { const r = O.spot(ctx, sys, f.y, 15); tb.append(h('tr', null, h('td', null, fmt(f.y, 3)), h('td', null, r ? fmt(r.rms, 2) : '—'), h('td', null, r ? fmt(r.geo, 2) : '—'), h('td', null, r ? fmt(r.rms * 1e-3 * par.plate, 3) : '—'), h('td', null, fmt(1.22 * lp * Math.abs(par.fno), 2)))); });
    P.append(h('div', { class: 'wrapx' }, tb));
    P.append(h('h3', null, 'Prescripción'), h('pre', { class: 'out' }, prescriptionText()));
  }

  // ---------- Layout ----------
  function tabLayout(P) {
    P.append(h('div', { class: 'ctrl' },
      h('label', null, h('input', { type: 'checkbox', checked: ui.layoutZoom, onchange: e => { ui.layoutZoom = e.target.checked; renderTab(); } }), 'Zoom a la zona de foco')));
    const W = Math.min(1100, Math.max(320, P.clientWidth - 4)), H = Math.round(W * 0.48);
    const cv = h('canvas'); P.append(cv);
    const g = setupCanvas(cv, W, H);
    const L = ctx.L, E = ctx.epd, wl = sys.wavelengths[sys.primary].wl;
    // rayos en el plano YZ
    const ys = []; for (let i = 0; i <= 40; i++) { const y = (i / 40 - 0.5) * E * 0.999; if (O.pupilMask(ctx.ap, ctx.centers, 0, y) >= 0) ys.push(y); }
    const pick = ys.length > 14 ? ys.filter((_, i) => i % Math.ceil(ys.length / 14) === 0) : ys;
    const rays = [];
    sys.fields.forEach((f, fi) => {
      const D = O.fieldDir(f.y);
      pick.forEach(y => { const seg = O.pupilMask(ctx.ap, ctx.centers, 0, y); const r = O.traceRay(ctx, O.startPt(0, y, D, Math.max(150, E * 0.5)), D, wl, { seg, record: true }); rays.push({ fi, pts: r.pts, ok: r.ok }); });
    });
    // perfiles de superficie
    const prof = [];
    for (let i = 1; i <= L; i++) {
      const s = sys.surfaces[i];
      let Hh = s.sd > 0 ? s.sd : 0;
      if (!Hh) { rays.forEach(r => { if (r.pts[i]) Hh = Math.max(Hh, Math.abs(r.pts[i][1])); }); Hh = Hh * 1.05 || E / 2; }
      const pts = [], segs = [];
      for (let k = 0; k <= 200; k++) {
        const y = -Hh + 2 * Hh * k / 200; if (s.hole > 0 && Math.abs(y) < s.hole) { pts.push(null); continue; }
        const zz = ctx.z[i] + (O.sagS(ctx, i, y * y) || 0);
        pts.push([zz, y]);
        segs.push(i === ctx.segSurf && O.pupilMask(ctx.ap, ctx.centers, 0, y) >= 0);
      }
      prof.push({ i, pts, segs, mirror: ctx.mirror[i] });
    }
    // encuadre
    let zmin = Infinity, zmax = -Infinity, ymax = 0;
    const acc = (z, y) => { zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); ymax = Math.max(ymax, Math.abs(y)); };
    if (ui.layoutZoom) {
      const zi = ctx.z[L], span = Math.max(20, Math.abs(sys.surfaces[L - 1].t) * 1.2);
      zmin = zi - span; zmax = zi + span * 0.15;
      rays.forEach(r => r.pts.forEach(p => { if (p[2] >= zmin && p[2] <= zmax) ymax = Math.max(ymax, Math.abs(p[1])); }));
      prof.forEach(pr => pr.pts.forEach(p => { if (p && p[0] >= zmin && p[0] <= zmax) ymax = Math.max(ymax, Math.abs(p[1])); }));
    } else {
      prof.forEach(pr => pr.pts.forEach(p => p && acc(p[0], p[1])));
      rays.forEach(r => r.pts.slice(1).forEach(p => acc(p[2], p[1])));
      zmin -= (zmax - zmin) * 0.12;
    }
    ymax = (ymax || 1) * 1.08;
    const pad = 24, sx = (W - 2 * pad) / (zmax - zmin), sy = (H - 2 * pad) / (2 * ymax), sc = ui.layoutZoom ? null : Math.min(sx, sy);
    const kx = sc || sx, ky = sc || sy;
    const cx0 = pad + ((W - 2 * pad) - (zmax - zmin) * kx) / 2;
    const X = z => cx0 + (z - zmin) * kx, Y = y => H / 2 - y * ky;
    g.strokeStyle = css('--line'); g.setLineDash([4, 4]); g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); g.setLineDash([]);
    g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip();
    rays.forEach(r => {
      g.strokeStyle = SER[r.fi % SER.length]; g.globalAlpha = r.ok ? 0.75 : 0.25; g.lineWidth = 1;
      g.beginPath(); r.pts.forEach((p, k) => { if (k === 0) g.moveTo(X(p[2]), Y(p[1])); else g.lineTo(X(p[2]), Y(p[1])); }); g.stroke();
    });
    g.globalAlpha = 1;
    prof.forEach(pr => {
      g.lineWidth = pr.mirror ? 2.2 : 1.5;
      for (let pass = 0; pass < 2; pass++) {
        g.strokeStyle = pass ? css('--acc') : (pr.mirror ? css('--ink') : css('--acc2'));
        if (pass && pr.i !== ctx.segSurf) continue;
        g.lineWidth = pass ? 3.2 : (pr.mirror ? 2 : 1.5);
        g.beginPath(); let st = false, si = 0;
        pr.pts.forEach(p => {
          if (!p) { st = false; return; }
          const on = pass ? pr.segs[si] : true; si++;
          if (!on) { st = false; return; }
          if (!st) { g.moveTo(X(p[0]), Y(p[1])); st = true; } else g.lineTo(X(p[0]), Y(p[1]));
        });
        g.stroke();
      }
    });
    g.restore();
    g.fillStyle = css('--ink3'); g.font = '11px IBM Plex Mono, monospace';
    const bar = Math.pow(10, Math.floor(Math.log10((W / 5) / kx)));
    g.strokeStyle = css('--ink2'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(16, H - 12); g.lineTo(16 + bar * kx, H - 12); g.stroke();
    g.fillText(bar + ' mm', 20 + bar * kx, H - 8);
    P.append(legend(sys.fields.map((f, i) => [SER[i % SER.length], 'campo ' + fmt(f.y, 3) + '°']).concat([[css('--acc'), 'segmentos (corte Y)']])));
    P.append(h('p', { class: 'hint' }, 'Corte meridional (plano YZ). Los rayos tenues están viñeteados. El primario segmentado se dibuja resaltado sólo donde el eje Y cruza un segmento.'));
  }

  // ---------- Spot ----------
  function tabSpot(P) {
    P.append(h('div', { class: 'ctrl' },
      h('label', null, 'Rejilla', num(ui.spotN, v => { if (v >= 5 && v <= 101) { ui.spotN = Math.round(v); renderTab(); } }, 2)),
      h('label', null, h('input', { type: 'checkbox', checked: ui.spotCommon, onchange: e => { ui.spotCommon = e.target.checked; renderTab(); } }), 'Escala común')));
    defer(P, 'Trazando…', () => {
      const lp = sys.wavelengths[sys.primary].wl, airy = par ? 1.22 * lp * Math.abs(par.fno) : 0;
      const res = sys.fields.map(f => O.spot(ctx, sys, f.y, ui.spotN));
      const common = Math.max(...res.map(r => r ? r.geo : 0), airy * 1.5) * 1.15;
      const grid = h('div', { class: 'spots' }); P.append(grid);
      res.forEach((r, fi) => {
        const box = h('div', { class: 'spotbox' }); grid.append(box);
        const S = 230, cv = h('canvas'); box.append(cv);
        const g = setupCanvas(cv, S, S);
        if (!r) { g.fillStyle = css('--bad'); g.fillText('El rayo principal falla', 10, 20); return; }
        const half = ui.spotCommon ? common : Math.max(r.geo * 1.15, airy * 1.5, 1e-3);
        const k = (S / 2 - 10) / half, X = x => S / 2 + (x - r.cx) * k, Y = y => S / 2 - (y - r.cy) * k;
        g.strokeStyle = css('--line'); g.beginPath(); g.moveTo(S / 2, 6); g.lineTo(S / 2, S - 6); g.moveTo(6, S / 2); g.lineTo(S - 6, S / 2); g.stroke();
        g.strokeStyle = css('--ink3'); g.setLineDash([3, 3]); g.beginPath(); g.arc(S / 2, S / 2, airy * k, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]);
        r.per.forEach(p => { g.fillStyle = WLCOL(p.wl); for (let i = 0; i < p.pts.length; i += 2) g.fillRect(X(p.pts[i]) - 0.8, Y(p.pts[i + 1]) - 0.8, 1.6, 1.6); });
        g.fillStyle = css('--ink3'); g.font = '10.5px IBM Plex Mono, monospace'; g.fillText('±' + fmt(half, 3) + ' µm', 6, S - 6);
        box.append(h('div', null, h('b', null, 'θ = ' + fmt(sys.fields[fi].y, 3) + '°'), `  RMS ${fmt(r.rms, 2)} µm · GEO ${fmt(r.geo, 2)} µm`),
          h('div', { class: 'hint' }, `centroide (${fmt(r.cx, 2)}, ${fmt(r.cy, 2)}) µm resp. rayo principal · viñeteo ${fmt(r.lostFrac * 100, 1)} %`));
      });
      P.append(legend(sys.wavelengths.map(w => [WLCOL(w.wl), w.wl + ' µm']).concat([[css('--ink3'), 'círculo de Airy (λ prim.)']])));
    });
  }

  // ---------- Frente de onda ----------
  function drawMap(cv, W, N, size, range, stops, symmetric) {
    const g = setupCanvas(cv, size, size);
    const img = g.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = W[j * N + i], id = ((N - 1 - j) * N + i) * 4;
      if (!isFinite(v)) { img.data[id + 3] = 0; continue; }
      const t = symmetric ? 0.5 + 0.5 * v / range : (v - range[0]) / (range[1] - range[0]);
      const c = lerpStops(stops, t); img.data[id] = c[0]; img.data[id + 1] = c[1]; img.data[id + 2] = c[2]; img.data[id + 3] = 255;
    }
    const tmp = document.createElement('canvas'); tmp.width = N; tmp.height = N; tmp.getContext('2d').putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false; g.drawImage(tmp, 0, 0, size, size);
    return g;
  }
  function colorbar(lo, hi, stops, unit) {
    const cv = h('canvas'), W = 60, H = 300, g = setupCanvas(cv, W, H);
    for (let y = 0; y < H - 20; y++) { const c = lerpStops(stops, 1 - y / (H - 20)); g.fillStyle = `rgb(${c})`; g.fillRect(4, y + 10, 14, 1); }
    g.fillStyle = css('--ink2'); g.font = '10.5px IBM Plex Mono, monospace';
    g.fillText(fmt(hi, 3), 21, 16); g.fillText(fmt((lo + hi) / 2, 3), 21, H / 2 + 4); g.fillText(fmt(lo, 3), 21, H - 8);
    g.fillText(unit, 21, H / 2 - 12);
    return cv;
  }
  function tabOPD(P) {
    P.append(h('div', { class: 'ctrl' }, selField(), selWl(),
      h('label', null, 'Rejilla', h('select', { onchange: e => { ui.opdN = +e.target.value; renderTab(); } }, [32, 48, 64, 96, 128].map(n => h('option', { value: n, selected: ui.opdN === n }, n)))),
      h('label', null, h('input', { type: 'checkbox', checked: ui.removeTilt, onchange: e => { ui.removeTilt = e.target.checked; renderTab(); } }), 'Quitar tip/tilt global')));
    defer(P, 'Calculando OPD…', () => {
      const wl = sys.wavelengths[ui.wl].wl;
      const om = O.opdMap(ctx, sys, sys.fields[ui.field].y, wl, ui.opdN, ui.removeTilt);
      if (!om) { P.append(h('div', { class: 'note bad' }, 'No se pudo calcular (rayo principal o todos los rayos fallan).')); return; }
      const s = h('div', { class: 'stats' });
      s.append(stat('RMS', fmt(om.rms, 4) + ' <small>λ</small> · ' + fmt(om.rms * wl * 1000, 1) + ' <small>nm</small>', om.rms < 0.0714 ? 'ok' : 'ko'));
      s.append(stat('PV', fmt(om.pv, 4) + ' <small>λ</small>'));
      s.append(stat('Strehl (Maréchal)', fmt(om.strehlM, 3), om.strehlM >= 0.8 ? 'ok' : 'ko'));
      s.append(stat('Viñeteo', fmt(om.lostFrac * 100, 1) + ' <small>%</small>'));
      P.append(s);
      const size = Math.min(420, Math.max(240, P.clientWidth - 90)), cv = h('canvas');
      const rng = Math.max(Math.abs(om.min), Math.abs(om.max)) || 1e-6;
      drawMap(cv, om.W, om.N, size, rng, DIVERG, true);
      P.append(h('div', { class: 'row' }, cv, colorbar(-rng, rng, DIVERG, 'λ')));
      P.append(h('p', { class: 'hint' }, 'OPD respecto a una esfera de referencia centrada en el impacto del rayo principal sobre el plano imagen (incluye desenfoque). Criterio de Maréchal: RMS ≤ λ/14 ≈ 0,071 λ.'));
      if (om.segStats.length) {
        P.append(h('h3', null, 'Por segmento'));
        const t = h('table', { class: 'tbl' }, h('tr', null, h('th', null, 'Seg.'), h('th', null, 'media [λ]'), h('th', null, 'media [nm]'), h('th', null, 'RMS intra [λ]'), h('th', null, 'RMS intra [nm]')));
        om.segStats.forEach((st, i) => t.append(h('tr', null, h('td', null, i + 1), h('td', null, fmt(st.mean, 4)), h('td', null, fmt(st.mean * wl * 1000, 1)), h('td', null, fmt(st.rms, 4)), h('td', null, fmt(st.rms * wl * 1000, 1)))));
        P.append(h('div', { class: 'wrapx' }, t));
      }
    });
  }

  // ---------- PSF / MTF ----------
  function tabPSF(P) {
    P.append(h('div', { class: 'ctrl' }, selField(), selWl(),
      h('label', null, 'Muestreo pupila', h('select', { onchange: e => { ui.psfN = +e.target.value; renderTab(); } }, [64, 128].map(n => h('option', { value: n, selected: ui.psfN === n }, n)))),
      h('label', null, h('input', { type: 'checkbox', checked: ui.psfLog, onchange: e => { ui.psfLog = e.target.checked; renderTab(); } }), 'Escala log')));
    defer(P, 'Calculando PSF por FFT…', () => {
      const wl = sys.wavelengths[ui.wl].wl;
      const r = O.psf(ctx, sys, sys.fields[ui.field].y, wl, ui.psfN, 4, 128);
      if (!r) { P.append(h('div', { class: 'note bad' }, 'No se pudo calcular la PSF.')); return; }
      const s = h('div', { class: 'stats' });
      s.append(stat('Strehl (FFT)', fmt(r.strehl, 4), r.strehl >= 0.8 ? 'ok' : 'ko'));
      s.append(stat('RMS frente de onda', fmt(r.om.rms, 4) + ' <small>λ</small>'));
      s.append(stat('Píxel PSF', fmt(r.dx, 3) + ' <small>µm</small> · ' + fmt(r.dx * 1e-3 * r.par.plate, 4) + ' <small>″</small>'));
      const ee80 = r.ee.r[r.ee.e.findIndex(v => v >= 0.8)];
      s.append(stat('Radio EE80 %', fmt(ee80, 2) + ' <small>µm</small> · ' + fmt(ee80 * 1e-3 * r.par.plate, 3) + ' <small>″</small>'));
      P.append(s);
      if (r.om.rms > 3) P.append(h('div', { class: 'note warn' }, 'Aberración muy grande para la ventana de la PSF (posible aliasing). Para sistemas lejos del límite de difracción usa el Spot; la PSF/MTF FFT es fiable cuando RMS ≲ 1 λ.'));
      const K = r.K, size = Math.min(420, Math.max(240, P.clientWidth - 90));
      const data = new Float64Array(K * K); let lo, hi;
      if (ui.psfLog) { lo = -4; hi = 0; for (let i = 0; i < K * K; i++) data[i] = Math.log10(Math.max(1e-4, r.img[i] / Math.max(1e-30, r.strehl))); }
      else { lo = 0; hi = r.strehl; for (let i = 0; i < K * K; i++) data[i] = r.img[i]; }
      // la imagen está ordenada con j hacia abajo = −y ; drawMap invierte filas
      const cv = h('canvas'); const g = drawMap(cv, data, K, size, [lo, hi], INFERNO, false);
      const um = K * r.dx, bar = Math.pow(10, Math.floor(Math.log10(um / 4)));
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(12, size - 14); g.lineTo(12 + bar / um * size, size - 14); g.stroke();
      g.fillStyle = '#fff'; g.font = '11px IBM Plex Mono, monospace'; g.fillText(bar + ' µm', 14, size - 20);
      P.append(h('div', { class: 'row' }, cv, colorbar(lo, hi, INFERNO, ui.psfLog ? 'log₁₀' : 'I/Iref')));
      const W2 = Math.min(560, Math.max(300, P.clientWidth - 10));
      const c1 = h('canvas'), c2 = h('canvas');
      P.append(h('h3', null, 'Energía encerrada'), c1, legend([[SER[0], 'sistema'], [SER[1], 'límite de difracción (misma pupila)']]));
      const nE = Math.min(r.ee.r.length, Math.ceil(K / 2));
      lineChart(c1, { w: W2, h: 260, series: [{ x: r.ee.r.slice(0, nE), y: r.ee.e.slice(0, nE) }, { x: r.ee.r.slice(0, nE), y: r.ee.ref.slice(0, nE), dash: [5, 4] }], xlab: 'radio [µm]', ylab: 'fracción', ymin: 0, ymax: 1 });
      P.append(h('h3', null, 'MTF'), c2, legend([[SER[0], 'tangencial'], [SER[2], 'sagital'], [SER[1], 'difracción']]));
      lineChart(c2, { w: W2, h: 280, series: [{ x: r.mtf.f, y: r.mtf.tan }, { x: r.mtf.f, y: r.mtf.sag, color: SER[2] }, { x: r.mtf.f, y: r.mtf.rtan, color: SER[1], dash: [5, 4] }], xlab: 'frecuencia [ciclos/mm]', ylab: 'MTF', ymin: 0, ymax: 1 });
      P.append(h('p', { class: 'hint' }, 'PSF monocromática por FFT del campo complejo en pupila (amplitud = máscara segmentada, fase = OPD trazada). El Strehl se calcula frente a la misma pupila sin aberraciones, así que la difracción de los huecos y la obstrucción no penaliza.'));
    });
  }

  // ---------- Segmentos y co-faseo ----------
  function segFront(cv, size, model, vals, label) {
    const g = setupCanvas(cv, size, size), ap = sys.aperture, E = O.epd(ap), k = (size - 20) / E;
    const X = x => size / 2 + x * k, Y = y => size / 2 - y * k;
    const C = O.segCenters(ap);
    const rng = Math.max(1e-9, ...vals.map(Math.abs));
    C.forEach((c, i) => {
      const col = lerpStops(DIVERG, 0.5 + 0.5 * vals[i] / rng);
      g.fillStyle = `rgb(${col})`; g.beginPath(); g.arc(X(c[0]), Y(c[1]), ap.dseg / 2 * k, 0, 2 * Math.PI); g.fill();
      g.strokeStyle = css('--line2'); g.stroke();
      g.fillStyle = '#111'; g.font = '600 12px IBM Plex Sans, sans-serif'; g.textAlign = 'center'; g.fillText(i + 1, X(c[0]), Y(c[1]) + 4);
    });
    if (model) {
      g.fillStyle = css('--acc'); model.sensors.forEach(s => g.fillRect(X(s.x) - 3, Y(s.y) - 3, 6, 6));
      g.fillStyle = css('--ink'); model.acts.forEach(a => { g.beginPath(); g.arc(X(a.x), Y(a.y), 2.5, 0, 2 * Math.PI); g.fill(); });
    }
    if (ap.obsc > 0) { g.strokeStyle = css('--ink3'); g.setLineDash([3, 3]); g.beginPath(); g.arc(size / 2, size / 2, ap.obsc / 2 * k, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]); }
    if (label) { g.fillStyle = css('--ink2'); g.textAlign = 'left'; g.font = '11px IBM Plex Mono, monospace'; g.fillText(label, 6, 14); }
  }
  function modeMap(cv, size, vec, ev) {
    const w = ev.residual(vec), G = ev.G, Wm = new Float64Array(G * G).fill(NaN);
    const E = ev.E;
    for (let i = 0; i < ev.N; i++) { const ii = Math.round((ev.X[i] / E + 0.5) * G - 0.5), jj = Math.round((ev.Y[i] / E + 0.5) * G - 0.5); Wm[jj * G + ii] = w[i]; }
    let r = 0; for (let i = 0; i < w.length; i++) r = Math.max(r, Math.abs(w[i]));
    drawMap(cv, Wm, G, size, r || 1, DIVERG, true);
  }
  function tabSegments(P) {
    const ap = sys.aperture;
    if (ap.type !== 'segmented') { P.append(h('div', { class: 'note' }, 'Selecciona apertura «Anillo de segmentos» en el panel Sistema para usar esta pestaña.')); return; }
    const S = sys.segments;
    // --- errores de segmento
    P.append(h('h3', null, 'Errores de alineación por segmento'));
    const t = h('table', { class: 'tbl' }, h('tr', null, ['Seg.', 'Pistón p [nm]', 'Tip tx = dz/dx [µrad]', 'Tilt ty = dz/dy [µrad]', 'ΔROC [mm]'].map(x => h('th', null, x))));
    S.forEach((e, i) => t.append(h('tr', null, h('td', null, i + 1),
      ...['p', 'tx', 'ty', 'dR'].map(k => h('td', null, num(e[k], v => { if (isFinite(v)) { e[k] = v; changed({}); } }, k === 'dR' ? 0.01 : 1))))));
    const rnd = ui.rnd;
    P.append(h('div', { class: 'row' }, h('div', { class: 'wrapx' }, t)));
    P.append(h('div', { class: 'ctrl' },
      h('label', null, 'σ pistón [nm]', num(rnd.p, v => rnd.p = v)), h('label', null, 'σ tip/tilt [µrad]', num(rnd.t, v => rnd.t = v)), h('label', null, 'σ ΔROC [mm]', num(rnd.dR, v => rnd.dR = v)),
      h('button', { onclick: () => { S.forEach(e => { e.p = +(O.gauss() * rnd.p).toFixed(1); e.tx = +(O.gauss() * rnd.t).toFixed(3); e.ty = +(O.gauss() * rnd.t).toFixed(3); e.dR = +(O.gauss() * rnd.dR).toFixed(3); }); changed({ now: true }); } }, 'Aleatorio'),
      h('button', { onclick: () => { S.forEach(e => { e.p = e.tx = e.ty = e.dR = 0; }); changed({ now: true }); } }, 'Poner a cero')));
    P.append(h('p', { class: 'hint' }, 'Estos errores se aplican en el trazado real (rotación/traslación rígida de cada segmento y radio propio si ΔROC ≠ 0), así que se ven en Spot, Frente de onda y PSF. Pistón de superficie p ⇒ 2p de frente de onda en reflexión. ΔROC modela segmentos esféricos.'));

    // --- modelo de sensores
    const sp = ui.sens;
    P.append(h('h3', null, 'Sensores de borde y actuadores'));
    P.append(h('div', { class: 'ctrl' },
      h('label', null, 'Sensores por hueco', h('select', { onchange: e => { sp.nPerGap = +e.target.value; renderTab(); } }, [1, 2].map(n => h('option', { value: n, selected: sp.nPerGap === n }, n)))),
      h('label', null, 'Separación ±δ radial [mm]', num(sp.delta, v => { sp.delta = v; renderTab(); })),
      h('label', null, 'Radio actuadores [mm]', num(sp.ra, v => { sp.ra = v; renderTab(); })),
      h('label', null, 'Giro actuadores [°]', num(sp.aphi, v => { sp.aphi = v; renderTab(); }))));
    const model = O.phasingModel(ap, sp), ev = O.wfeEvaluator(ap, 48);
    const size = Math.min(320, Math.max(220, P.clientWidth / 2 - 20));
    const cvF = h('canvas'); segFront(cvF, size, model, S.map(e => e.p), 'color = pistón');
    const cvS = h('canvas');
    lineChart(cvS, { w: Math.min(520, Math.max(280, P.clientWidth - size - 40)), h: size, series: [{ x: model.sv.map((_, i) => i + 1), y: model.sv.map(v => Math.max(v, 1e-6)) }], xlab: 'índice de modo', ylab: 'valor singular', logy: true });
    P.append(h('div', { class: 'row' }, cvF, cvS));
    P.append(legend([[css('--acc'), 'sensor de borde (Δz entre segmentos)'], [css('--ink'), 'actuador']]));
    const st = h('div', { class: 'stats' });
    st.append(stat('Sensores × GDL', model.A.length + ' × ' + model.m));
    st.append(stat('Rango', model.rank));
    st.append(stat('Modos globales (inofensivos)', '3'));
    st.append(stat('Modos ciegos que degradan', model.blind.length, model.blind.length ? 'ko' : 'ok'));
    const cond = model.sv[model.rank - 1] > 0 ? model.sv[0] / model.sv[model.rank - 1] : Infinity;
    st.append(stat('Nº de condición (observables)', fmt(cond, 1), cond > 50 ? 'wa' : ''));
    P.append(st);
    P.append(h('div', { class: 'note ' + (model.blind.length ? 'warn' : '') },
      model.blind.length
        ? `Con esta geometría hay ${model.blind.length} combinación(es) de pistón/tip/tilt que los sensores de borde no ven pero sí degradan el frente de onda. Hay que medirlas con calibración de pupila completa (PDI / diversidad de fase) — abajo se puede simular.`
        : 'Todos los modos que degradan el frente de onda son observables por los sensores de borde.'));
    if (model.blind.length) {
      const amp = h('input', { type: 'number', value: 100, style: 'width:80px' });
      P.append(h('div', { class: 'ctrl' }, h('span', null, 'Modos ciegos (mapa de frente de onda tras quitar pistón/tip/tilt global).'), h('label', null, 'Amplitud al inyectar [nm RMS de frente de onda]', amp)));
      const grid = h('div', { class: 'modes' });
      model.blind.forEach((v, i) => {
        const c = h('canvas'); modeMap(c, 160, v, ev);
        const wr = ev.rms(v);
        grid.append(h('div', { class: 'mode' }, c, h('div', null, h('b', null, 'Modo ciego ' + (i + 1))), h('div', null, 'WFE ' + fmt(wr, 2) + ' nm por unidad'),
          h('button', { class: 'small', onclick: () => { const a = (+amp.value || 100) / wr; S.forEach((e, s) => { e.p = +(v[3 * s] * a).toFixed(2); e.tx = +(v[3 * s + 1] * a).toFixed(4); e.ty = +(v[3 * s + 2] * a).toFixed(4); e.dR = 0; }); changed({ now: true }); } }, 'Inyectar en segmentos')));
      });
      P.append(grid);
      P.append(h('p', { class: 'hint' }, 'Inyecta un modo ciego y mira su efecto en Frente de onda y PSF: los sensores leerían cero.'));
    }

    // --- lazo cerrado
    const lp = ui.loop;
    P.append(h('h3', null, 'Simulación de co-faseo en lazo cerrado'));
    P.append(h('div', { class: 'ctrl' },
      h('label', null, 'Iteraciones', num(lp.iters, v => lp.iters = Math.max(1, Math.round(v)), 1)),
      h('label', null, 'Ganancia', num(lp.gain, v => lp.gain = v, 0.05)),
      h('label', null, 'Ruido sensor σ [nm]', num(lp.sNoise, v => lp.sNoise = v)),
      h('label', null, 'Paso actuador [nm]', num(lp.quant, v => lp.quant = v)),
      h('label', null, 'Error inicial pistón σ [nm]', num(lp.p0, v => lp.p0 = v)),
      h('label', null, 'Error inicial tip/tilt σ [µrad]', num(lp.t0, v => lp.t0 = v)),
      h('label', null, 'Deriva/iter σ [nm]', num(lp.drift, v => lp.drift = v)),
      h('label', null, h('input', { type: 'checkbox', checked: lp.calOn, onchange: e => lp.calOn = e.target.checked }), 'Calibración de pupila completa'),
      h('label', null, 'cada', num(lp.calEvery, v => lp.calEvery = Math.max(1, Math.round(v)), 1), 'iter'),
      h('label', null, 'ruido calib. σ [nm]', num(lp.calNoise, v => lp.calNoise = v)),
      h('button', { class: 'primary', onclick: () => runLoop() }, 'Simular')));
    const out = h('div'); P.append(out);
    function runLoop() {
      out.innerHTML = '';
      const r = O.closedLoop(model, ev, lp), it = r.wfe.map((_, i) => i);
      const lam = sys.wavelengths[sys.primary].wl * 1000;
      const cv = h('canvas'); out.append(cv);
      lineChart(cv, { w: Math.min(760, Math.max(300, P.clientWidth - 10)), h: 300, logy: true, series: [{ x: it, y: r.wfe }, { x: it, y: r.wfeNull, color: SER[4] }, { x: it, y: r.wfeObs, color: SER[1], dash: [5, 4] }], xlab: 'iteración', ylab: 'WFE RMS [nm]', hlines: [{ y: lam / 14, label: 'λ/14 (Strehl≈0,8)', color: css('--good') }] });
      out.append(legend([[SER[0], 'total'], [SER[4], 'parte en modos ciegos'], [SER[1], 'parte observable']]));
      const f = r.wfe[r.wfe.length - 1];
      out.append(h('div', { class: 'stats' }, stat('WFE final', fmt(f, 1) + ' <small>nm</small>', f < lam / 14 ? 'ok' : 'ko'), stat('Strehl (Maréchal)', fmt(Math.exp(-Math.pow(2 * Math.PI * f / lam, 2)), 3)), stat('Ciegos final', fmt(r.wfeNull[r.wfeNull.length - 1], 1) + ' <small>nm</small>')));
      out.append(h('button', { onclick: () => { S.forEach((e, s) => { e.p = +r.final[3 * s].toFixed(2); e.tx = +r.final[3 * s + 1].toFixed(4); e.ty = +r.final[3 * s + 2].toFixed(4); }); changed({ now: true }); } }, 'Cargar el estado final en los segmentos'));
    }
    P.append(h('p', { class: 'hint' }, 'Modelo: cada sensor mide la diferencia de altura entre los dos segmentos en su posición; reconstructor = pseudo-inversa SVD; los actuadores se cuantizan al paso indicado (ver Herramientas → resolución). La calibración mide los modos ciegos con el ruido indicado y los corrige.'));
  }

  // ---------- Optimización ----------
  let opt = null;
  function varList() {
    return Object.keys(sys.vary).filter(k => sys.vary[k]).map(k => { const [i, p] = k.split(':'); return { i: +i, p }; })
      .filter(v => v.i > 0 && v.i < sys.surfaces.length && !(v.p === 't' && v.i === sys.surfaces.length - 1));
  }
  function getV(s, v) { const x = s.surfaces[v.i][v.p] || 0; return v.p === 'r' ? O.curv(s.surfaces[v.i].r) : x; }
  function setV(s, v, x) { if (v.p === 'r') s.surfaces[v.i].r = x === 0 ? Infinity : 1 / x; else s.surfaces[v.i][v.p] = x; }
  function meritOf(s) {
    let c; try { c = O.buildCtx(s); } catch (e) { return 1e9; }
    let sum = 0, ws = 0, lost = 0;
    for (const f of s.fields) {
      const sp = O.spot(c, s, f.y, s.merit.grid);
      if (!sp || !isFinite(sp.rms)) return 1e9;
      sum += f.w * sp.rms * sp.rms; ws += f.w; lost += sp.lostFrac;
    }
    let m = sum / Math.max(1e-9, ws);
    if (s.merit.eflTarget > 0) { const p = O.paraxial(c, s); if (!p) return 1e9; m += s.merit.eflW * Math.pow(p.efl - s.merit.eflTarget, 2); }
    m += 1e6 * lost;
    return Math.sqrt(m);
  }
  function tabOptim(P) {
    const vars = varList(), M = sys.merit;
    P.append(h('p', { class: 'hint' }, 'Marca con el botón «V» del editor los radios, espesores o cónicas a variar. Función de mérito = √( Σ wᵢ·RMS_spotᵢ² [µm²] + peso·(EFL − objetivo)² ) sobre todos los campos y longitudes de onda. Algoritmo: Nelder–Mead (los radios se optimizan en curvatura).'));
    P.append(h('div', { class: 'ctrl' },
      h('label', null, 'EFL objetivo [mm] (0 = libre)', num(M.eflTarget, v => { M.eflTarget = v || 0; save(); })),
      h('label', null, 'Peso EFL [µm²/mm²]', num(M.eflW, v => { M.eflW = v; save(); })),
      h('label', null, 'Rejilla de rayos', num(M.grid, v => { M.grid = Math.max(5, Math.round(v)); save(); }, 2))));
    const t = h('table', { class: 'tbl' }, h('tr', null, h('th', null, 'Sup.'), h('th', null, 'Parámetro'), h('th', null, 'Valor')));
    vars.forEach(v => t.append(h('tr', null, h('td', null, v.i), h('td', null, ({ r: 'radio', t: 'espesor', k: 'cónica', a4: 'A4', a6: 'A6', a8: 'A8' })[v.p]), h('td', null, fmt(sys.surfaces[v.i][v.p], 6)))));
    P.append(h('div', { class: 'wrapx' }, vars.length ? t : h('div', { class: 'note warn' }, 'No hay variables marcadas.')));
    const m0 = meritOf(sys);
    const info = h('div', { class: 'stats' }, stat('Mérito actual', fmt(m0, 4) + ' <small>µm</small>'));
    P.append(info);
    const bRun = h('button', { class: 'primary', disabled: !vars.length }, 'Optimizar'), bStop = h('button', { disabled: true }, 'Parar'), bUndo = h('button', { disabled: !opt || !opt.backup }, 'Deshacer optimización');
    P.append(h('div', { class: 'ctrl' }, bRun, bStop, bUndo, h('label', null, 'Iteraciones máx.', h('input', { type: 'number', id: 'optMax', value: 300, style: 'width:80px' }))));
    const log = h('div', { class: 'hint' }), cv = h('canvas'); P.append(log, cv);
    if (opt && opt.hist && opt.hist.length > 1) lineChart(cv, { w: Math.min(700, P.clientWidth - 10), h: 240, logy: true, series: [{ x: opt.hist.map((_, i) => i), y: opt.hist }], xlab: 'iteración', ylab: 'mérito [µm]' });
    bUndo.onclick = () => { if (opt && opt.backup) { sys = normalize(jsonIn(opt.backup)); opt.backup = null; changed({ lde: true, sys: true, now: true }); } };
    bRun.onclick = () => {
      const work = jsonIn(jsonOut(sys));
      const x0 = vars.map(v => getV(work, v));
      const ASTEP = { a4: 1e-10, a6: 1e-15, a8: 1e-20 };
      const steps = vars.map((v, k) => v.p === 'r' ? (Math.abs(x0[k]) * 0.05 || 1e-4) : v.p === 't' ? Math.max(1, Math.abs(x0[k]) * 0.03) : ASTEP[v.p] ? (Math.abs(x0[k]) * 0.2 || ASTEP[v.p]) : 0.1);
      const f = x => { vars.forEach((v, k) => setV(work, v, x[k])); return meritOf(work); };
      opt = { backup: jsonOut(sys), hist: [], stop: false };
      const nm = new O.NelderMead(f, x0, steps);
      const maxIt = +$('#optMax').value || 300;
      bRun.disabled = true; bStop.disabled = false; bUndo.disabled = true;
      bStop.onclick = () => { opt.stop = true; };
      let best = { x: x0, f: Math.min(...nm.vals) };
      const tick = () => {
        const t0 = performance.now();
        while (performance.now() - t0 < 60 && nm.iter < maxIt && !opt.stop) { best = nm.step(); opt.hist.push(best.f); if (best.spread < 1e-7 * Math.max(1, best.f)) { opt.stop = true; break; } }
        log.textContent = `iter ${nm.iter} · evaluaciones ${nm.evals} · mérito ${fmt(best.f, 5)} µm`;
        if (opt.hist.length > 1) lineChart(cv, { w: Math.min(700, P.clientWidth - 10), h: 240, logy: true, series: [{ x: opt.hist.map((_, i) => i), y: opt.hist }], xlab: 'iteración', ylab: 'mérito [µm]' });
        if (nm.iter < maxIt && !opt.stop) setTimeout(tick, 0);
        else {
          vars.forEach((v, k) => setV(sys, v, best.x[k]));
          sys.surfaces.forEach(s => { ['r', 't', 'k'].forEach(p => { if (isFinite(s[p])) s[p] = +(+s[p]).toPrecision(10); }); });
          changed({ lde: true, now: true });
        }
      };
      setTimeout(tick, 0);
    };
  }

  // ---------- Herramientas ----------
  function golden(f, a, b, it) { const r = (Math.sqrt(5) - 1) / 2; let c = b - r * (b - a), d = a + r * (b - a), fc = f(c), fd = f(d); for (let i = 0; i < (it || 40); i++) { if (fc < fd) { b = d; d = c; fd = fc; c = b - r * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + r * (b - a); fd = f(d); } } return (a + b) / 2; }
  function tabTools(P) {
    // Cassegrain
    const cgp = ui.cg;
    P.append(h('h3', null, 'Solver Cassegrain de dos espejos (paraxial)'));
    P.append(h('div', { class: 'ctrl' },
      h('label', null, 'Ø primario [mm]', num(cgp.D, v => { cgp.D = v; renderTab(); })),
      h('label', null, 'R primario [mm]', num(cgp.R1, v => { cgp.R1 = v; renderTab(); })),
      h('label', null, 'Focal sistema F [mm]', num(cgp.F, v => { cgp.F = v; renderTab(); })),
      h('label', null, 'Foco tras el vértice del primario b [mm]', num(cgp.b, v => { cgp.b = v; renderTab(); })),
      h('label', null, 'Semicampo [°]', num(cgp.field, v => { cgp.field = v; renderTab(); }, 0.01))));
    const cg = O.cassegrain({ D: cgp.D, R1: cgp.R1, F: cgp.F, b: cgp.b, fieldDeg: cgp.field });
    const s1 = h('div', { class: 'stats' });
    s1.append(stat('f primario', fmt(cg.f1, 2) + ' <small>mm</small>'), stat('Amplificación m', fmt(cg.M, 4)), stat('Separación d', fmt(cg.d, 3) + ' <small>mm</small>'),
      stat('R secundario', fmt(cg.R2, 3) + ' <small>mm</small>'), stat('Ø secundario mín.', fmt(cg.D2, 2) + ' <small>mm</small>'), stat('Obstrucción lineal', fmt(cg.obsLin * 100, 1) + ' <small>%</small>'),
      stat('F/# primario', fmt(cg.f1 / cgp.D, 3)), stat('F/# sistema', fmt(cgp.F / cgp.D, 3)));
    P.append(s1);
    const tk = h('table', { class: 'tbl' }, h('tr', null, h('th', null, 'Tipo'), h('th', null, 'K1'), h('th', null, 'K2'), h('th')));
    const apply = (K1, K2, name) => {
      const ap = sys.aperture, hole = ap.type === 'segmented' ? ap.ringR - ap.dseg / 2 : (ap.obsc / 2 || cg.D2 / 2);
      sys.surfaces = O.cassegrainSurfaces(cg, cgp.D, hole, cgp.b, K1, K2);
      if (ap.type === 'segmented') sys.surfaces[1].sd = O.epd(ap) / 2;
      sys.vary = {}; sys.name = name;
      sys.merit.eflTarget = cgp.F;
      rebuild();
      const p = O.paraxial(ctx, sys); if (p) sys.surfaces[sys.surfaces.length - 2].t = +p.bfl.toFixed(4);
      changed({ lde: true, now: true });
    };
    [['Todo esférico', 0, 0], ['Clásico (parabólico + hiperbólico)', -1, cg.K2cc], ['Ritchey–Chrétien', cg.K1rc, cg.K2rc]].forEach(([n, a, b]) =>
      tk.append(h('tr', null, h('td', { style: 'text-align:left' }, n), h('td', null, fmt(a, 5)), h('td', null, fmt(b, 5)), h('td', null, h('button', { class: 'small', onclick: () => apply(a, b, 'Cassegrain ' + n.toLowerCase()) }, 'Aplicar')))));
    tk.append(h('tr', null, h('td', { style: 'text-align:left' }, 'Dall–Kirkham (secundario esférico)'), h('td', null, 'óptimo'), h('td', null, '0'),
      h('td', null, h('button', { class: 'small', onclick: () => { apply(-0.7, 0, 'Cassegrain Dall–Kirkham'); const f = k => { sys.surfaces[1].k = k; const c = O.buildCtx(sys); const s = O.spot(c, sys, 0, 15); return s ? s.rms : 1e9; }; const k = golden(f, -1.2, 0, 50); sys.surfaces[1].k = +k.toFixed(6); changed({ lde: true, now: true }); } }, 'Aplicar y optimizar K1'))));
    P.append(h('div', { class: 'wrapx' }, tk));
    P.append(h('p', { class: 'hint' }, '«Aplicar» reconstruye la prescripción (primario, secundario, plano del agujero e imagen) manteniendo la apertura actual. Fórmulas RC: Wikipedia/Sacek con M = (F−B)/d.'));

    // resolución actuador
    const a = ui.act;
    P.append(h('h3', null, 'Resolución del actuador (husillo × micropasos)'));
    P.append(h('div', { class: 'ctrl' },
      h('label', null, 'Paso husillo [mm/vuelta]', num(a.pitch, v => { a.pitch = v; renderTab(); }, 0.05)),
      h('label', null, 'Pasos/vuelta', num(a.steps, v => { a.steps = v; renderTab(); }, 1)),
      h('label', null, 'Micropasos', num(a.micro, v => { a.micro = v; renderTab(); }, 1)),
      h('label', null, 'Reductora', num(a.ratio, v => { a.ratio = v; renderTab(); }, 1)),
      h('label', null, 'Palanca / flexión (reducción)', num(a.lever, v => { a.lever = v; renderTab(); }, 1)),
      h('label', null, 'λ [µm]', num(a.wl, v => { a.wl = v; renderTab(); }, 0.01))));
    const step = a.pitch / (a.steps * a.micro * a.ratio * a.lever) * 1e6, full = a.pitch / (a.steps * a.ratio * a.lever) * 1e6;
    const wfe = 2 * step, lam = a.wl * 1000, tilt = step / (ui.sens.ra * 1.5) /* µrad aprox (base = 1,5·r) */;
    const s2 = h('div', { class: 'stats' });
    s2.append(stat('Paso (micropaso)', fmt(step, 2) + ' <small>nm</small>'), stat('Paso completo', fmt(full, 1) + ' <small>nm</small>'),
      stat('Paso en frente de onda', fmt(wfe, 2) + ' <small>nm</small> = λ/' + fmt(lam / wfe, 1), wfe <= lam / 20 ? 'ok' : 'ko'),
      stat('Cuantización RMS (paso/√12)', fmt(wfe / Math.sqrt(12), 2) + ' <small>nm WFE</small>'),
      stat('Resolución tip/tilt aprox.', fmt(tilt, 3) + ' <small>µrad</small>'));
    P.append(s2);
    P.append(h('div', { class: 'note warn' }, 'El micropaso de un TMC2209 no es una posición garantizada: la linealidad real entre pasos completos suele ser del orden del 5–10 % del paso completo y hay histéresis/juego en husillo y tuerca. Usa el paso completo como resolución "segura" y valida con medida (interferómetro / sensores). Si el paso completo no llega a λ/20 en frente de onda, añade reducción mecánica (palanca, flexión diferencial).'));

    // Monte Carlo
    const mc = ui.mc;
    P.append(h('h3', null, 'Tolerancias Monte Carlo de segmentos (trazado real, en eje, λ primaria)'));
    P.append(h('div', { class: 'ctrl' },
      h('label', null, 'Pruebas', num(mc.trials, v => mc.trials = Math.max(5, Math.round(v)), 10)),
      h('label', null, 'σ pistón [nm]', num(mc.p, v => mc.p = v)),
      h('label', null, 'σ tip/tilt [µrad]', num(mc.t, v => mc.t = v, 0.05)),
      h('label', null, 'σ ΔROC [mm]', num(mc.dR, v => mc.dR = v, 0.01)),
      h('label', null, 'Rejilla', num(mc.N, v => mc.N = Math.max(16, Math.round(v)), 4)),
      h('button', { class: 'primary', onclick: () => runMC() }, 'Ejecutar')));
    const out = h('div'); P.append(out);
    function runMC() {
      if (sys.aperture.type !== 'segmented') { out.innerHTML = ''; out.append(h('div', { class: 'note' }, 'Necesita apertura segmentada.')); return; }
      out.innerHTML = '';
      const prog = h('div', { class: 'busy' }); out.append(prog);
      const wl = sys.wavelengths[sys.primary].wl, nom = O.opdMap(ctx, sys, 0, wl, mc.N, true);
      const base = jsonIn(jsonOut(sys)), res = [];
      let k = 0;
      const step = () => {
        const t0 = performance.now();
        while (k < mc.trials && performance.now() - t0 < 50) {
          base.segments.forEach(e => { e.p = O.gauss() * mc.p; e.tx = O.gauss() * mc.t; e.ty = O.gauss() * mc.t; e.dR = O.gauss() * mc.dR; });
          const om = O.opdMap(O.buildCtx(base), base, 0, wl, mc.N, true);
          if (om) res.push(om.rms); k++;
        }
        prog.textContent = `prueba ${k}/${mc.trials}`;
        if (k < mc.trials) setTimeout(step, 0); else done();
      };
      const done = () => {
        prog.remove();
        res.sort((a, b) => a - b);
        const q = p => res[Math.min(res.length - 1, Math.floor(p * res.length))];
        const S = r => Math.exp(-Math.pow(2 * Math.PI * r, 2));
        out.append(h('div', { class: 'stats' },
          stat('RMS nominal', fmt(nom ? nom.rms : NaN, 4) + ' <small>λ</small>'),
          stat('RMS mediana', fmt(q(0.5), 4) + ' <small>λ</small>'), stat('RMS percentil 90', fmt(q(0.9), 4) + ' <small>λ</small>'),
          stat('Strehl mediana', fmt(S(q(0.5)), 3), S(q(0.5)) > 0.8 ? 'ok' : 'ko'), stat('Strehl percentil 90 (peor)', fmt(S(q(0.9)), 3), S(q(0.9)) > 0.8 ? 'ok' : 'ko')));
        // histograma
        const nb = 20, lo = res[0], hi = res[res.length - 1] || lo + 1, bins = new Array(nb).fill(0);
        res.forEach(r => bins[Math.min(nb - 1, Math.floor((r - lo) / (hi - lo + 1e-12) * nb))]++);
        const cv = h('canvas'); out.append(cv);
        const W = Math.min(620, P.clientWidth - 10), H = 220, g = setupCanvas(cv, W, H), mx = Math.max(...bins);
        bins.forEach((b, i) => { g.fillStyle = SER[0]; const bw = (W - 60) / nb; g.fillRect(40 + i * bw, H - 30 - b / mx * (H - 50), bw - 2, b / mx * (H - 50)); });
        g.fillStyle = css('--ink3'); g.font = '11px IBM Plex Mono, monospace'; g.fillText(fmt(lo, 3) + ' λ', 40, H - 12); g.textAlign = 'right'; g.fillText(fmt(hi, 3) + ' λ', W - 20, H - 12);
        out.append(h('p', { class: 'hint' }, 'Histograma del RMS de frente de onda (pistón y tip/tilt globales eliminados). Incluye las aberraciones del diseño nominal: para aislar los segmentos, úsalo sobre un diseño nominalmente corregido.'));
      };
      setTimeout(step, 10);
    }
  }

  // ---------------- Banco óptico interactivo ----------------
  // s = sentido de propagación en el hueco donde se inserta (+1 hacia +z, −1 hacia −z)
  const ELEMENTS = [
    { key: 'lens', label: 'Lente', title: 'Lente biconvexa N-BK7 (R ±200, 6 mm)', make: s => [
      { cm: 'Lente (cara 1)', r: s * 200, t: s * 6, mat: 'N-BK7' }, { cm: 'Lente (cara 2)', r: -s * 200, t: 0, mat: '' }] },
    { key: 'meniscus', label: 'Menisco', title: 'Menisco N-BK7 (R 100 / 115, 5 mm)', make: s => [
      { cm: 'Menisco (cara 1)', r: s * 100, t: s * 5, mat: 'N-BK7' }, { cm: 'Menisco (cara 2)', r: s * 115, t: 0, mat: '' }] },
    { key: 'doublet', label: 'Doblete', title: 'Doblete acromático N-BK7 / N-F2 (f ≈ 200 mm)', make: s => [
      { cm: 'Doblete (cara 1)', r: s * 134, t: s * 4, mat: 'N-BK7' }, { cm: 'Doblete (cara 2)', r: -s * 109.2, t: s * 2.5, mat: 'N-F2' },
      { cm: 'Doblete (cara 3)', r: -s * 541.5, t: 0, mat: '' }] },
    { key: 'plate', label: 'Placa', title: 'Placa plano-paralela N-BK7 3 mm (filtro / ventana)', make: s => [
      { cm: 'Placa (cara 1)', r: Infinity, t: s * 3, mat: 'N-BK7' }, { cm: 'Placa (cara 2)', r: Infinity, t: 0, mat: '' }] },
    { key: 'flat', label: 'Espejo plano', title: 'Espejo plano de pliegue: refleja el resto del sistema', mirror: true, make: () => [
      { cm: 'Espejo plano', r: Infinity, t: 0, mat: 'MIRROR' }] },
    { key: 'sphm', label: 'Espejo esf.', title: 'Espejo cóncavo R 800 (refleja el resto del sistema)', mirror: true, make: s => [
      { cm: 'Espejo esférico', r: -s * 800, t: 0, mat: 'MIRROR' }] },
    { key: 'dummy', label: 'Ficticia', title: 'Superficie ficticia (plano de referencia / apertura)', make: () => [
      { cm: 'Ficticia', r: Infinity, t: 0, mat: '' }] }
  ];
  let bench = null;

  function tabBench(P) {
    const B = { sysRef: null, drag: null, hover: null, hoverH: null, target: null, mouse: null, raf: 0, W: 600, H: 420, dpr: 1, geo: null };
    bench = B;
    const tg = (opts, cur, on) => h('div', { class: 'tg' }, opts.map(([k, t]) => h('button', { class: cur === k ? 'on' : '', onclick: () => on(k) }, t)));
    const palette = h('div', { class: 'palette' }, h('span', { class: 'lbl' }, 'Añadir:'),
      ELEMENTS.map(el => h('button', { 'data-k': el.key, title: el.title + ' — haz clic sobre el haz para colocarlo', onclick: () => B.setInsert(ui.insert === el.key ? null : el.key) }, el.label)));
    const tools = h('div', { class: 'bench-tool' },
      tg([['2d', '2D'], ['3d', '3D']], ui.bview, k => { ui.bview = k; if (k === '3d') ui.insert = null; rebuildToolbar(); }),
      ui.bview === '2d' ? tg([['move', 'Mover'], ['bend', 'Curvar']], ui.bmode, k => { ui.bmode = k; rebuildToolbar(); B.frame(); }) : null,
      h('button', { onclick: () => B.fit() }, 'Encuadrar'),
      h('label', { class: 'lbl' }, 'Rayos', h('select', { onchange: e => { ui.benchRays = +e.target.value; B.frame(); } }, [5, 7, 11, 17, 25].map(n => h('option', { value: n, selected: ui.benchRays === n }, n)))));
    const toolbarWrap = h('div', { class: 'bench-bar' }, tools, ui.bview === '2d' ? palette : null);
    // la barra cambia con la vista/modo: se rehace la pestaña conservando la vista (ui.v2 / ui.v3)
    function rebuildToolbar() { P.innerHTML = ''; bench = null; tabBench(P); }

    const cv = h('canvas', { class: 'bench-cv', tabindex: 0 });
    const hint = h('div', { class: 'bench-hint' });
    const insp = h('div', { class: 'insp' });
    const live = h('div', { class: 'quick bench-live' });
    const wrap = h('div', { class: 'bench-cvwrap' }, cv, hint);
    const root = h('div', { class: 'bench' }, toolbarWrap, h('div', { class: 'bench-main' }, h('div', null, wrap, live), insp));
    P.append(root);
    Object.assign(B, { root, cv, insp, live, hint, wrap });

    // --- geometría -----------------------------------------------------
    function footprintAt(rays, i) { let m = 0; rays.forEach(r => { const p = r.pts[i]; if (p) m = Math.max(m, Math.hypot(p[0], p[1])); }); return m; }
    function computeGeo() {
      const L = ctx.L, E = ctx.epd, wl = sys.wavelengths[sys.primary].wl;
      const cand = [], n = ui.benchRays;
      for (let k = 0; k <= 4 * n; k++) { const y = ((k + 0.5) / (4 * n + 1) - 0.5) * E; if (O.pupilMask(ctx.ap, ctx.centers, 0, y) >= 0) cand.push(y); }
      const ys = cand.length > n ? cand.filter((_, k) => k % Math.ceil(cand.length / n) === 0) : cand;
      const rays = [];
      sys.fields.forEach((f, fi) => {
        const D = O.fieldDir(f.y);
        ys.forEach(y => { const seg = O.pupilMask(ctx.ap, ctx.centers, 0, y); const r = O.traceRay(ctx, O.startPt(0, y, D, Math.max(120, E * 0.35)), D, wl, { seg, record: true }); rays.push({ fi, pts: r.pts, ok: r.ok }); });
      });
      const profs = [];
      for (let i = 1; i <= L; i++) {
        const s = sys.surfaces[i];
        let Hh = s.sd > 0 ? s.sd : footprintAt(rays, i) * 1.05;
        if (!(Hh > 0)) Hh = Math.max(5, E * 0.05);
        const pts = [], segOn = [];
        for (let k = 0; k <= 160; k++) {
          const y = -Hh + 2 * Hh * k / 160;
          if (s.hole > 0 && Math.abs(y) < s.hole) { pts.push(null); segOn.push(false); continue; }
          const sg = O.sagS(ctx, i, y * y);
          if (!isFinite(sg)) { pts.push(null); segOn.push(false); continue; }
          const w = O.xfPoint(ctx, i, [0, y, ctx.z[i] + sg]);
          pts.push([w[2], w[1]]);
          segOn.push(i === ctx.segSurf && O.pupilMask(ctx.ap, ctx.centers, 0, y) >= 0);
        }
        profs.push({ i, pts, segOn, Hh, mirror: ctx.mirror[i], img: i === L, dummy: !ctx.mirror[i] && (sys.surfaces[i - 1] ? isAir(i - 1) : true) && isAir(i) });
      }
      return { rays, profs };
    }
    function isAir(i) { const s = sys.surfaces[i]; return !s || O.isMirror(s.mat) ? true : Math.abs(O.glassIndex(s.mat, 0.55) - 1) < 1e-9; }
    function isGlass(i) { const s = sys.surfaces[i]; return s && !O.isMirror(s.mat) && O.glassIndex(s.mat, 0.55) > 1.0001; }
    function sagW(i, y) { const v = O.sagS(ctx, i, y * y); return isFinite(v) ? ctx.z[i] + v : NaN; }
    // punto del perfil (corte x = 0) en coordenadas mundo [z, y], con descentrados
    function zy(i, y) { const z = sagW(i, y); if (!isFinite(z)) return null; const w = O.xfPoint(ctx, i, [0, y, z]); return [w[2], w[1]]; }
    function P3(i, x, y) { const z = sagW(i, Math.hypot(x, y)); return isFinite(z) ? O.xfPoint(ctx, i, [x, y, z]) : null; }

    // --- vista ---------------------------------------------------------
    const X = z => B.W / 2 + (z - ui.v2.zc) * ui.v2.k, Y = y => B.H / 2 - (y - ui.v2.yc) * ui.v2.k;
    const Z_ = x => ui.v2.zc + (x - B.W / 2) / ui.v2.k, Y_ = yy => ui.v2.yc - (yy - B.H / 2) / ui.v2.k;
    B.fit = function () {
      const g = B.geo || computeGeo();
      if (ui.bview === '2d') {
        let z0 = Infinity, z1 = -Infinity, ym = 0;
        const acc = (z, y) => { if (!isFinite(z) || !isFinite(y)) return; z0 = Math.min(z0, z); z1 = Math.max(z1, z); ym = Math.max(ym, Math.abs(y)); };
        g.profs.forEach(p => p.pts.forEach(q => q && acc(q[0], q[1])));
        g.rays.forEach(r => r.pts.slice(1).forEach(q => acc(q[2], q[1])));
        if (!isFinite(z0)) { z0 = -100; z1 = 100; }
        z0 -= (z1 - z0) * 0.08 + 10; z1 += (z1 - z0) * 0.04 + 10; ym = (ym || 50) * 1.12;
        ui.v2 = { zc: (z0 + z1) / 2, yc: 0, k: Math.min((B.W - 40) / (z1 - z0), (B.H - 40) / (2 * ym)) };
      } else {
        ui.v3 = Object.assign({ yaw: -1.25, pitch: 0.42 }, ui.v3 || {}, { k: 1, px: 0, py: 0 });
        const pts = geo3().all.map(p => proj3(p));
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        pts.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
        const k = Math.min((B.W - 40) / Math.max(1e-6, x1 - x0), (B.H - 40) / Math.max(1e-6, y1 - y0));
        ui.v3.k = k;
        const c = [(x0 + x1) / 2, (y0 + y1) / 2];
        ui.v3.px = -(c[0] - B.W / 2) * k; ui.v3.py = -(c[1] - B.H / 2) * k;
      }
      B.frame();
    };

    // --- 3D -------------------------------------------------------------
    let zmid3 = 0;
    function proj3(P) {
      const v = ui.v3, x = P[0], y = P[1], z = P[2] - zmid3;
      const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
      const x1 = x * cy - z * sy, z1 = x * sy + z * cy, y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      return [B.W / 2 + (v.px || 0) + x1 * v.k, B.H / 2 + (v.py || 0) - y2 * v.k, z2];
    }
    function geo3() {
      const L = ctx.L, E = ctx.epd, wl = sys.wavelengths[sys.primary].wl, g2 = B.geo || computeGeo();
      const surfs = [], all = [];
      let zmin = Infinity, zmax = -Infinity;
      for (let i = 1; i <= L; i++) { zmin = Math.min(zmin, ctx.z[i]); zmax = Math.max(zmax, ctx.z[i]); }
      zmid3 = (zmin + zmax) / 2;
      const ring = (cx, cy, r, i) => { const a = []; for (let k = 0; k <= 48; k++) { const t = 2 * Math.PI * k / 48, q = P3(i, cx + r * Math.cos(t), cy + r * Math.sin(t)); if (q) a.push(q); } return a; };
      for (let i = 1; i <= L; i++) {
        const s = sys.surfaces[i], pr = g2.profs[i - 1], lines = [], fills = [];
        if (i === ctx.segSurf) {
          ctx.centers.forEach(c => { const rg = ring(c[0], c[1], ctx.ap.dseg / 2, i); lines.push(rg); fills.push(rg); const cr = []; for (let k = -6; k <= 6; k++) { const x = c[0] + ctx.ap.dseg / 2 * k / 6; const q = P3(i, x, c[1]); if (q) cr.push(q); } lines.push(cr); });
        } else {
          const rg = ring(0, 0, pr.Hh, i); lines.push(rg); fills.push(rg);
          if (s.hole > 0) lines.push(ring(0, 0, s.hole, i));
          for (const ax of [0, 1]) { let cur = []; for (let k = 0; k <= 40; k++) { const u = -pr.Hh + 2 * pr.Hh * k / 40; if (s.hole > 0 && Math.abs(u) < s.hole) { if (cur.length) lines.push(cur); cur = []; continue; } const q = ax ? P3(i, 0, u) : P3(i, u, 0); if (q) cur.push(q); } if (cur.length) lines.push(cur); }
        }
        lines.forEach(l => l.forEach(p => all.push(p)));
        surfs.push({ i, lines, fills, mirror: ctx.mirror[i], img: i === L });
      }
      const rays = [];
      const samp = [];
      if (ctx.ap.type === 'segmented') ctx.centers.forEach(c => { samp.push([c[0], c[1]]); for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2; samp.push([c[0] + 0.6 * ctx.ap.dseg / 2 * Math.cos(a), c[1] + 0.6 * ctx.ap.dseg / 2 * Math.sin(a)]); } });
      else for (let q = 0; q < 12; q++) { const a = q * Math.PI / 6; samp.push([0.45 * E * Math.cos(a), 0.45 * E * Math.sin(a)]); }
      sys.fields.forEach((f, fi) => {
        const D = O.fieldDir(f.y);
        samp.forEach(([x, y]) => { const seg = O.pupilMask(ctx.ap, ctx.centers, x, y); if (seg < 0) return; const r = O.traceRay(ctx, O.startPt(x, y, D, Math.max(120, E * 0.35)), D, wl, { seg, record: true }); rays.push({ fi, pts: r.pts, ok: r.ok }); r.pts.forEach(p => all.push(p)); });
      });
      return { surfs, rays, all };
    }
    function draw3(g) {
      if (!ui.v3) { B.fit(); return; }
      const G = geo3();
      const order = G.surfs.map(s => ({ s, d: s.lines.length ? proj3(s.lines[0][0])[2] : 0 })).sort((a, b) => a.d - b.d);
      // ejes
      g.strokeStyle = css('--line'); g.setLineDash([4, 4]); g.beginPath();
      const a0 = proj3([0, 0, ctx.z[1] - 200]), a1 = proj3([0, 0, ctx.z[ctx.L] + 100]); g.moveTo(a0[0], a0[1]); g.lineTo(a1[0], a1[1]); g.stroke(); g.setLineDash([]);
      order.forEach(({ s }) => {
        const sel = s.i === ui.sel, col = sel ? css('--acc') : s.mirror ? css('--ink') : s.img ? css('--ink3') : css('--acc2');
        s.fills.forEach(f => { g.beginPath(); f.forEach((p, k) => { const q = proj3(p); k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fillStyle = col; g.globalAlpha = s.mirror ? 0.16 : 0.08; g.fill(); g.globalAlpha = 1; });
      });
      G.rays.forEach(r => { g.strokeStyle = SER[r.fi % SER.length]; g.globalAlpha = r.ok ? 0.55 : 0.18; g.lineWidth = 1; g.beginPath(); r.pts.forEach((p, k) => { const q = proj3(p); k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke(); });
      g.globalAlpha = 1;
      order.forEach(({ s }) => {
        const sel = s.i === ui.sel;
        g.strokeStyle = sel ? css('--acc') : s.mirror ? css('--ink') : s.img ? css('--ink3') : css('--acc2');
        g.lineWidth = sel ? 2.4 : 1.3;
        s.lines.forEach(l => { g.beginPath(); l.forEach((p, k) => { const q = proj3(p); k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke(); });
        if (s.lines[0] && s.lines[0].length) { let top = null; s.lines.forEach(l => l.forEach(p => { const q = proj3(p); if (!top || q[1] < top[1]) top = q; })); g.fillStyle = css('--ink2'); g.font = '11px IBM Plex Mono, monospace'; g.textAlign = 'center'; g.fillText(s.img ? 'IMA' : s.i, top[0], top[1] - 6); }
      });
      B.hint.textContent = 'Arrastra para orbitar · rueda para zoom · selecciona superficies en la tabla o en 2D';
    }

    // --- 2D -------------------------------------------------------------
    function screenPolys(G) {
      return G.profs.map(p => p.pts.map(q => q ? [X(q[0]), Y(q[1])] : null));
    }
    function draw2(g) {
      if (!ui.v2) { B.fit(); return; }
      const G = B.geo, L = ctx.L;
      // eje
      g.strokeStyle = css('--line'); g.setLineDash([4, 4]); g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(B.W, Y(0)); g.stroke(); g.setLineDash([]);
      // vidrio
      for (let i = 1; i < L; i++) {
        if (!isGlass(i)) continue;
        const a = G.profs[i - 1], b = G.profs[i], Hh = Math.min(a.Hh, b.Hh), hole = Math.max(sys.surfaces[i].hole || 0, sys.surfaces[i + 1].hole || 0);
        const side = (sgn) => { g.beginPath(); let first = true; for (let k = 0; k <= 60; k++) { const y = sgn * (hole + (Hh - hole) * k / 60); const q = zy(i, y); if (!q) continue; first ? g.moveTo(X(q[0]), Y(q[1])) : g.lineTo(X(q[0]), Y(q[1])); first = false; } for (let k = 60; k >= 0; k--) { const y = sgn * (hole + (Hh - hole) * k / 60); const q = zy(i + 1, y); if (!q) continue; g.lineTo(X(q[0]), Y(q[1])); } g.closePath(); g.fill(); };
        g.fillStyle = css('--acc2'); g.globalAlpha = 0.16; side(1); side(-1); g.globalAlpha = 1;
      }
      // rayos
      G.rays.forEach(r => { g.strokeStyle = SER[r.fi % SER.length]; g.globalAlpha = r.ok ? 0.7 : 0.2; g.lineWidth = 1; g.beginPath(); r.pts.forEach((p, k) => k ? g.lineTo(X(p[2]), Y(p[1])) : g.moveTo(X(p[2]), Y(p[1]))); g.stroke(); });
      g.globalAlpha = 1;
      // objetivo de inserción
      if (ui.insert && B.target) {
        const t = B.target;
        G.rays.forEach(r => { const a = r.pts[t.gap], b = r.pts[t.gap + 1]; if (!a || !b) return; g.strokeStyle = css('--acc'); g.lineWidth = 2.2; g.globalAlpha = 0.6; g.beginPath(); g.moveTo(X(a[2]), Y(a[1])); g.lineTo(X(b[2]), Y(b[1])); g.stroke(); });
        g.globalAlpha = 1; g.setLineDash([5, 4]); g.strokeStyle = css('--acc'); g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(X(t.z), Y(t.sd)); g.lineTo(X(t.z), Y(-t.sd)); g.stroke(); g.setLineDash([]);
        g.fillStyle = css('--acc'); g.font = '12px IBM Plex Sans, sans-serif'; g.textAlign = 'left';
        g.fillText('insertar tras sup. ' + t.gap + ' · Ø' + fmt(2 * t.sd, 1), X(t.z) + 6, Y(t.sd) - 6);
      }
      // superficies
      const polys = screenPolys(G); B.polys = polys;
      G.profs.forEach((p, k) => {
        const i = p.i, sel = i === ui.sel, hov = i === B.hover;
        const base = p.mirror ? css('--ink') : p.img ? css('--ink3') : p.dummy ? css('--ink3') : css('--acc2');
        g.strokeStyle = sel ? css('--acc') : base; g.lineWidth = (p.mirror ? 2.2 : 1.6) + (sel ? 1.2 : 0) + (hov ? 1 : 0);
        if (p.dummy && !sel) g.setLineDash([5, 4]);
        g.beginPath(); let st = false; polys[k].forEach(q => { if (!q) { st = false; return; } st ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); st = true; }); g.stroke(); g.setLineDash([]);
        if (i === ctx.segSurf) { g.strokeStyle = css('--acc'); g.lineWidth = 3.4; g.beginPath(); st = false; polys[k].forEach((q, n) => { if (!q || !p.segOn[n]) { st = false; return; } st ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); st = true; }); g.stroke(); }
        if (p.mirror) { // rayado en la cara trasera
          const sin = i === 1 ? 1 : (Math.sign(sys.surfaces[i - 1].t) || 1);
          g.strokeStyle = sel ? css('--acc') : css('--ink3'); g.lineWidth = 1;
          polys[k].forEach((q, n) => { if (!q || n % 7) return; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] + sin * 6, q[1] - 5); g.stroke(); });
        }
        // etiqueta
        const top = polys[k].find(q => q); if (top) { g.fillStyle = sel ? css('--acc') : css('--ink2'); g.font = '11px IBM Plex Mono, monospace'; g.textAlign = 'center'; g.fillText(p.img ? 'IMA' : i === 1 ? 'STO' : i, top[0], top[1] - 8); }
      });
      // tiradores
      if (ui.sel != null) {
        const i = ui.sel, s = sys.surfaces[i], p = G.profs[i - 1];
        if (p) {
          const v0 = zy(i, 0) || [ctx.z[i], 0], vx = X(v0[0]), vy = Y(v0[1]);
          g.fillStyle = css('--acc'); g.fillRect(vx - 5, vy - 5, 10, 10);
          const Hh = p.Hh;
          for (const sg of [1, -1]) { const q = zy(i, sg * Hh); if (!q) continue; g.beginPath(); g.arc(X(q[0]), Y(q[1]), 5.5, 0, 2 * Math.PI); g.fillStyle = s.sd > 0 ? css('--acc') : css('--bg2'); g.fill(); g.strokeStyle = css('--acc'); g.lineWidth = 1.5; g.stroke(); }
        }
      }
      // escala
      const bar = Math.pow(10, Math.floor(Math.log10((B.W / 6) / ui.v2.k)));
      g.strokeStyle = css('--ink2'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(14, B.H - 12); g.lineTo(14 + bar * ui.v2.k, B.H - 12); g.stroke();
      g.fillStyle = css('--ink3'); g.font = '11px IBM Plex Mono, monospace'; g.textAlign = 'left'; g.fillText(bar + ' mm', 18 + bar * ui.v2.k, B.H - 8);
      if (!B.drag) B.hint.textContent = ui.insert
        ? 'Haz clic sobre el haz donde quieres colocar el elemento (Mayús+clic para seguir insertando · Esc cancela)'
        : ui.bmode === 'bend' ? 'Modo Curvar: arrastra el perfil de una superficie para cambiar su radio'
        : 'Clic = seleccionar · arrastra el vértice ■ para mover (Mayús = pasos de 1 mm) · ● del borde = semi-Ø · fondo = desplazar · rueda = zoom';
    }

    // --- dibujo y métricas ----------------------------------------------
    B.size = function () {
      const w = Math.max(300, Math.round(wrap.clientWidth || P.clientWidth || 600));
      const hgt = Math.round(Math.max(340, Math.min(620, w * 0.56)));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (w !== B.W || hgt !== B.H || dpr !== B.dpr || cv.width !== Math.round(w * dpr)) {
        B.W = w; B.H = hgt; B.dpr = dpr; cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr);
        cv.style.width = '100%'; cv.style.aspectRatio = w + ' / ' + hgt;
      }
    };
    B.frame = function () {
      if (B.raf) return;
      B.raf = requestAnimationFrame(() => {
        B.raf = 0;
        if (!root.isConnected) return;
        const g = cv.getContext('2d'); g.setTransform(B.dpr, 0, 0, B.dpr, 0, 0);
        g.fillStyle = css('--plot-bg'); g.fillRect(0, 0, B.W, B.H);
        try { B.geo = computeGeo(); ui.bview === '3d' ? draw3(g) : draw2(g); }
        catch (e) { console.error(e); g.fillStyle = css('--bad'); g.fillText('No se puede trazar: ' + e.message, 16, 24); }
        liveMetrics();
      });
    };
    function liveMetrics() {
      live.innerHTML = '';
      if (!par) { live.append(h('span', { class: 'ko' }, 'Sistema paraxial no válido')); return; }
      const L = sys.surfaces.length - 1, f0 = sys.fields[0], fl = sys.fields[sys.fields.length - 1];
      const s0 = O.spot(ctx, sys, f0.y, 11), s1 = sys.fields.length > 1 ? O.spot(ctx, sys, fl.y, 11) : null;
      const defoc = sys.surfaces[L - 1].t - par.bfl;
      const items = [['EFL', fmt(par.efl, 2) + ' mm'], ['F/#', fmt(par.fno, 3)], ['Desenfoque', fmt(defoc, 3) + ' mm'],
        ['Spot RMS ' + fmt(f0.y, 3) + '°', s0 ? fmt(s0.rms, 2) + ' µm' : '—']];
      if (s1) items.push(['Spot RMS ' + fmt(fl.y, 3) + '°', fmt(s1.rms, 2) + ' µm']);
      if (s0) items.push(['Viñeteo eje', fmt(s0.lostFrac * 100, 1) + ' %']);
      if (ctx.nPert) items.push(['Descentrados activos', String(ctx.nPert)]);
      items.forEach(([k, v]) => live.append(h('span', null, k + ' ', h('b', null, v))));
    }

    // --- interacción -----------------------------------------------------
    function evPos(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (B.W / r.width), y: (e.clientY - r.top) * (B.H / r.height) }; }
    function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let t = l2 ? ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - a[0] - t * dx, p.y - a[1] - t * dy); }
    function surfHit(p) {
      if (!B.polys) return null; let best = null, bd = 8;
      B.polys.forEach((poly, k) => { for (let n = 1; n < poly.length; n++) { if (!poly[n] || !poly[n - 1]) continue; const d = segDist(p, poly[n - 1], poly[n]); if (d < bd) { bd = d; best = k + 1; } } });
      return best;
    }
    function handleHit(p) {
      if (ui.sel == null || !B.geo) return null;
      const i = ui.sel, pr = B.geo.profs[i - 1]; if (!pr) return null;
      const v0 = zy(i, 0) || [ctx.z[i], 0];
      if (Math.hypot(p.x - X(v0[0]), p.y - Y(v0[1])) < 9) return { type: 'move', i };
      for (const sg of [1, -1]) { const q = zy(i, sg * pr.Hh); if (q && Math.hypot(p.x - X(q[0]), p.y - Y(q[1])) < 9) return { type: 'sd', i }; }
      return null;
    }
    function insertTarget(p) {
      if (!B.geo) return null;
      const L = ctx.L; let best = null, bd = 30;
      for (let gi = 1; gi < L; gi++) B.geo.rays.forEach(r => { const a = r.pts[gi], b = r.pts[gi + 1]; if (!a || !b) return; const d = segDist(p, [X(a[2]), Y(a[1])], [X(b[2]), Y(b[1])]); if (d < bd) { bd = d; best = gi; } });
      if (best == null) return null;
      const zi = ctx.z[best], zn = ctx.z[best + 1];
      let z = Z_(p.x);
      const lo = Math.min(zi, zn), hi = Math.max(zi, zn), m = Math.max(0.5, (hi - lo) * 0.02);
      z = Math.max(lo + m, Math.min(hi - m, z));
      let sd = 0;
      B.geo.rays.forEach(r => { const a = r.pts[best], b = r.pts[best + 1]; if (!a || !b || a[2] === b[2]) return; const u = (z - a[2]) / (b[2] - a[2]); if (u < -1e-6 || u > 1 + 1e-6) return; sd = Math.max(sd, Math.hypot(a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]))); });
      return { gap: best, z: Math.round(z * 100) / 100, sd: Math.max(2, Math.ceil(sd * 1.1 + 1)) };
    }
    function insertElement(t, key) {
      const el = ELEMENTS.find(e => e.key === key); if (!el) return;
      const S = sys.surfaces, i = t.gap, L = S.length - 1, ti = S[i].t, s = Math.sign(ti) || 1;
      const d = t.z - ctx.z[i], rem = ti - d;
      const els = el.make(s).map(e => Object.assign({ sd: t.sd, hole: 0, k: 0 }, e));
      const T = els.slice(0, -1).reduce((a, e) => a + Math.abs(e.t), 0);
      if (!el.mirror && s * rem < T + 0.2) { alert('No cabe: el hueco restante es de ' + fmt(Math.abs(rem), 2) + ' mm y el elemento mide ' + fmt(T, 2) + ' mm.'); return; }
      S[i].t = +d.toFixed(4);
      if (el.mirror) {
        els[0].t = +(-rem).toFixed(4);
        for (let j = i + 1; j <= L; j++) { S[j].r = isFinite(S[j].r) ? -S[j].r : Infinity; if (j < L) S[j].t = -S[j].t; }
      } else els[els.length - 1].t = +(rem - s * T).toFixed(4);
      shiftVary(i + 1, els.length);
      S.splice(i + 1, 0, ...els);
      ui.sel = i + 1;
      changed({ lde: true, now: true });
    }
    B.setInsert = function (k) {
      ui.insert = k; B.target = null;
      root.querySelectorAll('.palette button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
      cv.style.cursor = k ? 'crosshair' : 'default';
      B.frame();
    };
    B.deleteSel = function () {
      const i = ui.sel, L = sys.surfaces.length - 1;
      if (i == null || i <= 0 || i >= L) return;
      if (L <= 2) return;
      shiftVary(i, -1); sys.surfaces.splice(i, 1);
      ui.sel = Math.min(i, sys.surfaces.length - 2) || null;
      changed({ lde: true, now: true });
    };
    B.onSelect = function () { buildInspector(); B.frame(); };

    cv.addEventListener('pointerdown', e => {
      const p = evPos(e); cv.focus({ preventScroll: true });
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ }
      if (ui.bview === '3d') { B.drag = { type: 'orbit', x: p.x, y: p.y, yaw: ui.v3.yaw, pitch: ui.v3.pitch }; return; }
      if (ui.insert) { const t = insertTarget(p); if (t) { const k = ui.insert; if (!e.shiftKey) B.setInsert(null); insertElement(t, k); } return; }
      const hd = handleHit(p);
      const si = hd ? hd.i : surfHit(p);
      if (si != null) {
        if (si !== ui.sel) selectSurface(si);
        const S = sys.surfaces, i = si, L = S.length - 1;
        const type = hd ? hd.type : (ui.bmode === 'bend' ? 'bend' : 'move');
        B.drag = { type, i, x: p.x, y: p.y, tPrev: i > 1 ? S[i - 1].t : null, tNext: i < L ? S[i].t : null, zc: ui.v2.zc, changed: false };
        return;
      }
      B.drag = { type: 'pan', x: p.x, y: p.y, zc: ui.v2.zc, yc: ui.v2.yc, moved: false };
    });
    cv.addEventListener('pointermove', e => {
      const p = evPos(e), D = B.drag;
      if (!D) {
        if (ui.bview !== '2d') return;
        if (ui.insert) { B.target = insertTarget(p); B.frame(); return; }
        const hd = handleHit(p), si = hd ? hd.i : surfHit(p);
        cv.style.cursor = hd ? (hd.type === 'sd' ? 'ns-resize' : 'ew-resize') : si != null ? (ui.bmode === 'bend' ? 'crosshair' : 'grab') : 'default';
        if (si !== B.hover) { B.hover = si; B.frame(); }
        return;
      }
      const S = sys.surfaces, L = S.length - 1;
      if (D.type === 'orbit') { ui.v3.yaw = D.yaw + (p.x - D.x) * 0.01; ui.v3.pitch = Math.max(-1.5, Math.min(1.5, D.pitch + (p.y - D.y) * 0.01)); B.frame(); return; }
      if (D.type === 'pan') { if (Math.hypot(p.x - D.x, p.y - D.y) > 3) D.moved = true; ui.v2.zc = D.zc - (p.x - D.x) / ui.v2.k; ui.v2.yc = D.yc + (p.y - D.y) / ui.v2.k; B.frame(); return; }
      const i = D.i;
      if (D.type === 'move') {
        let dz = (p.x - D.x) / ui.v2.k; dz = e.shiftKey ? Math.round(dz) : Math.round(dz * 100) / 100;
        if (i === 1) { S[1].t = +(D.tNext - dz).toFixed(4); ui.v2.zc = D.zc - dz; }
        else { if (D.tPrev != null) S[i - 1].t = +(D.tPrev + dz).toFixed(4); if (D.tNext != null && i < L) S[i].t = +(D.tNext - dz).toFixed(4); }
        B.hint.textContent = `Δz = ${fmt(dz, 2)} mm · espesor anterior ${fmt(S[i - 1] && i > 1 ? S[i - 1].t : NaN, 3)} mm`;
      } else if (D.type === 'sd') {
        const y = Math.abs(Y_(p.y)); S[i].sd = Math.max((S[i].hole || 0) + 0.5, 0.5, Math.round(y * 10) / 10);
        B.hint.textContent = `Semi-Ø = ${fmt(S[i].sd, 1)} mm`;
      } else if (D.type === 'bend') {
        const z = Z_(p.x) - ctx.z[i], y = Y_(p.y);
        if (Math.abs(y) < 0.5) return;
        const c = 2 * z / (z * z + y * y);
        S[i].r = Math.abs(c) < 1e-9 ? Infinity : +(1 / c).toPrecision(7);
        B.hint.textContent = `R = ${fmt(S[i].r, 3)} mm`;
      }
      D.changed = true;
      rebuild(); updateInspectorValues(); B.frame();
    });
    const endDrag = e => {
      const D = B.drag; B.drag = null;
      if (!D) return;
      if (D.type === 'pan' && !D.moved) { selectSurface(null); return; }
      if (D.changed) changed({ lde: true });
    };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('pointerleave', () => { if (!B.drag && B.hover != null) { B.hover = null; B.frame(); } });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015), p = evPos(e);
      if (ui.bview === '3d') { ui.v3.k *= f; ui.v3.px *= f; ui.v3.py *= f; B.frame(); return; }
      const z0 = Z_(p.x), y0 = Y_(p.y);
      ui.v2.k *= f; ui.v2.zc = z0 - (p.x - B.W / 2) / ui.v2.k; ui.v2.yc = y0 + (p.y - B.H / 2) / ui.v2.k;
      B.frame();
    }, { passive: false });

    // --- inspector -------------------------------------------------------
    let insInputs = {};
    function updateInspectorValues() {
      const i = ui.sel; if (i == null) return; const s = sys.surfaces[i]; if (!s) return;
      for (const k in insInputs) { const el = insInputs[k]; if (document.activeElement === el) continue; el.value = fmt(s[k], 6); }
      if (insInputs._z) insInputs._z.textContent = fmt(ctx.z[i], 3) + ' mm';
    }
    function buildInspector() {
      insp.innerHTML = ''; insInputs = {};
      const S = sys.surfaces, L = S.length - 1, i = ui.sel;
      insp.append(h('div', { class: 'chips' }, S.map((s, k) => k === 0 ? null : h('button', { class: k === i ? 'on' : '', title: s.cm, onclick: () => selectSurface(k) }, k === L ? 'IMA' : k === 1 ? 'STO' : k))));
      if (i == null || !S[i]) {
        insp.append(h('h3', null, 'Inspector'), h('p', { class: 'hint' },
          'Selecciona una superficie (clic en el dibujo, en los botones de arriba o en la tabla). ',
          h('b', null, 'Mover:'), ' arrastra el vértice ■ o el perfil; los espesores vecinos se compensan para que el resto no se mueva. ',
          h('b', null, 'Semi-Ø:'), ' arrastra los puntos ● del borde. ', h('b', null, 'Curvar:'), ' en modo Curvar arrastra el perfil. ',
          h('b', null, 'Añadir:'), ' elige un elemento en la barra y haz clic sobre el haz. Los espejos insertados reflejan el resto del sistema. ',
          h('b', null, 'Deshacer:'), ' Ctrl+Z.'));
        return;
      }
      const s = S[i], isImg = i === L;
      if (!B.geo) B.geo = computeGeo();
      const kind = s.seg ? 'Espejo segmentado' : O.isMirror(s.mat) ? 'Espejo' : isImg ? 'Imagen' : isGlass(i) ? 'Refractiva (entra en vidrio)' : isGlass(i - 1) ? 'Refractiva (sale del vidrio)' : 'Ficticia / aire';
      insp.append(h('h3', null, (isImg ? 'Imagen' : 'Superficie ' + i) + ' ', h('span', { class: 'badge' }, kind), ctx.xf[i] ? h('span', { class: 'badge warnb' }, 'descentrada') : null));
      const cm = h('input', { type: 'text', value: s.cm || '', class: 'wide', onchange: e => { s.cm = e.target.value; changed({ lde: true }); } });
      insp.append(cm);
      const grid = h('div', { class: 'insgrid' }); insp.append(grid);
      const textIn = (key, allowInf, disabled) => {
        const el = h('input', { type: 'text', value: key === 'mat' ? s.mat : fmt(s[key], 6), disabled: disabled || false });
        el.addEventListener('change', () => {
          if (key === 'mat') { s.mat = el.value.trim(); }
          else { const v = parseNum(el.value, allowInf); if (isNaN(v)) { el.classList.add('bad-in'); return; } s[key] = v; }
          changed({ lde: true });
        });
        el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
        if (key !== 'mat') insInputs[key] = el;
        return el;
      };
      const slider = (get, set, span) => {
        const el = h('input', { type: 'range', min: 0, max: 1000, value: 500, class: 'sl' });
        const base = get();
        el.addEventListener('input', () => { set(base + (el.value - 500) / 500 * span); rebuild(); updateInspectorValues(); B.frame(); });
        el.addEventListener('change', () => changed({ lde: true }));
        return el;
      };
      const row = (lab, inp, sl, unit) => { grid.append(h('label', null, lab), h('div', { class: 'insrow' }, inp, unit ? h('span', { class: 'u' }, unit) : null)); if (sl) grid.append(h('div', { class: 'slw' }, sl)); };
      const c0 = O.curv(s.r), sdv = s.sd || (B.geo && B.geo.profs[i - 1] ? B.geo.profs[i - 1].Hh : 20);
      row('Radio', textIn('r', true), slider(() => c0, c => { s.r = Math.abs(c) < 1e-12 ? Infinity : +(1 / c).toPrecision(8); }, Math.max(Math.abs(c0) * 0.6, 1 / (8 * Math.max(10, sdv)))), 'mm');
      if (!isImg) row('Espesor', textIn('t', false), slider(() => s.t, v => { s.t = +v.toFixed(3); }, Math.max(Math.abs(s.t) * 0.3, 10)), 'mm');
      const matIn = textIn('mat', false, isImg); matIn.setAttribute('list', 'glassList');
      if (!isImg) row('Material', matIn, null, '');
      row('Semi-Ø', textIn('sd', false), null, 'mm');
      row('Agujero r', textIn('hole', false), null, 'mm');
      row('Cónica', textIn('k', false), slider(() => s.k, v => { s.k = +v.toFixed(5); }, 2), '');
      if (!isImg) { row('A4', textIn('a4', false), null, 'mm⁻³'); row('A6', textIn('a6', false), null, 'mm⁻⁵'); row('A8', textIn('a8', false), null, 'mm⁻⁷'); }
      if (!document.getElementById('glassList')) document.body.append(h('datalist', { id: 'glassList' }, ['MIRROR', 'AIR'].concat(Object.keys(O.GLASS)).map(g => h('option', { value: g }))));
      if (sys.aperture.type === 'segmented' && !isImg) {
        insp.append(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!s.seg, onchange: e => { S.forEach(x => delete x.seg); if (e.target.checked) s.seg = true; changed({ lde: true }); } }), 'Superficie segmentada (aplica la pupila en anillo y los errores de segmento)'));
      }
      // información
      const fp = B.geo ? footprintAt(B.geo.rays, i) : NaN;
      const hEdge = s.sd || fp, sagE = O.sagS(ctx, i, hEdge * hEdge);
      const info = h('div', { class: 'insinfo' });
      const zEl = h('b', null, fmt(ctx.z[i], 3) + ' mm'); insInputs._z = zEl;
      info.append(h('div', null, 'z del vértice ', zEl));
      info.append(h('div', null, 'Huella del haz (corte Y) ', h('b', null, fmt(fp, 2) + ' mm'), s.sd > 0 && fp > s.sd ? h('span', { class: 'ko' }, ' > semi-Ø, viñetea') : null));
      info.append(h('div', null, 'Flecha en el borde ', h('b', null, fmt(sagE, 4) + ' mm')));
      const wl = sys.wavelengths[sys.primary].wl, nb = i === 1 ? 1 : (isGlass(i - 1) ? O.glassIndex(S[i - 1].mat, wl) : 1);
      const na = O.isMirror(s.mat) ? nb : isGlass(i) ? O.glassIndex(s.mat, wl) : 1;
      if (O.isMirror(s.mat) && O.curv(s.r)) info.append(h('div', null, 'Focal del espejo ', h('b', null, fmt(Math.abs(s.r) / 2, 2) + ' mm')));
      else if (!isImg && na !== nb) info.append(h('div', null, 'Potencia de la superficie ', h('b', null, fmt((na - nb) * O.curv(s.r) * 1000, 4) + ' D'), ' (n ', fmt(nb, 4), ' → ', fmt(na, 4), ')'));
      insp.append(info);
      const acts = h('div', { class: 'tools' });
      if (!isImg) acts.append(h('button', { class: 'small', onclick: () => { s.r = isFinite(s.r) ? -s.r : Infinity; changed({ lde: true, now: true }); } }, 'Invertir radio'));
      acts.append(h('button', { class: 'small', onclick: () => { s.r = Infinity; changed({ lde: true, now: true }); } }, 'Hacer plana'));
      if (!isImg && i > 0) acts.append(h('button', { class: 'small', onclick: () => B.deleteSel() }, 'Eliminar'));
      if (!isImg) acts.append(h('button', { class: 'small', title: 'Crea un descentrado para el elemento que contiene esta superficie', onclick: () => {
        const e = O.elements(sys).find(x => x.from <= i && i <= x.to) || { name: s.cm || ('Sup. ' + i), from: i, to: i };
        if (!sys.perturb.some(g => g.from === e.from && g.to === e.to)) sys.perturb.push({ on: true, name: e.name, from: e.from, to: e.to, dx: 0, dy: 0, dz: 0, tx: 0, ty: 0, piv: 0 });
        ui.tab = 'decenter'; renderTabs(); changed({ now: true });
      } }, 'Descentrar elemento…'));
      acts.append(h('button', { class: 'small', title: 'Marca radio/espesor/cónica como variables de optimización', onclick: () => { sys.vary[i + ':r'] = true; if (!isImg) sys.vary[i + ':t'] = true; changed({ lde: true }); } }, 'Marcar como variables'));
      insp.append(acts);
    }

    B.refresh = function () {
      B.size();
      if (ui.refit) { ui.refit = false; ui.v2 = null; ui.v3 = ui.v3 ? { yaw: ui.v3.yaw, pitch: ui.v3.pitch } : null; }
      buildInspector();
      if (!ui.v2 && ui.bview === '2d') { B.geo = computeGeo(); B.fit(); return; }
      if (ui.bview === '3d' && (!ui.v3 || !ui.v3.k)) { B.geo = computeGeo(); B.fit(); return; }
      B.frame();
    };
    if (ui.insert) B.setInsert(ui.insert);
    requestAnimationFrame(() => B.refresh());
  }

  // ---------------- evaluación común (descentrados / validación) ----------------
  function cloneSys(s) { return jsonIn(jsonOut(s)); }
  function nominalOf(s, keepSeg) { const n = cloneSys(s); n.perturb = []; if (!keepSeg) n.segments = n.segments.map(() => ({ p: 0, tx: 0, ty: 0, dR: 0 })); return n; }
  const diffCache = new Map();
  // diámetro EE80 limitado por difracción [µm] (pupila real, λ primaria)
  function diffEE80(s) {
    const c = O.buildCtx(s), p = O.paraxial(c, s); if (!p) return 0;
    const wl = s.wavelengths[s.primary].wl;
    const key = JSON.stringify(s.aperture) + '|' + p.fno.toFixed(4) + '|' + wl;
    if (diffCache.has(key)) return diffCache.get(key);
    let d = 0;
    try { const r = O.psf(c, nominalOf(s), 0, wl, 64, 4, 64); if (r) { const k = r.ee.ref.findIndex(v => v >= 0.8); d = k >= 0 ? 2 * r.ee.r[k] : 0; } } catch (e) { d = 0; }
    diffCache.set(key, d); return d;
  }
  function evalDesign(s, o) {
    o = o || {};
    const c = O.buildCtx(s), p = O.paraxial(c, s);
    const fields = o.fields || s.fields.map(f => f.y);
    const frs = fields.map(y => O.fieldRays(c, s, y, o.N || 13));
    let dz = 0;
    if (o.refocus) dz = O.bestFocus(frs, c, null, o.range || 2);
    const sp = frs.map(fr => O.spotAt(fr, c, dz));
    const res = { c, par: p, frs, dz, sp, fields };
    if (o.opd) {
      // WFE en eje: si hay compensador, se enfoca en el eje (uso planetario)
      let s2 = s, c2 = c, dzA = 0;
      if (o.refocus) { let k = 0; fields.forEach((y, i) => { if (Math.abs(y) < Math.abs(fields[k])) k = i; }); dzA = O.bestFocus([frs[k]], c, null, o.range || 2); }
      if (dzA) { s2 = cloneSys(s); s2.surfaces[s2.surfaces.length - 2].t += dzA; c2 = O.buildCtx(s2); }
      const wl = s.wavelengths[s.primary].wl, om = O.opdMap(c2, s2, 0, wl, o.opdN || 32, true);
      res.wfe = om ? om.rms * wl * 1000 : NaN;
    }
    return res;
  }
  const eeTot = (sp, diff) => sp ? Math.hypot(2 * sp.ee80, diff || 0) : NaN; // diámetro EE80 con difracción [µm]
  const eeG = sp => sp ? 2 * sp.ee80 : NaN; // diámetro EE80 geométrico (aberraciones del diseño) [µm]
  const seeEE = () => 1.524 * sys.req.seeing; // Ø EE80 de un seeing gaussiano de FWHM dado [″]
  // peor EE80 geométrico [″] (criterio de diseño: la difracción de la pupila se trata aparte)
  function worstEE(res, diff, plate) { let w = 0; res.sp.forEach(sp => { const v = eeG(sp); w = Math.max(w, isFinite(v) ? v : Infinity); }); return w * plate / 1000; }
  function axisIdx(res) { let k = 0; res.fields.forEach((y, i) => { if (Math.abs(y) < Math.abs(res.fields[k])) k = i; }); return k; }
  function chiefShift(res, ref) { const a = res.sp[axisIdx(res)], b = ref.sp[axisIdx(ref)]; if (!a || !b || !a.chief || !b.chief) return NaN; return Math.hypot(a.chief[0] - b.chief[0], a.chief[1] - b.chief[1]); }
  function budget() { const R = sys.req; return R.seeing * R.budget; }
  const PERT_P = [['dy', 'Descentrado Y [mm]', 0.5], ['dx', 'Descentrado X [mm]', 0.5], ['dz', 'Desplazamiento axial Δz [mm]', 0.5], ['tx', 'Tilt alrededor de X [°]', 0.1], ['ty', 'Tilt alrededor de Y [°]', 0.1]];

  // ---------------- pestaña Descentrados ----------------
  function tabDecenter(P) {
    const els = O.elements(sys), L = sys.surfaces.length - 1, PT = sys.perturb;
    P.append(h('p', { class: 'hint' }, 'Cada fila mueve un grupo de superficies (un espejo, una lente o cualquier rango) como un sólido rígido: descentrado Δx/Δy, desplazamiento axial Δz (sin mover el resto del sistema) e inclinaciones alrededor de X/Y respecto a un pivote situado en el vértice de la primera superficie + «pivote Δz». ',
      h('b', null, 'Mientras estén activos se aplican a todos los análisis'), ' (spot, frente de onda, PSF, banco óptico…).'));
    const selEl = h('select', null, els.map((e, k) => h('option', { value: k }, `${e.name} (sup. ${e.from}${e.to !== e.from ? '–' + e.to : ''})`)));
    const fromIn = h('input', { type: 'number', value: 1, min: 1, max: L, step: 1, style: 'width:64px' }), toIn = h('input', { type: 'number', value: Math.max(1, L - 1), min: 1, max: L, step: 1, style: 'width:64px' });
    const add = (name, a, b) => { a = Math.max(1, Math.min(L, a | 0)); b = Math.max(a, Math.min(L, b | 0)); PT.push({ on: true, name, from: a, to: b, dx: 0, dy: 0, dz: 0, tx: 0, ty: 0, piv: 0 }); changed({ now: true }); };
    P.append(h('div', { class: 'ctrl' },
      h('label', null, 'Elemento', selEl), h('button', { disabled: !els.length, onclick: () => { const e = els[+selEl.value]; if (e) add(e.name, e.from, e.to); } }, 'Añadir descentrado'),
      h('span', { class: 'lbl' }, '· grupo libre: sup.'), fromIn, h('span', { class: 'lbl' }, 'a'), toIn,
      h('button', { onclick: () => add('Grupo ' + fromIn.value + '–' + toIn.value, +fromIn.value, +toIn.value) }, 'Añadir grupo')));
    if (PT.length) {
      const t = h('table', { class: 'tbl' }, h('tr', null, ['Act.', 'Nombre', 'De', 'A', 'Δx [mm]', 'Δy [mm]', 'Δz [mm]', 'Tilt X [°]', 'Tilt Y [°]', 'Pivote Δz [mm]', ''].map(x => h('th', null, x))));
      PT.forEach((g, k) => {
        const n = (key, step) => num(g[key], v => { if (isFinite(v)) { g[key] = v; changed({}); } }, step);
        const R1 = sys.surfaces[g.from] ? sys.surfaces[g.from].r : Infinity;
        t.append(h('tr', null,
          h('td', null, h('input', { type: 'checkbox', checked: g.on !== false, onchange: e => { g.on = e.target.checked; changed({}); } })),
          h('td', null, h('input', { type: 'text', value: g.name || '', style: 'width:150px', onchange: e => { g.name = e.target.value; save(); } })),
          h('td', null, num(g.from, v => { g.from = Math.max(1, Math.min(L, v | 0)); if (g.to < g.from) g.to = g.from; changed({}); }, 1)),
          h('td', null, num(g.to, v => { g.to = Math.max(g.from, Math.min(L, v | 0)); changed({}); }, 1)),
          h('td', null, n('dx', 0.01)), h('td', null, n('dy', 0.01)), h('td', null, n('dz', 0.01)), h('td', null, n('tx', 0.005)), h('td', null, n('ty', 0.005)),
          h('td', null, h('div', { class: 'cellv' }, n('piv', 1), isFinite(R1) ? h('button', { class: 'small', title: 'Pivote en el centro de curvatura (R = ' + fmt(R1, 2) + ')', onclick: () => { g.piv = R1; changed({}); } }, 'CC') : null)),
          h('td', null, h('button', { class: 'small', onclick: () => { PT.splice(k, 1); changed({ now: true }); } }, '×'))));
      });
      P.append(h('div', { class: 'wrapx' }, t));
      P.append(h('div', { class: 'ctrl' }, h('button', { onclick: () => { PT.forEach(g => g.on = false); changed({ now: true }); } }, 'Desactivar todos'), h('button', { onclick: () => { PT.forEach(g => { g.dx = g.dy = g.dz = g.tx = g.ty = 0; }); changed({ now: true }); } }, 'Poner a cero')));
    } else P.append(h('div', { class: 'note' }, 'No hay descentrados definidos. Añade uno arriba (o desde el inspector del Banco óptico).'));

    // efecto
    P.append(h('h3', null, 'Efecto de los descentrados activos (frente al diseño sin descentrar)'));
    const eff = h('div'); P.append(eff);
    if (!ctx.nPert) eff.append(h('p', { class: 'hint' }, 'No hay descentrados activos con valores distintos de cero.'));
    else defer(eff, 'Evaluando…', () => {
      const nom = nominalOf(sys, true), o = { N: 15, opd: true };
      const A = evalDesign(nom, o), Af = evalDesign(nom, Object.assign({ refocus: true }, o)), B0 = evalDesign(sys, o), Bf = evalDesign(sys, Object.assign({ refocus: true }, o));
      if (!A.par || !B0.par) { eff.append(h('div', { class: 'note bad' }, 'El sistema paraxial falla.')); return; }
      const diff = diffEE80(nom), pl = A.par.plate, sh = chiefShift(B0, A);
      const st = h('div', { class: 'stats' });
      st.append(stat('Desplazamiento de la imagen (eje)', fmt(sh, 1) + ' <small>µm</small> · ' + fmt(sh * pl / 1000, 2) + ' <small>″</small>'));
      st.append(stat('Reenfoque necesario', fmt(Bf.dz, 3) + ' <small>mm</small>'));
      st.append(stat('ΔEFL', fmt(B0.par.efl - A.par.efl, 3) + ' <small>mm</small>'));
      st.append(stat('WFE eje (enfocado en eje)', fmt(Af.wfe, 1) + ' → ' + fmt(Bf.wfe, 1) + ' <small>nm</small>'));
      st.append(stat('EE80 geom. peor campo (reenfocado)', fmt(worstEE(Af, diff, pl), 2) + ' → ' + fmt(worstEE(Bf, diff, pl), 2) + ' <small>″</small>', worstEE(Bf, diff, pl) <= Math.max(budget(), 1.1 * worstEE(Af, diff, pl)) ? 'ok' : 'ko'));
      eff.append(st);
      const t = h('table', { class: 'tbl' }, h('tr', null, ['Campo [°]', 'RMS nominal [µm]', 'RMS descentrado [µm]', 'RMS + reenfoque [µm]', 'EE80 geom. nominal reenfocado [″]', 'EE80 geom. descentrado + reenfoque [″]'].map(x => h('th', null, x))));
      A.fields.forEach((y, k) => t.append(h('tr', null, h('td', null, fmt(y, 3)), h('td', null, fmt(A.sp[k] && A.sp[k].rms, 2)), h('td', null, fmt(B0.sp[k] && B0.sp[k].rms, 2)), h('td', null, fmt(Bf.sp[k] && Bf.sp[k].rms, 2)),
        h('td', null, fmt(eeG(Af.sp[k]) * pl / 1000, 3)), h('td', null, fmt(eeG(Bf.sp[k]) * pl / 1000, 3)))));
      eff.append(h('div', { class: 'wrapx' }, t));
      eff.append(h('p', { class: 'hint' }, 'El desplazamiento de la imagen es error de apuntado (se corrige con la montura/guiado); el aumento de EE80 tras reenfocar es la degradación real de la imagen (sobre todo coma por descentrado/inclinación).'));
    });

    // barrido
    P.append(h('h3', null, 'Barrido de sensibilidad'));
    const sw = ui.sweep = ui.sweep || { el: 1, p: 'dy', R: 0.5, n: 11, piv: 0, refocus: true };
    const elSel = h('select', { onchange: e => { sw.el = +e.target.value; } }, els.map((e, k) => h('option', { value: k, selected: sw.el === k }, e.name)));
    const pSel = h('select', { onchange: e => { sw.p = e.target.value; const d = PERT_P.find(x => x[0] === sw.p); sw.R = d[2]; rIn.value = sw.R; } }, PERT_P.map(([k, t]) => h('option', { value: k, selected: sw.p === k }, t)));
    const rIn = num(sw.R, v => sw.R = Math.abs(v)), pivIn = num(sw.piv, v => sw.piv = v || 0);
    P.append(h('div', { class: 'ctrl' }, h('label', null, 'Elemento', elSel), h('label', null, 'Parámetro', pSel), h('label', null, 'Rango ±', rIn),
      h('label', null, 'Pasos', num(sw.n, v => sw.n = Math.max(3, Math.min(41, Math.round(v))), 2)), h('label', null, 'Pivote Δz [mm]', pivIn),
      h('label', null, h('input', { type: 'checkbox', checked: sw.refocus, onchange: e => sw.refocus = e.target.checked }), 'Reenfocar'),
      h('button', { class: 'primary', disabled: !els.length, onclick: () => runSweep() }, 'Barrer')));
    P.append(h('p', { class: 'hint' }, 'El barrido parte del sistema actual sin el descentrado propio de ese elemento (los demás descentrados activos se mantienen).'));
    const out = h('div'); P.append(out);
    function runSweep() {
      out.innerHTML = '';
      const e = els[sw.el] || els[0]; if (!e) return;
      const base = cloneSys(sys); base.perturb = base.perturb.filter(g => !(g.from === e.from && g.to === e.to));
      const nom = evalDesign(base, { N: 13, refocus: sw.refocus });
      if (!nom.par) return;
      const diff = diffEE80(base), pl = nom.par.plate, xs = [], ee = [], sh = [], dzs = [], perF = base.fields.map(() => []);
      for (let k = 0; k < sw.n; k++) {
        const v = -sw.R + 2 * sw.R * k / (sw.n - 1), s = cloneSys(base);
        s.perturb.push({ on: true, from: e.from, to: e.to, dx: 0, dy: 0, dz: 0, tx: 0, ty: 0, piv: sw.piv, [sw.p]: v });
        const r = evalDesign(s, { N: 13, refocus: sw.refocus });
        xs.push(v); ee.push(worstEE(r, diff, pl)); sh.push(chiefShift(r, nom) * pl / 1000); dzs.push(r.dz);
        r.sp.forEach((sp, f) => perF[f].push(eeG(sp) * pl / 1000));
      }
      const B = budget(), W = Math.min(720, Math.max(300, P.clientWidth - 10));
      const c1 = h('canvas'), c2 = h('canvas');
      out.append(c1, legend([[SER[0], 'peor campo']].concat(base.fields.map((f, i) => [SER[(i + 1) % SER.length], 'campo ' + fmt(f.y, 3) + '°']))));
      lineChart(c1, { w: W, h: 280, series: [{ x: xs, y: ee, width: 2.6 }].concat(perF.map((y, i) => ({ x: xs, y, color: SER[(i + 1) % SER.length], dash: [4, 3], width: 1.2 }))), xlab: (PERT_P.find(x => x[0] === sw.p) || [])[1], ylab: 'EE80 geom. Ø [″]', ymin: 0, hlines: [{ y: B, label: 'presupuesto ' + fmt(B, 2) + '″', color: css('--good') }] });
      out.append(c2, legend([[SER[1], 'desplazamiento de imagen [″]'], [SER[2], 'reenfoque [mm]']]));
      lineChart(c2, { w: W, h: 220, series: [{ x: xs, y: sh, color: SER[1] }, { x: xs, y: dzs, color: SER[2] }], xlab: (PERT_P.find(x => x[0] === sw.p) || [])[1], ylab: '″ / mm' });
      // tolerancia para el presupuesto (por interpolación)
      const mid = Math.floor((sw.n - 1) / 2), rel = ee[mid] > B, thr = rel ? ee[mid] * 1.1 : B; let tolP = NaN, tolN = NaN;
      for (let k = mid; k < sw.n - 1; k++) if (ee[k] <= thr && ee[k + 1] > thr) { tolP = xs[k] + (thr - ee[k]) / (ee[k + 1] - ee[k]) * (xs[k + 1] - xs[k]); break; }
      for (let k = mid; k > 0; k--) if (ee[k] <= thr && ee[k - 1] > thr) { tolN = xs[k] + (thr - ee[k]) / (ee[k - 1] - ee[k]) * (xs[k - 1] - xs[k]); break; }
      const crit = rel ? `degradación ≤ 10 % sobre el nominal (EE80 ≤ ${fmt(thr, 2)}″; el nominal ya supera el presupuesto de ${fmt(B, 2)}″)` : `EE80 geométrico ≤ ${fmt(B, 2)}″ en todo el campo`;
      const msg = (isFinite(tolP) || isFinite(tolN)) ? `Para mantener ${crit}: ${isFinite(tolN) ? fmt(tolN, 4) : '< ' + fmt(-sw.R, 3)} … ${isFinite(tolP) ? '+' + fmt(tolP, 4) : '> ' + fmt(sw.R, 3)} (este parámetro solo, ${sw.refocus ? 'con' : 'sin'} reenfoque).`
        : `Dentro de ±${fmt(sw.R, 3)} se mantiene ${crit}: amplía el rango para encontrar el límite.`;
      out.append(h('div', { class: 'note' }, msg));
    }
  }

  // ---------------- pestaña Validación ----------------
  const ST = { ok: ['✓', 'ok', 'Cumple'], warn: ['!', 'wa', 'Revisar'], fail: ['✗', 'ko', 'No cumple'], info: ['i', '', 'Info'] };
  function pill(st) { const d = ST[st] || ST.info; return h('span', { class: 'pill ' + st, title: d[2] }, d[0] + ' ' + d[2]); }
  function tolFor(e) {
    const k = e.from + '-' + e.to, d = e.kind === 'lens' ? { dec: 0.05, tilt: 0.02, dz: 0.1 } : { dec: 0.1, tilt: 0.02, dz: 0.1 };
    return Object.assign(d, sys.tol.els[k] || {});
  }
  function sysHash() { const t = jsonOut(Object.assign({}, sys, { name: '' })); let h0 = 0; for (let i = 0; i < t.length; i++) h0 = (h0 * 31 + t.charCodeAt(i)) | 0; return h0; }

  function tabValid(P) {
    const R = sys.req;
    // requisitos
    const det = h('details', { class: 'req', open: ui.reqOpen || false, ontoggle: e => { ui.reqOpen = e.target.open; } }, h('summary', null, 'Requisitos y criterios (editar)'));
    const rq = h('div', { class: 'reqgrid' });
    const fld = (lab, key, step, unit, hint) => rq.append(h('label', null, lab, hint ? h('span', { class: 'hint' }, ' ' + hint) : null), h('div', { class: 'insrow' }, num(R[key], v => { if (isFinite(v)) { R[key] = v; changed({}); } }, step), h('span', { class: 'u' }, unit || '')));
    fld('EFL objetivo', 'efl', 1, 'mm', '(0 = objetivo del optimizador)'); fld('Tolerancia EFL', 'eflTol', 0.1, '%');
    fld('F/# equivalente objetivo', 'fnoEq', 0.1, '', '(0 = libre)'); fld('Tolerancia F/#', 'fnoTol', 0.5, '%');
    fld('Foco mínimo tras el vértice del primario', 'bfMin', 5, 'mm', '(enfocador + rueda + cámara)');
    fld('Seeing (FWHM)', 'seeing', 0.1, '″'); fld('Fracción del seeing para la óptica (EE80 Ø)', 'budget', 0.05, '');
    fld('Uniformidad máx. borde/centro', 'uniMax', 0.1, '×'); fld('Viñeteo máx. en el borde', 'vigMax', 1, '%');
    fld('Distorsión máx.', 'distMax', 0.1, '%'); fld('Strehl mín. (planetaria)', 'strehlMin', 0.05, '');
    fld('Radio del campo central (planetaria)', 'strehlR', 0.5, 'mm'); fld('Espesor mín. centro (vidrio)', 'ctMin', 0.5, 'mm'); fld('Espesor mín. borde (vidrio)', 'etMin', 0.5, 'mm');
    rq.append(h('label', null, 'Evaluar planetaria'), h('div', null, h('input', { type: 'checkbox', checked: !!R.planetary, onchange: e => { R.planetary = e.target.checked; changed({}); } })));
    det.append(rq); P.append(det);
    const body = h('div'); P.append(body);
    defer(body, 'Validando diseño…', () => runValidation(body));
  }

  function runValidation(P) {
    const R = sys.req, L = ctx.L, wlp = sys.wavelengths[sys.primary].wl;
    if (!par) { P.append(h('div', { class: 'note bad' }, 'El sistema paraxial falla: no se puede validar.')); return; }
    const pl = par.plate, umA = 1000 / pl, B = budget(), Bum = B * umA;
    const reqEfl = R.efl > 0 ? R.efl : (sys.merit.eflTarget > 0 ? sys.merit.eflTarget : par.efl);
    const reqF = R.fnoEq > 0 ? R.fnoEq : par.fnoEq;
    const diff = diffEE80(sys);
    const fieldsQ = sys.fields.map(f => f.y).sort((a, b) => Math.abs(a) - Math.abs(b));
    const maxF = Math.abs(fieldsQ[fieldsQ.length - 1]);
    const checks = [], add = (st, name, val, tgt, note) => checks.push({ st, name, val, tgt, note });

    // calidad de imagen en el plano configurado
    const frs = fieldsQ.map(y => O.fieldRays(ctx, sys, y, 17));
    const sEE = seeEE(), dA = diff / umA;
    const q = frs.map(fr => { const sp = O.spotAt(fr, ctx, 0); const ee = eeG(sp), eeA = ee / umA; return { y: fr.field, sp, ee, eeA, del: Math.sqrt(sEE * sEE + dA * dA + eeA * eeA), vig: fr.lostFrac, h: fr.chief ? (O.imgHit(ctx, fr.chief.P, fr.chief.D, 0) || [0, NaN])[1] : NaN }; });
    const worst = Math.max(...q.map(x => isFinite(x.eeA) ? x.eeA : Infinity)), uni = q[q.length - 1].del / q[0].del;
    // curvatura de campo
    const NF = 7, fc = [...Array(NF)].map((_, k) => maxF * k / (NF - 1)) ;
    const frc = fc.map(y => O.fieldRays(ctx, sys, y, 13));
    const fz = frc.map(fr => O.bestFocus([fr], ctx, null, 2));
    const hImg = frc.map(fr => fr.chief ? ((O.imgHit(ctx, fr.chief.P, fr.chief.D, 0) || [0, NaN])[1]) : NaN);
    const spN = frc.map(fr => O.spotAt(fr, ctx, 0)), spB = frc.map((fr, k) => O.spotAt(fr, ctx, fz[k]));
    const fRange = Math.max(...fz) - Math.min(...fz), DOF = Math.abs(par.fno) * Bum / 1000;
    let a2 = NaN; { let Sx = 0, Sy = 0, Sxx = 0, Sxy = 0, n = 0; hImg.forEach((hh, k) => { if (!isFinite(hh)) return; const x = hh * hh; Sx += x; Sy += fz[k]; Sxx += x * x; Sxy += x * fz[k]; n++; }); const den = n * Sxx - Sx * Sx; if (n > 2 && Math.abs(den) > 1e-12) a2 = (n * Sxy - Sx * Sy) / den; }
    const Rfield = isFinite(a2) && Math.abs(a2) > 1e-12 ? 1 / (2 * a2) : Infinity;
    const dzAll = O.bestFocus(frs, ctx, null, 2);
    // color axial y lateral
    const fr0 = frs[0], fzW = sys.wavelengths.map((w, wi) => O.bestFocus([fr0], ctx, wi, 2)), axSpread = Math.max(...fzW) - Math.min(...fzW);
    const frE = frs[frs.length - 1], cen = sys.wavelengths.map((w, wi) => O.spotAt(frE, ctx, 0, wi));
    let latSep = 0; cen.forEach(a => cen.forEach(b => { if (a && b) latSep = Math.max(latSep, Math.hypot(a.cx - b.cx, a.cy - b.cy)); }));
    // distorsión e iluminación relativa
    const th0 = Math.max(1e-5, maxF * 1e-3), ch0 = O.chief(ctx, th0, wlp), k0 = ch0.ok ? ch0.P[1] / Math.tan(th0 * Math.PI / 180) : NaN;
    const dist = fc.map((y, k) => k === 0 ? 0 : (hImg[k] / (k0 * Math.tan(y * Math.PI / 180)) - 1) * 100);
    const RI = frc.map(fr => (1 - fr.lostFrac) / Math.max(1e-9, 1 - frc[0].lostFrac));
    const vigEdge = (1 - RI[RI.length - 1]) * 100;
    // Strehl en el campo central
    let strehl = NaN, wfeC = [];
    if (R.planetary) {
      const thc = Math.atan(R.strehlR / Math.abs(par.efl)) * 180 / Math.PI;
      [0, Math.min(thc, maxF || thc)].forEach(t => { const om = O.opdMap(ctx, sys, t, wlp, 48, true); if (om) wfeC.push({ t, rms: om.rms, nm: om.rms * wlp * 1000, S: om.strehlM }); });
      strehl = Math.min(...wfeC.map(x => x.S));
    }
    // fabricabilidad
    const fab = [], S = sys.surfaces;
    const glass = i => !O.isMirror(S[i].mat) && O.glassIndex(S[i].mat, 0.55) > 1.0001;
    const sg = (i, hh) => O.sagS(ctx, i, hh * hh);
    for (let i = 1; i < L; i++) {
      const s = S[i], m = String(s.mat || '').trim();
      if (m && !O.isMirror(m) && !(O.glassIndex(m, wlp) > 0)) fab.push({ st: 'fail', what: `Sup. ${i}: material «${m}» desconocido`, val: '—', tgt: 'catálogo / nd/Vd' });
      if (isFinite(s.r) && s.sd > 0 && s.sd >= Math.abs(s.r)) fab.push({ st: 'fail', what: `Sup. ${i}: semi-Ø ≥ |R|`, val: fmt(s.sd, 2) + ' mm', tgt: '< ' + fmt(Math.abs(s.r), 2) });
      if (glass(i)) {
        const t = s.t, sgn = Math.sign(t) || 1, hh = Math.max(s.sd || 0, S[i + 1].sd || 0);
        fab.push({ st: Math.abs(t) >= R.ctMin ? 'ok' : 'fail', what: `Sup. ${i}–${i + 1} (${(s.cm || m).slice(0, 26)}): espesor en el centro`, val: fmt(Math.abs(t), 3) + ' mm', tgt: '≥ ' + R.ctMin });
        if (hh > 0) { const et = sgn * (t + sg(i + 1, hh) - sg(i, hh)); fab.push({ st: !isFinite(et) ? 'fail' : et >= R.etMin ? 'ok' : et > 0 ? 'warn' : 'fail', what: `Sup. ${i}–${i + 1}: espesor en el borde (h = ${fmt(hh, 1)})`, val: fmt(et, 3) + ' mm', tgt: '≥ ' + R.etMin }); }
        else fab.push({ st: 'warn', what: `Sup. ${i}–${i + 1}: sin semi-Ø definido`, val: '—', tgt: 'definir semi-Ø' });
      } else if (!O.isMirror(m) && i + 1 < L && (glass(i + 1) || (i > 1 && glass(i - 1))) && s.sd > 0 && S[i + 1].sd > 0) {
        const t = s.t, sgn = Math.sign(t) || 1, hh = Math.min(s.sd, S[i + 1].sd), gap = sgn * (t + sg(i + 1, hh) - sg(i, hh));
        if (isFinite(gap)) fab.push({ st: gap >= 0 ? 'ok' : 'fail', what: `Sup. ${i}–${i + 1}: separación de aire en el borde`, val: fmt(gap, 3) + ' mm', tgt: '≥ 0' });
      }
    }
    const fabSt = fab.some(x => x.st === 'fail') ? 'fail' : fab.some(x => x.st === 'warn') ? 'warn' : 'ok';
    const bf = ctx.z[L] - ctx.z[1];

    // ---- lista de comprobaciones ----
    const eflDev = Math.abs(par.efl - reqEfl) / Math.abs(reqEfl) * 100;
    add(eflDev <= R.eflTol ? 'ok' : 'fail', 'Focal efectiva', fmt(par.efl, 2) + ' mm', fmt(reqEfl, 1) + ' ± ' + R.eflTol + ' %');
    const fDev = Math.abs(par.fnoEq - reqF) / reqF * 100;
    add(fDev <= R.fnoTol ? 'ok' : 'warn', 'F/# equivalente', 'f/' + fmt(par.fnoEq, 3), 'f/' + fmt(reqF, 2) + ' ± ' + R.fnoTol + ' %');
    const nMir = S.slice(1, L).filter(x => O.isMirror(x.mat)).length;
    if (nMir >= 2 && bf > 0) add(bf >= R.bfMin ? 'ok' : 'fail', 'Foco tras el vértice del primario', fmt(bf, 1) + ' mm', '≥ ' + R.bfMin + ' mm');
    else add('info', 'Distancia de la última superficie al foco', fmt(Math.abs(S[L - 1].t), 1) + ' mm', '—', nMir === 0 ? 'Refractor: es el foco trasero del objetivo.' : 'Comprueba que deja sitio para el enfocador y la cámara.');
    add(worst <= B ? 'ok' : worst <= 1.5 * B ? 'warn' : 'fail', 'EE80 geométrico (Ø) en el peor campo', fmt(worst, 2) + '″', '≤ ' + fmt(B, 2) + '″ (' + fmt(R.budget * 100, 0) + ' % del seeing)', 'Aberraciones del diseño. Imagen entregada estimada en el borde (seeing + difracción + diseño): ' + fmt(q[q.length - 1].del, 2) + '″.');
    add('info', 'Límite de difracción de la pupila (EE80 Ø)', fmt(dA, 2) + '″', '—', (sys.aperture.type === 'segmented' ? 'Inherente a la apertura en anillo (lo fija sobre todo el Ø de cada segmento)' : 'Inherente a la apertura (λ/D y obstrucción)') + '; no se optimiza con el diseño óptico.');
    add(uni <= R.uniMax ? 'ok' : 'warn', 'Uniformidad de la imagen entregada (borde/centro)', fmt(uni, 2) + '×', '≤ ' + R.uniMax + '×', 'Tamaño de estrella en el borde frente al centro, con seeing ' + R.seeing + '″.');
    if (R.planetary) add(strehl >= R.strehlMin ? 'ok' : strehl >= 0.5 ? 'warn' : 'fail', 'Strehl en el campo central (±' + R.strehlR + ' mm)', fmt(strehl, 3), '≥ ' + R.strehlMin, 'Con los segmentos tal como están en la tabla de segmentos (co-faseo perfecto si están a cero).');
    add(fRange <= DOF ? 'ok' : fRange <= 2 * DOF ? 'warn' : 'fail', 'Curvatura de campo (rango de mejor foco)', fmt(fRange * 1000, 0) + ' µm', '≤ ' + fmt(DOF * 1000, 0) + ' µm (profundidad de foco)', isFinite(Rfield) ? 'Radio del campo ≈ ' + fmt(Rfield, 0) + ' mm.' : '');
    add(axSpread <= DOF ? 'ok' : axSpread <= 2 * DOF ? 'warn' : 'fail', 'Color axial (foco por λ, eje)', fmt(axSpread * 1000, 1) + ' µm', '≤ ' + fmt(DOF * 1000, 0) + ' µm');
    add(latSep / umA <= B / 2 ? 'ok' : latSep / umA <= B ? 'warn' : 'fail', 'Color lateral (borde, separación de centroides)', fmt(latSep, 2) + ' µm · ' + fmt(latSep / umA, 3) + '″', '≤ ' + fmt(B / 2, 2) + '″');
    const dEdge = dist[dist.length - 1];
    add(Math.abs(dEdge) <= R.distMax ? 'ok' : 'warn', 'Distorsión en el borde', fmt(dEdge, 3) + ' %', '≤ ' + R.distMax + ' %', 'Solo crítica para astrometría.');
    add(vigEdge <= R.vigMax ? 'ok' : vigEdge <= 2 * R.vigMax ? 'warn' : 'fail', 'Viñeteo en el borde del campo', fmt(vigEdge, 1) + ' %', '≤ ' + R.vigMax + ' %');
    add(fabSt, 'Fabricabilidad (espesores, materiales, radios)', fab.filter(x => x.st !== 'ok').length + ' incidencia(s)', 'sin incidencias');
    if (ctx.nPert) add('warn', 'Descentrados activos', ctx.nPert + ' grupo(s)', 'diseño nominal = 0', 'La validación se está haciendo con elementos descentrados (pestaña Descentrados).');
    if (sys.segments.some(e => e.p || e.tx || e.ty || e.dR)) add('info', 'Errores de segmento activos', 'sí', '—', 'Se incluyen en todos los resultados.');
    const mc = ui.valMC && ui.valMC.hash === sysHash() ? ui.valMC : null;
    if (mc) add(mc.pass >= 90 ? 'ok' : mc.pass >= 70 ? 'warn' : 'fail', 'Tolerancias (Monte Carlo)', fmt(mc.pass, 0) + ' % cumple', '≥ 90 % de unidades', mc.trials + ' pruebas');
    else add('info', 'Tolerancias (Monte Carlo)', 'sin ejecutar', '≥ 90 % de unidades', 'Ejecuta el análisis al final de esta página.');

    // ---- resumen ----
    const nOk = checks.filter(c => c.st === 'ok').length, nW = checks.filter(c => c.st === 'warn').length, nF = checks.filter(c => c.st === 'fail').length;
    P.append(h('div', { class: 'verdict ' + (nF ? 'fail' : nW ? 'warn' : 'ok') }, h('b', null, nF ? 'El diseño no cumple todos los requisitos' : nW ? 'El diseño cumple, con puntos a revisar' : 'El diseño cumple todos los requisitos evaluados'),
      h('span', null, ` · ${nOk} cumplen · ${nW} a revisar · ${nF} no cumplen`)));
    const tS = h('table', { class: 'tbl checks' }, h('tr', null, ['', 'Comprobación', 'Valor', 'Objetivo', 'Nota'].map(x => h('th', null, x))));
    checks.forEach(c => tS.append(h('tr', null, h('td', null, pill(c.st)), h('td', null, c.name), h('td', null, c.val), h('td', null, c.tgt), h('td', { class: 'hint' }, c.note || ''))));
    P.append(h('div', { class: 'wrapx' }, tS));

    const W = Math.min(680, Math.max(300, P.clientWidth - 10));
    // ---- calidad por campo ----
    P.append(h('h3', null, 'Calidad de imagen por campo (plano imagen actual)'));
    const tq = h('table', { class: 'tbl' }, h('tr', null, ['Campo [°]', 'Altura [mm]', 'Spot RMS [µm]', 'EE80 geom. Ø [µm]', 'EE80 geom. Ø [″]', 'Imagen entregada EE80 [″]', 'Viñeteo [%]'].map(x => h('th', null, x))));
    q.forEach(x => tq.append(h('tr', null, h('td', null, fmt(x.y, 3)), h('td', null, fmt(x.h, 2)), h('td', null, fmt(x.sp && x.sp.rms, 2)), h('td', null, fmt(x.ee, 2)), h('td', { class: x.eeA <= B ? 'ok' : 'ko' }, fmt(x.eeA, 3)), h('td', null, fmt(x.del, 2)), h('td', null, fmt(x.vig * 100, 1)))));
    P.append(h('div', { class: 'wrapx' }, tq));
    const cq = h('canvas'); P.append(cq);
    lineChart(cq, { w: W, h: 230, series: [{ x: frc.map((fr, k) => hImg[k]), y: spN.map(sp => eeG(sp) / umA) }, { x: frc.map((fr, k) => hImg[k]), y: spB.map(sp => eeG(sp) / umA), color: SER[1], dash: [5, 4] }], xlab: 'altura en la imagen [mm]', ylab: 'EE80 geom. Ø [″]', ymin: 0, hlines: [{ y: B, label: 'presupuesto', color: css('--good') }] });
    P.append(legend([[SER[0], 'plano imagen actual'], [SER[1], 'reenfocando cada campo (límite si el campo fuese plano)']]));
    P.append(h('p', { class: 'hint' }, `Criterio: EE80 geométrico (solo aberraciones del diseño) ≤ ${R.budget} × seeing ${R.seeing}″ = ${fmt(B, 2)}″ = ${fmt(Bum, 1)} µm. Imagen entregada ≈ √(seeing² + difracción² + diseño²) con EE80 de seeing gaussiano = 1,52 × FWHM = ${fmt(sEE, 2)}″ y difracción ${fmt(dA, 2)}″. 1″ = ${fmt(umA, 2)} µm.`));

    // ---- curvatura ----
    P.append(h('h3', null, 'Curvatura de campo'));
    const cc = h('canvas'); P.append(cc);
    const mid = (Math.max(...fz) + Math.min(...fz)) / 2;
    lineChart(cc, { w: W, h: 230, series: [{ x: hImg, y: fz.map(v => v * 1000) }], xlab: 'altura en la imagen [mm]', ylab: 'mejor foco [µm]', hlines: [{ y: (mid + DOF / 2) * 1000, label: '+½ prof. de foco', color: css('--good') }, { y: (mid - DOF / 2) * 1000, label: '−½', color: css('--good') }] });
    P.append(h('div', { class: 'stats' }, stat('Rango de mejor foco', fmt(fRange * 1000, 0) + ' <small>µm</small>', fRange <= DOF ? 'ok' : 'ko'), stat('Profundidad de foco (presupuesto)', fmt(DOF * 1000, 0) + ' <small>µm</small>'),
      stat('Radio de curvatura del campo', isFinite(Rfield) ? fmt(Rfield, 0) + ' <small>mm</small>' : 'plano'),
      stat('Spot borde: actual → reenfocado', fmt(spN[NF - 1] && spN[NF - 1].rms, 1) + ' → ' + fmt(spB[NF - 1] && spB[NF - 1].rms, 1) + ' <small>µm</small>')));
    const gain = spN[NF - 1] && spB[NF - 1] ? spB[NF - 1].rms / spN[NF - 1].rms : 1;
    P.append(h('div', { class: 'note ' + (fRange > DOF ? 'warn' : '') }, fRange > DOF
      ? `La superficie de mejor foco se curva más que la profundidad de foco. Reenfocando el borde, su spot baja un ${fmt((1 - gain) * 100, 0)} %: ${gain < 0.7 ? 'la curvatura de campo domina en el borde → considerad un aplanador de campo o un sensor curvo/menor.' : 'la curvatura contribuye, pero el borde está dominado por otras aberraciones (coma/astigmatismo).'}`
      : 'La curvatura de campo cabe dentro de la profundidad de foco del presupuesto.'));
    P.append(h('div', { class: 'ctrl' }, h('span', null, `Mejor plano imagen común para todos los campos: Δ = ${fmt(dzAll, 4)} mm respecto al actual.`),
      Math.abs(dzAll) > 1e-4 ? h('button', { class: 'small', onclick: () => { sys.surfaces[L - 1].t = +(sys.surfaces[L - 1].t + dzAll).toFixed(4); changed({ lde: true, now: true }); } }, 'Aplicar') : null));

    // ---- color ----
    P.append(h('h3', null, 'Color'));
    const tc = h('table', { class: 'tbl' }, h('tr', null, ['λ [µm]', 'Mejor foco en eje [µm]', 'Centroide en el borde ΔY [µm]', 'ΔY [″]'].map(x => h('th', null, x))));
    const cP = cen[sys.primary];
    sys.wavelengths.forEach((w, wi) => tc.append(h('tr', null, h('td', null, w.wl + (wi === sys.primary ? ' *' : '')), h('td', null, fmt(fzW[wi] * 1000, 1)), h('td', null, cen[wi] && cP ? fmt(cen[wi].cy - cP.cy, 2) : '—'), h('td', null, cen[wi] && cP ? fmt((cen[wi].cy - cP.cy) / umA, 3) : '—'))));
    P.append(h('div', { class: 'wrapx' }, tc));
    P.append(h('p', { class: 'hint' }, 'Con solo espejos ambos son nulos; aparecen al añadir el corrector. Mejor foco relativo al plano imagen actual.'));

    // ---- distorsión e iluminación ----
    P.append(h('h3', null, 'Distorsión e iluminación relativa'));
    const td = h('table', { class: 'tbl' }, h('tr', null, ['Campo [°]', 'Altura real [mm]', 'Altura paraxial [mm]', 'Distorsión [%]', 'Iluminación relativa [%]'].map(x => h('th', null, x))));
    fc.forEach((y, k) => td.append(h('tr', null, h('td', null, fmt(y, 4)), h('td', null, fmt(hImg[k], 4)), h('td', null, fmt(k0 * Math.tan(y * Math.PI / 180), 4)), h('td', null, fmt(dist[k], 4)), h('td', null, fmt(RI[k] * 100, 1)))));
    P.append(h('div', { class: 'wrapx' }, td));
    P.append(h('p', { class: 'hint' }, 'Iluminación relativa geométrica (fracción de rayos que llegan, sin cos⁴, despreciable a estos ángulos).'));

    // ---- Strehl ----
    if (R.planetary) {
      P.append(h('h3', null, 'Calidad difractiva en el campo central'));
      const ts = h('table', { class: 'tbl' }, h('tr', null, ['Campo [°]', 'WFE RMS [λ]', 'WFE RMS [nm]', 'Strehl (Maréchal)'].map(x => h('th', null, x))));
      wfeC.forEach(x => ts.append(h('tr', null, h('td', null, fmt(x.t, 4)), h('td', null, fmt(x.rms, 4)), h('td', null, fmt(x.nm, 1)), h('td', { class: x.S >= R.strehlMin ? 'ok' : 'ko' }, fmt(x.S, 3)))));
      P.append(h('div', { class: 'wrapx' }, ts));
    }

    // ---- fabricabilidad ----
    P.append(h('h3', null, 'Fabricabilidad'));
    if (!fab.length) P.append(h('p', { class: 'hint' }, 'Sin elementos refractivos: solo espejos (comprueba semi-Ø frente a radio en la tabla).'));
    else { const tf = h('table', { class: 'tbl' }, h('tr', null, ['', 'Comprobación', 'Valor', 'Mínimo'].map(x => h('th', null, x)))); fab.forEach(x => tf.append(h('tr', null, h('td', null, pill(x.st)), h('td', { style: 'text-align:left' }, x.what), h('td', null, x.val), h('td', null, x.tgt)))); P.append(h('div', { class: 'wrapx' }, tf)); }

    // ---- referencias ----
    const refBox = h('div');
    if (nMir >= 2) { P.append(h('h3', null, 'Comparación con referencias de dos espejos')); P.append(refBox); }
    if (nMir >= 2) try {
      const cg = O.cassegrain({ D: ui.cg.D, R1: ui.cg.R1, F: ui.cg.F, b: ui.cg.b, fieldDeg: ui.cg.field }), ap = sys.aperture;
      const hole = ap.type === 'segmented' ? ap.ringR - ap.dseg / 2 : (ap.obsc / 2 || cg.D2 / 2);
      const mk = (K1, K2) => { const s = nominalOf(sys); s.surfaces = O.cassegrainSurfaces(cg, ui.cg.D, hole, ui.cg.b, K1, K2); if (ap.type === 'segmented') s.surfaces[1].sd = O.epd(ap) / 2; const c = O.buildCtx(s), p = O.paraxial(c, s); if (p) s.surfaces[s.surfaces.length - 2].t = p.bfl; return s; };
      const rows = [['Diseño actual', sys], ['Ritchey–Chrétien', mk(cg.K1rc, cg.K2rc)], ['Cassegrain clásico', mk(-1, cg.K2cc)], ['Todo esférico sin corrector', mk(0, 0)]];
      const tr = h('table', { class: 'tbl' }, h('tr', null, ['Diseño', 'EFL [mm]'].concat(fieldsQ.map(y => 'EE80 geom. ' + fmt(y, 3) + '° [″]')).map(x => h('th', null, x))));
      rows.forEach(([n, s]) => { const r = evalDesign(s, { N: 15, fields: fieldsQ }); if (!r.par) return; tr.append(h('tr', null, h('td', { style: 'text-align:left' }, n), h('td', null, fmt(r.par.efl, 1)), r.sp.map(sp => { const v = eeG(sp) * r.par.plate / 1000; return h('td', { class: v <= B ? 'ok' : 'ko' }, fmt(v, 3)); }))); });
      refBox.append(h('div', { class: 'wrapx' }, tr), h('p', { class: 'hint' }, `Referencias calculadas con el solver de Herramientas (Ø${ui.cg.D}, R1 ${ui.cg.R1}, F ${ui.cg.F}, b ${ui.cg.b}) y vuestra apertura, en su foco paraxial. Si vuestro todo-esférico + corrector iguala o mejora al RC en todo el campo, el diseño es competitivo.`));
    } catch (e) { refBox.append(h('p', { class: 'hint' }, 'No se pudieron calcular las referencias: ' + e.message)); }

    // ---- tolerancias ----
    P.append(h('h3', null, 'Tolerancias y robustez'));
    tolSection(P, diff);
  }

  function tolSection(P, diff) {
    const T = sys.tol, els = O.elements(sys).filter(e => e.kind !== 'seg'), segOn = sys.aperture.type === 'segmented' && sys.surfaces.some(s => s.seg);
    P.append(h('p', { class: 'hint' }, 'Parte del diseño nominal (sin descentrados y con los segmentos a cero). Cada prueba aplica errores aleatorios uniformes dentro de ±tolerancia (descentrado e inclinación con dirección aleatoria), reenfoca (compensador = plano imagen) y mide el EE80 del peor campo, el WFE en eje y el desplazamiento de la imagen.'));
    const tt = h('table', { class: 'tbl' }, h('tr', null, ['Elemento', 'Sup.', '± descentrado [mm]', '± inclinación [°]', '± Δz [mm]'].map(x => h('th', null, x))));
    els.forEach(e => {
      const k = e.from + '-' + e.to, cur = tolFor(e), set = (key) => v => { if (isFinite(v) && v >= 0) { T.els[k] = Object.assign({}, cur, T.els[k] || {}, { [key]: v }); save(); } };
      tt.append(h('tr', null, h('td', { style: 'text-align:left' }, e.name), h('td', null, e.from + (e.to !== e.from ? '–' + e.to : '')), h('td', null, num(cur.dec, set('dec'), 0.01)), h('td', null, num(cur.tilt, set('tilt'), 0.005)), h('td', null, num(cur.dz, set('dz'), 0.01))));
    });
    P.append(h('div', { class: 'wrapx' }, tt));
    if (segOn) P.append(h('div', { class: 'ctrl' }, h('b', null, 'Segmentos:'),
      h('label', null, '± tip/tilt [µrad]', num(T.seg.t, v => { T.seg.t = Math.abs(v); save(); }, 0.1)),
      h('label', null, '± ΔROC [mm]', num(T.seg.dR, v => { T.seg.dR = Math.abs(v); save(); }, 0.01)),
      h('label', null, '± pistón [nm]', num(T.seg.p, v => { T.seg.p = Math.abs(v); save(); }, 5))));
    const bS = h('button', null, 'Sensibilidad (uno a uno)'), bM = h('button', { class: 'primary' }, 'Monte Carlo'), bStop = h('button', { disabled: true }, 'Parar');
    P.append(h('div', { class: 'ctrl' }, h('label', null, 'Pruebas', num(T.trials, v => { T.trials = Math.max(10, Math.min(2000, Math.round(v))); save(); }, 10)),
      h('label', null, h('input', { type: 'checkbox', checked: T.refocus, onchange: e => { T.refocus = e.target.checked; save(); } }), 'Reenfocar (compensador)'), bS, bM, bStop));
    const out = h('div'); P.append(out);
    const B = budget();
    const setup = () => {
      const nom = nominalOf(sys), o = { N: 13, refocus: T.refocus, opd: true, opdN: 32 };
      const r0 = evalDesign(nom, o); if (!r0.par) return null;
      return { nom, o, r0, pl: r0.par.plate, ee0: worstEE(r0, diff, r0.par.plate) };
    };
    const metric = (s, base) => { const r = evalDesign(s, base.o); return { ee: worstEE(r, diff, base.pl), wfe: r.wfe, sh: chiefShift(r, base.r0) * base.pl / 1000, dz: r.dz }; };
    let stop = false; bStop.onclick = () => { stop = true; };
    bS.onclick = () => {
      out.innerHTML = ''; const base = setup(); if (!base) return;
      const cases = [];
      els.forEach(e => { const t = tolFor(e); [['dy', t.dec, 'descentrado', 'mm'], ['tx', t.tilt, 'inclinación', '°'], ['dz', t.dz, 'Δz', 'mm']].forEach(([p, v, n, u]) => { if (v > 0) cases.push({ name: `${e.name}: ${n} +${v} ${u}`, f: s => s.perturb.push({ on: true, from: e.from, to: e.to, dx: 0, dy: 0, dz: 0, tx: 0, ty: 0, piv: 0, [p]: v }) }); }); });
      if (segOn) {
        if (T.seg.t > 0) cases.push({ name: `Segmento 1: tilt +${T.seg.t} µrad`, f: s => { s.segments[0].tx = T.seg.t; } });
        if (T.seg.dR > 0) cases.push({ name: `Segmento 1: ΔROC +${T.seg.dR} mm`, f: s => { s.segments[0].dR = T.seg.dR; } });
        if (T.seg.p > 0) cases.push({ name: `Segmento 1: pistón +${T.seg.p} nm`, f: s => { s.segments[0].p = T.seg.p; } });
      }
      const res = cases.map(c => { const s = cloneSys(base.nom); c.f(s); const m = metric(s, base); return Object.assign({ name: c.name }, m); });
      res.sort((a, b) => (b.ee - base.ee0) - (a.ee - base.ee0) || (b.wfe - a.wfe));
      const t = h('table', { class: 'tbl' }, h('tr', null, ['Perturbación', 'ΔEE80 geom. peor campo [″]', 'WFE eje [nm]', 'Imagen se desplaza [″]', 'Reenfoque [mm]'].map(x => h('th', null, x))));
      res.forEach(r => t.append(h('tr', null, h('td', { style: 'text-align:left' }, r.name), h('td', { class: r.ee - base.ee0 > 0.25 * B ? 'ko' : '' }, fmt(r.ee - base.ee0, 3)), h('td', null, fmt(r.wfe, 1)), h('td', null, fmt(r.sh, 2)), h('td', null, fmt(r.dz, 3)))));
      const rss = Math.sqrt(res.reduce((a, r) => a + Math.max(0, r.ee - base.ee0) ** 2, 0));
      out.append(h('div', { class: 'stats' }, stat('EE80 nominal (peor campo)', fmt(base.ee0, 3) + ' <small>″</small>'), stat('WFE nominal eje', fmt(base.r0.wfe, 1) + ' <small>nm</small>'), stat('Suma RSS de ΔEE80', fmt(rss, 3) + ' <small>″</small>', base.ee0 + rss <= B ? 'ok' : 'ko')), h('div', { class: 'wrapx' }, t),
        h('p', { class: 'hint' }, 'Ordenado de mayor a menor impacto en EE80: las primeras filas son las tolerancias que hay que apretar (o compensar con alineación).'));
    };
    bM.onclick = () => {
      out.innerHTML = ''; const base = setup(); if (!base) return;
      const N = T.trials, res = [], prog = h('div', { class: 'busy' }); out.append(prog);
      stop = false; bM.disabled = bS.disabled = true; bStop.disabled = false;
      const u = () => 2 * Math.random() - 1, rd = () => { const r = Math.sqrt(Math.random()), a = 2 * Math.PI * Math.random(); return [r * Math.cos(a), r * Math.sin(a)]; };
      const step = () => {
        const t0 = performance.now();
        while (res.length < N && !stop && performance.now() - t0 < 60) {
          const s = cloneSys(base.nom);
          els.forEach(e => { const t = tolFor(e), d = rd(), a = rd(); s.perturb.push({ on: true, from: e.from, to: e.to, dx: d[0] * t.dec, dy: d[1] * t.dec, dz: u() * t.dz, tx: a[0] * t.tilt, ty: a[1] * t.tilt, piv: 0 }); });
          if (segOn) s.segments = s.segments.map(() => ({ p: u() * T.seg.p, tx: u() * T.seg.t, ty: u() * T.seg.t, dR: u() * T.seg.dR }));
          res.push(metric(s, base));
        }
        prog.textContent = `prueba ${res.length}/${N}`;
        if (res.length < N && !stop) setTimeout(step, 0); else done();
      };
      const done = () => {
        prog.remove(); bM.disabled = bS.disabled = false; bStop.disabled = true;
        if (!res.length) return;
        const q = (arr, p) => { const a = arr.filter(isFinite).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN; };
        const ee = res.map(r => r.ee), wf = res.map(r => r.wfe), sh = res.map(r => r.sh), dz = res.map(r => r.dz);
        const pass = res.filter(r => r.ee <= B).length / res.length * 100, rel = res.filter(r => r.ee <= Math.max(B, 1.1 * base.ee0)).length / res.length * 100, lam = sys.wavelengths[sys.primary].wl * 1000;
        const Sm = w => Math.exp(-Math.pow(2 * Math.PI * w / lam, 2));
        ui.valMC = { hash: sysHash(), pass, trials: res.length };
        out.append(h('div', { class: 'stats' },
          stat('Cumplen el presupuesto EE80', fmt(pass, 0) + ' <small>%</small>', pass >= 90 ? 'ok' : 'ko'),
          stat('Degradación ≤ 10 % sobre el nominal', fmt(rel, 0) + ' <small>%</small>', rel >= 90 ? 'ok' : 'ko'),
          stat('EE80 peor campo: mediana / p90', fmt(q(ee, 0.5), 3) + ' / ' + fmt(q(ee, 0.9), 3) + ' <small>″</small>'),
          stat('WFE eje: mediana / p90', fmt(q(wf, 0.5), 0) + ' / ' + fmt(q(wf, 0.9), 0) + ' <small>nm</small>'),
          stat('Strehl eje (p90, peor)', fmt(Sm(q(wf, 0.9)), 3), Sm(q(wf, 0.9)) >= sys.req.strehlMin ? 'ok' : 'ko'),
          stat('Desplazamiento de imagen p90', fmt(q(sh, 0.9), 1) + ' <small>″</small>'),
          stat('Recorrido de enfoque necesario', fmt(Math.min(...dz), 2) + ' … ' + fmt(Math.max(...dz), 2) + ' <small>mm</small>')));
        // histograma EE80
        const cv = h('canvas'); out.append(cv);
        const Wc = Math.min(680, Math.max(300, P.clientWidth - 10)), Hc = 220, g = setupCanvas(cv, Wc, Hc);
        const lo = Math.min(...ee.filter(isFinite), B * 0.5), hi = Math.max(...ee.filter(isFinite), B * 1.2), nb = 24, bins = new Array(nb).fill(0);
        ee.forEach(v => { if (isFinite(v)) bins[Math.min(nb - 1, Math.floor((v - lo) / (hi - lo + 1e-12) * nb))]++; });
        const mx = Math.max(...bins), bw = (Wc - 60) / nb, X = v => 40 + (v - lo) / (hi - lo) * (Wc - 60);
        bins.forEach((b, i) => { const v = lo + (i + 0.5) / nb * (hi - lo); g.fillStyle = v <= B ? css('--good') : css('--bad'); g.globalAlpha = 0.8; g.fillRect(40 + i * bw, Hc - 30 - b / mx * (Hc - 50), bw - 2, b / mx * (Hc - 50)); });
        g.globalAlpha = 1; g.strokeStyle = css('--ink2'); g.setLineDash([4, 3]); g.beginPath(); g.moveTo(X(B), 10); g.lineTo(X(B), Hc - 30); g.stroke(); g.setLineDash([]);
        g.fillStyle = css('--ink3'); g.font = '11px IBM Plex Mono, monospace'; g.textAlign = 'left'; g.fillText(fmt(lo, 2) + '″', 40, Hc - 12); g.textAlign = 'right'; g.fillText(fmt(hi, 2) + '″', Wc - 20, Hc - 12); g.textAlign = 'center'; g.fillText('presupuesto ' + fmt(B, 2) + '″', X(B), Hc - 12);
        out.append(h('p', { class: 'hint' }, 'Histograma del EE80 en el peor campo tras reenfocar. Verde = cumple el presupuesto. El resultado alimenta la fila «Tolerancias» del resumen (vuelve a abrir la pestaña para verlo).'));
      };
      setTimeout(step, 10);
    };
  }

  // ---------------- asistente «Nuevo telescopio» ----------------
  function toast(msg) {
    const old = document.querySelector('.toast'); if (old) old.remove();
    const t = h('div', { class: 'toast', role: 'status' }, h('span', null, msg), h('button', { class: 'small', 'aria-label': 'Cerrar', onclick: () => t.remove() }, '×'));
    document.body.append(t); setTimeout(() => { if (t.isConnected) t.remove(); }, 15000);
  }
  function openWizard() {
    const D = window.SegDesigns;
    if (!D) { alert('Falta designs.js: sube también ese archivo.'); return; }
    let cur = ui.wizType || 'newton', busy = false, cancel = false;
    const vals = ui.wizVals = ui.wizVals || {};
    const back = h('div', { class: 'modal-back' }), box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Nuevo telescopio' });
    back.append(box); document.body.append(back);
    const close = () => { cancel = true; back.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape' && !busy) close(); };
    document.addEventListener('keydown', esc);
    back.addEventListener('mousedown', e => { if (e.target === back && !busy) close(); });

    function render() {
      box.innerHTML = '';
      const T = D.TYPES.find(t => t.key === cur), v = vals[cur] = vals[cur] || D.defaults(T);
      const nav = h('nav', { class: 'wiz-nav' });
      let g = null;
      D.TYPES.forEach(t => {
        if (t.group !== g) { g = t.group; nav.append(h('div', { class: 'wiz-group' }, g)); }
        nav.append(h('button', { class: t.key === cur ? 'on' : '', disabled: busy, onclick: () => { cur = ui.wizType = t.key; render(); } }, t.name));
      });
      const form = h('div', { class: 'wiz-form' });
      const derived = h('div', { class: 'hint wiz-derived' });
      const upd = () => {
        const F = v.F || v.D * v.N, fno = F / v.D, th = Math.atan((v.h || 0) / F) * 180 / Math.PI;
        derived.textContent = `Focal ${fmt(F, 1)} mm · f/${fmt(fno, 2)} · escala ${fmt(206264.8 / F, 2)}″/mm · campo ±${fmt(th, 3)}° (${fmt(2 * th * 60, 1)}′ de diagonal)`;
      };
      T.params.forEach(q => {
        if (q.when === 'seg' && !v.seg) return;
        if (q.when === 'manual' && v.auto !== 'manual') return;
        let inp;
        if (q.type === 'select') inp = h('select', { onchange: e => { v[q.k] = e.target.value; if (q.k === 'auto') render(); } }, q.options.map(([k, t]) => h('option', { value: k, selected: v[q.k] === k }, t)));
        else if (q.type === 'check') inp = h('input', { type: 'checkbox', checked: !!v[q.k], onchange: e => { v[q.k] = e.target.checked; render(); } });
        else inp = h('input', { type: 'number', value: v[q.k], step: q.step || 'any', min: q.min, oninput: e => { const x = parseFloat(e.target.value); if (isFinite(x)) { v[q.k] = x; upd(); } } });
        form.append(h('label', null, q.label), h('div', { class: 'insrow' }, inp, q.unit ? h('span', { class: 'u' }, q.unit) : null));
      });
      upd();
      const status = h('div', { class: 'wiz-status' });
      const bCreate = h('button', { class: 'primary', disabled: busy }, T.tuned ? 'Crear y afinar' : 'Crear');
      const bCancel = h('button', { onclick: () => { if (busy) cancel = true; else close(); } }, busy ? 'Detener' : 'Cancelar');
      bCreate.onclick = () => create(T, v, status, bCreate, bCancel);
      box.append(
        h('div', { class: 'modal-h' }, h('h2', null, 'Nuevo telescopio'), h('button', { class: 'small', 'aria-label': 'Cerrar', disabled: busy, onclick: close }, '×')),
        h('div', { class: 'wiz' }, nav, h('div', { class: 'wiz-main' },
          h('h3', null, T.name), h('p', { class: 'wiz-desc' }, T.desc), form, derived,
          T.tuned ? h('p', { class: 'hint' }, 'Este tipo se afina automáticamente tras crearlo (unos segundos). Puedes detenerlo en cualquier momento y quedarte con lo conseguido.') : null,
          h('p', { class: 'hint' }, 'El diseño actual se sustituye (se puede recuperar con Deshacer).'),
          status, h('div', { class: 'tools wiz-actions' }, bCancel, bCreate))));
    }
    function create(T, v, status, bCreate, bCancel) {
      let r;
      status.className = 'wiz-status busy'; status.textContent = 'Construyendo…';
      setTimeout(() => {
        try { r = D.build(T.key, v); }
        catch (e) { status.className = 'wiz-status ko'; status.textContent = e.message; return; }
        if (!r.tuner) return done();
        busy = true; cancel = false; bCreate.disabled = true; bCancel.textContent = 'Detener';
        box.querySelectorAll('.wiz-nav button, .modal-h button').forEach(b => b.disabled = true);
        const loop = () => {
          if (!back.isConnected) return;
          const t0 = performance.now(); let st;
          do { st = r.tuner.step(4); } while (!st.done && !cancel && performance.now() - t0 < 80);
          status.textContent = `Afinando… iteración ${st.iter} de ${st.max} · mérito ${fmt(st.f, 3)} µm`;
          if (st.done || cancel) done(); else setTimeout(loop, 0);
        };
        setTimeout(loop, 0);
      }, 20);
      function done() {
        status.textContent = 'Terminando (enfoque y diámetros)…';
        setTimeout(() => {
          let s;
          try { s = D.finalize(r); } catch (e) { busy = false; status.className = 'wiz-status ko'; status.textContent = 'Error: ' + e.message; return; }
          busy = false;
          sys = normalize(s); ui.refit = true; ui.sel = null; ui.tab = 'bench';
          renderSys(); renderTabs(); changed({ lde: true, sys: true, now: true });
          close();
          if (r.note) toast(r.note);
        }, 20);
      }
    }
    render();
  }

  // ---------------- acciones ----------------
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function slug() { return (sys.name || 'segoptic').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'segoptic'; }
  function initActions() {
    const ps = $('#preset'); O.PRESETS.forEach(([k, t]) => ps.append(h('option', { value: k }, t)));
    $('#btnNew').onclick = () => openWizard();
    const ca = $('#chkAsph'); if (ca) ca.onchange = e => { ui.showAsph = e.target.checked; renderLDE(); };
    $('#btnPreset').onclick = () => { if (!confirm('¿Sustituir el sistema actual por el ejemplo?')) return; sys = normalize(O.makePreset(ps.value)); ui.refit = true; ui.sel = null; changed({ lde: true, sys: true, now: true }); };
    $('#btnSave').onclick = () => download(slug() + '.json', jsonOut(sys), 'application/json');
    $('#btnExport').onclick = () => download(slug() + '.txt', prescriptionText());
    $('#btnOpen').onclick = () => $('#fileIn').click();
    $('#fileIn').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { try { sys = normalize(jsonIn(t)); ui.refit = true; ui.sel = null; changed({ lde: true, sys: true, now: true }); } catch (err) { alert('Archivo no válido: ' + err.message); } });
      e.target.value = '';
    };
    $('#sysName').addEventListener('blur', e => { sys.name = e.target.textContent.trim(); save(); });
    $('#sysName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
    $('#btnParax').onclick = () => { if (!par) return; sys.surfaces[sys.surfaces.length - 2].t = +par.bfl.toFixed(4); changed({ lde: true, now: true }); };
    $('#btnAutofocus').onclick = () => {
      const s = sys.surfaces[sys.surfaces.length - 2], t0 = s.t;
      const f = t => { s.t = t; const c = O.buildCtx(sys); let m = 0; const sp = O.spot(c, sys, 0, 15); m = sp ? sp.rms : 1e9; return m; };
      const span = Math.max(2, Math.abs(t0) * 0.05);
      const t = golden(f, t0 - span, t0 + span, 60);
      s.t = +t.toFixed(4); changed({ lde: true, now: true });
    };
    $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
    document.addEventListener('keydown', e => {
      const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (typing || ui.tab !== 'bench' || !bench || !bench.root.isConnected) return;
      if (e.key === 'Escape') { bench.setInsert(null); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && ui.sel != null) { e.preventDefault(); bench.deleteSel(); }
    });
    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderTab, 200); });
  }

  // ---------------- arranque ----------------
  sys = load() || normalize(O.makePreset('baseline'));
  rebuild(); initActions(); renderSys(); renderLDE(); renderQuick(); renderTabs(); renderTab(); pushHist();
})();
