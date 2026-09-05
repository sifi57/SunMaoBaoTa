/* ==========================================================================
   main.js — 营造 · 榫卯宝塔
   Game controller: capability probing, mode selection, build loop,
   component tray with live 3D thumbnails, assembly animation, audio.
   ========================================================================== */
import * as THREE from 'three';
import { AREngine, MODE } from './ar.js';
import { buildMaterials, applyEnv } from './geo/materials.js';
import { buildPagoda, prepareStepAnimation } from './pagoda.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ==========================================================================
   State
   ========================================================================== */
const S = {
  caps: null,
  mode: MODE.VIEW,
  engine: null,
  M: null,
  pagoda: null,
  steps: [],
  cursor: 0,
  started: 0,
  quality: 'high',
  sound: true,
  structural: true,
  exploded: false,
  scaleIdx: 1,
  scales: [0.10, 0.20, 0.42, 1.0],
  scaleNames: ['掌上', '案上', '庭中', '实尺'],
  busy: false,
  thumbs: null,
  audio: null
};

const LOAD_TIPS = [
  '《营造法式》成书于宋崇宁二年，李诫奉敕编修，是中国现存最早的建筑技术专著。',
  '斗拱以「材」为模数：一材高十五分°、宽十分°，所有构件尺寸皆由此推算。',
  '应县木塔建于辽清宁二年，高六十七米，全塔用斗拱五十四种，未用一钉。',
  '「举折」使屋面成凹曲线：檐口平缓以远抛雨水，脊部陡峻以速排水。',
  '榫卯节点在地震时可微微错动、耗散能量——是天然的隔震构造。'
];

/* ==========================================================================
   Boot
   ========================================================================== */
init();

async function init() {
  // The probe must never strand the user on "检测设备…": if it throws or
  // hangs (some in-app webviews never settle navigator.xr), fall through
  // to a conservative capability set and let the game open in 3D mode.
  try {
    S.caps = await Promise.race([
      AREngine.probe(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), 2500))
    ]);
  } catch (e) {
    console.warn('capability probe failed:', e.message);
    S.caps = {
      xr: false,
      camera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      gyro: typeof DeviceOrientationEvent !== 'undefined',
      ios: /iPad|iPhone|iPod/.test(navigator.userAgent),
      secure: isSecureContext
    };
  }
  paintCaps(S.caps);
  $('#btn-enter').addEventListener('click', onEnter, { once: false });
  wireUI();
  preloadAudio();
}

function paintCaps(c) {
  const list = $('#cap-list');
  const sub = $('#enter-sub');
  const items = [];
  if (c.xr) items.push(['WebXR 真实平面', true]);
  else items.push(['WebXR', false]);
  items.push([c.camera && c.secure ? '摄像头' : '摄像头', !!(c.camera && c.secure)]);
  items.push(['陀螺仪', !!c.gyro]);
  list.innerHTML = items.map(([n, ok]) =>
    `<span class="cap ${ok ? 'ok' : 'no'}">${n}</span>`).join('');

  if (c.xr) sub.textContent = '真实 AR · 可绕塔行走';
  else if (c.camera && c.secure) sub.textContent = c.ios ? '实景 AR · 陀螺仪锚定' : '实景 AR';
  else if (!c.secure) sub.textContent = '需 HTTPS · 将以三维模式打开';
  else sub.textContent = '三维模式 · 可旋转查看';
}

/* ==========================================================================
   Enter → load → choose mode
   ========================================================================== */
