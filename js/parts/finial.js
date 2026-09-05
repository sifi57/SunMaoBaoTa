/* ==========================================================================
   finial.js — 塔刹 / 梁架 / 藻井
   The pagoda's crowning mast and the interior structure.
   塔刹 sequence, bottom → top:
     刹座(须弥座) → 覆钵 → 仰莲 → 相轮(七重) → 圆光 → 仰月 → 宝盖 → 宝珠
   plus 铁链 (chains) and 风铎 (wind bells) guyed to the hip tips.
   ========================================================================== */
import * as THREE from 'three';
import {
  merge, xform, box, lathe, loft, ngon, mesh, instances, TAU
} from '../geo/util.js';
import { oct } from './base.js';
import { windBell } from './roof.js';

/* ---------- 1. 刹座 — the finial's own Sumeru base --------------------- */
export function chaBase(R = 0.46) {
  const g = [];
  const rings = [
    { y: 0.00, pts: oct(R) },
    { y: 0.07, pts: oct(R) },
    { y: 0.09, pts: oct(R * 0.90) },
    { y: 0.19, pts: oct(R * 0.82) },       // 束腰
    { y: 0.21, pts: oct(R * 0.92) },
    { y: 0.28, pts: oct(R * 0.98) },
    { y: 0.30, pts: oct(R * 0.94) }
  ];
  g.push(loft(rings, { uvRepeat: 8 }));
  return merge(g);
}

/* ---------- 2. 覆钵 — the inverted bowl -------------------------------- */
export function fubo(r = 0.40, h = 0.30) {
  const prof = [];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // hemisphere-ish, slightly flattened, tucked at the base
    const rr = r * Math.sqrt(Math.max(0, 1 - Math.pow(t * 0.98, 2.1)));
    prof.push([Math.max(rr, 0.02), t * h]);
  }
  prof.unshift([r * 0.94, -0.02]);
  return lathe(prof, 22, { smooth: true });
}

/* ---------- 3. 仰莲 / 覆莲 — lotus collars ----------------------------- */
/**
 * A ring of lotus petals. `up = true` → 仰莲 (petals opening upward),
 * `up = false` → 覆莲 (petals hanging down).
 */
export function lotus(r = 0.34, { petals = 12, up = true, h = 0.16, layers = 2 } = {}) {
  const g = [];
  // the collar the petals attach to
  g.push(lathe([[r * 0.52, 0], [r * 0.60, h * 0.22], [r * 0.56, h * 0.42]], 16, { smooth: true }));
  for (let L = 0; L < layers; L++) {
    const n = petals - L * 2;
    const rr = r * (1 - L * 0.20);
    const yy = h * (0.10 + L * 0.30);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (L % 2 ? Math.PI / n : 0);
      // petal: a squashed, pointed sphere leaning outward (or downward)
      const petal = new THREE.SphereGeometry(rr * 0.34, 9, 7);
      petal.scale(0.62, 1.35, 0.34);
      const tilt = up ? -0.72 : 0.95;
      xform(petal, {
        p: [Math.cos(a) * rr * 0.60, yy + (up ? h * 0.34 : -h * 0.10), Math.sin(a) * rr * 0.60],
        r: [0, -a + Math.PI / 2, tilt]
      });
      g.push(petal);
      // petal tip ridge
      const ridge = new THREE.ConeGeometry(rr * 0.10, rr * 0.42, 6);
      xform(ridge, {
        p: [Math.cos(a) * rr * 0.92, yy + (up ? h * 0.62 : -h * 0.30), Math.sin(a) * rr * 0.92],
        r: [0, -a, up ? -0.85 : 2.3]
      });
      g.push(ridge);
    }
  }
  return merge(g);
}

/* ---------- 4. 相轮 — the stacked discs (七重相轮) --------------------- */
/**
 * The 相轮 are the wheel-like discs threaded on the mast — the visual
 * signature of a pagoda finial. Their radii taper toward the top.
 */
export function xianglun(count = 7, { rBase = 0.30, rTop = 0.15, gap = 0.115, thick = 0.045 } = {}) {
  const g = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1 || 1);
    const r = rBase + (rTop - rBase) * t;
    const y = i * gap;
    // each disc: a torus-like ring with a bevelled rim
    g.push(lathe([
      [r * 0.42, y], [r * 0.90, y + thick * 0.10], [r, y + thick * 0.5],
      [r * 0.90, y + thick * 0.90], [r * 0.42, y + thick]
    ], 20, { smooth: true }));
    // small bosses around the rim
    if (i % 2 === 0) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        const b = new THREE.SphereGeometry(thick * 0.42, 7, 6);
        b.translate(Math.cos(a) * r * 0.98, y + thick * 0.5, Math.sin(a) * r * 0.98);
        g.push(b);
      }
    }
  }
  return { geo: merge(g), height: (count - 1) * gap + thick };
}

