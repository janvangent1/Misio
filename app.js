"use strict";

const GRID = 20;
const MIN_SIZE = 40;
const STUB = 28;
const SVGNS = "http://www.w3.org/2000/svg";
const PORTS = ["top", "right", "bottom", "left"];
const PORT_VECTOR = {
  top: [0, -1],
  right: [1, 0],
  bottom: [0, 1],
  left: [-1, 0],
};
const FLOW_MASTERS = [
  { type: "terminator", name: "Start / end", w: 160, h: 64, text: "Start", category: "standard" },
  { type: "process", name: "Process", w: 160, h: 80, text: "Process" },
  { type: "decision", name: "Decision", w: 150, h: 110, text: "Decision" },
  { type: "subprocess", name: "Subprocess", w: 170, h: 80, text: "Subprocess" },
  { type: "document", name: "Document", w: 150, h: 96, text: "Document" },
  { type: "data", name: "Data", w: 160, h: 72, text: "Data" },
  { type: "database", name: "Database", w: 120, h: 100, text: "Database" },
  { type: "preparation", name: "Preparation", w: 160, h: 72, text: "Prepare" },
  { type: "manual", name: "Manual input", w: 160, h: 76, text: "Manual" },
  { type: "delay", name: "Delay", w: 140, h: 64, text: "Wait" },
  { type: "offpage", name: "Off-page", w: 140, h: 64, text: "Page" },
  { type: "onpage", name: "On-page", w: 72, h: 72, text: "1" },
  { type: "text", name: "Text", w: 140, h: 48, text: "Text", category: "standard" },
];
const MASTERS = FLOW_MASTERS.concat(window.MisioArei.masters, window.MisioNetwork.masters);
const TYPES = new Set(MASTERS.map((master) => master.type));
TYPES.add("legend");
const LEGEND_PAD = 14;
const LEGEND_ICON = 28;
const LEGEND_ROW = 36;
const LEGEND_TITLE = 22;
const LEGEND_GAP = 10;

const svg = document.getElementById("canvas");
const wrap = document.getElementById("canvas-wrap");
const mastersEl = document.getElementById("masters");
const textarea = document.getElementById("text-editor");
const statusEl = document.getElementById("status");
const confirmBar = document.getElementById("confirm");
const fileInput = document.getElementById("file-input");
const zoomLabel = document.getElementById("zoom-label");
const undoButton = document.getElementById("undo");
const redoButton = document.getElementById("redo");
const saveButton = document.getElementById("save-doc");
const selectButton = document.getElementById("tool-select");
const connectButton = document.getElementById("tool-connect");

const measureCtx = document.createElement("canvas").getContext("2d");

const state = {
  doc: { shapes: [], connectors: [] },
  nextId: 1,
  selection: null,
  tool: "select",
  view: { x: 48, y: 48, scale: 1 },
  past: [],
  future: [],
  savedSnapshot: "",
  hover: null,
  gesture: null,
  editor: null,
  spaceDown: false,
  lang: storedLanguage(),
};

let statusTimer = 0;
let lastDownload = null;

function el(name, attrs, parent) {
  const node = document.createElementNS(SVGNS, name);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value != null) node.setAttribute(key, String(value));
  }
  if (parent) parent.appendChild(node);
  return node;
}

function storedLanguage() {
  try {
    const saved = localStorage.getItem("misio-lang");
    if (saved === "nl" || saved === "fr" || saved === "en") return saved;
  } catch (error) {
    return "en";
  }
  return "en";
}

function labelFor(key) {
  const table = (window.MisioLang && window.MisioLang[state.lang]) || {};
  if (table[key]) return table[key];
  if (String(key).startsWith("group:")) {
    const id = key.slice(6);
    if (id === "arei") return "AREI";
    const categories = window.MisioArei.categories.concat(window.MisioNetwork.categories);
    const category = categories.find((item) => item.id === id);
    return category ? category.name : id;
  }
  const master = MASTERS.find((item) => item.type === key);
  if (master) return master.name;
  return key;
}

function snap(value) {
  return Math.round(value / GRID) * GRID;
}

function cloneDoc(doc) {
  return {
    shapes: doc.shapes.map(shapeRecord),
    connectors: doc.connectors.map(connectorRecord),
  };
}

function shapeRecord(shape) {
  return {
    id: String(shape.id),
    type: shape.type,
    x: shape.x,
    y: shape.y,
    w: shape.w,
    h: shape.h,
    text: String(shape.text ?? ""),
  };
}

function connectorRecord(connector) {
  return {
    id: String(connector.id),
    fromId: String(connector.fromId),
    fromPort: connector.fromPort,
    toId: String(connector.toId),
    toPort: connector.toPort,
    text: String(connector.text ?? ""),
  };
}

function serialize(doc = state.doc) {
  return JSON.stringify({
    app: "Misio",
    title: "Misio",
    version: 1,
    shapes: doc.shapes.map(shapeRecord),
    connectors: doc.connectors.map(connectorRecord),
  }, null, 2);
}

function getShape(id) {
  return state.doc.shapes.find((shape) => shape.id === id) || null;
}

function getConnector(id) {
  return state.doc.connectors.find((connector) => connector.id === id) || null;
}

function bumpId(id) {
  const number = Number(String(id).replace(/\D/g, ""));
  if (Number.isFinite(number)) state.nextId = Math.max(state.nextId, number + 1);
}

function uid() {
  return String(state.nextId++);
}

function setStatus(message) {
  statusEl.textContent = message;
  window.clearTimeout(statusTimer);
  if (message) statusTimer = window.setTimeout(() => { statusEl.textContent = ""; }, 4000);
}

function commitChange(before) {
  const now = serialize();
  if (now === before) return false;
  state.past.push(before);
  if (state.past.length > 100) state.past.shift();
  state.future = [];
  return true;
}

function applySnapshot(snapshot) {
  const data = JSON.parse(snapshot);
  state.doc = { shapes: data.shapes.map(shapeRecord), connectors: data.connectors.map(connectorRecord) };
  if (state.selection) {
    const alive = state.selection.kind === "shape"
      ? getShape(state.selection.id)
      : getConnector(state.selection.id);
    if (!alive) state.selection = null;
  }
}

function undo() {
  if (!state.past.length) return;
  closeEditor(false);
  state.future.push(serialize());
  applySnapshot(state.past.pop());
  render();
}

function redo() {
  if (!state.future.length) return;
  closeEditor(false);
  state.past.push(serialize());
  applySnapshot(state.future.pop());
  render();
}

function portPoint(shape, port) {
  switch (port) {
    case "top": return { x: shape.x + shape.w / 2, y: shape.y };
    case "right": return { x: shape.x + shape.w, y: shape.y + shape.h / 2 };
    case "bottom": return { x: shape.x + shape.w / 2, y: shape.y + shape.h };
    default: return { x: shape.x, y: shape.y + shape.h / 2 };
  }
}

function dedupe(points) {
  const result = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 0.5) result.push(point);
  }
  return result;
}

function routePoints(start, startPort, end, endPort) {
  const [sdx, sdy] = PORT_VECTOR[startPort];
  const [edx, edy] = PORT_VECTOR[endPort];
  const p1 = { x: start.x + sdx * STUB, y: start.y + sdy * STUB };
  const p2 = { x: end.x + edx * STUB, y: end.y + edy * STUB };
  const points = [start, p1];
  if (Math.abs(p1.x - p2.x) < 0.5 || Math.abs(p1.y - p2.y) < 0.5) {
    points.push(p2);
  } else if (sdx !== 0 && edx !== 0) {
    const midX = (p1.x + p2.x) / 2;
    points.push({ x: midX, y: p1.y }, { x: midX, y: p2.y }, p2);
  } else if (sdy !== 0 && edy !== 0) {
    const midY = (p1.y + p2.y) / 2;
    points.push({ x: p1.x, y: midY }, { x: p2.x, y: midY }, p2);
  } else if (sdx !== 0) {
    points.push({ x: p2.x, y: p1.y }, p2);
  } else {
    points.push({ x: p1.x, y: p2.y }, p2);
  }
  points.push(end);
  return dedupe(points);
}

function connectorPoints(connector) {
  const from = getShape(connector.fromId);
  const to = getShape(connector.toId);
  if (!from || !to) return null;
  return routePoints(portPoint(from, connector.fromPort), connector.fromPort, portPoint(to, connector.toPort), connector.toPort);
}

function previewPoints(shape, port, cursor) {
  const start = portPoint(shape, port);
  const [dx, dy] = PORT_VECTOR[port];
  const p1 = { x: start.x + dx * STUB, y: start.y + dy * STUB };
  const points = [start, p1];
  if (dx !== 0) points.push({ x: cursor.x, y: p1.y }, cursor);
  else points.push({ x: p1.x, y: cursor.y }, cursor);
  return dedupe(points);
}

function toPath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function midpoint(points) {
  let total = 0;
  const lengths = [];
  for (let index = 1; index < points.length; index += 1) {
    const length = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    lengths.push(length);
    total += length;
  }
  let remain = total / 2;
  for (let index = 1; index < points.length; index += 1) {
    if (lengths[index - 1] >= remain) {
      const t = lengths[index - 1] === 0 ? 0 : remain / lengths[index - 1];
      return {
        x: points[index - 1].x + (points[index].x - points[index - 1].x) * t,
        y: points[index - 1].y + (points[index].y - points[index - 1].y) * t,
      };
    }
    remain -= lengths[index - 1];
  }
  return points[0];
}

