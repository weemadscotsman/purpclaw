'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * TabVisualizer — ambient 2D canvas visualization that sits BEHIND the
 * active tab panel content. Each tab gets a custom visualizer that
 * represents the live activity of that subsystem.
 *
 * This is the "9001" layer for Mission Control: the text/data panels
 * are unchanged, but the background now breathes with the system.
 *
 * Visualizers (all 2D canvas, no deps):
 *   - overview:    pulsing system map with ambient node connections
 *   - command:     flowing command-line glyphs
 *   - harness:     rotating gears and verification gates
 *   - agents:      orbiting agent glyphs (35 of them)
 *   - tower:       tower floors lightening up as agents spawn
 *   - swarm:       delegation graph with packets flying
 *   - pipeline:    flowing data stream / conveyor
 *   - timeline:    vertical scrolling event horizon
 *   - gatekeeper:  shield with bouncing risk particles
 *   - cognitive:   neural mesh pulses
 *   - mochi:       floating mochi with mood-tinted aura
 *   - sampler:     live sparkline grid
 *   - logs:        scrolling code columns
 *   - dream:       warp tunnel
 *   - cognitive:   spinning orbiters
 *   - default:     subtle particle field
 */

interface Props {
  type: string;             // tab id
  data?: any;              // optional live data
  reducedMotion?: boolean;  // user prefers reduced motion
}

export function AmbientTabVisualizer({ type, data, reducedMotion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let disposed = false;

    function resize() {
      if (!cv) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = cv.getBoundingClientRect();
      cv.width = Math.max(1, Math.floor(r.width * dpr));
      cv.height = Math.max(1, Math.floor(r.height * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    const w = () => cv.clientWidth;
    const h = () => cv.clientHeight;
    const cx = () => w() / 2;
    const cy = () => h() / 2;
    const tickers: Record<string, (t: number) => void> = {
      overview:    drawOverview,
      command:     drawCommand,
      harness:     drawHarness,
      agents:      drawAgents,
      tower:       drawTower,
      swarm:       drawSwarm,
      pipeline:    drawPipeline,
      timeline:    drawTimeline,
      gatekeeper:  drawGatekeeper,
      cognitive:   drawCognitive,
      mochi:       drawMochi,
      sampler:     drawSampler,
      logs:        drawLogs,
      dream:       drawDream,
      evolution:   drawSwarm,
      graph:       drawOverview,
      abliterator: drawGatekeeper,
    };
    const fn = tickers[type] || drawDefault;

    function frame(t: number) {
      if (disposed) return;
      ctx!.clearRect(0, 0, w(), h());
      fn(t);
      animRef.current = requestAnimationFrame(frame);
    }
    if (!reducedMotion) animRef.current = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [type, data, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.85,
      }}
    />
  );
}

// ── Visualizers (all 2D, no deps) ──────────────────────────────────────────

function drawOverview(this: any, t: number) {
  const ctx = (this as any) as CanvasRenderingContext2D;
  const W = (this as any).canvas.clientWidth;
  const H = (this as any).canvas.clientHeight;
  // Ambient nodes
  for (let i = 0; i < 24; i++) {
    const x = ((i * 73) % W + (Math.sin(t * 0.0005 + i) * 20));
    const y = ((i * 97) % H + (Math.cos(t * 0.0007 + i) * 14));
    ctx.fillStyle = `rgba(120, 200, 255, ${0.15 + Math.sin(t * 0.002 + i) * 0.1})`;
    ctx.beginPath();
    ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  // Connections
  ctx.strokeStyle = 'rgba(120,200,255,0.08)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 24; i++) {
    for (let j = i + 1; j < 24; j++) {
      const x1 = ((i * 73) % W), y1 = ((i * 97) % H);
      const x2 = ((j * 73) % W), y2 = ((j * 97) % H);
      const d = Math.hypot(x1 - x2, y1 - y2);
      if (d < 160) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    }
  }
}

function drawCommand(this: any, t: number) {
  const ctx = this; const W = this.canvas.clientWidth; const H = this.canvas.clientHeight;
  ctx.font = '11px JetBrains Mono, monospace';
  const lines = ['$ ', '> ', '~ ', '# ', '>>', ':: '];
  for (let i = 0; i < 40; i++) {
    const x = ((i * 31 + t * 0.05) % W);
    const y = ((i * 47) % H);
    const ch = lines[i % lines.length];
    ctx.fillStyle = `rgba(120,255,180,${0.15 + Math.sin(t * 0.003 + i) * 0.1})`;
    ctx.fillText(ch, x, y);
  }
}

function drawHarness(this: any, t: number) {
  const ctx = this; const W = this.canvas.clientWidth; const H = this.canvas.clientHeight;
  const cx = W / 2, cy = H / 2;
  for (let r = 40; r < 220; r += 36) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.0004 + r * 0.02);
    ctx.strokeStyle = `rgba(255,180,80,${0.18 - r * 0.0006})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x1 = Math.cos(a) * r, y1 = Math.sin(a) * r;
      const x2 = Math.cos(a) * (r + 16), y2 = Math.sin(a) * (r + 16);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x2, y2, 2, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,200,80,${0.5 - r * 0.001})`; ctx.fill();
    }
    ctx.restore();
  }
}

