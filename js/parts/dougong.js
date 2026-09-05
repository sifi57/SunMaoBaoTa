/* ==========================================================================
   dougong.js — 斗拱
   A full 五铺作双抄 (five-step, double-cantilever) bracket set, modelled
   member by member per 《营造法式》 proportions.

   材 (cai) is the module: everything derives from it.
     1 材 = 15 分° high × 10 分° wide      (分° = fen, the sub-module)
     1 栔 (qi) = 6 分°                     (the gap between stacked 拱)
     足材 = 21 分° (材 + 栔)
   ========================================================================== */
import * as THREE from 'three';
import { merge, xform, box, extrude, lathe, loft, ngon, mesh, TAU } from '../geo/util.js';

/* ---------- module system ------------------------------------------------ */

/** Create a 材 scale. `cai` = height of one 材 in world units. */
export function caiScale(cai) {
  const fen = cai / 15;          // 1 分°
  return {
    cai, fen,
    w: 10 * fen,                 // 拱宽 (single 材 width)
    h: 15 * fen,                 // 单材高
    qi: 6 * fen,                 // 栔
    zucai: 21 * fen,             // 足材高
    f: n => n * fen              // shorthand: f(30) = 30 分°
  };
}

/* ---------- 1. 斗 (blocks) ---------------------------------------------- */
/**
 * A 斗 block: 斗底 (tapered foot) + 斗腰 (waist) + 斗耳 (ears with a cross slot).
 * Standard 栌斗 (bottom block) is 32分° square × 20分° high.
 *   ear 8分°, waist 4分°, foot 8分°
 */
export function dou(S, {
  size = 32, height = 20, earH = 8, waistH = 4,
  slotW = 10, cross = true, taper = 0.78
} = {}) {
  const g = [];
  const s = S.f(size), H = S.f(height);
  const eh = S.f(earH), wh = S.f(waistH), fh = H - eh - wh;
  const half = s / 2;

  // 斗底 — tapered foot (斗底四边内颰)
  g.push(loft([
    { y: 0, pts: [[half * taper, -half * taper], [half * taper, half * taper], [-half * taper, half * taper], [-half * taper, -half * taper]] },
    { y: fh * 0.72, pts: [[half * 0.94, -half * 0.94], [half * 0.94, half * 0.94], [-half * 0.94, half * 0.94], [-half * 0.94, -half * 0.94]] },
    { y: fh, pts: [[half, -half], [half, half], [-half, half], [-half, -half]] }
  ], { uvRepeat: 4 }));

  // 斗腰 — plain waist band
  g.push(xform(box(s, wh, s), { p: [0, fh + wh / 2, 0] }));

  // 斗耳 — the ears: full block minus the cross-shaped slot.
  const sw = S.f(slotW);
  const earY = fh + wh + eh / 2;
  const armW = (s - sw) / 2;
  if (cross) {
    // four corner ears (cross slot in both directions)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.push(xform(box(armW, eh, armW), {
        p: [sx * (sw / 2 + armW / 2), earY, sz * (sw / 2 + armW / 2)]
      }));
    }
  } else {
    // slot in X only → two ears on ±Z
    for (const sz of [-1, 1]) {
      g.push(xform(box(s, eh, armW), { p: [0, earY, sz * (sw / 2 + armW / 2)] }));
    }
  }
  return merge(g);
}

/** 栌斗 — the great bottom block on the column head. */
export function ludou(S) { return dou(S, { size: 32, height: 20, slotW: 10 }); }
/** 交互斗 — carries a 拱 crossing above a 华拱 head. */
export function jiaohudou(S) { return dou(S, { size: 18, height: 10, earH: 4, waistH: 2, slotW: 10 }); }
/** 散斗 — small block at a 拱 end. */
export function sandou(S) { return dou(S, { size: 16, height: 10, earH: 4, waistH: 2, slotW: 10, cross: false }); }
/** 齊心斗 — centre block on a 拱. */
export function qixindou(S) { return dou(S, { size: 16, height: 10, earH: 4, waistH: 2, slotW: 10 }); }

/* ---------- 2. 拱 (bracket arms) with 卷杀 ------------------------------ */

