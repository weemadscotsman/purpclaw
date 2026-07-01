/* three-viz.jsx — real Three.js scenes for every visual in the mockups.
 * One generic <ThreeScene/> harness + scene builders:
 *   constellation  — service node network (Mission Control + Cockpit)
 *   burst          — agent particle streams radiating from origin
 *   shield         — concentric hex shield (Risk Gate)
 *   wave           — dream-swarm flowing wave lines
 *   spiral         — orchestration particle galaxy
 *   tower          — 3D agent tower (stacked glowing floors)
 *   brain          — self-evolution point-cloud brain
 *   threads        — memory thread point network
 *   halo           — voice ring
 *   core           — goop broker rotating core
 */

const PURP = 0xa855f7, MAG = 0xe879f9, CYN = 0x22d3ee, PNK = 0xec4899, GRN = 0x4ade80;

function ThreeScene({ build, className, style }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !window.THREE) return;
    const w = el.clientWidth || 300, h = el.clientHeight || 200;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    const ctx = { scene, camera, renderer, w, h };
    const update = build(ctx) || (() => {});
    let raf, dead = false;
    const t0 = performance.now();
    function loop() {
      if (dead) return;
      update((performance.now() - t0) / 1000);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }
    loop();
    const ro = new ResizeObserver(() => {
      const nw = el.clientWidth, nh = el.clientHeight;
      if (!nw || !nh) return;
      camera.aspect = nw / nh; camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    ro.observe(el);
    return () => {
      dead = true; cancelAnimationFrame(raf); ro.disconnect();
      renderer.dispose();
      scene.traverse(o => { o.geometry?.dispose?.(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m?.dispose?.()); });
      el.contains(renderer.domElement) && el.removeChild(renderer.domElement);
    };
  }, [build]);
  return <div ref={ref} className={className} style={{ position: 'absolute', inset: 0, ...style }} />;
}

// ── helpers ──
function glowSprite(color, size = 1) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  const col = new THREE.Color(color);
  grad.addColorStop(0, `rgba(${col.r*255|0},${col.g*255|0},${col.b*255|0},1)`);
  grad.addColorStop(0.35, `rgba(${col.r*255|0},${col.g*255|0},${col.b*255|0},0.5)`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sp.scale.setScalar(size);
  return sp;
}

// ════════ constellation — network of service nodes ════════
function buildConstellation({ scene, camera }) {
  camera.position.set(0, 0, 14);
  const N = 16, nodes = [];
  const group = new THREE.Group(); scene.add(group);
  const colors = [CYN, PURP, MAG, PNK, CYN, PURP];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, r = 3.4 + Math.sin(i * 2.7) * 1.8;
    const p = new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 1.3) * (r * 0.55), (Math.sin(i * 1.9) * 2));
    const col = colors[i % colors.length];
    const s = glowSprite(col, 0.55 + (i % 3) * 0.22);
    s.position.copy(p); group.add(s);
    nodes.push({ p, s, ph: Math.random() * 6 });
  }
  const linePos = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    if (nodes[i].p.distanceTo(nodes[j].p) < 4.6) linePos.push(nodes[i].p, nodes[j].p);
  }
  const lg = new THREE.BufferGeometry().setFromPoints(linePos);
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: PURP, transparent: true, opacity: 0.28 }));
  group.add(lines);
  return (t) => {
    group.rotation.y = t * 0.12;
    group.rotation.x = Math.sin(t * 0.18) * 0.12;
    nodes.forEach(n => { const k = 1 + Math.sin(t * 2 + n.ph) * 0.22; n.s.scale.setScalar(k * (0.55 + 0.2)); });
  };
}

// ════════ burst — agent particle streams ════════
function buildBurst({ scene, camera }) {
  camera.position.set(0, 0, 13);
  const COUNT = 700;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3), col = new Float32Array(COUNT * 3), seed = [];
  const palette = [new THREE.Color(CYN), new THREE.Color(MAG), new THREE.Color(PURP), new THREE.Color(0xffffff)];
  for (let i = 0; i < COUNT; i++) {
    const dir = new THREE.Vector3((Math.random() * 1.6 + 0.2), (Math.random() - 0.45) * 1.1, (Math.random() - 0.5) * 0.7).normalize();
    seed.push({ dir, speed: 1.6 + Math.random() * 4, off: Math.random() * 10 });
    const c = palette[i % palette.length];
    col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.position.x = -6.5;
  scene.add(pts);
  const origin = glowSprite(0xffffff, 1.6); origin.position.x = -6.5; scene.add(origin);
  return (t) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      const s = seed[i], d = ((t * s.speed + s.off) % 13);
      p[i*3]   = s.dir.x * d;
      p[i*3+1] = s.dir.y * d + Math.sin(t * 2 + s.off) * 0.06;
      p[i*3+2] = s.dir.z * d;
    }
    geo.attributes.position.needsUpdate = true;
  };
}

