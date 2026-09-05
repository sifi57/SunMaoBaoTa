/* ==========================================================================
   roof.js — 攒尖屋顶
   An octagonal pyramidal roof built the way it is actually built:
     椽 (rafters) laid on 檩 (purlins) whose heights are set by 举折
     (the stepped-and-eased rise), then 筒瓦 (barrel tiles) in ranks,
     then 戗脊 (hip ridges) with 翼角起翘 (upturned corner eaves).
   ========================================================================== */
import * as THREE from 'three';
import {
  merge, xform, box, beam, ngon, loft, lathe, sweep, extrude,
  mesh, instances, resample, TAU
} from '../geo/util.js';
import { oct } from './base.js';

/* ==========================================================================
   1. 举折 — the roof section curve
   ==========================================================================
   Song practice: the total rise is set by 举高 (rise/span ratio), then each
   purlin is dropped ("折") below the straight line by a decreasing fraction.
   This produces the concave silhouette unique to Chinese roofs.

   Returns [{ r, y }] from eave (r = Reave) to apex (r ≈ 0).
*/
export function juzhe(Reave, rise, purlins = 5, opts = {}) {
  const bend = opts.bend ?? 0.30;          // how strongly the curve sags
  const pts = [];
  for (let i = 0; i <= purlins; i++) {
    const t = i / purlins;                  // 0 at eave, 1 at apex
    const r = Reave * (1 - t);
    // straight line would be y = rise * t; 折 pulls it DOWN near the eave,
    // so the slope starts shallow and steepens toward the ridge.
    const y = rise * Math.pow(t, 1 + bend * 1.65);
    pts.push({ r, y, t });
  }
  return pts;
}

/* ---------- 2. 翼角起翘 — corner upsweep --------------------------------- */
/**
 * The eave line does not stay level: toward each corner it lifts (起翘) and
 * pushes outward (出翘). Given an angle offset from the nearest hip
 * (0 = at the hip, 1 = mid-bay), return { lift, push }.
 */
function cornerLift(u, liftMax, pushMax) {
  // u ∈ [0,1] measured from mid-bay (0) to hip (1)
  const k = Math.pow(u, 2.6);
  return { lift: liftMax * k, push: pushMax * k };
}

/**
 * Build the eave ring: a closed polyline of N points around the octagon,
 * with corner lift applied. Returns [[x,y,z], ...]
 */
export function eaveRing(Reave, { seg = 12, lift = 0.32, push = 0.16, y0 = 0 } = {}) {
  const pts = [];
  for (let face = 0; face < 8; face++) {
    for (let s = 0; s < seg; s++) {
      const t = s / seg;                         // 0..1 across this face
      const a0 = (face / 8) * TAU, a1 = ((face + 1) / 8) * TAU;
      // interpolate along the straight chord of the face
      const v0 = [Math.sin(a0 + Math.PI / 8) * 0, 0];
      const A = [Math.cos(a0) * Reave, Math.sin(a0) * Reave];
      const B = [Math.cos(a1) * Reave, Math.sin(a1) * Reave];
      let x = A[0] + (B[0] - A[0]) * t;
      let z = A[1] + (B[1] - A[1]) * t;
      // distance from mid-bay → 1 at the corners
      const u = Math.abs(t - 0.5) * 2;
      const { lift: L, push: P } = cornerLift(u, lift, push);
      const len = Math.hypot(x, z) || 1;
      x += (x / len) * P; z += (z / len) * P;
      pts.push([x, y0 + L, z]);
    }
  }
  return pts;
}

/* ---------- 3. 椽 / 檩 — rafters & purlins ------------------------------ */

/** Purlin rings at each 举折 station. */
export function purlins(Reave, curve, { w = 0.13 } = {}) {
  const g = [];
  curve.forEach((c, i) => {
    if (c.r < w * 1.4) return;
    const verts = ngon(8, c.r, Math.PI / 8);
    for (let k = 0; k < 8; k++) {
      const A = verts[k], B = verts[(k + 1) % 8];
      g.push(beam([A[0], c.y, A[1]], [B[0], c.y, B[1]], w, w * 1.35));
    }
  });
  return merge(g);
}