async function onEnter() {
  $('#btn-enter').disabled = true;
  show('#loading'); hide('#cover');
  cycleTips();

  // 1. renderer + materials
  const engine = new AREngine($('#gl'), {
    onPlace: onPlaced,
    onModeChange: m => { S.mode = m; updateModeLabel(); },
    onSurfaceState: onSurface
  });
  S.engine = engine;
  await frame(); setLoad(0.06, '起 版');

  const env = engine.buildEnvironment();
  const M = buildMaterials();
  applyEnv(M, env);
  M.plaqueFace = makePlaqueMaterial('榫卯宝塔');
  S.M = M;
  await frame(); setLoad(0.16, '和 料');

  // 2. build the pagoda (chunked so the UI can breathe)
  const built = await buildChunked(M);
  S.pagoda = built.root;
  S.steps = prepareStepAnimation(built.steps);
  engine.world.add(built.root);
  built.root.scale.setScalar(S.scales[S.scaleIdx]);
  engine.setContactShadowSize(built.root.userData.footprint * S.scales[S.scaleIdx] * 1.5);
  $('#step-all').textContent = S.steps.length;
  await frame(); setLoad(0.86, '绘 图');

  // 3. tray thumbnails
  S.thumbs = new ThumbRenderer(S.M, env);
  buildTray();
  await frame(); setLoad(1.0, '就 绪');
  await sleep(320);

  // 4. pick a mode
  hide('#loading');
  if (S.caps.xr) {
    try { await engine.startXR(); enterPlacing(); return; }
    catch (e) { console.warn('XR failed', e); }
  }
  if (S.caps.camera && S.caps.secure) {
    try {
      $('#feed').classList.add('on');
      await engine.startGyro($('#feed'));
      $('#vignette').classList.add('on');
      enterPlacing();
      return;
    } catch (e) {
      $('#feed').classList.remove('on');
      toast(e.message === 'CAMERA_DENIED' ? '未获得摄像头权限，改用三维模式' : '摄像头不可用，改用三维模式');
    }
  }
  // viewer fallback
  engine.startViewer(new THREE.Vector3(0, built.height * S.scales[S.scaleIdx] * 0.45, 0));
  engine.frameObject(new THREE.Box3().setFromObject(built.root), { pad: 1.35 });
  onPlaced(new THREE.Vector3());
}

/** Build the pagoda in chunks, yielding to the browser between storeys. */
async function buildChunked(M) {
  const out = buildPagoda(M, { structural: S.structural, quality: S.quality });
  // buildPagoda is synchronous; report progress in a few slices for feel
  for (let i = 0; i < 5; i++) { await frame(); setLoad(0.20 + i * 0.13, '造 作'); }
  return out;
}

/* ==========================================================================
   匾额 text material — render 榫卯宝塔 with a real brush font
   ========================================================================== */
function makePlaqueMaterial(text) {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 320;
  const g = c.getContext('2d');
  // lacquer ground
  const grd = g.createLinearGradient(0, 0, 0, 320);
  grd.addColorStop(0, '#3a2418'); grd.addColorStop(1, '#20140d');
  g.fillStyle = grd; g.fillRect(0, 0, 768, 320);
  // gold border
  g.strokeStyle = '#d4a94f'; g.lineWidth = 7;
  g.strokeRect(16, 16, 736, 288);
  g.strokeStyle = 'rgba(240,210,136,.4)'; g.lineWidth = 2;
  g.strokeRect(30, 30, 708, 260);
  // characters
  g.fillStyle = '#e8c463';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 148px "Ma Shan Zheng","Noto Serif SC",serif';
  g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 12; g.shadowOffsetY = 5;
  g.fillText(text, 384, 168);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return new THREE.MeshStandardMaterial({
    map: t, roughness: 0.42, metalness: 0.28,
    emissive: 0x3a2a10, emissiveIntensity: 0.28
  });
}

/* ==========================================================================
   Placing
   ========================================================================== */
function enterPlacing() {
  show('#placing');
  $('#btn-place').addEventListener('click', () => S.engine.tapPlace());
  // in gyro mode also accept a tap anywhere on the canvas
  $('#gl').addEventListener('pointerdown', onCanvasTap);
  updateModeLabel();
}

function onSurface(state) {
  const btn = $('#btn-place');
  const title = $('#place-title'), sub = $('#place-sub');
  if (state === 'found' || state === 'floor') {
    btn.classList.add('ready');
    title.innerHTML = '找到平面了<br>点「落基」放下台基';
    sub.textContent = '放好后可绕塔走动观察';
  } else {
    btn.classList.remove('ready');
    if (S.mode === MODE.GYRO) {
      btn.classList.add('ready');   // gyro mode can always place
      title.innerHTML = '把手机略向下倾<br>对准地面';
      sub.textContent = '对准后点「落基」';
    } else {
      title.innerHTML = '缓慢移动手机<br>寻找一块平地';
      sub.textContent = '地面、桌面、书本皆可';
    }
  }
}

