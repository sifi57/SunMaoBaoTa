/* ==========================================================================
   frame.js — 柱础 / 柱 / 阑额 / 普拍枋 / 隔扇门窗 / 墙体 / 匾额
   The 柱网 (column grid) and the 额枋 tie-beam layer of a timber frame.
   ========================================================================== */
import * as THREE from 'three';
import { merge, xform, loft, lathe, box, beam, ngon, TAU, DEG } from '../geo/util.js';
import { oct } from './base.js';

/* ---------- 1. 柱础 — column plinth with lotus petals -------------------- */
export function plinth(r = 0.24) {
  const g = [];
  // 方础 square base block
  g.push(box(r * 2.5, 0.09, r * 2.5, 'bottom'));
  // 覆盆 (inverted-basin) with 莲瓣
  const prof = [
    [r * 1.22, 0.09], [r * 1.24, 0.115], [r * 1.16, 0.17],
    [r * 1.02, 0.215], [r * 0.92, 0.245], [r * 0.90, 0.265]
  ];
  g.push(lathe(prof, 16, { smooth: true }));
  // petal tips around the basin
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    const petal = new THREE.SphereGeometry(r * 0.30, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    petal.scale(1, 0.62, 0.72);
    xform(petal, { p: [Math.cos(a) * r * 1.02, 0.145, Math.sin(a) * r * 1.02], r: [0, -a, 0.30] });
    g.push(petal);
  }
  return merge(g);
}

/* ---------- 2. 柱 — column with 卷杀 entasis and 侧脚 ------------------- */
/**
 * A column of height h, base radius r.
 * Real 宋式 columns swell slightly then taper: 收分 ≈ 1/10, with 卷杀 at the top.
 */
export function column(h, r = 0.21, opts = {}) {
  const N = opts.segs || 14;
  const rows = 14;
  const prof = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    // entasis: max belly at ~1/3 height, taper to 0.80r at the head
    const swell = 1 + 0.028 * Math.sin(Math.pow(t, 0.75) * Math.PI);
    let taper = 1 - 0.20 * Math.pow(t, 1.25);
    // 卷杀: last 6% rounds in quickly
    if (t > 0.94) taper *= 1 - 0.55 * Math.pow((t - 0.94) / 0.06, 1.8);
    prof.push([r * swell * taper, t * h]);
  }
  const g = [lathe(prof, N, { smooth: true, uvRepeat: 1 })];
  if (opts.ring !== false) {
    // 箍头 iron bands near base and head
    for (const y of [h * 0.045, h * 0.955]) {
      const band = new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.035, N, 1);
      band.translate(0, y, 0);
      g.push(band);
    }
  }
  return merge(g);
}

/* ---------- 3. 阑额 / 普拍枋 — architrave ring --------------------------- */
/**
 * A closed octagonal ring beam sitting at height y, connecting column heads.
 * `type`: 'lan' (阑额, tall) | 'pupai' (普拍枋, wide flat plate)
 */
export function ringBeam(R, { h = 0.34, w = 0.17, y = 0, tenon = true } = {}) {
  const verts = oct(R);
  const g = [];
  for (let i = 0; i < 8; i++) {
    const a = verts[i], b = verts[(i + 1) % 8];
    const ext = tenon ? 0.05 : 0;
    const dir = new THREE.Vector2(b[0] - a[0], b[1] - a[1]).normalize();
    const A = [a[0] - dir.x * ext, y, a[1] - dir.y * ext];
    const B = [b[0] + dir.x * ext, y, b[1] + dir.y * ext];
    g.push(beam(A, B, w, h));
  }
  return merge(g);
}

/** 普拍枋 — the flat plate above 阑额 (a Liao/Song innovation). */
export function plateBeam(R, { h = 0.11, w = 0.34, y = 0 } = {}) {
  return ringBeam(R, { h, w, y, tenon: true });
}

/* ---------- 4. 由额垫板 / 彩画枋心 -------------------------------------- */
/** Thin panel band for polychrome painting, sits between 阑额 and 柱头. */
export function caihuaBand(R, { h = 0.20, y = 0, w = 0.06 } = {}) {
  const verts = oct(R);
  const g = [];
  for (let i = 0; i < 8; i++) {
    const a = verts[i], b = verts[(i + 1) % 8];
    g.push(beam([a[0], y, a[1]], [b[0], y, b[1]], w, h));
  }
  return merge(g);
}

