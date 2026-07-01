"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var require_command_palette = __commonJS({
    "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/app/public/ui/command-palette.jsx"() {
      const { useState: useS_cp, useEffect: useE_cp, useMemo: useM_cp, useRef: useR_cp } = React;
      function CommandPalette({ open, onClose, onAction, ctx }) {
        const [query, setQuery] = useS_cp("");
        const [highlight, setHighlight] = useS_cp(0);
        const inputRef = useR_cp(null);
        const listRef = useR_cp(null);
        const items = useM_cp(() => {
          const out = [];
          out.push(
            { group: "Actions", label: "Toggle focus mode", shortcut: "F", icon: "\u26F6", action: { type: "toggle_focus" } },
            { group: "Actions", label: "Reset tower view", shortcut: "0", icon: "\u27F3", action: { type: "reset_view" } },
            { group: "Actions", label: "Open Tweaks panel", icon: "\u2731", action: { type: "tweaks_open" } },
            { group: "Actions", label: "Refresh mission data", icon: "\u21BB", action: { type: "refresh" } },
            { group: "Actions", label: "Save current camera angle", icon: "\u25C9", action: { type: "save_camera" } }
          );
          (ctx.tabs || []).forEach((t, i) => out.push({
            group: "Tabs",
            label: `Go to ${t.label}`,
            shortcut: i < 9 ? `${i + 1}` : null,
            icon: t.icon,
            action: { type: "tab", id: t.id }
          }));
          (ctx.floors || []).forEach((f) => {
            const m = divMeta(f.div);
            out.push({
              group: "Floors",
              label: `FL.${String(f.level).padStart(2, "0")} \xB7 ${m.name}`,
              sub: `${f.agents} agents \xB7 ${f.working || 0} working`,
              icon: m.icon,
              accent: m.color,
              action: { type: "floor", id: f.id }
            });
          });
          (ctx.agents || []).slice(0, 60).forEach((a) => {
            const m = divMeta(a.division);
            out.push({
              group: "Agents",
              label: a.name,
              sub: `${m.name} \xB7 ${a.status}${a.task ? " \xB7 " + String(a.task).slice(0, 40) : ""}`,
              icon: a.emoji,
              accent: m.color,
              action: { type: "agent", name: a.name, floor: a.floor }
            });
          });
          (ctx.workflows || []).forEach((w) => out.push({
            group: "Workflows",
            label: w.intent || w.target || "(no intent)",
            sub: `${w.id} \xB7 ${w.status}`,
            icon: "\u25EB",
            action: { type: "workflow", id: w.id }
          }));
          (ctx.cameras || []).forEach((c) => out.push({
            group: "Cameras",
            label: c.name,
            sub: `${Math.round(c.zoom * 100)}% \xB7 ${Math.round(c.rotation)}\xB0`,
            icon: "\u25CE",
            action: { type: "camera_load", id: c.id }
          }));
          return out;
        }, [ctx]);
        const filtered = useM_cp(() => {
          if (!query.trim()) return items;
          const q = query.toLowerCase();
          return items.map((it) => {
            const lab = it.label.toLowerCase();
            const sub = (it.sub || "").toLowerCase();
            let score = 0;
            if (lab.startsWith(q)) score += 100;
            if (lab.includes(q)) score += 40;
            if (sub.includes(q)) score += 20;
            if (q.includes("floor") && it.group === "Floors") score += 15;
            if (q.includes("agent") && it.group === "Agents") score += 15;
            if (q.startsWith("go ") && it.group === "Tabs") score += 30;
            return __spreadProps(__spreadValues({}, it), { _score: score });
          }).filter((it) => it._score > 0).sort((a, b) => b._score - a._score).slice(0, 80);
        }, [items, query]);
        const grouped = useM_cp(() => {
          const g = {};
          filtered.forEach((it, i) => {
            if (!g[it.group]) g[it.group] = [];
            g[it.group].push(__spreadProps(__spreadValues({}, it), { _idx: i }));
          });
          return g;
        }, [filtered]);
        useE_cp(() => {
          setHighlight(0);
        }, [query]);
        useE_cp(() => {
          if (open) {
            setTimeout(() => {
              var _a;
              return (_a = inputRef.current) == null ? void 0 : _a.focus();
            }, 50);
            setQuery("");
            setHighlight(0);
          }
        }, [open]);
        useE_cp(() => {
          if (!open) return;
          const handler = (e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(filtered.length - 1, h + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const it = filtered[highlight];
              if (it) {
                onAction(it.action);
                onClose();
              }
            }
          };
          window.addEventListener("keydown", handler);
          return () => window.removeEventListener("keydown", handler);
        }, [open, filtered, highlight, onAction, onClose]);
        useE_cp(() => {
          if (!listRef.current) return;
          const el = listRef.current.querySelector(`[data-idx="${highlight}"]`);
          if (el) el.scrollIntoView({ block: "nearest" });
        }, [highlight]);
        if (!open) return null;
        return /* @__PURE__ */ React.createElement("div", { className: "cp-backdrop", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "cp", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "cp-input-row" }, /* @__PURE__ */ React.createElement("span", { className: "cp-prompt" }, "\u2318K"), /* @__PURE__ */ React.createElement(
          "input",
          {
            ref: inputRef,
            value: query,
            onChange: (e) => setQuery(e.target.value),
            placeholder: "search agents, floors, workflows, actions\u2026",
            className: "cp-input"
          }
        ), /* @__PURE__ */ React.createElement("span", { className: "cp-hint" }, "\u2191\u2193 navigate \xB7 \u23CE run \xB7 esc")), /* @__PURE__ */ React.createElement("div", { className: "cp-results", ref: listRef }, filtered.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "cp-empty" }, 'no matches for "', query, '"') : Object.entries(grouped).map(([group, items2]) => /* @__PURE__ */ React.createElement("div", { key: group, className: "cp-group" }, /* @__PURE__ */ React.createElement("div", { className: "cp-group-h" }, group), items2.map((it) => /* @__PURE__ */ React.createElement(
          "button",
          {
            key: it._idx,
            "data-idx": it._idx,
            className: `cp-item${it._idx === highlight ? " active" : ""}`,
            onMouseEnter: () => setHighlight(it._idx),
            onClick: () => {
              onAction(it.action);
              onClose();
            }
          },
          /* @__PURE__ */ React.createElement("span", { className: "cp-item-icon", style: { color: it.accent || "var(--cyan)" } }, it.icon),
          /* @__PURE__ */ React.createElement("div", { className: "cp-item-body" }, /* @__PURE__ */ React.createElement("div", { className: "cp-item-label", style: { color: it._idx === highlight ? it.accent || "var(--cyan)" : "var(--text)" } }, highlightMatch(it.label, query)), it.sub && /* @__PURE__ */ React.createElement("div", { className: "cp-item-sub" }, it.sub)),
          it.shortcut && /* @__PURE__ */ React.createElement("span", { className: "cp-item-key" }, it.shortcut)
        ))))), /* @__PURE__ */ React.createElement("div", { className: "cp-foot" }, /* @__PURE__ */ React.createElement("span", { className: "cp-foot-l" }, filtered.length, " ", filtered.length === 1 ? "result" : "results"), /* @__PURE__ */ React.createElement("span", { className: "cp-foot-r" }, "PURPCLAW \xB7 command palette"))));
      }
      function highlightMatch(label, q) {
        if (!q.trim()) return label;
        const i = label.toLowerCase().indexOf(q.toLowerCase());
        if (i < 0) return label;
        return [
          label.slice(0, i),
          /* @__PURE__ */ React.createElement("mark", { key: "hl", className: "cp-hl" }, label.slice(i, i + q.length)),
          label.slice(i + q.length)
        ];
      }
      Object.assign(window, { CommandPalette });
    }
  });
  require_command_palette();
})();
