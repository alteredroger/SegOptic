/* SegOptic — generadores de telescopios
 * Construye prescripciones de partida para reflectores, catadióptricos y refractores,
 * y las afina numéricamente (Nelder–Mead) cuando el tipo lo requiere.
 * Convenciones: las de optics.js (mm, µm, radio con signo, espesor negativo tras espejo).
 */
(function (root) {
  'use strict';
  const O = (typeof module !== 'undefined' && module.exports) ? require('./optics.js') : root.SegOptic;

  const WL = {
    rgb: [{ wl: 0.45, w: 1 }, { wl: 0.55, w: 1 }, { wl: 0.65, w: 1 }],
    visual: [{ wl: 0.4861, w: 1 }, { wl: 0.5876, w: 1 }, { wl: 0.6563, w: 1 }],
    wide: [{ wl: 0.42, w: 1 }, { wl: 0.486, w: 1 }, { wl: 0.5876, w: 1 }, { wl: 0.6563, w: 1 }, { wl: 0.75, w: 1 }]
  };
  const r4 = v => Math.round(v * 1e4) / 1e4;
  const deg = (h, F) => Math.atan(h / F) * 180 / Math.PI;
  const surf = (o) => Object.assign({ cm: '', r: Infinity, t: 0, mat: '', sd: 0, hole: 0, k: 0 }, o);
  const OBJ = () => surf({ cm: 'Objeto', t: Infinity });
  const IMA = (r) => surf({ cm: 'Imagen', r: r == null ? Infinity : r });
  const n_d = g => O.glassIndex(g, 0.5876);
  const abbe = g => (n_d(g) - 1) / (O.glassIndex(g, 0.4861) - O.glassIndex(g, 0.6563));
  const pgF = g => (O.glassIndex(g, 0.4358) - O.glassIndex(g, 0.4861)) / (O.glassIndex(g, 0.4861) - O.glassIndex(g, 0.6563));
  const sagAbs = (R, h) => (!isFinite(R) || R === 0) ? 0 : Math.abs(R) - Math.sqrt(Math.max(0, R * R - h * h));

  function base(name, ap, wls, F, h, surfaces, extra) {
    const th = deg(h, F);
    return Object.assign({
      name, aperture: ap, wavelengths: wls.map(w => Object.assign({}, w)), primary: Math.floor(wls.length / 2),
      fields: [{ y: 0, w: 1 }, { y: r4(0.7 * th), w: 1 }, { y: r4(th), w: 1 }],
      surfaces, segments: [], vary: {}, perturb: [],
      merit: { eflTarget: F, eflW: 10, grid: 13 }
    }, extra || {});
  }
  function ring(D, n, gap) {
    const s = Math.sin(Math.PI / n), ds = (D - gap / s) / (1 + 1 / s), ringR = (ds + gap) / (2 * s);
    return { ds, ringR };
  }
  function aperture(p, obsc) {
    if (p.seg) {
      const r = ring(p.D, p.nseg, p.gap);
      return { type: 'segmented', D: p.D, obsc: r4(obsc), nseg: p.nseg, dseg: r4(r.ds), ringR: r4(r.ringR), rot: 90 };
    }
    return { type: 'circular', D: p.D, obsc: r4(obsc), nseg: 6, dseg: 150, ringR: 165, rot: 90 };
  }
  function clone(s) { return JSON.parse(JSON.stringify(s, (k, v) => v === Infinity ? 'Inf' : v === -Infinity ? '-Inf' : v), (k, v) => v === 'Inf' ? Infinity : v === '-Inf' ? -Infinity : v); }

  // ---------- utilidades de trazado ----------
  function footprints(s, N) {
    const c = O.buildCtx(s), L = c.L, mx = new Array(L + 1).fill(0), wl = s.wavelengths[s.primary].wl;
    s.fields.forEach(f => {
      const D = O.fieldDir(f.y);
      O.pupilSamples(c, N || 15).forEach(q => {
        const r = O.traceRay(c, O.startPt(q.x, q.y, D), D, wl, { seg: q.seg, record: true, noApert: true });
        if (!r.pts) return;
        r.pts.forEach((p, i) => { if (i > 0 && i <= L) mx[i] = Math.max(mx[i], Math.hypot(p[0], p[1])); });
      });
    });
    return mx;
  }
  function setSemiDiameters(s, opts) {
    opts = opts || {};
    const fp = footprints(s), L = s.surfaces.length - 1;
    for (let i = 1; i < L; i++) {
      const S = s.surfaces[i];
      if (opts.keep && opts.keep.includes(i)) continue;
      if (fp[i] > 0) S.sd = Math.ceil(fp[i] * 1.03 * 10 + 1) / 10;
    }
    return fp;
  }
  function focusImage(s) {
    const c = O.buildCtx(s), frs = s.fields.map(f => O.fieldRays(c, s, f.y, 13));
    const dz = O.bestFocus(frs, c, null, 2);
    s.surfaces[s.surfaces.length - 2].t = r4(s.surfaces[s.surfaces.length - 2].t + dz);
    return dz;
  }
  function paraxialFocus(s) {
    const c = O.buildCtx(s), p = O.paraxial(c, s);
    if (p && isFinite(p.bfl)) s.surfaces[s.surfaces.length - 2].t = r4(p.bfl);
    return p;
  }
  // mérito: √(Σ w RMS² / Σ w + wE (EFL − F)²) con el mejor plano imagen; rayos perdidos penalizan
  function merit(s, cfg) {
    let c; try { c = O.buildCtx(s); } catch (e) { return 1e9; }
    const p = O.paraxial(c, s); if (!p || !isFinite(p.efl)) return 1e9;
    const frs = s.fields.map(f => O.fieldRays(c, s, f.y, cfg.N || 9));
    let lost = 0; for (const fr of frs) { if (fr.rays.length < 4) return 1e9; lost += fr.lostFrac; }
    const dz = O.bestFocus(frs, c, null, cfg.R || 3);
    let sum = 0, ws = 0;
    frs.forEach((fr, i) => { const sp = O.spotAt(fr, c, dz, null, true); const w = (cfg.fw && cfg.fw[i] != null) ? cfg.fw[i] : 1; sum += w * (sp ? sp.rms * sp.rms : 1e12); ws += w; });
    let m = sum / ws;
    if (cfg.F) m += (cfg.eflW == null ? 10 : cfg.eflW) * Math.pow(p.efl - cfg.F, 2);
    if (cfg.bf) { const bf = s.surfaces[cfg.bf.i].t + dz; if (bf < cfg.bf.min) m += 100 * Math.pow(cfg.bf.min - bf, 2); }
    return Math.sqrt(m) + 1e4 * lost;
  }
  // afinador paso a paso (para la interfaz) o de una vez (Node)
  function Tuner(s, vars, cfg) {
    this.s = s; this.vars = vars; this.cfg = cfg; this.max = cfg.iters || 300;
    const x0 = vars.map(v => v.get(s)), st = vars.map((v, i) => v.step(x0[i]));
    const f = x => { vars.forEach((v, i) => v.set(s, x[i])); return merit(s, cfg); };
    this.f0 = f(x0); this.nm = new O.NelderMead(f, x0, st); this.best = { x: x0, f: this.f0 }; this.done = false;
    this.nm.vals.forEach((v, i) => { if (v < this.best.f) this.best = { x: this.nm.simplex[i].slice(), f: v }; });
  }
  Tuner.prototype.step = function (n) {
    for (let k = 0; k < n && !this.done; k++) {
      const r = this.nm.step(); this.it = (this.it || 0) + 1;
      if (r.f < this.best.f) this.best = { x: r.x.slice(), f: r.f };
      if (this.it >= this.max) { this.done = true; break; }
      if (r.spread < 1e-6 * Math.max(1e-3, r.f)) {
        // reinicio desde el mejor punto con un símplex nuevo (evita estancamientos de Nelder–Mead)
        this.restarts = (this.restarts || 0) + 1;
        if (this.restarts > 4) { this.done = true; break; }
        const x = this.best.x.slice(), st = this.vars.map((v, i) => v.step(x[i]) * Math.pow(0.5, this.restarts));
        this.nm = new O.NelderMead(this.nm.f, x, st);
      }
    }
    return { iter: this.it || 0, f: this.best.f, done: this.done, max: this.max };
  };
  Tuner.prototype.finish = function () {
    this.vars.forEach((v, i) => v.set(this.s, this.best.x[i]));
    return this.s;
  };
  // variables habituales
  const vCurv = (i, rel) => ({ key: i + ':r', get: s => O.curv(s.surfaces[i].r), set: (s, x) => { s.surfaces[i].r = Math.abs(x) < 1e-12 ? Infinity : 1 / x; }, step: x => Math.abs(x) * (rel || 0.05) || 1e-4 });
  const vConic = (i) => ({ key: i + ':k', get: s => s.surfaces[i].k, set: (s, x) => { s.surfaces[i].k = x; }, step: () => 0.1 });
  const vA = (i, key, st) => ({ key: i + ':' + key, get: s => s.surfaces[i][key] || 0, set: (s, x) => { s.surfaces[i][key] = x; }, step: x => Math.abs(x) * 0.2 || st });

  // ---------- diseño en lámina delgada ----------
  function lensThick(R1, R2, D, positive) {
    const h = D / 2, e = Math.max(1.5, D / 60);
    if (positive) return r4(e + (R1 > 0 ? sagAbs(R1, h) : 0) + (R2 < 0 ? sagAbs(R2, h) : 0) - (R1 < 0 ? sagAbs(R1, h) : 0) - (R2 > 0 ? sagAbs(R2, h) : 0) + 0.5);
    return r4(Math.max(e, D / 40));
  }
  // doblete cementado (corona delante) de focal f; devuelve 3 superficies (la última con t = 0)
  function achromat(f, D, crown, flint, label) {
    const V1 = abbe(crown), V2 = abbe(flint), n1 = n_d(crown), n2 = n_d(flint);
    const phi = 1 / f, p1 = phi * V1 / (V1 - V2), p2 = -phi * V2 / (V1 - V2);
    const c1 = p1 / (2 * (n1 - 1)), c2 = -c1, c3 = c2 - p2 / (n2 - 1);
    const R1 = 1 / c1, R2 = 1 / c2, R3 = Math.abs(c3) < 1e-12 ? Infinity : 1 / c3;
    const t1 = lensThick(R1, R2, D, true), t2 = r4(Math.max(1.5, D / 35) + Math.max(0, (R3 > 0 ? sagAbs(R3, D / 2) : 0) - sagAbs(R2, D / 2)));
    return [surf({ cm: (label || 'Doblete') + ' · corona', r: r4(R1), t: t1, mat: crown }), surf({ cm: (label || 'Doblete') + ' · flint', r: r4(R2), t: t2, mat: flint }), surf({ cm: (label || 'Doblete') + ' · salida', r: r4(R3), t: 0, mat: '' })];
  }
  // triplete apocromático: elige 3 vidrios del catálogo que resuelven φ, color primario y secundario con potencias mínimas
  const APO_GLASSES = ['CAF2', 'N-FK51A', 'N-BK7', 'N-BAK4', 'N-SK16', 'N-F2', 'N-SF2', 'N-SF5', 'N-SF11'];
  function apoPowers(phi, gl) {
    const V = gl.map(abbe), P = gl.map(pgF);
    const M = [[1, 1, 1], [1 / V[0], 1 / V[1], 1 / V[2]], [P[0] / V[0], P[1] / V[1], P[2] / V[2]]], b = [phi, 0, 0];
    const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const d = det(M); if (Math.abs(d) < 1e-14) return null;
    return [0, 1, 2].map(c => det(M.map((row, i) => row.map((v, j) => j === c ? b[i] : v))) / d);
  }
  function bestApo(phi) {
    let best = null;
    for (let a = 0; a < APO_GLASSES.length; a++) for (let b = 0; b < APO_GLASSES.length; b++) for (let c = 0; c < APO_GLASSES.length; c++) {
      if (a === b || b === c || a === c) continue;
      const gl = [APO_GLASSES[a], APO_GLASSES[b], APO_GLASSES[c]], p = apoPowers(phi, gl);
      if (!p || p[0] <= 0) continue; // primer elemento positivo
      const cost = p.reduce((s, x) => s + Math.abs(x), 0) / phi;
      if (!best || cost < best.cost) best = { gl, p, cost };
    }
    return best;
  }

  // ---------- generadores ----------
  const GEN = {};

  GEN.prime = p => {
    const F = p.D * p.N, obsc = p.obs;
    const s = base(`Foco primario parabólico ${p.D} mm f/${p.N}`, aperture(p, obsc), WL[p.wl], F, p.h, [
      OBJ(), surf({ cm: 'Primario parabólico (STO)', r: r4(-2 * F), t: r4(-F), mat: 'MIRROR', sd: p.D / 2, k: -1, seg: !!p.seg }), IMA()]);
    paraxialFocus(s); return { sys: s };
  };

  GEN.newton = p => {
    const F = p.D * p.N, L = p.L, h = p.h;
    const m = L * p.D / F + 2 * h * (F - L) / F; // eje menor de la diagonal (campo totalmente iluminado de Ø 2h)
    const s = base(`Newtoniano ${p.D} mm f/${p.N}`, aperture(p, Math.ceil(m)), WL[p.wl], F, h, [
      OBJ(),
      surf({ cm: 'Primario parabólico (STO)', r: r4(-2 * F), t: r4(-(F - L)), mat: 'MIRROR', sd: p.D / 2, k: -1, seg: !!p.seg }),
      surf({ cm: 'Diagonal plana a 45°', t: r4(-L), mat: '', sd: r4(m / 2), fold: true }),
      IMA()]);
    paraxialFocus(s);
    return { sys: s, note: `Eje menor de la diagonal: ${m.toFixed(1)} mm (obstrucción ${(100 * m / p.D).toFixed(0)} %). El trazado trata la diagonal desplegada (un espejo plano no cambia las aberraciones y su sombra está en la obstrucción); en el Banco puedes ver el foco plegado al lateral o desplegado.` };
  };

  function cassFamily(p, kind) {
    const F = p.F, R1 = -2 * p.Np * p.D, th = deg(p.h, F);
    const cg = O.cassegrain({ D: p.D, R1, F, b: p.b, fieldDeg: th });
    if (!(cg.d > 0) || !(cg.d < cg.f1)) throw new Error('Geometría imposible: revisa F/# del primario, focal y foco trasero.');
    let K1 = 0, K2 = 0, name = '';
    if (kind === 'cc') { K1 = -1; K2 = cg.K2cc; name = 'Cassegrain clásico'; }
    else if (kind === 'rc') { K1 = cg.K1rc; K2 = cg.K2rc; name = 'Ritchey–Chrétien'; }
    else if (kind === 'dk') { name = 'Dall–Kirkham'; }
    else if (kind === 'pc') { name = 'Pressmann–Camichel'; }
    else name = 'Cassegrain todo esférico';
    const s = base(`${name} ${p.D} mm f/${(F / p.D).toFixed(1)}`, aperture(p, 0), WL[p.wl], F, p.h, O.cassegrainSurfaces(cg, p.D, 0, p.b, K1, K2));
    s.surfaces[1].seg = !!p.seg; s.surfaces[1].cm = 'Primario (STO)'; s.surfaces[2].cm = 'Secundario';
    s.surfaces[3].sd = 0;
    if (kind === 'dk' || kind === 'pc') solveConic(s, kind === 'dk' ? 1 : 2, kind === 'dk' ? [-1.2, 0] : [-30, 30]);
    finishTwoMirror(s, p, cg.D2);
    return { sys: s, note: `Separación ${cg.d.toFixed(1)} mm · secundario Ø ${cg.D2.toFixed(1)} mm · amplificación ${cg.M.toFixed(2)}×.` };
  }
  // ajusta la cónica de una superficie para anular la esférica en eje
  function solveConic(s, i, range) {
    const one = clone(s); one.fields = [{ y: 0, w: 1 }];
    const f = k => { one.surfaces[i].k = k; const c = O.buildCtx(one), fr = [O.fieldRays(c, one, 0, 15)]; if (fr[0].rays.length < 4) return 1e9; const dz = O.bestFocus(fr, c, null, 3); const sp = O.spotAt(fr[0], c, dz); return sp ? sp.rms : 1e9; };
    const g = (Math.sqrt(5) - 1) / 2; let a = range[0], b = range[1], c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
    for (let it = 0; it < 80; it++) { if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); } }
    s.surfaces[i].k = r4((a + b) / 2) === 0 ? 0 : +((a + b) / 2).toPrecision(8);
  }
  // agujero central, obstrucción y semi-diámetros de un sistema de dos espejos con salida por el primario
  function finishTwoMirror(s, p, D2) {
    const L = s.surfaces.length - 1, iPlane = L - 1;
    s.surfaces[1].hole = 0; s.surfaces[iPlane].sd = 0;
    paraxialFocus(s);
    const fp = footprints(s);
    const hole = Math.ceil(fp[iPlane] * 1.05 * 10) / 10;
    const ap = s.aperture;
    if (ap.type === 'segmented') {
      const inner = ap.ringR - ap.dseg / 2;
      s.surfaces[1].hole = r4(Math.min(hole, inner)); s.surfaces[iPlane].sd = r4(Math.max(hole, 0.1));
      ap.obsc = r4(Math.max(Math.ceil(D2), 0));
    } else {
      s.surfaces[1].hole = hole; s.surfaces[iPlane].sd = hole;
      ap.obsc = r4(Math.max(Math.ceil(D2 + 2), 2 * hole));
    }
    s.surfaces[2].sd = Math.ceil(D2 / 2 + 1);
    focusImage(s);
  }

  GEN.cass = p => cassFamily(p, p.kind);

  GEN.greg = p => {
    const F = p.F, f1 = p.Np * p.D, m = F / f1, th = deg(p.h, F);
    if (m <= 1) throw new Error('La focal debe ser mayor que la del primario (amplificación > 1).');
    const d = (m * f1 + p.b) / (m - 1), sObj = d - f1, sImg = d + p.b, f2 = sObj * sImg / (sObj + sImg);
    const D2 = p.D * (d - f1) / f1 + 2 * d * Math.tan(th * Math.PI / 180);
    const s = base(`Gregoriano ${p.D} mm f/${(F / p.D).toFixed(1)}`, aperture(p, 0), WL[p.wl], F, p.h, [
      OBJ(),
      surf({ cm: 'Primario parabólico (STO)', r: r4(-2 * f1), t: r4(-d), mat: 'MIRROR', sd: p.D / 2, k: -1, seg: !!p.seg }),
      surf({ cm: 'Secundario cóncavo elíptico', r: r4(2 * f2), t: r4(d), mat: 'MIRROR', sd: Math.ceil(D2 / 2 + 1), k: -0.5 }),
      surf({ cm: 'Plano del primario (paso por el agujero)', t: r4(p.b) }),
      IMA()]);
    solveConic(s, 2, [-1, 0]);
    finishTwoMirror(s, p, D2);
    return { sys: s, note: `Separación ${d.toFixed(1)} mm (más allá del foco del primario) · secundario Ø ${D2.toFixed(1)} mm · imagen derecha.` };
  };

  GEN.schmidt = p => {
    const F = p.D * p.N, R = 2 * F, n = n_d(p.glass), tp = r4(Math.max(3, p.D / 40)), th = deg(p.h, F), r0 = p.D / 2;
    const A4 = -1 / (4 * (n - 1) * Math.pow(R, 3)), c0 = 3 * r0 * r0 / (4 * (n - 1) * Math.pow(R, 3));
    const sdM = Math.ceil(r0 + 2 * F * Math.tan(th * Math.PI / 180) * 1.05 + 1);
    const s = base(`Cámara Schmidt ${p.D} mm f/${p.N}`, aperture({ D: p.D }, Math.ceil(2 * p.h * 1.15 + 10)), WL[p.wl], F, p.h, [
      OBJ(),
      surf({ cm: 'Placa Schmidt (STO, asférica)', r: c0 ? r4(1 / c0) : Infinity, t: tp, mat: p.glass, sd: r0, a4: A4 }),
      surf({ cm: 'Placa Schmidt · cara plana', t: r4(R - tp), sd: r0 }),
      surf({ cm: 'Espejo esférico', r: r4(-R), t: r4(-F), mat: 'MIRROR', sd: sdM }),
      IMA(r4(-F))]);
    s.surfaces[4].cm = 'Imagen (superficie focal curva, R = −f)';
    focusImage(s);
    const vars = [vA(1, 'a4', 1e-10), vCurv(1, 0.1), vA(1, 'a6', 1e-16)];
    return { sys: s, tune: { vars, cfg: { F, eflW: 1, iters: 300, fw: [2, 1, 1] } }, note: 'La placa (A4, A6 y curvatura de la zona neutra) se afina automáticamente. El sensor es curvo (R = −f), como en una Schmidt real; para sensor plano hace falta un aplanador.' };
  };

  GEN.sct = p => {
    const F = p.F, f1 = p.Np * p.D, R1 = -2 * f1, th = deg(p.h, F), n = n_d(p.glass);
    const cg = O.cassegrain({ D: p.D, R1, F, b: p.b, fieldDeg: th });
    if (!(cg.d > 0) || !(cg.d < cg.f1)) throw new Error('Geometría imposible: revisa F/# del primario, focal y foco trasero.');
    const tp = r4(Math.max(3, p.D / 50)), Rm = 2 * f1, r0 = p.D / 2;
    const A4 = -1 / (4 * (n - 1) * Math.pow(Rm, 3)) * 0.5, c0 = 3 * r0 * r0 / (4 * (n - 1) * Math.pow(Rm, 3)) * 0.5;
    const s = base(`Schmidt–Cassegrain ${p.D} mm f/${(F / p.D).toFixed(1)}`, aperture({ D: p.D }, Math.ceil(cg.D2 + 4)), WL[p.wl], F, p.h, [
      OBJ(),
      surf({ cm: 'Placa correctora (STO, asférica)', r: r4(1 / c0), t: tp, mat: p.glass, sd: r0, a4: A4 }),
      surf({ cm: 'Placa · cara plana (soporta el secundario)', t: r4(cg.d), sd: r0 }),
      surf({ cm: 'Primario esférico', r: r4(R1), t: r4(-cg.d), mat: 'MIRROR', sd: 0 }),
      surf({ cm: 'Secundario esférico', r: r4(cg.R2), t: r4(cg.d), mat: 'MIRROR', sd: 0 }),
      surf({ cm: 'Plano del primario (paso por el agujero)', t: r4(p.b) }),
      IMA()]);
    paraxialFocus(s);
    const vD = { key: '2:t', tied: true, get: s => s.surfaces[2].t, set: (s, x) => { s.surfaces[2].t = x; s.surfaces[3].t = -x; s.surfaces[4].t = x; }, step: () => 2 };
    const vars = [vA(1, 'a4', 1e-10), vA(1, 'a6', 1e-15), vCurv(1, 0.2), vCurv(4, 0.02), vD];
    const post = s => { finishHoleTwoMirrorAt(s, 3, 5, 4); };
    return { sys: s, tune: { vars, cfg: { F, eflW: 10, iters: 500, fw: [2, 1, 1], bf: { i: 5, min: p.b } }, post }, note: 'Primario y secundario esféricos; la placa asférica (A4, A6 y curvatura) y la separación se afinan automáticamente.' };
  };
  // tras afinar: secundario según su huella real, agujero del primario y obstrucción coherentes
  function finishHoleTwoMirrorAt(s, iPrim, iPlane, iSec) {
    s.surfaces[iPrim].hole = 0; s.surfaces[iPlane].sd = 0; s.surfaces[iSec].sd = 0;
    focusImage(s);
    for (let pass = 0; pass < 3; pass++) {
      const fp = footprints(s), hole = Math.ceil(fp[iPlane] * 1.05 * 10) / 10, sec = Math.ceil(fp[iSec] * 1.03 * 10 + 1) / 10;
      s.surfaces[iPrim].hole = hole; s.surfaces[iPlane].sd = hole; s.surfaces[iSec].sd = sec;
      s.aperture.obsc = r4(Math.max(2 * sec, 2 * hole));
    }
    focusImage(s);
  }

  GEN.mak = p => {
    const F = p.F, D = p.D, n = n_d(p.glass), tm = r4(p.tm || D / 10);
    const Rf = -p.Rk * D, Rr = Rf - tm * (n * n - 1) / (n * n); // condición acromática del menisco grueso
    const f2 = Math.abs(Rr) / 2;
    // primario que, con ese secundario (= cara trasera aluminizada), da la focal pedida
    const g = f1 => { const d = (F - p.b) / (1 + F / f1), so = f1 - d, si = d + p.b; return (so <= 0 || si <= 0) ? NaN : 1 / so - 1 / si - 1 / f2; };
    let lo = Math.max(p.b, D) * 0.3, hi = 20 * D, glo = g(lo), f1 = NaN;
    for (let k = 0; k < 400 && !isFinite(glo); k++) { lo *= 1.05; glo = g(lo); }
    for (let k = 0; k < 120; k++) { const m = (lo + hi) / 2, gm = g(m); if (!isFinite(gm)) { lo = m; continue; } if (Math.sign(gm) === Math.sign(glo)) { lo = m; glo = gm; } else hi = m; }
    f1 = (lo + hi) / 2;
    if (!isFinite(f1)) throw new Error('No se encontró una geometría válida: prueba otra curvatura del menisco o foco trasero.');
    const d = (F - p.b) / (1 + F / f1), th = deg(p.h, F), D2 = 2 * (D / 2 * (f1 - d) / f1 + d * Math.tan(th * Math.PI / 180)) + 2;
    const s = base(`Maksutov–Cassegrain ${D} mm f/${(F / D).toFixed(1)}`, aperture({ D }, Math.ceil(D2 + 2)), WL[p.wl], F, p.h, [
      OBJ(),
      surf({ cm: 'Menisco · cara delantera (STO)', r: r4(Rf), t: tm, mat: p.glass, sd: D / 2 }),
      surf({ cm: 'Menisco · cara trasera', r: r4(Rr), t: r4(d), sd: 0 }),
      surf({ cm: 'Primario esférico', r: r4(-2 * f1), t: r4(-d), mat: 'MIRROR', sd: 0 }),
      surf({ cm: 'Secundario: zona aluminizada del menisco', r: r4(Rr), t: r4(d), mat: 'MIRROR', sd: 0 }),
      surf({ cm: 'Plano del primario (paso por el agujero)', t: r4(p.b) }),
      IMA()]);
    paraxialFocus(s);
    const vRr = { key: '2:r', tied: true, get: s => O.curv(s.surfaces[2].r), set: (s, x) => { s.surfaces[2].r = 1 / x; s.surfaces[4].r = 1 / x; }, step: x => Math.abs(x) * 0.01 };
    const vD = { key: '2:t', tied: true, get: s => s.surfaces[2].t, set: (s, x) => { s.surfaces[2].t = x; s.surfaces[3].t = -x; s.surfaces[4].t = x; }, step: () => 2 };
    const vT = { key: '1:t', get: s => s.surfaces[1].t, set: (s, x) => { s.surfaces[1].t = Math.min(D / 5, Math.max(D / 20, x)); }, step: () => 1 };
    const vars = [vCurv(1, 0.01), vRr, vCurv(3, 0.02), vD, vT];
    const post = s => { finishHoleTwoMirrorAt(s, 3, 5, 4); };
    return { sys: s, tune: { vars, cfg: { F, eflW: 10, iters: 900, fw: [2, 1, 1], bf: { i: 5, min: p.b } }, post }, note: 'Todo esférico. El secundario es la zona aluminizada de la cara trasera del menisco (mismo radio, ligado en el afinado). Se afinan las curvaturas del menisco, el primario y la separación.' };
  };

  // ---------- refractores ----------
  GEN.singlet = p => {
    const F = p.D * p.N, n = n_d(p.glass), R1 = F * (n - 1) * 1.1, R2 = -F * (n - 1) * 11;
    const t = lensThick(R1, R2, p.D, true);
    const s = base(`Refractor de lente simple ${p.D} mm f/${p.N}`, aperture({ D: p.D }, 0), WL[p.wl], F, p.h, [
      OBJ(), surf({ cm: 'Objetivo (STO)', r: r4(R1), t, mat: p.glass }), surf({ cm: 'Objetivo · cara 2', r: r4(R2), t: 0 }), IMA()]);
    paraxialFocus(s);
    return { sys: s, tune: { vars: [vCurv(1), vCurv(2)], cfg: { F, iters: 200, fw: [2, 1, 1] } }, note: 'Lente simple «de mejor forma» para objeto en el infinito: minimiza la esférica y la coma, pero no el color.' };
  };

  GEN.achro = p => {
    const F = p.D * p.N;
    const L = achromat(F, p.D, p.crown, p.flint, 'Objetivo');
    L[0].cm = 'Objetivo · corona (STO)';
    const s = base(`Refractor acromático ${p.D} mm f/${p.N} (${p.crown} + ${p.flint})`, aperture({ D: p.D }, 0), WL[p.wl], F, p.h, [OBJ(), ...L, IMA()]);
    paraxialFocus(s);
    return { sys: s, tune: { vars: [vCurv(1), vCurv(2), vCurv(3)], cfg: { F, iters: 400, fw: [2, 1, 1] } }, note: 'Doblete cementado tipo Fraunhofer: el reparto de potencias corrige el color primario; las curvaturas se afinan para esférica y coma.' };
  };

  GEN.apo = p => {
    const F = p.D * p.N, phi = 1 / F, sel = p.auto === 'auto' ? bestApo(phi) : { gl: [p.g1, p.g2, p.g3], p: apoPowers(phi, [p.g1, p.g2, p.g3]) };
    if (!sel || !sel.p) throw new Error('Esa combinación de vidrios no tiene solución apocromática.');
    const S = [OBJ()];
    sel.gl.forEach((g, j) => {
      const n = n_d(g), ph = sel.p[j], R = 2 * (n - 1) / ph, pos = ph > 0;
      const R1 = R, R2 = -R, t = lensThick(R1, R2, p.D, pos);
      S.push(surf({ cm: `Elemento ${j + 1} · ${g}${j === 0 ? ' (STO)' : ''}`, r: r4(R1), t, mat: g }));
      S.push(surf({ cm: `Elemento ${j + 1} · cara 2`, r: r4(R2), t: j < 2 ? r4(Math.max(0.5, p.D / 150)) : 0 }));
    });
    S.push(IMA());
    const s = base(`Refractor apocromático (triplete) ${p.D} mm f/${p.N}`, aperture({ D: p.D }, 0), WL.wide, F, p.h, S);
    paraxialFocus(s);
    const vars = [1, 2, 3, 4, 5, 6].map(i => vCurv(i, 0.05));
    return { sys: s, tune: { vars, cfg: { F, iters: 900, fw: [2, 1, 1] } }, note: `Vidrios: ${sel.gl.join(' + ')}. Potencias resueltas para corregir el color primario y el espectro secundario; las 6 curvaturas se afinan. Se usan 5 longitudes de onda (420–750 nm).` };
  };

  GEN.petzval = p => {
    const F = p.D * p.N, sep = F, f1 = 2 * F, f2 = F;
    const front = achromat(f1, p.D, p.crown, p.flint, 'Grupo delantero');
    const Dr = r4(p.D * 0.55 + 4 * p.h);
    const rear = achromat(f2, Dr, p.crown, p.flint, 'Grupo trasero');
    front[0].cm += ' (STO)'; front[2].t = r4(sep - 0); rear[2].t = 0;
    const s = base(`Astrógrafo Petzval ${p.D} mm f/${p.N}`, aperture({ D: p.D }, 0), WL[p.wl], F, p.h, [OBJ(), ...front, ...rear, IMA()]);
    paraxialFocus(s);
    const vars = [1, 2, 3, 4, 5, 6].map(i => vCurv(i, 0.05));
    vars.push({ key: '3:t', get: s => s.surfaces[3].t, set: (s, x) => { s.surfaces[3].t = Math.max(1, x); }, step: () => F * 0.03 });
    return { sys: s, tune: { vars, cfg: { F, iters: 900, fw: [1, 1, 1] } }, note: 'Dos dobletes separados (focales 2F y F, separación F): el segundo grupo corrige el campo. Se afinan curvaturas y separación.' };
  };

  // ---------- catálogo para la interfaz ----------
  const P = {
    D: (d) => ({ k: 'D', label: 'Apertura Ø', unit: 'mm', def: d, step: 1, min: 20 }),
    N: (d) => ({ k: 'N', label: 'F/# del sistema', unit: '', def: d, step: 0.1, min: 1 }),
    F: (d) => ({ k: 'F', label: 'Focal del sistema', unit: 'mm', def: d, step: 10, min: 50 }),
    Np: (d) => ({ k: 'Np', label: 'F/# del primario', unit: '', def: d, step: 0.1, min: 0.8 }),
    b: (d) => ({ k: 'b', label: 'Foco tras el vértice del primario', unit: 'mm', def: d, step: 5 }),
    h: (d) => ({ k: 'h', label: 'Semidiagonal del sensor', unit: 'mm', def: d, step: 0.5, min: 0.5 }),
    wl: (d) => ({ k: 'wl', label: 'Banda', type: 'select', def: d || 'rgb', options: [['rgb', 'Fotografía RGB (450/550/650 nm)'], ['visual', 'Visual F·d·C (486/588/656 nm)'], ['wide', 'Ancha 420–750 nm (5 λ)']] }),
    glass: (d) => ({ k: 'glass', label: 'Vidrio', type: 'select', def: d || 'N-BK7', options: ['N-BK7', 'F_SILICA', 'N-BAK4', 'N-SK16', 'N-FK51A', 'CAF2'].map(g => [g, g]) }),
    crown: (d) => ({ k: 'crown', label: 'Vidrio corona', type: 'select', def: d || 'N-BK7', options: ['N-BK7', 'N-BAK4', 'N-SK16', 'N-FK51A', 'CAF2', 'F_SILICA'].map(g => [g, g]) }),
    flint: () => ({ k: 'flint', label: 'Vidrio flint', type: 'select', def: 'N-F2', options: ['N-F2', 'N-SF2', 'N-SF5', 'N-SF11'].map(g => [g, g]) }),
    seg: () => [{ k: 'seg', label: 'Primario segmentado en anillo', type: 'check', def: false }, { k: 'nseg', label: 'Nº de segmentos', unit: '', def: 6, step: 1, min: 3, when: 'seg' }, { k: 'gap', label: 'Hueco entre segmentos', unit: 'mm', def: 10, step: 1, min: 0, when: 'seg' }]
  };
  const TYPES = [
    { key: 'prime', group: 'Reflectores', name: 'Foco primario', desc: 'Un espejo parabólico con el sensor en su foco. La forma más simple de reflector: perfecto en el centro, coma hacia el borde.', params: [P.D(300), P.N(4), { k: 'obs', label: 'Obstrucción (cámara y soporte)', unit: 'mm', def: 70, step: 1, min: 0 }, P.h(11), P.wl(), ...P.seg()], gen: GEN.prime },
    { key: 'newton', group: 'Reflectores', name: 'Newtoniano', desc: 'Primario parabólico y diagonal plana que saca el foco al lateral del tubo. Se calcula el tamaño de la diagonal para iluminar todo el sensor.', params: [P.D(200), P.N(5), { k: 'L', label: 'Distancia diagonal → foco', unit: 'mm', def: 170, step: 5, min: 10 }, P.h(11), P.wl(), ...P.seg()], gen: GEN.newton },
    { key: 'cass-cc', group: 'Reflectores', name: 'Cassegrain clásico', desc: 'Primario parabólico y secundario convexo hiperbólico. Perfecto en el centro; coma fuera de eje.', params: [P.D(250), P.F(2500), P.Np(3), P.b(150), P.h(11), P.wl(), ...P.seg()], gen: p => cassFamily(p, 'cc') },
    { key: 'cass-rc', group: 'Reflectores', name: 'Ritchey–Chrétien', desc: 'Dos espejos hiperbólicos: sin esférica ni coma. El estándar de los telescopios profesionales; queda astigmatismo y curvatura de campo.', params: [P.D(250), P.F(2000), P.Np(3), P.b(200), P.h(11), P.wl(), ...P.seg()], gen: p => cassFamily(p, 'rc') },
    { key: 'cass-dk', group: 'Reflectores', name: 'Dall–Kirkham', desc: 'Primario elíptico y secundario esférico (fácil de fabricar y probar). Más coma que el clásico; bueno a F/# lentos.', params: [P.D(250), P.F(3750), P.Np(3.5), P.b(150), P.h(8), P.wl(), ...P.seg()], gen: p => cassFamily(p, 'dk') },
    { key: 'cass-pc', group: 'Reflectores', name: 'Pressmann–Camichel', desc: 'Primario esférico y secundario asférico (elipsoide oblato). Primario barato; mucha coma fuera de eje.', params: [P.D(250), P.F(3750), P.Np(3.5), P.b(150), P.h(6), P.wl(), ...P.seg()], gen: p => cassFamily(p, 'pc') },
    { key: 'cass-sph', group: 'Reflectores', name: 'Cassegrain todo esférico', desc: 'Dos espejos esféricos sin corregir: punto de partida para diseñar un corrector (enfoque Klevtsov/Argunov).', params: [P.D(250), P.F(2500), P.Np(3), P.b(150), P.h(11), P.wl(), ...P.seg()], gen: p => cassFamily(p, 'sph') },
    { key: 'greg', group: 'Reflectores', name: 'Gregoriano', desc: 'Primario parabólico y secundario cóncavo elíptico situado más allá del foco del primario. Imagen derecha, tubo más largo.', params: [P.D(250), P.F(3000), P.Np(3), P.b(150), P.h(8), P.wl(), ...P.seg()], gen: GEN.greg },
    { key: 'schmidt', group: 'Catadióptricos', name: 'Cámara Schmidt', desc: 'Espejo esférico con una placa correctora asférica en su centro de curvatura. Campo muy amplio y luminoso, con superficie focal curva.', params: [P.D(200), P.N(2), P.h(15), P.glass('N-BK7'), P.wl()], gen: GEN.schmidt, tuned: true },
    { key: 'sct', group: 'Catadióptricos', name: 'Schmidt–Cassegrain', desc: 'Primario y secundario esféricos con placa Schmidt delante. El catadióptrico comercial más común (tubo corto, f/10).', params: [P.D(200), P.F(2000), P.Np(2), P.b(130), P.h(8), P.glass('N-BK7'), P.wl()], gen: GEN.sct, tuned: true },
    { key: 'mak', group: 'Catadióptricos', name: 'Maksutov–Cassegrain', desc: 'Menisco grueso esférico delante de un primario esférico; el secundario es una zona aluminizada del menisco. Todo esférico.', params: [P.D(150), P.F(1800), { k: 'Rk', label: 'Radio del menisco / Ø', unit: '×', def: 1.45, step: 0.05, min: 0.6 }, { k: 'tm', label: 'Espesor del menisco', unit: 'mm', def: 15, step: 0.5, min: 2 }, P.b(180), P.h(6), P.glass('N-BK7'), P.wl()], gen: GEN.mak, tuned: true },
    { key: 'singlet', group: 'Refractores', name: 'Lente simple', desc: 'Un único objetivo de vidrio en su «mejor forma». Útil para entender el color: muestra la aberración cromática sin corregir.', params: [P.D(60), P.N(15), P.h(5), P.glass('N-BK7'), P.wl('visual')], gen: GEN.singlet, tuned: true },
    { key: 'achro', group: 'Refractores', name: 'Acromático (doblete)', desc: 'Doblete cementado corona + flint tipo Fraunhofer. Corrige el color en dos longitudes de onda; queda espectro secundario.', params: [P.D(100), P.N(9), P.h(8), P.crown(), P.flint(), P.wl('visual')], gen: GEN.achro, tuned: true },
    { key: 'apo', group: 'Refractores', name: 'Apocromático (triplete)', desc: 'Tres elementos con vidrios elegidos para corregir el color en tres longitudes de onda. Elección automática de vidrios o manual.', params: [P.D(120), P.N(7), P.h(11), { k: 'auto', label: 'Vidrios', type: 'select', def: 'auto', options: [['auto', 'Elegir automáticamente'], ['manual', 'Elegir yo']] }, { k: 'g1', label: 'Vidrio 1', type: 'select', def: 'N-FK51A', options: APO_GLASSES.map(g => [g, g]), when: 'manual' }, { k: 'g2', label: 'Vidrio 2', type: 'select', def: 'N-SF2', options: APO_GLASSES.map(g => [g, g]), when: 'manual' }, { k: 'g3', label: 'Vidrio 3', type: 'select', def: 'N-BAK4', options: APO_GLASSES.map(g => [g, g]), when: 'manual' }], gen: GEN.apo, tuned: true },
    { key: 'petzval', group: 'Refractores', name: 'Astrógrafo Petzval', desc: 'Dos dobletes separados: rápido y con campo amplio y plano, para astrofotografía.', params: [P.D(100), P.N(5), P.h(11), P.crown('N-FK51A'), P.flint(), P.wl('rgb')], gen: GEN.petzval, tuned: true }
  ];

  function defaults(type) { const o = {}; type.params.forEach(q => { o[q.k] = q.def; }); return o; }
  function build(key, params) {
    const T = TYPES.find(t => t.key === key); if (!T) throw new Error('Tipo desconocido');
    const p = Object.assign(defaults(T), params || {});
    const r = T.gen(p);
    r.sys.segments = [];
    if (r.tune) { r.tuner = new Tuner(r.sys, r.tune.vars, r.tune.cfg); }
    return r;
  }
  // tras el afinado: aplica lo mejor, enfoca, pone semi-diámetros y marca variables
  function finalize(r) {
    const s = r.sys;
    if (r.tuner) {
      r.tuner.finish();
      r.tune.vars.forEach(v => { if (!v.tied) s.vary[v.key] = true; });
      s.vary[(s.surfaces.length - 2) + ':t'] = true;
    }
    focusImage(s);
    if (r.tune && r.tune.post) r.tune.post(s);
    // semi-diámetros de lentes y espejos sin definir
    const L = s.surfaces.length - 1, fp = footprints(s);
    for (let i = 1; i < L; i++) { const S = s.surfaces[i]; if (!(S.sd > 0) && fp[i] > 0) S.sd = Math.ceil(fp[i] * 1.03 * 10 + 1) / 10; }
    // redondeo de valores
    s.surfaces.forEach(S => { ['r', 't'].forEach(k => { if (isFinite(S[k])) S[k] = +(+S[k]).toPrecision(10); }); });
    return s;
  }

  const API = { TYPES, build, finalize, merit, defaults, bestApo, footprints, WL };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.SegDesigns = API;
})(typeof window !== 'undefined' ? window : this);
