/* command-palette.jsx — ⌘K universal command surface */

const { useState: useS_cp, useEffect: useE_cp, useMemo: useM_cp, useRef: useR_cp } = React;

function CommandPalette({ open, onClose, onAction, ctx }) {
  const [query, setQuery] = useS_cp('');
  const [highlight, setHighlight] = useS_cp(0);
  const inputRef = useR_cp(null);
  const listRef = useR_cp(null);

  // build action items from current context
  const items = useM_cp(() => {
    const out = [];

    // Actions
    out.push(
      { group: 'Actions', label: 'Toggle focus mode',  shortcut: 'F', icon: '⛶', action: { type: 'toggle_focus' } },
      { group: 'Actions', label: 'Reset tower view',   shortcut: '0', icon: '⟳', action: { type: 'reset_view' } },
      { group: 'Actions', label: 'Open Tweaks panel',  icon: '✱', action: { type: 'tweaks_open' } },
      { group: 'Actions', label: 'Refresh mission data',icon: '↻', action: { type: 'refresh' } },
      { group: 'Actions', label: 'Save current camera angle', icon: '◉', action: { type: 'save_camera' } },
    );

    // Tabs
    (ctx.tabs || []).forEach((t, i) => out.push({
      group: 'Tabs',
      label: `Go to ${t.label}`,
      shortcut: i < 9 ? `${i + 1}` : null,
      icon: t.icon,
      action: { type: 'tab', id: t.id },
    }));

    // Floors
    (ctx.floors || []).forEach(f => {
      const m = divMeta(f.div);
      out.push({
        group: 'Floors',
        label: `FL.${String(f.level).padStart(2,'0')} · ${m.name}`,
        sub: `${f.agents} agents · ${f.working || 0} working`,
        icon: m.icon,
        accent: m.color,
        action: { type: 'floor', id: f.id },
      });
    });

    // Agents
    (ctx.agents || []).slice(0, 60).forEach(a => {
      const m = divMeta(a.division);
      out.push({
        group: 'Agents',
        label: a.name,
        sub: `${m.name} · ${a.status}${a.task ? ' · ' + String(a.task).slice(0, 40) : ''}`,
        icon: a.emoji,
        accent: m.color,
        action: { type: 'agent', name: a.name, floor: a.floor },
      });
    });

    // Workflows
    (ctx.workflows || []).forEach(w => out.push({
      group: 'Workflows',
      label: w.intent || w.target || '(no intent)',
      sub: `${w.id} · ${w.status}`,
      icon: '◫',
      action: { type: 'workflow', id: w.id },
    }));

    // Saved cameras
    (ctx.cameras || []).forEach(c => out.push({
      group: 'Cameras',
      label: c.name,
      sub: `${Math.round(c.zoom * 100)}% · ${Math.round(c.rotation)}°`,
      icon: '◎',
      action: { type: 'camera_load', id: c.id },
    }));

    return out;
  }, [ctx]);

  const filtered = useM_cp(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items
      .map(it => {
        const lab = it.label.toLowerCase();
        const sub = (it.sub || '').toLowerCase();
        let score = 0;
        if (lab.startsWith(q)) score += 100;
        if (lab.includes(q)) score += 40;
        if (sub.includes(q)) score += 20;
        // group bonuses for likely intent
        if (q.includes('floor') && it.group === 'Floors') score += 15;
        if (q.includes('agent') && it.group === 'Agents') score += 15;
        if (q.startsWith('go ') && it.group === 'Tabs') score += 30;
        return { ...it, _score: score };
      })
      .filter(it => it._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 80);
  }, [items, query]);

  const grouped = useM_cp(() => {
    const g = {};
    filtered.forEach((it, i) => {
      if (!g[it.group]) g[it.group] = [];
      g[it.group].push({ ...it, _idx: i });
    });
    return g;
  }, [filtered]);

  // reset highlight on query change
  useE_cp(() => { setHighlight(0); }, [query]);

  // focus input when opened
  useE_cp(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setHighlight(0);
    }
  }, [open]);

  // keyboard
  useE_cp(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight(h => Math.min(filtered.length - 1, h + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight(h => Math.max(0, h - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const it = filtered[highlight];
        if (it) { onAction(it.action); onClose(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, highlight, onAction, onClose]);

  // scroll highlight into view
  useE_cp(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlight}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  if (!open) return null;

  return (
    <div className="cp-backdrop" onClick={onClose}>
      <div className="cp" onClick={e => e.stopPropagation()}>
        <div className="cp-input-row">
          <span className="cp-prompt">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="search agents, floors, workflows, actions…"
            className="cp-input"
          />
          <span className="cp-hint">↑↓ navigate · ⏎ run · esc</span>
        </div>
        <div className="cp-results" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="cp-empty">no matches for "{query}"</div>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="cp-group">
                <div className="cp-group-h">{group}</div>
                {items.map(it => (
                  <button
                    key={it._idx}
                    data-idx={it._idx}
                    className={`cp-item${it._idx === highlight ? ' active' : ''}`}
                    onMouseEnter={() => setHighlight(it._idx)}
                    onClick={() => { onAction(it.action); onClose(); }}
                  >
                    <span className="cp-item-icon" style={{ color: it.accent || 'var(--cyan)' }}>{it.icon}</span>
                    <div className="cp-item-body">
                      <div className="cp-item-label" style={{ color: it._idx === highlight ? (it.accent || 'var(--cyan)') : 'var(--text)' }}>
                        {highlightMatch(it.label, query)}
                      </div>
                      {it.sub && <div className="cp-item-sub">{it.sub}</div>}
                    </div>
                    {it.shortcut && <span className="cp-item-key">{it.shortcut}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
        <div className="cp-foot">
          <span className="cp-foot-l">{filtered.length} {filtered.length === 1 ? 'result' : 'results'}</span>
          <span className="cp-foot-r">PURPCLAW · command palette</span>
        </div>
      </div>
    </div>
  );
}

function highlightMatch(label, q) {
  if (!q.trim()) return label;
  const i = label.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return label;
  return [
    label.slice(0, i),
    <mark key="hl" className="cp-hl">{label.slice(i, i + q.length)}</mark>,
    label.slice(i + q.length),
  ];
}

Object.assign(window, { CommandPalette });