/* ---------- 5. 圆光 / 仰月 — the halo and crescent -------------------- */
/** 圆光 — an openwork flaming halo disc. */
export function yuanguang(r = 0.26) {
  const g = [];
  const ring = new THREE.TorusGeometry(r, r * 0.075, 8, 28);
  ring.rotateX(Math.PI / 2);
  g.push(ring);
  // radiating flame tongues
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const fl = new THREE.ConeGeometry(r * 0.075, r * 0.34, 6);
    xform(fl, {
      p: [Math.cos(a) * r * 1.14, 0, Math.sin(a) * r * 1.14],
      r: [Math.PI / 2, 0, -a + Math.PI / 2]
    });
    g.push(fl);
  }
  // inner spokes
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const sp = new THREE.CylinderGeometry(r * 0.035, r * 0.035, r * 2, 6);
    xform(sp, { p: [0, 0, 0], r: [Math.PI / 2, 0, a] });
    g.push(sp);
  }
  return merge(g);
}

/** 仰月 — the upturned crescent. */
export function yangyue(r = 0.20) {
  const g = [];
  const arc = new THREE.TorusGeometry(r, r * 0.11, 8, 18, Math.PI * 1.05);
  xform(arc, { r: [0, 0, -Math.PI * 0.025] });
  g.push(arc);
  for (const sx of [-1, 1]) {
    const tip = new THREE.ConeGeometry(r * 0.11, r * 0.42, 7);
    xform(tip, { p: [sx * r * 0.985, r * 0.16, 0], r: [0, 0, sx * -0.18] });
    g.push(tip);
  }
  return merge(g);
}

/* ---------- 6. 宝盖 — the canopy ------------------------------------- */
export function baogai(r = 0.30) {
  const g = [];
  const prof = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    prof.push([r * (1 - Math.pow(t, 1.6)) + 0.02, t * r * 0.52]);
  }
  g.push(lathe(prof, 18, { smooth: true }));
  // hanging tassels around the rim
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    const t = new THREE.ConeGeometry(r * 0.05, r * 0.26, 6);
    xform(t, { p: [Math.cos(a) * r * 0.94, -r * 0.11, Math.sin(a) * r * 0.94], r: [Math.PI, 0, 0] });
    g.push(t);
  }
  return merge(g);
}

/* ---------- 7. 宝珠 — the crowning jewel ----------------------------- */
export function baozhu(r = 0.17) {
  const g = [];
  const body = new THREE.SphereGeometry(r, 18, 14);
  body.scale(1, 1.16, 1);
  body.translate(0, r * 1.05, 0);
  g.push(body);
  // flame crest
  const flame = new THREE.ConeGeometry(r * 0.44, r * 1.05, 9);
  flame.translate(0, r * 2.55, 0);
  g.push(flame);
  // waist band
  const band = new THREE.TorusGeometry(r * 0.99, r * 0.075, 7, 18);
  band.rotateX(Math.PI / 2); band.translate(0, r * 1.0, 0);
  g.push(band);
  // base collar
  g.push(lathe([[r * 0.66, -r * 0.10], [r * 0.86, 0], [r * 0.70, r * 0.14]], 14, { smooth: true }));
  return merge(g);
}

/* ==========================================================================
   8. FULL 塔刹 ASSEMBLY
   ========================================================================== */
export function finial(M, { scale = 1, rings = 7, bells = true } = {}) {
  const G = new THREE.Group();
  G.name = 'finial';
  let y = 0;
  const put = (geo, mat, name, dy = 0) => {
    geo.translate(0, y + dy, 0);
    G.add(mesh(geo, mat, name));
  };

  // 刹座
  put(chaBase(0.46), M.stone, '刹座');
  y += 0.30;
  // 覆钵
  put(fubo(0.40, 0.30), M.gold, '覆钵');
  y += 0.30;
  // 仰莲
  put(lotus(0.36, { up: true, h: 0.17, petals: 12, layers: 2 }), M.gold, '仰莲');
  y += 0.20;
  // 刹杆 — the mast running through everything
  const mastH = 0.115 * (rings - 1) + 1.45;
  const mast = new THREE.CylinderGeometry(0.045, 0.055, mastH, 12);
  mast.translate(0, y + mastH / 2 - 0.10, 0);
  G.add(mesh(mast, M.goldDull, '刹杆'));
  // 相轮
  const xl = xianglun(rings, { rBase: 0.30, rTop: 0.155, gap: 0.115, thick: 0.045 });
  put(xl.geo, M.gold, '相轮');
  y += xl.height + 0.07;
  // 圆光
  const yg = yuanguang(0.25);
  yg.translate(0, y + 0.12, 0);
  G.add(mesh(yg, M.gold, '圆光'));
  y += 0.24;
  // 仰月
  const ym = yangyue(0.19);
  ym.translate(0, y + 0.10, 0);
  G.add(mesh(ym, M.gold, '仰月'));
  y += 0.26;
  // 宝盖
  put(baogai(0.28), M.gold, '宝盖');
  y += 0.20;
  // 宝珠
  put(baozhu(0.16), M.gold, '宝珠');
  y += 0.62;

  G.userData.height = y * scale;
  if (scale !== 1) G.scale.setScalar(scale);
  return G;
}