function drawAgents(this: any, t: number) {
  const ctx = this; const W = this.canvas.clientWidth; const H = this.canvas.clientHeight;
  const cx = W / 2, cy = H / 2;
  const N = 35;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + t * 0.0003;
    const r = 110 + Math.sin(t * 0.002 + i) * 30;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const sz = 3 + (i % 4);
    ctx.fillStyle = `rgba(160,${180 + (i % 60)},255,${0.5 + Math.sin(t * 0.003 + i) * 0.3})`;
    ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); ctx.fill();
  }
}

function drawTower(this: any, t: number) {
  const ctx = this; const W = this.canvas.clientWidth; const H = this.canvas.clientHeight;
  const floors = 12;
  const fw = 100, fh = 14;
  const x0 = W / 2 - fw / 2;
  for (let i = 0; i < floors; i++) {
    const y = H - 60 - i * (fh + 4);
    const lit = ((Math.sin(t * 0.001 + i * 0.7) + 1) / 2) > 0.4;
    ctx.fillStyle = lit ? `rgba(120,200,255,0.5)` : `rgba(80,90,110,0.25)`;
    ctx.fillRect(x0, y, fw, fh);
    ctx.strokeStyle = 'rgba(120,200,255,0.2)';
    ctx.strokeRect(x0, y, fw, fh);
  }
}

function drawSwarm(this: any, t: number) {
  const ctx = this; const W = this.canvas.clientWidth; const H = this.canvas.clientHeight;
  const N = 14;
  const nodes: { x: number; y: number }[] = [];
  for (let i = 0; i < N; i++) {
    const x = W / 2 + Math.cos(t * 0.0004 + i) * (60 + i * 8);
    const y = H / 2 + Math.sin(t * 0.0005 + i * 0.7) * (40 + i * 4);
    nodes.push({ x, y });
    ctx.fillStyle = `rgba(120,200,255,${0.5 + Math.sin(t * 0.003 + i) * 0.3})`;
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  }
  // Packets flying along edges
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const a = nodes[i], b = nodes[j];
    const p = (t * 0.0008 + i * 0.1) % 1;
    const px = a.x + (b.x - a.x) * p;
    const py = a.y + (b.y - a.y) * p;
    ctx.fillStyle = 'rgba(255,220,120,0.8)';
    ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
  }
}

function drawPipeline(this: any, t: number) {
  const ctx = this; const W = this.canvas.clientWidth; const H = this.canvas.clientHeight;
  for (let row = 0; row < 5; row++) {
    const y = (H / 5) * row + 30;
    for (let x = 0; x < W; x += 4) {
      const a = (x + t * (0.2 + row * 0.1)) % W;
      const intensity = Math.max(0, Math.sin((a / W) * Math.PI * 4 + row));
      ctx.fillStyle = `rgba(80,200,220,${intensity * 0.4})`;
      ctx.fillRect(a, y, 2, 2);
    }
  }
}

function drawTimeline(this: any, t: number) {
  const ctx = this; const W = this.canvas.clientWidth; const H = this.canvas.clientHeight;
  for (let i = 0; i < 30; i++) {
    const y = ((t * 0.05 + i * 50) % H);
    const a = 0.3 + Math.sin(t * 0.002 + i) * 0.4;
    ctx.fillStyle = `rgba(220,220,255,${a})`;
    ctx.fillRect(0, y, W * 0.4 + (i % 5) * 30, 1);
  }
}