/* ---------- 5. 隔扇门 / 直棂窗 ------------------------------------------ */
/**
 * 隔扇 (panelled door leaf): 边抹 frame + 棂花心 (lattice, alpha-mapped) +
 * 裙板 (solid lower panel). Returned as separate geometries so the lattice
 * can use its own transparent material.
 */
export function doorLeaf(w, h) {
  const frame = [];
  const t = 0.055, d = 0.075;
  frame.push(xform(box(t, h, d), { p: [-w / 2 + t / 2, h / 2, 0] }));
  frame.push(xform(box(t, h, d), { p: [w / 2 - t / 2, h / 2, 0] }));
  frame.push(xform(box(w, t, d), { p: [0, t / 2, 0] }));
  frame.push(xform(box(w, t, d), { p: [0, h - t / 2, 0] }));
  // 抹头 — two intermediate rails at 0.58h and 0.42h
  frame.push(xform(box(w, t * 0.9, d), { p: [0, h * 0.44, 0] }));
  frame.push(xform(box(w, t * 0.8, d), { p: [0, h * 0.34, 0] }));
  // 裙板 lower solid panel with a raised boss
  frame.push(xform(box(w - t * 2, h * 0.32, 0.035), { p: [0, h * 0.175, 0] }));
  const boss = new THREE.SphereGeometry(Math.min(w, h) * 0.055, 10, 8);
  boss.scale(1, 1, 0.45);
  xform(boss, { p: [0, h * 0.175, 0.024] });
  frame.push(boss);

  // 棂花心 — a single quad carrying the lattice alpha map
  const latticeH = h * 0.54;
  const lat = new THREE.PlaneGeometry(w - t * 2, latticeH);
  lat.translate(0, h * 0.44 + latticeH / 2 + t * 0.5, 0.004);
  // 窗纸 behind the lattice
  const paper = new THREE.PlaneGeometry(w - t * 2, latticeH);
  paper.translate(0, h * 0.44 + latticeH / 2 + t * 0.5, -0.018);

  return { frame: merge(frame), lattice: lat, paper };
}

/**
 * Fill one octagon face with either a door pair or a window.
 * Returns { frame, lattice, paper } already transformed into place.
 */
export function faceInfill(R, faceIndex, { y = 0, h = 2.4, kind = 'door', margin = 0.30 } = {}) {
  const a = (faceIndex / 8) * TAU;
  const apo = R * Math.cos(Math.PI / 8);
  const faceW = 2 * R * Math.sin(Math.PI / 8);
  const openW = faceW - margin * 2;
  const parts = { frame: [], lattice: [], paper: [] };

  if (kind === 'door') {
    const leafW = openW / 2 - 0.012;
    for (const sx of [-1, 1]) {
      const L = doorLeaf(leafW, h);
      const off = sx * (leafW / 2 + 0.012);
      for (const k of ['frame', 'lattice', 'paper']) {
        const gg = L[k];
        xform(gg, { p: [0, 0, 0] });
        // local → face space
        const m = new THREE.Matrix4()
          .makeRotationY(a)
          .multiply(new THREE.Matrix4().makeTranslation(off, y, apo - 0.02));
        gg.applyMatrix4(m);
        parts[k].push(gg);
      }
    }
    // 门框 + 门额 + 门砧
    const jamb = [];
    jamb.push(xform(box(0.10, h + 0.16, 0.16), { p: [-openW / 2 - 0.05, (h + 0.16) / 2, 0] }));
    jamb.push(xform(box(0.10, h + 0.16, 0.16), { p: [openW / 2 + 0.05, (h + 0.16) / 2, 0] }));
    jamb.push(xform(box(openW + 0.2, 0.16, 0.16), { p: [0, h + 0.08, 0] }));
    const jg = merge(jamb);
    jg.applyMatrix4(new THREE.Matrix4().makeRotationY(a)
      .multiply(new THREE.Matrix4().makeTranslation(0, y, apo - 0.02)));
    parts.frame.push(jg);
  } else {
    // 直棂窗 — vertical mullion window, sill at 0.38h.
    // NOTE: wy is LOCAL (relative to the face origin); the storey height y is
    // applied once, by the face matrix below.
    const wy = h * 0.38, wh = h * 0.42;
    const fr = [];
    fr.push(xform(box(openW + 0.14, 0.09, 0.14), { p: [0, wy - 0.045, 0] }));
    fr.push(xform(box(openW + 0.14, 0.09, 0.14), { p: [0, wy + wh + 0.045, 0] }));
    fr.push(xform(box(0.09, wh, 0.14), { p: [-openW / 2 - 0.045, wy + wh / 2, 0] }));
    fr.push(xform(box(0.09, wh, 0.14), { p: [openW / 2 + 0.045, wy + wh / 2, 0] }));
    const bars = Math.max(5, Math.round(openW / 0.13));
    for (let i = 1; i < bars; i++) {
      const x = -openW / 2 + (i / bars) * openW;
      fr.push(xform(box(0.032, wh, 0.055), { p: [x, wy + wh / 2, 0] }));
    }
    const fg = merge(fr);
    fg.applyMatrix4(new THREE.Matrix4().makeRotationY(a)
      .multiply(new THREE.Matrix4().makeTranslation(0, y, apo - 0.02)));
    parts.frame.push(fg);
    const paper = new THREE.PlaneGeometry(openW, wh);
    paper.translate(0, wy + wh / 2, 0);
    paper.applyMatrix4(new THREE.Matrix4().makeRotationY(a)
      .multiply(new THREE.Matrix4().makeTranslation(0, y, apo - 0.055)));
    parts.paper.push(paper);
    // 墙体 below the sill — local height is the sill height itself
    const wall = box(faceW, wy - 0.045, 0.12, 'bottom');
    wall.applyMatrix4(new THREE.Matrix4().makeRotationY(a)
      .multiply(new THREE.Matrix4().makeTranslation(0, y, apo - 0.05)));
    parts.wall = [wall];
  }
  return {
    frame: merge(parts.frame),
    lattice: parts.lattice.length ? merge(parts.lattice) : null,
    paper: parts.paper.length ? merge(parts.paper) : null,
    wall: parts.wall ? merge(parts.wall) : null
  };
}

