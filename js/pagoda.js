/* ==========================================================================
   pagoda.js — 楼阁式八角木塔 总装
   Assembles the whole pagoda and slices it into ordered build STEPS so the
   game can raise it one construction stage at a time.

   Layout (a five-storey 楼阁式塔 after the Liao model):
     台基 → [ 柱网 → 阑额 → 斗拱 → 腰檐 → 平坐 ] × 5 → 塔顶 → 塔刹
   ========================================================================== */
import * as THREE from 'three';
import { merge, xform, mesh, instances, box, ngon, TAU, DEG } from './geo/util.js';
import * as B from './parts/base.js';
import * as F from './parts/frame.js';
import * as D from './parts/dougong.js';
import * as R from './parts/roof.js';
import * as N from './parts/finial.js';

/* ==========================================================================
   Storey schedule — each storey shrinks (收分) as the tower rises.
   ========================================================================== */
export function schedule() {
  const S = [];
  const storeys = 5;
  const R0 = 2.62;          // ground-storey column-ring radius (vertex)
  for (let i = 0; i < storeys; i++) {
    const k = 1 - i * 0.108;                    // 收分
    S.push({
      i,
      R: R0 * k,
      colH: (i === 0 ? 2.62 : 2.22) * (1 - i * 0.035),
      eaveOut: 0.92 * k,                        // 出檐 beyond the column ring
      roofRise: (i === storeys - 1 ? 1.62 : 0.58) * (1 - i * 0.04),
      pingzuoH: i === storeys - 1 ? 0 : 0.72,   // 平坐 height above the 腰檐
      isTop: i === storeys - 1,
      cai: 0.155 * (1 - i * 0.05)               // 材 shrinks with storey
    });
  }
  return S;
}

/* ==========================================================================
   The builder
   ========================================================================== */