function drawGatekeeper(this: any, t: number) {
  const ctx = this; const W = this.canvas.clientWidth; const H = this.canvas.clientHeight;
  const cx = W / 2, cy = H / 2;
  ctx.save(); ctx.translate(cx, cy);
  ctx.strokeStyle = `rgba(255,180,80,${0.4 + Math.sin(t * 0.002) * 0.3})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let a = -Math.PI / 2; a < Math.PI * 1.5; a += 0.05) {
    const r = 80 + Math.sin(t * 0.003 + a * 3) * 4;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (a === -Math.PI / 2) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.stroke();
  // Bouncing risk particles
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + t * 0.002;
    const r = 80;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    ctx.fillStyle = 'rgba(255,80,80,0.7)';
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawCognitive(this: any, t: number) {
  const ctx = this; const W = this.canvas.clientWidth; const H = this.canvas.clientHeight;
  // Neural mesh
  const nodes: { x: number; y: number }[] = [];
  for (let i = 0; i < 14; i++) {
    nodes.push({ x: ((i * 53) % W), y: ((i * 71) % H) });
  }
  ctx.strokeStyle = 'rgba(200,160,255,0.15)';
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 180) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const pulse = 0.4 + Math.sin(t * 0.002 + i * 0.5) * 0.4;
    ctx.fillStyle = `rgba(220,180,255,${pulse})`;
    ctx.beginPath(); ctx.arc(n.x, n.y, 3, 0, Math.PI * 2); ctx.fill();
  }
}

function drawMochi(this: any, t: number) {
  const ctx = this; const W = this.canvas.clientWidth; const H = this.canvas.clientHeight;
  const cx = W / 2, cy = H / 2;
  const pulse = Math.sin(t * 0.003) * 8;
  // Aura
  const grd = ctx.createRadialGradient(cx, cy, 10, cx, cy, 100 + pulse);
  grd.addColorStop(0, 'rgba(255,180,220,0.35)');
  grd.addColorStop(1, 'rgba(255,180,220,0)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(cx, cy, 120 + pulse, 0, Math.PI * 2); ctx.fill();
  // Mochi body
  ctx.fillStyle = 'rgba(255,220,200,0.85)';
  ctx.beginPath(); ctx.arc(cx, cy, 35, 0, Math.PI * 2); ctx.fill();
  // Eyes
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(cx - 8, cy - 4, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 8, cy - 4, 2.5, 0, Math.PI * 2); ctx.fill();
  // Mouth
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy + 4, 5, 0, Math.PI); ctx.stroke();
  // Sparkles
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + t * 0.001;
    const r = 70 + Math.sin(t * 0.003 + i) * 10;
    ctx.fillStyle = 'rgba(255,255,200,0.7)';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSampler(this: any, t: number) {
  const ctx = this; const W = this.canvas.clientWidth; const H = this.canvas.clientHeight;
  for (let row = 0; row < 4; row++) {
    ctx.beginPath();
    for (let x = 0; x < W; x += 4) {
      const v = Math.sin(x * 0.02 + t * 0.002 + row) * 30;
      const y = (H / 4) * (row + 0.5) + v;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(120,200,255,${0.4 - row * 0.08})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawLogs(this: any, t: number) {
  const ctx = this; const W = this.canvas.clientWidth; const H = this.canvas.clientHeight;
  ctx.font = '10px JetBrains Mono, monospace';
  const glyphs = '01▓▒░│┤┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▇▆▅▄▃▂▁';
  for (let col = 0; col < 5; col++) {
    const x = (W / 5) * col + 8;
    for (let row = 0; row < 30; row++) {
      const y = ((row * 16 + t * 0.05 * (col + 1)) % H);
      const ch = glyphs[(row * 7 + col * 3) % glyphs.length];
      ctx.fillStyle = `rgba(120,255,180,${0.15 + (row % 4) * 0.08})`;
      ctx.fillText(ch, x, y);
    }
  }
}

function drawDream(this: any, t: number) {
  const ctx = this; const W = this.canvas.clientWidth; const H = this.canvas.clientHeight;
  const cx = W / 2, cy = H / 2;
  for (let r = 30; r < 350; r += 12) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.0005 + r * 0.04);
    ctx.strokeStyle = `rgba(${180 + r % 60},${100 + r % 100},255,${0.3 - r * 0.0008})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      const rr = r + Math.sin(a * 6 + t * 0.001) * 6;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
}

function drawDefault(this: any, t: number) {
  drawOverview.call(this, t);
}

export default AmbientTabVisualizer;
