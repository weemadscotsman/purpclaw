/* skyscraper.jsx — the agent skyscraper, alive
 *
 * What's here that isn't in other "AI dashboards":
 *   - Atmospheric sky behind the tower, mood-shifting with system health
 *   - Distant city silhouette so the tower has a HORIZON
 *   - Ground plane with grid + lobby plaza, jobs arrive at the door
 *   - Helipad + animated billboard on top showing live status
 *   - Floor activity pulses driven by REAL SSE events
 *   - Speech bubbles popping above active agents (real events)
 *   - Mochi as a free-floating sprite near the tower
 *   - Cinematic floor selection — selected floor lifts, others dim
 *   - Smooth camera tweens (rotation + zoom animate to target)
 */

const { useState, useEffect, useRef, useMemo } = React;

// ─────────────────────────────────────────────────────────────
// iso math
// ─────────────────────────────────────────────────────────────
const ISO_C = Math.cos(Math.PI / 6);
const ISO_S = Math.sin(Math.PI / 6);
const W = 200;
const D = 100;
const H = 30;
const TOWER_CX_WORLD = W / 2;
const TOWER_CY_WORLD = D / 2;

function rotateXY(x, y, theta) {
  const dx = x - TOWER_CX_WORLD, dy = y - TOWER_CY_WORLD;
  const cos = Math.cos(theta), sin = Math.sin(theta);
  return [dx * cos - dy * sin + TOWER_CX_WORLD, dx * sin + dy * cos + TOWER_CY_WORLD];
}

function project(x, y, z, theta, cx = 300, cy = 510) {
  const [rx, ry] = rotateXY(x, y, theta);
  return {
    sx: cx + (rx - ry) * ISO_C,
    sy: cy + (rx + ry) * ISO_S - z,
  };
}

// ─────────────────────────────────────────────────────────────
// face geometry
// ─────────────────────────────────────────────────────────────
const FACES = [
  { name: 'front', nx: 0,  ny: -1 },
  { name: 'right', nx: 1,  ny: 0  },
  { name: 'back',  nx: 0,  ny: 1  },
  { name: 'left',  nx: -1, ny: 0  },
];

function sortedFaces(theta) {
  const cos = Math.cos(theta), sin = Math.sin(theta);
  return FACES.map(f => {
    const nx = f.nx * cos - f.ny * sin;
    const ny = f.nx * sin + f.ny * cos;
    return { ...f, depth: nx - ny };
  }).sort((a, b) => a.depth - b.depth);
}

function faceCorners(name, z0, z1) {
  switch (name) {
    case 'front': return [[0,0,z0], [W,0,z0], [W,0,z1], [0,0,z1]];
    case 'right': return [[W,0,z0], [W,D,z0], [W,D,z1], [W,0,z1]];
    case 'back':  return [[W,D,z0], [0,D,z0], [0,D,z1], [W,D,z1]];
    case 'left':  return [[0,D,z0], [0,0,z0], [0,0,z1], [0,D,z1]];
  }
}
function faceUVToWorld(name, u, z) {
  switch (name) {
    case 'front': return [u, 0, z];
    case 'right': return [W, u, z];
    case 'back':  return [W - u, D, z];
    case 'left':  return [0, D - u, z];
  }
}
function faceWidth(name) {
  return name === 'front' || name === 'back' ? W : D;
}

// ─────────────────────────────────────────────────────────────
// colour helpers
// ─────────────────────────────────────────────────────────────
function shade(hex, amt) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substr(0, 2), 16);
  const g = parseInt(h.substr(2, 2), 16);
  const b = parseInt(h.substr(4, 2), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt))));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