function textWidth(text, size) {
  measureCtx.font = `${size}px Segoe UI, Helvetica Neue, sans-serif`;
  return measureCtx.measureText(text).width;
}

function wrapLines(text, maxWidth, fontSize) {
  const lines = [];
  for (const paragraph of String(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      const trial = line ? `${line} ${word}` : word;
      if (textWidth(trial, fontSize) <= maxWidth) {
        line = trial;
        continue;
      }
      if (line) lines.push(line);
      if (textWidth(word, fontSize) <= maxWidth) {
        line = word;
        continue;
      }
      let chunk = "";
      for (const character of word) {
        if (textWidth(chunk + character, fontSize) <= maxWidth) chunk += character;
        else {
          if (chunk) lines.push(chunk);
          chunk = character;
        }
      }
      line = chunk;
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [""];
}

function labelMaxWidth(shape) {
  if (shape.type === "decision") return shape.w * 0.42;
  if (shape.type === "preparation" || shape.type === "data" || shape.type === "delay") return shape.w * 0.58;
  if (shape.type === "terminator" || shape.type === "offpage" || shape.type === "onpage") return shape.w * 0.62;
  if (shape.type === "text") return Math.max(24, shape.w - 12);
  return Math.max(24, shape.w - 20);
}

function labelLayout(shape) {
  const maxWidth = labelMaxWidth(shape);
  let size = 15;
  let lines = wrapLines(shape.text, maxWidth, size);
  while (size > 11 && lines.length * size * 1.25 > shape.h - 12) {
    size -= 1;
    lines = wrapLines(shape.text, maxWidth, size);
  }
  return { lines, size, maxWidth };
}

function symbolPack(type) {
  if (String(type).startsWith("arei-")) return window.MisioArei;
  if (String(type).startsWith("net-")) return window.MisioNetwork;
  return null;
}

function drawAreiLabel(parent, shape) {
  const text = String(shape.text || "").trim();
  if (!text) return;
  const icon = symbolPack(shape.type).iconBox(shape);
  const maxWidth = Math.max(24, shape.w - 8);
  const size = 12;
  const lines = wrapLines(text, maxWidth, size).slice(0, 3);
  const lineHeight = size * 1.25;
  const cx = shape.x + shape.w / 2;
  const node = el("text", {
    x: cx,
    y: icon.y + icon.h + size + 2,
    "text-anchor": "middle",
    "font-family": "Segoe UI, Helvetica Neue, sans-serif",
    "font-size": size,
    fill: "#1c1915",
  }, parent);
  lines.forEach((line, index) => {
    const tspan = el("tspan", { x: cx, dy: index === 0 ? 0 : lineHeight }, node);
    tspan.textContent = line;
  });
}

function drawLabel(parent, shape) {
  if (shape.type === "legend") return;
  if (symbolPack(shape.type)) {
    drawAreiLabel(parent, shape);
    return;
  }
  if (!String(shape.text).trim()) return;
  const { lines, size } = labelLayout(shape);
  const lineHeight = size * 1.25;
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  const text = el("text", {
    x: cx,
    y: cy - ((lines.length - 1) * lineHeight) / 2,
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    "font-family": "Segoe UI, Helvetica Neue, sans-serif",
    "font-size": size,
    fill: "#1c1915",
  }, parent);
  lines.forEach((line, index) => {
    const tspan = el("tspan", { x: cx, dy: index === 0 ? 0 : lineHeight }, text);
    tspan.textContent = line;
  });
}

let plainDraw = false;

function shapePaint(shape) {
  const selected = !plainDraw && state.selection && state.selection.kind === "shape" && state.selection.id === shape.id;
  return {
    fill: "#fffcf7",
    stroke: selected ? "#184e86" : "#1c1915",
    sw: selected ? 2.25 : 1.5,
    selected,
  };
}

function usedLegendMasters(shapes) {
  const used = new Set(shapes.filter((shape) => shape.type !== "legend").map((shape) => shape.type));
  return MASTERS.filter((master) => used.has(master.type));
}

function legendLayout(masters) {
  const columns = masters.length > 12 ? 2 : 1;
  let nameWidth = textWidth(labelFor("legend"), 13);
  for (const master of masters) nameWidth = Math.max(nameWidth, textWidth(labelFor(master.type), 13));
  const columnWidth = LEGEND_ICON + LEGEND_GAP + nameWidth;
  const width = Math.ceil(LEGEND_PAD * 2 + columns * columnWidth + (columns - 1) * 18);
  const rows = Math.ceil(masters.length / columns) || 1;
  const height = Math.ceil(LEGEND_PAD + LEGEND_TITLE + rows * LEGEND_ROW + 6);
  return {
    w: Math.max(MIN_SIZE, width),
    h: Math.max(MIN_SIZE, height),
    columns,
    columnWidth,
    rows,
  };
}

function legendMasters(shape) {
  const wanted = new Set(String(shape.text || "").split("\n").map((type) => type.trim()).filter(Boolean));
  return MASTERS.filter((master) => wanted.has(master.type));
}

function drawLegend(parent, shape, paint) {
  const { x, y, w, h } = shape;
  el("rect", {
    x, y, width: w, height: h, rx: 8,
    fill: "#fffcf7",
    stroke: paint.stroke,
    "stroke-width": paint.sw,
  }, parent);
  const title = el("text", {
    x: x + LEGEND_PAD,
    y: y + LEGEND_PAD + 13,
    fill: "#1c1915",
    "font-family": "Segoe UI, Helvetica Neue, sans-serif",
    "font-size": 13,
    "font-weight": 600,
  }, parent);
  title.textContent = labelFor("legend");
  el("line", {
    x1: x + LEGEND_PAD,
    y1: y + LEGEND_PAD + LEGEND_TITLE - 4,
    x2: x + w - LEGEND_PAD,
    y2: y + LEGEND_PAD + LEGEND_TITLE - 4,
    stroke: "#e2dcd2",
    "stroke-width": 1,
  }, parent);
  const masters = legendMasters(shape);
  const layout = legendLayout(masters);
  const iconPaint = { fill: "#fffcf7", stroke: "#1c1915", sw: 1.25, selected: false };
  masters.forEach((master, index) => {
    const column = Math.floor(index / layout.rows);
    const row = index % layout.rows;
    const ix = x + LEGEND_PAD + column * (layout.columnWidth + 18);
    const iy = y + LEGEND_PAD + LEGEND_TITLE + row * LEGEND_ROW + (LEGEND_ROW - LEGEND_ICON) / 2;
    drawOutline(parent, { type: master.type, x: ix, y: iy, w: LEGEND_ICON, h: LEGEND_ICON, text: "" }, iconPaint);
    const name = el("text", {
      x: ix + LEGEND_ICON + LEGEND_GAP,
      y: iy + LEGEND_ICON / 2,
      fill: "#1c1915",
      "font-family": "Segoe UI, Helvetica Neue, sans-serif",
      "font-size": 13,
      "dominant-baseline": "middle",
    }, parent);
    name.textContent = labelFor(master.type);
  });
}

function drawOutline(parent, shape, paint) {
  const { x, y, w, h } = shape;
  const right = x + w;
  const bottom = y + h;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const common = {
    fill: paint.fill,
    stroke: paint.stroke,
    "stroke-width": paint.sw,
    "stroke-linejoin": "round",
  };
  if (shape.type === "legend") {
    drawLegend(parent, shape, paint);
    return;
  }
  const pack = symbolPack(shape.type);
  if (pack) {
    pack.draw(parent, shape, paint);
    return;
  }
  if (shape.type === "decision") {
    el("polygon", { points: `${cx},${y} ${right},${cy} ${cx},${bottom} ${x},${cy}`, ...common }, parent);
    return;
  }
  if (shape.type === "terminator" || shape.type === "onpage") {
    el("ellipse", { cx, cy, rx: w / 2, ry: h / 2, ...common }, parent);
    return;
  }
  if (shape.type === "subprocess") {
    el("rect", { x, y, width: w, height: h, rx: 4, ...common }, parent);
    const inset = Math.min(16, w * 0.12);
    el("line", { x1: x + inset, y1: y, x2: x + inset, y2: bottom, stroke: paint.stroke, "stroke-width": paint.sw }, parent);
    el("line", { x1: right - inset, y1: y, x2: right - inset, y2: bottom, stroke: paint.stroke, "stroke-width": paint.sw }, parent);
    return;
  }
  if (shape.type === "document") {
    const wave = Math.min(16, h * 0.18);
    const d = [
      `M ${x} ${y}`,
      `L ${right} ${y}`,
      `L ${right} ${bottom - wave}`,
      `Q ${x + w * 0.75} ${bottom - wave * 2.3} ${cx} ${bottom - wave * 0.3}`,
      `Q ${x + w * 0.25} ${bottom + wave * 0.85} ${x} ${bottom - wave}`,
      "Z",
    ].join(" ");
    el("path", { d, ...common }, parent);
    return;
  }
  if (shape.type === "data") {
    const slant = Math.min(28, w * 0.18);
    el("polygon", {
      points: `${x + slant},${y} ${right},${y} ${right - slant},${bottom} ${x},${bottom}`,
      ...common,
    }, parent);
    return;
  }
  if (shape.type === "database") {
    const ry = Math.max(7, Math.min(16, h * 0.16));
    const body = [
      `M ${x} ${y + ry}`,
      `L ${x} ${bottom - ry}`,
      `A ${w / 2} ${ry} 0 0 0 ${right} ${bottom - ry}`,
      `L ${right} ${y + ry}`,
    ].join(" ");
    el("path", { d: body, ...common }, parent);
    el("ellipse", { cx, cy: y + ry, rx: w / 2, ry, ...common }, parent);
    return;
  }
  if (shape.type === "preparation") {
    const inset = Math.min(28, w * 0.2);
    el("polygon", {
      points: `${x + inset},${y} ${right - inset},${y} ${right},${cy} ${right - inset},${bottom} ${x + inset},${bottom} ${x},${cy}`,
      ...common,
    }, parent);
    return;
  }
  if (shape.type === "manual") {
    const slant = Math.min(22, h * 0.28);
    el("polygon", { points: `${x},${y + slant} ${right},${y} ${right},${bottom} ${x},${bottom}`, ...common }, parent);
    return;
  }
  if (shape.type === "delay") {
    const radius = Math.min(h / 2, w * 0.42);
    const d = [
      `M ${x} ${y}`,
      `L ${right - radius} ${y}`,
      `A ${radius} ${h / 2} 0 0 1 ${right - radius} ${bottom}`,
      `L ${x} ${bottom}`,
      "Z",
    ].join(" ");
    el("path", { d, ...common }, parent);
    return;
  }
  if (shape.type === "offpage") {
    const point = Math.min(28, w * 0.24);
    el("polygon", {
      points: `${x},${y} ${right - point},${y} ${right},${cy} ${right - point},${bottom} ${x},${bottom}`,
      ...common,
    }, parent);
    return;
  }
  if (shape.type === "text") {
    el("rect", {
      x, y, width: w, height: h, rx: 2,
      ...common,
      "stroke-dasharray": paint.selected ? "0" : "4 3",
    }, parent);
    return;
  }
  el("rect", { x, y, width: w, height: h, rx: 6, ...common }, parent);
}

function drawDecisionSides(parent, shape) {
  const caption = {
    fill: "#6f675e",
    "font-family": "Segoe UI, Helvetica Neue, sans-serif",
    "font-size": 12,
    "font-weight": 600,
  };
  const yes = el("text", {
    x: shape.x + shape.w / 2 + 8,
    y: shape.y + shape.h + 16,
    "text-anchor": "start",
    ...caption,
  }, parent);
  yes.textContent = "Yes";
  const no = el("text", {
    x: shape.x + shape.w + 8,
    y: shape.y + shape.h / 2 - 8,
    "text-anchor": "start",
    ...caption,
  }, parent);
  no.textContent = "No";
}

function drawShapeBody(parent, shape) {
  const paint = shapePaint(shape);
  drawOutline(parent, shape, paint);
  drawLabel(parent, shape);
  if (shape.type === "decision") drawDecisionSides(parent, shape);
  const label = shape.type === "legend"
    ? "Legend"
    : shape.type === "decision"
      ? `${shape.text || "Decision"}. Yes leaves the bottom, No leaves the right`
      : (shape.text || shape.type);
  el("rect", {
    x: shape.x,
    y: shape.y,
    width: shape.w,
    height: shape.h,
    fill: "transparent",
    stroke: "none",
    role: "button",
    "aria-label": label,
  }, parent);
}

function wirePair(connector) {
  const from = getShape(connector.fromId);
  const to = getShape(connector.toId);
  return Boolean(from && to && symbolPack(from.type) && symbolPack(to.type));
}

function drawConnector(parent, connector, options = {}) {
  const points = connectorPoints(connector);
  if (!points) return;
  const selected = state.selection && state.selection.kind === "connector" && state.selection.id === connector.id;
  const wiring = !options.preview && wirePair(connector);
  const path = el("path", {
    d: toPath(points),
    fill: "none",
    stroke: options.preview ? "#7aa0c4" : wiring ? "#1c1915" : "#184e86",
    "stroke-width": selected ? 2.4 : 1.7,
    "stroke-linejoin": "round",
    "stroke-linecap": "round",
    "stroke-dasharray": options.preview ? "5 4" : "0",
    "marker-end": options.preview || wiring ? null : "url(#arrow)",
    "data-connector-id": connector.id,
  }, parent);
  path.dataset.connectorId = connector.id;
  const label = String(connector.text || "").trim();
  if (!label || options.preview) return;
  const mid = midpoint(points);
  const width = textWidth(label, 12) + 12;
  el("rect", {
    x: mid.x - width / 2,
    y: mid.y - 9,
    width,
    height: 18,
    rx: 4,
    fill: "#fffcf7",
    stroke: "#e2dcd2",
  }, parent);
  const text = el("text", {
    x: mid.x,
    y: mid.y,
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    "font-family": "Segoe UI, Helvetica Neue, sans-serif",
    "font-size": 12,
    fill: "#1c1915",
  }, parent);
  text.textContent = label;
}

function portsVisible(shape) {
  if (shape.type === "legend") return false;
  if (state.tool === "connect") return true;
  if (state.gesture && state.gesture.type === "connect") return true;
  if (state.selection && state.selection.kind === "shape" && state.selection.id === shape.id) return true;
  return state.hover && state.hover.kind === "shape" && state.hover.id === shape.id;
}

function drawChrome(parent) {
  if (state.tool === "select" && state.selection && state.selection.kind === "shape") {
    const shape = getShape(state.selection.id);
    if (shape && shape.type !== "legend") {
      const corners = [
        ["nw", shape.x, shape.y],
        ["ne", shape.x + shape.w, shape.y],
        ["se", shape.x + shape.w, shape.y + shape.h],
        ["sw", shape.x, shape.y + shape.h],
      ];
      const size = 8 / state.view.scale;
      for (const [name, x, y] of corners) {
        el("rect", {
          x: x - size / 2,
          y: y - size / 2,
          width: size,
          height: size,
          fill: "#fffcf7",
          stroke: "#184e86",
          "stroke-width": 1.5 / state.view.scale,
          "data-handle": name,
          role: "button",
          "aria-label": `Resize ${shape.text || shape.type} ${name}`,
        }, parent);
      }
    }
  }
}

function contentBounds() {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const shape of state.doc.shapes) {
    include(shape.x, shape.y);
    include(shape.x + shape.w, shape.y + shape.h);
    if (shape.type === "decision") {
      include(shape.x + shape.w + 40, shape.y + shape.h / 2 - 8);
      include(shape.x + shape.w / 2, shape.y + shape.h + 20);
    }
  }
  for (const connector of state.doc.connectors) {
    const points = connectorPoints(connector);
    if (!points) continue;
    for (const point of points) include(point.x, point.y);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 320, h: 180 };
  const pad = 32;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

function drawDiagram(parent, interactive) {
  for (const connector of state.doc.connectors) drawConnector(parent, connector);
  for (const shape of state.doc.shapes) {
    const group = el("g", { "data-shape-id": shape.id, role: "group", "aria-label": shape.text || shape.type }, parent);
    drawShapeBody(group, shape);
  }
  if (interactive) drawPreview(parent);
  if (interactive) drawChrome(parent);
}

function drawPreview(parent) {
  const gesture = state.gesture;
  if (!gesture || gesture.type !== "connect") return;
  const shape = getShape(gesture.fromId);
  if (!shape) return;
  el("path", {
    d: toPath(previewPoints(shape, gesture.fromPort, gesture.pointer)),
    fill: "none",
    stroke: "#7aa0c4",
    "stroke-width": 1.7,
    "stroke-linejoin": "round",
    "stroke-linecap": "round",
    "stroke-dasharray": "5 4",
  }, parent);
}

function fitLegends() {
  for (const shape of state.doc.shapes) {
    if (shape.type !== "legend") continue;
    const layout = legendLayout(legendMasters(shape));
    shape.w = layout.w;
    shape.h = layout.h;
  }
}

function render() {
  fitLegends();
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const defs = el("defs", {}, svg);
  const pattern = el("pattern", {
    id: "grid",
    width: GRID,
    height: GRID,
    patternUnits: "userSpaceOnUse",
  }, defs);
  el("path", {
    d: `M ${GRID} 0 L 0 0 0 ${GRID}`,
    fill: "none",
    stroke: "#ece7de",
    "stroke-width": 1 / state.view.scale,
  }, pattern);
  const marker = el("marker", {
    id: "arrow",
    viewBox: "0 0 12 10",
    refX: "11",
    refY: "5",
    markerWidth: "12",
    markerHeight: "10",
    orient: "auto",
    markerUnits: "userSpaceOnUse",
  }, defs);
  el("path", { d: "M0 0 L12 5 L0 10 Z", fill: "#184e86" }, marker);

  const viewport = el("g", {
    id: "viewport",
    transform: `translate(${state.view.x} ${state.view.y}) scale(${state.view.scale})`,
  }, svg);
  el("rect", {
    x: -8000,
    y: -8000,
    width: 16000,
    height: 16000,
    fill: "url(#grid)",
  }, viewport);
  drawDiagram(viewport, true);
  updateChrome();
  syncPortButtons();
  if (state.editor) positionEditor();
}

function onPortPointerDown(event) {
  if (event.button !== 0) return;
  event.stopPropagation();
  const fromId = event.currentTarget.dataset.shapeId;
  const fromPort = event.currentTarget.dataset.port;
  state.gesture = {
    type: "connect",
    fromId,
    fromPort,
    pointer: clientToWorld(event.clientX, event.clientY),
    before: serialize(),
  };
  state.selection = { kind: "shape", id: fromId };
}

function onPortDragStart(event) {
  nativePortDrag = true;
  const button = event.currentTarget;
  event.dataTransfer.setData("application/x-misio-port", `${button.dataset.shapeId}:${button.dataset.port}`);
  event.dataTransfer.effectAllowed = "copy";
}

function syncPortButtons() {
  if (nativePortDrag) return;
  const needed = new Map();
  for (const shape of state.doc.shapes) {
    if (!portsVisible(shape)) continue;
    for (const port of PORTS) needed.set(`${shape.id}:${port}`, { shape, port });
  }
  for (const node of [...wrap.querySelectorAll(".port-hit")]) {
    if (!needed.has(node.dataset.key)) node.remove();
  }
  for (const [key, info] of needed) {
    let node = wrap.querySelector(`.port-hit[data-key="${key}"]`);
    if (!node) {
      node = document.createElement("button");
      node.type = "button";
      node.className = "port-hit";
      node.draggable = true;
      node.dataset.key = key;
      node.dataset.shapeId = info.shape.id;
      node.dataset.port = info.port;
      node.addEventListener("pointerdown", onPortPointerDown);
      node.addEventListener("dragstart", onPortDragStart);
      wrap.appendChild(node);
    }
    const label = `${info.shape.text || info.shape.type} ${info.port} port`;
    node.setAttribute("aria-label", label);
    node.title = label;
    const hot = state.hover && state.hover.kind === "port" && state.hover.id === info.shape.id && state.hover.port === info.port;
    node.classList.toggle("is-hot", Boolean(hot));
    const point = worldToWrap(portPoint(info.shape, info.port));
    node.style.left = `${point.x}px`;
    node.style.top = `${point.y}px`;
  }
}

function updateChrome() {
  selectButton.setAttribute("aria-pressed", state.tool === "select" ? "true" : "false");
  connectButton.setAttribute("aria-pressed", state.tool === "connect" ? "true" : "false");
  undoButton.disabled = state.past.length === 0;
  redoButton.disabled = state.future.length === 0;
  zoomLabel.textContent = `${Math.round(state.view.scale * 100)}%`;
  saveButton.classList.toggle("is-dirty", serialize() !== state.savedSnapshot);
  wrap.classList.toggle("is-connect", state.tool === "connect" && !(state.gesture && state.gesture.type === "pan"));
  wrap.classList.toggle("is-pan", Boolean(state.gesture && state.gesture.type === "pan"));
}

function clientToWorld(clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.view.x) / state.view.scale,
    y: (clientY - rect.top - state.view.y) / state.view.scale,
  };
}

