/* ==========================================================================
   materials.js — 程序化材质库
   Canvas-generated textures: no external assets, everything is synthesised.
   ========================================================================== */
import * as THREE from 'three';

const cache = new Map();

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function tex(key, w, h, draw, opts = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = cv(w, h);
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = opts.aniso ?? 8;
  t.colorSpace = opts.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

/* ---------- noise helpers ----------------------------------------------- */

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function grain(g, w, h, amount, alpha) {
  const rnd = seeded(9182);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
  if (alpha) { g.globalAlpha = 1; }
}

/* ---------- 木纹 wood --------------------------------------------------- */

function drawWood(base, dark, streak) {
  return (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const rnd = seeded(4242);
    // long grain running along U
    for (let i = 0; i < 190; i++) {
      const y = rnd() * h;
      const th = 0.6 + rnd() * 2.6;
      g.strokeStyle = rnd() > 0.55 ? dark : streak;
      g.globalAlpha = 0.05 + rnd() * 0.19;
      g.lineWidth = th;
      g.beginPath();
      g.moveTo(-10, y);
      let cy = y;
      for (let x = 0; x <= w + 10; x += 26) {
        cy += (rnd() - 0.5) * 5.5;
        g.lineTo(x, cy);
      }
      g.stroke();
    }
    // knots
    g.globalAlpha = 0.14;
    for (let k = 0; k < 5; k++) {
      const cx = rnd() * w, cy = rnd() * h;
      for (let r = 2; r < 26; r += 2.4) {
        g.strokeStyle = dark; g.lineWidth = 1.1;
        g.beginPath();
        g.ellipse(cx, cy, r * 2.4, r * 0.75, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    grain(g, w, h, 22);
  };
}

/* ---------- 筒瓦 roof tile --------------------------------------------- */

function drawTile(g, w, h) {
  // vertical ranks of 筒瓦 (barrel tiles) alternating with 板瓦 valleys
  const cols = 8;
  const cw = w / cols;
  g.fillStyle = '#2a2f38'; g.fillRect(0, 0, w, h);
  for (let c = 0; c < cols; c++) {
    const x = c * cw;
    // valley (板瓦) — flat, darker
    const vg = g.createLinearGradient(x, 0, x + cw * 0.5, 0);
    vg.addColorStop(0, '#151920'); vg.addColorStop(0.5, '#333a45'); vg.addColorStop(1, '#1b2029');
    g.fillStyle = vg; g.fillRect(x, 0, cw * 0.5, h);
    // barrel (筒瓦) — rounded highlight
    const bg = g.createLinearGradient(x + cw * 0.5, 0, x + cw, 0);
    bg.addColorStop(0, '#20252e'); bg.addColorStop(0.35, '#5b6472');
    bg.addColorStop(0.55, '#6e788a'); bg.addColorStop(1, '#191d25');
    g.fillStyle = bg; g.fillRect(x + cw * 0.5, 0, cw * 0.5, h);
  }
  // horizontal tile courses (overlap shadows) running along V
  const rows = 13;
  for (let r = 0; r <= rows; r++) {
    const y = (r / rows) * h;
    g.fillStyle = 'rgba(0,0,0,0.42)';
    g.fillRect(0, y, w, 3);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(0, y + 3, w, 2);
  }
  grain(g, w, h, 26);
}

/* ---------- 条石 stone -------------------------------------------------- */

function drawStone(g, w, h) {
  g.fillStyle = '#9b978d'; g.fillRect(0, 0, w, h);
  const rnd = seeded(777);
  // mottling
  for (let i = 0; i < 900; i++) {
    const r = 2 + rnd() * 26;
    g.fillStyle = `rgba(${120 + rnd() * 70 | 0},${118 + rnd() * 66 | 0},${105 + rnd() * 60 | 0},${0.05 + rnd() * 0.14})`;
    g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2); g.fill();
  }
  // ashlar joints — 4 courses x 3 blocks, staggered
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    const y = (r / rows) * h;
    g.fillStyle = 'rgba(60,56,50,0.55)'; g.fillRect(0, y, w, 3.5);
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, y + 3.5, w, 1.5);
    const off = (r % 2) * (w / 6);
    for (let b = 0; b < 3; b++) {
      const x = off + (b / 3) * w;
      g.fillStyle = 'rgba(60,56,50,0.45)'; g.fillRect(x, y, 3, h / rows);
    }
  }
  grain(g, w, h, 30);
}

/* ---------- 彩画 polychrome band (旋子彩画 simplified) ----------------- */

function drawCaihua(g, w, h) {
  g.fillStyle = '#123a4d'; g.fillRect(0, 0, w, h);   // 青 ground
  const unit = w / 4;
  for (let u = 0; u < 4; u++) {
    const x0 = u * unit;
    const ground = u % 2 ? '#123a4d' : '#1d5138';    // alternating 青 / 绿
    g.fillStyle = ground; g.fillRect(x0, 0, unit, h);
    // 箍头 white bands at each unit edge
    g.fillStyle = '#e8dfc8'; g.fillRect(x0, 0, unit * 0.05, h);
    g.fillStyle = '#c8302b'; g.fillRect(x0 + unit * 0.05, 0, unit * 0.03, h);
    // 旋眼 rosette in the middle
    const cx = x0 + unit * 0.5, cy = h * 0.5;
    const R = h * 0.36;
    for (let ring = 3; ring >= 0; ring--) {
      const r = R * (0.34 + ring * 0.22);
      g.beginPath();
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const petal = 1 + 0.16 * Math.cos(a * 6);
        const px = cx + Math.cos(a) * r * petal * 1.5;
        const py = cy + Math.sin(a) * r * petal;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      g.fillStyle = ['#e8dfc8', '#c8302b', '#e0b64a', '#f2ead6'][ring];
      g.globalAlpha = 0.95; g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.2; g.stroke();
    }
    // gold flecks
    g.fillStyle = '#e6c162';
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      g.beginPath();
      g.arc(cx + Math.cos(a) * R * 1.7, cy + Math.sin(a) * R * 1.05, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  // top & bottom framing lines
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
  grain(g, w, h, 12);
}

/* ---------- 隔扇门 lattice (三交六椀菱花 simplified) -------------------- */

function drawLattice(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#7c2b22'; g.lineCap = 'round';
  const step = w / 6;
  g.lineWidth = Math.max(3, step * 0.13);
  // three-way diagonal grid = 菱花
  for (let i = -8; i < 14; i++) {
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step + h, h); g.stroke();
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step - h, h); g.stroke();
  }
  for (let i = 0; i < 10; i++) {
    const y = (i / 9) * h;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
  }
  return g;
}

function drawLatticeAlpha(g, w, h) {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#fff'; g.lineCap = 'round';
  const step = w / 6;
  g.lineWidth = Math.max(3, step * 0.13);
  for (let i = -8; i < 14; i++) {
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step + h, h); g.stroke();
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step - h, h); g.stroke();
  }
  for (let i = 0; i < 10; i++) {
    const y = (i / 9) * h;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
  }
}

