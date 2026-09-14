/* ==========================================================================
   ar.js — 双模 AR 引擎
   Mode A · WebXR immersive-ar with real plane hit-testing (Android Chrome)
   Mode B · getUserMedia video + DeviceOrientation gyro anchoring (iOS Safari)
   Mode C · plain orbit viewer (desktop / no camera)
   One scene, three ways of putting it in the world.
   ========================================================================== */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const MODE = { XR: 'xr', GYRO: 'gyro', VIEW: 'view' };

export class AREngine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.mode = MODE.VIEW;
    this.placed = false;
    this.onPlace = opts.onPlace || (() => { });
    this.onModeChange = opts.onModeChange || (() => { });
    this.onSurfaceState = opts.onSurfaceState || (() => { });

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.03, 220);
    this.camera.position.set(0, 1.55, 5.4);

    /* the world anchor — everything the game builds lives in here */
    this.world = new THREE.Group();
    this.scene.add(this.world);

    /* gyro rig: in GYRO mode we rotate this instead of the camera */
    this.gyroRig = new THREE.Group();

    this._setupLights();
    this._setupReticle();
    this._setupShadowCatcher();

    this.clock = new THREE.Clock();
    this._hitTestSource = null;
    this._localSpace = null;
    this._raf = null;
    this._tickCbs = [];

    addEventListener('resize', () => this._resize());
  }

  /* ---------- lighting ------------------------------------------------- */
  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xdce8ff, 0x6b5a48, 0.85);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2dd, 2.15);
    sun.position.set(4.2, 8.4, 3.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 9;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 0.3; sun.shadow.camera.far = 34;
    sun.shadow.bias = -0.0016;
    sun.shadow.normalBias = 0.022;
    this.scene.add(sun);
    this.sun = sun;

    // warm bounce from the ground, cool rim from behind
    const fill = new THREE.DirectionalLight(0xffd9a8, 0.42);
    fill.position.set(-3.6, 1.4, -2.8);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xa8c8ff, 0.55);
    rim.position.set(-2.2, 4.0, -5.2);
    this.scene.add(rim);

    // XR light estimation hooks into these
    this.ambient = hemi;
  }

  /** A procedural sky/env so metals have something to reflect. */
  buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    // paint a simple gradient sky + ground into a canvas
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0.00, '#4a6ea8');
    sky.addColorStop(0.42, '#c8d8ee');
    sky.addColorStop(0.50, '#efe6d2');
    sky.addColorStop(0.52, '#8a7a62');
    sky.addColorStop(1.00, '#3a3228');
    g.fillStyle = sky; g.fillRect(0, 0, 512, 256);
    // a soft sun blob
    const sg = g.createRadialGradient(150, 62, 4, 150, 62, 78);
    sg.addColorStop(0, 'rgba(255,248,224,1)');
    sg.addColorStop(1, 'rgba(255,248,224,0)');
    g.fillStyle = sg; g.fillRect(0, 0, 512, 160);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const env = pmrem.fromEquirectangular(tex).texture;
    this.env = env;
    tex.dispose(); pmrem.dispose();
    return env;
  }

  /** In viewer mode we want the sky visible; in AR we do not. */
  setSkyVisible(v) {
    this.scene.background = v && this.env ? this.env : null;
  }

  /* ---------- reticle (the placement target) --------------------------- */
  _setupReticle() {
    const g = new THREE.Group();
    // outer ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.20, 40),
      new THREE.MeshBasicMaterial({ color: 0xffcf6b, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    ring.rotateX(-Math.PI / 2);
    g.add(ring);
    // inner octagon outline — a nod to the pagoda plan
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.115, 0.001, Math.sin(a) * 0.115));
    }
    const oct = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.95 })
    );
    g.add(oct);
    // four corner ticks
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const t = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.004, 0.010),
        new THREE.MeshBasicMaterial({ color: 0xffcf6b })
      );
      t.position.set(Math.cos(a) * 0.245, 0.001, Math.sin(a) * 0.245);
      t.rotation.y = -a;
      g.add(t);
    }
    // glowing center marker
    const center = new THREE.Mesh(
      new THREE.CircleGeometry(0.045, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    center.rotateX(-Math.PI / 2);
    center.position.y = 0.0015;
    g.add(center);

    g.visible = false;
    this.reticle = g;
    this.reticleRing = ring;
    this.reticleCenter = center;
    this.scene.add(g);
  }

  setReticleVisual(state) {
    if (!this.reticleRing) return;
    if (state === 'found') {
      this.reticleRing.material.color.setHex(0x52c41a);
      if (this.reticleCenter) this.reticleCenter.material.color.setHex(0xb7eb8f);
    } else if (state === 'estimated' || state === 'floor') {
      this.reticleRing.material.color.setHex(0xffb84d);
      if (this.reticleCenter) this.reticleCenter.material.color.setHex(0xffe6b0);
    } else {
      this.reticleRing.material.color.setHex(0xffd591);
      if (this.reticleCenter) this.reticleCenter.material.color.setHex(0xffe6b0);
    }
  }

  /* ---------- shadow catcher (invisible floor that receives shadow) ---- */
  _setupShadowCatcher() {
    const geo = new THREE.PlaneGeometry(30, 30);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShadowMaterial({ opacity: 0.34 });
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.position.y = 0.001;
    this.shadowCatcher = m;
    this.world.add(m);

    // a soft radial contact-shadow decal so the tower sits even without
    // a real shadow map hit (helps a lot in AR)
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(128, 128, 10, 128, 128, 126);
    rg.addColorStop(0, 'rgba(0,0,0,0.52)');
    rg.addColorStop(0.55, 'rgba(0,0,0,0.22)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    decal.rotateX(-Math.PI / 2);
    decal.position.y = 0.004;
    this.contactShadow = decal;
    this.world.add(decal);
  }

  setContactShadowSize(s) {
    this.contactShadow.scale.set(s, s, s);
  }

  /* ==================================================================== */
  /* Mode detection                                                        */
  /* ==================================================================== */
  static async probe() {
    const out = { xr: false, camera: false, gyro: false, ios: false, secure: isSecureContext };
    out.ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (navigator.xr) {
      try { out.xr = await navigator.xr.isSessionSupported('immersive-ar'); } catch { out.xr = false; }
    }
    out.camera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    out.gyro = typeof DeviceOrientationEvent !== 'undefined';
    out.gyroNeedsPermission = out.gyro &&
      typeof DeviceOrientationEvent.requestPermission === 'function';
    return out;
  }

  /* ==================================================================== */
  /* Mode A — WebXR                                                        */
  /* ==================================================================== */
  async startXR() {
    let session;
    try {
      session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['local-floor', 'dom-overlay', 'light-estimation', 'anchors'],
        domOverlay: { root: document.getElementById('ui') }
      });
    } catch (e) {
      session = await navigator.xr.requestSession('immersive-ar', {
        optionalFeatures: ['hit-test', 'local-floor', 'dom-overlay', 'light-estimation'],
        domOverlay: { root: document.getElementById('ui') }
      });
    }
    this.session = session;
    this.mode = MODE.XR;
    this.renderer.xr.enabled = true;

    let refSpaceType = 'local-floor';
    let localSpace;
    try {
      localSpace = await session.requestReferenceSpace('local-floor');
    } catch {
      refSpaceType = 'local';
      localSpace = await session.requestReferenceSpace('local');
    }
    this._localSpace = localSpace;
    this._refSpaceType = refSpaceType;
    this.renderer.xr.setReferenceSpaceType(refSpaceType);
    await this.renderer.xr.setSession(session);
    this.setSkyVisible(false);

    try {
      const viewerSpace = await session.requestReferenceSpace('viewer');
      this._hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
    } catch (e) {
      console.warn('Hit test source unavailable, using virtual ground fallback', e);
      this._hitTestSource = null;
    }

    // light estimation, if the device offers it
    try {
      this._lightProbe = await session.requestLightProbe();
    } catch { this._lightProbe = null; }

    session.addEventListener('end', () => {
      this._hitTestSource = null;
      this.mode = MODE.VIEW;
      this.renderer.xr.enabled = false;
      this.renderer.setAnimationLoop(null);
      this.setSkyVisible(true);
      this.onModeChange(MODE.VIEW);
    });

    // tap to place via WebXR hardware select event
    this._xrSelect = () => {
      if (!this.placed) {
        this.tapPlace();
      }
    };
    session.addEventListener('select', this._xrSelect);

    this.renderer.setAnimationLoop((t, frame) => this._frame(t, frame));
    this.onModeChange(MODE.XR);
    return session;
  }

  endXR() {
    if (this.session) {
      try { this.session.end(); } catch {}
      this.session = null;
    }
    this.renderer.xr.enabled = false;
    this.renderer.setAnimationLoop(null);
  }

  /* ==================================================================== */
  /* Mode B — camera video + gyro                                          */
  /* ==================================================================== */
  async startGyro(videoEl) {
    // 1. camera
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 }, height: { ideal: 1080 }
        },
        audio: false
      });
    } catch (e) {
      throw new Error('CAMERA_DENIED');
    }
    videoEl.srcObject = stream;
    videoEl.setAttribute('playsinline', '');
    videoEl.muted = true;
    await videoEl.play();
    this.video = videoEl;
    this.stream = stream;

    // Reset camera position to human eye height in world coordinates
    this.camera.position.set(0, 1.45, 0);
    this.camera.rotation.set(0, 0, 0);

    // 2. gyro permission (iOS 13+)
    if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const p = await DeviceOrientationEvent.requestPermission();
        if (p !== 'granted') this._gyroDenied = true;
      } catch { this._gyroDenied = true; }
    }

    this.mode = MODE.GYRO;
    this.setSkyVisible(false);
    this._initGyro();
    this._startLoop();
    this.onModeChange(MODE.GYRO);

    // in gyro mode the reticle floats at a fixed distance ahead
    this.reticle.visible = true;
    this._gyroDist = 2.4;
  }

  stopGyro() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    if (this._onOri) {
      removeEventListener('deviceorientation', this._onOri, true);
      removeEventListener('deviceorientationabsolute', this._onOri, true);
    }
    this.mode = MODE.VIEW;
    this.setSkyVisible(true);
    this.onModeChange(MODE.VIEW);
  }

  _initGyro() {
    this._ori = { alpha: 0, beta: 80, gamma: 0 };
    this._oriSmooth = { alpha: 0, beta: 80, gamma: 0 };
    this._alphaOffset = null;
    this._gyroLive = false;
    this._onOri = (e) => {
      if (e.alpha === null) return;
      this._ori.alpha = e.alpha;
      this._ori.beta = e.beta;
      this._ori.gamma = e.gamma;
      if (e.webkitCompassHeading !== undefined) this._ori.heading = e.webkitCompassHeading;
      this._gyroLive = true;
    };
    addEventListener('deviceorientation', this._onOri, true);
    addEventListener('deviceorientationabsolute', this._onOri, true);
  }

  /** Convert device orientation to a camera quaternion. */
  _applyGyro() {
    if (!this._gyroLive) return;
    const s = this._oriSmooth, o = this._ori;
    // shortest-path smoothing on alpha (it wraps at 360)
    let da = o.alpha - s.alpha;
    if (da > 180) da -= 360; if (da < -180) da += 360;
    s.alpha += da * 0.22;
    s.beta += (o.beta - s.beta) * 0.22;
    s.gamma += (o.gamma - s.gamma) * 0.22;

    if (this._alphaOffset === null) this._alphaOffset = s.alpha;

    const D2R = Math.PI / 180;
    const alpha = (s.alpha - this._alphaOffset) * D2R;
    const beta = s.beta * D2R;
    const gamma = s.gamma * D2R;

    // ZXY intrinsic → the standard device-orientation convention
    const e = new THREE.Euler(beta, alpha, -gamma, 'YXZ');
    const q = new THREE.Quaternion().setFromEuler(e);
    // screen is held upright: rotate -90° about X to look along -Z
    const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    q.multiply(flip);
    // landscape correction
    const orient = (screen.orientation?.angle ?? window.orientation ?? 0) * D2R;
    if (orient) {
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -orient));
    }
    this.camera.quaternion.slerp(q, 0.5);
  }

  /**
   * In gyro mode there is no plane detection, so we synthesise a floor:
   * the reticle rides on the y = 0 floor plane along the camera's
   * forward ray. Tapping commits the world there.
   */
  _updateGyroReticle() {
    if (this.placed) { this.reticle.visible = false; return; }
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const origin = this.camera.position;
    let t;
    const isFloor = dir.y < -0.05;
    if (isFloor) {
      // looking down: intersect the floor plane y = 0 properly
      t = (0 - origin.y) / dir.y;
      t = Math.min(Math.max(t, 0.7), 6.0);
    } else {
      // looking level/up: park it at a comfortable ground distance ahead
      t = this._gyroDist || 2.4;
    }
    const p = origin.clone().add(dir.multiplyScalar(t));
    p.y = 0;
    this.reticle.position.lerp(p, 0.28);
    this.reticle.visible = true;
    this.setReticleVisual(isFloor ? 'floor' : 'seek');
    this.onSurfaceState(isFloor ? 'floor' : 'seek');
  }

  /** Tap handler for XR / gyro / viewer mode. */
  tapPlace(force = false) {
    if (this.placed) return false;
    if (this.mode === MODE.XR) {
      if (this.reticle.visible && !force) {
        this._commitPlacement(this.reticle.matrix);
        return true;
      }
      // Force or fallback placement directly in front on floor
      const camDir = new THREE.Vector3();
      const camPos = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      this.camera.getWorldPosition(camPos);
      const floorY = (this._refSpaceType === 'local-floor') ? 0 : (camPos.y - 1.4);
      let dist = 2.0;
      if (camDir.y < -0.05) {
        dist = Math.min(Math.max((floorY - camPos.y) / camDir.y, 0.7), 4.5);
      }
      const p = camPos.clone().add(camDir.multiplyScalar(dist));
      p.y = floorY;
      const m = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z);
      this._commitPlacement(m);
      return true;
    }
    if (this.mode === MODE.GYRO) {
      const m = new THREE.Matrix4().makeTranslation(
        this.reticle.position.x, this.reticle.position.y, this.reticle.position.z);
      this._commitPlacement(m);
      return true;
    }
    if (this.mode === MODE.VIEW) {
      this._commitPlacement(new THREE.Matrix4());
      return true;
    }
    return false;
  }

  _commitPlacement(matrix) {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    matrix.decompose(p, q, s);
    this.world.position.copy(p);
    // face the user: yaw only
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const yaw = Math.atan2(camDir.x, camDir.z);
    this.world.rotation.set(0, yaw + Math.PI, 0);
    this.placed = true;
    this.reticle.visible = false;
    // aim the sun at the placement so shadows land under the model
    this.sun.target.position.copy(p);
    this.sun.target.updateMatrixWorld();
    this.scene.add(this.sun.target);
    this.onPlace(p.clone());
  }

  reset() {
    this.placed = false;
    this.world.position.set(0, 0, 0);
    this.world.rotation.set(0, 0, 0);
    if (this.mode !== MODE.VIEW) this.reticle.visible = true;
  }

  /* ==================================================================== */
  /* Mode C — orbit viewer                                                 */
  /* ==================================================================== */
  startViewer(target = new THREE.Vector3(0, 3.2, 0)) {
    this.mode = MODE.VIEW;
    this.setSkyVisible(true);
    if (!this.controls) {
      const c = new OrbitControls(this.camera, this.renderer.domElement);
      c.enableDamping = true;
      c.dampingFactor = 0.07;
      c.minDistance = 1.6;
      c.maxDistance = 40;
      c.maxPolarAngle = Math.PI * 0.495;
      c.target.copy(target);
      c.enablePan = true;
      this.controls = c;
    }
    this.controls.target.copy(target);
    this.controls.enabled = true;
    this.placed = true;
    this.reticle.visible = false;
    this._startLoop();
    this.onModeChange(MODE.VIEW);
  }

  frameObject(box, opts = {}) {
    if (!this.controls) return;
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = (maxDim / 2) / Math.tan((this.camera.fov / 2) * Math.PI / 180) * (opts.pad || 1.5);
    const dir = new THREE.Vector3(0.62, 0.34, 1).normalize();
    this.controls.target.copy(centre);
    this.camera.position.copy(centre.clone().add(dir.multiplyScalar(dist)));
    this.controls.update();
  }

  /* ==================================================================== */
  /* loop                                                                  */
  /* ==================================================================== */
  onTick(fn) { this._tickCbs.push(fn); }

  _startLoop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    const loop = (t) => {
      this._raf = requestAnimationFrame(loop);
      this._frame(t, null);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _frame(time, frame) {
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.mode === MODE.XR && frame) {
      // --- hit test ---
      if (!this.placed) {
        let foundRealHit = false;
        if (this._hitTestSource) {
          const hits = frame.getHitTestResults(this._hitTestSource);
          if (hits.length) {
            const pose = hits[0].getPose(this._localSpace);
            if (pose) {
              foundRealHit = true;
              this.reticle.visible = true;
              this.reticle.matrix.fromArray(pose.transform.matrix);
              this.reticle.matrixAutoUpdate = false;
              this.reticle.matrix.decompose(
                this.reticle.position, this.reticle.quaternion, this.reticle.scale);
              this.reticle.matrixAutoUpdate = true;
              this.setReticleVisual('found');
              this.onSurfaceState('found');
            }
          }
        }

        if (!foundRealHit) {
          // Virtual ground estimation fallback from viewer pose
          const viewerPose = frame.getViewerPose(this._localSpace);
          if (viewerPose) {
            const vPos = viewerPose.transform.position;
            const vOri = viewerPose.transform.orientation;
            const camPos = new THREE.Vector3(vPos.x, vPos.y, vPos.z);
            const camQuat = new THREE.Quaternion(vOri.x, vOri.y, vOri.z, vOri.w);
            const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);

            const floorY = (this._refSpaceType === 'local-floor') ? 0 : (camPos.y - 1.4);
            const isLookingDown = camDir.y < -0.05;
            let t = 2.0;
            if (isLookingDown && (floorY - camPos.y) / camDir.y > 0) {
              t = (floorY - camPos.y) / camDir.y;
              t = Math.min(Math.max(t, 0.6), 5.0);
            }

            const p = camPos.clone().add(camDir.multiplyScalar(t));
            p.y = floorY;

            this.reticle.position.copy(p);
            const yaw = Math.atan2(camDir.x, camDir.z);
            this.reticle.rotation.set(0, yaw, 0);
            this.reticle.updateMatrix();
            this.reticle.visible = true;

            const st = isLookingDown ? 'estimated' : 'seek';
            this.setReticleVisual(st);
            this.onSurfaceState(st);
          } else {
            this.reticle.visible = false;
            this.onSurfaceState('seek');
          }
        }
      }
      // --- light estimation ---
      if (this._lightProbe) {
        const est = frame.getLightEstimate(this._lightProbe);
        if (est) {
          const i = est.primaryLightIntensity;
          if (i) {
            const lum = Math.max(0.25, Math.min(3.4, (i.x * 0.2126 + i.y * 0.7152 + i.z * 0.0722)));
            this.sun.intensity += (lum * 1.5 - this.sun.intensity) * 0.05;
            this.ambient.intensity += (Math.min(1.4, lum * 0.6) - this.ambient.intensity) * 0.05;
          }
          const d = est.primaryLightDirection;
          if (d) {
            this.sun.position.lerp(
              new THREE.Vector3(-d.x, Math.max(0.4, -d.y), -d.z).multiplyScalar(7),
              0.04);
          }
        }
      }
    } else if (this.mode === MODE.GYRO) {
      this._applyGyro();
      this._updateGyroReticle();
    } else if (this.controls) {
      this.controls.update();
    }

    for (const cb of this._tickCbs) cb(dt, time);

    if (this.mode !== MODE.XR) this.renderer.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  /** Screen-space ray → objects, for tapping components. */
  pick(clientX, clientY, objects) {
    const rc = new THREE.Raycaster();
    const ndc = new THREE.Vector2(
      (clientX / innerWidth) * 2 - 1,
      -(clientY / innerHeight) * 2 + 1
    );
    rc.setFromCamera(ndc, this.camera);
    return rc.intersectObjects(objects, true);
  }
}