function worldToWrap(point) {
  const svgRect = svg.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  return {
    x: svgRect.left + state.view.x + point.x * state.view.scale - wrapRect.left,
    y: svgRect.top + state.view.y + point.y * state.view.scale - wrapRect.top,
  };
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function hitShapeBody(shape, point) {
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  if (shape.type === "decision") {
    return Math.abs(point.x - cx) / (shape.w / 2) + Math.abs(point.y - cy) / (shape.h / 2) <= 1;
  }
  if (shape.type === "terminator" || shape.type === "onpage") {
    const dx = (point.x - cx) / (shape.w / 2);
    const dy = (point.y - cy) / (shape.h / 2);
    return dx * dx + dy * dy <= 1;
  }
  return point.x >= shape.x && point.x <= shape.x + shape.w && point.y >= shape.y && point.y <= shape.y + shape.h;
}

function hitHandle(point) {
  if (state.tool !== "select" || !state.selection || state.selection.kind !== "shape") return null;
  const shape = getShape(state.selection.id);
  if (!shape) return null;
  const reach = 8 / state.view.scale;
  const corners = [
    ["nw", shape.x, shape.y],
    ["ne", shape.x + shape.w, shape.y],
    ["se", shape.x + shape.w, shape.y + shape.h],
    ["sw", shape.x, shape.y + shape.h],
  ];
  for (const [name, x, y] of corners) {
    if (Math.abs(point.x - x) <= reach && Math.abs(point.y - y) <= reach) return name;
  }
  return null;
}

function nearestPort(shape, point) {
  let best = PORTS[0];
  let bestDistance = Infinity;
  for (const port of PORTS) {
    const center = portPoint(shape, port);
    const distance = Math.hypot(point.x - center.x, point.y - center.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = port;
    }
  }
  return best;
}

function hitPort(point, options = {}) {
  const reach = 10 / state.view.scale;
  for (let index = state.doc.shapes.length - 1; index >= 0; index -= 1) {
    const shape = state.doc.shapes[index];
    if (options.excludeId && shape.id === options.excludeId) continue;
    const allowed = options.ignoreVisibility || state.tool === "connect" || portsVisible(shape) || hitShapeBody(shape, point);
    if (!allowed) continue;
    for (const port of PORTS) {
      const center = portPoint(shape, port);
      if (Math.hypot(point.x - center.x, point.y - center.y) <= reach) {
        return { id: shape.id, port };
      }
    }
  }
  return null;
}

function portTarget(point, excludeId) {
  const direct = hitPort(point, { excludeId, ignoreVisibility: true });
  if (direct) return direct;
  const shape = hitShape(point);
  if (!shape || shape.id === excludeId) return null;
  return { id: shape.id, port: nearestPort(shape, point) };
}

function hitShape(point) {
  for (let index = state.doc.shapes.length - 1; index >= 0; index -= 1) {
    const shape = state.doc.shapes[index];
    if (hitShapeBody(shape, point)) return shape;
  }
  return null;
}

function hitConnector(point) {
  const reach = 8 / state.view.scale;
  for (let index = state.doc.connectors.length - 1; index >= 0; index -= 1) {
    const connector = state.doc.connectors[index];
    const points = connectorPoints(connector);
    if (!points) continue;
    for (let step = 1; step < points.length; step += 1) {
      if (distanceToSegment(point, points[step - 1], points[step]) <= reach) return connector;
    }
  }
  return null;
}

function cursorFor(point) {
  if (state.spaceDown) return "grab";
  const handle = hitHandle(point);
  if (handle === "nw" || handle === "se") return "nwse-resize";
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  if (hitPort(point)) return "crosshair";
  if (state.tool === "select" && hitShape(point)) return "move";
  if (state.tool === "connect") return "crosshair";
  return "default";
}

function setTool(tool) {
  state.tool = tool;
  render();
}

function addShape(master, world) {
  const before = serialize();
  const shape = {
    id: uid(),
    type: master.type,
    x: snap(world.x - master.w / 2),
    y: snap(world.y - master.h / 2),
    w: master.w,
    h: master.h,
    text: master.text,
  };
  state.doc.shapes.push(shape);
  state.selection = { kind: "shape", id: shape.id };
  commitChange(before);
  hideConfirm();
  render();
}

function resizeShape(shape, corner, point) {
  const right = shape.origin.x + shape.origin.w;
  const bottom = shape.origin.y + shape.origin.h;
  let x = shape.origin.x;
  let y = shape.origin.y;
  let edgeX = right;
  let edgeY = bottom;
  if (corner.includes("e")) edgeX = snap(point.x);
  if (corner.includes("s")) edgeY = snap(point.y);
  if (corner.includes("w")) x = snap(point.x);
  if (corner.includes("n")) y = snap(point.y);
  if (edgeX - x < MIN_SIZE) {
    if (corner.includes("w")) x = edgeX - MIN_SIZE;
    else edgeX = x + MIN_SIZE;
  }
  if (edgeY - y < MIN_SIZE) {
    if (corner.includes("n")) y = edgeY - MIN_SIZE;
    else edgeY = y + MIN_SIZE;
  }
  shape.x = x;
  shape.y = y;
  shape.w = edgeX - x;
  shape.h = edgeY - y;
}

function deleteSelection() {
  if (!state.selection) return;
  closeEditor(true);
  const before = serialize();
  if (state.selection.kind === "shape") {
    const id = state.selection.id;
    state.doc.shapes = state.doc.shapes.filter((shape) => shape.id !== id);
    state.doc.connectors = state.doc.connectors.filter((connector) => connector.fromId !== id && connector.toId !== id);
  } else {
    const id = state.selection.id;
    state.doc.connectors = state.doc.connectors.filter((connector) => connector.id !== id);
  }
  state.selection = null;
  commitChange(before);
  render();
}

const ARRANGE_X = 100;
const ARRANGE_Y = 100;
const ARRANGE_ORIGIN = 40;

function snapAtLeast(value, min) {
  let next = snap(Math.max(value, min));
  if (next < min - 0.01) next += GRID;
  return next;
}

function shapeCenter(shape) {
  return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 };
}