/**
 * The side silhouette of a 拱. This is the signature curve of Chinese
 * carpentry: the arm's underside sweeps up to the tip in `leaves` (瓣)
 * straight facets — 卷杀.
 *
 * L      total length (分°)
 * H      height (材 or 足材)
 * leaves number of 瓣 (华拱 4, 泥道拱 4, 令拱 5, 慢拱 4)
 * tipH   height at the extreme tip
 * run    horizontal length consumed by the 卷杀
 */
function gongSilhouette(S, L, H, leaves, tipH, run) {
  const half = S.f(L) / 2, h = H, th = S.f(tipH), rn = S.f(run);
  const pts = [];
  // bottom: straight, with the 拱眼 slight hollow omitted for solidity
  pts.push([-half, 0]);
  pts.push([half, 0]);
  // right 卷杀 — climb in `leaves` facets from tip height to full height
  for (let i = 0; i <= leaves; i++) {
    const t = i / leaves;
    // each facet's outer corner: x pulls in, y climbs
    const x = half - rn * t;
    const y = th + (h - th) * Math.sin(t * Math.PI / 2);
    if (i === 0) pts.push([x, th]);
    else { pts.push([x + rn / leaves * 0.0, y]); }
  }
  pts.push([half - rn, h]);
  pts.push([-half + rn, h]);
  // left 卷杀 (mirror)
  for (let i = leaves; i >= 0; i--) {
    const t = i / leaves;
    const x = -half + rn * t;
    const y = th + (h - th) * Math.sin(t * Math.PI / 2);
    pts.push([x, y]);
  }
  pts.push([-half, th]);
  return pts;
}

/**
 * Build a 拱 as a solid: extruded silhouette + the 斗口 slot notches.
 * `zucai` — use 足材 height (21分°) instead of 单材 (15分°).
 */
export function gong(S, {
  L = 72, leaves = 4, tipH = 6, run = 9, zucai = false, w = 10, notch = null
} = {}) {
  const H = zucai ? S.zucai : S.h;
  const sil = gongSilhouette(S, L, H, leaves, tipH, run);
  const g = extrude(sil, S.f(w), { curveSegments: 1 });
  const parts = [g];
  return merge(parts);
}

/** 华拱 — the arm projecting outward (perpendicular to the wall plane). */
export function huagong(S, step = 1) {
  // 第一跳 62分°, 第二跳 also 62分° but rides higher
  return gong(S, { L: 72, leaves: 4, tipH: 6, run: 9, zucai: true });
}
/** 泥道拱 — the arm in the wall plane, at the bottom. */
export function nidaogong(S) { return gong(S, { L: 62, leaves: 4, tipH: 6, run: 9 }); }
/** 瓜子拱 — in-plane arm at an intermediate step. */
export function guazigong(S) { return gong(S, { L: 62, leaves: 4, tipH: 6, run: 9 }); }
/** 慢拱 — the long in-plane arm above 瓜子拱 / 泥道拱. */
export function mangong(S) { return gong(S, { L: 92, leaves: 4, tipH: 6, run: 10 }); }
/** 令拱 — the topmost in-plane arm, carrying 襯枋头 / 撩檐枋. */
export function linggong(S) { return gong(S, { L: 72, leaves: 5, tipH: 6, run: 11 }); }

/* ---------- 3. 昂 — the slanted cantilever ------------------------------ */
/**
 * 下昂 (descending cantilever). Its head is cut to a 批竹 or 琴面 profile.
 * The member slopes down-and-out at about 1:3 … 1:4.
 * Built in local space: origin at the tail, +Z is outward.
 */
export function ang(S, { L = 96, slope = 0.30, style = 'pizhu' } = {}) {
  const len = S.f(L);
  const H = S.zucai;
  // side profile in XY: X = outward run, Y = height (tail at right/high)
  const drop = len * slope;
  const pts = [];
  if (style === 'pizhu') {
    // 批竹昂 — a straight chamfered blade
    pts.push([0, 0]);                       // nose bottom
    pts.push([len * 0.14, H * 0.06]);
    pts.push([len, drop + H * 0.10]);       // tail bottom
    pts.push([len, drop + H]);              // tail top
    pts.push([len * 0.30, H * 0.92]);       // top edge running to the nose
    pts.push([len * 0.05, H * 0.40]);       // the chamfer face
  } else {
    // 琴面昂 — a subtly convex "lute-face" nose
    pts.push([0, H * 0.06]);
    pts.push([len * 0.10, 0]);
    pts.push([len, drop + H * 0.10]);
    pts.push([len, drop + H]);
    pts.push([len * 0.34, H * 0.95]);
    pts.push([len * 0.16, H * 0.68]);
    pts.push([len * 0.04, H * 0.34]);
  }
  const g = extrude(pts, S.f(10), { curveSegments: 2 });
  // rotate so it points along -Z outward and slopes down
  g.rotateY(-Math.PI / 2);
  return g;
}