// ─────────────────────────────────────────────────────────────
// IsoFloor — single slab
// ─────────────────────────────────────────────────────────────
function IsoFloor({ floor, level, color, selected, hovered, onClick, onHover, dim, showWindows, theta, cx, cy, zOffset = 0, pulse = 0 }) {
  const z0 = (level - 1) * H + zOffset;
  const z1 = z0 + H;
  const ordered = sortedFaces(theta);
  const visibleSideFaces = ordered.slice(2);

  const project_ = (p) => project(p[0], p[1], p[2], theta, cx, cy);

  const baseOp = dim ? 0.28 : (selected ? 1 : (hovered ? 0.94 : 0.82));
  const topFill   = selected ? shade(color, 0.45)  : shade(color, 0.12);
  const sideFills = {
    front: selected ? color : shade(color, -0.3),
    right: selected ? shade(color, -0.15) : shade(color, -0.5),
    back:  shade(color, -0.45),
    left:  shade(color, -0.55),
  };

  const topCorners = [[0,0,z1], [W,0,z1], [W,D,z1], [0,D,z1]];
  const topPts = topCorners.map(p => { const q = project_(p); return `${q.sx},${q.sy}`; }).join(' ');

  const winRows = 2;
  const winColsFor = (name) => (name === 'front' || name === 'back') ? 8 : 4;
  const wH = 8;
  const wMarginZ = 4;
  const wGapZ = 4;

  function renderWindows(name) {
    const cols = winColsFor(name);
    const fw = faceWidth(name);
    const wMarginX = 8;
    const slot = (fw - 2 * wMarginX) / cols;
    const wW = slot * 0.78;
    const wOffsetX = (slot - wW) / 2;

    const totalSlots = winRows * cols;
    let lit;
    if (name === 'front')      lit = Math.min(totalSlots, floor.agents);
    else if (name === 'right') lit = Math.min(totalSlots, Math.ceil(floor.agents / 2));
    else if (name === 'back')  lit = Math.min(totalSlots, Math.ceil(floor.agents * 0.6));
    else                       lit = Math.min(totalSlots, Math.ceil(floor.agents / 2));

    const out = [];
    for (let row = 0; row < winRows; row++) {
      for (let col = 0; col < cols; col++) {
        const u0 = wMarginX + col * slot + wOffsetX;
        const u1 = u0 + wW;
        const zb = z0 + wMarginZ + row * (wH + wGapZ);
        const zt = zb + wH;
        const corners = [
          faceUVToWorld(name, u0, zt),
          faceUVToWorld(name, u1, zt),
          faceUVToWorld(name, u1, zb),
          faceUVToWorld(name, u0, zb),
        ];
        const pts = corners.map(p => { const q = project_(p); return `${q.sx},${q.sy}`; }).join(' ');
        const idx = row * cols + col;
        const isLit = idx < lit;
        // pulse flicker for working agents
        const flickerOp = isLit ? (0.85 + Math.sin((Date.now() / 240) + idx) * 0.15) : 0.65;
        out.push(
          <polygon
            key={`${name}-w-${row}-${col}`}
            points={pts}
            fill={isLit ? color : '#080b1c'}
            opacity={isLit ? (selected ? 1 : flickerOp) : 0.65}
            style={isLit ? { filter: `drop-shadow(0 0 ${selected ? 6 : 2.5}px ${color})` } : null}
          />
        );
      }
    }
    return out;
  }

  function renderFace(face) {
    const corners = faceCorners(face.name, z0, z1);
    const pts = corners.map(p => { const q = project_(p); return `${q.sx},${q.sy}`; }).join(' ');
    return (
      <g key={`face-${face.name}`}>
        <polygon
          points={pts}
          fill={sideFills[face.name]}
          stroke="#060914"
          strokeWidth={0.7}
        />
        {showWindows && renderWindows(face.name)}
      </g>
    );
  }

  // selection ring — orbiting glow around floor base
  const ringCorners = [[-4,-4,z0], [W+4,-4,z0], [W+4,D+4,z0], [-4,D+4,z0]];
  const ringPts = ringCorners.map(p => { const q = project_(p); return `${q.sx},${q.sy}`; }).join(' ');

  // activity pulse ring around top
  const pulseR = 80 + pulse * 60;

  return (
    <g
      opacity={baseOp}
      onClick={onClick}
      onMouseEnter={onHover}
      style={{ cursor: 'pointer', transition: 'opacity 240ms ease' }}
    >
      {/* back-faces */}
      {ordered.slice(0, 2).map(face => {
        const corners = faceCorners(face.name, z0, z1);
        const pts = corners.map(p => { const q = project_(p); return `${q.sx},${q.sy}`; }).join(' ');
        return <polygon key={`back-${face.name}`} points={pts} fill={sideFills[face.name]} stroke="#060914" strokeWidth={0.6} opacity={0.5} />;
      })}
      {/* top */}
      <polygon
        points={topPts}
        fill={topFill}
        stroke={selected ? color : '#060914'}
        strokeWidth={selected ? 1.4 : 0.8}
      />
      {/* visible side faces */}
      {visibleSideFaces.map(face => renderFace(face))}

      {/* selected ring */}
      {selected && (
        <polygon
          points={ringPts}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray="3 4"
          style={{ filter: `drop-shadow(0 0 8px ${color})` }}
        >
          <animate attributeName="stroke-dashoffset" values="0;14" dur="0.9s" repeatCount="indefinite" />
        </polygon>
      )}

      {/* activity ring — when SSE event hits this floor */}
      {pulse > 0.05 && (() => {
        const center = project_([W/2, D/2, z0 + H/2]);
        return (
          <circle
            cx={center.sx}
            cy={center.sy}
            r={pulseR}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            opacity={pulse * 0.9}
            style={{ filter: `drop-shadow(0 0 ${pulse * 18}px ${color})` }}
          />
        );
      })()}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────
// Helipad + Billboard on top
// ─────────────────────────────────────────────────────────────
function HelipadAndBillboard({ topLevel, theta, cx, cy, statusText, statusColor, recentSpawnTs }) {
  const topZ = topLevel * H;

  // helipad: rectangle on top with H mark
  const helipadCorners = [
    [W/2 - 22, D/2 - 16, topZ + 1],
    [W/2 + 22, D/2 - 16, topZ + 1],
    [W/2 + 22, D/2 + 16, topZ + 1],
    [W/2 - 22, D/2 + 16, topZ + 1],
  ];
  const helipadPts = helipadCorners.map(p => { const q = project(p[0], p[1], p[2], theta, cx, cy); return `${q.sx},${q.sy}`; }).join(' ');
  const helipadCenter = project(W/2, D/2, topZ + 1, theta, cx, cy);

  // antenna mast
  const mastBase = project(W/2, D/2, topZ, theta, cx, cy);
  const mastTip  = project(W/2, D/2, topZ + 80, theta, cx, cy);
  const mastMid  = project(W/2, D/2, topZ + 50, theta, cx, cy);

  // billboard panel — large rectangular sign attached to mast
  const billboardZ = topZ + 50;
  const billboardCorners = [
    [W/2 - 30, D/2,      billboardZ],
    [W/2 + 30, D/2,      billboardZ],
    [W/2 + 30, D/2,      billboardZ + 22],
    [W/2 - 30, D/2,      billboardZ + 22],
  ];
  const billboardPts = billboardCorners.map(p => { const q = project(p[0], p[1], p[2], theta, cx, cy); return `${q.sx},${q.sy}`; }).join(' ');
  const billboardCenter = project(W/2, D/2, billboardZ + 11, theta, cx, cy);

  // arriving helicopter pellet — animated based on recent spawn timestamp
  const spawnAge = recentSpawnTs ? Date.now() - recentSpawnTs : 99999;
  const showHeli = spawnAge < 4500;
  const heliProgress = showHeli ? Math.min(1, spawnAge / 1500) : 1;
  const heliApproachStart = project(W/2 + 280, D/2 - 220, topZ + 80, theta, cx, cy);
  const heliPos = {
    sx: heliApproachStart.sx + (helipadCenter.sx - heliApproachStart.sx) * heliProgress,
    sy: heliApproachStart.sy + (helipadCenter.sy - heliApproachStart.sy) * heliProgress,
  };

  return (
    <g>
      {/* helipad surface */}
      <polygon points={helipadPts} fill="#0c1129" stroke="rgba(168,85,247,0.35)" strokeWidth={0.8} />
      {/* H glyph */}
      <text x={helipadCenter.sx} y={helipadCenter.sy + 3} textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="rgba(168,85,247,0.6)">H</text>

      {/* mast */}
      <line x1={mastBase.sx} y1={mastBase.sy} x2={mastTip.sx} y2={mastTip.sy} stroke="rgba(34, 211, 238, 0.55)" strokeWidth={1.2} />
      <circle cx={mastTip.sx} cy={mastTip.sy} r={2.5} fill="#22d3ee">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite" />
      </circle>
      <circle cx={mastMid.sx} cy={mastMid.sy} r={1.5} fill="#22d3ee" opacity={0.7} />

      {/* billboard panel */}
      <polygon points={billboardPts}
        fill="rgba(7, 10, 26, 0.92)"
        stroke={statusColor}
        strokeWidth={0.8}
        style={{ filter: `drop-shadow(0 0 8px ${statusColor})` }}
      />
      <text
        x={billboardCenter.sx}
        y={billboardCenter.sy + 3}
        textAnchor="middle"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
        letterSpacing="0.18em"
        fill={statusColor}
        style={{ filter: `drop-shadow(0 0 4px ${statusColor})` }}
      >
        {(statusText || 'OPERATIONAL').slice(0, 24).toUpperCase()}
      </text>

      {/* incoming helicopter pellet */}
      {showHeli && (
        <g>
          <circle cx={heliPos.sx} cy={heliPos.sy} r={5} fill="#22d3ee" opacity={0.95}
            style={{ filter: 'drop-shadow(0 0 10px #22d3ee)' }} />
          <circle cx={heliPos.sx} cy={heliPos.sy} r={12} fill="none" stroke="#22d3ee" strokeWidth={0.8} opacity={0.4} />
          <line x1={heliApproachStart.sx} y1={heliApproachStart.sy} x2={heliPos.sx} y2={heliPos.sy}
            stroke="#22d3ee" strokeWidth={0.6} strokeDasharray="2 2" opacity={0.4} />
        </g>
      )}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────
// Ground plane — extends out from the tower base
// ─────────────────────────────────────────────────────────────
function GroundPlane({ theta, cx, cy }) {
  const radius = 320;
  // big diamond plate
  const corners = [
    [-radius, -radius, 0],
    [W + radius, -radius, 0],
    [W + radius, D + radius, 0],
    [-radius, D + radius, 0],
  ];
  const pts = corners.map(p => { const q = project(p[0], p[1], p[2], theta, cx, cy); return `${q.sx},${q.sy}`; }).join(' ');

  // grid lines
  const lines = [];
  for (let i = -radius; i <= W + radius; i += 50) {
    const a = project(i, -radius, 0, theta, cx, cy);
    const b = project(i, D + radius, 0, theta, cx, cy);
    lines.push(<line key={`v-${i}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy}
      stroke="rgba(168, 85, 247, 0.18)" strokeWidth={0.5} />);
  }
  for (let j = -radius; j <= D + radius; j += 50) {
    const a = project(-radius, j, 0, theta, cx, cy);
    const b = project(W + radius, j, 0, theta, cx, cy);
    lines.push(<line key={`h-${j}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy}
      stroke="rgba(168, 85, 247, 0.18)" strokeWidth={0.5} />);
  }

  return (
    <g>
      <polygon points={pts} fill="url(#groundFade)" opacity={0.85} />
      <g style={{ mask: 'url(#groundMask)' }}>{lines}</g>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────
// Lobby plaza — front of building
// ─────────────────────────────────────────────────────────────
function LobbyPlaza({ theta, cx, cy, online }) {
  // a small entrance road extending from the front door
  const corners = [
    [W*0.3, -80, 0],
    [W*0.7, -80, 0],
    [W*0.65, -10, 0],
    [W*0.35, -10, 0],
  ];
  const pts = corners.map(p => { const q = project(p[0], p[1], p[2], theta, cx, cy); return `${q.sx},${q.sy}`; }).join(' ');

  // door light spilling out
  const doorCenter = project(W/2, 0, 8, theta, cx, cy);

  return (
    <g>
      <polygon points={pts} fill={online ? 'rgba(103, 232, 249, 0.08)' : 'rgba(50, 50, 70, 0.08)'} stroke={online ? 'rgba(103, 232, 249, 0.4)' : 'var(--line)'} strokeWidth={0.6} />
      {online && (
        <>
          <ellipse cx={doorCenter.sx} cy={doorCenter.sy + 12} rx={28} ry={6} fill="rgba(103, 232, 249, 0.35)">
            <animate attributeName="opacity" values="0.4;0.7;0.4" dur="3s" repeatCount="indefinite" />
          </ellipse>
        </>
      )}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────
// Speech bubble — pops above a floor when SSE event hits an agent there
// ─────────────────────────────────────────────────────────────
function SpeechBubble({ floor, message, theta, cx, cy, age }) {
  const z = floor.level * H + 8;
  const anchor = project(W, 0, z, theta, cx, cy);
  const lift = Math.min(24, age * 0.06);
  const op = Math.max(0, 1 - age / 3500);
  if (op <= 0) return null;
  const text = String(message || '').slice(0, 28);
  const w = Math.max(60, text.length * 5 + 18);
  const x = anchor.sx + 14;
  const y = anchor.sy - 16 - lift;
  return (
    <g opacity={op} pointerEvents="none">
      <line x1={anchor.sx + 2} y1={anchor.sy} x2={x} y2={y + 12} stroke="rgba(255,255,255,0.3)" strokeWidth={0.5} />
      <rect x={x} y={y} width={w} height={18} rx={3}
        fill="rgba(8, 11, 28, 0.92)"
        stroke="var(--cyan)"
        strokeWidth={0.8}
        style={{ filter: 'drop-shadow(0 0 4px rgba(34, 211, 238, 0.5))' }} />
      <text x={x + 8} y={y + 12} fontSize="8" fontFamily="JetBrains Mono, monospace" fill="var(--text)">
        {text}
      </text>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────
// Sky — animated atmospheric background (in DOM, behind SVG)
// ─────────────────────────────────────────────────────────────
function Sky({ healthTone }) {
  // tone: 'good' | 'warn' | 'bad'
  const palette = {
    good: ['#0a0b22', '#1a0f38', '#3a1a5e'],
    warn: ['#1a1108', '#3a1e08', '#5a2a08'],
    bad:  ['#220808', '#3a0a0e', '#5a0a18'],
  }[healthTone] || ['#0a0b22', '#1a0f38', '#3a1a5e'];

  return (
    <div className="tower-sky">
      <div
        className="tower-sky-grad"
        style={{
          background: `radial-gradient(ellipse 120% 80% at 50% 110%, ${palette[2]}, ${palette[1]} 35%, ${palette[0]} 75%, transparent 100%)`,
        }}
      />
      <div className="tower-sky-stars" />
      <div className="tower-sky-fog" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Mochi sprite — floating presence near the tower
// ─────────────────────────────────────────────────────────────
function MochiPresence({ mochi }) {
  if (!mochi.connected || !mochi.data) return null;
  const m = mochi.data;
  const SPECIES_EMOJI = {
    duck: '🦆', goose: '🪿', blob: '🟣', cat: '🐱', dragon: '🐉',
    octopus: '🐙', owl: '🦉', penguin: '🐧', turtle: '🐢', snail: '🐌',
    ghost: '👻', axolotl: '🦎', capybara: '🐹', cactus: '🌵', robot: '🤖',
    rabbit: '🐰', mushroom: '🍄', chonk: '🐻',
  };
  return (
    <div className="mochi-presence" title={`${m.name} · ${m.mood || 'curious'}`}>
      <div className="mochi-emoji">{SPECIES_EMOJI[m.species] || '◉'}</div>
      <div className="mochi-name">{m.name}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// useTween — smoothly animate a value toward target
// ─────────────────────────────────────────────────────────────
function useTween(target, durMs = 380) {
  const [current, setCurrent] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(null);
  useEffect(() => {
    fromRef.current = current;
    startRef.current = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - startRef.current) / durMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setCurrent(fromRef.current + (target - fromRef.current) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durMs]);
  return current;
}

// ─────────────────────────────────────────────────────────────
// IsoTower — the building, its environment, and its life
// ─────────────────────────────────────────────────────────────
function IsoTower({
  floors, divisions, selected, onSelect, showWindows = true,
  rotation, onRotate, zoom = 1, setZoom, pan = { x: 0, y: 0 }, setPan,
  mochi, stream, healthTone = 'good', statusText, statusColor,
}) {
  const [hovered, setHovered] = useState(null);
  const dragRef = useRef(null);
  const svgRef = useRef(null);

  // smooth camera tween
  const theta = (useTween(rotation, 320) * Math.PI) / 180;
  const tweenZoom = useTween(zoom, 280);

  const cx = 300, cy = 510;

  const drawOrder = useMemo(() => floors.slice().sort((a, b) => a.level - b.level), [floors]);

  // anchored viewBox — keep tower center in view as we zoom
  const baseW = 600, baseH = 720;
  const numFloors = Math.max(floors.length, 1);
  const towerTopScreenY = cy - numFloors * H;
  const towerBotScreenY = cy + (W + D) * ISO_S;
  const towerCenterX = cx;
  const towerCenterY = (towerTopScreenY + towerBotScreenY) / 2;
  const vbW = baseW / tweenZoom;
  const vbH = baseH / tweenZoom;
  const vbX = towerCenterX - vbW / 2 + pan.x;
  const vbY = towerCenterY - vbH / 2 + pan.y;
  const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`;

  // wheel zoom
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !setZoom) return;
    const handler = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const next = Math.max(0.4, Math.min(6, zoomRef.current * factor));
      setZoom(next);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [setZoom]);

  // drag — plain rotates, shift+drag pans
  const onPointerDown = (e) => {
    if (e.target.closest('[data-floor]')) return;
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startRot: rotation, startPan: { ...pan },
      moved: false, mode: e.shiftKey ? 'pan' : 'rotate',
    };
    if (svgRef.current?.setPointerCapture) {
      svgRef.current.setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
    if (dragRef.current.mode === 'pan' && setPan) {
      const rect = svgRef.current.getBoundingClientRect();
      const scale = vbW / Math.max(rect.width, 1);
      setPan({
        x: dragRef.current.startPan.x - dx * scale,
        y: dragRef.current.startPan.y - dy * scale,
      });
    } else {
      onRotate(((dragRef.current.startRot + dx * 0.6) % 360 + 360) % 360);
    }
  };
  const onPointerUp = (e) => {
    dragRef.current = null;
    if (svgRef.current?.releasePointerCapture) {
      try { svgRef.current.releasePointerCapture(e.pointerId); } catch {}
    }
  };

  // floor activity — agents involved in recent events
  const [pulses, setPulses] = useState({});
  const [bubbles, setBubbles] = useState([]);
  useEffect(() => {
    if (!stream || stream.events.length === 0) return;
    const ev = stream.events[0];
    const agentName = ev.agentName || ev.name || ev.from;
    if (!agentName) return;
    // find the floor for this agent
    const floor = floors.find(f => (f.divisionAgents || []).some(a => a.name === agentName));
    if (!floor) return;
    const now = Date.now();
    setPulses(prev => ({ ...prev, [floor.id]: now }));
    // bubble
    const message = ev.output || ev.message || ev.task || ev.type || '';
    if (message) {
      setBubbles(prev => [{
        id: `${now}-${Math.random()}`,
        floorId: floor.id,
        floor,
        message,
        born: now,
      }, ...prev].slice(0, 6));
    }
  }, [stream?.events.length, floors]);

  // decay
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setPulses(prev => {
        const next = {};
        for (const [id, born] of Object.entries(prev)) {
          if (now - born < 4000) next[id] = born;
        }
        return next;
      });
      setBubbles(prev => prev.filter(b => now - b.born < 3500));
    }, 300);
    return () => clearInterval(t);
  }, []);

  // most-recent spawn (for helicopter)
  const recentSpawnTs = useMemo(() => {
    if (!stream) return null;
    const ev = stream.events.find(e => e.type === 'agent_spawned' || e.type === 'tower_agent_spawned');
    if (!ev) return null;
    return ev._time?.getTime?.() || Date.now();
  }, [stream?.events]);

  // a flag to keep re-rendering for time-based animations
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick(x => (x + 1) % 1000), 240);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="tower-scene">
      <Sky healthTone={healthTone} />
      <MochiPresence mochi={mochi || { connected: false }} />
      <svg
        ref={svgRef}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', cursor: dragRef.current?.mode === 'pan' ? 'grabbing' : 'grab', touchAction: 'none', position: 'relative', zIndex: 2 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <radialGradient id="groundGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#a855f7" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="groundFade" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#0c1029" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#0c1029" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#0c1029" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="groundMask">
            <stop offset="0%"  stopColor="white" stopOpacity="0.7" />
            <stop offset="60%" stopColor="white" stopOpacity="0.25" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="groundMask" maskUnits="userSpaceOnUse" x="-400" y="-200" width="1400" height="1400">
            <rect x="-400" y="-200" width="1400" height="1400" fill="url(#groundMask)" />
          </mask>
        </defs>

        {/* GROUND */}
        <GroundPlane theta={theta} cx={cx} cy={cy} />

        {/* LOBBY PLAZA */}
        <LobbyPlaza theta={theta} cx={cx} cy={cy} online={healthTone === 'good'} />

        {/* shadow under tower */}
        <ellipse cx={cx} cy={cy + 70} rx={210} ry={42} fill="url(#groundGlow)" />

        {/* FLOORS */}
        {drawOrder.map((floor) => {
          const div = divisions[floor.div];
          const isSelected = selected === floor.id;
          const isHovered  = hovered === floor.id;
          const dimOthers  = selected && !isSelected;
          // lifted floor when selected — drawer effect
          const aboveSelected = selected ? floor.level > drawOrder.find(f => f.id === selected).level : false;
          const zOffset = aboveSelected ? 6 : 0;
          const pulseAge = pulses[floor.id] ? (Date.now() - pulses[floor.id]) : 9999;
          const pulse = pulseAge < 4000 ? 1 - pulseAge / 4000 : 0;
          return (
            <g key={floor.id} data-floor={floor.id}>
              <IsoFloor
                floor={floor}
                level={floor.level}
                color={div.color}
                selected={isSelected}
                hovered={isHovered}
                dim={dimOthers}
                showWindows={showWindows}
                theta={theta}
                cx={cx}
                cy={cy}
                zOffset={zOffset}
                pulse={pulse}
                onClick={(e) => { e.stopPropagation(); if (!dragRef.current?.moved) onSelect(floor.id); }}
                onHover={() => setHovered(floor.id)}
              />
            </g>
          );
        })}

        {/* HELIPAD + BILLBOARD */}
        <HelipadAndBillboard
          topLevel={floors.length}
          theta={theta}
          cx={cx}
          cy={cy}
          statusText={statusText}
          statusColor={statusColor}
          recentSpawnTs={recentSpawnTs}
        />

        {/* SPEECH BUBBLES */}
        {bubbles.map(b => (
          <SpeechBubble
            key={b.id}
            floor={b.floor}
            message={b.message}
            theta={theta}
            cx={cx}
            cy={cy}
            age={Date.now() - b.born}
          />
        ))}

        {/* selected floor side label */}
        {selected && drawOrder.filter(f => f.id === selected).map((floor) => {
          const div = divisions[floor.div];
          const z = floor.level * H - H / 2;
          const ordered = sortedFaces(theta);
          const frontFace = ordered[3];
          let tagWorld;
          switch (frontFace.name) {
            case 'front': tagWorld = [W + 4, 0, z]; break;
            case 'right': tagWorld = [W + 4, D + 4, z]; break;
            case 'back':  tagWorld = [-4, D + 4, z]; break;
            case 'left':  tagWorld = [-4, 0, z]; break;
          }
          const p = project(tagWorld[0], tagWorld[1], tagWorld[2], theta, cx, cy);
          return (
            <g key={`tag-${floor.id}`} pointerEvents="none">
              <line x1={p.sx - 16} y1={p.sy} x2={p.sx} y2={p.sy} stroke={div.color} strokeWidth={1} opacity={0.6} />
              <text x={p.sx + 6} y={p.sy + 3} fontSize="10" fontFamily="JetBrains Mono, monospace"
                    letterSpacing="0.12em" fill={div.color}
                    style={{ filter: `drop-shadow(0 0 5px ${div.color})` }}>
                FL.{String(floor.level).padStart(2, '0')} · {div.name.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FloorSpine
// ─────────────────────────────────────────────────────────────
function FloorSpine({ floors, divisions, selected, onSelect }) {
  return (
    <div className="spine">
      <div className="spine-h">
        <span>Floors</span>
        <span>{floors.length}</span>
      </div>
      {floors.map((floor) => {
        const div = divisions[floor.div];
        const isSel = selected === floor.id;
        return (
          <button
            key={floor.id}
            className={`spine-row${isSel ? ' active' : ''}`}
            onClick={() => onSelect(floor.id)}
            style={{
              borderColor: isSel ? div.color : 'transparent',
              boxShadow: isSel ? `0 0 16px ${div.color}40, inset 0 0 8px ${div.color}20` : 'none',
            }}
          >
            <span className="floor-stripe" style={{ background: div.color, boxShadow: `0 0 8px ${div.color}` }} />
            <span style={{ color: div.color, fontFamily: 'var(--font-mono)', fontSize: 10, width: 22 }}>
              {String(floor.level).padStart(2, '0')}
            </span>
            <span className="floor-name" style={{ color: isSel ? div.color : 'var(--text-2)', textShadow: isSel ? `0 0 6px ${div.color}` : 'none' }}>
              {div.name}
            </span>
            <span className="floor-count">{floor.agents}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FloorRoom — cavity view (real agents)
// ─────────────────────────────────────────────────────────────
function FloorRoom({ floor, division, agents, showMessages, animate }) {
  const color = division.color;
  const roomAgents = useMemo(() => agents.filter(a => a.floor === floor.id), [floor.id, agents]);

  const [positions, setPositions] = useState(() => {
    const obj = {};
    roomAgents.forEach((a, i) => {
      const angle = (i / Math.max(roomAgents.length, 1)) * Math.PI * 2;
      obj[a.id] = {
        x: 0.5 + Math.cos(angle) * 0.28 + (Math.random() - 0.5) * 0.08,
        y: 0.5 + Math.sin(angle) * 0.28 + (Math.random() - 0.5) * 0.08,
      };
    });
    return obj;
  });

  useEffect(() => {
    const obj = {};
    roomAgents.forEach((a, i) => {
      const angle = (i / Math.max(roomAgents.length, 1)) * Math.PI * 2;
      obj[a.id] = {
        x: 0.5 + Math.cos(angle) * 0.28 + (Math.random() - 0.5) * 0.08,
        y: 0.5 + Math.sin(angle) * 0.28 + (Math.random() - 0.5) * 0.08,
      };
    });
    setPositions(obj);
  }, [floor.id]);

  useEffect(() => {
    if (!animate) return;
    const interval = setInterval(() => {
      setPositions(prev => {
        const next = { ...prev };
        const movers = Math.max(1, Math.floor(roomAgents.length / 2));
        for (let i = 0; i < movers; i++) {
          const a = roomAgents[Math.floor(Math.random() * roomAgents.length)];
          if (!a) continue;
          next[a.id] = { x: 0.14 + Math.random() * 0.72, y: 0.14 + Math.random() * 0.72 };
        }
        return next;
      });
    }, 2400);
    return () => clearInterval(interval);
  }, [floor.id, animate, roomAgents]);

  const links = useMemo(() => {
    if (!showMessages) return [];
    const out = [];
    for (let i = 0; i < roomAgents.length; i++) {
      for (let j = i + 1; j < roomAgents.length; j++) {
        const a = roomAgents[i], b = roomAgents[j];
        const pa = positions[a.id], pb = positions[b.id];
        if (!pa || !pb) continue;
        const dx = pa.x - pb.x, dy = pa.y - pb.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.35) out.push({ from: pa, to: pb, key: `${a.id}-${b.id}`, strength: 1 - dist / 0.35 });
      }
    }
    return out;
  }, [positions, roomAgents, showMessages]);

  const desks = [
    { x: '15%', y: '20%', w: '22%', h: '10%' },
    { x: '63%', y: '20%', w: '22%', h: '10%' },
    { x: '15%', y: '70%', w: '22%', h: '10%' },
    { x: '63%', y: '70%', w: '22%', h: '10%' },
    { x: '40%', y: '44%', w: '20%', h: '12%' },
  ];

  return (
    <div className="room-stage" style={{ '--accent': color }}>
      <div
        className="room-floor"
        style={{
          width: 'min(94%, 460px)',
          aspectRatio: '1 / 1',
          transform: 'translate(-50%, -50%) rotateX(60deg) rotateZ(-18deg)',
          background: `radial-gradient(ellipse at center, ${color}15, transparent 70%), rgba(8, 11, 28, 0.7)`,
          border: `1.5px solid ${color}`,
          borderRadius: 8,
          boxShadow: `0 0 50px ${color}40, inset 0 0 30px ${color}10`,
        }}
      >
        <div className="room-grid" style={{ '--accent': color }} />
        {desks.map((d, i) => (
          <div key={`desk-${i}`} className="room-desk" style={{
            left: d.x, top: d.y, width: d.w, height: d.h,
            borderColor: `${color}80`,
            background: `linear-gradient(135deg, ${color}10, transparent)`,
          }} />
        ))}
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          width: 60, height: 60, transform: 'translate(-50%, -50%)',
          borderRadius: '50%', border: `2px solid ${color}`,
          boxShadow: `0 0 20px ${color}`,
          display: 'grid', placeItems: 'center', fontSize: 18, color,
          textShadow: `0 0 10px ${color}`,
          background: `radial-gradient(circle, ${color}30, transparent)`,
          fontFamily: 'var(--font-mono)',
        }}>{division.icon || '◉'}</div>
        {links.map(({ from, to, key, strength }) => {
          const dx = (to.x - from.x), dy = (to.y - from.y);
          const length = Math.hypot(dx, dy) * 100;
          const angle = Math.atan2(dy, dx) * 180 / Math.PI;
          return (
            <div key={key} className="room-conn" style={{
              left: `${from.x * 100}%`, top: `${from.y * 100}%`,
              width: `${length}%`, transform: `rotate(${angle}deg)`,
              opacity: strength * 0.7,
            }} />
          );
        })}
        {roomAgents.map((a) => {
          const p = positions[a.id] || { x: 0.5, y: 0.5 };
          return (
            <div key={a.id} className="agent-pip" style={{
              left: `${p.x * 100}%`, top: `${p.y * 100}%`,
              '--accent': color,
              borderColor: a.status === 'error' ? 'var(--red)' : color,
              boxShadow: a.status === 'error'
                ? '0 0 14px var(--red), inset 0 0 6px rgba(0,0,0,0.6)'
                : `0 0 14px ${color}, inset 0 0 6px rgba(0,0,0,0.6)`,
              transform: 'translate(-50%, -50%)',
            }} title={`${a.name} — ${a.task}`}>
              <span style={{ transform: 'rotateZ(18deg) rotateX(-60deg)' }}>{a.emoji}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Rotation + Zoom HUDs
// ─────────────────────────────────────────────────────────────
function RotationControl({ rotation, onRotate }) {
  const presets = [
    { label: 'N',  deg: 0   },
    { label: 'E',  deg: 90  },
    { label: 'S',  deg: 180 },
    { label: 'W',  deg: 270 },
  ];
  return (
    <div className="hud-pod">
      <span className="hud-pod-lbl">rotate</span>
      <button className="hud-btn" onClick={() => onRotate(((rotation - 15) % 360 + 360) % 360)} title="left">↺</button>
      <input
        type="range"
        min={0} max={360} step={1}
        value={Math.round(rotation)}
        onChange={(e) => onRotate(parseFloat(e.target.value))}
        style={{ width: 110, accentColor: 'var(--cyan)' }}
      />
      <span className="hud-pod-val">{Math.round(rotation)}°</span>
      <button className="hud-btn" onClick={() => onRotate(((rotation + 15) % 360 + 360) % 360)} title="right">↻</button>
      <span className="hud-sep" />
      <div style={{ display: 'flex', gap: 4 }}>
        {presets.map(p => {
          const active = Math.abs(((rotation - p.deg + 540) % 360) - 180) > 175;
          return (
            <button key={p.label} onClick={() => onRotate(p.deg)} className={`hud-card${active ? ' active' : ''}`}>{p.label}</button>
          );
        })}
      </div>
    </div>
  );
}

function ZoomControl({ zoom, setZoom, onReset }) {
  return (
    <div className="hud-pod">
      <span className="hud-pod-lbl">zoom</span>
      <button className="hud-btn" onClick={() => setZoom(Math.max(0.4, zoom / 1.2))} title="zoom out">−</button>
      <span className="hud-pod-val" style={{ width: 38 }}>{Math.round(zoom * 100)}%</span>
      <button className="hud-btn" onClick={() => setZoom(Math.min(6, zoom * 1.2))} title="zoom in">+</button>
      <button className="hud-btn hud-btn-mute" onClick={onReset} title="reset">⟳</button>
    </div>
  );
}

Object.assign(window, { IsoTower, FloorSpine, FloorRoom, RotationControl, ZoomControl });