function onCanvasTap(e) {
  if (!S.engine.placed) { S.engine.tapPlace(); return; }
}

function onPlaced(pos) {
  hide('#placing');
  show('#hud');
  $('#gl').removeEventListener('pointerdown', onCanvasTap);
  S.started = performance.now();
  sfx('place');
  updateHUD();
  // open the first lore card after a beat
  setTimeout(() => openScroll(0, true), 620);
}

/* ==========================================================================
   Tray + thumbnails
   ========================================================================== */
class ThumbRenderer {
  constructor(M, env) {
    this.rt = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.rt.setSize(180, 140);
    this.rt.setPixelRatio(1);
    this.rt.outputColorSpace = THREE.SRGBColorSpace;
    this.rt.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.environment = env;
    this.cam = new THREE.PerspectiveCamera(34, 180 / 140, 0.01, 400);
    const h = new THREE.HemisphereLight(0xd8e4ff, 0x50402e, 1.1);
    this.scene.add(h);
    const d = new THREE.DirectionalLight(0xfff2dd, 2.2);
    d.position.set(3, 5, 4); this.scene.add(d);
    const r = new THREE.DirectionalLight(0xffc98a, 0.7);
    r.position.set(-3, 1.4, -3); this.scene.add(r);
  }
  /** Render a step's geometry into a small canvas. */
  shoot(node, canvas) {
    const clone = node.clone(true);
    clone.visible = true;
    clone.traverse(o => { o.visible = true; o.castShadow = false; });
    this.scene.add(clone);
    const box = new THREE.Box3().setFromObject(clone);
    if (box.isEmpty()) { this.scene.remove(clone); return; }
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const maxD = Math.max(size.x, size.y, size.z) || 1;
    const dist = (maxD / 2) / Math.tan((this.cam.fov / 2) * Math.PI / 180) * 1.62;
    this.cam.position.set(c.x + dist * 0.56, c.y + dist * 0.40, c.z + dist * 0.80);
    this.cam.lookAt(c);
    this.rt.render(this.scene, this.cam);
    const ctx = canvas.getContext('2d');
    canvas.width = 180; canvas.height = 140;
    ctx.drawImage(this.rt.domElement, 0, 0);
    this.scene.remove(clone);
  }
}

function buildTray() {
  const tray = $('#tray');
  tray.innerHTML = '';
  S.steps.forEach((st, i) => {
    const el = document.createElement('div');
    el.className = 'piece';
    el.dataset.i = i;
    el.style.animationDelay = `${Math.min(i * 28, 420)}ms`;
    const cv = document.createElement('canvas');
    el.appendChild(cv);
    const lbl = document.createElement('b');
    lbl.textContent = st.title.split('·').pop();
    el.appendChild(lbl);
    const num = document.createElement('span');
    num.className = 'pnum';
    num.textContent = String(i + 1).padStart(2, '0');
    el.appendChild(num);
    el.addEventListener('click', () => onPiece(i, el));
    tray.appendChild(el);
    // thumbnails are heavy — render them lazily on idle
    requestIdle(() => S.thumbs.shoot(st.node, cv), i * 16);
  });
  markTray();
}

function markTray() {
  $$('#tray .piece').forEach((el, i) => {
    el.classList.toggle('done', i < S.cursor);
    el.classList.toggle('next', i === S.cursor);
  });
  const next = $(`#tray .piece[data-i="${S.cursor}"]`);
  if (next) next.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  $('#tray-label').textContent = S.cursor >= S.steps.length
    ? '十九工序已竟，塔成'
    : `取「${S.steps[S.cursor].title.split('·').pop()}」安到塔上`;
}

/* ==========================================================================
   Placing a component
   ========================================================================== */