/** 耍头 — the "playful head", a squared beam-end above the top 昂. */
export function shuatou(S, { L = 58 } = {}) {
  const len = S.f(L), H = S.zucai;
  const pts = [
    [0, H * 0.16], [len * 0.18, 0], [len, 0], [len, H], [len * 0.30, H], [0, H * 0.72]
  ];
  const g = extrude(pts, S.f(10), { curveSegments: 1 });
  g.rotateY(-Math.PI / 2);
  return g;
}

/** 襯枋头 — the plate-end above 耍头. */
export function chenfangtou(S, { L = 46 } = {}) {
  const g = box(S.f(10), S.h, S.f(L), 'center');
  return g;
}

/* ---------- 4. 罗汉枋 / 撩檐枋 — the longitudinal plates ---------------- */
/** A straight length of 枋 running in the wall plane. */
export function fang(S, len, { zucai = false, w = 10 } = {}) {
  return box(S.f(w), zucai ? S.zucai : S.h, len, 'center');
}

/* ==========================================================================
   5. THE ASSEMBLY — 柱头铺作 五铺作双抄计心造
   Returns a THREE.Group whose children are named after the real members, so
   the game can reveal them one at a time.
   ========================================================================== */

/**
 * @param S       cai scale
 * @param M       material set
 * @param opts.jump  number of outward steps (跳): 2 = 五铺作
 * @param opts.corner  true → 转角铺作 (add the 45° diagonal arms)
 */
export function bracketSet(S, M, opts = {}) {
  const { jump = 2, corner = false, ang: useAng = false } = opts;
  const G = new THREE.Group();
  G.name = 'dougong';
  const add = (geo, mat, name, tf) => {
    if (tf) xform(geo, tf);
    const m = mesh(geo, mat, name);
    G.add(m);
    return m;
  };

  const F = S.f.bind(S);
  const step = F(30);            // 每跳 30分°
  const wood = M.dougong;
  const woodB = M.woodBare;

  /* --- 栌斗 on the column head --- */
  const ld = ludou(S);
  add(ld, wood, '栌斗');
  const ldTop = F(20);

  /* --- 第一层: 华拱(第一跳) + 泥道拱 --- */
  const hg1 = huagong(S);
  // 华拱 runs outward → rotate so its length lies along Z
  hg1.rotateY(Math.PI / 2);
  add(hg1, wood, '华拱·第一跳', { p: [0, ldTop, step * 0.5 - F(8)] });

  const nd = nidaogong(S);
  add(nd, wood, '泥道拱', { p: [0, ldTop, 0] });

  /* --- 第一跳跳头: 交互斗 + 瓜子拱 + (慢拱) --- */
  const jhd1 = jiaohudou(S);
  const lift1 = ldTop + S.zucai;
  add(jhd1, wood, '交互斗·一', { p: [0, lift1, step] });

  const gz1 = guazigong(S);
  add(gz1, wood, '瓜子拱·一', { p: [0, lift1 + F(10), step] });

  /* --- 泥道拱上: 慢拱 --- */
  const mg1 = mangong(S);
  add(mg1, wood, '慢拱', { p: [0, ldTop + S.h + S.qi, 0] });
  // 散斗 on 泥道拱 ends
  for (const sx of [-1, 1]) {
    add(sandou(S), wood, `散斗·泥道${sx > 0 ? '右' : '左'}`, { p: [sx * F(24), ldTop + S.h, 0] });
  }
  add(qixindou(S), wood, '齊心斗·泥道', { p: [0, ldTop + S.h, 0] });

  /* --- 第二跳: 华拱二 or 下昂 --- */
  const lift2 = lift1 + F(10) + S.h;
  if (useAng) {
    const a = ang(S, { L: 96, slope: 0.26, style: 'qinmian' });
    add(a, woodB, '下昂', { p: [0, lift2 - F(4), step * 0.35] });
  } else {
    const hg2 = huagong(S);
    hg2.rotateY(Math.PI / 2);
    add(hg2, wood, '华拱·第二跳', { p: [0, lift2, step * 1.5 - F(8)] });
  }

  /* --- 第二跳跳头: 交互斗 + 令拱 --- */
  const lift3 = lift2 + S.zucai;
  add(jiaohudou(S), wood, '交互斗·二', { p: [0, lift3, step * 2] });
  const lg = linggong(S);
  add(lg, wood, '令拱', { p: [0, lift3 + F(10), step * 2] });
  for (const sx of [-1, 1]) {
    add(sandou(S), wood, `散斗·令拱${sx > 0 ? '右' : '左'}`, { p: [sx * F(30), lift3 + F(10) + S.h, step * 2] });
  }
  add(qixindou(S), wood, '齊心斗·令拱', { p: [0, lift3 + F(10) + S.h, step * 2] });

  /* --- 瓜子拱上的慢拱 + 罗汉枋 (第一跳) --- */
  add(mangong(S), wood, '慢拱·一跳', { p: [0, lift1 + F(10) + S.h + S.qi, step] });

  /* --- 耍头 + 襯枋头 --- */
  const st = shuatou(S);
  add(st, woodB, '耍头', { p: [0, lift3 + F(10) + S.h, step * 1.2] });

  /* --- 转角铺作: 45° diagonal arms --- */
  if (corner) {
    for (const sgn of [1]) {
      const dhg = huagong(S);
      dhg.rotateY(Math.PI / 4);
      add(dhg, wood, '角华拱', {
        p: [step * 0.55, ldTop, step * 0.55]
      });
      const dhg2 = huagong(S);
      dhg2.rotateY(Math.PI / 4);
      add(dhg2, wood, '角华拱·二', { p: [step * 1.25, lift2, step * 1.25] });
      add(jiaohudou(S), wood, '角交互斗', { p: [step * 0.72, lift1, step * 0.72] });
    }
  }

  G.userData.reach = step * jump;      // how far the set cantilevers out
  G.userData.top = lift3 + F(10) + S.h + S.h;
  return G;
}