/* ==========================================================================
   9. 梁架 — the interior frame above the top storey
   ========================================================================== */
/**
 * 抹角梁 / 递角梁 — the diagonal beams that convert the octagon into a
 * smaller octagon at each level, letting the roof close in. This is the real
 * mechanism behind an octagonal 攒尖 roof.
 */
export function diagonalBeams(R, y, { w = 0.15, h = 0.26, shrink = 0.62 } = {}) {
  const g = [];
  const verts = ngon(8, R, Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const A = verts[i], B = verts[(i + 2) % 8];
    // the beam spans across two faces, cutting the corner
    const ax = A[0] * shrink + B[0] * (1 - shrink);
    const az = A[1] * shrink + B[1] * (1 - shrink);
    const bx = B[0] * shrink + A[0] * (1 - shrink);
    const bz = B[1] * shrink + A[1] * (1 - shrink);
    const len = Math.hypot(bx - ax, bz - az);
    const bm = box(len, h, w, 'center');
    xform(bm, {
      p: [(ax + bx) / 2, y, (az + bz) / 2],
      r: [0, Math.atan2(bx - ax, bz - az) + Math.PI / 2, 0]
    });
    g.push(bm);
  }
  return merge(g);
}

/** 蜀柱 / 驼峰 — the short posts and "camel hump" blocks on the beams. */
export function shortPosts(R, y, h, { count = 8 } = {}) {
  const g = [];
  const verts = ngon(count, R, Math.PI / count);
  for (const [x, z] of verts) {
    g.push(xform(box(0.13, h, 0.13, 'bottom'), { p: [x, y, z] }));
    // 驼峰 — a hump block under the post
    const hump = new THREE.SphereGeometry(0.11, 9, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    hump.scale(1.5, 0.75, 1.0);
    xform(hump, { p: [x, y, z] });
    g.push(hump);
  }
  return merge(g);
}

/** 藻井 — the coffered ceiling, visible from below through the doorways. */
export function zaojing(R, y, { depth = 0.55 } = {}) {
  const g = [];
  const rings = [
    { y: 0, pts: oct(R) },
    { y: depth * 0.30, pts: oct(R * 0.74) },
    { y: depth * 0.60, pts: oct(R * 0.50) },
    { y: depth * 0.85, pts: oct(R * 0.28) },
    { y: depth, pts: oct(R * 0.10) }
  ];
  g.push(loft(rings, { capBottom: false, capTop: true, uvRepeat: 8 }));
  // ribs at each tier
  [0, 1, 2, 3].forEach(i => {
    const r = rings[i].pts;
    for (let k = 0; k < 8; k++) {
      const A = r[k], B = r[(k + 1) % 8];
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const bm = box(len, 0.05, 0.07, 'center');
      xform(bm, {
        p: [(A[0] + B[0]) / 2, rings[i].y, (A[1] + B[1]) / 2],
        r: [0, Math.atan2(B[0] - A[0], B[1] - A[1]) + Math.PI / 2, 0]
      });
      g.push(bm);
    }
  });
  const out = merge(g);
  out.translate(0, y, 0);
  return out;
}

/* ---------- 10. 铁链 — guy chains from the mast to the hip tips -------- */
export function guyChains(topY, Reave, hipY, { count = 8, sag = 0.30 } = {}) {
  const g = [];
  const seg = 10;
  for (let k = 0; k < count; k++) {
    const a = (k / count) * TAU;
    const A = new THREE.Vector3(0, topY, 0);
    const B = new THREE.Vector3(Math.cos(a) * Reave, hipY, Math.sin(a) * Reave);
    for (let i = 0; i < seg; i++) {
      const t0 = i / seg, t1 = (i + 1) / seg;
      const p0 = A.clone().lerp(B, t0); p0.y -= Math.sin(t0 * Math.PI) * sag;
      const p1 = A.clone().lerp(B, t1); p1.y -= Math.sin(t1 * Math.PI) * sag;
      const len = p0.distanceTo(p1);
      const cy = new THREE.CylinderGeometry(0.010, 0.010, len, 5);
      const mid = p0.clone().lerp(p1, 0.5);
      const dir = p1.clone().sub(p0).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      cy.applyQuaternion(q); cy.translate(mid.x, mid.y, mid.z);
      g.push(cy);
    }
  }
  return merge(g);
}