function portBias(connector, byId) {
  const source = byId.get(connector.fromId);
  if (!source || source.type !== "decision") return 0;
  if (connector.fromPort === "bottom") return -0.45;
  if (connector.fromPort === "right") return 0.45;
  if (connector.fromPort === "left") return -0.25;
  return 0;
}

function portSort(port) {
  if (port === "bottom") return 0;
  if (port === "left") return 1;
  if (port === "top") return 2;
  if (port === "right") return 3;
  return 4;
}

function linkedConnectors(doc) {
  const ids = new Set(doc.shapes.map((shape) => shape.id));
  return doc.connectors.filter((connector) =>
    connector.fromId !== connector.toId && ids.has(connector.fromId) && ids.has(connector.toId));
}

function connectedGroups(doc, connectors) {
  const byId = new Map(doc.shapes.map((shape) => [shape.id, shape]));
  const neighbors = new Map(doc.shapes.map((shape) => [shape.id, new Set()]));
  for (const connector of connectors) {
    neighbors.get(connector.fromId).add(connector.toId);
    neighbors.get(connector.toId).add(connector.fromId);
  }
  const seen = new Set();
  const flows = [];
  const loose = [];
  const ordered = [...doc.shapes].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const start of ordered) {
    if (seen.has(start.id)) continue;
    const group = [];
    const stack = [start.id];
    seen.add(start.id);
    while (stack.length) {
      const id = stack.pop();
      group.push(byId.get(id));
      for (const next of neighbors.get(id)) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    const ids = new Set(group.map((shape) => shape.id));
    const linked = connectors.some((connector) => ids.has(connector.fromId));
    if (linked) flows.push(group);
    else loose.push(group[0]);
  }
  return { flows, loose };
}