function onPiece(i, el) {
  if (S.busy) return;
  if (i < S.cursor) { openScroll(i); return; }
  if (i > S.cursor) {
    toast('须依次营造 — 先安「' + S.steps[S.cursor].title.split('·').pop() + '」');
    sfx('deny');
    const t = $(`#tray .piece[data-i="${S.cursor}"]`);
    if (t) { t.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' }); }
    return;
  }
  installStep(i);
}

async function installStep(i) {
  const st = S.steps[i];
  S.busy = true;
  sfx('lift');

  // animate the node dropping into place
  const node = st.node;
  node.visible = true;
  const rest = st.restPos.clone();
  const from = rest.clone().add(st.fromOffset);
  node.position.copy(from);

  // fade + settle
  const dur = 760;
  const t0 = performance.now();
  await animate(dur, p => {
    const e = 1 - Math.pow(1 - p, 3);
    node.position.lerpVectors(from, rest, e);
    // slight overshoot settle
    if (p > 0.72) {
      const q = (p - 0.72) / 0.28;
      node.position.y = rest.y + Math.sin(q * Math.PI) * -0.012 * st.fromOffset.length();
    }
    node.scale.setScalar(0.94 + 0.06 * e);
  });
  node.position.copy(rest);
  node.scale.setScalar(1);
  sfx('seat');

  S.cursor = i + 1;
  S.busy = false;
  markTray();
  updateHUD();
  openScroll(i);

  if (S.cursor >= S.steps.length) setTimeout(onComplete, 900);
}

/* ==========================================================================
   Lore scroll
   ========================================================================== */
function openScroll(i, first = false) {
  const st = S.steps[i];
  const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
  $('#sc-kicker').textContent = `工序 ${NUM[i] || i + 1}`;
  $('#sc-title').textContent = st.title;
  $('#sc-sub').textContent = st.sub;
  $('#sc-text').innerHTML = st.lore.replace(/「([^」]+)」/g, '<em>「$1」</em>');
  const card = $('#scroll-card');
  card.classList.remove('hidden');
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';
  $('.scroll-body').scrollTop = 0;
  sfx('scroll');
}

function closeScroll() { $('#scroll-card').classList.add('hidden'); }

/* ==========================================================================
   HUD
   ========================================================================== */
function updateHUD() {
  const n = S.cursor, all = S.steps.length;
  $('#step-now').textContent = n;
  $('#ps-fill').style.width = `${(n / all) * 100}%`;
  const cur = S.steps[Math.min(n, all - 1)];
  $('#hud-title').textContent = n >= all ? '塔 成' : cur.title;
}

function updateModeLabel() {
  const names = { xr: 'WebXR 真实平面', gyro: '实景 · 陀螺仪', view: '三维模式' };
  $('#m-mode-v').textContent = names[S.mode] || '—';
  const note = $('#m-note');
  if (S.mode === MODE.XR) note.textContent = '当前使用设备的平面检测，可端着手机绕塔走动，模型会固定在真实地面上。';
  else if (S.mode === MODE.GYRO) note.textContent = '当前为实景陀螺仪模式：摄像头作背景，转动手机环视。原地转身效果最佳，大幅走动会有漂移。';
  else note.textContent = '当前为三维模式：单指拖动旋转、双指捏合缩放。若需实景 AR，请在手机上以 HTTPS 打开并允许摄像头。';
}

/* ==========================================================================
   Tools
   ========================================================================== */
function wireUI() {
  $('#sc-close').addEventListener('click', closeScroll);

  $('#t-explode').addEventListener('click', () => {
    S.exploded = !S.exploded;
    $('#t-explode').classList.toggle('on', S.exploded);
    explode(S.exploded);
    toast(S.exploded ? '构件拆解 — 看清每一层的做法' : '构件复位');
  });

  $('#t-orbit').addEventListener('click', () => {
    const on = !S._spin;
    S._spin = on;
    $('#t-orbit').classList.toggle('on', on);
    toast(on ? '自动环视' : '停止环视');
  });

  $('#t-scale').addEventListener('click', () => {
    S.scaleIdx = (S.scaleIdx + 1) % S.scales.length;
    const k = S.scales[S.scaleIdx];
    S.pagoda.scale.setScalar(k);
    S.engine.setContactShadowSize(S.pagoda.userData.footprint * k * 1.5);
    toast(`${S.scaleNames[S.scaleIdx]} · 约 ${(S.pagoda.userData.totalHeight * k).toFixed(2)} 米`);
    sfx('tick');
  });

  $('#t-reset').addEventListener('click', () => {
    if (S.mode === MODE.VIEW) {
      S.engine.frameObject(new THREE.Box3().setFromObject(S.pagoda), { pad: 1.35 });
    } else {
      S.engine.reset();
      hide('#hud'); show('#placing');
      $('#gl').addEventListener('pointerdown', onCanvasTap);
    }
    toast('已重置视角');
  });

  $('#btn-menu').addEventListener('click', () => { show('#menu'); updateModeLabel(); });
  $('#m-close').addEventListener('click', () => hide('#menu'));
  $('#m-sound').addEventListener('click', () => {
    S.sound = !S.sound;
    $('#m-sound-v').textContent = S.sound ? '开' : '关';
    if (S.sound) startAmbient(); else stopAmbient();
  });
  $('#m-struct').addEventListener('click', () => {
    S.structural = !S.structural;
    $('#m-struct-v').textContent = S.structural ? '开' : '关';
    toggleStructural(S.structural);
  });
  $('#m-quality').addEventListener('click', () => {
    S.quality = S.quality === 'high' ? 'fast' : 'high';
    $('#m-quality-v').textContent = S.quality === 'high' ? '精' : '快';
    S.engine.renderer.setPixelRatio(S.quality === 'high' ? Math.min(devicePixelRatio, 2) : 1);
    S.engine.renderer.shadowMap.enabled = S.quality === 'high';
    S.engine.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    toast(S.quality === 'high' ? '高精度渲染' : '流畅优先');
  });
  $('#m-skip').addEventListener('click', async () => {
    hide('#menu');
    while (S.cursor < S.steps.length) {
      const st = S.steps[S.cursor];
      st.node.visible = true;
      st.node.position.copy(st.restPos);
      S.cursor++;
    }
    markTray(); updateHUD(); sfx('seat');
    setTimeout(onComplete, 500);
  });
  $('#m-restart').addEventListener('click', () => { hide('#menu'); restart(); });
  $('#m-mode').addEventListener('click', () => {
    toast(S.mode === MODE.VIEW ? '在手机上打开可启用实景 AR' : '当前已是最佳可用模式');
  });

  $('#fin-again').addEventListener('click', () => { hide('#finish'); restart(); });
  $('#fin-tour').addEventListener('click', () => {
    hide('#finish');
    S._spin = true; $('#t-orbit').classList.add('on');
    toast('绕塔巡览 — 可点侧栏「拆解」看内部构架');
  });

  // pinch to scale in AR modes
  let pinch0 = null, scale0 = 1;
  $('#gl').addEventListener('touchstart', e => {
    if (e.touches.length === 2 && S.engine?.placed) {
      pinch0 = dist2(e.touches);
      scale0 = S.pagoda.scale.x;
    }
  }, { passive: true });
  $('#gl').addEventListener('touchmove', e => {
    if (pinch0 && e.touches.length === 2 && S.mode !== MODE.VIEW) {
      const k = Math.max(0.04, Math.min(1.6, scale0 * (dist2(e.touches) / pinch0)));
      S.pagoda.scale.setScalar(k);
      S.engine.setContactShadowSize(S.pagoda.userData.footprint * k * 1.5);
    }
  }, { passive: true });
  $('#gl').addEventListener('touchend', () => { pinch0 = null; }, { passive: true });

  // one-finger drag rotates the tower in AR modes
  let drag0 = null, rot0 = 0;
  $('#gl').addEventListener('touchstart', e => {
    if (e.touches.length === 1 && S.engine?.placed && S.mode !== MODE.VIEW) {
      drag0 = e.touches[0].clientX; rot0 = S.engine.world.rotation.y;
    }
  }, { passive: true });
  $('#gl').addEventListener('touchmove', e => {
    if (drag0 !== null && e.touches.length === 1) {
      S.engine.world.rotation.y = rot0 + (e.touches[0].clientX - drag0) * 0.0075;
    }
  }, { passive: true });
  $('#gl').addEventListener('touchend', () => { drag0 = null; }, { passive: true });
}

function dist2(t) {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}

/* ---------- explode ----------------------------------------------------- */
function explode(on) {
  S.steps.forEach((st, i) => {
    if (!st.node.visible) return;
    const target = on
      ? st.restPos.clone().add(new THREE.Vector3(0, i * 0.30, 0))
      : st.restPos.clone();
    const from = st.node.position.clone();
    animate(560, p => {
      const e = 1 - Math.pow(1 - p, 3);
      st.node.position.lerpVectors(from, target, e);
    });
  });
}

function toggleStructural(on) {
  const names = ['椽', '檩', '飞椽', '望板', '抹角梁', '递角梁', '蜀柱', '藻井'];
  S.pagoda.traverse(o => {
    if (o.isMesh && names.includes(o.name)) o.visible = on;
  });
}

/* ==========================================================================
   Complete
   ========================================================================== */
function onComplete() {
  const secs = Math.round((performance.now() - S.started) / 1000);
  let parts = 0;
  S.pagoda.traverse(o => {
    if (o.isInstancedMesh) parts += o.count;
    else if (o.isMesh) parts += 1;
  });
  $('#fin-h').textContent = S.pagoda.userData.totalHeight.toFixed(1);
  $('#fin-p').textContent = parts.toLocaleString();
  $('#fin-t').textContent = secs < 60 ? secs + '秒' : Math.floor(secs / 60) + '分' + (secs % 60) + '秒';
  closeScroll();
  show('#finish');
  sfx('finish');
}

function restart() {
  S.cursor = 0;
  S.exploded = false;
  $('#t-explode').classList.remove('on');
  S.steps.forEach(st => { st.node.visible = false; st.node.position.copy(st.restPos); });
  markTray(); updateHUD(); closeScroll();
  S.started = performance.now();
  toast('重新营造 — 自台基起');
}

/* ==========================================================================
   Ticker — wind bells sway, auto-orbit
   ========================================================================== */
function startTicker() {
  S.engine.onTick((dt, t) => {
    // sway the wind bells
    if (S._bells === undefined) {
      S._bells = [];
      S.pagoda.traverse(o => { if (o.name === 'bells') S._bells.push(o); });
    }
    const sw = Math.sin(t * 0.0016) * 0.05 + Math.sin(t * 0.0031) * 0.025;
    S._bells.forEach((b, i) => { b.rotation.z = sw * (1 + i * 0.12); });

    if (S._spin) {
      if (S.mode === MODE.VIEW && S.engine.controls) {
        const c = S.engine.controls;
        const off = S.engine.camera.position.clone().sub(c.target);
        const a = 0.22 * dt;
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
        S.engine.camera.position.copy(c.target).add(off);
      } else {
        S.engine.world.rotation.y += 0.20 * dt;
      }
    }
  });
}

/* ==========================================================================
   Audio — synthesised, no assets
   ========================================================================== */
function preloadAudio() {
  document.addEventListener('pointerdown', () => {
    if (S.audio) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      S.audio = new AC();
      if (S.sound) startAmbient();
    } catch { }
  }, { once: true });
}