/* ---------- 6. 墙体 — solid infill for a face --------------------------- */
export function faceWall(R, faceIndex, { y = 0, h = 2.4 } = {}) {
  const a = (faceIndex / 8) * TAU;
  const apo = R * Math.cos(Math.PI / 8);
  const faceW = 2 * R * Math.sin(Math.PI / 8);
  const g = box(faceW * 0.995, h, 0.14, 'bottom');
  g.translate(0, y, 0);
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(a)
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, apo - 0.06)));
  return g;
}

/* ---------- 7. 匾额 — inscribed plaque --------------------------------- */
export function plaque(R, faceIndex, y, text = '') {
  const a = (faceIndex / 8) * TAU;
  const apo = R * Math.cos(Math.PI / 8);
  const w = 1.26, h = 0.52;
  const g = [];
  g.push(box(w, h, 0.07));
  // frame bead
  g.push(xform(box(w + 0.1, 0.05, 0.10), { p: [0, h / 2 + 0.025, 0] }));
  g.push(xform(box(w + 0.1, 0.05, 0.10), { p: [0, -h / 2 - 0.025, 0] }));
  g.push(xform(box(0.05, h + 0.1, 0.10), { p: [-w / 2 - 0.025, 0, 0] }));
  g.push(xform(box(0.05, h + 0.1, 0.10), { p: [w / 2 + 0.025, 0, 0] }));
  const gg = merge(g);
  gg.applyMatrix4(new THREE.Matrix4().makeRotationY(a)
    .multiply(new THREE.Matrix4().makeTranslation(0, y, apo + 0.05)));
  // the text face plane (its own material with rendered characters)
  const face = new THREE.PlaneGeometry(w * 0.94, h * 0.82);
  face.applyMatrix4(new THREE.Matrix4().makeRotationY(a)
    .multiply(new THREE.Matrix4().makeTranslation(0, y, apo + 0.092)));
  return { body: gg, face };
}

/* ---------- 8. 柱网 layout helper --------------------------------------- */
/**
 * Column positions for an octagonal storey. Liao pagodas use a double ring:
 * 外槽 (outer, 8 columns at the corners) + 内槽 (inner ring, 8 columns).
 * `cejiao` — 侧脚, the inward lean of perimeter columns (radians).
 */
export function columnRing(R, count = 8, rot = Math.PI / 8) {
  return ngon(count, R, rot).map(([x, z], i) => ({
    p: [x, 0, z],
    a: Math.atan2(x, z),
    index: i
  }));
}
