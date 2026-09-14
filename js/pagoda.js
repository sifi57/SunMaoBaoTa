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
    const g = step('taiji', 'Base · Sumeru Throne',
      'Rammed earth covered in stone, an octagonal Sumeru throne',
      'The pagoda starts from the "base". The octagonal Sumeru throne is divided into layers... It not only serves an aesthetic purpose—it distributes the load onto the rammed earth and blocks rising dampness. It is the first line of defense that keeps the timber pagoda standing for a millennium.',
      'stone');
    const podR = sched[0].R + 0.62;
    g.add(mesh(B.apron(podR), M.stone, 'Apron'));
    const pod = B.podium(podR, 0.94);
    g.add(mesh(pod.geo, M.stone, 'Sumeru Throne'));
    const st = B.stairs(podR, 0.94, 1.78);
    g.add(mesh(st.geo, M.stone, 'Stairs'));
    Y = 0.94;
  }

  /* ---------- per-storey loop ------------------------------------------- */
  sched.forEach((S, si) => {
    const ord = si + 1;
    const cai = D.caiScale(S.cai);
    const storeyBase = Y;

    /* ----- 柱础 + 柱网 ----- */
    {
      const merged = GRAIN[si].col === 'frame';
      const g = step(key(si, 'col'),
        merged ? `Storey ${ord} · Body` : `Storey ${ord} · Columns`,
        merged ? 'Columns, doors, windows, and architraves raised together' : `Outer 8 columns + inner 8 columns, inward lean 1/100`,
        si === 0
          ? '"When columns stand, the house is formed." The octagonal pagoda uses 8 outer and 8 inner columns per storey, 16 in total. The shafts are not straight: they bulge slightly in the middle and taper at the top, called "Entasis", making them look more upright. The outer columns also lean inward by about 1%, called "Cejiao" (Side-footing) - turning the entire column grid into a cohesive barrel hoop specifically to resist lateral wind loads.'
          : `Tapering inwards layer by layer is called "Shoufen". The columns, height, and bays of Storey ${ord} are all smaller than the one below, giving the pagoda a gentle tapering curve; the center of gravity is continuously pressed down, making it more stable the higher it goes. The column grid, doors, and architraves of this storey are erected together.`,
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
      const g = step(key(si, 'infill'), `Storey ${ord} · Doors & Windows`,
        si === 0 ? 'Panel doors on cardinal faces, mullion windows on diagonals' : 'Four open doors, four solid walls',
        si === 0
          ? '"Geshan" are removable wooden frame doors. The lattice is pasted with paper, letting in light but not wind; the lower skirt panel is solid to prevent kicking. The diagonal faces use mullion windows—vertical bars provide ventilation and light without leaving a large wind-catching surface.'
          : 'The pavilion-style pagoda can be ascended on every storey. The door openings rotate in orientation, changing the view as one walks around, and also distributing structural stress more evenly.',
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
      if (frames.length) g.add(mesh(merge(frames), M.woodRed, 'Door Frame'));
      if (walls.length) g.add(mesh(merge(walls), M.plaster, 'Wall'));
      if (lattices.length) {
        const lm = mesh(merge(lattices), M.lattice, 'Lattice');
        lm.castShadow = false;
        g.add(lm);
      }
      if (papers.length) {
        const pm = mesh(merge(papers), M.paper, 'Paper');
        pm.castShadow = false;
        g.add(pm);
      }
      // 匾额 on the front face of the ground storey
      if (si === 0) {
        const pl = F.plaque(S.R, 0, storeyBase + S.colH * 0.98, '');
        g.add(mesh(pl.body, M.woodRed, 'Plaque Frame'));
        const faceMat = M.plaqueFace || M.plaque;
        const fm = mesh(pl.face, faceMat, 'Plaque Face');
        fm.castShadow = false;
        g.add(fm);
      }
    }

    /* ----- 阑额 + 普拍枋 ----- */
    {
      const g = step(key(si, 'beam'), `Storey ${ord} · Architraves`,
        'Column-head connecting ties, supporting the brackets',
        'The "Lan\'e" (Architrave) runs across the column heads, hooping the eight independent columns into a whole. Above it is added a flat and wide "Pupai Fang" (Plate Beam)—a key invention of Liao and Song craftsmen, providing a continuous seat for the bracket sets, allowing the load to be transmitted laterally along the beam instead of pressing entirely on a single point atop the column. The beam is painted with Xuanzi polychrome, alternating blue and green, with gold traced in the center.',
        'wood');
      g.add(mesh(F.ringBeam(S.R, { h: 0.34 * (1 - si * 0.04), w: 0.17, y: colTop - 0.17 }), M.woodRed, 'Architrave'));
      g.add(mesh(F.caihuaBand(S.R + 0.005, { h: 0.19, y: colTop - 0.17, w: 0.055 }), M.caihua, 'Painted Beam'));
      g.add(mesh(F.plateBeam(S.R, { h: 0.11, w: 0.36, y: colTop + 0.055 }), M.woodRed, 'Plate Beam'));
      // inner ring tie beams
      g.add(mesh(F.ringBeam(S.R * 0.52, { h: 0.26, w: 0.15, y: colTop + 0.10 }), M.woodRed, 'Inner Architrave'));
    }

    const bracketY = colTop + 0.11;

    /* ----- 斗拱 ----- */
    {
      const mergedCap = GRAIN[si].dg === 'cap';
      const g = step(key(si, 'dg'),
        mergedCap ? `Storey ${ord} · Brackets & Eaves` : `Storey ${ord} · Brackets`,
        si === 0 ? '5-step double-cantilever, column + inter-bay + corner'
          : (mergedCap ? 'Brackets, eaves, and deck raised together' : '5-step sets, reducing outward jumps per storey'),
        si === 0
          ? 'The "Dougong" (Bracket Set) is the heart of Chinese timber framing. The base block sits on the column, and cantilever arms project outwards layer by layer. Each projection is a "jump"; two jumps make a "5-step set". It transfers the roof\'s weight diagonally back to the column core while supporting deep overhangs. All members are joined by mortise and tenon without a single nail—during an earthquake, the joints can shift slightly to dissipate energy, acting as a natural seismic isolator.'
          : 'Upper storey brackets gradually reduce their jumps, projecting less and using smaller timber. This echoes the tapering of the pagoda body and brings the eaves inward layer by layer, forming the pagoda\'s famous tapering silhouette. The eaves and deck are immediately erected above the brackets, completing a storey.',
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
      g.add(mesh(F.ringBeam(S.R + reach, { h: cai.h, w: cai.f(10), y: bracketY + merged.top - cai.h * 0.4 }), M.woodRed, 'Eave Tie'));
      g.add(mesh(F.ringBeam(S.R + reach * 0.5, { h: cai.h, w: cai.f(10), y: bracketY + merged.top - cai.h * 1.9 }), M.woodRed, 'Luohan Tie'));
      S._reach = reach;
      S._bracketTop = bracketY + merged.top;
    }

    /* ----- 梁架 (top storey only, visible under the big roof) ----- */
    if (S.isTop) {
      const g = step(key(si, 'liang'), 'Top Storey · Frame & Coffered Ceiling',
        'Diagonal beams + Octagonal coffered ceiling',
        'How does an octagonal roof taper to a point? With "Mojiao" (Corner-cut) diagonal beams—spanning across two faces, cutting off the corners, shrinking the octagon layer by layer into a smaller one, until it can be capped by a central king post. The center features a "Zaojing" (Coffered Ceiling), stacked and shrinking like a dome, serving both as decoration and locking the top members together.',
        'wood');
      g.add(mesh(N.diagonalBeams(S.R * 0.82, S._bracketTop + 0.10, { shrink: 0.66 }), M.woodBare, 'Diagonal Beam'));
      g.add(mesh(N.shortPosts(S.R * 0.46, S._bracketTop + 0.24, 0.44), M.woodBare, 'Short Post'));
      g.add(mesh(N.diagonalBeams(S.R * 0.50, S._bracketTop + 0.70, { shrink: 0.66, w: 0.12, h: 0.20 }), M.woodBare, 'Inner Diagonal'));
      g.add(mesh(N.zaojing(S.R * 0.44, S._bracketTop + 0.30, { depth: 0.52 }), M.woodRed, 'Coffered Ceiling'));
    }

    /* ----- 屋檐 / 屋顶 ----- */
    {
      const isTop = S.isTop;
      const mergedCap = GRAIN[si].roof === 'cap';
      const g = step(key(si, 'roof'),
        isTop ? 'Top Roof · Pyramidal Roof' : (mergedCap ? `Storey ${ord} · Eaves & Deck` : `Storey ${ord} · Eaves`),
        isTop ? 'Octagonal pyramidal roof, curved profile, upturned eaves'
          : (mergedCap ? 'Eaves, deck, and balustrade completed together' : 'Curved eaves, barrel tiles and end-discs'),
        isTop
          ? 'The roof surface is not a flat plane, but a curve. Craftsmen first set the "Rise", then place each purlin slightly lower than a straight line—this is called "Juzhe" (Rise and Fold), causing the roof to slightly concave: the gentle eaves throw water far, while the steep ridge facilitates drainage. The corners of the eaves must also "Qi Qiao" (lift up) and "Chu Qiao" (push out), making the corner wings sweep upward like a bird in flight.'
          : '"Yaoyan" are the small individual eaves of each storey. The deep overhang throws rainwater away from the columns and base; the shadow beneath the eaves protects the timber from sun exposure, the most simple path to durability. The end of each ridge of barrel tiles is capped with a round disc, and a drip tile hangs between the seams.',
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
      const g = step(key(si, 'pz'), `Storey ${ord} · Deck & Balustrade`,
        'Cantilevered blind-storey + Handrail balustrade',
        'The "Pingzuo" (Flat-seat) is a blind storey sandwiched between two floors, using a ring of short columns and brackets to cantilever the floorboards outside the tower body, forming a wrap-around corridor. It is also a structural reinforcing ring—dense short columns and interwoven diagonal braces act like a belt tied around the pagoda. The outer edge is fitted with a balustrade: the newel posts have lotus-petal heads, with pierced panels embedded in between.',
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
      g.add(mesh(deck, M.woodRed, 'Deck Floorboards'));
      // balustrade on the deck
      const bal = B.balustrade(deckR, { h: 0.62, openFace: -1, inset: 0.16 });
      const balY = pzY + S.pingzuoH + pzMerged.top + 0.20;
      g.add(instances(bal.postGeo, M.woodRed,
        bal.posts.map(p => ({ p: [p.p[0], balY, p.p[2]], r: p.r }))));
      const railG = bal.railGeo;
      railG.translate(0, balY, 0);
      g.add(mesh(railG, M.woodRed, 'Balustrade'));
      Y = balY + 0.10;
    } else {
      Y = S._roofTopY;
    }
  });

  /* ---------- FINAL STEP · 塔刹 ------------------------------------------ */
  {
    const g = step('finial', 'Finial · Discs & Jewel',
      'Inverted Bowl, Lotus, 7 Discs, Crowning Jewel',
      'The "Finial" is the crown of the pagoda, and also its religious essence—a miniature stupa. From bottom to top: Base, Inverted Bowl, Upward Lotus, Seven-layer Discs, Halo, Crescent, Canopy, and a final Crowning Jewel touching the sky. A central mast plunges straight into the roof frame, with iron chains anchoring it to the hip ridges around it, fixing it while allowing slight sway in the wind. The tip also acts as a lightning rod: for over a thousand years, lightning has been conducted into the ground via the chains, allowing the timber pagoda to survive.',
      'gold');
    const top = sched[sched.length - 1];
    const fin = N.finial(M, { scale: 1.0, rings: 7 });
    fin.position.y = top._roofTopY - 0.06;
    g.add(fin);
    // guy chains to the hip tips
    const chainTop = fin.position.y + fin.userData.height * 0.62;
    g.add(mesh(
      N.guyChains(chainTop, top._eaveR * 0.92, top._bracketTop + top._roof.userData.eaveY + 0.42, { sag: 0.34 }),
      M.bronze, 'Iron Chains'));
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