/* ---------- roughness / bump maps -------------------------------------- */

function drawRough(g, w, h, biasLo, biasHi, seed) {
  const rnd = seeded(seed);
  g.fillStyle = '#888'; g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (biasLo + rnd() * (biasHi - biasLo)) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  g.putImageData(img, 0, 0);
  // smooth it a touch
  g.globalAlpha = 0.55; g.filter = 'blur(1.4px)';
  g.drawImage(g.canvas, 0, 0);
  g.filter = 'none'; g.globalAlpha = 1;
}

/* ==========================================================================
   Public material set
   ========================================================================== */

export function buildMaterials() {
  const woodRed = tex('woodRed', 512, 512, drawWood('#8d3a2c', '#5b1f16', '#a8543c'), { repeat: [2, 2] });
  const woodBare = tex('woodBare', 512, 512, drawWood('#9c7248', '#6a4526', '#b58c5c'), { repeat: [2, 2] });
  const tileT = tex('tile', 512, 512, drawTile, { repeat: [1, 1] });
  const stoneT = tex('stone', 512, 512, drawStone, { repeat: [2, 2] });
  const caihuaT = tex('caihua', 1024, 256, drawCaihua, { repeat: [1, 1] });
  const roughWood = tex('roughWood', 256, 256, (g, w, h) => drawRough(g, w, h, 0.55, 0.85, 31), { data: true });
  const roughStone = tex('roughStone', 256, 256, (g, w, h) => drawRough(g, w, h, 0.7, 0.98, 57), { data: true });
  const latticeA = tex('latticeA', 512, 512, drawLatticeAlpha, { data: true, repeat: [1, 1] });

  const M = {};

  /* 木构 — 朱红漆柱、枋 */
  M.woodRed = new THREE.MeshStandardMaterial({
    map: woodRed, roughnessMap: roughWood, color: 0xffffff,
    roughness: 0.72, metalness: 0.0
  });

  /* 木构 — 深朱红（柱） */
  M.column = new THREE.MeshStandardMaterial({
    map: woodRed, roughnessMap: roughWood, color: 0xd8b8ae,
    roughness: 0.62, metalness: 0.0
  });

  /* 素木 — 斗拱本色 */
  M.woodBare = new THREE.MeshStandardMaterial({
    map: woodBare, roughnessMap: roughWood, roughness: 0.78, metalness: 0.0
  });

  /* 斗拱 — 略偏白的木（清代常刷白/青） */
  M.dougong = new THREE.MeshStandardMaterial({
    map: woodBare, roughnessMap: roughWood, color: 0xe8ddc8, roughness: 0.74
  });

  /* 灰陶筒瓦 */
  M.tile = new THREE.MeshStandardMaterial({
    map: tileT, roughness: 0.42, metalness: 0.08, color: 0xb9c2cf
  });

  /* 琉璃瓦（可选金顶） */
  M.glazed = new THREE.MeshStandardMaterial({
    map: tileT, roughness: 0.18, metalness: 0.35, color: 0xffd98a
  });

  /* 条石台基 */
  M.stone = new THREE.MeshStandardMaterial({
    map: stoneT, roughnessMap: roughStone, roughness: 0.92, metalness: 0.0, color: 0xd8d4c8
  });

  /* 汉白玉栏杆 */
  M.marble = new THREE.MeshStandardMaterial({
    map: stoneT, roughness: 0.6, metalness: 0.0, color: 0xf2efe4
  });

  /* 彩画枋心 */
  M.caihua = new THREE.MeshStandardMaterial({
    map: caihuaT, roughness: 0.55, metalness: 0.05
  });

  /* 鎏金 */
  M.gold = new THREE.MeshStandardMaterial({
    color: 0xd9a840, roughness: 0.26, metalness: 0.95
  });
  M.goldDull = new THREE.MeshStandardMaterial({
    color: 0xb98f39, roughness: 0.45, metalness: 0.8
  });

  /* 青铜（风铃、宝珠座） */
  M.bronze = new THREE.MeshStandardMaterial({
    color: 0x7d6a42, roughness: 0.38, metalness: 0.85
  });

  /* 隔扇棂花 — 镂空 */
  M.lattice = new THREE.MeshStandardMaterial({
    map: woodRed, alphaMap: latticeA, transparent: true, alphaTest: 0.45,
    roughness: 0.7, side: THREE.DoubleSide, color: 0xc09a90
  });

  /* 窗纸（透光） */
  M.paper = new THREE.MeshStandardMaterial({
    color: 0xf6e6c0, roughness: 0.9, transparent: true, opacity: 0.34,
    side: THREE.DoubleSide, emissive: 0xffd28a, emissiveIntensity: 0.22
  });

  /* 墙体 — 抹灰 */
  M.plaster = new THREE.MeshStandardMaterial({
    map: stoneT, roughness: 0.95, color: 0xe4d6bb
  });

  /* 匾额底 */
  M.plaque = new THREE.MeshStandardMaterial({ color: 0x2b1d16, roughness: 0.45, metalness: 0.15 });

  /* ghost — 待安装构件的半透明预览 */
  M.ghost = new THREE.MeshStandardMaterial({
    color: 0x7fd4c8, transparent: true, opacity: 0.26, roughness: 0.4,
    emissive: 0x2f8f80, emissiveIntensity: 0.6, depthWrite: false,
    side: THREE.DoubleSide
  });

  /* highlight — 当前可放置的构件轮廓 */
  M.highlight = new THREE.MeshBasicMaterial({
    color: 0xffcf6b, transparent: true, opacity: 0.5, side: THREE.BackSide
  });

  M._tex = { woodRed, woodBare, tileT, stoneT, caihuaT, latticeA };
  return M;
}

/** Optional: apply an environment map to every metal/glaze material. */
export function applyEnv(M, env) {
  ['gold', 'goldDull', 'bronze', 'glazed', 'tile', 'marble', 'woodRed', 'column', 'dougong', 'woodBare', 'stone', 'caihua']
    .forEach(k => { if (M[k]) { M[k].envMap = env; M[k].envMapIntensity = 0.85; M[k].needsUpdate = true; } });
}
