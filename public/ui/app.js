"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var require_app = __commonJS({
    "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/app/public/ui/app.jsx"() {
      const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA } = React;
      const TABS = [
        { id: "skyscraper", label: "Skyscraper", icon: "\u{1F3E2}", code: "SKY" },
        { id: "overview", label: "Overview", icon: "\u25C8", code: "OVR" },
        { id: "delegation", label: "Delegation", icon: "\u27F6", code: "DLG" },
        { id: "workflows", label: "Workflows", icon: "\u25EB", code: "WFL" },
        { id: "messages", label: "Messages", icon: "\u2709", code: "MSG" },
        { id: "gatekeeper", label: "Gatekeeper", icon: "\u2696", code: "GKP" },
        { id: "pool", label: "Pool", icon: "\u25C9", code: "POL" },
        { id: "cognitive", label: "Cognitive", icon: "\u232C", code: "COG" },
        { id: "events", label: "Events", icon: "\u2261", code: "EVT" },
        { id: "mochi", label: "Mochi", icon: "\u2665", code: "MCH" }
      ];
      const SKY_SUB_TABS = [
        { id: "tower", label: "Skyscraper", icon: "\u{1F3E2}" },
        { id: "venting", label: "Venting Machine", icon: "\u25CE" },
        { id: "satellite", label: "Satellite Office", icon: "\u25C7" }
      ];
      const TWEAK_DEFAULTS = (
        /*EDITMODE-BEGIN*/
        {
          "primaryAccent": "#a855f7",
          "showWindows": true,
          "animateAgents": true,
          "showAgentMessages": true,
          "rotation": 0
        }
      );
      function Clock() {
        const [now, setNow] = useStateA(/* @__PURE__ */ new Date());
        useEffectA(() => {
          const t = setInterval(() => setNow(/* @__PURE__ */ new Date()), 1e3);
          return () => clearInterval(t);
        }, []);
        return /* @__PURE__ */ React.createElement("div", { className: "hdr-clock" }, now.toLocaleTimeString("en-US", { hour12: false }));
      }
      function Dial({ value, color = "#22d3ee", size = 36 }) {
        const r = size / 2 - 4;
        const c = 2 * Math.PI * r;
        const pct = Math.max(0, Math.min(1, (value || 0) / 100));
        return /* @__PURE__ */ React.createElement("div", { className: "dial", style: { width: size, height: size } }, /* @__PURE__ */ React.createElement("svg", { width: size, height: size, style: { transform: "rotate(-90deg)" } }, /* @__PURE__ */ React.createElement("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: "rgba(255,255,255,0.08)", strokeWidth: 3 }), /* @__PURE__ */ React.createElement(
          "circle",
          {
            cx: size / 2,
            cy: size / 2,
            r,
            fill: "none",
            stroke: color,
            strokeWidth: 3,
            strokeDasharray: c,
            strokeDashoffset: c - pct * c,
            strokeLinecap: "round",
            style: { filter: `drop-shadow(0 0 4px ${color})`, transition: "stroke-dashoffset 600ms ease" }
          }
        )));
      }
      function useHealthTone() {
        const { agents, services, anyConnected } = useData();
        if (!anyConnected) return { tone: "bad", text: "OFFLINE", color: "var(--red)" };
        const errors = agents.filter((a) => a.status === "error").length;
        const offlineCore = services.filter((s) => !s.optional && s.status === "offline").length;
        const degraded = services.filter((s) => s.status === "degraded").length;
        if (errors > 0 || offlineCore > 0) return { tone: "bad", text: errors ? `${errors} FAULTS` : "CORE DEGRADED", color: "var(--red)" };
        if (degraded > 0) return { tone: "warn", text: "PARTIAL", color: "var(--amber)" };
        const working = agents.filter((a) => a.status === "working").length;
        if (working > 0) return { tone: "good", text: `${working} AGENTS WORKING`, color: "var(--emerald)" };
        return { tone: "good", text: "ALL CLEAR", color: "var(--emerald)" };
      }
      function Header() {
        const { agents, services, mochi, connections, anyConnected } = useData();
        const working = agents.filter((a) => a.status === "working").length;
        const errors = agents.filter((a) => a.status === "error").length;
        const total = agents.length;
        const onlineSvc = services.filter((s) => s.status === "online").length;
        const sysLoad = services.length ? Math.round((1 - onlineSvc / services.length) * 50) + (errors > 0 ? 25 : 0) + (working > 5 ? 15 : 0) : 0;
        return /* @__PURE__ */ React.createElement("header", { className: "hdr" }, /* @__PURE__ */ React.createElement("div", { className: "hdr-brand" }, /* @__PURE__ */ React.createElement("div", { className: "hdr-pulse", style: {
          background: anyConnected ? "var(--cyan)" : "var(--red)",
          boxShadow: `0 0 18px ${anyConnected ? "var(--cyan)" : "var(--red)"}`
        } }), /* @__PURE__ */ React.createElement("div", { className: "hdr-logo" }, "PURPCLAW"), /* @__PURE__ */ React.createElement("div", { className: "hdr-sub" }, "// Command Center")), /* @__PURE__ */ React.createElement("div", { className: "hdr-vitals" }, /* @__PURE__ */ React.createElement("div", { className: "vital" }, /* @__PURE__ */ React.createElement("div", { className: "vital-dot", style: { background: "var(--cyan)", color: "var(--cyan)" } }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "vital-num", style: { color: "var(--cyan)" } }, anyConnected ? working : "\u2014", anyConnected && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-3)", fontSize: 11 } }, "/", total)), /* @__PURE__ */ React.createElement("div", { className: "vital-lbl" }, "agents active"))), /* @__PURE__ */ React.createElement("div", { className: "vital" }, /* @__PURE__ */ React.createElement("div", { className: "vital-dot", style: { background: errors ? "var(--red)" : "var(--emerald)", color: errors ? "var(--red)" : "var(--emerald)" } }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "vital-num", style: { color: errors ? "var(--red)" : "var(--emerald)" } }, anyConnected ? errors : "\u2014"), /* @__PURE__ */ React.createElement("div", { className: "vital-lbl" }, "faults"))), /* @__PURE__ */ React.createElement("div", { className: "vital" }, /* @__PURE__ */ React.createElement("div", { className: "vital-dot", style: { background: "var(--emerald)", color: "var(--emerald)" } }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "vital-num", style: { color: "var(--emerald)" } }, anyConnected ? onlineSvc : "\u2014", anyConnected && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-3)", fontSize: 11 } }, "/", services.length)), /* @__PURE__ */ React.createElement("div", { className: "vital-lbl" }, "services"))), /* @__PURE__ */ React.createElement("div", { className: "vital" }, /* @__PURE__ */ React.createElement(Dial, { value: sysLoad, color: sysLoad > 60 ? "var(--red)" : "var(--amber)", size: 36 }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "vital-num", style: { color: sysLoad > 60 ? "var(--red)" : "var(--amber)", fontSize: 13 } }, anyConnected ? `${sysLoad}%` : "\u2014"), /* @__PURE__ */ React.createElement("div", { className: "vital-lbl" }, "system load")))), /* @__PURE__ */ React.createElement("div", { className: "hdr-spark", title: "events per 30s" }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.2em", color: "var(--text-3)", textTransform: "uppercase" } }, "signal"), /* @__PURE__ */ React.createElement(HeaderSparkline, { width: 110, height: 24, color: "#22d3ee" })), /* @__PURE__ */ React.createElement("div", { className: "hdr-right" }, /* @__PURE__ */ React.createElement("div", { className: "conn-strip" }, [
          { lbl: "API", ok: connections.api },
          { lbl: "TOWER", ok: connections.tower },
          { lbl: "ORCH", ok: connections.orch },
          { lbl: "EVT", ok: connections.bus }
        ].map((c) => /* @__PURE__ */ React.createElement("div", { key: c.lbl, className: `conn ${c.ok ? "ok" : "bad"}` }, /* @__PURE__ */ React.createElement("span", { className: "conn-dot" }), c.lbl))), mochi.connected && mochi.data && /* @__PURE__ */ React.createElement("div", { className: "hdr-mochi", title: `${mochi.data.name} the ${mochi.data.species} \u2014 ${mochi.data.mood || "curious"}` }, /* @__PURE__ */ React.createElement("span", { className: "hdr-mochi-face" }, mochiFace(mochi.data)), /* @__PURE__ */ React.createElement("span", { className: "hdr-mochi-name" }, mochi.data.name)), /* @__PURE__ */ React.createElement(Clock, null)));
      }
      function mochiFace(m) {
        if (!m) return "(\xB7\u03C9\xB7)";
        const eye = m.eye || "\xB7";
        return `(${eye}${m.verb || "\u03C9"}${eye})`;
      }
      function DisconnectedBanner() {
        const { anyConnected, mission } = useData();
        if (anyConnected) return null;
        if (mission.loading) return null;
        return /* @__PURE__ */ React.createElement("div", { style: {
          flexShrink: 0,
          padding: "8px 18px",
          background: "linear-gradient(90deg, rgba(239, 68, 68, 0.18), rgba(239, 68, 68, 0.06))",
          borderBottom: "1px solid rgba(239, 68, 68, 0.4)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--red)",
          letterSpacing: "0.08em",
          zIndex: 20
        } }, /* @__PURE__ */ React.createElement("span", { style: { width: 8, height: 8, borderRadius: 0, background: "var(--red)", boxShadow: "0 0 8px var(--red)" } }), /* @__PURE__ */ React.createElement("span", { style: { textTransform: "uppercase", fontWeight: 600 } }, "backend offline"), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-3)" } }, "no PURPCLAW services reachable on localhost:7780\u20137790. start the stack with ", /* @__PURE__ */ React.createElement("span", { style: { color: "var(--cyan)" } }, "purpclaw start"), " and refresh."));
      }
      function EmptyState({ icon, title, hint, color = "var(--text-3)" }) {
        return /* @__PURE__ */ React.createElement("div", { style: {
          flex: 1,
          display: "grid",
          placeItems: "center",
          padding: 30
        } }, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", maxWidth: 380, display: "flex", flexDirection: "column", gap: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 48, color, textShadow: `0 0 20px ${color}`, opacity: 0.5 } }, icon || "\u25CC"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text-2)", letterSpacing: "0.04em" } }, title), hint && /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-3)", fontSize: 12, lineHeight: 1.5 } }, hint)));
      }
      function TabBar({ active, onChange }) {
        return /* @__PURE__ */ React.createElement("nav", { className: "tabbar" }, TABS.map((tab) => /* @__PURE__ */ React.createElement(
          "button",
          {
            key: tab.id,
            className: `tab${active === tab.id ? " active" : ""}`,
            onClick: () => onChange(tab.id)
          },
          /* @__PURE__ */ React.createElement("span", { className: "tab-icon" }, tab.icon),
          /* @__PURE__ */ React.createElement("span", null, tab.label),
          /* @__PURE__ */ React.createElement("span", { className: "tab-badge" }, tab.code)
        )));
      }
      function SkyscraperTab({ t, setTweak, zoom, setZoom, pan, setPan, resetView, selectedFloorOverride, onSelectedFloorChange }) {
        var _a;
        const { floors, agents, mission, anyConnected, services, mochi, stream } = useData();
        const health = useHealthTone();
        const [subTab, setSubTab] = useStateA("tower");
        const [selectedFloor, setSelectedFloor] = useStateA(null);
        useEffectA(() => {
          if (!selectedFloor && floors.length > 0) {
            const firstWithAgents = floors.find((f) => f.agents > 0) || floors[0];
            setSelectedFloor(firstWithAgents.id);
          }
        }, [floors]);
        useEffectA(() => {
          if (selectedFloorOverride && selectedFloorOverride !== selectedFloor) {
            setSelectedFloor(selectedFloorOverride);
          }
        }, [selectedFloorOverride]);
        useEffectA(() => {
          if (onSelectedFloorChange) onSelectedFloorChange(selectedFloor);
        }, [selectedFloor]);
        const floor = floors.find((f) => f.id === selectedFloor);
        const div = floor ? divMeta(floor.div) : null;
        if (subTab === "venting") {
          return /* @__PURE__ */ React.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", padding: 10, gap: 10, minHeight: 0 } }, /* @__PURE__ */ React.createElement(SkySubBar, { active: subTab, onChange: setSubTab }), /* @__PURE__ */ React.createElement(VentingMachine, null));
        }
        if (subTab === "satellite") {
          return /* @__PURE__ */ React.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", padding: 10, gap: 10, minHeight: 0 } }, /* @__PURE__ */ React.createElement(SkySubBar, { active: subTab, onChange: setSubTab }), /* @__PURE__ */ React.createElement(SatelliteOffice, null));
        }
        const towerOnline = ((_a = services.find((s) => s.key === "tower")) == null ? void 0 : _a.status) === "online";
        return /* @__PURE__ */ React.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", padding: 10, gap: 10, minHeight: 0 } }, /* @__PURE__ */ React.createElement(SkySubBar, { active: subTab, onChange: setSubTab }), /* @__PURE__ */ React.createElement("div", { className: "sky" }, floors.length > 0 ? /* @__PURE__ */ React.createElement(
          FloorSpine,
          {
            floors,
            divisions: DIVISIONS,
            selected: selectedFloor,
            onSelect: setSelectedFloor
          }
        ) : /* @__PURE__ */ React.createElement("div", { className: "spine" }, /* @__PURE__ */ React.createElement("div", { className: "spine-h" }, /* @__PURE__ */ React.createElement("span", null, "Floors"), /* @__PURE__ */ React.createElement("span", null, "0")), /* @__PURE__ */ React.createElement("div", { style: { padding: 20, textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 10 } }, towerOnline ? "no divisions populated" : "agent_tower offline")), /* @__PURE__ */ React.createElement("div", { className: "stage" }, /* @__PURE__ */ React.createElement("div", { className: "stage-h" }, /* @__PURE__ */ React.createElement("span", { className: "stage-title" }, floor ? `\u25B2 AGENT OFFICE // FL.${String(floor.level).padStart(2, "0")}` : "\u25B2 AGENT OFFICE"), /* @__PURE__ */ React.createElement("div", { className: "row", style: { gap: 10, flexWrap: "wrap" } }, floors.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(ZoomControl, { zoom, setZoom, onReset: resetView }), /* @__PURE__ */ React.createElement(RotationControl, { rotation: t.rotation || 0, onRotate: (v) => setTweak("rotation", v) })), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" } }, agents.length, " agents \xB7 ", floors.length, " floors"))), /* @__PURE__ */ React.createElement("div", { className: "stage-canvas" }, floors.length > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
          IsoTower,
          {
            floors,
            divisions: DIVISIONS,
            selected: selectedFloor,
            onSelect: setSelectedFloor,
            showWindows: t.showWindows,
            rotation: t.rotation || 0,
            onRotate: (v) => setTweak("rotation", v),
            zoom,
            setZoom,
            pan,
            setPan,
            mochi,
            stream,
            healthTone: health.tone,
            statusText: health.text,
            statusColor: health.color
          }
        ), /* @__PURE__ */ React.createElement("div", { style: {
          position: "absolute",
          left: 14,
          bottom: 12,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-3)",
          pointerEvents: "none"
        } }, /* @__PURE__ */ React.createElement("div", null, "VIEW \xB7 ISO 30\xB0", t.rotation ? ` + ${Math.round(t.rotation)}\xB0` : "", " \xB7 ", Math.round(zoom * 100), "%"), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-mute)", fontSize: 9 } }, "drag rotate \xB7 shift+drag pan \xB7 wheel zoom"), /* @__PURE__ */ React.createElement("div", null, "SOURCE \xB7 tower:7790"), /* @__PURE__ */ React.createElement("div", { style: { color: towerOnline ? "var(--emerald)" : "var(--red)" } }, towerOnline ? "LIVE" : "OFFLINE")), floor && div && /* @__PURE__ */ React.createElement("div", { style: {
          position: "absolute",
          right: 14,
          top: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "flex-end",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          pointerEvents: "none"
        } }, /* @__PURE__ */ React.createElement("span", { style: {
          padding: "4px 10px",
          borderRadius: 0,
          background: `${div.color}15`,
          border: `1px solid ${div.color}`,
          color: div.color,
          textShadow: `0 0 6px ${div.color}`,
          letterSpacing: "0.16em",
          textTransform: "uppercase"
        } }, "\u25C9 ", div.name), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-3)" } }, "FL.", String(floor.level).padStart(2, "0"), " \xB7 ", floor.agents, " agents \xB7 ", floor.working || 0, " working"))) : /* @__PURE__ */ React.createElement(
          EmptyState,
          {
            icon: "\u{1F3E2}",
            title: towerOnline ? "tower online, no agents registered" : "agent_tower not reachable",
            hint: towerOnline ? 'spawn an agent via the chat composer or `purpclaw run "<task>"` to populate floors.' : "start the stack with `purpclaw start`. mission-control polls :7790/tower/status every 4s.",
            color: towerOnline ? "var(--cyan)" : "var(--red)"
          }
        ))), /* @__PURE__ */ React.createElement("div", { className: "cavity" }, /* @__PURE__ */ React.createElement("div", { className: "cavity-h" }, /* @__PURE__ */ React.createElement("div", { className: "cavity-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "cavity-h-tag", style: { color: div == null ? void 0 : div.color } }, "FLOOR \xB7 ", floor ? String(floor.level).padStart(2, "0") : "--"), /* @__PURE__ */ React.createElement("span", { className: "cavity-h-title", style: { color: div == null ? void 0 : div.color, textShadow: div ? `0 0 6px ${div.color}` : "none" } }, (div == null ? void 0 : div.name) || "\u2014")), floor && /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--font-mono)", fontSize: 10, color: div == null ? void 0 : div.color } }, floor.agents, " agents \xB7 ", floor.working || 0, " working")), /* @__PURE__ */ React.createElement("div", { className: "cavity-room" }, floor && div && floor.agents > 0 ? /* @__PURE__ */ React.createElement(
          FloorRoom,
          {
            floor,
            division: div,
            agents,
            showMessages: t.showAgentMessages,
            animate: t.animateAgents
          }
        ) : /* @__PURE__ */ React.createElement(
          EmptyState,
          {
            icon: floor ? "\u25CC" : "\u25C7",
            title: floor ? `floor empty \u2014 no agents on ${div == null ? void 0 : div.name}` : "select a floor",
            hint: floor ? "agents in this division spawn here when the orchestrator delegates work." : "click any floor on the spine or directly on the tower.",
            color: (div == null ? void 0 : div.color) || "var(--text-3)"
          }
        )), /* @__PURE__ */ React.createElement("div", { className: "cavity-foot" }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--text-3)" } }, "agents on this floor"), floor && agents.filter((a) => a.floor === selectedFloor).map((a) => /* @__PURE__ */ React.createElement("div", { key: a.id, className: "agent-chip", style: {
          borderColor: a.status === "error" ? "var(--red)" : `${(div == null ? void 0 : div.color) || "var(--line-soft)"}`,
          boxShadow: a.status === "working" ? `0 0 8px ${div == null ? void 0 : div.color}33` : "none"
        } }, /* @__PURE__ */ React.createElement("span", { className: "agent-chip-emoji" }, a.emoji), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "agent-chip-name" }, a.name), /* @__PURE__ */ React.createElement("div", { className: "agent-chip-task" }, a.task || (a.status === "idle" ? "\xB7 idle, registered" : "\xB7 no task"))), /* @__PURE__ */ React.createElement("span", { style: {
          width: 6,
          height: 6,
          borderRadius: 0,
          background: a.status === "working" ? "var(--emerald)" : a.status === "error" ? "var(--red)" : a.status === "completed" ? "var(--purple)" : "var(--text-mute)",
          boxShadow: a.status === "working" ? "0 0 5px var(--emerald)" : a.status === "error" ? "0 0 5px var(--red)" : "none"
        } }))), floor && agents.filter((a) => a.floor === selectedFloor).length === 0 && /* @__PURE__ */ React.createElement("div", { style: { padding: "12px 0", textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 10 } }, "no agents on this floor")))));
      }
      function SkySubBar({ active, onChange }) {
        var _a, _b;
        const { tower } = useData();
        const totalAgents = (((_a = tower.activeAgents) == null ? void 0 : _a.length) || 0) + (((_b = tower.registeredAgents) == null ? void 0 : _b.length) || 0);
        const venting = (tower.activeAgents || []).filter((a) => a.status === "error" || a.status === "stalled").length;
        return /* @__PURE__ */ React.createElement("div", { className: "sky-subs" }, SKY_SUB_TABS.map((t) => {
          const badge = t.id === "tower" ? totalAgents : t.id === "venting" ? venting : 0;
          return /* @__PURE__ */ React.createElement(
            "button",
            {
              key: t.id,
              className: `sky-sub${active === t.id ? " active" : ""}`,
              onClick: () => onChange(t.id)
            },
            /* @__PURE__ */ React.createElement("span", { className: "sky-sub-icon" }, t.icon),
            /* @__PURE__ */ React.createElement("span", { className: "sky-sub-label" }, t.label),
            badge > 0 && /* @__PURE__ */ React.createElement("span", { className: "sky-sub-badge" }, badge)
          );
        }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement("div", { style: {
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 14px",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-3)",
          letterSpacing: "0.18em",
          textTransform: "uppercase"
        } }, /* @__PURE__ */ React.createElement("span", null, "view mode"), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--cyan)" } }, "ISOMETRIC \xB7 30\xB0")));
      }
      function VentingMachine() {
        const { agents, connections } = useData();
        const venting = agents.filter((a) => a.status === "error" || a.status === "stalled");
        return /* @__PURE__ */ React.createElement("div", { className: "panel", style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "agent decompression"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Venting Machine")), /* @__PURE__ */ React.createElement("span", { className: "pill", style: { color: venting.length ? "var(--amber)" : "var(--emerald)" } }, venting.length, " cooling off")), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { padding: 0, position: "relative" } }, !connections.tower ? /* @__PURE__ */ React.createElement(
          EmptyState,
          {
            icon: "\u25CE",
            title: "agent_tower offline",
            hint: "venting state is derived from /tower/status \u2014 bring the tower service back to see who's cooling off.",
            color: "var(--red)"
          }
        ) : venting.length === 0 ? /* @__PURE__ */ React.createElement(
          EmptyState,
          {
            icon: "\u25C9",
            title: "all systems nominal",
            hint: "no agents in error or stall state. the venting machine is empty.",
            color: "var(--emerald)"
          }
        ) : /* @__PURE__ */ React.createElement("div", { style: { padding: 14, display: "flex", flexDirection: "column", gap: 10 } }, venting.map((a) => {
          const m = divMeta(a.division);
          return /* @__PURE__ */ React.createElement("div", { key: a.id, style: {
            padding: 12,
            background: "var(--panel-2)",
            border: `1px solid ${m.color}40`,
            borderLeft: `3px solid ${m.color}`,
            borderRadius: 0,
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            gap: 12,
            alignItems: "start"
          } }, /* @__PURE__ */ React.createElement("div", { style: {
            width: 44,
            height: 44,
            display: "grid",
            placeItems: "center",
            fontSize: 24,
            background: `${m.color}15`,
            border: `1px solid ${m.color}`,
            borderRadius: 0,
            boxShadow: `0 0 12px ${m.color}66`
          } }, a.emoji), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "row", style: { gap: 10, marginBottom: 4 } }, /* @__PURE__ */ React.createElement("span", { style: { color: m.color, fontFamily: "var(--font-mono)", fontSize: 12 } }, a.name), /* @__PURE__ */ React.createElement("span", { className: "pill", style: { color: m.color, fontSize: 8 } }, m.name.toUpperCase()), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--red)", fontFamily: "var(--font-mono)", fontSize: 10 } }, "\xB7 ", a.status)), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-2)", fontSize: 11.5, lineHeight: 1.5 } }, a.task || "(no current task)")), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right", display: "flex", flexDirection: "column", gap: 4 } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", color: "var(--text-3)", textTransform: "uppercase" } }, "since"), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--font-mono)", fontSize: 12, color: m.color } }, a.startTime ? new Date(a.startTime).toLocaleTimeString("en-US", { hour12: false }) : "\u2014")));
        }))));
      }
      function SatelliteOffice() {
        const { services } = useData();
        const satellite = services.filter((s) => ["voice", "cognitive", "pool"].includes(s.key));
        const online = satellite.filter((s) => s.status === "online");
        return /* @__PURE__ */ React.createElement("div", { className: "panel", style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "remote workers"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Satellite Office")), /* @__PURE__ */ React.createElement("span", { className: "pill", style: { color: online.length ? "var(--emerald)" : "var(--text-3)" } }, online.length, "/", satellite.length, " online")), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { padding: 14, display: "flex", flexDirection: "column", gap: 10 } }, satellite.map((s) => {
          const tone = s.status === "online" ? "var(--emerald)" : s.status === "degraded" ? "var(--amber)" : "var(--text-3)";
          return /* @__PURE__ */ React.createElement("div", { key: s.key, style: {
            padding: 14,
            borderRadius: 0,
            background: "var(--panel-2)",
            border: `1px solid ${s.status === "online" ? tone : "var(--line-soft)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: s.status === "online" ? 1 : 0.6
          } }, /* @__PURE__ */ React.createElement("div", { className: "row", style: { gap: 14 } }, /* @__PURE__ */ React.createElement("span", { style: { width: 10, height: 10, borderRadius: 0, background: tone, boxShadow: `0 0 8px ${tone}` } }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 12 } }, s.name), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 10, marginTop: 2 } }, ":", s.port, " \xB7 ", s.path))), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right" } }, /* @__PURE__ */ React.createElement("div", { style: { color: tone, fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em" } }, s.status), s.latency != null && /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 10, marginTop: 2 } }, s.latency, "ms")));
        }), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, padding: 10, background: "var(--panel-2)", borderRadius: 0, color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1.5 } }, "satellite services run alongside the core tower. voice handles ball commands; cognitive runs the memory matrix + reasoning loop; pool serves the open knowledge index.")));
      }
      Object.assign(window, { Header, TabBar, EmptyState, DisconnectedBanner, SkyscraperTab, mochiFace });
      function AppInner() {
        var _a, _b;
        const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
        const [tab, setTab] = useStateA("skyscraper");
        const [paletteOpen, setPaletteOpen] = useStateA(false);
        const [focusMode, setFocusMode] = useStateA(false);
        const [zoom, setZoom] = useStateA(1);
        const [pan, setPan] = useStateA({ x: 0, y: 0 });
        const [selectedWorkflow, setSelectedWorkflow] = useStateA(null);
        const [cameras, setCameras] = useStateA([]);
        const [selectedFloorGlobal, setSelectedFloorGlobal] = useStateA(null);
        const resetView = () => {
          setZoom(1);
          setPan({ x: 0, y: 0 });
          setTweak("rotation", 0);
        };
        const ctx = useData();
        useEffectA(() => {
          const handler = (e) => {
            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.key.toLowerCase() === "k") {
              e.preventDefault();
              setPaletteOpen((p) => !p);
              return;
            }
            if (e.key === "Escape" && focusMode) {
              setFocusMode(false);
              return;
            }
            if (paletteOpen) return;
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
            const k = e.key.toLowerCase();
            if (k === "f") {
              e.preventDefault();
              setFocusMode((f) => !f);
            } else if (k === "r") {
              e.preventDefault();
              setTweak("rotation", ((t.rotation || 0) + 45) % 360);
            } else if (k === "0") {
              e.preventDefault();
              resetView();
            } else if (k >= "1" && k <= "9") {
              const idx = parseInt(k) - 1;
              if (ctx.floors[idx]) {
                setTab("skyscraper");
                setSelectedFloorGlobal(ctx.floors[idx].id);
              }
            }
          };
          window.addEventListener("keydown", handler);
          return () => window.removeEventListener("keydown", handler);
        }, [paletteOpen, focusMode, t.rotation, ctx.floors]);
        const handlePaletteAction = (action) => {
          switch (action.type) {
            case "tab":
              setTab(action.id);
              break;
            case "floor":
              setTab("skyscraper");
              setSelectedFloorGlobal(action.id);
              break;
            case "agent":
              setTab("skyscraper");
              if (action.floor) setSelectedFloorGlobal(action.floor);
              break;
            case "workflow":
              setTab("delegation");
              setSelectedWorkflow(action.id);
              break;
            case "toggle_focus":
              setFocusMode((f) => !f);
              break;
            case "reset_view":
              resetView();
              break;
            case "refresh":
              window.location.reload();
              break;
            case "tweaks_open":
              try {
                window.parent.postMessage({ type: "__activate_edit_mode" }, "*");
              } catch (e) {
              }
              ;
              break;
            case "save_camera": {
              const id = `cam-${Date.now()}`;
              setCameras((c) => [...c, { id, name: `View ${c.length + 1}`, zoom, rotation: t.rotation || 0, pan }]);
              break;
            }
            case "camera_load": {
              const cam = cameras.find((c) => c.id === action.id);
              if (cam) {
                setZoom(cam.zoom);
                setTweak("rotation", cam.rotation);
                setPan(cam.pan);
              }
              break;
            }
          }
        };
        const paletteCtx = {
          tabs: TABS,
          floors: ctx.floors,
          agents: ctx.agents,
          workflows: [...((_a = ctx.pipeline) == null ? void 0 : _a.active) || [], ...(((_b = ctx.pipeline) == null ? void 0 : _b.completed) || []).slice(0, 5)],
          cameras
        };
        return /* @__PURE__ */ React.createElement("div", { className: `app${focusMode ? " focus-mode" : ""}` }, /* @__PURE__ */ React.createElement(Header, null), /* @__PURE__ */ React.createElement(TabBar, { active: tab, onChange: setTab }), /* @__PURE__ */ React.createElement(DisconnectedBanner, null), /* @__PURE__ */ React.createElement("div", { className: "main" }, tab === "skyscraper" && /* @__PURE__ */ React.createElement(
          SkyscraperTab,
          {
            t,
            setTweak,
            zoom,
            setZoom,
            pan,
            setPan,
            resetView,
            selectedFloorOverride: selectedFloorGlobal,
            onSelectedFloorChange: setSelectedFloorGlobal
          }
        ), tab === "overview" && /* @__PURE__ */ React.createElement(OverviewTab, null), tab === "delegation" && /* @__PURE__ */ React.createElement(DelegationTab, { selectedOverride: selectedWorkflow }), tab === "workflows" && /* @__PURE__ */ React.createElement(WorkflowsTab, null), tab === "messages" && /* @__PURE__ */ React.createElement(MessagesTab, null), tab === "gatekeeper" && /* @__PURE__ */ React.createElement(GatekeeperTab, null), tab === "pool" && /* @__PURE__ */ React.createElement(PoolTab, null), tab === "cognitive" && /* @__PURE__ */ React.createElement(CognitiveTab, null), tab === "events" && /* @__PURE__ */ React.createElement(EventsTab, null), tab === "mochi" && /* @__PURE__ */ React.createElement(MochiTab, null)), /* @__PURE__ */ React.createElement(
          WorkflowRibbon,
          {
            visible: !focusMode,
            onSelectWorkflow: setSelectedWorkflow,
            onJumpToDelegation: () => setTab("delegation")
          }
        ), /* @__PURE__ */ React.createElement(
          CommandPalette,
          {
            open: paletteOpen,
            onClose: () => setPaletteOpen(false),
            onAction: handlePaletteAction,
            ctx: paletteCtx
          }
        ), focusMode && /* @__PURE__ */ React.createElement("button", { className: "focus-toggle", onClick: () => setFocusMode(false) }, "exit focus \xB7 esc"), /* @__PURE__ */ React.createElement(TweaksPanel, null, /* @__PURE__ */ React.createElement(TweakSection, { label: "Skyscraper" }), /* @__PURE__ */ React.createElement(TweakToggle, { label: "Lit windows", value: t.showWindows, onChange: (v) => setTweak("showWindows", v) }), /* @__PURE__ */ React.createElement(TweakToggle, { label: "Animate agents", value: t.animateAgents, onChange: (v) => setTweak("animateAgents", v) }), /* @__PURE__ */ React.createElement(TweakToggle, { label: "Inter-agent links", value: t.showAgentMessages, onChange: (v) => setTweak("showAgentMessages", v) }), /* @__PURE__ */ React.createElement(
          TweakSlider,
          {
            label: "Tower rotation",
            value: t.rotation || 0,
            min: 0,
            max: 360,
            unit: "\xB0",
            onChange: (v) => setTweak("rotation", v)
          }
        ), /* @__PURE__ */ React.createElement(TweakSection, { label: "Theme" }), /* @__PURE__ */ React.createElement(
          TweakColor,
          {
            label: "Primary accent",
            value: t.primaryAccent,
            options: ["#a855f7", "#22d3ee", "#ec4899", "#f59e0b", "#10b981"],
            onChange: (v) => setTweak("primaryAccent", v)
          }
        )), !focusMode && !paletteOpen && /* @__PURE__ */ React.createElement("div", { style: {
          position: "fixed",
          bottom: 8,
          right: 14,
          zIndex: 50,
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--text-mute)",
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          gap: 6
        } }, /* @__PURE__ */ React.createElement("span", { style: { padding: "2px 6px", border: "1px solid var(--line)", borderRadius: 0, color: "var(--text-3)" } }, "\u2318K"), /* @__PURE__ */ React.createElement("span", null, "palette"), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 10, padding: "2px 6px", border: "1px solid var(--line)", borderRadius: 0, color: "var(--text-3)" } }, "F"), /* @__PURE__ */ React.createElement("span", null, "focus")));
      }
      function App() {
        return /* @__PURE__ */ React.createElement(DataProvider, null, /* @__PURE__ */ React.createElement(AppInner, null));
      }
      ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
    }
  });
  require_app();
})();