export function buildPagoda(M, opts = {}) {
  const { structural = true, quality = 'high' } = opts;
  const root = new THREE.Group();
  root.name = 'pagoda';

  /** Ordered construction steps. Each: { id, title, sub, lore, node, parts[] } */
  const steps = [];
  const sched = schedule();

  /**
   * Step granularity per storey. The ground storey is taught member by
   * member; middle storeys collapse into fewer, larger moves so the game
   * does not drag; the top storey expands again for its special roof.
   * Each entry maps a build PHASE onto a step KEY — phases sharing a key
   * land in the same group and produce one card.
   *   phases: col · infill · beam · dg · liang · roof · pz
   */
  const GRAIN = [
    /* 一层 */ { col: 'col', infill: 'infill', beam: 'beam', dg: 'dg', roof: 'roof', pz: 'pz' },
    /* 二层 */ { col: 'frame', infill: 'frame', beam: 'frame', dg: 'dg', roof: 'cap', pz: 'cap' },
    /* 三层 */ { col: 'frame', infill: 'frame', beam: 'frame', dg: 'cap', roof: 'cap', pz: 'cap' },
    /* 四层 */ { col: 'frame', infill: 'frame', beam: 'frame', dg: 'cap', roof: 'cap', pz: 'cap' },
    /* 五层 */ { col: 'frame', infill: 'frame', beam: 'frame', dg: 'dg', liang: 'liang', roof: 'roof' }
  ];

  /* helper: open (or reopen) a step group */
  const groups = new Map();
  const step = (id, title, sub, lore, tag) => {
    if (groups.has(id)) return groups.get(id);
    const g = new THREE.Group();
    g.name = id;
    root.add(g);
    const s = { id, title, sub, lore, node: g, tag: tag || 'wood' };
    steps.push(s);
    groups.set(id, g);
    return g;
  };
  /** Resolve a storey phase to its step id under the current granularity. */
  const key = (si, phase) => `${GRAIN[si][phase] || phase}${si}`;

  let Y = 0;                              // running build height

  /* ---------- STEP 1 · 台基 ---------------------------------------------- */
  {
    const g = step('taiji', '台基·须弥座',
      '夯土包石，八角须弥座',
      '塔从「台基」起。八角须弥座分圭角、下枋、束腰、上枋数层，束腰刻壶门。台基不只为美观——它把塔身荷载摊到夯土之上，并隔断地下潮气，是木塔千年不朽的第一道防线。',
      'stone');
    const podR = sched[0].R + 0.62;
    g.add(mesh(B.apron(podR), M.stone, '散水'));
    const pod = B.podium(podR, 0.94);
    g.add(mesh(pod.geo, M.stone, '须弥座'));
    const st = B.stairs(podR, 0.94, 1.78);
    g.add(mesh(st.geo, M.stone, '踏道'));
    Y = 0.94;
  }

  /* ---------- per-storey loop ------------------------------------------- */
  sched.forEach((S, si) => {
    const ord = ['一', '二', '三', '四', '五'][si];
    const cai = D.caiScale(S.cai);
    const storeyBase = Y;

    /* ----- 柱础 + 柱网 ----- */
    {
      const merged = GRAIN[si].col === 'frame';
      const g = step(key(si, 'col'),
        merged ? `第${ord}层·塔身` : `第${ord}层·柱网`,
        merged ? '柱网、门窗、阑额一并立起' : `外槽八柱 + 内槽八柱，侧脚 1/100`,
        si === 0
          ? '「柱」立而屋成。八角塔每层用外槽八柱、内槽八柱，共十六根。柱身并不直：中段微微膨出，柱顶略收，称「卷杀」，视觉上更显挺拔。外圈柱还向内倾斜约百分之一，称「侧脚」——让整层柱网收成一个内聚的桶箍，专抗侧向风力。'
          : `层层向上收进，称「收分」。第${ord}层柱径、柱高与开间都比下层小一号，塔身因此形成缓和的收分曲线；重心持续下压，越高越稳。此层柱网、隔扇与阑额一并立起。`,
        'wood');
      const outer = F.columnRing(S.R);
      const inner = F.columnRing(S.R * 0.52);
      const cejiao = si === 0 ? 0.010 : 0.008;   // 侧脚 lean, radians

      const plinthGeo = F.plinth(0.24 * (1 - si * 0.05));
      g.add(instances(plinthGeo, M.stone,
        outer.map(c => ({ p: [c.p[0], storeyBase, c.p[2]] }))));
      if (si === 0) {
        g.add(instances(F.plinth(0.21), M.stone,
          inner.map(c => ({ p: [c.p[0], storeyBase, c.p[2]] }))));
      }

      const colGeo = F.column(S.colH, 0.205 * (1 - si * 0.055));
      g.add(instances(colGeo, M.column,
        outer.map(c => ({
          p: [c.p[0], storeyBase + 0.26, c.p[2]],
          r: [Math.cos(c.a) * cejiao, 0, -Math.sin(c.a) * cejiao]
        }))));
      const inColGeo = F.column(S.colH + 0.30, 0.185 * (1 - si * 0.055));
      g.add(instances(inColGeo, M.column,
        inner.map(c => ({ p: [c.p[0], storeyBase + 0.24, c.p[2]] }))));
    }

    const colTop = storeyBase + 0.26 + S.colH;

    /* ----- 门窗墙 (ground storey gets the full treatment) ----- */
    {
      const g = step(key(si, 'infill'), `第${ord}层·隔扇门窗`,
        si === 0 ? '正四面隔扇门，斜四面直棂窗' : '四面开门，四面实壁',
        si === 0
          ? '「隔扇」是可拆的木框门。三交六椀菱花心糊窗纸，透光而不透风；下部裙板实心防踢。斜向四面用直棂窗——竖棂条既通风采光，又不给外力留下大面受风面。'
          : '楼阁式塔每层都能登临，门洞按方位轮换，让人绕行时视野不断变化，也让结构受力更均匀。',
        'wood');
      const frames = [], lattices = [], papers = [], walls = [];
      for (let fi = 0; fi < 8; fi++) {
        const isDoor = fi % 2 === 0;
        const inf = F.faceInfill(S.R, fi, {
          y: storeyBase + 0.24,
          h: S.colH * 0.86,
          kind: isDoor ? 'door' : 'window',
          margin: 0.34
        });
        if (inf.frame) frames.push(inf.frame);
        if (inf.lattice) lattices.push(inf.lattice);
        if (inf.paper) papers.push(inf.paper);
        if (inf.wall) walls.push(inf.wall);
      }
      if (frames.length) g.add(mesh(merge(frames), M.woodRed, '门框'));
      if (walls.length) g.add(mesh(merge(walls), M.plaster, '墙'));
      if (lattices.length) {
        const lm = mesh(merge(lattices), M.lattice, '棂花');
        lm.castShadow = false;
        g.add(lm);
      }
      if (papers.length) {
        const pm = mesh(merge(papers), M.paper, '窗纸');
        pm.castShadow = false;
        g.add(pm);
      }
      // 匾额 on the front face of the ground storey
      if (si === 0) {
        const pl = F.plaque(S.R, 0, storeyBase + S.colH * 0.98, '');
        g.add(mesh(pl.body, M.woodRed, '匾框'));
        const faceMat = M.plaqueFace || M.plaque;
        const fm = mesh(pl.face, faceMat, '匾心');
        fm.castShadow = false;
        g.add(fm);
      }
    }

    /* ----- 阑额 + 普拍枋 ----- */
    {
      const g = step(key(si, 'beam'), `第${ord}层·阑额普拍枋`,
        '柱头联络材，上承斗拱',
        '「阑额」横穿柱头，把八根独立的柱子箍成一个整体；其上再加一层扁而宽的「普拍枋」——这是辽宋工匠的关键发明，为斗拱提供了连续的坐垫，让荷载可以沿枋横向传递，而不是全压在柱顶一点上。枋心绘旋子彩画，青绿相间，中央旋眼描金。',
        'wood');
      g.add(mesh(F.ringBeam(S.R, { h: 0.34 * (1 - si * 0.04), w: 0.17, y: colTop - 0.17 }), M.woodRed, '阑额'));
      g.add(mesh(F.caihuaBand(S.R + 0.005, { h: 0.19, y: colTop - 0.17, w: 0.055 }), M.caihua, '彩画枋心'));
      g.add(mesh(F.plateBeam(S.R, { h: 0.11, w: 0.36, y: colTop + 0.055 }), M.woodRed, '普拍枋'));
      // inner ring tie beams
      g.add(mesh(F.ringBeam(S.R * 0.52, { h: 0.26, w: 0.15, y: colTop + 0.10 }), M.woodRed, '内槽额'));
    }

    const bracketY = colTop + 0.11;

    /* ----- 斗拱 ----- */
    {
      const mergedCap = GRAIN[si].dg === 'cap';
      const g = step(key(si, 'dg'),
        mergedCap ? `第${ord}层·斗拱与檐` : `第${ord}层·斗拱`,
        si === 0 ? '五铺作双抄，柱头 + 补间 + 转角'
          : (mergedCap ? '斗拱、腰檐、平坐一并架起' : '五铺作，逐层减跳'),
        si === 0
          ? '「斗拱」是中国木构的心脏。栌斗坐在柱头，华拱层层向外挑出，每挑一层叫一「跳」；两跳即「五铺作」。它把屋檐的重量沿斜线传回柱心，同时向外托出深远的出檐。所有构件全靠榫卯咬合，不用一根钉——地震时节点可微微错动、耗散能量，是天然的隔震装置。'
          : '上层斗拱逐层「减跳」，出跳更短、用材更小。这既呼应塔身收分，也让屋檐层层内收，合成宝塔那道著名的收分轮廓。斗拱之上随即架起腰檐与平坐，一层就此完工。',
        'dougong');
      const layout = D.bracketLayout(S.R, { perBay: si < 2 ? 1 : 1, y: bracketY });
      const jump = si < 2 ? 2 : 2;
      const merged = D.bracketSetMerged(cai, { jump, corner: false });
      const cornerM = D.bracketSetMerged(cai, { jump, corner: true });
      // 柱头铺作 at the eight column heads
      const colSets = layout.corner.map(t => ({ p: t.p, r: t.r }));
      g.add(instances(cornerM.wood, M.dougong, colSets));
      if (cornerM.bare) g.add(instances(cornerM.bare, M.woodBare, colSets));
      // 补间铺作 between them
      const midSets = layout.intermediate.map(t => ({ p: t.p, r: t.r }));
      g.add(instances(merged.wood, M.dougong, midSets));
      if (merged.bare) g.add(instances(merged.bare, M.woodBare, midSets));
      // 罗汉枋 / 撩檐枋 rings tying the bracket heads together
      const reach = merged.reach;
      g.add(mesh(F.ringBeam(S.R + reach, { h: cai.h, w: cai.f(10), y: bracketY + merged.top - cai.h * 0.4 }), M.woodRed, '撩檐枋'));
      g.add(mesh(F.ringBeam(S.R + reach * 0.5, { h: cai.h, w: cai.f(10), y: bracketY + merged.top - cai.h * 1.9 }), M.woodRed, '罗汉枋'));
      S._reach = reach;
      S._bracketTop = bracketY + merged.top;
    }

    /* ----- 梁架 (top storey only, visible under the big roof) ----- */
    if (S.isTop) {
      const g = step(key(si, 'liang'), '顶层·梁架藻井',
        '抹角梁递角梁 + 八角藻井',
        '八角形的屋顶如何收到一个尖？靠「抹角梁」——斜跨两面、切掉角部，把八边形逐层缩成更小的八边形，直到能被一根雷公柱收住。顶心做「藻井」，层层叠缩如穹窿，既是装饰，也把顶部构件锁成整体。',
        'wood');
      g.add(mesh(N.diagonalBeams(S.R * 0.82, S._bracketTop + 0.10, { shrink: 0.66 }), M.woodBare, '抹角梁'));
      g.add(mesh(N.shortPosts(S.R * 0.46, S._bracketTop + 0.24, 0.44), M.woodBare, '蜀柱'));
      g.add(mesh(N.diagonalBeams(S.R * 0.50, S._bracketTop + 0.70, { shrink: 0.66, w: 0.12, h: 0.20 }), M.woodBare, '递角梁'));
      g.add(mesh(N.zaojing(S.R * 0.44, S._bracketTop + 0.30, { depth: 0.52 }), M.woodRed, '藻井'));
    }

    /* ----- 屋檐 / 屋顶 ----- */
    {
      const isTop = S.isTop;
      const mergedCap = GRAIN[si].roof === 'cap';
      const g = step(key(si, 'roof'),
        isTop ? '塔顶·攒尖屋面' : (mergedCap ? `第${ord}层·檐与平坐` : `第${ord}层·腰檐`),
        isTop ? '八角攒尖，举折成曲，翼角起翘'
          : (mergedCap ? '腰檐、平坐、栏杆一并完成' : '举折出檐，筒瓦瓦当'),
        isTop
          ? '屋面不是一个斜面，而是一条曲线。工匠先定「举高」，再让每根檩条依次比直线低一点——这叫「举折」，屋面因此微微凹陷：檐口平缓便于泄水远抛，脊部陡峻利于排水。角部的檐口还要「起翘」并向外「出翘」，翼角便如鸟翼上扬。'
          : '「腰檐」是每层各自的小屋檐。出檐深远，把雨水甩离柱身与台基；檐下阴影又替木构挡住日晒，是最朴素的耐久之道。檐口每垄筒瓦收头一枚瓦当，缝间垂一枚滴水。',
        'tile');
      const Reave = S.R + (S._reach || 0.5) + S.eaveOut * 0.42;
      const roofG = R.roof(Reave, isTop ? S.roofRise : S.roofRise, M, {
        lift: isTop ? 0.40 : 0.30,
        push: isTop ? 0.18 : 0.14,
        ranks: quality === 'high' ? (isTop ? 56 : 44) : 30,
        purlinCount: isTop ? 7 : 4,
        structural,
        bells: true,
        beasts: true,
        glazed: isTop,
        apexR: isTop ? 0.26 : 0.30
      });
      roofG.position.y = S._bracketTop;
      g.add(roofG);
      S._roof = roofG;
      S._eaveR = Reave;
      S._roofTopY = S._bracketTop + roofG.userData.apexY;
    }

    /* ----- 平坐 + 栏杆 (not on the top storey) ----- */
    if (!S.isTop) {
      const nextR = sched[si + 1].R;
      const g = step(key(si, 'pz'), `第${ord}层·平坐栏杆`,
        '暗层挑台 + 寻杖栏杆',
        '「平坐」是夹在两层之间的暗层，用一圈短柱和斗拱把楼板挑出塔身之外，形成可以绕塔一周的走廊。它同时是结构上的加强环——短柱密集、斜撑交织，像给塔身系上一道腰带。外沿装寻杖栏杆：望柱作莲瓣柱头，中嵌华板。',
        'wood');
      const pzY = S._bracketTop + 0.14;
      // 平坐 short columns
      const pzCols = F.columnRing(nextR + 0.30);
      g.add(instances(F.column(S.pingzuoH, 0.15, { ring: false }), M.column,
        pzCols.map(c => ({ p: [c.p[0], pzY, c.p[2]] }))));
      // 平坐 bracket ring (small, single-jump)
      const pzCai = D.caiScale(S.cai * 0.78);
      const pzMerged = D.bracketSetMerged(pzCai, { jump: 1 });
      const pzLayout = D.bracketLayout(nextR + 0.30, { perBay: 1, y: pzY + S.pingzuoH });
      g.add(instances(pzMerged.wood, M.dougong,
        [...pzLayout.corner, ...pzLayout.intermediate].map(t => ({ p: t.p, r: t.r }))));
      // deck
      const deckR = nextR + 0.30 + pzMerged.reach + 0.20;
      const deck = B.pingzuoDeck(deckR, 0.20);
      deck.translate(0, pzY + S.pingzuoH + pzMerged.top, 0);
      g.add(mesh(deck, M.woodRed, '平坐楼板'));
      // balustrade on the deck
      const bal = B.balustrade(deckR, { h: 0.62, openFace: -1, inset: 0.16 });
      const balY = pzY + S.pingzuoH + pzMerged.top + 0.20;
      g.add(instances(bal.postGeo, M.woodRed,
        bal.posts.map(p => ({ p: [p.p[0], balY, p.p[2]], r: p.r }))));
      const railG = bal.railGeo;
      railG.translate(0, balY, 0);
      g.add(mesh(railG, M.woodRed, '栏杆'));
      Y = balY + 0.10;
    } else {
      Y = S._roofTopY;
    }
  });

  /* ---------- FINAL STEP · 塔刹 ------------------------------------------ */
  {
    const g = step('finial', '塔刹·相轮宝珠',
      '覆钵 仰莲 七重相轮 宝珠',
      '「塔刹」是塔的冠冕，也是它的宗教本体——一座缩小的窣堵坡。自下而上：刹座、覆钵、仰莲、七重相轮、圆光、仰月、宝盖，最后一颗宝珠擎天。中心一根刹杆直插进梁架，四周铁链牵向戗脊，既固定又能在风中微微摆动。刹尖同时是避雷针：千百年来雷电由铁链导入地下，木塔得以幸存。',
      'gold');
    const top = sched[sched.length - 1];
    const fin = N.finial(M, { scale: 1.0, rings: 7 });
    fin.position.y = top._roofTopY - 0.06;
    g.add(fin);
    // guy chains to the hip tips
    const chainTop = fin.position.y + fin.userData.height * 0.62;
    g.add(mesh(
      N.guyChains(chainTop, top._eaveR * 0.92, top._bracketTop + top._roof.userData.eaveY + 0.42, { sag: 0.34 }),
      M.bronze, '铁链'));
    // 风铎 hanging off the chains
    const bellTf = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const rr = top._eaveR * 0.52;
      bellTf.push({ p: [Math.cos(a) * rr, chainTop - 0.62, Math.sin(a) * rr], s: 1.15 });
    }
    g.add(instances(R.windBell(1), M.bronze, bellTf));
    Y = fin.position.y + fin.userData.height;
  }

  root.userData.totalHeight = Y;
  root.userData.steps = steps;
  root.userData.footprint = (sched[0].R + 0.62) * 2;
  return { root, steps, height: Y, schedule: sched };
}

/* ==========================================================================
   Step presentation metadata — the tray icons & flight paths
   ========================================================================== */
/**
 * For each step, work out where its parts should fly in FROM, so the
 * assembly animation reads as "components lifted into place".
 */
export function prepareStepAnimation(steps) {
  steps.forEach((s, i) => {
    const node = s.node;
    const bb = new THREE.Box3().setFromObject(node);
    const centre = bb.getCenter(new THREE.Vector3());
    const size = bb.getSize(new THREE.Vector3());
    s.bbox = bb;
    s.centre = centre;
    s.size = size;
    // resting transform
    s.restPos = node.position.clone();
    // fly-in offset: rise from below for stone, drop from above for roof,
    // spiral in for wood
    const kind = s.tag;
    if (kind === 'stone') s.fromOffset = new THREE.Vector3(0, -1.4, 0);
    else if (kind === 'tile') s.fromOffset = new THREE.Vector3(0, 2.6, 0);
    else if (kind === 'gold') s.fromOffset = new THREE.Vector3(0, 3.4, 0);
    else s.fromOffset = new THREE.Vector3(0, 1.5, 0);
    s.index = i;
    node.visible = false;
  });
  return steps;
}
