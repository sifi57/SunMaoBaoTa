/* ==========================================================================
   util.js — 营造几何工具库
   Procedural geometry helpers for Chinese timber architecture.
   All units are "design units" ≈ metres of the real building.
   ========================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

/* ---------- merging ------------------------------------------------------ */

export function merge(geoms) {
  let list = geoms.filter(Boolean);
  if (list.length === 0) return null;

  // Normalise every geometry to the SAME attribute set and the same
  // indexed/non-indexed state — mergeGeometries refuses mixed input and
  // would otherwise return null.
  const clean = (g) => {
    g.deleteAttribute('uv1');
    g.deleteAttribute('uv2');
    g.deleteAttribute('color');
    g.deleteAttribute('tangent');
    g.morphAttributes = {};
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  };
  list.forEach(clean);
  if (list.length === 1) return list[0];

  // If the batch is mixed, drop everything to non-indexed (cheapest common
  // denominator, and correct for the flat-shaded look we want anyway).
  const anyIndexed = list.some(g => g.index);
  const allIndexed = list.every(g => g.index);
  if (anyIndexed && !allIndexed) {
    list = list.map(g => {
      if (!g.index) return g;
      const ni = g.toNonIndexed();
      g.dispose();
      return clean(ni);
    });
  }

  const out = mergeGeometries(list, false);
  if (!out) {
    console.error('[merge] mergeGeometries returned null',
      list.map(g => ({ v: g.attributes.position.count, idx: !!g.index, attrs: Object.keys(g.attributes) })));
    return list[0];
  }
  for (const g of list) g.dispose();
  return out;
}

/** Apply a transform (pos / rot euler / scale) to a geometry, in place. */
export function xform(geo, { p, r, s } = {}) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (r) q.setFromEuler(new THREE.Euler(r[0] || 0, r[1] || 0, r[2] || 0, 'YXZ'));
  m.compose(
    new THREE.Vector3(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0),
    q,
    Array.isArray(s) ? new THREE.Vector3(s[0], s[1], s[2])
      : new THREE.Vector3(s ?? 1, s ?? 1, s ?? 1)
  );
  geo.applyMatrix4(m);
  return geo;
}

/* ---------- primitives -------------------------------------------------- */

/** Axis-aligned box centred on (0,0,0) unless anchored. anchor: 'bottom'|'center' */
export function box(w, h, d, anchor = 'center') {
  const g = new THREE.BoxGeometry(w, h, d);
  if (anchor === 'bottom') g.translate(0, h / 2, 0);
  return g;
}

/** A beam from point A to point B with rectangular cross-section w×h. */
export function beam(a, b, w, h) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.BoxGeometry(len, h, w);
  g.translate(len / 2, 0, 0);
  const mid = va.clone();
  const dir = vb.clone().sub(va).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  g.applyQuaternion(q);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/* ---------- rings & lofting --------------------------------------------- */

/** Regular n-gon ring of [x,z] pairs. rot in radians. */
export function ngon(n, radius, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return pts;
}

/** Square ring (4 pts) of half-extent hx, hz. */
export function quadRing(hx, hz = hx) {
  return [[hx, hz], [-hx, hz], [-hx, -hz], [-hx, hz * 0 - hz]].slice(0, 3).concat([[hx, -hz]]);
}

/** Proper square ring, CCW. */
export function sq(hx, hz = hx) {
  return [[hx, -hz], [hx, hz], [-hx, hz], [-hx, -hz]];
}

/**
 * Loft a stack of rings into a closed solid.
 * rings: [{ y, pts:[[x,z],...], uvV? }] — every ring must have the same point count.
 * opts: { capBottom, capTop, smooth, uvScale }
 */