/**
 * 椽 — rafters running from eave to apex, following the 举折 curve.
 * Laid at a constant angular spacing so they fan out over the octagon.
 */
export function rafters(Reave, curve, { count = 96, w = 0.055, apex = 0 } = {}) {
  const g = [];
  const section = [[-w / 2, -w * 0.7], [w / 2, -w * 0.7], [w / 2, w * 0.7], [-w / 2, w * 0.7]];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    // ray from apex outward; radial distance follows the curve
    const path = curve.map(c => [Math.cos(a) * c.r, c.y - w * 0.8, Math.sin(a) * c.r]);
    // extend past the eave to form 出檐 overhang, and add flying rafter angle
    const first = path[0];
    const dir = [Math.cos(a), 0, Math.sin(a)];
    path.unshift([
      first[0] + dir[0] * 0.16, first[1] - 0.055, first[2] + dir[2] * 0.16
    ]);
    g.push(sweep(section, resample(path, 14)));
  }
  return merge(g);
}

/** 飞椽 — the flying rafters that form the outermost eave line. */
export function flyingRafters(Reave, y0, { count = 64, w = 0.05, out = 0.30 } = {}) {
  const g = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const face = Math.floor(((a / TAU) * 8 + 8) % 8);
    const t = ((a / TAU) * 8) % 1;
    const u = Math.abs(t - 0.5) * 2;
    const { lift, push } = cornerLift(u, 0.30, 0.14);
    const r0 = Reave + push;
    const b = box(w, w * 1.2, out, 'center');
    xform(b, {
      p: [Math.cos(a) * (r0 + out * 0.4), y0 + lift - 0.02, Math.sin(a) * (r0 + out * 0.4)],
      r: [-0.22, Math.PI / 2 - a, 0]
    });
    g.push(b);
  }
  return merge(g);
}

/* ---------- 4. 瓦面 — the tiled surface -------------------------------- */

/**
 * The tile skin: one lofted shell per octagon face, following the 举折 curve
 * with the corner lift blended in. This is the mesh that carries the tile
 * texture, so its UVs run V along the slope and U along the eave.
 */
