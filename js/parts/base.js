/* ==========================================================================
   base.js — 台基 / 须弥座 / 栏杆 / 踏道
   Octagonal podium in the 须弥座 (Sumeru throne) form, as used on the
   Liao-dynasty timber pagodas (应县木塔 etc).
   ========================================================================== */
import * as THREE from 'three';
import { merge, xform, ngon, loft, lathe, box, mesh, instances, growRing, DEG, TAU } from '../geo/util.js';

/** Octagon vertex ring: flat-to-flat orientation so a face points at +Z. */
export function oct(r) { return ngon(8, r, Math.PI / 8); }

/* ---------- 1. 台基（须弥座）--------------------------------------------- */
/**
 * 须弥座 profile, bottom→top:
 *   圭角 → 下枋 → 下枭(束腰下) → 束腰 → 上枭 → 上枋 → 台面
 * R = radius to the octagon vertex at the widest course.
 */
export function podium(R = 3.05, H = 0.92) {
  const g = [];
  // proportional course heights (sum = 1)
  const courses = [
    { h: 0.16, r: 1.00, name: '圭角' },
    { h: 0.10, r: 1.00 },
    { h: 0.09, r: 0.955, name: '下枋' },
    { h: 0.11, r: 0.905 },        // 下枭 taper in
    { h: 0.17, r: 0.868, name: '束腰' },
    { h: 0.11, r: 0.905 },        // 上枭 flare out
    { h: 0.10, r: 0.962, name: '上枋' },
    { h: 0.08, r: 1.008 },        // 台面挑出
    { h: 0.08, r: 1.008 }
  ];
  let y = 0;
  const rings = [{ y: 0, pts: oct(R * courses[0].r) }];
  courses.forEach((c, i) => {
    y += c.h * H;
    rings.push({ y, pts: oct(R * c.r) });
    if (i < courses.length - 1) rings.push({ y, pts: oct(R * courses[i + 1].r) });
  });
  g.push(loft(rings, { capBottom: true, capTop: true, uvRepeat: 8 }));

  // 束腰 inset panels — one per octagon face, with a carved 壶门 (arched niche)
  const waistY = H * (0.16 + 0.10 + 0.09 + 0.11) + H * 0.17 * 0.5;
  const waistR = R * 0.868;
  const faceW = 2 * waistR * Math.tan(Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const panel = box(faceW * 0.78, H * 0.115, 0.035, 'center');
    xform(panel, {
      p: [Math.sin(a) * (waistR * Math.cos(Math.PI / 8) + 0.012), waistY, Math.cos(a) * (waistR * Math.cos(Math.PI / 8) + 0.012)],
      r: [0, a, 0]
    });
    g.push(panel);
    // 壶门 arch outline as a thin raised bead
    const arch = new THREE.TorusGeometry(H * 0.052, 0.014, 6, 14, Math.PI);
    xform(arch, {
      p: [Math.sin(a) * (waistR * Math.cos(Math.PI / 8) + 0.03), waistY - H * 0.005, Math.cos(a) * (waistR * Math.cos(Math.PI / 8) + 0.03)],
      r: [0, a, 0]
    });
    g.push(arch);
  }
  return { geo: merge(g), height: H, R };
}

/* ---------- 2. 月台 / 踏道 (front stair) --------------------------------- */
export function stairs(R = 3.05, H = 0.92, width = 1.72) {
  const g = [];
  const steps = 6;
  const run = 0.30, rise = H / steps;
  const z0 = R * Math.cos(Math.PI / 8);
  for (let i = 0; i < steps; i++) {
    const s = box(width, rise, run, 'bottom');
    xform(s, { p: [0, i * rise, z0 + run * (steps - i) - run * 0.5] });
    g.push(s);
  }
  // 垂带 (sloping side rails)
  for (const sx of [-1, 1]) {
    const railPts = [
      [0, 0], [run * steps, 0], [run * steps, H + 0.1], [run * steps - 0.34, H + 0.1],
      [0, rise * 1.0]
    ];
    const shape = new THREE.Shape();
    shape.moveTo(railPts[0][0], railPts[0][1]);
    railPts.slice(1).forEach(p => shape.lineTo(p[0], p[1]));
    const rail = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false });
    rail.rotateY(Math.PI / 2);
    xform(rail, { p: [sx * (width / 2 + 0.08), 0, z0 + 0.0], r: [0, 0, 0] });
    // orient: extrude built in XY then rotated so X→Z
    g.push(rail);
  }
  return { geo: merge(g), depth: run * steps };
}

/* ---------- 3. 栏杆 (balustrade) — 望柱 + 寻杖 + 华板 ------------------- */

