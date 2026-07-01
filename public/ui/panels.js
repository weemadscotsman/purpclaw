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
  var require_panels = __commonJS({
    "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/app/public/ui/panels.jsx"() {
      const { useState: useS_p, useEffect: useE_p, useMemo: useM_p, useRef: useR_p } = React;
      function MetricCard({ label, value, sub, accent, big }) {
        return /* @__PURE__ */ React.createElement("div", { className: "metric", style: { "--accent": accent || "var(--cyan)" } }, /* @__PURE__ */ React.createElement("div", { className: "metric-lbl" }, label), /* @__PURE__ */ React.createElement("div", { className: "metric-val", style: { color: accent || "var(--cyan)", textShadow: `0 0 10px ${accent || "var(--cyan)"}55`, fontSize: big ? 30 : 22 } }, value), sub && /* @__PURE__ */ React.createElement("div", { className: "metric-sub" }, sub));
      }
      function StatusPill({ ok, label, sub }) {
        return /* @__PURE__ */ React.createElement("span", { className: "pill mono", style: { color: ok ? "var(--emerald)" : "var(--red)" } }, /* @__PURE__ */ React.createElement("span", { style: { display: "inline-block", width: 5, height: 5, borderRadius: 0, background: "currentColor", boxShadow: "0 0 6px currentColor", marginRight: 6, verticalAlign: "middle" } }), label, sub && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 6, color: "var(--text-3)" } }, sub));
      }
      function formatTs(ts) {
        if (!ts) return "\u2014";
        try {
          const d = typeof ts === "string" ? new Date(ts) : ts;
          return d.toLocaleTimeString("en-US", { hour12: false });
        } catch (e) {
          return String(ts).slice(0, 8);
        }
      }
      function ageMs(then) {
        if (!then) return 0;
        try {
          return Date.now() - new Date(then).getTime();
        } catch (e) {
          return 0;
        }
      }
      function ageHuman(ms) {
        if (!ms || ms < 0) return "\u2014";
        if (ms < 1e3) return `${ms}ms`;
        if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
        if (ms < 36e5) return `${Math.floor(ms / 6e4)}m`;
        return `${Math.floor(ms / 36e5)}h`;
      }
      function OverviewTab() {
        var _a, _b, _c, _d, _e, _f;
        const { mission, agents, services, stream, mochi, anyConnected, pipeline } = useData();
        const onlineSvc = services.filter((s) => s.status === "online").length;
        const working = agents.filter((a) => a.status === "working").length;
        const errors = agents.filter((a) => a.status === "error").length;
        const activeWf = ((_a = pipeline == null ? void 0 : pipeline.active) == null ? void 0 : _a.length) || 0;
        const compWf = ((_b = pipeline == null ? void 0 : pipeline.completed) == null ? void 0 : _b.length) || 0;
        const [eps, setEps] = useS_p(0);
        const eventTimesRef = useR_p([]);
        useE_p(() => {
          eventTimesRef.current.push(Date.now());
          eventTimesRef.current = eventTimesRef.current.filter((t) => Date.now() - t < 1e4);
        }, [stream.events.length]);
        useE_p(() => {
          const t = setInterval(() => {
            const w = eventTimesRef.current.filter((t2) => Date.now() - t2 < 1e4);
            setEps((w.length / 10).toFixed(1));
          }, 500);
          return () => clearInterval(t);
        }, []);
        return /* @__PURE__ */ React.createElement("div", { className: "tab-pane", style: { gridTemplateColumns: "1.4fr 1fr", gridTemplateRows: "auto 1fr 1fr" } }, /* @__PURE__ */ React.createElement("div", { className: "panel", style: { gridColumn: "span 2", minHeight: 140 } }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "mission shell"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "PURPCLAW \xB7 Command Deck")), /* @__PURE__ */ React.createElement(StatusPill, { ok: anyConnected, label: anyConnected ? "OPERATIONAL" : "OFFLINE" })), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, padding: 12 } }, /* @__PURE__ */ React.createElement(MetricCard, { label: "Services", value: anyConnected ? `${onlineSvc}/${services.length}` : "\u2014", sub: "real endpoints", accent: "var(--emerald)", big: true }), /* @__PURE__ */ React.createElement(MetricCard, { label: "Working", value: anyConnected ? working : "\u2014", sub: anyConnected ? `${agents.length} total` : "", accent: "var(--cyan)", big: true }), /* @__PURE__ */ React.createElement(MetricCard, { label: "Workflows", value: anyConnected ? activeWf : "\u2014", sub: anyConnected ? `${compWf} archived` : "", accent: "var(--purple)", big: true }), /* @__PURE__ */ React.createElement(MetricCard, { label: "Events / s", value: anyConnected ? eps : "\u2014", sub: "rolling 10s", accent: "var(--azure)", big: true }), /* @__PURE__ */ React.createElement(MetricCard, { label: "Faults", value: anyConnected ? errors : "\u2014", sub: "agents in error", accent: errors ? "var(--red)" : "var(--emerald)", big: true }), /* @__PURE__ */ React.createElement(MetricCard, { label: "Mochi", value: mochi.connected ? ((_c = mochi.data) == null ? void 0 : _c.mood) || "on" : "\u2014", sub: ((_d = mochi.data) == null ? void 0 : _d.species) || "companion", accent: "var(--pink)", big: true }))), /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "signal rail"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Live stream")), /* @__PURE__ */ React.createElement("span", { className: "mono tiny", style: { color: stream.events.length ? "var(--emerald)" : "var(--text-3)" } }, stream.events.length, " buffered")), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "flex", flexDirection: "column", gap: 1 } }, stream.events.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u2261", title: "no events", hint: "SSE streams not connected. start the stack with `purpclaw start`." }) : stream.events.slice(0, 18).map((ev) => /* @__PURE__ */ React.createElement("div", { key: ev._id, className: `event ${eventTone(ev)}` }, /* @__PURE__ */ React.createElement("span", { className: "event-time" }, formatTs(ev._time)), /* @__PURE__ */ React.createElement("span", { className: "event-src" }, ev._source), /* @__PURE__ */ React.createElement("span", { className: "event-msg" }, eventLabel(ev)))))), /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "infrastructure"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Service Mesh")), /* @__PURE__ */ React.createElement("span", { className: "mono tiny", style: { color: "var(--emerald)" } }, onlineSvc, "/", services.length, " online")), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 } }, services.map((svc) => {
          const tone = svc.status === "online" ? "var(--emerald)" : svc.status === "degraded" ? "var(--amber)" : "var(--red)";
          return /* @__PURE__ */ React.createElement("div", { key: svc.key, style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 8px",
            background: "var(--panel-2)",
            border: "1px solid var(--line-soft)",
            borderRadius: 0,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            opacity: svc.status === "offline" ? 0.55 : 1
          } }, /* @__PURE__ */ React.createElement("div", { className: "row", style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("span", { style: { width: 6, height: 6, borderRadius: 0, background: tone, boxShadow: `0 0 6px ${tone}` } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-2)" } }, svc.name)), /* @__PURE__ */ React.createElement("div", { className: "row muted" }, /* @__PURE__ */ React.createElement("span", null, ":", svc.port), /* @__PURE__ */ React.createElement("span", { style: { color: tone } }, svc.latency != null ? `${svc.latency}ms` : "down")));
        }))), /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "in flight"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Workflows")), /* @__PURE__ */ React.createElement("span", { className: "mono tiny muted" }, activeWf, " active / ", compWf, " done")), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "flex", flexDirection: "column", gap: 6 } }, !pipeline ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u25EB", title: "orchestrator offline", hint: "/api/pipeline is not responding. start orchestrator on :7784." }) : (pipeline.active || []).length === 0 && (pipeline.completed || []).length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u25CC", title: "no workflows yet", hint: "send a command via the chat composer to start one." }) : /* @__PURE__ */ React.createElement(React.Fragment, null, (pipeline.active || []).map((wf) => /* @__PURE__ */ React.createElement(WorkflowMiniCard, { key: wf.id, wf })), (pipeline.completed || []).slice(0, 4).map((wf) => /* @__PURE__ */ React.createElement(WorkflowMiniCard, { key: wf.id, wf, dim: true }))))), /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "companion"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Mochi")), mochi.connected ? /* @__PURE__ */ React.createElement(StatusPill, { ok: true, label: ((_e = mochi.data) == null ? void 0 : _e.mood) || "on" }) : /* @__PURE__ */ React.createElement(StatusPill, { ok: false, label: "OFFLINE" })), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 14, alignItems: "center" } }, !mochi.connected || !mochi.data ? /* @__PURE__ */ React.createElement("div", { style: { gridColumn: "span 2" } }, /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u2665", title: "no mochi hatched", hint: "run `purpclaw mochi hatch` to give your companion a face." })) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: {
          aspectRatio: "1 / 1",
          border: "1px solid var(--line-2)",
          borderRadius: 0,
          background: "radial-gradient(circle, rgba(168, 85, 247, 0.2), transparent)",
          display: "grid",
          placeItems: "center",
          fontSize: 48,
          textShadow: "0 0 20px var(--purple)"
        } }, mochiEmoji(mochi.data)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement(KV, { k: "name", v: mochi.data.name }), /* @__PURE__ */ React.createElement(KV, { k: "species", v: mochi.data.species }), /* @__PURE__ */ React.createElement(KV, { k: "rarity", v: mochi.data.rarity || "common", color: "var(--purple)" }), /* @__PURE__ */ React.createElement(KV, { k: "interactions", v: (_f = mochi.data.interactions) != null ? _f : 0, color: "var(--cyan)" }), /* @__PURE__ */ React.createElement(KV, { k: "hatched", v: formatTs(mochi.data.hatchedAt) }))))));
      }
      function KV({ k, v, color }) {
        return /* @__PURE__ */ React.createElement("div", { className: "row", style: { justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("span", { className: "mono tiny upper muted" }, k), /* @__PURE__ */ React.createElement("span", { className: "mono", style: { color: color || "var(--text)" } }, v));
      }
      function WorkflowMiniCard({ wf, dim }) {
        const status = String(wf.status || "unknown").toLowerCase();
        const tone = status === "running" ? "var(--cyan)" : status === "completed" ? "var(--emerald)" : status === "failed" ? "var(--red)" : "var(--text-3)";
        return /* @__PURE__ */ React.createElement("div", { style: {
          padding: "8px 10px",
          background: "var(--panel-2)",
          border: `1px solid ${dim ? "var(--line-soft)" : tone + "40"}`,
          borderRadius: 0,
          opacity: dim ? 0.65 : 1,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 8
        } }, /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "row", style: { gap: 8, marginBottom: 4 } }, /* @__PURE__ */ React.createElement("span", { style: { color: tone, fontFamily: "var(--font-mono)", fontSize: 10 } }, wf.id), /* @__PURE__ */ React.createElement("span", { className: "mono tiny upper", style: { color: tone, opacity: 0.8 } }, status)), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-2)", fontSize: 11, lineHeight: 1.4 } }, wf.intent || wf.target || "(no intent)")), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)" } }, wf.steps ? `${wf.steps.completed}/${wf.steps.total}` : wf.duration ? `${(wf.duration / 1e3).toFixed(1)}s` : "\u2014"));
      }
      function mochiEmoji(m) {
        const SPECIES_EMOJI = {
          duck: "\u{1F986}",
          goose: "\u{1FABF}",
          blob: "\u{1F7E3}",
          cat: "\u{1F431}",
          dragon: "\u{1F409}",
          octopus: "\u{1F419}",
          owl: "\u{1F989}",
          penguin: "\u{1F427}",
          turtle: "\u{1F422}",
          snail: "\u{1F40C}",
          ghost: "\u{1F47B}",
          axolotl: "\u{1F98E}",
          capybara: "\u{1F439}",
          cactus: "\u{1F335}",
          robot: "\u{1F916}",
          rabbit: "\u{1F430}",
          mushroom: "\u{1F344}",
          chonk: "\u{1F43B}"
        };
        return SPECIES_EMOJI[m == null ? void 0 : m.species] || "\u25C9";
      }
      function eventTone(ev) {
        const t = String(ev.type || "").toLowerCase();
        if (t.includes("error") || t.includes("failed") || t.includes("killed")) return "err";
        if (t.includes("warn")) return "warn";
        if (t.includes("complete") || t.includes("success") || t.includes("spawned")) return "ok";
        return "info";
      }
      function eventLabel(ev) {
        if (ev.type === "agent_spawned") return `${ev.emoji || ""} ${ev.name || ev.agentName || "agent"} spawned${ev.task ? ": " + String(ev.task).slice(0, 80) : ""}`;
        if (ev.type === "agent_complete" || ev.type === "agent_completed") return `${ev.emoji || ""} ${ev.agentName || "agent"} completed${ev.code != null ? ` \xB7 exit ${ev.code}` : ""}`;
        if (ev.type === "agent_output" || ev.type === "agent_log") return `${ev.emoji || ""} ${ev.agentName || "agent"}: ${String(ev.output || ev.message || "").slice(0, 120)}`;
        if (ev.type === "agent_killed") return `${ev.emoji || ""} ${ev.name || "agent"} killed`;
        if (ev.type === "ball_voice_command") return `\u{1F3A4} "${ev.command || ""}"`;
        if (ev.type === "ball_auto_spawn") return `\u26A1 auto-deployed ${ev.agentName || ev.name}`;
        if (ev.topic) return `${ev.topic}${ev.agentName ? " \xB7 " + ev.agentName : ""}`;
        if (ev.message) return String(ev.message).slice(0, 140);
        if (ev.raw) return ev.raw;
        return String(ev.type || JSON.stringify(ev)).slice(0, 140);
      }
      function useWorkflowDetail(workflowId) {
        const [detail, setDetail] = useS_p(null);
        useE_p(() => {
          if (!workflowId) {
            setDetail(null);
            return;
          }
          let cancelled = false;
          async function tick() {
            const d = await tryProxy(7784, `/api/workflow/${encodeURIComponent(workflowId)}`);
            if (!cancelled) setDetail(d || null);
          }
          tick();
          const t = setInterval(tick, 2e3);
          return () => {
            cancelled = true;
            clearInterval(t);
          };
        }, [workflowId]);
        return detail;
      }
      function DelegationTab() {
        const { pipeline, stream, mission, anyConnected } = useData();
        const [selected, setSelected] = useS_p(null);
        const active = (pipeline == null ? void 0 : pipeline.active) || [];
        const completed = (pipeline == null ? void 0 : pipeline.completed) || [];
        useE_p(() => {
          if (!selected && active.length > 0) setSelected(active[0].id);
        }, [active, selected]);
        const baseWf = active.find((w) => w.id === selected) || completed.find((w) => w.id === selected);
        const detail = useWorkflowDetail(selected);
        const wf = detail || baseWf;
        const wfEvents = useM_p(() => {
          if (!selected) return [];
          return stream.events.filter((ev) => {
            const blob = JSON.stringify(ev).toLowerCase();
            return blob.includes(String(selected).toLowerCase());
          });
        }, [stream.events, selected]);
        return /* @__PURE__ */ React.createElement("div", { className: "tab-pane", style: { gridTemplateColumns: "280px 1fr 340px" } }, /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "in flight"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Workflows")), /* @__PURE__ */ React.createElement("span", { className: "pill", style: { color: active.length ? "var(--cyan)" : "var(--text-3)" } }, active.length)), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "flex", flexDirection: "column", gap: 6 } }, !anyConnected ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u25EB", title: "orchestrator offline", hint: "start orchestrator on :7784 to see live workflows." }) : !pipeline ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u25CC", title: "no pipeline data", hint: "orchestrator returned no /api/pipeline response yet." }) : active.length === 0 && completed.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u25CC", title: "pipeline empty", hint: "send a command via chat composer or `purpclaw run` to seed a workflow." }) : /* @__PURE__ */ React.createElement(React.Fragment, null, active.map((wfi) => /* @__PURE__ */ React.createElement(
          WorkflowListRow,
          {
            key: wfi.id,
            wf: wfi,
            selected: selected === wfi.id,
            onSelect: () => setSelected(wfi.id)
          }
        )), completed.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, padding: "4px 6px", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--text-3)" } }, "\u2500 recently completed \u2500"), completed.slice(0, 8).map((wfi) => /* @__PURE__ */ React.createElement(
          WorkflowListRow,
          {
            key: wfi.id,
            wf: wfi,
            selected: selected === wfi.id,
            onSelect: () => setSelected(wfi.id),
            dim: true
          }
        ))))), /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "live trace"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, wf ? wf.id : "no workflow selected")), wf && /* @__PURE__ */ React.createElement("span", { className: "pill", style: { color: wf.status === "running" ? "var(--cyan)" : wf.status === "completed" ? "var(--emerald)" : wf.status === "failed" ? "var(--red)" : "var(--text-3)" } }, wf.status)), /* @__PURE__ */ React.createElement("div", { className: "panel-body" }, !wf ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u27F6", title: "select a workflow", hint: "pick one from the left to see its live trace." }) : /* @__PURE__ */ React.createElement(WorkflowTrace, { wf }))), /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "live events"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "For ", selected ? selected.slice(-8) : "\u2014")), /* @__PURE__ */ React.createElement("span", { className: "mono tiny muted" }, wfEvents.length)), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "flex", flexDirection: "column", gap: 1 } }, !selected ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u2261", title: "\u2014", hint: "select a workflow to filter the live stream." }) : wfEvents.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { padding: 14, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", lineHeight: 1.5 } }, "waiting for events tagged with this workflow id. SSE stream connected, no matches yet.") : wfEvents.slice(0, 40).map((ev) => /* @__PURE__ */ React.createElement("div", { key: ev._id, className: `event ${eventTone(ev)}` }, /* @__PURE__ */ React.createElement("span", { className: "event-time" }, formatTs(ev._time)), /* @__PURE__ */ React.createElement("span", { className: "event-src" }, ev._source), /* @__PURE__ */ React.createElement("span", { className: "event-msg" }, eventLabel(ev)))))));
      }
      function WorkflowListRow({ wf, selected, onSelect, dim }) {
        const status = String(wf.status || "").toLowerCase();
        const tone = status === "running" ? "var(--cyan)" : status === "completed" ? "var(--emerald)" : status === "failed" ? "var(--red)" : "var(--text-3)";
        return /* @__PURE__ */ React.createElement("button", { onClick: onSelect, style: {
          textAlign: "left",
          padding: "10px 12px",
          background: selected ? `${tone}12` : "var(--panel-2)",
          border: `1px solid ${selected ? tone : "var(--line-soft)"}`,
          borderRadius: 0,
          opacity: dim && !selected ? 0.6 : 1,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          boxShadow: selected ? `0 0 12px ${tone}30` : "none"
        } }, /* @__PURE__ */ React.createElement("div", { className: "row", style: { justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("span", { style: { color: tone, fontFamily: "var(--font-mono)", fontSize: 10 } }, wf.id), /* @__PURE__ */ React.createElement("span", { style: { color: tone, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" } }, status)), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-2)", fontSize: 11.5, lineHeight: 1.4 } }, wf.intent || wf.target || "(no intent)"), wf.steps && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 4, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 0, overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: {
          width: `${wf.steps.completed / Math.max(wf.steps.total, 1) * 100}%`,
          height: "100%",
          background: tone,
          boxShadow: `0 0 6px ${tone}`
        } })));
      }
      function WorkflowTrace({ wf }) {
        const trace = wf.trace || [];
        const delegation = wf.delegation || null;
        const route = wf.route || null;
        const plan = wf.plan || null;
        return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { padding: 14, background: "var(--panel-2)", borderRadius: 0, border: "1px solid var(--line)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6 } }, "intent"), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text)", fontSize: 14, lineHeight: 1.5 } }, wf.intent || wf.target || "(no intent)"), wf.target && wf.target !== wf.intent && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" } }, "target: ", wf.target)), delegation && /* @__PURE__ */ React.createElement("div", { style: {
          padding: 12,
          borderRadius: 0,
          background: "rgba(168, 85, 247, 0.04)",
          border: "1px solid rgba(168, 85, 247, 0.25)"
        } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--purple)", marginBottom: 8 } }, "delegation"), delegation.mode === "team" ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { className: "row", style: { gap: 8 } }, /* @__PURE__ */ React.createElement("span", { className: "mono tiny upper muted" }, "team led by"), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--purple)", fontFamily: "var(--font-mono)", fontSize: 12 } }, delegation.leader)), /* @__PURE__ */ React.createElement("div", { className: "row", style: { flexWrap: "wrap", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { className: "mono tiny upper muted" }, "members:"), (delegation.members || []).map((m) => /* @__PURE__ */ React.createElement("span", { key: m, className: "pill mono", style: { color: "var(--cyan)", fontSize: 10 } }, m)))) : /* @__PURE__ */ React.createElement("div", { className: "row", style: { gap: 8 } }, /* @__PURE__ */ React.createElement("span", { className: "mono tiny upper muted" }, "solo agent"), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--purple)", fontFamily: "var(--font-mono)", fontSize: 12 } }, delegation.selectedAgent || delegation.agent || "\u2014"))), plan && plan.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 } }, "plan"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: `repeat(${Math.min(plan.length, 6)}, 1fr)`, gap: 6 } }, plan.map((step) => /* @__PURE__ */ React.createElement("div", { key: step.order, style: {
          padding: 8,
          background: "var(--panel-2)",
          border: "1px solid var(--line-soft)",
          borderRadius: 0,
          fontFamily: "var(--font-mono)",
          fontSize: 10
        } }, /* @__PURE__ */ React.createElement("div", { style: { color: "var(--cyan)" } }, String(step.order).padStart(2, "0"), " \xB7 ", step.stage), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-2)", marginTop: 4 } }, step.operation), step.leader && /* @__PURE__ */ React.createElement("div", { style: { color: "var(--purple)", marginTop: 4 } }, "\u21B3 ", step.leader))))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "row", style: { justifyContent: "space-between", marginBottom: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--text-3)" } }, "trace \xB7 live"), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)" } }, trace.length, " steps")), trace.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { padding: 14, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", lineHeight: 1.5, textAlign: "center" } }, "no trace entries yet. the orchestrator emits trace events as the workflow progresses.") : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } }, trace.map((step, i) => {
          const stageTone = step.status === "failed" ? "var(--red)" : step.status === "completed" || step.status === "succeeded" ? "var(--emerald)" : step.status === "started" || step.status === "running" ? "var(--cyan)" : "var(--text-3)";
          return /* @__PURE__ */ React.createElement("div", { key: i, style: {
            display: "grid",
            gridTemplateColumns: "64px 110px 130px 1fr",
            gap: 10,
            padding: "8px 10px",
            background: "var(--panel-2)",
            border: "1px solid var(--line-soft)",
            borderLeft: `3px solid ${stageTone}`,
            borderRadius: 0,
            fontFamily: "var(--font-mono)",
            fontSize: 10
          } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-mute)" } }, formatTs(step.timestamp)), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--cyan)" } }, step.stage || "\u2014"), /* @__PURE__ */ React.createElement("span", { style: { color: stageTone } }, step.status || "\u2014"), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-2)" } }, step.agentName && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--purple)" } }, step.agentName, " \xB7 "), step.detail || "(no detail)"));
        }))), wf.result && /* @__PURE__ */ React.createElement("div", { style: { padding: 12, background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--emerald)", marginBottom: 6 } }, "result"), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-2)", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" } }, wf.result)), wf.error && /* @__PURE__ */ React.createElement("div", { style: { padding: 12, background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--red)", marginBottom: 6 } }, "error"), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-2)", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" } }, wf.error)));
      }
      function WorkflowsTab() {
        const { pipeline, anyConnected } = useData();
        const active = (pipeline == null ? void 0 : pipeline.active) || [];
        const completed = (pipeline == null ? void 0 : pipeline.completed) || [];
        return /* @__PURE__ */ React.createElement("div", { className: "tab-pane", style: { gridTemplateColumns: "1fr", gridTemplateRows: "1fr 1fr", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "pipeline"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Active \xB7 ", active.length)), (pipeline == null ? void 0 : pipeline.metrics) && /* @__PURE__ */ React.createElement("span", { className: "mono tiny muted" }, "total ", pipeline.metrics.total || 0, " \xB7 done ", pipeline.metrics.completed || 0, " \xB7 failed ", pipeline.metrics.failed || 0)), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "flex", flexDirection: "column", gap: 10 } }, !anyConnected ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u25EB", title: "orchestrator offline" }) : !pipeline ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u25CC", title: "no pipeline endpoint" }) : active.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u25CC", title: "nothing active", hint: "send a command via chat composer." }) : active.map((wf) => /* @__PURE__ */ React.createElement(WorkflowFullCard, { key: wf.id, wf })))), /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "archive"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Recently complete \xB7 ", completed.length))), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "flex", flexDirection: "column", gap: 10 } }, completed.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u25CC", title: "no completed workflows yet" }) : completed.slice(0, 20).map((wf) => /* @__PURE__ */ React.createElement(WorkflowFullCard, { key: wf.id, wf })))));
      }
      function WorkflowFullCard({ wf }) {
        const status = String(wf.status || "").toLowerCase();
        const tone = status === "running" ? "var(--cyan)" : status === "completed" ? "var(--emerald)" : status === "failed" ? "var(--red)" : "var(--text-3)";
        const trace = wf.trace || [];
        return /* @__PURE__ */ React.createElement("div", { style: {
          border: "1px solid var(--line)",
          borderRadius: 0,
          padding: 12,
          background: "var(--panel-2)"
        } }, /* @__PURE__ */ React.createElement("div", { className: "row", style: { justifyContent: "space-between", marginBottom: 10 } }, /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("span", { className: "mono", style: { color: tone, fontSize: 12 } }, wf.id), /* @__PURE__ */ React.createElement("span", { className: "pill", style: { color: tone } }, status)), /* @__PURE__ */ React.createElement("span", { className: "mono tiny muted" }, wf.duration ? `${(wf.duration / 1e3).toFixed(1)}s` : wf.startTime ? ageHuman(ageMs(wf.startTime)) : "\u2014")), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text)", fontSize: 13, marginBottom: 12 } }, wf.intent || wf.target), trace.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: `repeat(${Math.min(trace.length, 6)}, 1fr)`, gap: 4 } }, trace.slice(0, 6).map((step, i) => {
          const stTone = step.status === "failed" ? "var(--red)" : step.status === "completed" || step.status === "succeeded" ? "var(--emerald)" : step.status === "started" || step.status === "running" ? "var(--cyan)" : "var(--text-3)";
          return /* @__PURE__ */ React.createElement("div", { key: i, style: {
            padding: "6px 8px",
            background: `${stTone}12`,
            border: `1px solid ${stTone}40`,
            borderRadius: 0,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            textAlign: "center"
          } }, /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-3)" } }, String(i + 1).padStart(2, "0")), /* @__PURE__ */ React.createElement("div", { style: { color: stTone, marginTop: 2 } }, step.stage));
        })));
      }
      function MessagesTab() {
        const { stream, agents, anyConnected } = useData();
        const messages = stream.events.filter((ev) => {
          const t = String(ev.type || "").toLowerCase();
          const topic = String(ev.topic || "").toLowerCase();
          return t.includes("message") || t === "agent_output" || t === "agent_log" || topic.includes("message") || topic.includes("chat");
        });
        return /* @__PURE__ */ React.createElement("div", { className: "tab-pane", style: { gridTemplateColumns: "1fr 380px" } }, /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "inter-agent"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Message Stream")), /* @__PURE__ */ React.createElement("span", { className: "mono tiny", style: { color: messages.length ? "var(--emerald)" : "var(--text-3)" } }, messages.length, " buffered")), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "flex", flexDirection: "column", gap: 4 } }, !anyConnected ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u2709", title: "backend offline" }) : messages.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u2709", title: "no inter-agent traffic yet", hint: "messages route through eventbus :7782 and tower SSE." }) : messages.slice(0, 80).map((ev) => /* @__PURE__ */ React.createElement("div", { key: ev._id, style: {
          padding: "8px 10px",
          background: "var(--panel-2)",
          border: "1px solid var(--line-soft)",
          borderLeft: `2px solid var(--cyan)`,
          borderRadius: 0,
          fontFamily: "var(--font-mono)",
          fontSize: 10.5
        } }, /* @__PURE__ */ React.createElement("div", { className: "row", style: { justifyContent: "space-between", marginBottom: 4 } }, /* @__PURE__ */ React.createElement("div", { className: "row", style: { gap: 6 } }, ev.emoji && /* @__PURE__ */ React.createElement("span", null, ev.emoji), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--cyan)" } }, ev.agentName || ev.from || ev._source), ev.to && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2192"), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--purple)" } }, ev.to))), /* @__PURE__ */ React.createElement("span", { className: "muted" }, formatTs(ev._time))), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-2)" } }, eventLabel(ev)))))), /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "roster"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Agents \xB7 ", agents.length))), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "flex", flexDirection: "column", gap: 4 } }, agents.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u25C9", title: "no agents" }) : agents.slice(0, 60).map((a) => {
          const m = divMeta(a.division);
          return /* @__PURE__ */ React.createElement("div", { key: a.id, style: {
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            gap: 8,
            padding: "6px 8px",
            background: "var(--panel-2)",
            border: "1px solid var(--line-soft)",
            borderLeft: `2px solid ${m.color}`,
            borderRadius: 0,
            fontFamily: "var(--font-mono)",
            fontSize: 10
          } }, /* @__PURE__ */ React.createElement("span", null, a.emoji), /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text)" } }, a.name), /* @__PURE__ */ React.createElement("div", { style: { color: m.color, fontSize: 9 } }, m.name)), /* @__PURE__ */ React.createElement("span", { style: {
            color: a.status === "working" ? "var(--emerald)" : a.status === "error" ? "var(--red)" : "var(--text-3)",
            textTransform: "uppercase",
            fontSize: 9,
            letterSpacing: "0.16em"
          } }, a.status));
        }))));
      }
      function GatekeeperTab() {
        const { gatekeeper } = useData();
        const data = gatekeeper.data || {};
        const amendments = data.pendingAmendments || data.amendments || data.queue || [];
        const policies = data.policies || data.gates || [];
        return /* @__PURE__ */ React.createElement("div", { className: "tab-pane", style: { gridTemplateColumns: "1.4fr 1fr" } }, /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "approvals queue"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Pending")), /* @__PURE__ */ React.createElement("span", { className: "pill", style: { color: amendments.length ? "var(--amber)" : "var(--emerald)" } }, gatekeeper.connected ? `${amendments.length} waiting` : "OFFLINE")), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "flex", flexDirection: "column", gap: 10 } }, !gatekeeper.connected ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u2696", title: "gatekeeper offline", hint: "start gatekeeper on :7791 to surface pending approvals." }) : amendments.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u2713", title: "no approvals pending", hint: "all queued actions have been processed.", color: "var(--emerald)" }) : amendments.map((a, i) => {
          const risk = String(a.risk || a.severity || "med").toLowerCase();
          const tone = risk === "high" ? "var(--red)" : risk === "med" || risk === "medium" ? "var(--amber)" : "var(--emerald)";
          return /* @__PURE__ */ React.createElement("div", { key: a.id || i, style: {
            border: `1px solid ${tone}`,
            borderRadius: 0,
            padding: 14,
            background: tone === "var(--red)" ? "rgba(239, 68, 68, 0.04)" : tone === "var(--amber)" ? "rgba(251, 191, 36, 0.04)" : "rgba(16, 185, 129, 0.04)"
          } }, /* @__PURE__ */ React.createElement("div", { className: "row", style: { justifyContent: "space-between", marginBottom: 6 } }, /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("span", { className: "pill mono", style: { color: tone, borderColor: tone } }, "RISK \xB7 ", risk.toUpperCase()), a.agent && /* @__PURE__ */ React.createElement("span", { className: "mono tiny", style: { color: "var(--text-3)" } }, a.agent)), /* @__PURE__ */ React.createElement("span", { className: "mono tiny muted" }, formatTs(a.timestamp || a.ts))), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text)", fontSize: 14, marginBottom: 12, lineHeight: 1.5 } }, a.description || a.summary || a.action || JSON.stringify(a).slice(0, 200)), /* @__PURE__ */ React.createElement("div", { className: "row", style: { gap: 8 } }, /* @__PURE__ */ React.createElement(
            "button",
            {
              onClick: () => approveAmendment(a.id, "approve"),
              style: {
                flex: 1,
                padding: "8px 14px",
                borderRadius: 0,
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid var(--emerald)",
                color: "var(--emerald)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.08em"
              }
            },
            "APPROVE"
          ), /* @__PURE__ */ React.createElement(
            "button",
            {
              onClick: () => approveAmendment(a.id, "reject"),
              style: {
                flex: 1,
                padding: "8px 14px",
                borderRadius: 0,
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid var(--red)",
                color: "var(--red)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.08em"
              }
            },
            "REJECT"
          )));
        }))), /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "policy"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Active gates"))), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "flex", flexDirection: "column", gap: 6 } }, !gatekeeper.connected ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u2696", title: "gatekeeper offline" }) : policies.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u25CC", title: "no policies returned", hint: "gatekeeper /api/status didn't include a 'policies' or 'gates' array." }) : policies.map((g, i) => /* @__PURE__ */ React.createElement("div", { key: g.name || i, style: {
          padding: "8px 10px",
          background: "var(--panel-2)",
          border: "1px solid var(--line-soft)",
          borderRadius: 0,
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: 10,
          alignItems: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 10
        } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text)" } }, g.name || g.id || JSON.stringify(g).slice(0, 40)), /* @__PURE__ */ React.createElement("span", { className: "muted" }, g.mode || "\u2014"), g.hits != null && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--cyan)" } }, g.hits, "\xD7"))))));
      }
      async function approveAmendment(id, action) {
        try {
          await fetch("/api/gatekeeper-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amendmentId: id, action })
          });
        } catch (e) {
        }
      }
      function PoolTab() {
        const { services, eventTimeline } = useData();
        const poolSvc = services.find((s) => s.key === "pool");
        const poolOnline = (poolSvc == null ? void 0 : poolSvc.status) === "online";
        const [stats, setStats] = useS_p(null);
        useE_p(() => {
          let cancelled = false;
          async function tick() {
            const d = await tryProxy(7885, "/pool/stats");
            if (!cancelled && d) setStats(d);
          }
          tick();
          const t = setInterval(tick, 4e3);
          return () => {
            cancelled = true;
            clearInterval(t);
          };
        }, []);
        const poolEvents = eventTimeline.events.filter((e) => String(e.topic || "").includes("pool"));
        return /* @__PURE__ */ React.createElement("div", { className: "tab-pane", style: { gridTemplateColumns: "1fr 360px" } }, /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "knowledge pool"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Query stream")), /* @__PURE__ */ React.createElement("span", { className: "mono tiny", style: { color: poolOnline ? "var(--emerald)" : "var(--red)" } }, poolOnline ? `pool:7885 online \xB7 ${poolEvents.length} events` : "pool offline")), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "flex", flexDirection: "column", gap: 4 } }, !poolOnline ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u25C9", title: "pool service offline", hint: "start the pool on :7885 to track who's querying what." }) : poolEvents.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u25CC", title: "no pool queries observed", hint: "agents query the pool when they need a skill or context. send a job to trigger one." }) : poolEvents.map((ev) => /* @__PURE__ */ React.createElement("div", { key: ev.id, style: {
          padding: "8px 12px",
          background: "var(--panel-2)",
          border: "1px solid var(--line-soft)",
          borderRadius: 0,
          display: "grid",
          gridTemplateColumns: "90px 1fr 1fr",
          gap: 10,
          fontFamily: "var(--font-mono)",
          fontSize: 10.5
        } }, /* @__PURE__ */ React.createElement("span", { className: "muted" }, formatTs(ev.ts)), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--cyan)" } }, ev.agentName || ev.agentId || "\u2014"), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-2)" } }, ev.message || ev.topic))))), /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "pool stats"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Knowledge map"))), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "flex", flexDirection: "column", gap: 10 } }, !stats ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u25C9", title: "no stats", hint: "pool /stats endpoint not responding." }) : Object.entries(stats).slice(0, 8).map(([k, v]) => /* @__PURE__ */ React.createElement("div", { key: k, style: {
          padding: 12,
          borderRadius: 0,
          background: "var(--panel-2)",
          border: "1px solid var(--line-soft)"
        } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-3)" } }, k), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 600, color: "var(--cyan)", marginTop: 4, textShadow: "0 0 8px var(--cyan)" } }, typeof v === "object" ? JSON.stringify(v).slice(0, 30) : String(v)))))));
      }
      function CognitiveTab() {
        const { services, stream } = useData();
        const cogSvc = services.find((s) => ["modal", "diagnostics", "rules", "autodream"].includes(s.key) && s.status === "online");
        const cogOnline = !!cogSvc;
        const [state, setState] = useS_p(null);
        useE_p(() => {
          let cancelled = false;
          async function tick() {
            const d = await tryProxy(7895, "/dream/status");
            if (!cancelled && d) {
              setState(d);
              return;
            }
            const m = await tryProxy(7785, "/health");
            if (!cancelled && m) setState(m);
          }
          tick();
          const t = setInterval(tick, 3500);
          return () => {
            cancelled = true;
            clearInterval(t);
          };
        }, []);
        const reasoningEvents = stream.events.filter((ev) => {
          const t = String(ev.type || ev.topic || "").toLowerCase();
          return t.includes("reasoning") || t.includes("cognitive") || t.includes("memory");
        });
        return /* @__PURE__ */ React.createElement("div", { className: "tab-pane", style: { gridTemplateColumns: "1fr 1fr" } }, /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "reasoning loop"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Cognitive Stream")), /* @__PURE__ */ React.createElement("span", { className: "mono tiny", style: { color: cogOnline ? "var(--emerald)" : "var(--red)" } }, cogOnline ? `${cogSvc.name}:${cogSvc.port} online` : "cognitive offline")), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "flex", flexDirection: "column", gap: 4 } }, !cogOnline ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u232C", title: "cognitive service offline", hint: "start a cognitive service (autodream :7895, modal :7785, diagnostics :7786, rules :7787 \u2014 all optional)." }) : reasoningEvents.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u25CC", title: "no reasoning events" }) : reasoningEvents.slice(0, 40).map((ev) => /* @__PURE__ */ React.createElement("div", { key: ev._id, className: `event ${eventTone(ev)}` }, /* @__PURE__ */ React.createElement("span", { className: "event-time" }, formatTs(ev._time)), /* @__PURE__ */ React.createElement("span", { className: "event-src" }, ev.topic || ev.type), /* @__PURE__ */ React.createElement("span", { className: "event-msg" }, eventLabel(ev)))))), /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "memory matrix"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "State"))), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "flex", flexDirection: "column", gap: 10 } }, !state ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u232C", title: "no state", hint: "cognitive /state endpoint not responding." }) : /* @__PURE__ */ React.createElement("pre", { style: {
          margin: 0,
          padding: 14,
          background: "var(--panel-2)",
          borderRadius: 0,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-2)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          maxHeight: 460,
          overflow: "auto"
        } }, JSON.stringify(state, null, 2)))));
      }
      function EventsTab() {
        const { stream, eventTimeline } = useData();
        const [filter, setFilter] = useS_p("all");
        const [src, setSrc] = useS_p("all");
        const all = [
          ...stream.events,
          ...eventTimeline.events.map((e) => {
            var _a;
            return __spreadProps(__spreadValues({}, e), { _id: e.id, _time: e.ts, _source: ((_a = e.data) == null ? void 0 : _a.source) || "bus" });
          })
        ].sort((a, b) => {
          const ta = a._time ? new Date(a._time).getTime() : 0;
          const tb = b._time ? new Date(b._time).getTime() : 0;
          return tb - ta;
        });
        const filtered = all.filter((ev) => {
          if (filter !== "all" && eventTone(ev) !== filter) return false;
          if (src !== "all" && ev._source !== src) return false;
          return true;
        });
        return /* @__PURE__ */ React.createElement("div", { className: "tab-pane", style: { gridTemplateColumns: "1fr" } }, /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "signal rail"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Live event stream \xB7 ", all.length)), /* @__PURE__ */ React.createElement("div", { className: "row", style: { gap: 4 } }, ["all", "ok", "info", "warn", "err"].map((f) => /* @__PURE__ */ React.createElement("button", { key: f, onClick: () => setFilter(f), style: {
          padding: "4px 10px",
          borderRadius: 0,
          background: filter === f ? "rgba(34, 211, 238, 0.15)" : "var(--panel-2)",
          border: `1px solid ${filter === f ? "var(--cyan)" : "var(--line-soft)"}`,
          color: filter === f ? "var(--cyan)" : "var(--text-3)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase"
        } }, f)), /* @__PURE__ */ React.createElement("span", { style: { width: 1, height: 16, background: "var(--line)" } }), ["all", "api", "tower", "bus", "orch"].map((s) => /* @__PURE__ */ React.createElement("button", { key: s, onClick: () => setSrc(s), style: {
          padding: "4px 10px",
          borderRadius: 0,
          background: src === s ? "rgba(168, 85, 247, 0.15)" : "var(--panel-2)",
          border: `1px solid ${src === s ? "var(--purple)" : "var(--line-soft)"}`,
          color: src === s ? "var(--purple)" : "var(--text-3)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase"
        } }, s)))), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "flex", flexDirection: "column", gap: 1 } }, all.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u2261", title: "no events", hint: "SSE streams not connected. start the backend." }) : filtered.map((ev) => /* @__PURE__ */ React.createElement("div", { key: ev._id, className: `event ${eventTone(ev)}` }, /* @__PURE__ */ React.createElement("span", { className: "event-time" }, formatTs(ev._time)), /* @__PURE__ */ React.createElement("span", { className: "event-src" }, ev._source), /* @__PURE__ */ React.createElement("span", { className: "event-msg" }, eventLabel(ev)))))));
      }
      function MochiTab() {
        var _a;
        const { mochi } = useData();
        const m = mochi.data;
        return /* @__PURE__ */ React.createElement("div", { className: "tab-pane", style: { gridTemplateColumns: "1fr 1fr" } }, /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "companion"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, m ? `${m.name} the ${m.species}` : "Mochi")), mochi.connected ? /* @__PURE__ */ React.createElement(StatusPill, { ok: true, label: (m == null ? void 0 : m.mood) || "on" }) : /* @__PURE__ */ React.createElement(StatusPill, { ok: false, label: "OFFLINE" })), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "grid", placeItems: "center", gap: 20 } }, !mochi.connected || !m ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u2665", title: "no mochi hatched", hint: "run `purpclaw mochi hatch` to give your companion a face.", color: "var(--purple)" }) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: {
          width: 240,
          height: 240,
          display: "grid",
          placeItems: "center",
          fontSize: 96,
          border: "1px solid var(--line-2)",
          borderRadius: 0,
          background: "radial-gradient(circle, rgba(168, 85, 247, 0.2), transparent 70%)",
          position: "relative"
        } }, /* @__PURE__ */ React.createElement("span", { style: { textShadow: "0 0 30px var(--purple)" } }, mochiEmoji(m)), /* @__PURE__ */ React.createElement("div", { style: {
          position: "absolute",
          bottom: 20,
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          color: "var(--purple)",
          textShadow: "0 0 8px var(--purple)"
        } }, `(${m.eye || "\xB7"}${m.verb || "\u03C9"}${m.eye || "\xB7"})`))))), /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "vitals"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Identity"))), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "flex", flexDirection: "column", gap: 10 } }, !m ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "\u25CC", title: "\u2014" }) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } }, /* @__PURE__ */ React.createElement(MetricCard, { label: "species", value: m.species, accent: "var(--cyan)", big: true }), /* @__PURE__ */ React.createElement(MetricCard, { label: "rarity", value: m.rarity || "common", accent: "var(--purple)", big: true }), /* @__PURE__ */ React.createElement(MetricCard, { label: "interactions", value: (_a = m.interactions) != null ? _a : 0, accent: "var(--amber)" }), /* @__PURE__ */ React.createElement(MetricCard, { label: "mood", value: m.mood || "curious", accent: "var(--pink)" })), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, padding: 12, background: "var(--panel-2)", borderRadius: 0, fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1.6 } }, /* @__PURE__ */ React.createElement(KV, { k: "eye", v: m.eye || "\u2014" }), /* @__PURE__ */ React.createElement(KV, { k: "hat", v: m.hat || "\u2014" }), /* @__PURE__ */ React.createElement(KV, { k: "tone", v: m.tone || "\u2014" }), /* @__PURE__ */ React.createElement(KV, { k: "verb", v: m.verb || "\u2014" }), /* @__PURE__ */ React.createElement(KV, { k: "shiny", v: m.shiny ? "\u2728 yes" : "no", color: m.shiny ? "var(--amber)" : "var(--text-3)" }), /* @__PURE__ */ React.createElement(KV, { k: "hatched", v: formatTs(m.hatchedAt) }))))));
      }
      Object.assign(window, {
        OverviewTab,
        DelegationTab,
        WorkflowsTab,
        MessagesTab,
        GatekeeperTab,
        PoolTab,
        CognitiveTab,
        EventsTab,
        MochiTab
      });
    }
  });
  require_panels();
})();