export function tileSkin(Reave, curve, { lift = 0.32, push = 0.16, seg = 14, ranks = 7 } = {}) {
  const g = [];
  const rows = curve.length;
  const posArr = [], uvArr = [], idxArr = [];
  const N = 8 * seg;
  for (let r = 0; r < rows; r++) {
    const c = curve[r];
    const fade = Math.pow(1 - c.t, 1.5);      // corner lift dies out toward apex
    for (let i = 0; i <= N; i++) {
      const ii = i % N;
      const face = Math.floor(ii / seg);
      const t = (ii % seg) / seg;
      const a0 = (face / 8) * TAU, a1 = ((face + 1) / 8) * TAU;
      const A = [Math.cos(a0), Math.sin(a0)], B = [Math.cos(a1), Math.sin(a1)];
      let x = (A[0] + (B[0] - A[0]) * t) * c.r;
      let z = (A[1] + (B[1] - A[1]) * t) * c.r;
      const u = Math.abs(t - 0.5) * 2;
      const { lift: L, push: P } = cornerLift(u, lift * fade, push * fade);
      const len = Math.hypot(x, z) || 1;
      x += (x / len) * P; z += (z / len) * P;
      posArr.push(x, c.y + L, z);
      uvArr.push((i / seg) * (ranks / 1), c.t * 3.2);
    }
  }
  const stride = N + 1;
  for (let r = 0; r < rows - 1; r++) {
    for (let i = 0; i < N; i++) {
      const a = r * stride + i, b = a + 1, cc = (r + 1) * stride + i, d = cc + 1;
      idxArr.push(a, cc, b, b, cc, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
  geo.setIndex(idxArr);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 筒瓦垄 — actual raised barrel-tile ridges. These give the roof its
 * unmistakable corduroy silhouette, which a flat texture cannot fake.
 * One half-cylinder swept from eave to apex, repeated `count` times.
 */
export function barrelRidges(Reave, curve, { count = 56, r = 0.055, lift = 0.32, push = 0.16 } = {}) {
  const g = [];
  // half-round cross-section
  const sec = [];
  const SEGS = 7;
  for (let i = 0; i <= SEGS; i++) {
    const a = Math.PI * (i / SEGS);
    sec.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  sec.push([-r, -r * 0.25], [r, -r * 0.25]);

  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + (TAU / count) * 0.5;
    const face = Math.floor((((a / TAU) * 8) % 8 + 8) % 8);
    const t = ((a / TAU) * 8) % 1;
    const u = Math.abs(t - 0.5) * 2;
    const path = curve.map(c => {
      const fade = Math.pow(1 - c.t, 1.5);
      const { lift: L, push: P } = cornerLift(u, lift * fade, push * fade);
      const rr = c.r + P;
      return [Math.cos(a) * rr, c.y + L + r * 0.35, Math.sin(a) * rr];
    }).filter(p => Math.hypot(p[0], p[2]) > r * 2);
    if (path.length < 3) continue;
    // extend over the eave
    const p0 = path[0];
    const { lift: L0, push: P0 } = cornerLift(u, lift, push);
    path.unshift([Math.cos(a) * (Reave + P0 + 0.20), p0[1] - 0.075, Math.sin(a) * (Reave + P0 + 0.20)]);
    g.push(sweep(sec, resample(path, 16)));
  }
  return merge(g);
}

/** 瓦当 — the round tile-end discs along the eave, and 滴水 drip tiles. */
export function tileEnds(Reave, y0, { count = 56, r = 0.062, lift = 0.32, push = 0.16 } = {}) {
  const discs = [], drips = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + (TAU / count) * 0.5;
    const t = ((a / TAU) * 8) % 1;
    const u = Math.abs(t - 0.5) * 2;
    const { lift: L, push: P } = cornerLift(u, lift, push);
    const rr = Reave + P + 0.21;
    discs.push({
      p: [Math.cos(a) * rr, y0 + L - 0.072, Math.sin(a) * rr],
      r: [0.28, Math.PI / 2 - a, 0]
    });
    // 滴水 sits between two 瓦当, pointed downward
    const a2 = a + (TAU / count) * 0.5;
    const u2 = Math.abs((((a2 / TAU) * 8) % 1) - 0.5) * 2;
    const c2 = cornerLift(u2, lift, push);
    const rr2 = Reave + c2.push + 0.225;
    drips.push({
      p: [Math.cos(a2) * rr2, y0 + c2.lift - 0.105, Math.sin(a2) * rr2],
      r: [0.30, Math.PI / 2 - a2, 0]
    });
  }
  // 瓦当 disc geometry: a round face with a raised boss
  const disc = merge([
    new THREE.CylinderGeometry(r, r, 0.022, 12).rotateX(Math.PI / 2),
    (() => { const b = new THREE.SphereGeometry(r * 0.32, 8, 6); b.translate(0, 0, 0.016); return b; })()
  ]);
  // 滴水 — a downward-pointing shield
  const drip = extrude([
    [-r, 0], [r, 0], [r * 0.82, -r * 0.9], [0, -r * 1.25], [-r * 0.82, -r * 0.9]
  ], 0.02);
  return { disc, discs, drip, drips };
}

/* ---------- 5. 戗脊 — hip ridges --------------------------------------- */
/**
 * The eight hip ridges from the apex down to each corner, ending in an
 * upturned tip. Built as a swept trapezoid section, capped with 脊瓦.
 */
export function hipRidges(Reave, curve, { lift = 0.32, push = 0.16, w = 0.14, h = 0.19 } = {}) {
  const g = [];
  const sec = [
    [-w / 2, 0], [w / 2, 0], [w / 2, h * 0.55],
    [w * 0.30, h * 0.86], [0, h], [-w * 0.30, h * 0.86], [-w / 2, h * 0.55]
  ];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;          // hips sit at the octagon vertices
    const path = curve.map(c => {
      const fade = Math.pow(1 - c.t, 1.5);
      const rr = c.r + push * fade;
      return [Math.cos(a) * rr, c.y + lift * fade + 0.03, Math.sin(a) * rr];
    }).filter(p => Math.hypot(p[0], p[2]) > 0.04).reverse();  // apex → eave
    // the 起翘 tip: sweep up and out past the eave
    const last = path[path.length - 1];
    const dir = [Math.cos(a), Math.sin(a)];
    path.push([last[0] + dir[0] * 0.20, last[1] + 0.02, last[2] + dir[1] * 0.20]);
    path.push([last[0] + dir[0] * 0.36, last[1] + 0.14, last[2] + dir[1] * 0.36]);
    path.push([last[0] + dir[0] * 0.44, last[1] + 0.30, last[2] + dir[1] * 0.44]);
    g.push(sweep(sec, resample(path, 26)));
  }
  return merge(g);
}

/** 套兽 / 嘲风 — the beast that caps each hip tip. */
export function hipBeast(scale = 1) {
  const g = [];
  // stylised crouching beast: body + head + curled tail + mane ridge
  const body = new THREE.SphereGeometry(0.10, 10, 8);
  body.scale(1.5, 0.95, 0.9); body.translate(0, 0.10, 0);
  g.push(body);
  const chest = new THREE.SphereGeometry(0.075, 10, 8);
  chest.scale(1.1, 1.2, 1.0); chest.translate(0.10, 0.13, 0);
  g.push(chest);
  const head = new THREE.SphereGeometry(0.062, 10, 8);
  head.scale(1.25, 1.0, 0.95); head.translate(0.19, 0.21, 0);
  g.push(head);
  // snout
  const snout = new THREE.ConeGeometry(0.036, 0.075, 8);
  snout.rotateZ(-Math.PI / 2); snout.translate(0.255, 0.195, 0);
  g.push(snout);
  // horns / ears
  for (const sz of [-1, 1]) {
    const horn = new THREE.ConeGeometry(0.018, 0.062, 6);
    xform(horn, { p: [0.168, 0.272, sz * 0.036], r: [0, 0, -0.4] });
    g.push(horn);
  }
  // mane spikes along the back
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.ConeGeometry(0.020, 0.055, 6);
    xform(sp, { p: [0.10 - i * 0.048, 0.20 - i * 0.006, 0], r: [0, 0, 0.30 + i * 0.05] });
    g.push(sp);
  }
  // curled tail
  const tail = new THREE.TorusGeometry(0.055, 0.019, 6, 12, Math.PI * 1.5);
  xform(tail, { p: [-0.15, 0.16, 0], r: [Math.PI / 2, 0, 0.5] });
  g.push(tail);
  // legs
  for (const sx of [0.10, -0.08]) for (const sz of [-0.055, 0.055]) {
    const leg = new THREE.CylinderGeometry(0.024, 0.020, 0.10, 6);
    leg.translate(sx, 0.05, sz);
    g.push(leg);
  }
  const out = merge(g);
  out.scale(scale, scale, scale);
  return out;
}

/* ---------- 6. 风铃 — wind bells at the eave corners ------------------- */
export function windBell(s = 1) {
  const g = [];
  const prof = [
    [0.0, 0.13], [0.030, 0.128], [0.036, 0.10], [0.044, 0.055],
    [0.052, 0.018], [0.055, 0.0], [0.048, 0.0]
  ];
  g.push(lathe(prof, 12, { smooth: true }));
  // 铃舌 clapper
  const cl = new THREE.SphereGeometry(0.016, 8, 6);
  cl.translate(0, -0.012, 0);
  g.push(cl);
  // hanging loop
  const loop = new THREE.TorusGeometry(0.016, 0.005, 6, 10);
  loop.rotateY(Math.PI / 2); loop.translate(0, 0.145, 0);
  g.push(loop);
  const out = merge(g);
  out.scale(s, s, s);
  return out;
}

/* ---------- 7. 檐下 — 望板 (roof boards) & связ ------------------------- */
/** 望板 — the sheathing boards visible under the eave overhang. */
export function eaveSoffit(Reave, y0, { lift = 0.32, push = 0.16, out = 0.34 } = {}) {
  const inner = [], outer = [];
  const N = 8 * 12;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    const t = ((a / TAU) * 8) % 1;
    const u = Math.abs(t - 0.5) * 2;
    const { lift: L, push: P } = cornerLift(u, lift, push);
    inner.push([Math.cos(a) * (Reave + P), y0 + L - 0.05, Math.sin(a) * (Reave + P)]);
    outer.push([Math.cos(a) * (Reave + P + out), y0 + L - 0.12, Math.sin(a) * (Reave + P + out)]);
  }
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    pos.push(...inner[i]); uv.push(i / 12, 0);
    pos.push(...outer[i]); uv.push(i / 12, 1);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ==========================================================================
   8. FULL ROOF ASSEMBLY
   ========================================================================== */
/**
 * Build a complete octagonal roof.
 * @param Reave  eave radius (to the octagon vertex)
 * @param rise   total height from eave line to apex
 * @param M      material set
 * @param opts   { lift, push, ridges, bells, structural }
 */
export function roof(Reave, rise, M, opts = {}) {
  const {
    lift = 0.30, push = 0.14, ranks = 54, purlinCount = 6,
    structural = true, bells = true, beasts = true, glazed = false,
    apexR = 0.22
  } = opts;
  const G = new THREE.Group();
  G.name = 'roof';
  const curve = juzhe(Reave, rise, purlinCount, { bend: 0.32 });
  // keep a small flat at the apex so the finial has something to sit on
  curve[curve.length - 1].r = apexR;

  const tileMat = glazed ? M.glazed : M.tile;

  if (structural) {
    G.add(mesh(purlins(Reave, curve, { w: 0.115 }), M.woodBare, '檩'));
    G.add(mesh(rafters(Reave, curve, { count: 72, w: 0.052 }), M.woodBare, '椽'));
    G.add(mesh(flyingRafters(Reave, curve[0].y, { count: 56, out: 0.30 }), M.woodRed, '飞椽'));
    G.add(mesh(eaveSoffit(Reave, curve[0].y, { lift, push }), M.woodRed, '望板'));
  }
  // tile shell
  const skin = mesh(tileSkin(Reave, curve, { lift, push, ranks: ranks / 2 }), tileMat, '瓦面');
  G.add(skin);
  G.add(mesh(barrelRidges(Reave, curve, { count: ranks, lift, push, r: 0.052 }), tileMat, '筒瓦'));
  // eave tile ends
  const te = tileEnds(Reave, curve[0].y, { count: ranks, lift, push });
  G.add(instances(te.disc, glazed ? M.glazed : M.goldDull, te.discs));
  G.add(instances(te.drip, tileMat, te.drips));
  // hips
  G.add(mesh(hipRidges(Reave, curve, { lift, push }), tileMat, '戗脊'));

  if (beasts) {
    const beastTf = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const rr = Reave + push + 0.44;
      beastTf.push({
        p: [Math.cos(a) * rr, curve[0].y + lift + 0.30, Math.sin(a) * rr],
        r: [0, Math.PI / 2 - a, 0], s: 0.85
      });
    }
    G.add(instances(hipBeast(1), glazed ? M.glazed : M.bronze, beastTf));
  }

  if (bells) {
    const bellTf = [], chainTf = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const rr = Reave + push + 0.40;
      const y = curve[0].y + lift + 0.16;
      bellTf.push({ p: [Math.cos(a) * rr, y - 0.20, Math.sin(a) * rr] });
      chainTf.push({ p: [Math.cos(a) * rr, y - 0.07, Math.sin(a) * rr], s: [1, 1, 1] });
    }
    const bellMesh = instances(windBell(1), M.bronze, bellTf);
    bellMesh.name = 'bells';
    G.add(bellMesh);
    const chain = new THREE.CylinderGeometry(0.005, 0.005, 0.14, 5);
    G.add(instances(chain, M.bronze, chainTf));
  }

  G.userData.curve = curve;
  G.userData.apexY = curve[curve.length - 1].y;
  G.userData.eaveY = curve[0].y;
  return G;
}