function startAmbient() {
  const ac = S.audio; if (!ac) return;
  if (S._amb) return;
  // a very soft wind bed: filtered noise
  const len = ac.sampleRate * 3;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = last * 0.97 + w * 0.03;
    d[i] = last * 3.2;
  }
  const src = ac.createBufferSource();
  src.buffer = buf; src.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.7;
  const gn = ac.createGain(); gn.gain.value = 0.0;
  gn.gain.linearRampToValueAtTime(0.075, ac.currentTime + 2.5);
  src.connect(bp).connect(gn).connect(ac.destination);
  src.start();
  S._amb = { src, gn };
  // occasional wind bell
  S._bellTimer = setInterval(() => {
    if (Math.random() < 0.55) bellChime();
  }, 4200);
}

function stopAmbient() {
  if (S._amb) {
    S._amb.gn.gain.linearRampToValueAtTime(0, S.audio.currentTime + 0.6);
    setTimeout(() => { try { S._amb.src.stop(); } catch { } S._amb = null; }, 700);
  }
  clearInterval(S._bellTimer);
}

function bellChime() {
  const ac = S.audio; if (!ac || !S.sound) return;
  const t = ac.currentTime;
  const base = 1180 + Math.random() * 620;
  [1, 2.76, 5.4].forEach((h, i) => {
    const o = ac.createOscillator();
    o.type = 'sine'; o.frequency.value = base * h;
    const g = ac.createGain();
    const amp = 0.05 / (i + 1.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4 / (i * 0.5 + 1));
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t + 2.6);
  });
}