// ════════ shield — concentric hex risk shield ════════
function buildShield({ scene, camera }) {
  camera.position.set(0, 0, 9);
  const group = new THREE.Group(); scene.add(group);
  const rings = [];
  for (let i = 0; i < 4; i++) {
    const r = 1.1 + i * 0.75;
    const shape = [];
    for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; shape.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
    const g = new THREE.BufferGeometry().setFromPoints(shape);
    const m = new THREE.Line(g, new THREE.LineBasicMaterial({ color: i % 2 ? CYN : PURP, transparent: true, opacity: 0.85 - i * 0.16 }));
    m.position.z = -i * 0.4;
    group.add(m); rings.push(m);
  }
  const coreGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.18, 6);
  const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: PURP, transparent: true, opacity: 0.32 }));
  core.rotation.x = Math.PI / 2; core.rotation.y = Math.PI / 6;
  group.add(core);
  group.add(glowSprite(MAG, 2.6));
  return (t) => {
    rings.forEach((r, i) => { r.rotation.z = t * (0.12 + i * 0.07) * (i % 2 ? -1 : 1); const k = 1 + Math.sin(t * 1.6 + i) * 0.04; r.scale.setScalar(k); });
    core.rotation.z = t * 0.2;
    group.rotation.y = Math.sin(t * 0.4) * 0.28;
    group.rotation.x = Math.cos(t * 0.3) * 0.14;
  };
}

// ════════ wave — dream swarm flowing lines ════════
function buildWave({ scene, camera }) {
  camera.position.set(0, 0.6, 8);
  const LINES = 14, SEG = 90;
  const group = new THREE.Group(); scene.add(group);
  const meta = [];
  for (let l = 0; l < LINES; l++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
    const frac = l / LINES;
    const color = new THREE.Color(CYN).lerp(new THREE.Color(MAG), frac);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.18 + 0.5 * Math.sin(frac * Math.PI) }));
    group.add(line);
    meta.push({ g, off: l * 0.42, z: (frac - 0.5) * 2.4 });
  }
  return (t) => {
    meta.forEach(({ g, off, z }) => {
      const p = g.attributes.position.array;
      for (let i = 0; i <= SEG; i++) {
        const x = (i / SEG) * 12 - 6;
        p[i*3] = x;
        p[i*3+1] = Math.sin(x * 0.7 + t * 1.4 + off) * 0.8 * Math.sin(t * 0.5 + off)
                 + Math.sin(x * 1.7 - t * 0.9 + off * 2) * 0.35;
        p[i*3+2] = z;
      }
      g.attributes.position.needsUpdate = true;
    });
    group.rotation.x = -0.25;
  };
}

// ════════ spiral — orchestration galaxy ════════
function buildSpiral({ scene, camera }) {
  camera.position.set(0, 4.5, 8);
  camera.lookAt(0, 0, 0);
  const COUNT = 1600;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3), col = new Float32Array(COUNT * 3);
  const cIn = new THREE.Color(MAG), cOut = new THREE.Color(CYN);
  const seeds = [];
  for (let i = 0; i < COUNT; i++) {
    const arm = i % 3, frac = Math.random();
    const a = frac * Math.PI * 4 + arm * (Math.PI * 2 / 3);
    const r = frac * 4.4 + 0.15;
    seeds.push({ a, r, y: (Math.random() - 0.5) * 0.4 * (1 - frac), sp: 0.35 - frac * 0.2 });
    const c = cIn.clone().lerp(cOut, frac);
    col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.055, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(pts);
  scene.add(glowSprite(MAG, 1.8));
  return (t) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i], a = s.a + t * s.sp;
      p[i*3] = Math.cos(a) * s.r;
      p[i*3+1] = s.y;
      p[i*3+2] = Math.sin(a) * s.r;
    }
    geo.attributes.position.needsUpdate = true;
  };
}