/**
 * A merged, single-mesh version of the bracket set — for instancing the
 * dozens of sets around the pagoda without killing the frame rate.
 * Returns { wood: geometry, bare: geometry, reach, top }
 */
export function bracketSetMerged(S, opts = {}) {
  const M = { dougong: 'A', woodBare: 'B' };
  const G = bracketSet(S, M, opts);
  const woodG = [], bareG = [];
  G.children.forEach(c => {
    const g = c.geometry.clone();
    g.applyMatrix4(c.matrix.clone().premultiply(new THREE.Matrix4().identity()));
    g.applyMatrix4(new THREE.Matrix4().compose(c.position, c.quaternion, c.scale));
    (c.material === 'B' ? bareG : woodG).push(g);
  });
  const out = {
    wood: merge(woodG), bare: bareG.length ? merge(bareG) : null,
    reach: G.userData.reach, top: G.userData.top
  };
  G.children.forEach(c => c.geometry.dispose());
  return out;
}

/* ---------- 6. 补间铺作 vs 柱头铺作 ------------------------------------- */
/**
 * Lay bracket sets around an octagonal storey:
 *   - one 柱头铺作 on every column head (8)
 *   - `perBay` 补间铺作 between them
 * Returns transforms suitable for InstancedMesh.
 */
export function bracketLayout(R, { perBay = 1, y = 0 } = {}) {
  const out = { column: [], intermediate: [], corner: [] };
  const verts = ngon(8, R, Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    out.corner.push({ p: [verts[i][0], y, verts[i][1]], r: [0, a + Math.PI / 8, 0], face: i });
    // 补间 sets sit on the 阑额 between two columns
    const A = verts[i], B = verts[(i + 1) % 8];
    for (let k = 1; k <= perBay; k++) {
      const t = k / (perBay + 1);
      const x = A[0] + (B[0] - A[0]) * t, z = A[1] + (B[1] - A[1]) * t;
      const fa = Math.atan2(x, z);
      out.intermediate.push({ p: [x, y, z], r: [0, fa, 0], face: i });
    }
  }
  return out;
}