function layoutComponent(group, connectors, originX, originY) {
  const byId = new Map(group.map((shape) => [shape.id, shape]));
  const ids = new Set(byId.keys());
  const outgoing = new Map([...ids].map((id) => [id, []]));
  const incoming = new Map([...ids].map((id) => [id, []]));
  for (const connector of connectors) {
    if (!ids.has(connector.fromId) || !ids.has(connector.toId)) continue;
    outgoing.get(connector.fromId).push(connector);
    incoming.get(connector.toId).push(connector);
  }
  for (const edges of outgoing.values()) edges.sort((a, b) => portSort(a.fromPort) - portSort(b.fromPort));

  const color = new Map([...ids].map((id) => [id, 0]));
  const forward = [];
  const roots = [...ids].filter((id) => incoming.get(id).length === 0);
  const startIds = roots.length
    ? roots
    : [[...ids].sort((a, b) => byId.get(a).y - byId.get(b).y || byId.get(a).x - byId.get(b).x)[0]];
  startIds.sort((a, b) => byId.get(a).x - byId.get(b).x || byId.get(a).y - byId.get(b).y);

  function walk(id) {
    color.set(id, 1);
    for (const connector of outgoing.get(id)) {
      const next = connector.toId;
      if (color.get(next) === 1) continue;
      forward.push(connector);
      if (color.get(next) === 0) walk(next);
    }
    color.set(id, 2);
  }
  for (const id of startIds) if (color.get(id) === 0) walk(id);
  for (const id of ids) if (color.get(id) === 0) walk(id);

  const forwardOut = new Map([...ids].map((id) => [id, []]));
  const forwardIn = new Map([...ids].map((id) => [id, []]));
  for (const connector of forward) {
    forwardOut.get(connector.fromId).push(connector);
    forwardIn.get(connector.toId).push(connector);
  }

  const rank = new Map([...ids].map((id) => [id, 0]));
  const seen = new Set();
  const topo = [];
  function visit(id) {
    if (seen.has(id)) return;
    seen.add(id);
    for (const connector of forwardOut.get(id)) visit(connector.toId);
    topo.push(id);
  }
  for (const id of startIds) visit(id);
  for (const id of ids) visit(id);
  for (const id of topo.reverse()) {
    for (const connector of forwardOut.get(id)) {
      rank.set(connector.toId, Math.max(rank.get(connector.toId), rank.get(id) + 1));
    }
  }

  const layerCount = Math.max(...rank.values()) + 1;
  const layers = Array.from({ length: layerCount }, () => []);
  for (const shape of group) layers[rank.get(shape.id)].push(shape);
  for (const layer of layers) layer.sort((a, b) => a.x - b.x || a.y - b.y);

  function indexesOf() {
    const indexes = new Map();
    for (const layer of layers) layer.forEach((shape, index) => indexes.set(shape.id, index));
    return indexes;
  }

  function barycenter(shape, edges, indexes, bias) {
    if (!edges.length) return indexes.get(shape.id) ?? 0;
    let sum = 0;
    let count = 0;
    for (const connector of edges) {
      const otherId = connector.fromId === shape.id ? connector.toId : connector.fromId;
      const index = indexes.get(otherId);
      if (index == null) continue;
      sum += index + (bias ? portBias(connector, byId) : 0);
      count += 1;
    }
    return count ? sum / count : (indexes.get(shape.id) ?? 0);
  }

  function sharedDecisionOrder(a, b) {
    for (const left of forwardIn.get(a.id)) {
      if (byId.get(left.fromId)?.type !== "decision") continue;
      for (const right of forwardIn.get(b.id)) {
        if (left.fromId !== right.fromId) continue;
        return portSort(left.fromPort) - portSort(right.fromPort);
      }
    }
    return 0;
  }

  for (let pass = 0; pass < 4; pass += 1) {
    for (let row = 1; row < layers.length; row += 1) {
      const indexes = indexesOf();
      layers[row].sort((a, b) => {
        const decision = sharedDecisionOrder(a, b);
        if (decision) return decision;
        return barycenter(a, forwardIn.get(a.id), indexes, true) - barycenter(b, forwardIn.get(b.id), indexes, true);
      });
    }
    for (let row = layers.length - 2; row >= 0; row -= 1) {
      const indexes = indexesOf();
      layers[row].sort((a, b) =>
        barycenter(a, forwardOut.get(a.id), indexes, false) - barycenter(b, forwardOut.get(b.id), indexes, false));
    }
  }

  let y = originY;
  for (const layer of layers) {
    const band = Math.max(...layer.map((shape) => shape.h));
    let x = originX;
    for (const shape of layer) {
      shape.x = x;
      shape.y = Math.max(y, snap(y + (band - shape.h) / 2));
      x += shape.w + ARRANGE_X;
    }
    y = snapAtLeast(y + band + ARRANGE_Y, y + band + ARRANGE_Y);
  }

  function separateLayer(layer) {
    layer.sort((a, b) => a.x - b.x || a.y - b.y);
    let next = originX;
    for (const shape of layer) {
      shape.x = snapAtLeast(shape.x, next);
      next = shape.x + shape.w + ARRANGE_X;
    }
  }

  function shiftToward(shape, others) {
    if (!others.length) return;
    const center = others.reduce((sum, other) => sum + shapeCenter(other).x, 0) / others.length;
    shape.x = center - shape.w / 2;
  }

  for (let pass = 0; pass < 4; pass += 1) {
    for (let row = layers.length - 1; row >= 0; row -= 1) {
      for (const shape of layers[row]) {
        shiftToward(shape, forwardOut.get(shape.id).map((connector) => byId.get(connector.toId)));
      }
      separateLayer(layers[row]);
    }
    for (let row = 1; row < layers.length; row += 1) {
      for (const shape of layers[row]) {
        const parents = forwardIn.get(shape.id).map((connector) => byId.get(connector.fromId));
        const sibling = parents.some((parent) =>
          forwardOut.get(parent.id).some((connector) => {
            const other = byId.get(connector.toId);
            return other && other !== shape && rank.get(other.id) === row;
          }));
        if (!sibling) shiftToward(shape, parents);
      }
      separateLayer(layers[row]);
    }
  }

  const shift = originX - Math.min(...group.map((shape) => shape.x));
  for (const shape of group) shape.x += shift;
  return Math.max(...group.map((shape) => shape.y + shape.h));
}

function packLoose(shapes, top, wrapAt) {
  const ordered = [...shapes].sort((a, b) => a.x - b.x || a.y - b.y);
  let x = ARRANGE_ORIGIN;
  let y = top;
  let rowHeight = 0;
  for (const shape of ordered) {
    if (x > ARRANGE_ORIGIN && x + shape.w > wrapAt) {
      y += rowHeight + ARRANGE_Y;
      x = ARRANGE_ORIGIN;
      rowHeight = 0;
    }
    shape.x = snapAtLeast(x, x);
    shape.y = snapAtLeast(y, y);
    x = shape.x + shape.w + ARRANGE_X;
    rowHeight = Math.max(rowHeight, shape.h);
  }
}