/** 望柱 — newel post with a lotus-bud cap. */
export function newelPost(h = 0.62) {
  const shaft = box(0.11, h * 0.82, 0.11, 'bottom');
  const neck = lathe([[0.052, 0], [0.062, 0.02], [0.05, 0.05]], 12, { smooth: true });
  neck.translate(0, h * 0.82, 0);
  // 莲瓣柱头
  const capProfile = [
    [0.0, 0], [0.055, 0.012], [0.075, 0.05], [0.068, 0.085],
    [0.045, 0.108], [0.022, 0.126], [0.0, 0.132]
  ];
  const cap = lathe(capProfile, 14, { smooth: true });
  cap.translate(0, h * 0.82 + 0.05, 0);
  return merge([shaft, neck, cap]);
}

/**
 * One balustrade bay between two posts: 寻杖 (top rail), 盆唇, 华板 (panel),
 * 地栿 (bottom rail), with 蜀柱 (mullion).
 */
export function railBay(len, h = 0.62) {
  const g = [];
  const t = 0.075;
  // 寻杖 — rounded top rail
  const top = new THREE.CylinderGeometry(0.045, 0.045, len, 10, 1);
  top.rotateZ(Math.PI / 2);
  top.translate(0, h * 0.80, 0);
  g.push(top);
  // 盆唇 (moulded course under the rail)
  const lip = box(len, 0.05, 0.10, 'center'); xform(lip, { p: [0, h * 0.72, 0] }); g.push(lip);
  // 华板 — pierced panel: frame + geometric lattice bars
  const frameT = 0.038;
  g.push(xform(box(len, frameT, 0.065), { p: [0, h * 0.66, 0] }));
  g.push(xform(box(len, frameT, 0.065), { p: [0, h * 0.30, 0] }));
  const panelH = h * 0.36 - frameT;
  const bars = Math.max(2, Math.round(len / 0.17));
  for (let i = 0; i <= bars; i++) {
    const x = -len / 2 + (i / bars) * len;
    g.push(xform(box(0.028, panelH, 0.05), { p: [x, h * 0.48, 0] }));
  }
  // diagonal 万字 hint: two crossing thin bars per opening
  for (let i = 0; i < bars; i++) {
    const cx = -len / 2 + ((i + 0.5) / bars) * len;
    const w = len / bars * 0.82;
    for (const sgn of [-1, 1]) {
      const d = box(Math.hypot(w, panelH * 0.7), 0.02, 0.038);
      xform(d, { p: [cx, h * 0.48, 0], r: [0, 0, sgn * Math.atan2(panelH * 0.7, w)] });
      g.push(d);
    }
  }
  // 地栿 — sill
  g.push(xform(box(len, 0.07, 0.13), { p: [0, h * 0.245, 0] }));
  return merge(g);
}

/**
 * Build the full octagonal balustrade around a platform of vertex-radius R.
 * `gap` — index of the face left open for the stair (null = closed ring).
 */
export function balustrade(R, { h = 0.62, openFace = 0, inset = 0.14 } = {}) {
  const r = R - inset;
  const verts = oct(r);
  const postGeo = newelPost(h);
  const posts = [];
  const bays = [];
  for (let i = 0; i < 8; i++) {
    posts.push({ p: [verts[i][0], 0, verts[i][1]], r: [0, (i / 8) * TAU, 0] });
  }
  const bayGeos = [];
  for (let i = 0; i < 8; i++) {
    if (i === openFace) continue;
    const a = verts[i], b = verts[(i + 1) % 8];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) - 0.13;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const bg = railBay(len, h);
    xform(bg, { p: [mx, 0, mz], r: [0, ang, 0] });
    bayGeos.push(bg);
  }
  return { postGeo, posts, railGeo: merge(bayGeos), h };
}

/* ---------- 4. 平坐 (mezzanine gallery deck) ---------------------------- */
/**
 * 平坐 — the cantilevered structural deck between storeys, carried on its own
 * ring of short columns and bracket sets. Here: the deck slab + 腰檐 fascia.
 */
export function pingzuoDeck(R, thickness = 0.20) {
  const g = [];
  const rings = [
    { y: 0, pts: oct(R * 0.985) },
    { y: thickness * 0.35, pts: oct(R) },
    { y: thickness * 0.7, pts: oct(R) },
    { y: thickness, pts: oct(R * 0.99) }
  ];
  g.push(loft(rings, { uvRepeat: 8 }));
  // 地面板 planking lines: thin raised battens radiating outward
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    const b = box(0.05, 0.018, R * 1.9, 'center');
    xform(b, { p: [0, thickness, 0], r: [0, a, 0] });
    g.push(b);
  }
  return merge(g);
}

/* ---------- 5. 地面散水 / 基座外围石 ------------------------------------ */
export function apron(R) {
  const rings = [
    { y: 0.0, pts: oct(R * 1.30) },
    { y: 0.055, pts: oct(R * 1.28) },
    { y: 0.055, pts: oct(R * 1.02) },
    { y: 0.02, pts: oct(R * 1.0) }
  ];
  return loft(rings, { uvRepeat: 10 });
}