function sfx(kind) {
  const ac = S.audio; if (!ac || !S.sound) return;
  const t = ac.currentTime;
  const tone = (f, dur, type = 'sine', vol = 0.09, slide = 0) => {
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.02);
  };
  const thud = (vol = 0.16, dur = 0.16) => {
    const len = Math.floor(ac.sampleRate * dur);
    const b = ac.createBuffer(1, len, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 3.4);
      d[i] = (Math.random() * 2 - 1) * env * vol;
    }
    const s = ac.createBufferSource(); s.buffer = b;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 620;
    s.connect(lp).connect(ac.destination); s.start(t);
  };
  switch (kind) {
    case 'lift': tone(560, 0.1, 'triangle', 0.05, 1.35); break;
    case 'seat': thud(0.22, 0.19); tone(196, 0.16, 'sine', 0.07); break;
    case 'place': thud(0.3, 0.3); tone(147, 0.4, 'sine', 0.08); break;
    case 'deny': tone(180, 0.13, 'square', 0.045, 0.7); break;
    case 'tick': tone(880, 0.05, 'square', 0.03); break;
    case 'scroll': thud(0.05, 0.24); tone(1240, 0.07, 'sine', 0.025); break;
    case 'finish':
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => {
        const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ac.createGain(); const tt = ac.currentTime;
        g.gain.setValueAtTime(0, tt);
        g.gain.linearRampToValueAtTime(0.09, tt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.6);
        o.connect(g).connect(ac.destination); o.start(tt); o.stop(tt + 1.7);
      }, i * 130));
      break;
  }
}

