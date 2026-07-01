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
  var require_cinematic = __commonJS({
    "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/app/public/ui/cinematic.jsx"() {
      const { useState: useS_c, useEffect: useE_c, useMemo: useM_c, useRef: useR_c } = React;
      function WorkflowRibbon({ onSelectWorkflow, onJumpToDelegation, visible = true }) {
        const { pipeline, anyConnected } = useData();
        if (!visible) return null;
        const active = (pipeline == null ? void 0 : pipeline.active) || [];
        const completed = ((pipeline == null ? void 0 : pipeline.completed) || []).slice(0, 6);
        const now = Date.now();
        const SPAN = 5 * 60 * 1e3;
        const start = now - SPAN;
        const lanes = [...active.map((w) => __spreadProps(__spreadValues({}, w), { _alive: true })), ...completed.map((w) => __spreadProps(__spreadValues({}, w), { _alive: false }))];
        return /* @__PURE__ */ React.createElement("div", { className: "ribbon" }, /* @__PURE__ */ React.createElement("div", { className: "ribbon-h" }, /* @__PURE__ */ React.createElement("div", { className: "ribbon-h-l" }, /* @__PURE__ */ React.createElement("span", { className: "ribbon-tag" }, "workflow timeline"), /* @__PURE__ */ React.createElement("span", { className: "ribbon-sub" }, "last 5 min \xB7 ", active.length, " active \xB7 ", completed.length, " archived")), /* @__PURE__ */ React.createElement("div", { className: "ribbon-h-r" }, /* @__PURE__ */ React.createElement("span", { className: "ribbon-now" }, /* @__PURE__ */ React.createElement("span", { className: "ribbon-now-dot" }), "now"))), /* @__PURE__ */ React.createElement("div", { className: "ribbon-body" }, !anyConnected ? /* @__PURE__ */ React.createElement("div", { className: "ribbon-empty" }, "backend offline \u2014 no workflow data") : lanes.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "ribbon-empty" }, "no workflows in flight or recently archived") : /* @__PURE__ */ React.createElement("div", { className: "ribbon-lanes" }, /* @__PURE__ */ React.createElement("div", { className: "ribbon-scale" }, [5, 4, 3, 2, 1, 0].map((m) => /* @__PURE__ */ React.createElement("div", { key: m, className: "ribbon-tick", style: { left: `${(SPAN - m * 6e4) / SPAN * 100}%` } }, /* @__PURE__ */ React.createElement("span", { className: "ribbon-tick-l" }, m === 0 ? "now" : `\u2212${m}m`)))), lanes.map((wf) => {
          var _a;
          const startMs = wf.startTime ? new Date(wf.startTime).getTime() : now - 3e4;
          const endMs = wf.endTime ? new Date(wf.endTime).getTime() : now;
          const leftPct = Math.max(0, (startMs - start) / SPAN * 100);
          const widthPct = Math.max(2, (Math.min(endMs, now) - Math.max(startMs, start)) / SPAN * 100);
          const status = String(wf.status || "").toLowerCase();
          const tone = status === "running" ? "var(--cyan)" : status === "completed" ? "var(--emerald)" : status === "failed" ? "var(--red)" : "var(--text-3)";
          return /* @__PURE__ */ React.createElement(
            "button",
            {
              key: wf.id,
              className: "ribbon-bar",
              style: {
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                borderColor: tone,
                background: `linear-gradient(90deg, ${tone}28, ${tone}10)`,
                boxShadow: wf._alive ? `0 0 12px ${tone}55, inset 0 0 8px ${tone}22` : "none"
              },
              onClick: () => {
                onSelectWorkflow == null ? void 0 : onSelectWorkflow(wf.id);
                onJumpToDelegation == null ? void 0 : onJumpToDelegation();
              },
              title: `${wf.id} \xB7 ${wf.intent || wf.target}`
            },
            /* @__PURE__ */ React.createElement("span", { className: "ribbon-bar-id", style: { color: tone } }, (_a = wf.id) == null ? void 0 : _a.slice(-6)),
            /* @__PURE__ */ React.createElement("span", { className: "ribbon-bar-label" }, wf.intent || wf.target || ""),
            wf._alive && wf.steps && /* @__PURE__ */ React.createElement("span", { className: "ribbon-bar-prog", style: {
              width: `${wf.steps.completed / Math.max(wf.steps.total, 1) * 100}%`,
              background: tone
            } })
          );
        }))));
      }
      function HeaderSparkline({ width = 110, height = 24, color = "#22d3ee" }) {
        const { stream } = useData();
        const [series, setSeries] = useS_c([]);
        useE_c(() => {
          const t = setInterval(() => {
            var _a, _b;
            const now = Date.now();
            const WINDOW = 3e4;
            const BINS = 20;
            const bin = WINDOW / BINS;
            const counts = Array(BINS).fill(0);
            for (const ev of stream.events) {
              const time = ((_b = (_a = ev._time) == null ? void 0 : _a.getTime) == null ? void 0 : _b.call(_a)) || (ev._time ? new Date(ev._time).getTime() : 0);
              if (!time) continue;
              const age = now - time;
              if (age < 0 || age > WINDOW) continue;
              const idx = Math.min(BINS - 1, Math.floor((WINDOW - age) / bin));
              counts[idx]++;
            }
            setSeries(counts);
          }, 800);
          return () => clearInterval(t);
        }, [stream.events]);
        const max = Math.max(1, ...series);
        const step = width / Math.max(1, series.length - 1);
        const points = series.map((v, i) => `${i * step},${height - v / max * height}`).join(" ");
        return /* @__PURE__ */ React.createElement("svg", { width, height, style: { overflow: "visible" } }, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "sparkFill", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: color, stopOpacity: "0.5" }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: color, stopOpacity: "0" }))), series.length > 1 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
          "polygon",
          {
            points: `0,${height} ${points} ${width},${height}`,
            fill: "url(#sparkFill)"
          }
        ), /* @__PURE__ */ React.createElement(
          "polyline",
          {
            points,
            fill: "none",
            stroke: color,
            strokeWidth: 1.3,
            strokeLinejoin: "round",
            style: { filter: `drop-shadow(0 0 4px ${color})` }
          }
        ), /* @__PURE__ */ React.createElement(
          "circle",
          {
            cx: width,
            cy: height - series[series.length - 1] / max * height,
            r: 2.5,
            fill: color,
            style: { filter: `drop-shadow(0 0 4px ${color})` }
          }
        )));
      }
      function useFloorActivity() {
        const { stream, agents, floors } = useData();
        const [pulses, setPulses] = useS_c({});
        useE_c(() => {
          var _a, _b;
          if (stream.events.length === 0) return;
          const newest = stream.events[0];
          const t = ((_b = (_a = newest._time) == null ? void 0 : _a.getTime) == null ? void 0 : _b.call(_a)) || Date.now();
          const agentName = newest.agentName || newest.name || newest.from;
          if (!agentName) return;
          const agent = agents.find((a) => a.name === agentName);
          if (!agent) return;
          setPulses((prev) => __spreadProps(__spreadValues({}, prev), {
            [agent.floor]: { intensity: 1, lastEventAt: t }
          }));
        }, [stream.events.length, agents]);
        useE_c(() => {
          const t = setInterval(() => {
            setPulses((prev) => {
              const next = {};
              const now = Date.now();
              for (const [floorId, info] of Object.entries(prev)) {
                const age = now - info.lastEventAt;
                if (age > 4e3) continue;
                next[floorId] = __spreadProps(__spreadValues({}, info), { intensity: Math.max(0, 1 - age / 4e3) });
              }
              return next;
            });
          }, 250);
          return () => clearInterval(t);
        }, []);
        return pulses;
      }
      Object.assign(window, { WorkflowRibbon, HeaderSparkline, useFloorActivity });
    }
  });
  require_cinematic();
})();
