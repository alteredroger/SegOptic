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
    tab: 'summary', field: 0, wl: null, spotN: 21, spotCommon: false, opdN: 64, removeTilt: true,
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
  let timer = null;
  function changed(opts) {
    opts = opts || {};
    rebuild(); save();
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
  }
  function renderLDE() {
    const T = $('#lde'); T.innerHTML = '';
    const L = sys.surfaces.length - 1;
    T.append(h('tr', null, ['#', 'Comentario', 'Radio', 'Espesor', 'Material', 'Semi-Ø', 'Agujero r', 'Cónica', 'Seg', ''].map(t => h('th', null, t))));
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
        h('td', null, (!isObj && !isImg) ? h('input', { type: 'checkbox', checked: !!s.seg, title: 'Superficie segmentada', onchange: e => { sys.surfaces.forEach(x => delete x.seg); if (e.target.checked) s.seg = true; changed({ lde: true }); } }) : ''),
        h('td', null, isImg ? '' : h('button', { class: 'small', title: 'Insertar superficie después', onclick: () => { shiftVary(i + 1, 1); sys.surfaces.splice(i + 1, 0, { cm: '', r: Infinity, t: 10, mat: '', sd: 0, hole: 0, k: 0 }); changed({ lde: true }); } }, '+'),
          ' ', (!isObj && !isImg) ? h('button', { class: 'small', title: 'Eliminar', onclick: () => { shiftVary(i, -1); sys.surfaces.splice(i, 1); changed({ lde: true }); } }, '−') : '')
      );
      T.append(tr);
    });
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
    ['summary', 'Resumen'], ['layout', 'Layout 2D'], ['spot', 'Spot'], ['opd', 'Frente de onda'], ['psf', 'PSF / MTF'],
    ['segments', 'Segmentos y co-faseo'], ['optim', 'Optimización'], ['tools', 'Herramientas']
  ];
  function renderTabs() {
    const n = $('#tabs'); n.innerHTML = '';
    TABS.forEach(([k, t]) => n.append(h('button', { class: ui.tab === k ? 'on' : '', role: 'tab', onclick: () => { ui.tab = k; renderTabs(); renderTab(); } }, t)));
  }
  function renderTab() {
    const P = $('#panel'); P.innerHTML = '';
    try { ({ summary: tabSummary, layout: tabLayout, spot: tabSpot, opd: tabOPD, psf: tabPSF, segments: tabSegments, optim: tabOptim, tools: tabTools })[ui.tab](P); }
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
        const zz = ctx.z[i] + (O.sag(ctx.c[i], ctx.k[i], y * y) || 0);
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
  function getV(s, v) { const x = s.surfaces[v.i][v.p]; return v.p === 'r' ? O.curv(x) : x; }
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
    vars.forEach(v => t.append(h('tr', null, h('td', null, v.i), h('td', null, ({ r: 'radio', t: 'espesor', k: 'cónica' })[v.p]), h('td', null, fmt(sys.surfaces[v.i][v.p], 6)))));
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
      const steps = vars.map((v, k) => v.p === 'r' ? (Math.abs(x0[k]) * 0.05 || 1e-4) : v.p === 't' ? Math.max(1, Math.abs(x0[k]) * 0.03) : 0.1);
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

  // ---------------- acciones ----------------
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function slug() { return (sys.name || 'segoptic').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'segoptic'; }
  function initActions() {
    const ps = $('#preset'); O.PRESETS.forEach(([k, t]) => ps.append(h('option', { value: k }, t)));
    $('#btnPreset').onclick = () => { if (!confirm('¿Sustituir el sistema actual por el ejemplo?')) return; sys = normalize(O.makePreset(ps.value)); changed({ lde: true, sys: true, now: true }); };
    $('#btnSave').onclick = () => download(slug() + '.json', jsonOut(sys), 'application/json');
    $('#btnExport').onclick = () => download(slug() + '.txt', prescriptionText());
    $('#btnOpen').onclick = () => $('#fileIn').click();
    $('#fileIn').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { try { sys = normalize(jsonIn(t)); changed({ lde: true, sys: true, now: true }); } catch (err) { alert('Archivo no válido: ' + err.message); } });
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
    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderTab, 200); });
  }

  // ---------------- arranque ----------------
  sys = load() || normalize(O.makePreset('baseline'));
  rebuild(); initActions(); renderSys(); renderLDE(); renderQuick(); renderTabs(); renderTab();
})();