/* ==========================================================================
   Helpers
   ========================================================================== */
function show(sel) { $(sel).classList.remove('hidden'); }
function hide(sel) { $(sel).classList.add('hidden'); }
function frame() { return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestIdle(fn, delay = 0) {
  const run = () => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 900 }) : setTimeout(fn, 0));
  delay ? setTimeout(run, delay) : run();
}
function setLoad(p, label) {
  $('#load-fill').style.setProperty('--p', `${p * 100}%`);
  $('#load-fill').style.background =
    `linear-gradient(0deg, var(--jin) ${p * 100}%, transparent ${p * 100}%)`;
  if (label) $('#load-label').textContent = label;
}
function cycleTips() {
  let i = 0;
  const el = $('#load-tip');
  el.textContent = LOAD_TIPS[0];
  S._tipTimer = setInterval(() => {
    i = (i + 1) % LOAD_TIPS.length;
    el.style.opacity = 0;
    setTimeout(() => { el.textContent = LOAD_TIPS[i]; el.style.opacity = 1; }, 260);
  }, 2600);
  el.style.transition = 'opacity .26s';
}
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden', 'out');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.classList.add('hidden'), 380);
  }, 2300);
}
function animate(dur, step) {
  return new Promise(res => {
    const t0 = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / dur);
      step(p);
      if (p < 1) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
}

/* start the ticker once the engine exists */
const waitEngine = setInterval(() => {
  if (S.engine) { clearInterval(waitEngine); clearInterval(S._tipTimer); startTicker(); }
}, 120);
