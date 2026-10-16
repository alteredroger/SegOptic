/* SegOptic — motor óptico
 * Trazado de rayos real 3D secuencial (superficies cónicas), espejos y lentes,
 * apertura segmentada en anillo con errores por segmento (pistón, tip, tilt, ΔROC),
 * OPD respecto a esfera de referencia, PSF/MTF por FFT, modelo de sensores de borde
 * y simulación de co-faseo en lazo cerrado.
 *
 * Convenciones (compatibles con Zemax):
 *  - Unidades: mm. Longitudes de onda en µm.
 *  - Radio con signo: centro de curvatura en z_vértice + R. Infinity = plano.
 *  - Espesor = distancia en z al siguiente vértice (negativo tras un espejo que devuelve la luz).
 *  - Material = medio DESPUÉS de la superficie ("MIRROR" refleja; "" o "AIR" = aire).
 *  - La pupila de entrada está en la superficie 1 (el primario). Objeto en el infinito.
 *  - Errores de segmento: p [nm] (pistón de superficie), tx = dz/dx [µrad], ty = dz/dy [µrad], dR [mm].
 */
(function (root) {
  'use strict';

  // ---------- Vidrios (Sellmeier: B1,B2,B3,C1,C2,C3 con λ en µm) ----------
  const GLASS = {
    'N-BK7':    [1.03961212, 0.231792344, 1.01046945, 0.00600069867, 0.0200179144, 103.560653],
    'F_SILICA': [0.6961663, 0.4079426, 0.8974794, 0.00467914826, 0.0135120631, 97.9340025],
    'N-F2':     [1.39757037, 0.159201403, 1.2686543, 0.00995906143, 0.0546931752, 119.248346],
    'N-SF11':   [1.73759695, 0.313747346, 1.89878101, 0.013188707, 0.0623068142, 155.23629],
    'N-SK16':   [1.34317774, 0.241144399, 0.994317969, 0.00704687339, 0.0229005, 92.7508526],
    'CAF2':     [0.5675888, 0.4710914, 3.8484723, 0.00252643, 0.01007833, 1200.556]
  };

  function isMirror(mat) { return String(mat || '').trim().toUpperCase() === 'MIRROR'; }

  function glassIndex(mat, wl) {
    const m = String(mat == null ? '' : mat).trim().toUpperCase();
    if (m === '' || m === 'AIR') return 1;
    if (m === 'MIRROR') return -1;
    const g = GLASS[m];
    if (g) {
      const l2 = wl * wl;
      return Math.sqrt(1 + g[0] * l2 / (l2 - g[3]) + g[1] * l2 / (l2 - g[4]) + g[2] * l2 / (l2 - g[5]));
    }
    // modelo nd/Vd  (p.ej. "1.5168/64.17") → Cauchy A + B/λ²
    const mm = m.match(/^([0-9.]+)\s*[\/:]\s*([0-9.]+)$/);
    if (mm) {
      const nd = +mm[1], V = +mm[2];
      const B = (nd - 1) / V / (1 / (0.4861327 * 0.4861327) - 1 / (0.6562725 * 0.6562725));
      const A = nd - B / (0.5875618 * 0.5875618);
      return A + B / (wl * wl);
    }
    const v = parseFloat(m);
    if (isFinite(v) && v >= 1) return v;
    return NaN;
  }

  // ---------- Geometría básica ----------
  function curv(r) { r = +r; return (!isFinite(r) || r === 0) ? 0 : 1 / r; }
  function sag(c, k, r2) {
    if (c === 0) return 0;
    const d = 1 - (1 + k) * c * c * r2;
    if (d < 0) return NaN;
    return c * r2 / (1 + Math.sqrt(d));
  }
  // Intersección rayo (P local al vértice, D) con superficie cónica: rama cercana al vértice
  function intersectConic(px, py, pz, dx, dy, dz, c, k) {
    if (c === 0) return Math.abs(dz) < 1e-15 ? NaN : -pz / dz;
    const kk = 1 + k;
    const A = c * (dx * dx + dy * dy + kk * dz * dz);
    const Bh = c * (px * dx + py * dy + kk * pz * dz) - dz;
    const C = c * (px * px + py * py + kk * pz * pz) - 2 * pz;
    const disc = Bh * Bh - A * C;
    if (disc < 0) return NaN;
    const den = -Bh + (dz >= 0 ? 1 : -1) * Math.sqrt(disc);
    if (den === 0) return NaN;
    return C / den;
  }
  function normalLocal(x, y, z, c, k) {
    const nx = c * x, ny = c * y, nz = c * (1 + k) * z - 1;
    const n = Math.hypot(nx, ny, nz);
    return [nx / n, ny / n, nz / n];
  }
  // R = Rx(ty)·Ry(-tx): dz ≈ tx·dx + ty·dy   (fila mayor)
  function rotMat(tx, ty) {
    const a = ty, b = -tx, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    return [cb, 0, sb, sa * sb, ca, -sa * cb, -ca * sb, sa, ca * cb];
  }

  // ---------- Movimientos rígidos (descentrados / inclinaciones) ----------
  // T = {R (3x3 fila mayor), P (pivote), d (traslación)}: mundo = P + R·(q − P) + d
  function rotXY(axDeg, ayDeg) { // R = Ry(ay)·Rx(ax)
    const a = axDeg * Math.PI / 180, b = ayDeg * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    return [cb, sb * sa, sb * ca, 0, ca, -sa, -sb, cb * sa, cb * ca];
  }
  function rotBetween(a, b) { // rotación que lleva el vector unitario a sobre b
    const vx = a[1] * b[2] - a[2] * b[1], vy = a[2] * b[0] - a[0] * b[2], vz = a[0] * b[1] - a[1] * b[0];
    const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2], s2 = vx * vx + vy * vy + vz * vz;
    if (s2 < 1e-30) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const f = (1 - c) / s2;
    return [1 + f * (vx * vx - s2), -vz + f * vx * vy, vy + f * vx * vz,
      vz + f * vx * vy, 1 + f * (vy * vy - s2), -vx + f * vy * vz,
      -vy + f * vx * vz, vx + f * vy * vz, 1 + f * (vz * vz - s2)];
  }
  function toLoc(T, x, y, z) {
    const R = T.R, u = x - T.P[0] - T.d[0], v = y - T.P[1] - T.d[1], w = z - T.P[2] - T.d[2];
    return [R[0] * u + R[3] * v + R[6] * w + T.P[0], R[1] * u + R[4] * v + R[7] * w + T.P[1], R[2] * u + R[5] * v + R[8] * w + T.P[2]];
  }
  function dirLoc(T, x, y, z) { const R = T.R; return [R[0] * x + R[3] * y + R[6] * z, R[1] * x + R[4] * y + R[7] * z, R[2] * x + R[5] * y + R[8] * z]; }
  function toWld(T, x, y, z) {
    const R = T.R, u = x - T.P[0], v = y - T.P[1], w = z - T.P[2];
    return [R[0] * u + R[1] * v + R[2] * w + T.P[0] + T.d[0], R[3] * u + R[4] * v + R[5] * w + T.P[1] + T.d[1], R[6] * u + R[7] * v + R[8] * w + T.P[2] + T.d[2]];
  }
  function dirWld(T, x, y, z) { const R = T.R; return [R[0] * x + R[1] * y + R[2] * z, R[3] * x + R[4] * y + R[5] * z, R[6] * x + R[7] * y + R[8] * z]; }

  // ---------- Apertura ----------
  function epd(ap) { return ap.type === 'segmented' ? 2 * ap.ringR + ap.dseg : ap.D; }
  function segAngles(ap) {
    const n = ap.nseg | 0, a = [];
    for (let k = 0; k < n; k++) a.push((ap.rot + 360 * k / n) * Math.PI / 180);
    return a;
  }
  function segCenters(ap) {
    if (ap.type !== 'segmented') return [];
    return segAngles(ap).map(a => [ap.ringR * Math.cos(a), ap.ringR * Math.sin(a)]);
  }
  function segmentGap(ap) {
    const n = ap.nseg | 0;
    if (n < 2) return Infinity;
    return 2 * ap.ringR * Math.sin(Math.PI / n) - ap.dseg;
  }
  function pupilMask(ap, centers, x, y) {
    const r2 = x * x + y * y;
    if (ap.obsc > 0 && r2 < 0.25 * ap.obsc * ap.obsc) return -1;
    if (ap.type === 'segmented') {
      const rs2 = 0.25 * ap.dseg * ap.dseg;
      for (let k = 0; k < centers.length; k++) {
        const dx = x - centers[k][0], dy = y - centers[k][1];
        if (dx * dx + dy * dy <= rs2) return k;
      }
      return -1;
    }
    return r2 <= 0.25 * ap.D * ap.D ? 0 : -1;
  }
  function apertureStats(ap) {
    const E = epd(ap);
    let area;
    if (ap.type === 'segmented') area = ap.nseg * Math.PI * ap.dseg * ap.dseg / 4;
    else area = Math.PI * (ap.D * ap.D - (ap.obsc || 0) * (ap.obsc || 0)) / 4;
    if (ap.type === 'segmented' && ap.obsc > 0) {
      // descuenta la parte de los segmentos tapada por la obstrucción (si la hubiera)
      const inner = ap.ringR - ap.dseg / 2;
      if (ap.obsc / 2 > inner) area *= NaN; // se calcula numéricamente abajo
    }
    if (!isFinite(area)) {
      const C = segCenters(ap), N = 400; let cnt = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = ((i + 0.5) / N - 0.5) * E, y = ((j + 0.5) / N - 0.5) * E;
        if (pupilMask(ap, C, x, y) >= 0) cnt++;
      }
      area = cnt * (E / N) * (E / N);
    }
    return { epd: E, area, deq: 2 * Math.sqrt(area / Math.PI), gap: segmentGap(ap) };
  }

  // ---------- Contexto de trazado ----------
  function buildCtx(sys) {
    const S = sys.surfaces, L = S.length - 1;
    const z = new Float64Array(S.length);
    for (let i = 1; i < L; i++) z[i + 1] = z[i] + (+S[i].t || 0);
    const c = S.map(s => curv(s.r));
    const k = S.map(s => +s.k || 0);
    const mirror = S.map(s => isMirror(s.mat));
    const ap = sys.aperture;
    const centers = segCenters(ap);
    let segSurf = -1;
    if (ap.type === 'segmented') for (let i = 1; i < L; i++) if (S[i].seg) { segSurf = i; break; }
    let segData = null;
    if (segSurf > 0) {
      const zi = z[segSurf], ci = c[segSurf], ki = k[segSurf];
      segData = centers.map((cc, j) => {
        const e = (sys.segments && sys.segments[j]) || {};
        const tx = (+e.tx || 0) * 1e-6, ty = (+e.ty || 0) * 1e-6, pz = (+e.p || 0) * 1e-6, dR = +e.dR || 0;
        let s = sag(ci, ki, cc[0] * cc[0] + cc[1] * cc[1]); if (!isFinite(s)) s = 0;
        const C = [cc[0], cc[1], zi + s];
        // ΔROC: cónica madre con |R| + ΔR (misma k), que pasa por el centro del segmento y realineada
        // (tip/tilt) para que su normal allí coincida con la nominal
        let Ta = null, cS = ci, zS = zi;
        if (dR !== 0 && ci !== 0) {
          const R0 = 1 / ci, Rn = R0 + Math.sign(R0) * dR;
          if (Rn * R0 > 0) {
            const c2 = 1 / Rn, r2 = cc[0] * cc[0] + cc[1] * cc[1], s2 = sag(c2, ki, r2);
            if (isFinite(s2)) {
              cS = c2; zS = zi + s - s2;
              Ta = { R: rotBetween(normalLocal(cc[0], cc[1], s2, c2, ki), normalLocal(cc[0], cc[1], s, ci, ki)), P: C, d: [0, 0, 0] };
            }
          }
        }
        const Rm = rotMat(tx, ty);
        return { C, R: Rm, pz, T: { R: Rm, P: C, d: [0, 0, pz] }, Ta, cS, zS, trivial: tx === 0 && ty === 0 && pz === 0 && !Ta };
      });
    }
    // grupos de superficies con movimiento rígido (pivote = vértice de la primera + desplazamiento axial)
    const xf = new Array(S.length).fill(null);
    let nPert = 0;
    (sys.perturb || []).forEach(g => {
      if (!g || g.on === false) return;
      const a = Math.max(1, g.from | 0), b = Math.min(L, g.to | 0);
      if (b < a) return;
      const dx = +g.dx || 0, dy = +g.dy || 0, dz = +g.dz || 0, tx = +g.tx || 0, ty = +g.ty || 0;
      if (!dx && !dy && !dz && !tx && !ty) return;
      const T = { R: rotXY(tx, ty), P: [0, 0, z[a] + (+g.piv || 0)], d: [dx, dy, dz] };
      for (let i = a; i <= b; i++) (xf[i] = xf[i] || []).push(T);
      nPert++;
    });
    return { sys, S, L, z, c, k, mirror, ap, centers, segSurf, segData, xf, nPert, epd: epd(ap), nCache: new Map(), pupCache: new Map() };
  }

  function idxArr(ctx, wl) {
    let a = ctx.nCache.get(wl);
    if (!a) { a = ctx.S.map(s => isMirror(s.mat) ? -1 : glassIndex(s.mat, wl)); ctx.nCache.set(wl, a); }
    return a;
  }

  // ---------- Trazado de un rayo ----------
  function traceRay(ctx, P0, D0, wl, o) {
    o = o || {};
    const nArr = idxArr(ctx, wl);
    let px = P0[0], py = P0[1], pz = P0[2], dx = D0[0], dy = D0[1], dz = D0[2];
    let n = 1, opl = 0;
    const pts = o.record ? [[px, py, pz]] : null;
    const last = o.stopAt != null ? o.stopAt : ctx.L;
    const seg = o.seg != null ? o.seg : -1;
    for (let i = 1; i <= last; i++) {
      const zi = ctx.z[i], c = ctx.c[i], k = ctx.k[i];
      let t, hx, hy, hz, nx, ny, nz;
      const sd = (i === ctx.segSurf && seg >= 0 && ctx.segData) ? ctx.segData[seg] : null;
      const useSeg = sd && !sd.trivial, xs = ctx.xf[i];
      let qx = px, qy = py, qz = pz, ex = dx, ey = dy, ez = dz, tmp;
      if (xs) for (let a = 0; a < xs.length; a++) {
        tmp = toLoc(xs[a], qx, qy, qz); qx = tmp[0]; qy = tmp[1]; qz = tmp[2];
        tmp = dirLoc(xs[a], ex, ey, ez); ex = tmp[0]; ey = tmp[1]; ez = tmp[2];
      }
      if (useSeg) {
        tmp = toLoc(sd.T, qx, qy, qz); qx = tmp[0]; qy = tmp[1]; qz = tmp[2];
        tmp = dirLoc(sd.T, ex, ey, ez); ex = tmp[0]; ey = tmp[1]; ez = tmp[2];
        if (sd.Ta) {
          tmp = toLoc(sd.Ta, qx, qy, qz); qx = tmp[0]; qy = tmp[1]; qz = tmp[2];
          tmp = dirLoc(sd.Ta, ex, ey, ez); ex = tmp[0]; ey = tmp[1]; ez = tmp[2];
        }
      }
      const cU = useSeg ? sd.cS : c, zU = useSeg ? sd.zS : zi;
      let Hx, Hy, Hz, Nx, Ny, Nz;
      t = intersectConic(qx, qy, qz - zU, ex, ey, ez, cU, k);
      if (!isFinite(t)) return { ok: false, at: i, pts };
      Hx = qx + t * ex; Hy = qy + t * ey; Hz = qz + t * ez;
      { const nn = normalLocal(Hx, Hy, Hz - zU, cU, k); Nx = nn[0]; Ny = nn[1]; Nz = nn[2]; }
      if (useSeg) {
        if (sd.Ta) {
          tmp = toWld(sd.Ta, Hx, Hy, Hz); Hx = tmp[0]; Hy = tmp[1]; Hz = tmp[2];
          tmp = dirWld(sd.Ta, Nx, Ny, Nz); Nx = tmp[0]; Ny = tmp[1]; Nz = tmp[2];
        }
        tmp = toWld(sd.T, Hx, Hy, Hz); Hx = tmp[0]; Hy = tmp[1]; Hz = tmp[2];
        tmp = dirWld(sd.T, Nx, Ny, Nz); Nx = tmp[0]; Ny = tmp[1]; Nz = tmp[2];
      }
      const apx = Hx, apy = Hy; // coordenadas de apertura: ejes propios del elemento
      if (xs) for (let a = xs.length - 1; a >= 0; a--) {
        tmp = toWld(xs[a], Hx, Hy, Hz); Hx = tmp[0]; Hy = tmp[1]; Hz = tmp[2];
        tmp = dirWld(xs[a], Nx, Ny, Nz); Nx = tmp[0]; Ny = tmp[1]; Nz = tmp[2];
      }
      hx = Hx; hy = Hy; hz = Hz; nx = Nx; ny = Ny; nz = Nz;
      opl += n * t;
      if (!o.noApert) {
        const s = ctx.S[i], r2 = apx * apx + apy * apy, sdv = +s.sd || 0, ho = +s.hole || 0;
        if ((sdv > 0 && r2 > sdv * sdv * (1 + 1e-9)) || (ho > 0 && r2 < ho * ho)) {
          if (pts) pts.push([hx, hy, hz]);
          return { ok: false, at: i, pts };
        }
      }
      if (pts) pts.push([hx, hy, hz]);
      px = hx; py = hy; pz = hz;
      if (i === ctx.L) break;
      let dn = dx * nx + dy * ny + dz * nz;
      if (dn > 0) { nx = -nx; ny = -ny; nz = -nz; dn = -dn; }
      if (ctx.mirror[i]) {
        dx -= 2 * dn * nx; dy -= 2 * dn * ny; dz -= 2 * dn * nz;
      } else {
        const n2 = nArr[i];
        if (!(n2 > 0)) return { ok: false, at: i, pts };
        if (n2 !== n) {
          const mu = n / n2, ci = -dn, s2 = mu * mu * (1 - ci * ci);
          if (s2 > 1) return { ok: false, at: i, pts, tir: true };
          const f = mu * ci - Math.sqrt(1 - s2);
          dx = mu * dx + f * nx; dy = mu * dy + f * ny; dz = mu * dz + f * nz;
          n = n2;
        }
      }
      const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
    }
    return { ok: true, P: [px, py, pz], D: [dx, dy, dz], opl, n, pts };
  }

  function fieldDir(deg) { const t = deg * Math.PI / 180; return [0, Math.sin(t), Math.cos(t)]; }
  function startPt(x, y, D, L) { L = L || 200; return [x - L * D[0] / D[2], y - L * D[1] / D[2], -L]; }

  function pupilSamples(ctx, N) {
    let a = ctx.pupCache.get(N);
    if (a) return a;
    a = []; const E = ctx.epd;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N - 0.5) * E, y = ((j + 0.5) / N - 0.5) * E;
      const s = pupilMask(ctx.ap, ctx.centers, x, y);
      if (s >= 0) a.push({ x, y, seg: s, i, j });
    }
    ctx.pupCache.set(N, a);
    return a;
  }

  function chief(ctx, fieldDeg, wl) {
    const D = fieldDir(fieldDeg);
    return traceRay(ctx, startPt(0, 0, D), D, wl, { seg: -1, noApert: true, record: true });
  }

  // ---------- Paraxial (rayo real de altura muy pequeña) ----------
  function paraxial(ctx, sys) {
    const wl = sys.wavelengths[sys.primary || 0].wl, L = ctx.L;
    // diferencia central (+h / −h): robusta frente a desapuntados por descentrados
    const h = Math.max(1e-4, ctx.epd * 1e-5);
    const a = traceRay(ctx, [0, h, -200], [0, 0, 1], wl, { seg: -1, noApert: true, stopAt: L - 1 });
    const b = traceRay(ctx, [0, -h, -200], [0, 0, 1], wl, { seg: -1, noApert: true, stopAt: L - 1 });
    if (!a.ok || !b.ok) return null;
    const sa = a.D[1] / Math.abs(a.D[2]), sb = b.D[1] / Math.abs(b.D[2]);
    if (Math.abs(sa - sb) < 1e-15) return null;
    const efl = -2 * h / (sa - sb);
    const ma = a.D[1] / a.D[2], mb = b.D[1] / b.D[2];
    const zf = (b.P[1] - a.P[1] + a.P[2] * ma - b.P[2] * mb) / (ma - mb);
    const st = apertureStats(ctx.ap);
    return {
      efl, fno: efl / ctx.epd, fnoEq: efl / st.deq, bfl: zf - ctx.z[L - 1], zImage: ctx.z[L], zFocus: zf,
      plate: 206264.806 / efl, epd: ctx.epd, area: st.area, deq: st.deq, gap: st.gap
    };
  }

  // ---------- Diagrama de impactos ----------
  function spot(ctx, sys, fieldDeg, N) {
    const wlp = sys.wavelengths[sys.primary || 0].wl;
    const ch = chief(ctx, fieldDeg, wlp);
    if (!ch.ok) return null;
    const Q = ch.P, D = fieldDir(fieldDeg), samp = pupilSamples(ctx, N);
    const per = [];
    let sx = 0, sy = 0, n = 0, launched = 0, lost = 0;
    sys.wavelengths.forEach((w) => {
      const pts = [];
      for (const s of samp) {
        launched++;
        const r = traceRay(ctx, startPt(s.x, s.y, D), D, w.wl, { seg: s.seg });
        if (!r.ok) { lost++; continue; }
        const x = (r.P[0] - Q[0]) * 1000, y = (r.P[1] - Q[1]) * 1000;
        pts.push(x, y); sx += x * w.w; sy += y * w.w; n += w.w;
      }
      per.push({ wl: w.wl, pts });
    });
    if (n === 0) return { per, rms: NaN, geo: NaN, cx: 0, cy: 0, lostFrac: 1, Q };
    const cx = sx / n, cy = sy / n;
    let s2 = 0, g = 0, wsum = 0;
    per.forEach((p, idx) => {
      const ww = sys.wavelengths[idx].w;
      for (let i = 0; i < p.pts.length; i += 2) {
        const dx = p.pts[i] - cx, dy = p.pts[i + 1] - cy, r2 = dx * dx + dy * dy;
        s2 += ww * r2; wsum += ww; if (r2 > g) g = r2;
      }
    });
    return { per, rms: Math.sqrt(s2 / wsum), geo: Math.sqrt(g), cx, cy, lostFrac: lost / launched, Q };
  }

  // ---------- Mapa de OPD (ondas) ----------
  function fitPlane(W, N, E, mask) {
    let S1 = 0, Sx = 0, Sy = 0, Sxx = 0, Syy = 0, Sxy = 0, Sw = 0, Swx = 0, Swy = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const w = W[j * N + i]; if (!isFinite(w)) continue;
      const x = ((i + 0.5) / N - 0.5) * E, y = ((j + 0.5) / N - 0.5) * E;
      S1++; Sx += x; Sy += y; Sxx += x * x; Syy += y * y; Sxy += x * y; Sw += w; Swx += w * x; Swy += w * y;
    }
    const M = [[S1, Sx, Sy], [Sx, Sxx, Sxy], [Sy, Sxy, Syy]], b = [Sw, Swx, Swy];
    return solve3(M, b);
  }
  function solve3(M, b) {
    const d = det3(M);
    if (Math.abs(d) < 1e-300) return [b[0] / (M[0][0] || 1), 0, 0];
    const r = [];
    for (let c = 0; c < 3; c++) {
      const Mc = M.map((row, i) => row.map((v, j) => j === c ? b[i] : v));
      r.push(det3(Mc) / d);
    }
    return r;
  }
  function det3(m) {
    return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  }

  function opdMap(ctx, sys, fieldDeg, wl, N, removeTilt) {
    const ch = chief(ctx, fieldDeg, wl);
    if (!ch.ok) return null;
    const Q = ch.P, nI = ch.n;
    let Rref = 1000;
    if (ch.pts && ch.pts.length >= 2) {
      const a = ch.pts[ch.pts.length - 2];
      Rref = Math.hypot(a[0] - Q[0], a[1] - Q[1], a[2] - Q[2]);
      if (!(Rref > 1)) Rref = 1000;
    }
    const ref0 = ch.opl - nI * Rref, lam = wl * 1e-3;
    const D = fieldDir(fieldDeg), E = ctx.epd;
    const W = new Float64Array(N * N).fill(NaN);
    let lost = 0;
    const samp = pupilSamples(ctx, N);
    for (const s of samp) {
      const r = traceRay(ctx, startPt(s.x, s.y, D), D, wl, { seg: s.seg });
      if (!r.ok) { lost++; continue; }
      const vx = r.P[0] - Q[0], vy = r.P[1] - Q[1], vz = r.P[2] - Q[2];
      const dv = r.D[0] * vx + r.D[1] * vy + r.D[2] * vz;
      const q = dv * dv - (vx * vx + vy * vy + vz * vz) + Rref * Rref;
      if (q < 0) { lost++; continue; }
      const sdist = dv + Math.sqrt(q);
      W[s.j * N + s.i] = ((r.opl - nI * sdist) - ref0) / lam;
    }
    let mean = 0, cnt = 0;
    for (let i = 0; i < W.length; i++) if (isFinite(W[i])) { mean += W[i]; cnt++; }
    if (!cnt) return null;
    mean /= cnt;
    for (let i = 0; i < W.length; i++) if (isFinite(W[i])) W[i] -= mean;
    let tilt = [0, 0, 0];
    if (removeTilt) {
      tilt = fitPlane(W, N, E);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const id = j * N + i; if (!isFinite(W[id])) continue;
        W[id] -= tilt[0] + tilt[1] * ((i + 0.5) / N - 0.5) * E + tilt[2] * ((j + 0.5) / N - 0.5) * E;
      }
    }
    let mn = Infinity, mx = -Infinity, s2 = 0;
    for (let i = 0; i < W.length; i++) { const w = W[i]; if (!isFinite(w)) continue; if (w < mn) mn = w; if (w > mx) mx = w; s2 += w * w; }
    const rms = Math.sqrt(s2 / cnt);
    // estadísticas por segmento
    const segStats = [];
    if (ctx.ap.type === 'segmented') {
      for (let k = 0; k < ctx.centers.length; k++) segStats.push({ n: 0, s: 0, s2: 0 });
      for (const s of samp) { const w = W[s.j * N + s.i]; if (!isFinite(w)) continue; const st = segStats[s.seg]; st.n++; st.s += w; st.s2 += w * w; }
      segStats.forEach(st => { st.mean = st.n ? st.s / st.n : NaN; st.rms = st.n ? Math.sqrt(Math.max(0, st.s2 / st.n - st.mean * st.mean)) : NaN; });
    }
    return { W, N, E, pv: mx - mn, rms, min: mn, max: mx, strehlM: Math.exp(-Math.pow(2 * Math.PI * rms, 2)), lostFrac: lost / Math.max(1, samp.length), segStats, wl };
  }

  // ---------- FFT ----------
  function fft1(re, im, inv) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (inv ? 2 : -2) * Math.PI / len, half = len >> 1;
      for (let i = 0; i < n; i += len) {
        for (let kk = 0; kk < half; kk++) {
          const cr = Math.cos(ang * kk), ci = Math.sin(ang * kk);
          const a = i + kk, b = a + half;
          const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        }
      }
    }
  }
  function fft2(re, im, M, inv) {
    const tr = new Float64Array(M), ti = new Float64Array(M);
    for (let r = 0; r < M; r++) {
      const o = r * M;
      for (let c = 0; c < M; c++) { tr[c] = re[o + c]; ti[c] = im[o + c]; }
      fft1(tr, ti, inv);
      for (let c = 0; c < M; c++) { re[o + c] = tr[c]; im[o + c] = ti[c]; }
    }
    for (let c = 0; c < M; c++) {
      for (let r = 0; r < M; r++) { tr[r] = re[r * M + c]; ti[r] = im[r * M + c]; }
      fft1(tr, ti, inv);
      for (let r = 0; r < M; r++) { re[r * M + c] = tr[r]; im[r * M + c] = ti[r]; }
    }
  }
  function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

  // ---------- PSF, Strehl, EE, MTF ----------
  function psf(ctx, sys, fieldDeg, wl, N, pad, crop) {
    pad = pad || 4; crop = crop || 128;
    const M = nextPow2(N * pad);
    const om = opdMap(ctx, sys, fieldDeg, wl, N, false);
    if (!om) return null;
    const par = paraxial(ctx, sys);
    if (!par) return null;
    const re = new Float64Array(M * M), im = new Float64Array(M * M);
    const rr = new Float64Array(M * M), ri = new Float64Array(M * M);
    const off = (M - N) >> 1;
    // pupila ideal = máscara de apertura (sin aberraciones ni viñeteo)
    const samp = pupilSamples(ctx, N);
    for (const s of samp) {
      const ii = s.i + off, jj = s.j + off, id = jj * M + ii, sg = ((ii + jj) & 1) ? -1 : 1;
      rr[id] = sg;
      const w = om.W[s.j * N + s.i];
      if (isFinite(w)) { re[id] = sg * Math.cos(2 * Math.PI * w); im[id] = sg * Math.sin(2 * Math.PI * w); }
    }
    fft2(re, im, M, false); fft2(rr, ri, M, false);
    const I = new Float64Array(M * M), Ir = new Float64Array(M * M);
    let pk = 0, pkr = 0, tot = 0, cx = 0, cy = 0;
    for (let i = 0; i < M * M; i++) {
      I[i] = re[i] * re[i] + im[i] * im[i]; Ir[i] = rr[i] * rr[i] + ri[i] * ri[i];
      if (I[i] > pk) pk = I[i]; if (Ir[i] > pkr) pkr = Ir[i];
    }
    for (let i = 0; i < M * M; i++) { I[i] /= pkr; Ir[i] /= pkr; }
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) { const v = I[j * M + i]; tot += v; cx += v * i; cy += v * j; }
    cx /= tot; cy /= tot;
    const dx = wl * Math.abs(par.fno) * N / M; // µm/píxel
    // energía encerrada
    const nb = M >> 1, hist = new Float64Array(nb), histR = new Float64Array(nb);
    let totR = 0;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const r = Math.hypot(i - cx, j - cy), b = Math.floor(r);
      const v = I[j * M + i]; if (b < nb) hist[b] += v;
      const rr0 = Math.floor(Math.hypot(i - M / 2, j - M / 2)); const vr = Ir[j * M + i]; totR += vr; if (rr0 < nb) histR[rr0] += vr;
    }
    const eeR = [], ee = [], eeRef = [];
    let acc = 0, accR = 0;
    for (let b = 0; b < nb; b++) { acc += hist[b]; accR += histR[b]; eeR.push((b + 1) * dx); ee.push(acc / tot); eeRef.push(accR / totR); }
    // recorte para visualizar
    const K = Math.min(crop, M), c0 = (M - K) >> 1, img = new Float32Array(K * K);
    for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) img[j * K + i] = I[(j + c0) * M + i + c0];
    // MTF = |FFT(PSF)|
    const oi = new Float64Array(M * M), ori = new Float64Array(M * M);
    const ore = Float64Array.from(I), orr = Float64Array.from(Ir);
    fft2(ore, oi, M, false); fft2(orr, ori, M, false);
    const m0 = Math.hypot(ore[0], oi[0]), mr0 = Math.hypot(orr[0], ori[0]);
    const f = [], tan = [], sag_ = [], rtan = [], rsag = [];
    const fstep = 1 / (wl * 1e-3 * Math.abs(par.fno) * N); // ciclos/mm
    for (let kk = 0; kk <= N && kk < M; kk++) {
      f.push(kk * fstep);
      tan.push(Math.hypot(ore[kk * M], oi[kk * M]) / m0);
      sag_.push(Math.hypot(ore[kk], oi[kk]) / m0);
      rtan.push(Math.hypot(orr[kk * M], ori[kk * M]) / mr0);
      rsag.push(Math.hypot(orr[kk], ori[kk]) / mr0);
    }
    return { img, K, dx, strehl: pk / pkr, ee: { r: eeR, e: ee, ref: eeRef }, mtf: { f, tan, sag: sag_, rtan, rsag, cutoff: 1 / (wl * 1e-3 * Math.abs(par.fno)) }, om, M, par };
  }

  // ---------- Herramientas de validación ----------
  // punto de la superficie i (coordenadas nominales locales) llevado al mundo con sus descentrados
  function xfPoint(ctx, i, p) {
    const xs = ctx.xf[i]; let q = p;
    if (xs) for (let a = xs.length - 1; a >= 0; a--) q = toWld(xs[a], q[0], q[1], q[2]);
    return q;
  }
  // rayos de un campo trazados hasta la última superficie antes de la imagen (para reenfocar sin retrazar)
  function fieldRays(ctx, sys, fieldDeg, N, wls) {
    wls = wls || sys.wavelengths.map((w, i) => i);
    const D = fieldDir(fieldDeg), samp = pupilSamples(ctx, N), L = ctx.L, rays = [];
    let launched = 0, lost = 0;
    for (const wi of wls) {
      const w = sys.wavelengths[wi];
      for (const s of samp) {
        launched++;
        const r = traceRay(ctx, startPt(s.x, s.y, D), D, w.wl, { seg: s.seg, stopAt: L - 1 });
        if (!r.ok) { lost++; continue; }
        rays.push({ P: r.P, D: r.D, w: w.w, wi });
      }
    }
    const ch = traceRay(ctx, startPt(0, 0, D), D, sys.wavelengths[sys.primary || 0].wl, { seg: -1, noApert: true, stopAt: L - 1 });
    return { rays, chief: ch.ok ? ch : null, lostFrac: lost / Math.max(1, launched), launched, field: fieldDeg };
  }
  function imgHit(ctx, P, D, dz) {
    const L = ctx.L, zi = ctx.z[L] + dz;
    let Q = P, E = D;
    const xs = ctx.xf[L];
    if (xs) for (let a = 0; a < xs.length; a++) { Q = toLoc(xs[a], Q[0], Q[1], Q[2]); E = dirLoc(xs[a], E[0], E[1], E[2]); }
    const t = intersectConic(Q[0], Q[1], Q[2] - zi, E[0], E[1], E[2], ctx.c[L], ctx.k[L]);
    if (!isFinite(t)) return null;
    return [Q[0] + t * E[0], Q[1] + t * E[1]];
  }
  // spot en el plano imagen desplazado dz [mm]; resultados en µm
  function spotAt(fr, ctx, dz, wi) {
    let sx = 0, sy = 0, sw = 0; const pts = [];
    for (const r of fr.rays) {
      if (wi != null && r.wi !== wi) continue;
      const h = imgHit(ctx, r.P, r.D, dz || 0); if (!h) continue;
      pts.push(h[0], h[1], r.w); sx += h[0] * r.w; sy += h[1] * r.w; sw += r.w;
    }
    if (!sw) return null;
    const cx = sx / sw, cy = sy / sw, rr = [];
    let s2 = 0;
    for (let i = 0; i < pts.length; i += 3) { const d2 = (pts[i] - cx) ** 2 + (pts[i + 1] - cy) ** 2; s2 += pts[i + 2] * d2; rr.push([Math.sqrt(d2), pts[i + 2]]); }
    rr.sort((a, b) => a[0] - b[0]);
    let acc = 0, r80 = rr[rr.length - 1][0];
    for (const [r, w] of rr) { acc += w; if (acc >= 0.8 * sw) { r80 = r; break; } }
    const ch = fr.chief ? imgHit(ctx, fr.chief.P, fr.chief.D, dz || 0) : null;
    return { cx: cx * 1000, cy: cy * 1000, rms: Math.sqrt(s2 / sw) * 1000, ee80: r80 * 1000, chief: ch ? [ch[0] * 1000, ch[1] * 1000] : null, n: rr.length };
  }
  // desplazamiento del plano imagen [mm] que minimiza Σ RMS² sobre los campos dados
  function bestFocus(frs, ctx, wi, R0) {
    const f = dz => { let s = 0; for (const fr of frs) { const sp = spotAt(fr, ctx, dz, wi); if (!sp) return 1e18; s += sp.rms * sp.rms; } return s; };
    let R = R0 || 5, best = 0;
    for (let pass = 0; pass < 5; pass++) {
      const g = (Math.sqrt(5) - 1) / 2; let a = best - R, b = best + R, c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
      for (let it = 0; it < 70; it++) { if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); } }
      const x = (a + b) / 2;
      if (Math.abs(x - best) < 0.9 * R) { best = x; break; }
      best = x; R *= 4;
    }
    return best;
  }
  // elementos físicos (para descentrar como sólido rígido)
  function elements(sys) {
    const S = sys.surfaces, L = S.length - 1, out = [];
    const glass = i => !isMirror(S[i].mat) && glassIndex(S[i].mat, 0.55) > 1.0001;
    let i = 1;
    while (i < L) {
      const s = S[i];
      if (isMirror(s.mat)) { out.push({ name: s.cm || ('Espejo ' + i), from: i, to: i, kind: s.seg ? 'seg' : 'mirror' }); i++; continue; }
      if (glass(i)) {
        let j = i + 1; while (j < L && glass(j)) j++;
        out.push({ name: (s.cm || 'Lente').replace(/\s*\((cara|face)[^)]*\)\s*$/i, '') || ('Lente ' + i), from: i, to: j, kind: 'lens' });
        i = j + 1; continue;
      }
      i++;
    }
    return out;
  }

  // ---------- Solver Cassegrain (paraxial, dos espejos) ----------
  function cassegrain(p) {
    // p: {D, R1 (con signo o magnitud), F (focal sistema), b (foco tras el vértice del primario), fieldDeg}
    const f1 = Math.abs(p.R1) / 2, M = p.F / f1;
    const d = (M * f1 - p.b) / (1 + M), B = d + p.b;
    const R2 = -2 * d * B / (p.F - B - d);
    const th = Math.tan((p.fieldDeg || 0) * Math.PI / 180);
    const D2 = p.D * (f1 - d) / f1 + 2 * d * th;
    return {
      f1, M, d, B, R1: -2 * f1, R2, D2, obsLin: D2 / p.D,
      K1cc: -1, K2cc: -Math.pow((M + 1) / (M - 1), 2),
      K1rc: -1 - 2 / Math.pow(M, 3) * B / d,
      K2rc: -1 - 2 / Math.pow(M - 1, 3) * (M * (2 * M - 1) + B / d)
    };
  }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function cassegrainSurfaces(cg, D, holeR, b, K1, K2) {
    return [
      { cm: 'Objeto', r: Infinity, t: Infinity, mat: '', sd: 0, hole: 0, k: 0 },
      { cm: 'Primario (STOP)', r: r4(cg.R1), t: r4(-cg.d), mat: 'MIRROR', sd: r4(D / 2), hole: r4(holeR), k: r4(K1 || 0), seg: true },
      { cm: 'Secundario', r: r4(cg.R2), t: r4(cg.d), mat: 'MIRROR', sd: Math.ceil(cg.D2 / 2 + 1), hole: 0, k: r4(K2 || 0) },
      { cm: 'Plano del primario (paso por el agujero)', r: Infinity, t: r4(b), mat: '', sd: r4(holeR), hole: 0, k: 0 },
      { cm: 'Imagen', r: Infinity, t: 0, mat: '', sd: 0, hole: 0, k: 0 }
    ];
  }

  // ---------- Sistemas de ejemplo ----------
  function baseSystem(name, ap) {
    return {
      name, aperture: ap,
      wavelengths: [{ wl: 0.45, w: 1 }, { wl: 0.55, w: 1 }, { wl: 0.70, w: 1 }], primary: 1,
      fields: [{ y: 0, w: 1 }, { y: 0.19, w: 1 }, { y: 0.273, w: 1 }],
      surfaces: [], segments: [], vary: {},
      merit: { eflTarget: 2940, eflW: 10, grid: 13 }
    };
  }
  function zeroSegments(n) { const a = []; for (let i = 0; i < n; i++) a.push({ p: 0, tx: 0, ty: 0, dR: 0 }); return a; }
  const SEG_AP = () => ({ type: 'segmented', D: 480, obsc: 180, nseg: 6, dseg: 150, ringR: 165, rot: 90 });

  function makePreset(key) {
    const P = { D: 480, R1: -2425, F: 2940, b: 250, fieldDeg: 0.273 };
    const cg = cassegrain(P);
    const ap = SEG_AP();
    const hole = ap.ringR - ap.dseg / 2;
    let s;
    switch (key) {
      case 'classical':
        s = baseSystem('Cassegrain clásico (primario parabólico) — referencia', ap);
        s.surfaces = cassegrainSurfaces(cg, P.D, hole, P.b, -1, cg.K2cc); break;
      case 'rc':
        s = baseSystem('Ritchey–Chrétien — referencia', ap);
        s.surfaces = cassegrainSurfaces(cg, P.D, hole, P.b, cg.K1rc, cg.K2rc); break;
      case 'circular':
        s = baseSystem('Baseline esférico con apertura circular equivalente (comparación)', { type: 'circular', D: 480, obsc: 180, nseg: 6, dseg: 150, ringR: 165, rot: 90 });
        s.surfaces = cassegrainSurfaces(cg, P.D, hole, P.b, 0, 0); break;
      case 'corrector': {
        s = baseSystem('Baseline esférico + corrector subapertura (plantilla para optimizar)', ap);
        const S = cassegrainSurfaces(cg, P.D, hole, P.b, 0, 0);
        S[3].t = 120;
        const lens = [
          { cm: 'Corrector L1 (cara 1)', r: 400, t: 8, mat: 'N-BK7', sd: 30, hole: 0, k: 0 },
          { cm: 'Corrector L1 (cara 2)', r: 1200, t: 12, mat: '', sd: 30, hole: 0, k: 0 },
          { cm: 'Corrector L2 (cara 1)', r: -350, t: 6, mat: 'N-F2', sd: 28, hole: 0, k: 0 },
          { cm: 'Corrector L2 (cara 2)', r: -900, t: 100, mat: '', sd: 28, hole: 0, k: 0 }
        ];
        S.splice(4, 0, ...lens);
        s.surfaces = S;
        s.vary = { '4:r': true, '5:r': true, '6:r': true, '7:r': true, '7:t': true };
        break;
      }
      default:
        s = baseSystem('Cassegrain anular segmentado — baseline todo-esférico (6 × Ø150)', ap);
        s.surfaces = cassegrainSurfaces(cg, P.D, hole, P.b, 0, 0);
    }
    s.segments = zeroSegments(ap.nseg);
    // enfoca en el foco paraxial
    const c = buildCtx(s), par = paraxial(c, s);
    if (par && isFinite(par.bfl)) s.surfaces[s.surfaces.length - 2].t = r4(par.bfl);
    return s;
  }
  const PRESETS = [
    ['baseline', 'Baseline proyecto: Cassegrain todo-esférico, anillo 6×Ø150'],
    ['corrector', 'Baseline + corrector (plantilla a optimizar)'],
    ['classical', 'Cassegrain clásico (K1 = −1) — referencia'],
    ['rc', 'Ritchey–Chrétien — referencia'],
    ['circular', 'Baseline con pupila circular (comparación)']
  ];

  // ---------- Álgebra lineal para co-faseo ----------
  function symEig(A, n) {
    const a = A.map(r => Float64Array.from(r));
    const V = []; for (let i = 0; i < n; i++) { V.push(new Float64Array(n)); V[i][i] = 1; }
    let norm = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) norm += a[i][j] * a[i][j];
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
      if (off <= 1e-26 * norm) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        const apq = a[p][q];
        if (Math.abs(apq) < 1e-300) continue;
        const th = (a[q][q] - a[p][p]) / (2 * apq);
        const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const kp = a[k][p], kq = a[k][q]; a[k][p] = c * kp - s * kq; a[k][q] = s * kp + c * kq; }
        for (let k = 0; k < n; k++) { const pk = a[p][k], qk = a[q][k]; a[p][k] = c * pk - s * qk; a[q][k] = s * pk + c * qk; }
        for (let k = 0; k < n; k++) { const kp = V[k][p], kq = V[k][q]; V[k][p] = c * kp - s * kq; V[k][q] = s * kp + c * kq; }
      }
    }
    const idx = []; for (let i = 0; i < n; i++) idx.push(i);
    idx.sort((x, y) => a[y][y] - a[x][x]);
    return { values: idx.map(i => a[i][i]), vectors: idx.map(i => { const v = new Float64Array(n); for (let k = 0; k < n; k++) v[k] = V[k][i]; return v; }) };
  }
  function inv3(m) {
    const d = det3(m);
    return [
      [(m[1][1] * m[2][2] - m[1][2] * m[2][1]) / d, (m[0][2] * m[2][1] - m[0][1] * m[2][2]) / d, (m[0][1] * m[1][2] - m[0][2] * m[1][1]) / d],
      [(m[1][2] * m[2][0] - m[1][0] * m[2][2]) / d, (m[0][0] * m[2][2] - m[0][2] * m[2][0]) / d, (m[0][2] * m[1][0] - m[0][0] * m[1][2]) / d],
      [(m[1][0] * m[2][1] - m[1][1] * m[2][0]) / d, (m[0][1] * m[2][0] - m[0][0] * m[2][1]) / d, (m[0][0] * m[1][1] - m[0][1] * m[1][0]) / d]
    ];
  }

  // Modelo de sensores de borde + actuadores. Estado por segmento: [p nm, tx µrad, ty µrad]
  // (µrad · mm = nm, así que las unidades son coherentes)
  function phasingModel(ap, prm) {
    const C = segCenters(ap), ang = segAngles(ap), n = C.length, m = 3 * n;
    const sensors = [], A = [];
    const pairs = [];
    if (n === 2) pairs.push([0, 1]); else for (let k = 0; k < n; k++) pairs.push([k, (k + 1) % n]);
    for (const [k, j] of pairs) {
      const mx = (C[k][0] + C[j][0]) / 2, my = (C[k][1] + C[j][1]) / 2, rl = Math.hypot(mx, my) || 1;
      const er = [mx / rl, my / rl];
      const offs = prm.nPerGap === 1 ? [0] : [-1, 1];
      for (const sgn of offs) {
        const x = mx + sgn * prm.delta * er[0], y = my + sgn * prm.delta * er[1];
        const row = new Float64Array(m);
        row[3 * j] = 1; row[3 * j + 1] = x - C[j][0]; row[3 * j + 2] = y - C[j][1];
        row[3 * k] = -1; row[3 * k + 1] = -(x - C[k][0]); row[3 * k + 2] = -(y - C[k][1]);
        A.push(row); sensors.push({ x, y, a: k, b: j });
      }
    }
    const acts = [], T = [], Tinv = [];
    for (let s = 0; s < n; s++) {
      const rows = [];
      for (let q = 0; q < 3; q++) {
        const a = ang[s] + (prm.aphi || 0) * Math.PI / 180 + q * 2 * Math.PI / 3;
        const dx = prm.ra * Math.cos(a), dy = prm.ra * Math.sin(a);
        rows.push([1, dx, dy]); acts.push({ seg: s, x: C[s][0] + dx, y: C[s][1] + dy });
      }
      T.push(rows); Tinv.push(inv3(rows));
    }
    // SVD vía AᵀA
    const AtA = []; for (let i = 0; i < m; i++) AtA.push(new Float64Array(m));
    for (const row of A) for (let i = 0; i < m; i++) if (row[i]) for (let j = 0; j < m; j++) AtA[i][j] += row[i] * row[j];
    const eg = symEig(AtA, m);
    const lmax = Math.max(1e-300, eg.values[0]);
    const tol = lmax * 1e-10;
    const sv = eg.values.map(v => Math.sqrt(Math.max(0, v)));
    const nullVecs = [], rangeIdx = [];
    eg.values.forEach((v, i) => (v > tol ? rangeIdx : nullVecs).push(v > tol ? i : eg.vectors[i]));
    // Reconstructor (pseudo-inversa): Rec = Σ v vᵀ/λ · Aᵀ
    const Pm = []; for (let i = 0; i < m; i++) Pm.push(new Float64Array(m));
    for (const i of rangeIdx) { const v = eg.vectors[i], l = eg.values[i]; for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) Pm[a][b] += v[a] * v[b] / l; }
    const ns = A.length, Rec = [];
    for (let a = 0; a < m; a++) { const r = new Float64Array(ns); for (let s = 0; s < ns; s++) { let acc = 0; for (let b = 0; b < m; b++) acc += Pm[a][b] * A[s][b]; r[s] = acc; } Rec.push(r); }
    // separa el espacio nulo en modos globales (pistón/tip/tilt de todo el anillo: inofensivos)
    // y modos "ciegos" que sí degradan la imagen
    const glob = [new Float64Array(m), new Float64Array(m), new Float64Array(m)];
    for (let s = 0; s < n; s++) {
      glob[0][3 * s] = 1;
      glob[1][3 * s] = C[s][0]; glob[1][3 * s + 1] = 1;
      glob[2][3 * s] = C[s][1]; glob[2][3 * s + 2] = 1;
    }
    const ortho = [];
    const gs = (v) => {
      const w = Float64Array.from(v);
      for (const u of ortho) { let d = 0; for (let i = 0; i < m; i++) d += u[i] * w[i]; for (let i = 0; i < m; i++) w[i] -= d * u[i]; }
      let nn = 0; for (let i = 0; i < m; i++) nn += w[i] * w[i]; nn = Math.sqrt(nn);
      if (nn < 1e-8) return null;
      for (let i = 0; i < m; i++) w[i] /= nn;
      ortho.push(w); return w;
    };
    glob.forEach(gs);
    const blind = [];
    for (const v of nullVecs) { const w = gs(v); if (w) blind.push(w); }
    return { n, m, A, sensors, centers: C, acts, T, Tinv, sv, rank: rangeIdx.length, nullVecs, blind, Rec };
  }

  // Evaluador de WFE (nm rms) para estado de segmentos, quitando pistón y tip/tilt globales
  function wfeEvaluator(ap, G) {
    const C = segCenters(ap), E = epd(ap), X = [], Y = [], Sg = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const x = ((i + 0.5) / G - 0.5) * E, y = ((j + 0.5) / G - 0.5) * E, s = pupilMask(ap, C, x, y);
      if (s >= 0) { X.push(x); Y.push(y); Sg.push(s); }
    }
    const N = X.length;
    let Sx = 0, Sy = 0, Sxx = 0, Syy = 0, Sxy = 0;
    for (let i = 0; i < N; i++) { Sx += X[i]; Sy += Y[i]; Sxx += X[i] * X[i]; Syy += Y[i] * Y[i]; Sxy += X[i] * Y[i]; }
    const Mi = inv3([[N, Sx, Sy], [Sx, Sxx, Sxy], [Sy, Sxy, Syy]]);
    function field(x) {
      const w = new Float64Array(N);
      for (let i = 0; i < N; i++) { const s = Sg[i]; w[i] = 2 * (x[3 * s] + x[3 * s + 1] * (X[i] - C[s][0]) + x[3 * s + 2] * (Y[i] - C[s][1])); }
      return w;
    }
    function residual(x) {
      const w = field(x); let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < N; i++) { b0 += w[i]; b1 += w[i] * X[i]; b2 += w[i] * Y[i]; }
      const c0 = Mi[0][0] * b0 + Mi[0][1] * b1 + Mi[0][2] * b2, c1 = Mi[1][0] * b0 + Mi[1][1] * b1 + Mi[1][2] * b2, c2 = Mi[2][0] * b0 + Mi[2][1] * b1 + Mi[2][2] * b2;
      for (let i = 0; i < N; i++) w[i] -= c0 + c1 * X[i] + c2 * Y[i];
      return w;
    }
    function rms(x) { const w = residual(x); let s = 0; for (let i = 0; i < N; i++) s += w[i] * w[i]; return Math.sqrt(s / N); }
    return { rms, residual, X, Y, Sg, N, E, G };
  }

  function gauss() { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // Simulación en lazo cerrado con sensores de borde (+ calibración opcional de pupila completa)
  function closedLoop(model, ev, prm) {
    const { n, m, A, Rec, T, Tinv } = model;
    const nullVecs = model.blind || model.nullVecs;
    const modeW = nullVecs.map(z => Math.max(1e-9, ev.rms(z))); // nm de WFE por unidad de modo
    const d = new Float64Array(m), aT = new Float64Array(m), a = new Float64Array(m), x = new Float64Array(m);
    for (let s = 0; s < n; s++) { d[3 * s] = gauss() * prm.p0; d[3 * s + 1] = gauss() * prm.t0; d[3 * s + 2] = gauss() * prm.t0; }
    const out = { wfe: [], wfeNull: [], wfeObs: [] };
    const proj = (v) => { const r = new Float64Array(m); for (const z of nullVecs) { let c = 0; for (let i = 0; i < m; i++) c += z[i] * v[i]; for (let i = 0; i < m; i++) r[i] += c * z[i]; } return r; };
    for (let it = 0; it <= prm.iters; it++) {
      for (let s = 0; s < n; s++) for (let q = 0; q < 3; q++) {
        let acc = 0; for (let r = 0; r < 3; r++) acc += Tinv[s][q][r] * a[3 * s + r];
        x[3 * s + q] = d[3 * s + q] + acc;
      }
      const pn = proj(x), po = x.map((v, i) => v - pn[i]);
      out.wfe.push(ev.rms(x)); out.wfeNull.push(ev.rms(pn)); out.wfeObs.push(ev.rms(po));
      if (it === prm.iters) break;
      const sm = A.map(row => { let acc = 0; for (let i = 0; i < m; i++) acc += row[i] * x[i]; return acc + gauss() * prm.sNoise; });
      const dx = new Float64Array(m);
      for (let i = 0; i < m; i++) { let acc = 0; for (let s = 0; s < sm.length; s++) acc += Rec[i][s] * sm[s]; dx[i] = -prm.gain * acc; }
      if (prm.calOn && it > 0 && it % Math.max(1, prm.calEvery) === 0) {
        for (let q = 0; q < nullVecs.length; q++) {
          const z = nullVecs[q];
          let c = 0; for (let i = 0; i < m; i++) c += z[i] * x[i];
          c += gauss() * prm.calNoise / modeW[q];
          for (let i = 0; i < m; i++) dx[i] -= c * z[i];
        }
      }
      for (let s = 0; s < n; s++) for (let q = 0; q < 3; q++) {
        let acc = 0; for (let r = 0; r < 3; r++) acc += T[s][q][r] * dx[3 * s + r];
        aT[3 * s + q] += acc;
        a[3 * s + q] = prm.quant > 0 ? Math.round(aT[3 * s + q] / prm.quant) * prm.quant : aT[3 * s + q];
      }
      if (prm.drift > 0) for (let s = 0; s < n; s++) { d[3 * s] += gauss() * prm.drift; d[3 * s + 1] += gauss() * prm.drift * 0.01; d[3 * s + 2] += gauss() * prm.drift * 0.01; }
    }
    out.final = Array.from(x);
    return out;
  }

  // ---------- Nelder–Mead ----------
  function NelderMead(f, x0, steps) {
    const n = x0.length;
    this.f = f; this.n = n; this.iter = 0;
    this.simplex = [x0.slice()];
    for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += steps[i]; this.simplex.push(x); }
    this.vals = this.simplex.map(x => f(x));
    this.evals = n + 1;
  }
  NelderMead.prototype.step = function () {
    const n = this.n, S = this.simplex, F = this.vals, f = this.f;
    const idx = F.map((v, i) => i).sort((a, b) => F[a] - F[b]);
    this.simplex = idx.map(i => S[i]); this.vals = idx.map(i => F[i]);
    const s = this.simplex, v = this.vals;
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += s[i][j] / n;
    const xr = c.map((cj, j) => cj + (cj - s[n][j])), fr = f(xr); this.evals++;
    if (fr < v[0]) {
      const xe = c.map((cj, j) => cj + 2 * (cj - s[n][j])), fe = f(xe); this.evals++;
      if (fe < fr) { s[n] = xe; v[n] = fe; } else { s[n] = xr; v[n] = fr; }
    } else if (fr < v[n - 1]) { s[n] = xr; v[n] = fr; }
    else {
      const out = fr < v[n];
      const xc = out ? c.map((cj, j) => cj + 0.5 * (xr[j] - cj)) : c.map((cj, j) => cj + 0.5 * (s[n][j] - cj));
      const fc = f(xc); this.evals++;
      if (fc < (out ? fr : v[n])) { s[n] = xc; v[n] = fc; }
      else {
        for (let i = 1; i <= n; i++) { s[i] = s[i].map((x, j) => s[0][j] + 0.5 * (x - s[0][j])); v[i] = f(s[i]); this.evals++; }
      }
    }
    this.iter++;
    let bi = 0; for (let i = 1; i <= n; i++) if (v[i] < v[bi]) bi = i;
    return { x: s[bi], f: v[bi], spread: Math.max(...v) - Math.min(...v) };
  };

  const API = {
    GLASS, glassIndex, isMirror, curv, sag, epd, segCenters, segAngles, segmentGap, pupilMask, apertureStats,
    buildCtx, traceRay, rotXY, xfPoint, fieldRays, spotAt, bestFocus, imgHit, elements, fieldDir, startPt, pupilSamples, chief, paraxial, spot, opdMap, psf, fft1, fft2,
    cassegrain, cassegrainSurfaces, makePreset, PRESETS, zeroSegments,
    phasingModel, wfeEvaluator, closedLoop, symEig, gauss, NelderMead
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.SegOptic = API;
})(typeof window !== 'undefined' ? window : this);
