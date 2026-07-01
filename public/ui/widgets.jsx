/* widgets.jsx — shared UI atoms: panels, sparklines, bars, counters, feeds */

function Panel({ title, sub, right, children, className, bodyClass, style, dot }) {
  return (
    <div className={`panel ${className || ''}`} style={style}>
      {title != null && (
        <div className="panel-hd">
          {dot && <span className={`dot ${dot}`} />}
          <h3>{title}</h3>
          {sub && <span className="hd-sub">{sub}</span>}
          {right && <div className="hd-right">{right}</div>}
        </div>
      )}
      <div className={`panel-bd ${bodyClass || ''}`}>{children}</div>
    </div>
  );
}

/* gsap counter */
function Counter({ value, format, className, style }) {
  const ref = React.useRef(null);
  const prev = React.useRef(0);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const from = { v: prev.current }, to = Number(value) || 0;
    prev.current = to;
    if (window.gsap) {
      gsap.to(from, { v: to, duration: 0.9, ease: 'power2.out', onUpdate: () => { el.textContent = format ? format(from.v) : Math.round(from.v).toLocaleString(); } });
    } else el.textContent = format ? format(to) : to.toLocaleString();
  }, [value, format]);
  return <span ref={ref} className={className} style={style} />;
}

/* svg sparkline / area / bars */
function Spark({ data, w = 110, h = 26, color = 'var(--cyan)', fill = false }) {
  if (!data || !data.length) data = [0, 0];
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 3) - 1.5}`);
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {fill && <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={color} opacity="0.15" />}
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.3" />
    </svg>
  );
}

function Bars({ data, w = 240, h = 60, color = '#e879f9' }) {
  if (!data || !data.length) data = new Array(40).fill(0);
  const max = Math.max(...data, 1);
  const bw = w / data.length;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {data.map((v, i) => {
        const bh = Math.max(1, (v / max) * (h - 4));
        return <rect key={i} x={i * bw + 0.5} y={h - bh} width={Math.max(0.8, bw - 1.4)} height={bh} fill={color} opacity={0.35 + 0.65 * (v / max)} />;
      })}
    </svg>
  );
}

/* horizontal meter bar */
function Meter({ pct, color = 'linear-gradient(90deg,var(--purple),var(--magenta))', h = 5, w = '100%' }) {
  return (
    <div style={{ width: w, height: h, border: '1px solid rgba(168,85,247,0.3)', position: 'relative' }}>
      <i style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

/* fade-up entrance via gsap, staggered per mount */
function useEntrance(ref, deps = []) {
  React.useEffect(() => {
    const el = ref.current; if (!el || !window.gsap) return;
    const kids = el.querySelectorAll(':scope > .panel, :scope > div > .panel');
    if (kids.length) gsap.fromTo(kids, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.55, stagger: 0.05, ease: 'power2.out', clearProps: 'all' });
  }, deps); // eslint-disable-line
}

/* time helpers */
function fmtTime(d) { const x = new Date(d); return x.toTimeString().slice(0, 8); }
function fmtClock(d) { return new Date(d).toTimeString().slice(0, 5); }
function fmtUptime(sec) {
  if (sec == null) return '—';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return `${d}D ${h}H ${m}M`;
}
function ago(ts) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${s | 0}s ago`;
  if (s < 3600) return `${(s / 60) | 0}m ago`;
  return `${(s / 3600) | 0}h ago`;
}

/* deterministic pseudo-random series for histograms seeded by live counts */
function seededSeries(n, seed = 7, lo = 0.1, hi = 1) {
  let x = seed; const out = [];
  for (let i = 0; i < n; i++) { x = (x * 9301 + 49297) % 233280; out.push(lo + (x / 233280) * (hi - lo)); }
  return out;
}

Object.assign(window, { Panel, Counter, Spark, Bars, Meter, useEntrance, fmtTime, fmtClock, fmtUptime, ago, seededSeries });