// ════════ tower — 3D agent tower ════════
function buildTower({ scene, camera }) {
  camera.position.set(4.2, 3.2, 7.5);
  camera.lookAt(0, 1.8, 0);
  scene.add(new THREE.AmbientLight(0x8855cc, 0.8));
  const key = new THREE.PointLight(MAG, 60, 40); key.position.set(4, 6, 5); scene.add(key);
  const fill = new THREE.PointLight(CYN, 25, 30); fill.position.set(-4, 1, 4); scene.add(fill);
  const group = new THREE.Group(); scene.add(group);
  const FLOORS = 7, floors = [];
  for (let i = 0; i < FLOORS; i++) {
    const r = 1.45 - i * 0.09, y = i * 0.78;
    const geo = new THREE.CylinderGeometry(r, r + 0.06, 0.58, 24, 1, false);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a0b30, emissive: PURP, emissiveIntensity: 0.18 + (i / FLOORS) * 0.5,
      transparent: true, opacity: 0.92, metalness: 0.6, roughness: 0.3,
    });
    const m = new THREE.Mesh(geo, mat); m.position.y = y; group.add(m);
    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(r + 0.04, 0.012, 8, 48),
      new THREE.MeshBasicMaterial({ color: i % 2 ? CYN : MAG, transparent: true, opacity: 0.8 }));
    edge.rotation.x = Math.PI / 2; edge.position.y = y + 0.3; group.add(edge);
    floors.push({ m, edge, ph: i });
  }
  // core beam
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, FLOORS * 0.8 + 1.2, 12),
    new THREE.MeshBasicMaterial({ color: MAG, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending }));
  beam.position.y = FLOORS * 0.39; group.add(beam);
  const apex = glowSprite(MAG, 2.0); apex.position.y = FLOORS * 0.78 + 0.5; group.add(apex);
  // base disc
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.22, 32),
    new THREE.MeshStandardMaterial({ color: 0x120825, emissive: 0x3b1366, emissiveIntensity: 0.5, metalness: 0.7, roughness: 0.35 }));
  base.position.y = -0.5; group.add(base);
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.02, 8, 64), new THREE.MeshBasicMaterial({ color: CYN, transparent: true, opacity: 0.7 }));
  baseRing.rotation.x = Math.PI / 2; baseRing.position.y = -0.38; group.add(baseRing);
  // orbiting agent sparks
  const sparks = [];
  for (let i = 0; i < 10; i++) { const s = glowSprite(i % 2 ? CYN : 0xffffff, 0.32); group.add(s); sparks.push({ s, r: 1.9 + Math.random() * 0.8, y: Math.random() * 5, sp: 0.4 + Math.random() * 0.6, ph: Math.random() * 6 }); }
  return (t) => {
    group.rotation.y = t * 0.22;
    floors.forEach(f => { f.m.material.emissiveIntensity = 0.25 + 0.25 * Math.sin(t * 1.8 + f.ph); });
    beam.material.opacity = 0.4 + 0.25 * Math.sin(t * 3);
    sparks.forEach(sp => { const a = t * sp.sp + sp.ph; sp.s.position.set(Math.cos(a) * sp.r, (sp.y + Math.sin(t * 0.5 + sp.ph)) % 5.2, Math.sin(a) * sp.r); });
  };
}

// ════════ brain — self-evolution point cloud ════════
function buildBrain({ scene, camera }) {
  camera.position.set(0, 0, 6.5);
  const COUNT = 900;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3), col = new Float32Array(COUNT * 3);
  const base = [];
  const cA = new THREE.Color(PURP), cB = new THREE.Color(CYN);
  for (let i = 0; i < COUNT; i++) {
    // two-lobe ellipsoid
    const side = i % 2 ? 1 : -1;
    const u = Math.random() * Math.PI * 2, v = Math.acos(2 * Math.random() - 1);
    const r = 1.5 + (Math.random() - 0.5) * 0.34;
    const x = Math.sin(v) * Math.cos(u) * r * 1.15 + side * 0.45;
    const y = Math.cos(v) * r * 0.85;
    const z = Math.sin(v) * Math.sin(u) * r * 0.9;
    base.push(new THREE.Vector3(x, y, z));
    const c = cA.clone().lerp(cB, Math.random());
    col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(pts);
  // sparse synapse lines
  const lp = [];
  for (let i = 0; i < 130; i++) { const a = base[(Math.random() * COUNT) | 0], b = base[(Math.random() * COUNT) | 0]; if (a.distanceTo(b) < 1.1) lp.push(a, b); }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lp), new THREE.LineBasicMaterial({ color: PURP, transparent: true, opacity: 0.22 }));
  scene.add(lines);
  return (t) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      const b = base[i], k = 1 + 0.035 * Math.sin(t * 2 + i * 0.4);
      p[i*3] = b.x * k; p[i*3+1] = b.y * k; p[i*3+2] = b.z * k;
    }
    geo.attributes.position.needsUpdate = true;
    pts.rotation.y = t * 0.25; lines.rotation.y = t * 0.25;
  };
}

