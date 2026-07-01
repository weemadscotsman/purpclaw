"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var require_extras = __commonJS({
    "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/app/public/ui/extras.jsx"() {
      const { useState: useS_e, useEffect: useE_e, useMemo: useM_e, useRef: useR_e } = React;
      function NotificationToaster() {
        const { stream, gatekeeper } = useData();
        const [toasts, setToasts] = useS_e([]);
        const seenRef = useR_e(/* @__PURE__ */ new Set());
        const dismissedRef = useR_e(/* @__PURE__ */ new Set());
        useE_e(() => {
          if (!stream.events.length) return;
          for (const ev of stream.events.slice(0, 12)) {
            const id = ev._id;
            if (!id || seenRef.current.has(id) || dismissedRef.current.has(id)) continue;
            const tone = eventTone(ev);
            if (tone !== "err" && tone !== "warn") continue;
            seenRef.current.add(id);
            setToasts((t) => [{
              id,
              tone,
              title: (ev.type || ev.topic || "event").slice(0, 28),
              body: eventLabel(ev),
              source: ev._source,
              born: Date.now()
            }, ...t].slice(0, 4));
          }
        }, [stream.events.length]);
        useE_e(() => {
          var _a, _b, _c;
          if (!gatekeeper.connected) return;
          const pending = ((_a = gatekeeper.data) == null ? void 0 : _a.pendingAmendments) || ((_b = gatekeeper.data) == null ? void 0 : _b.amendments) || ((_c = gatekeeper.data) == null ? void 0 : _c.queue) || [];
          if (pending.length > 0) {
            const id = `gk-${pending.length}`;
            if (seenRef.current.has(id) || dismissedRef.current.has(id)) return;
            seenRef.current.add(id);
            setToasts((t) => {
              if (t.find((x) => x.id === id)) return t;
              return [{
                id,
                tone: "warn",
                title: "gatekeeper",
                body: `${pending.length} approval${pending.length === 1 ? "" : "s"} awaiting review`,
                source: "gatekeeper",
                born: Date.now()
              }, ...t].slice(0, 4);
            });
          }
        }, [gatekeeper.data]);
        useE_e(() => {
          const t = setInterval(() => {
            const now = Date.now();
            setToasts((prev) => prev.filter((x) => now - x.born < 7e3));
          }, 500);
          return () => clearInterval(t);
        }, []);
        const dismiss = (id) => {
          dismissedRef.current.add(id);
          setToasts((t) => t.filter((x) => x.id !== id));
        };
        if (toasts.length === 0) return null;
        return /* @__PURE__ */ React.createElement("div", { className: "toaster" }, toasts.map((t) => /* @__PURE__ */ React.createElement("div", { key: t.id, className: `toast toast-${t.tone}` }, /* @__PURE__ */ React.createElement("div", { className: "toast-head" }, /* @__PURE__ */ React.createElement("span", { className: "toast-icon" }, t.tone === "err" ? "\u25C6" : "\u26A0"), /* @__PURE__ */ React.createElement("span", { className: "toast-title" }, t.title), /* @__PURE__ */ React.createElement("span", { className: "toast-source" }, t.source), /* @__PURE__ */ React.createElement("button", { onClick: () => dismiss(t.id), className: "toast-close", title: "dismiss" }, "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "toast-body" }, t.body), /* @__PURE__ */ React.createElement("div", { className: "toast-progress" }))));
      }
      const __SVC_HIST = /* @__PURE__ */ new Map();
      function ServiceLatencyChart({ serviceKey, height = 16, width = 70, color = "#22d3ee" }) {
        const { services } = useData();
        const [, force] = useS_e(0);
        useE_e(() => {
          const svc = services.find((s) => s.key === serviceKey);
          if (!svc) return;
          const hist = __SVC_HIST.get(serviceKey) || [];
          if (svc.latency != null) hist.push(svc.latency);
          else if (svc.status === "offline") hist.push(null);
          __SVC_HIST.set(serviceKey, hist.slice(-30));
          force((x) => (x + 1) % 1e3);
        }, [services]);
        const series = __SVC_HIST.get(serviceKey) || [];
        if (series.length < 2) return null;
        const validVals = series.filter((v) => v != null);
        const max = Math.max(...validVals, 50);
        const step = width / Math.max(1, series.length - 1);
        let path = "";
        series.forEach((v, i) => {
          if (v == null) return;
          const x = i * step;
          const y = height - v / max * height;
          path += (path ? " L" : "M") + ` ${x} ${y}`;
        });
        return /* @__PURE__ */ React.createElement("svg", { width, height, style: { display: "block" } }, /* @__PURE__ */ React.createElement(
          "path",
          {
            d: path,
            fill: "none",
            stroke: color,
            strokeWidth: 1.1,
            strokeLinejoin: "round",
            style: { filter: `drop-shadow(0 0 2px ${color})` }
          }
        ));
      }
      function IdentityChip() {
        const [user, setUser] = useS_e(null);
        useE_e(() => {
          let cancelled = false;
          async function tick() {
            const a = await tryFetchJson("/api/whoami", 2e3);
            if (cancelled) return;
            if (a && a.name) setUser(a);
            else setUser({ name: "operator", role: "admin" });
          }
          tick();
        }, []);
        if (!user) return null;
        return /* @__PURE__ */ React.createElement("div", { className: "id-chip", title: `${user.name} \xB7 ${user.role}` }, /* @__PURE__ */ React.createElement("span", { className: "id-chip-avatar" }, (user.name || "?").charAt(0).toUpperCase()), /* @__PURE__ */ React.createElement("div", { className: "id-chip-meta" }, /* @__PURE__ */ React.createElement("div", { className: "id-chip-name" }, user.name), /* @__PURE__ */ React.createElement("div", { className: "id-chip-role" }, user.role || "\u2014")));
      }
      function StaleIndicator() {
        const { mission } = useData();
        const [stale, setStale] = useS_e(false);
        useE_e(() => {
          const t = setInterval(() => {
            if (!mission.lastTick) return;
            const age = Date.now() - mission.lastTick;
            setStale(age > 1e4);
          }, 1e3);
          return () => clearInterval(t);
        }, [mission.lastTick]);
        if (!stale) return null;
        return /* @__PURE__ */ React.createElement("div", { className: "stale-tag", title: "mission data hasn't refreshed in >10s \u2014 backend may be slow" }, /* @__PURE__ */ React.createElement("span", { style: { width: 5, height: 5, borderRadius: 0, background: "var(--amber)", boxShadow: "0 0 6px var(--amber)" } }), "STALE");
      }
      function AuditExport({ compact = false }) {
        const { stream, eventTimeline, agents, services, pipeline, gatekeeper, mochi } = useData();
        const doExport = () => {
          const snapshot = {
            generated_at: (/* @__PURE__ */ new Date()).toISOString(),
            origin: "purpclaw-mission-control",
            data: {
              agents,
              services,
              pipeline,
              gatekeeper: gatekeeper.data,
              mochi: mochi.data,
              stream_events: stream.events,
              bus_events: eventTimeline.events
            }
          };
          const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `purpclaw-audit-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        };
        if (compact) {
          return /* @__PURE__ */ React.createElement("button", { onClick: doExport, className: "audit-btn compact", title: "download audit snapshot" }, /* @__PURE__ */ React.createElement("span", null, "\u2193"), " JSON");
        }
        return /* @__PURE__ */ React.createElement("button", { onClick: doExport, className: "audit-btn", title: "download full audit snapshot as JSON" }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13 } }, "\u2193"), /* @__PURE__ */ React.createElement("span", null, "AUDIT"));
      }
      function ExportPanel({ compact = false }) {
        const doPrint = () => {
          document.body.classList.add("printing");
          setTimeout(() => {
            window.print();
            setTimeout(() => document.body.classList.remove("printing"), 500);
          }, 50);
        };
        return /* @__PURE__ */ React.createElement("button", { onClick: doPrint, className: `audit-btn ${compact ? "compact" : ""}`, title: "print/save current view as PDF" }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13 } }, "\u2399"), !compact && /* @__PURE__ */ React.createElement("span", null, "PDF"));
      }
      function WebhookConfig() {
        const [url, setUrl] = useS_e(() => {
          try {
            return localStorage.getItem("purpclaw_webhook") || "";
          } catch (e) {
            return "";
          }
        });
        const [verified, setVerified] = useS_e(false);
        const save = () => {
          try {
            localStorage.setItem("purpclaw_webhook", url);
            setVerified(true);
            setTimeout(() => setVerified(false), 1800);
          } catch (e) {
          }
        };
        return /* @__PURE__ */ React.createElement("div", { className: "webhook-config" }, /* @__PURE__ */ React.createElement("div", { className: "webhook-h" }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-3)" } }, "outbound webhook"), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--font-mono)", fontSize: 9, color: verified ? "var(--emerald)" : "var(--text-mute)" } }, verified ? "saved \u2713" : "slack / discord / generic")), /* @__PURE__ */ React.createElement("div", { className: "webhook-row" }, /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "text",
            value: url,
            onChange: (e) => setUrl(e.target.value),
            placeholder: "https://hooks.slack.com/services/\u2026",
            className: "webhook-input"
          }
        ), /* @__PURE__ */ React.createElement("button", { onClick: save, className: "audit-btn compact" }, "save")), /* @__PURE__ */ React.createElement("div", { className: "webhook-hint" }, "critical events POSTed to this URL when the backend's notification hook is wired. one-way, no creds stored on backend."));
      }
      function ServiceMeshEnhanced() {
        const { services } = useData();
        const online = services.filter((s) => s.status === "online").length;
        return /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h" }, /* @__PURE__ */ React.createElement("div", { className: "panel-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "panel-tag" }, "infrastructure \xB7 failover"), /* @__PURE__ */ React.createElement("span", { className: "panel-title" }, "Service Mesh")), /* @__PURE__ */ React.createElement("span", { className: "mono tiny", style: { color: "var(--emerald)" } }, online, "/", services.length, " online")), /* @__PURE__ */ React.createElement("div", { className: "panel-body", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 } }, services.map((svc) => {
          const tone = svc.status === "online" ? "var(--emerald)" : svc.status === "degraded" ? "var(--amber)" : "var(--red)";
          return /* @__PURE__ */ React.createElement("div", { key: svc.key, style: {
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 8,
            padding: "8px 10px",
            background: "var(--panel-2)",
            border: "1px solid var(--line-soft)",
            borderRadius: 0,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            opacity: svc.status === "offline" ? 0.6 : 1,
            borderLeft: `2px solid ${tone}`
          } }, /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "row", style: { marginBottom: 3 } }, /* @__PURE__ */ React.createElement("span", { style: { width: 5, height: 5, borderRadius: 0, background: tone, boxShadow: `0 0 6px ${tone}` } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-2)" } }, svc.name), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-mute)", fontSize: 9 } }, ":", svc.port)), /* @__PURE__ */ React.createElement("div", { className: "row", style: { gap: 10, fontSize: 9, color: "var(--text-3)" } }, /* @__PURE__ */ React.createElement("span", null, svc.status), /* @__PURE__ */ React.createElement("span", { style: { color: tone } }, svc.latency != null ? `${svc.latency}ms` : "down"), svc.optional && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-mute)" } }, "\xB7 opt"))), /* @__PURE__ */ React.createElement(ServiceLatencyChart, { serviceKey: svc.key, color: tone }));
        })));
      }
      Object.assign(window, {
        NotificationToaster,
        ServiceLatencyChart,
        IdentityChip,
        StaleIndicator,
        AuditExport,
        ExportPanel,
        WebhookConfig,
        ServiceMeshEnhanced
      });
    }
  });
  require_extras();
})();