export function loft(rings, opts = {}) {
  const { capBottom = true, capTop = true, smooth = false, uvRepeat = 1 } = opts;
  const n = rings[0].pts.length;
  const rows = rings.length;
  const pos = [], uv = [], idx = [];

  // side wall — duplicate rows so we can control smoothing per-column
  for (let r = 0; r < rows; r++) {
    const ring = rings[r];
    for (let i = 0; i <= n; i++) {
      const p = ring.pts[i % n];
      pos.push(p[0], ring.y, p[1]);
      uv.push((i / n) * uvRepeat, ring.uvV !== undefined ? ring.uvV : r / (rows - 1 || 1));
    }
  }
  const stride = n + 1;
  for (let r = 0; r < rows - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * stride + i, b = a + 1, c = (r + 1) * stride + i, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();

  const parts = [g];
  if (capBottom) parts.push(capFan(rings[0].pts, rings[0].y, true));
  if (capTop) parts.push(capFan(rings[rows - 1].pts, rings[rows - 1].y, false));
  const outG = merge(parts);
  if (!smooth) {
    const flat = outG.toNonIndexed();
    flat.computeVertexNormals();
    outG.dispose();
    return flat;
  }
  return outG;
}

/** Triangle-fan cap for a convex ring. */
export function capFan(pts, y, down) {
  const n = pts.length;
  let cx = 0, cz = 0;
  for (const p of pts) { cx += p[0]; cz += p[1]; }
  cx /= n; cz /= n;
  const pos = [cx, y, cz], uv = [0.5, 0.5], idx = [];
  let rmax = 0.0001;
  for (const p of pts) rmax = Math.max(rmax, Math.hypot(p[0] - cx, p[1] - cz));
  for (let i = 0; i < n; i++) {
    pos.push(pts[i][0], y, pts[i][1]);
    uv.push(0.5 + (pts[i][0] - cx) / rmax * 0.5, 0.5 + (pts[i][1] - cz) / rmax * 0.5);
  }
  for (let i = 0; i < n; i++) {
    const a = 1 + i, b = 1 + ((i + 1) % n);
    if (down) idx.push(0, a, b); else idx.push(0, b, a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Scale a ring of [x,z] about origin. */
export function scaleRing(pts, k) { return pts.map(p => [p[0] * k, p[1] * k]); }

/** Offset a convex ring outward by distance d (along vertex normal from origin). */
export function growRing(pts, d) {
  return pts.map(p => {
    const l = Math.hypot(p[0], p[1]) || 1;
    return [p[0] + (p[0] / l) * d, p[1] + (p[1] / l) * d];
  });
}

/* ---------- lathe (revolved profile) ------------------------------------ */

/**
 * Revolve a 2D profile [[radius, y], ...] about the Y axis.
 * segs — radial segments. If `sides` given, revolve as a polygon (faceted).
 */
export function lathe(profile, segs = 24, opts = {}) {
  const rings = profile.map(([r, y], i) => ({
    y,
    pts: ngon(segs, Math.max(r, 1e-5), opts.rot || 0),
    uvV: i / (profile.length - 1 || 1)
  }));
  return loft(rings, {
    capBottom: profile[0][0] > 1e-4,
    capTop: profile[profile.length - 1][0] > 1e-4,
    smooth: opts.smooth !== false,
    uvRepeat: opts.uvRepeat || 1
  });
}

/* ---------- extrusion of a side profile --------------------------------- */

/**
 * Extrude a 2D shape (in XY) along Z by `depth`, centred on Z.
 * pts: array of [x,y] describing a closed CCW polygon.
 */
export function extrude(pts, depth, opts = {}) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: !!opts.bevel,
    bevelSize: opts.bevelSize || 0.01, bevelThickness: opts.bevelSize || 0.01,
    bevelSegments: 1, curveSegments: opts.curveSegments || 4
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/* ---------- sweeping a cross-section along a 3D path -------------------- */

/**
 * Sweep a 2D cross-section along a 3D polyline.
 * section: [[u, v], ...]  closed profile in the frame (u = right, v = up)
 * path:    [[x,y,z], ...]
 * up:      global up hint, default +Y
 */
export function sweep(section, path, up = [0, 1, 0]) {
  const n = section.length, m = path.length;
  const P = path.map(p => new THREE.Vector3(...p));
  const U = new THREE.Vector3(...up).normalize();
  const pos = [], uv = [], idx = [];
  const tan = new THREE.Vector3(), right = new THREE.Vector3(), realUp = new THREE.Vector3();
  let accum = 0;
  for (let j = 0; j < m; j++) {
    if (j === 0) tan.copy(P[1]).sub(P[0]);
    else if (j === m - 1) tan.copy(P[m - 1]).sub(P[m - 2]);
    else tan.copy(P[j + 1]).sub(P[j - 1]);
    if (tan.lengthSq() < 1e-12) tan.set(0, 0, 1);
    tan.normalize();
    right.crossVectors(U, tan);
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    right.normalize();
    realUp.crossVectors(tan, right).normalize();
    if (j > 0) accum += P[j].distanceTo(P[j - 1]);
    for (let i = 0; i <= n; i++) {
      const s = section[i % n];
      pos.push(
        P[j].x + right.x * s[0] + realUp.x * s[1],
        P[j].y + right.y * s[0] + realUp.y * s[1],
        P[j].z + right.z * s[0] + realUp.z * s[1]
      );
      uv.push(i / n, accum);
    }
  }
  const stride = n + 1;
  for (let j = 0; j < m - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * stride + i, b = a + 1, c = (j + 1) * stride + i, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  g.dispose();
  return flat;
}

/* ---------- curves ------------------------------------------------------ */

/** Sample a quadratic-ish eased curve. */
export function ease(t, p) { return Math.pow(t, p); }

/** Catmull-rom resample of a polyline to `count` points. */
export function resample(path, count) {
  const curve = new THREE.CatmullRomCurve3(path.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.35);
  return curve.getSpacedPoints(count - 1).map(v => [v.x, v.y, v.z]);
}

/* ---------- 卷杀 profile helper ----------------------------------------- */

/**
 * 「卷杀」— the stepped-curve terminal of a bracket arm (拱).
 * Returns the closed side profile of a 拱 of length L, height H, in XY,
 * centred at origin. `leaves` = number of 瓣 (4 for 华拱, 5 for 令拱…).
 */
export function gongProfile(L, H, leaves = 4, opts = {}) {
  const endH = opts.endH ?? H * 0.42;      // height of the arm tip
  const run = opts.run ?? H * 1.15;        // horizontal length of the 卷杀
  const half = L / 2;
  const pts = [];
  // bottom edge: left tip → right tip (with a slight rise at the tips)
  pts.push([-half, H - endH - (H - endH)]);        // = [-half, 0]
  pts.push([-half + run * 0.55, -0.0]);
  pts.push([half - run * 0.55, -0.0]);
  pts.push([half, 0]);
  // right 卷杀: climb from tip to full height in `leaves` steps
  for (let i = 0; i <= leaves; i++) {
    const t = i / leaves;
    const y = endH + (H - endH) * t;
    // each 瓣 pulls in slightly then flattens — classic scalloped silhouette
    const x = half - run * (1 - Math.cos(t * Math.PI * 0.5)) - (i > 0 ? 0 : 0);
    pts.push([x, y]);
  }
  // top edge
  pts.push([half - run, H]);
  pts.push([-half + run, H]);
  // left 卷杀 mirrored
  for (let i = leaves; i >= 0; i--) {
    const t = i / leaves;
    const y = endH + (H - endH) * t;
    const x = -half + run * (1 - Math.cos(t * Math.PI * 0.5));
    pts.push([x, y]);
  }
  return pts;
}

/* ---------- instancing -------------------------------------------------- */

/** Build an InstancedMesh from geometry + list of {p,r,s} transforms. */
export function instances(geo, mat, list, opts = {}) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const v = new THREE.Vector3(), sc = new THREE.Vector3();
  list.forEach((t, i) => {
    q.setFromEuler(new THREE.Euler(t.r?.[0] || 0, t.r?.[1] || 0, t.r?.[2] || 0, t.order || 'YXZ'));
    v.set(t.p?.[0] || 0, t.p?.[1] || 0, t.p?.[2] || 0);
    if (Array.isArray(t.s)) sc.set(t.s[0], t.s[1], t.s[2]);
    else sc.setScalar(t.s ?? 1);
    m.compose(v, q, sc);
    im.setMatrixAt(i, m);
  });
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = opts.castShadow !== false;
  im.receiveShadow = opts.receiveShadow !== false;
  im.frustumCulled = false;
  return im;
}

/** Convenience: mesh with shadows on. */
export function mesh(geo, mat, name) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}