// ════════ threads — memory networks ════════
function buildThreads({ scene, camera }) {
  camera.position.set(0, 0, 10);
  const CL = 4, group = new THREE.Group(); scene.add(group);
  const all = [];
  const cols = [CYN, MAG, PNK, PURP];
  for (let c = 0; c < CL; c++) {
    const cx = (c - (CL - 1) / 2) * 3.2, cy = Math.sin(c * 2.1) * 1.1;
    const pts = [];
    for (let i = 0; i < 26; i++) {
      const p = new THREE.Vector3(cx + (Math.random() - 0.5) * 2.6, cy + (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 2);
      pts.push(p);
      const s = glowSprite(cols[c], 0.16 + Math.random() * 0.2); s.position.copy(p); group.add(s);
    }
    const lp = [];
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (pts[i].distanceTo(pts[j]) < 1.4) lp.push(pts[i], pts[j]);
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lp), new THREE.LineBasicMaterial({ color: cols[c], transparent: true, opacity: 0.2 })));
    all.push(pts);
  }
  return (t) => { group.rotation.y = Math.sin(t * 0.3) * 0.22; group.rotation.x = Math.cos(t * 0.22) * 0.1; };
}

// ════════ halo — voice rings ════════
function buildHalo({ scene, camera }) {
  camera.position.set(0, 0, 7);
  const group = new THREE.Group(); scene.add(group);
  const rings = [];
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1 + i * 0.5, 0.02, 8, 64),
      new THREE.MeshBasicMaterial({ color: i % 2 ? CYN : MAG, transparent: true, opacity: 0.7 - i * 0.12 }));
    group.add(r); rings.push(r);
  }
  group.add(glowSprite(CYN, 1.6));
  return (t) => {
    rings.forEach((r, i) => {
      r.rotation.x = t * 0.3 + i * 0.6; r.rotation.y = t * 0.22 + i * 0.4;
      r.scale.setScalar(1 + Math.sin(t * 2.4 + i) * 0.06);
    });
  };
}

// ════════ core — goop broker core ════════
function buildCore({ scene, camera }) {
  camera.position.set(0, 0, 6);
  scene.add(new THREE.AmbientLight(0x8855cc, 0.7));
  const l = new THREE.PointLight(MAG, 40, 30); l.position.set(3, 3, 4); scene.add(l);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1),
    new THREE.MeshStandardMaterial({ color: 0x2a0a44, emissive: PURP, emissiveIntensity: 0.7, wireframe: false, metalness: 0.8, roughness: 0.25 }));
  scene.add(core);
  const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.45, 1),
    new THREE.MeshBasicMaterial({ color: MAG, wireframe: true, transparent: true, opacity: 0.35 }));
  scene.add(wire);
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.025, 8, 64), new THREE.MeshBasicMaterial({ color: CYN, transparent: true, opacity: 0.7 }));
  const ring2 = ring1.clone(); ring2.material = ring1.material.clone(); ring2.material.color.set(PNK);
  scene.add(ring1, ring2);
  scene.add(glowSprite(MAG, 3.2));
  return (t) => {
    core.rotation.y = t * 0.5; core.rotation.x = t * 0.2;
    wire.rotation.y = -t * 0.3; wire.rotation.z = t * 0.15;
    ring1.rotation.x = Math.PI / 2.4 + Math.sin(t * 0.4) * 0.2; ring1.rotation.y = t * 0.4;
    ring2.rotation.x = -Math.PI / 2.8; ring2.rotation.y = -t * 0.3;
    core.material.emissiveIntensity = 0.55 + 0.3 * Math.sin(t * 2.2);
  };
}

const VIZ = {
  constellation: buildConstellation,
  burst: buildBurst,
  shield: buildShield,
  wave: buildWave,
  spiral: buildSpiral,
  tower: buildTower,
  brain: buildBrain,
  threads: buildThreads,
  halo: buildHalo,
  core: buildCore,
};

function Viz({ kind, style }) {
  const build = React.useMemo(() => VIZ[kind] || buildConstellation, [kind]);
  return <ThreeScene build={build} style={style} />;
}

Object.assign(window, { ThreeScene, Viz, VIZ });