function resolveOverlaps(shapes) {
  for (let guard = 0; guard < 10; guard += 1) {
    let moved = false;
    const ordered = [...shapes].sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 0; i < ordered.length; i += 1) {
      for (let j = i + 1; j < ordered.length; j += 1) {
        const a = ordered[i];
        const b = ordered[j];
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (overlapX <= 0 || overlapY <= 0) continue;
        if (overlapX < overlapY) b.x = snapAtLeast(a.x + a.w + ARRANGE_X, a.x + a.w + ARRANGE_X);
        else b.y = snapAtLeast(a.y + a.h + ARRANGE_Y, a.y + a.h + ARRANGE_Y);
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function retargetConnector(connector, byId) {
  const source = byId.get(connector.fromId);
  const target = byId.get(connector.toId);
  if (!source || !target) return;
  const from = shapeCenter(source);
  const to = shapeCenter(target);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const keepExit = source.type === "decision" && (connector.fromPort === "bottom" || connector.fromPort === "right");
  let fromPort = connector.fromPort;
  if (!keepExit) {
    if (Math.abs(dy) >= Math.abs(dx)) fromPort = dy >= 0 ? "bottom" : "top";
    else fromPort = dx >= 0 ? "right" : "left";
  }
  const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" };
  let toPort = opposite[fromPort];
  if (Math.abs(dy) > 36 && Math.abs(dy) >= Math.abs(dx)) toPort = dy > 0 ? "top" : "bottom";
  else if ((fromPort === "right" && dx < 0) || (fromPort === "left" && dx > 0)) toPort = fromPort;
  connector.fromPort = fromPort;
  connector.toPort = toPort;
}

function layoutDiagram(doc) {
  const connectors = linkedConnectors(doc);
  const { flows, loose } = connectedGroups(doc, connectors);
  let cursorY = ARRANGE_ORIGIN;
  let right = ARRANGE_ORIGIN;
  for (const group of flows) {
    cursorY = snapAtLeast(layoutComponent(group, connectors, ARRANGE_ORIGIN, cursorY) + ARRANGE_Y, cursorY + ARRANGE_Y);
    for (const shape of group) right = Math.max(right, shape.x + shape.w);
  }
  if (loose.length) packLoose(loose, cursorY, Math.max(right, 760));
  resolveOverlaps(doc.shapes);
  const byId = new Map(doc.shapes.map((shape) => [shape.id, shape]));
  for (const connector of connectors) retargetConnector(connector, byId);
}

function positionLegend(shape, body) {
  const right = Math.max(...body.map((item) => item.x + item.w));
  const bottom = Math.max(...body.map((item) => item.y + item.h));
  const left = Math.min(...body.map((item) => item.x));
  let x = snap(right - shape.w);
  if (x < left) x = snap(right + GRID);
  shape.x = x;
  shape.y = snap(bottom + GRID * 2);
}

function addLegend() {
  if (state.gesture) return;
  if (state.editor) closeEditor(true);
  const body = state.doc.shapes.filter((shape) => shape.type !== "legend");
  const masters = usedLegendMasters(body);
  if (!masters.length) {
    setStatus("Nothing to list.");
    return;
  }
  const before = serialize();
  const oldIds = new Set(state.doc.shapes.filter((shape) => shape.type === "legend").map((shape) => shape.id));
  state.doc.shapes = body;
  state.doc.connectors = state.doc.connectors.filter((connector) => !oldIds.has(connector.fromId) && !oldIds.has(connector.toId));
  const layout = legendLayout(masters);
  const shape = {
    id: uid(),
    type: "legend",
    x: 0,
    y: 0,
    w: layout.w,
    h: layout.h,
    text: masters.map((master) => master.type).join("\n"),
  };
  positionLegend(shape, body);
  state.doc.shapes.push(shape);
  state.selection = { kind: "shape", id: shape.id };
  commitChange(before);
  render();
  setStatus(masters.length === 1 ? "Legend lists 1 symbol." : `Legend lists ${masters.length} symbols.`);
}

function arrangeDiagram() {
  if (state.gesture) return;
  if (state.editor) closeEditor(true);
  const legends = state.doc.shapes.filter((shape) => shape.type === "legend");
  const body = state.doc.shapes.filter((shape) => shape.type !== "legend");
  if (!body.length) {
    setStatus("Nothing to arrange.");
    return;
  }
  const before = serialize();
  state.doc.shapes = body;
  layoutDiagram(state.doc);
  for (const legend of legends) state.doc.shapes.push(legend);
  if (legends[0]) positionLegend(legends[0], body);
  commitChange(before);
  fitView();
  setStatus("Arranged the diagram.");
}

function fitView() {
  if (state.editor) closeEditor(true);
  if (!state.doc.shapes.length) return;
  const bounds = contentBounds();
  const rect = svg.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 40) {
    render();
    return;
  }
  const margin = 36;
  const scale = Math.min(1, Math.max(0.25, Math.min(
    (rect.width - margin * 2) / bounds.w,
    (rect.height - margin * 2) / bounds.h,
  )));
  state.view.scale = scale;
  state.view.x = (rect.width - bounds.w * scale) / 2 - bounds.x * scale;
  state.view.y = (rect.height - bounds.h * scale) / 2 - bounds.y * scale;
  render();
}

function nudge(dx, dy) {
  if (!state.selection || state.selection.kind !== "shape") return;
  const shape = getShape(state.selection.id);
  if (!shape) return;
  const before = serialize();
  shape.x = snap(shape.x + dx);
  shape.y = snap(shape.y + dy);
  commitChange(before);
  render();
}

function zoomAt(clientX, clientY, nextScale) {
  const world = clientToWorld(clientX, clientY);
  const scale = Math.min(3, Math.max(0.25, nextScale));
  const rect = svg.getBoundingClientRect();
  state.view.scale = scale;
  state.view.x = clientX - rect.left - world.x * scale;
  state.view.y = clientY - rect.top - world.y * scale;
  render();
}

function viewCenter() {
  const rect = svg.getBoundingClientRect();
  return clientToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function positionEditor() {
  const editing = state.editor;
  if (!editing) return;
  if (editing.kind === "shape") {
    const shape = getShape(editing.id);
    if (!shape) {
      closeEditor(false);
      return;
    }
    const origin = worldToWrap({ x: shape.x, y: shape.y });
    const width = Math.max(48, shape.w * state.view.scale - 16);
    const height = Math.max(28, Math.min(shape.h * state.view.scale - 8, 80));
    textarea.style.left = `${origin.x + 8 * state.view.scale}px`;
    textarea.style.top = `${origin.y + (shape.h * state.view.scale - height) / 2}px`;
    textarea.style.width = `${width}px`;
    textarea.style.height = `${height}px`;
  } else {
    const connector = getConnector(editing.id);
    const points = connector && connectorPoints(connector);
    if (!points) {
      closeEditor(false);
      return;
    }
    const point = worldToWrap(midpoint(points));
    textarea.style.left = `${point.x - 70}px`;
    textarea.style.top = `${point.y - 16}px`;
    textarea.style.width = "140px";
    textarea.style.height = "32px";
  }
}

function closeEditor(commit) {
  const editing = state.editor;
  if (!editing) return;
  state.editor = null;
  const value = textarea.value.slice(0, 1000);
  textarea.hidden = true;
  if (!commit || value === editing.original) {
    render();
    return;
  }
  const before = serialize();
  const item = editing.kind === "shape" ? getShape(editing.id) : getConnector(editing.id);
  if (item) item.text = value;
  commitChange(before);
  render();
}

function openEditor(kind, id) {
  if (state.editor) closeEditor(true);
  const item = kind === "shape" ? getShape(id) : getConnector(id);
  if (!item || (kind === "shape" && item.type === "legend")) return;
  state.selection = { kind, id };
  state.editor = { kind, id, original: item.text };
  textarea.value = item.text;
  textarea.hidden = false;
  render();
  textarea.focus();
  textarea.select();
}

function hideConfirm() {
  confirmBar.hidden = true;
}

function clearDoc() {
  const before = serialize();
  state.doc = { shapes: [], connectors: [] };
  state.selection = null;
  closeEditor(false);
  commitChange(before);
  hideConfirm();
  render();
}

function sanitizeShape(raw) {
  if (!raw || !TYPES.has(raw.type)) return null;
  const master = MASTERS.find((item) => item.type === raw.type);
  if (!master && raw.type !== "legend") return null;
  const shape = {
    id: raw.id == null || raw.id === "" ? uid() : String(raw.id),
    type: raw.type,
    x: Number(raw.x),
    y: Number(raw.y),
    w: Number(raw.w),
    h: Number(raw.h),
    text: String(raw.text ?? "").slice(0, raw.type === "legend" ? 8000 : 1000),
  };
  if (![shape.x, shape.y, shape.w, shape.h].every(Number.isFinite)) return null;
  shape.w = Math.max(MIN_SIZE, shape.w);
  shape.h = Math.max(MIN_SIZE, shape.h);
  bumpId(shape.id);
  return shape;
}

function sanitizeConnector(raw, ids) {
  if (!raw) return null;
  const connector = {
    id: raw.id == null || raw.id === "" ? uid() : String(raw.id),
    fromId: String(raw.fromId ?? ""),
    fromPort: raw.fromPort,
    toId: String(raw.toId ?? ""),
    toPort: raw.toPort,
    text: String(raw.text ?? "").slice(0, 1000),
  };
  if (!ids.has(connector.fromId) || !ids.has(connector.toId)) return null;
  if (connector.fromId === connector.toId) return null;
  if (!PORTS.includes(connector.fromPort) || !PORTS.includes(connector.toPort)) return null;
  bumpId(connector.id);
  return connector;
}

function openText(text) {
  let data;
  try {
    data = JSON.parse(String(text).replace(/^\uFEFF/, ""));
  } catch (error) {
    setStatus("That file is not a Misio diagram.");
    return;
  }
  if (!data || !Array.isArray(data.shapes) || !Array.isArray(data.connectors)) {
    setStatus("That file is not a Misio diagram.");
    return;
  }
  closeEditor(false);
  const before = serialize();
  const shapes = [];
  const seen = new Set();
  for (const raw of data.shapes) {
    const shape = sanitizeShape(raw);
    if (!shape) continue;
    if (seen.has(shape.id)) shape.id = uid();
    seen.add(shape.id);
    shapes.push(shape);
  }
  const ids = new Set(shapes.map((shape) => shape.id));
  const connectors = data.connectors.map((connector) => sanitizeConnector(connector, ids)).filter(Boolean);
  state.doc = { shapes, connectors };
  state.selection = null;
  commitChange(before);
  state.savedSnapshot = serialize();
  hideConfirm();
  setStatus("Opened diagram.");
  render();
}

function download(name, text, type) {
  lastDownload = { name, text, type };
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function saveDoc() {
  if (state.editor) closeEditor(true);
  const text = serialize();
  download("misio.json", text, "application/json");
  state.savedSnapshot = text;
  updateChrome();
  setStatus("Saved misio.json.");
}

function exportSvgString() {
  const bounds = contentBounds();
  const out = el("svg", {
    xmlns: SVGNS,
    width: Math.ceil(bounds.w),
    height: Math.ceil(bounds.h),
    viewBox: `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`,
  });
  const title = el("title", {}, out);
  title.textContent = "Misio";
  el("rect", { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h, fill: "#fffcf7" }, out);
  plainDraw = true;
  const marker = el("marker", {
    id: "arrow",
    viewBox: "0 0 12 10",
    refX: "11",
    refY: "5",
    markerWidth: "12",
    markerHeight: "10",
    orient: "auto",
    markerUnits: "userSpaceOnUse",
  }, el("defs", {}, out));
  el("path", { d: "M0 0 L12 5 L0 10 Z", fill: "#184e86" }, marker);
  try {
    drawDiagram(out, false);
  } finally {
    plainDraw = false;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(out)}`;
}

function exportSvg() {
  if (state.editor) closeEditor(true);
  download("misio.svg", exportSvgString(), "image/svg+xml");
  setStatus("Exported misio.svg.");
}

function onPointerDown(event) {
  if (event.target === textarea) return;
  if (event.button === 1 || (event.button === 0 && state.spaceDown)) {
    event.preventDefault();
    state.gesture = { type: "pan", sx: event.clientX, sy: event.clientY, vx: state.view.x, vy: state.view.y };
    wrap.setPointerCapture(event.pointerId);
    render();
    return;
  }
  if (event.button !== 0) return;
  if (state.editor) closeEditor(true);
  const world = clientToWorld(event.clientX, event.clientY);
  const handle = hitHandle(world);
  if (handle) {
    const shape = getShape(state.selection.id);
    state.gesture = { type: "resize", id: shape.id, corner: handle, before: serialize(), origin: { x: shape.x, y: shape.y, w: shape.w, h: shape.h } };
    shape.origin = state.gesture.origin;
    wrap.setPointerCapture(event.pointerId);
    return;
  }
  const port = hitPort(world);
  if (port && (state.tool === "connect" || state.tool === "select")) {
    state.gesture = { type: "connect", fromId: port.id, fromPort: port.port, pointer: world, before: serialize() };
    state.selection = { kind: "shape", id: port.id };
    wrap.setPointerCapture(event.pointerId);
    render();
    return;
  }
  if (state.tool === "connect") {
    const shape = hitShape(world);
    if (shape) {
      state.selection = { kind: "shape", id: shape.id };
      render();
      return;
    }
  }
  if (state.tool === "select") {
    const shape = hitShape(world);
    if (shape) {
      state.selection = { kind: "shape", id: shape.id };
      state.gesture = {
        type: "move",
        id: shape.id,
        dx: world.x - shape.x,
        dy: world.y - shape.y,
        before: serialize(),
      };
      wrap.setPointerCapture(event.pointerId);
      render();
      return;
    }
    const connector = hitConnector(world);
    if (connector) {
      state.selection = { kind: "connector", id: connector.id };
      state.gesture = null;
      render();
      return;
    }
  }
  state.selection = null;
  state.gesture = { type: "pan", sx: event.clientX, sy: event.clientY, vx: state.view.x, vy: state.view.y };
  wrap.setPointerCapture(event.pointerId);
  render();
}

function onPointerMove(event) {
  if (event.target === textarea || nativePortDrag) return;
  const world = clientToWorld(event.clientX, event.clientY);
  const gesture = state.gesture;
  if (!gesture) {
    const port = hitPort(world);
    const shape = hitShape(world);
    const hover = port
      ? { kind: "port", id: port.id, port: port.port }
      : shape
        ? { kind: "shape", id: shape.id }
        : null;
    const sameHover = Boolean(state.hover) === Boolean(hover)
      && (!hover || (state.hover.kind === hover.kind && state.hover.id === hover.id && state.hover.port === hover.port));
    state.hover = hover;
    const cursor = cursorFor(world);
    if (wrap.style.cursor !== cursor) wrap.style.cursor = cursor;
    if (!sameHover) render();
    return;
  }
  if (gesture.type === "pan") {
    state.view.x = gesture.vx + (event.clientX - gesture.sx);
    state.view.y = gesture.vy + (event.clientY - gesture.sy);
    render();
    return;
  }
  if (gesture.type === "move") {
    const shape = getShape(gesture.id);
    if (!shape) return;
    shape.x = snap(world.x - gesture.dx);
    shape.y = snap(world.y - gesture.dy);
    render();
    return;
  }
  if (gesture.type === "resize") {
    const shape = getShape(gesture.id);
    if (!shape) return;
    shape.origin = gesture.origin;
    resizeShape(shape, gesture.corner, world);
    render();
    return;
  }
  if (gesture.type === "connect") {
    gesture.pointer = world;
    const port = portTarget(world, gesture.fromId);
    state.hover = port ? { kind: "port", id: port.id, port: port.port } : null;
    render();
  }
}

function finishGesture() {
  const gesture = state.gesture;
  if (!gesture) return;
  state.gesture = null;
  if (gesture.type === "move" || gesture.type === "resize") {
    const shape = getShape(gesture.id);
    if (shape) delete shape.origin;
    commitChange(gesture.before);
  } else if (gesture.type === "connect" && !nativePortDrag) {
    const port = portTarget(gesture.pointer, gesture.fromId);
    if (port) {
      const connector = {
        id: uid(),
        fromId: gesture.fromId,
        fromPort: gesture.fromPort,
        toId: port.id,
        toPort: port.port,
        text: "",
      };
      state.doc.connectors.push(connector);
      state.selection = { kind: "connector", id: connector.id };
      commitChange(gesture.before);
    }
  }
  nativePortDrag = false;
  state.hover = null;
  wrap.style.cursor = "";
  render();
}

function onPointerUp(event) {
  if (state.gesture) finishGesture();
  if (wrap.hasPointerCapture(event.pointerId)) wrap.releasePointerCapture(event.pointerId);
}

function onWheel(event) {
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
  zoomAt(event.clientX, event.clientY, state.view.scale * factor);
}

let nativeStencilDrag = false;
let nativePortDrag = false;

function startStencilDrag(master, event) {
  nativeStencilDrag = false;
  const ghost = document.createElement("div");
  ghost.className = "ghost";
  ghost.textContent = labelFor(master.type);
  document.body.appendChild(ghost);
  const move = (moveEvent) => {
    ghost.style.left = `${moveEvent.clientX + 12}px`;
    ghost.style.top = `${moveEvent.clientY + 12}px`;
  };
  const up = (upEvent) => {
    const usedNative = nativeStencilDrag;
    nativeStencilDrag = false;
    ghost.remove();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    if (usedNative) return;
    const hit = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
    if (hit && wrap.contains(hit)) addShape(master, clientToWorld(upEvent.clientX, upEvent.clientY));
  };
  move(event);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function onStencilDragStart(master, event) {
  nativeStencilDrag = true;
  event.dataTransfer.setData("application/x-misio-shape", master.type);
  event.dataTransfer.effectAllowed = "copy";
  const ghost = document.createElement("div");
  ghost.className = "ghost";
  ghost.textContent = labelFor(master.type);
  ghost.style.top = "-1000px";
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(ghost, 12, 12);
  window.setTimeout(() => ghost.remove(), 0);
}

function masterButton(master) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "master";
  button.draggable = true;
  button.dataset.type = master.type;
  button.title = labelFor(master.type);
  const icon = document.createElementNS(SVGNS, "svg");
  icon.setAttribute("viewBox", "0 0 76 40");
  icon.setAttribute("aria-hidden", "true");
  plainDraw = true;
  drawOutline(icon, { type: master.type, x: 8, y: 4, w: 60, h: 32, text: "" }, {
    fill: "#fffcf7",
    stroke: "#1c1915",
    sw: 1.5,
    selected: false,
  });
  plainDraw = false;
  const name = document.createElement("span");
  name.dataset.lang = master.type;
  name.textContent = labelFor(master.type);
  button.append(icon, name);
  button.addEventListener("dragstart", (event) => onStencilDragStart(master, event));
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    startStencilDrag(master, event);
  });
  button.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addShape(master, viewCenter());
  });
  return button;
}

function symbolGroup(fallback, nodes, nested, key) {
  const details = document.createElement("details");
  details.className = nested ? "symbol-group symbol-group-nested" : "symbol-group";
  const summary = document.createElement("summary");
  if (key) {
    summary.dataset.lang = `group:${key}`;
    summary.textContent = labelFor(`group:${key}`);
  } else {
    summary.textContent = fallback;
  }
  summary.title = nested ? "Show or hide these symbols" : "Show or hide this group";
  const list = document.createElement("div");
  list.className = "symbol-group-items";
  for (const node of nodes) list.appendChild(node);
  details.append(summary, list);
  return details;
}

function mastersIn(categoryId) {
  return MASTERS.filter((master) => master.category === categoryId).map(masterButton);
}

function buildMasters() {
  for (const master of MASTERS) {
    if (master.category && master.category !== "standard") continue;
    mastersEl.appendChild(masterButton(master));
  }
  const areiSections = window.MisioArei.categories.map((category) =>
    symbolGroup(category.name, mastersIn(category.id), true, category.id));
  mastersEl.appendChild(symbolGroup("AREI", areiSections, false, "arei"));
  for (const category of window.MisioNetwork.categories) {
    mastersEl.appendChild(symbolGroup(category.name, mastersIn(category.id), false, category.id));
  }
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || tag === "BUTTON" || target.getAttribute("role") === "button";
}

function onKeyDown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveDoc();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "l") {
    event.preventDefault();
    arrangeDiagram();
    return;
  }
  if (event.target === textarea) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
    event.preventDefault();
    undo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))) {
    event.preventDefault();
    redo();
    return;
  }
  if (isTypingTarget(event.target)) {
    if (event.code === "Space") state.spaceDown = false;
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    state.spaceDown = true;
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelection();
    return;
  }
  if (event.key === "Escape") {
    hideConfirm();
    state.selection = null;
    render();
    return;
  }
  if (event.key === "v" || event.key === "V") {
    setTool("select");
    return;
  }
  if (event.key === "c" || event.key === "C") {
    if (event.ctrlKey || event.metaKey) return;
    setTool("connect");
    return;
  }
  const step = GRID;
  if (event.key === "ArrowLeft") { event.preventDefault(); nudge(-step, 0); }
  else if (event.key === "ArrowRight") { event.preventDefault(); nudge(step, 0); }
  else if (event.key === "ArrowUp") { event.preventDefault(); nudge(0, -step); }
  else if (event.key === "ArrowDown") { event.preventDefault(); nudge(0, step); }
}

function onDoubleClick(event) {
  if (event.target === textarea) return;
  const world = clientToWorld(event.clientX, event.clientY);
  const shape = hitShape(world);
  if (shape) {
    openEditor("shape", shape.id);
    return;
  }
  const connector = hitConnector(world);
  if (connector) openEditor("connector", connector.id);
}

selectButton.addEventListener("click", () => setTool("select"));
connectButton.addEventListener("click", () => setTool("connect"));
undoButton.addEventListener("click", undo);
redoButton.addEventListener("click", redo);
document.getElementById("arrange").addEventListener("click", arrangeDiagram);
document.getElementById("legend").addEventListener("click", addLegend);
document.getElementById("fit").addEventListener("click", fitView);
document.getElementById("zoom-in").addEventListener("click", () => {
  const rect = svg.getBoundingClientRect();
  zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, state.view.scale * 1.1);
});
document.getElementById("zoom-out").addEventListener("click", () => {
  const rect = svg.getBoundingClientRect();
  zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, state.view.scale / 1.1);
});
document.getElementById("new-doc").addEventListener("click", () => {
  if (state.editor) closeEditor(true);
  if (!state.doc.shapes.length && !state.doc.connectors.length) return;
  confirmBar.hidden = false;
});
document.getElementById("confirm-yes").addEventListener("click", clearDoc);
document.getElementById("confirm-no").addEventListener("click", hideConfirm);
document.getElementById("open-doc").addEventListener("click", () => fileInput.click());
saveButton.addEventListener("click", saveDoc);
document.getElementById("export-svg").addEventListener("click", exportSvg);
fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => openText(String(reader.result || ""));
  reader.onerror = () => setStatus("That file could not be read.");
  reader.readAsText(file);
});

wrap.addEventListener("dragover", (event) => {
  const types = [...event.dataTransfer.types];
  if (!types.includes("application/x-misio-shape") && !types.includes("application/x-misio-port")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});
wrap.addEventListener("drop", (event) => {
  const portData = event.dataTransfer.getData("application/x-misio-port");
  if (portData) {
    event.preventDefault();
    const [fromId, fromPort] = portData.split(":");
    const target = portTarget(clientToWorld(event.clientX, event.clientY), fromId);
    state.gesture = null;
    nativePortDrag = false;
    if (target && PORTS.includes(fromPort) && getShape(fromId)) {
      const before = serialize();
      const connector = {
        id: uid(),
        fromId,
        fromPort,
        toId: target.id,
        toPort: target.port,
        text: "",
      };
      state.doc.connectors.push(connector);
      state.selection = { kind: "connector", id: connector.id };
      commitChange(before);
    }
    render();
    return;
  }
  const type = event.dataTransfer.getData("application/x-misio-shape");
  const master = MASTERS.find((item) => item.type === type);
  if (!master) return;
  event.preventDefault();
  addShape(master, clientToWorld(event.clientX, event.clientY));
});
wrap.addEventListener("dragend", () => {
  if (!nativePortDrag) return;
  nativePortDrag = false;
  if (state.gesture && state.gesture.type === "connect") {
    state.gesture = null;
    state.hover = null;
    render();
  }
});
wrap.addEventListener("pointerdown", onPointerDown);
wrap.addEventListener("pointermove", onPointerMove);
wrap.addEventListener("pointerup", onPointerUp);
wrap.addEventListener("pointercancel", (event) => {
  const gesture = state.gesture;
  if (gesture && (gesture.type === "move" || gesture.type === "resize")) {
    const shape = getShape(gesture.id);
    if (shape && gesture.type === "resize") {
      shape.x = gesture.origin.x;
      shape.y = gesture.origin.y;
      shape.w = gesture.origin.w;
      shape.h = gesture.origin.h;
      delete shape.origin;
    }
    if (shape && gesture.type === "move") {
      const snapshot = JSON.parse(gesture.before);
      const original = snapshot.shapes.find((item) => item.id === shape.id);
      if (original) {
        shape.x = original.x;
        shape.y = original.y;
      }
    }
  }
  state.gesture = null;
  state.hover = null;
  if (wrap.hasPointerCapture(event.pointerId)) wrap.releasePointerCapture(event.pointerId);
  render();
});
wrap.addEventListener("dblclick", onDoubleClick);
wrap.addEventListener("wheel", onWheel, { passive: false });
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", (event) => {
  if (event.code === "Space") state.spaceDown = false;
});
textarea.addEventListener("blur", () => closeEditor(true));
textarea.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    textarea.value = state.editor ? state.editor.original : textarea.value;
    closeEditor(false);
  } else if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    textarea.blur();
  }
});
window.addEventListener("beforeunload", (event) => {
  if (serialize() !== state.savedSnapshot) {
    event.preventDefault();
    event.returnValue = "";
  }
});

function applyLanguage(lang) {
  const next = lang === "nl" || lang === "fr" ? lang : "en";
  state.lang = next;
  document.documentElement.lang = next;
  const select = document.getElementById("lang");
  if (select && select.value !== next) select.value = next;
  for (const node of document.querySelectorAll("[data-lang]")) {
    node.textContent = labelFor(node.dataset.lang);
  }
  for (const button of mastersEl.querySelectorAll(".master")) {
    button.title = labelFor(button.dataset.type);
  }
  try {
    localStorage.setItem("misio-lang", next);
  } catch (error) {
    // The page still switches language if storage is blocked.
  }
  render();
}

buildMasters();
const langSelect = document.getElementById("lang");
langSelect.value = state.lang;
document.documentElement.lang = state.lang;
langSelect.addEventListener("change", () => applyLanguage(langSelect.value));
state.savedSnapshot = serialize();
render();

window.Misio = {
  getDoc() {
    return JSON.parse(serialize());
  },
  loadText(text) {
    openText(text);
  },
  lastDownload() {
    return lastDownload;
  },
};
