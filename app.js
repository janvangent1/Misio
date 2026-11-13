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
  p1: [0, 1],
  p2: [0, -1],
  p3: [0, 1],
  p4: [0, -1],
  p5: [0, 1],
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
  { type: "bus", name: "Bus", w: 360, h: 40, text: "", category: "arei-boards" },
];
const MASTERS = FLOW_MASTERS.concat(
  window.MisioArei.masters,
  window.MisioNetwork.masters,
  window.MisioVehicle.masters,
  window.MisioAir.masters,
  window.MisioWater.masters,
);
const TYPES = new Set(MASTERS.map((master) => master.type));
TYPES.add("legend");
TYPES.add("lane");
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
const busButton = document.getElementById("tool-bus");
const endsSelect = document.getElementById("connector-ends");
const shapeSearch = document.getElementById("shape-search");
const laneColorWrap = document.getElementById("lane-color-wrap");
const laneColorInput = document.getElementById("lane-color");
const laneSwatches = [...document.querySelectorAll(".lane-swatch")];
const connectorColorWrap = document.getElementById("connector-color-wrap");
const connectorColorInput = document.getElementById("connector-color");
const connectorSwatches = [...document.querySelectorAll(".connector-swatch")];
let colorBefore = null;

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
  snap: storedSnap(),
  connectorEnds: "auto",
  clipboard: null,
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

function storedSnap() {
  try {
    return localStorage.getItem("misio-snap") !== "off";
  } catch (error) {
    return true;
  }
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
    const categories = window.MisioArei.categories.concat(
      window.MisioNetwork.categories,
      window.MisioVehicle.categories,
      window.MisioAir.categories,
      window.MisioWater.categories,
    );
    const category = categories.find((item) => item.id === id);
    return category ? category.name : id;
  }
  const master = MASTERS.find((item) => item.type === key);
  if (master) return master.name;
  return key;
}

function ui(key, vars) {
  const tables = window.MisioUi || {};
  const table = tables[state.lang] || {};
  const english = tables.en || {};
  let text = table[key] || english[key] || key;
  if (!vars) return text;
  for (const [name, value] of Object.entries(vars)) {
    text = text.split("{" + name + "}").join(String(value));
  }
  return text;
}

function snap(value) {
  return Math.round(value / GRID) * GRID;
}

function maybeSnap(value) {
  return state.snap ? snap(value) : value;
}

function cloneDoc(doc) {
  return {
    shapes: doc.shapes.map(shapeRecord),
    connectors: doc.connectors.map(connectorRecord),
  };
}

function shapeRecord(shape) {
  const record = {
    id: String(shape.id),
    type: shape.type,
    x: shape.x,
    y: shape.y,
    w: shape.w,
    h: shape.h,
    text: String(shape.text ?? ""),
  };
  if (shape.type === "lane") {
    record.axis = laneAxis(shape);
    const color = laneHex(shape.color);
    if (color) record.color = color;
  }
  if (shapeAngle(shape)) record.rotation = shapeAngle(shape);
  return record;
}

function connectorRecord(connector) {
  const record = {
    id: String(connector.id),
    fromId: String(connector.fromId),
    fromPort: connector.fromPort,
    toId: String(connector.toId),
    toPort: connector.toPort,
    text: String(connector.text ?? ""),
  };
  if (knownEnds(connector.ends)) record.ends = connector.ends;
  const color = laneHex(connector.color);
  if (color && color !== CONNECTOR_INK) record.color = color;
  return record;
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

function selectedShapeIds() {
  if (!state.selection || state.selection.kind !== "shape") return [];
  const ids = Array.isArray(state.selection.ids) && state.selection.ids.length
    ? state.selection.ids
    : (state.selection.id ? [state.selection.id] : []);
  const unique = [];
  for (const id of ids) {
    if (getShape(id) && !unique.includes(id)) unique.push(id);
  }
  return unique;
}

function selectShapes(ids) {
  const unique = [];
  for (const id of ids) {
    if (getShape(id) && !unique.includes(id)) unique.push(id);
  }
  state.selection = unique.length
    ? { kind: "shape", id: unique[unique.length - 1], ids: unique }
    : null;
}

function shapeIsSelected(shape) {
  if (!state.selection || state.selection.kind !== "shape") return false;
  if (Array.isArray(state.selection.ids) && state.selection.ids.length) return state.selection.ids.includes(shape.id);
  return state.selection.id === shape.id;
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
  persistDraft();
  return true;
}

function applySnapshot(snapshot) {
  const data = JSON.parse(snapshot);
  state.doc = { shapes: data.shapes.map(shapeRecord), connectors: data.connectors.map(connectorRecord) };
  if (!state.selection) return;
  if (state.selection.kind === "shape") {
    const ids = selectedShapeIds();
    if (!ids.length) state.selection = null;
    else selectShapes(ids);
    return;
  }
  if (!getConnector(state.selection.id)) state.selection = null;
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

function symbolPacks() {
  return [window.MisioAir, window.MisioNetwork, window.MisioVehicle, window.MisioWater, window.MisioArei].filter(Boolean);
}

function symbolPorts(shape) {
  for (const pack of symbolPacks()) {
    const table = pack.ports;
    if (table && table[shape.type]) return { pack, ports: table[shape.type] };
  }
  return null;
}

function shapePorts(shape) {
  const found = symbolPorts(shape);
  return found ? found.ports.map((item) => item.id) : PORTS;
}

function knownPort(port) {
  return typeof port === "string" && (Object.prototype.hasOwnProperty.call(PORT_VECTOR, port) || /^n\d+$/.test(port));
}

function mapIconPoint(pack, shape, nx, ny) {
  if (pack.iconPoint) return pack.iconPoint(shape, nx, ny);
  const box = pack.iconBox(shape);
  const size = Math.min(box.w, box.h);
  const ox = box.x + (box.w - size) / 2;
  const oy = box.y + (box.h - size) / 2;
  return { x: ox + (nx / 40) * size, y: oy + (ny / 40) * size };
}

function iconFrame(pack, shape) {
  const box = pack.iconBox(shape);
  const size = Math.min(box.w, box.h);
  return {
    x: box.x + (box.w - size) / 2,
    y: box.y + (box.h - size) / 2,
    size,
  };
}

function sideOnIcon(pack, shape, port) {
  if (!pack || !pack.iconBox) return null;
  if (port !== "top" && port !== "right" && port !== "bottom" && port !== "left") return null;
  const frame = iconFrame(pack, shape);
  const mid = frame.size / 2;
  if (port === "top") return { x: frame.x + mid, y: frame.y };
  if (port === "right") return { x: frame.x + frame.size, y: frame.y + mid };
  if (port === "bottom") return { x: frame.x + mid, y: frame.y + frame.size };
  return { x: frame.x, y: frame.y + mid };
}

function shapeAngle(shape) {
  const turn = Number(shape && shape.rotation);
  return turn === 90 || turn === 180 || turn === 270 ? turn : 0;
}

function shapeCenter(shape) {
  return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 };
}

function contentShape(shape) {
  const angle = shapeAngle(shape);
  const quarter = angle === 90 || angle === 270;
  const w = quarter ? shape.h : shape.w;
  const h = quarter ? shape.w : shape.h;
  const center = shapeCenter(shape);
  return {
    ...shape,
    x: center.x - w / 2,
    y: center.y - h / 2,
    w,
    h,
    rotation: 0,
    turn: angle,
  };
}

function turnPoint(point, center, angle) {
  if (!angle) return point;
  const rad = angle * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function turnVector(vector, angle) {
  if (!angle) return vector;
  const rad = angle * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const [dx, dy] = vector;
  return [dx * cos - dy * sin, dx * sin + dy * cos];
}

function outlinePort(shape, port) {
  const { x, y, w, h, type } = shape;
  const right = x + w;
  const bottom = y + h;
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (type === "data") {
    const slant = Math.min(28, w * 0.18);
    if (port === "left") return { x: x + slant / 2, y: cy };
    if (port === "right") return { x: right - slant / 2, y: cy };
  }
  if (type === "manual") {
    const slant = Math.min(22, h * 0.28);
    if (port === "top") return { x: cx, y: y + slant / 2 };
  }
  if (type === "document") {
    const wave = Math.min(16, h * 0.18);
    if (port === "bottom") return { x: cx, y: bottom - wave * 0.3 };
  }
  if (type === "bus") {
    if (port === "left") return { x, y: cy };
    if (port === "right") return { x: right, y: cy };
    if (port === "top" || port === "bottom") return { x: cx, y: cy };
  }
  return null;
}

function localPortPoint(shape, port) {
  const onOutline = outlinePort(shape, port);
  if (onOutline) return onOutline;
  const found = symbolPorts(shape);
  if (found) {
    const item = found.ports.find((entry) => entry.id === port);
    if (item) {
      if (item.edge) return { x: shape.x + item.x * shape.w, y: shape.y + item.y * shape.h };
      return mapIconPoint(found.pack, shape, item.x, item.y);
    }
  }
  const pack = symbolPack(shape.type);
  const onIcon = sideOnIcon(pack, shape, port);
  if (onIcon) return onIcon;
  switch (port) {
    case "top": return { x: shape.x + shape.w / 2, y: shape.y };
    case "right": return { x: shape.x + shape.w, y: shape.y + shape.h / 2 };
    case "bottom": return { x: shape.x + shape.w / 2, y: shape.y + shape.h };
    default: return { x: shape.x, y: shape.y + shape.h / 2 };
  }
}

function portPoint(shape, port) {
  const local = contentShape(shape);
  return turnPoint(localPortPoint(local, port), shapeCenter(shape), local.turn);
}

function portVectorOf(shape, port) {
  const found = shape && symbolPorts(shape);
  const item = found && found.ports.find((entry) => entry.id === port);
  const base = item && PORT_VECTOR[item.dir] ? PORT_VECTOR[item.dir] : (PORT_VECTOR[port] || PORT_VECTOR.bottom);
  return turnVector(base, shapeAngle(shape));
}

function dedupe(points) {
  const result = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 0.5) result.push(point);
  }
  return result;
}

function routePoints(start, startVec, end, endVec) {
  const [sdx, sdy] = startVec;
  const [edx, edy] = endVec;
  const p1 = { x: start.x + sdx * STUB, y: start.y + sdy * STUB };
  const p2 = { x: end.x + edx * STUB, y: end.y + edy * STUB };
  const points = [start, p1];
  if (Math.abs(p1.x - p2.x) < 0.5 || Math.abs(p1.y - p2.y) < 0.5) {
    points.push(p2);
  } else if (sdx !== 0 && edx !== 0) {
    const midX = (p1.x + p2.x) / 2;
    points.push({ x: midX, y: p1.y }, { x: midX, y: p2.y }, p2);
  } else if (sdy !== 0 && edy !== 0) {
    if (Math.abs(start.x - end.x) <= GRID / 2) points.push(p2);
    else {
      const midY = (p1.y + p2.y) / 2;
      points.push({ x: p1.x, y: midY }, { x: p2.x, y: midY }, p2);
    }
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
  return routePoints(
    portPoint(from, connector.fromPort),
    portVectorOf(from, connector.fromPort),
    portPoint(to, connector.toPort),
    portVectorOf(to, connector.toPort),
  );
}

function previewPoints(shape, port, cursor) {
  const start = portPoint(shape, port);
  const [dx, dy] = portVectorOf(shape, port);
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
  const id = String(type);
  if (id.startsWith("arei-")) return window.MisioArei;
  if (id.startsWith("net-")) return window.MisioNetwork;
  if (id.startsWith("veh-")) return window.MisioVehicle;
  if (id.startsWith("air-")) return window.MisioAir;
  if (id.startsWith("h2o-")) return window.MisioWater;
  return null;
}

function drawAreiLabel(parent, shape) {
  const text = String(shape.text || "").trim();
  if (!text) return;
  const pack = symbolPack(shape.type);
  const caption = pack.captionBox && pack.captionBox(shape);
  const icon = caption ? null : pack.iconBox(shape);
  const maxWidth = caption ? caption.w : Math.max(24, shape.w - 8);
  let size = caption ? 13 : 12;
  let lines = wrapLines(text, maxWidth, size).slice(0, caption ? 2 : 3);
  while (caption && size > 10 && lines.length * size * 1.2 > caption.h) {
    size -= 1;
    lines = wrapLines(text, maxWidth, size).slice(0, 2);
  }
  const lineHeight = size * (caption ? 1.2 : 1.25);
  const cx = caption ? caption.x + caption.w / 2 : shape.x + shape.w / 2;
  const anchorY = caption
    ? caption.y + caption.h / 2
    : icon.y + icon.h + size + 2;
  const node = el("text", {
    x: cx,
    y: caption ? anchorY - ((lines.length - 1) * lineHeight) / 2 : anchorY,
    "text-anchor": "middle",
    "dominant-baseline": caption ? "middle" : null,
    "font-family": "Segoe UI, Helvetica Neue, sans-serif",
    "font-size": size,
    fill: "#1c1915",
  }, parent);
  lines.forEach((line, index) => {
    const tspan = el("tspan", { x: cx, dy: index === 0 ? 0 : lineHeight }, node);
    tspan.textContent = line;
  });
  const spinY = caption ? anchorY : anchorY + ((lines.length - 1) * lineHeight) / 2;
  keepTextUpright(node, cx, spinY, shape.turn);
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
  keepTextUpright(text, cx, cy, shape.turn);
}

let plainDraw = false;

function shapePaint(shape) {
  const selected = !plainDraw && shapeIsSelected(shape);
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

function laneAxis(shape) {
  return shape && shape.axis === "column" ? "column" : "row";
}

function laneMin(shape) {
  return laneAxis(shape) === "column" ? { w: 160, h: 220 } : { w: 320, h: 140 };
}

function laneHead(shape) {
  return laneAxis(shape) === "column"
    ? Math.min(48, shape.h / 3)
    : Math.min(112, shape.w / 3);
}

const LANE_BODY = "#f4f7fb";
const LANE_HEAD = "#e6eef6";
const LANE_HEAD_SELECTED = "#d6e4f2";

function laneHex(value) {
  const text = String(value || "").trim().toLowerCase();
  const match = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!match) return "";
  const hex = match[1];
  if (hex.length === 3) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  return `#${hex}`;
}

function hexChannels(hex) {
  const value = parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function mixHex(hex, toward, amount) {
  const left = hexChannels(hex);
  const right = hexChannels(toward);
  const channel = (from, to) => Math.round(from + (to - from) * amount);
  const byte = (n) => n.toString(16).padStart(2, "0");
  return `#${byte(channel(left.r, right.r))}${byte(channel(left.g, right.g))}${byte(channel(left.b, right.b))}`;
}

function laneInk(hex) {
  const { r, g, b } = hexChannels(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.45 ? "#fffcf7" : "#1c1915";
}

function laneFills(shape, selected) {
  const color = laneHex(shape.color);
  if (!color) return { body: LANE_BODY, head: selected ? LANE_HEAD_SELECTED : LANE_HEAD, ink: "#1c1915" };
  const head = selected ? mixHex(color, "#1c1915", 0.14) : color;
  return { body: mixHex(color, "#fffcf7", 0.62), head, ink: laneInk(head) };
}

function selectedLanes() {
  return selectedShapeIds().map(getShape).filter((shape) => shape && shape.type === "lane");
}

function paintSelectedLanes(value) {
  const lanes = selectedLanes();
  if (!lanes.length) return false;
  const color = laneHex(value);
  const stored = color && color !== LANE_HEAD ? color : "";
  let changed = false;
  for (const lane of lanes) {
    if (stored) {
      if (lane.color !== stored) {
        lane.color = stored;
        changed = true;
      }
    } else if (lane.color) {
      delete lane.color;
      changed = true;
    }
  }
  return changed;
}

function shapesInsideLane(lane) {
  return state.doc.shapes.filter((shape) => {
    if (shape.id === lane.id || shape.type === "lane" || shape.type === "legend") return false;
    const cx = shape.x + shape.w / 2;
    const cy = shape.y + shape.h / 2;
    return cx >= lane.x && cx <= lane.x + lane.w && cy >= lane.y && cy <= lane.y + lane.h;
  });
}

function drawLane(parent, shape, paint) {
  const head = laneHead(shape);
  const column = laneAxis(shape) === "column";
  const fills = laneFills(shape, paint.selected);
  el("rect", {
    x: shape.x,
    y: shape.y,
    width: shape.w,
    height: shape.h,
    fill: fills.body,
    stroke: paint.stroke,
    "stroke-width": paint.sw,
  }, parent);
  el("rect", {
    x: shape.x,
    y: shape.y,
    width: column ? shape.w : head,
    height: column ? head : shape.h,
    fill: fills.head,
    stroke: paint.stroke,
    "stroke-width": paint.sw,
  }, parent);
  const maxWidth = Math.max(24, (column ? shape.w : head) - 16);
  const lines = wrapLines(shape.text || ui("lane"), maxWidth, 14).slice(0, 4);
  const lineHeight = 18;
  const cx = column ? shape.x + shape.w / 2 : shape.x + head / 2;
  const cy = column ? shape.y + head / 2 : shape.y + shape.h / 2;
  const text = el("text", {
    x: cx,
    y: cy - ((lines.length - 1) * lineHeight) / 2,
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    "font-family": "Segoe UI, Helvetica Neue, sans-serif",
    "font-size": 14,
    "font-weight": 600,
    fill: fills.ink,
  }, parent);
  lines.forEach((line, index) => {
    const tspan = el("tspan", { x: cx, dy: index === 0 ? 0 : lineHeight }, text);
    tspan.textContent = line;
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
  if (shape.type === "lane") {
    drawLane(parent, shape, paint);
    return;
  }
  if (shape.type === "bus") {
    el("line", {
      x1: x,
      y1: cy,
      x2: right,
      y2: cy,
      fill: "none",
      stroke: paint.stroke,
      "stroke-width": Math.max(paint.sw, 2.5),
      "stroke-linecap": "round",
    }, parent);
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
    if (!shape.bare || paint.selected) {
      el("rect", {
        x, y, width: w, height: h, rx: 2,
        ...common,
        "stroke-dasharray": paint.selected ? "0" : "4 3",
      }, parent);
    }
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
  yes.textContent = ui("yes");
  const no = el("text", {
    x: shape.x + shape.w + 8,
    y: shape.y + shape.h / 2 - 8,
    "text-anchor": "start",
    ...caption,
  }, parent);
  no.textContent = ui("no");
  keepTextUpright(yes, shape.x + shape.w / 2 + 8, shape.y + shape.h + 16, shape.turn);
  keepTextUpright(no, shape.x + shape.w + 8, shape.y + shape.h / 2 - 8, shape.turn);
}

function keepTextUpright(node, x, y, angle) {
  if (!angle) return;
  node.setAttribute("transform", `rotate(${-angle} ${x} ${y})`);
}

function drawShapeBody(parent, shape) {
  const paint = shapePaint(shape);
  const local = contentShape(shape);
  let target = parent;
  if (local.turn) {
    const center = shapeCenter(shape);
    target = el("g", { transform: `rotate(${local.turn} ${center.x} ${center.y})` }, parent);
  }
  drawOutline(target, local, paint);
  if (local.type !== "lane") drawLabel(target, local);
  if (local.type === "decision") drawDecisionSides(target, local);
  const label = shape.type === "legend"
    ? ui("legend")
    : shape.type === "decision"
      ? `${shape.text || labelFor("decision")}. ${ui("decision-exits")}`
      : (shape.text || labelFor(shape.type));
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

function knownEnds(value) {
  return value === "none" || value === "end" || value === "both";
}

function connectorEnds(connector) {
  if (knownEnds(connector.ends)) return connector.ends;
  return wirePair(connector) ? "none" : "end";
}

function shownConnectorEnds() {
  const selected = state.selection && state.selection.kind === "connector"
    ? getConnector(state.selection.id)
    : null;
  if (selected) return knownEnds(selected.ends) ? selected.ends : "auto";
  return state.connectorEnds;
}

const CONNECTOR_INK = "#1c1915";

function connectorStroke(connector, preview) {
  if (preview) return "#7aa0c4";
  return laneHex(connector.color) || CONNECTOR_INK;
}

function selectedConnector() {
  if (!state.selection || state.selection.kind !== "connector") return null;
  return getConnector(state.selection.id);
}

function paintSelectedConnector(value) {
  const connector = selectedConnector();
  if (!connector) return false;
  const color = laneHex(value);
  const stored = color && color !== CONNECTOR_INK ? color : "";
  if (stored) {
    if (connector.color === stored) return false;
    connector.color = stored;
  } else if (connector.color) {
    delete connector.color;
  } else return false;
  return true;
}

function arrowMarkerAttrs(ends) {
  if (ends === "none") return {};
  const attrs = {};
  if (ends === "end" || ends === "both") attrs["marker-end"] = "url(#arrow)";
  if (ends === "both") attrs["marker-start"] = "url(#arrow-start)";
  return attrs;
}

function addArrowMarkers(defs) {
  for (const [suffix, orient] of [["", "auto"], ["-start", "auto-start-reverse"]]) {
    const marker = el("marker", {
      id: "arrow" + suffix,
      viewBox: "0 0 12 10",
      refX: "11",
      refY: "5",
      markerWidth: "12",
      markerHeight: "10",
      orient,
      markerUnits: "userSpaceOnUse",
    }, defs);
    el("path", { d: "M0 0 L12 5 L0 10 Z", fill: "context-stroke" }, marker);
  }
}

function drawConnector(parent, connector, options = {}) {
  const points = connectorPoints(connector);
  if (!points) return;
  const selected = state.selection && state.selection.kind === "connector" && state.selection.id === connector.id;
  const path = el("path", {
    d: toPath(points),
    fill: "none",
    stroke: connectorStroke(connector, options.preview),
    "stroke-width": selected ? 2.4 : 1.7,
    "stroke-linejoin": "round",
    "stroke-linecap": "round",
    "stroke-dasharray": options.preview ? "5 4" : "0",
    "data-connector-id": connector.id,
    ...arrowMarkerAttrs(connectorEnds(connector)),
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
  if (shape.type === "legend" || shape.type === "lane") return false;
  if (state.tool === "connect") return true;
  if (state.gesture && state.gesture.type === "connect") return true;
  if (state.selection && state.selection.kind === "shape" && selectedShapeIds().length === 1 && state.selection.id === shape.id) return true;
  return state.hover && state.hover.kind === "shape" && state.hover.id === shape.id;
}

function drawChrome(parent) {
  if (state.tool === "select" && state.selection && state.selection.kind === "shape" && selectedShapeIds().length === 1) {
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
          "aria-label": ui("resize", { name: shape.text || labelFor(shape.type), corner: ui("corner-" + name) }),
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
  for (const shape of state.doc.shapes) {
    if (shape.type !== "lane") continue;
    const group = el("g", { "data-shape-id": shape.id, role: "group", "aria-label": shape.text || shape.type }, parent);
    drawShapeBody(group, shape);
  }
  for (const connector of state.doc.connectors) drawConnector(parent, connector);
  for (const shape of state.doc.shapes) {
    if (shape.type === "lane") continue;
    const group = el("g", { "data-shape-id": shape.id, role: "group", "aria-label": shape.text || shape.type }, parent);
    drawShapeBody(group, shape);
  }
  if (interactive) drawPreview(parent);
  if (interactive) drawChrome(parent);
}

function drawPreview(parent) {
  const gesture = state.gesture;
  if (!gesture) return;
  if (gesture.type === "marquee" && gesture.armed) {
    const x = Math.min(gesture.start.x, gesture.pointer.x);
    const y = Math.min(gesture.start.y, gesture.pointer.y);
    const w = Math.abs(gesture.pointer.x - gesture.start.x);
    const h = Math.abs(gesture.pointer.y - gesture.start.y);
    el("rect", {
      x, y, width: w, height: h,
      fill: "rgba(24, 78, 134, 0.12)",
      stroke: "#184e86",
      "stroke-width": 1.5 / state.view.scale,
      "stroke-dasharray": `${5 / state.view.scale} ${4 / state.view.scale}`,
    }, parent);
    return;
  }
  if (gesture.type === "bus" && gesture.pointer) {
    const x1 = maybeSnap(Math.min(gesture.sx, gesture.pointer.x));
    const x2 = maybeSnap(Math.max(gesture.sx, gesture.pointer.x));
    const y = maybeSnap(gesture.sy);
    el("line", {
      x1, y1: y, x2, y2: y,
      fill: "none",
      stroke: "#184e86",
      "stroke-width": 2.5,
      "stroke-linecap": "round",
      "stroke-dasharray": "6 4",
    }, parent);
    return;
  }
  if (gesture.type !== "connect") return;
  const shape = getShape(gesture.fromId);
  if (!shape) return;
  const previewEnds = state.connectorEnds === "auto" ? "end" : state.connectorEnds;
  el("path", {
    d: toPath(previewPoints(shape, gesture.fromPort, gesture.pointer)),
    fill: "none",
    stroke: "#7aa0c4",
    "stroke-width": 1.7,
    "stroke-linejoin": "round",
    "stroke-linecap": "round",
    "stroke-dasharray": "5 4",
    ...arrowMarkerAttrs(previewEnds),
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
  addArrowMarkers(defs);

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
  if (modifierHeld(event)) return;
  event.preventDefault();
  event.stopPropagation();
  const shapeTarget = { kind: "shape", id: event.currentTarget.dataset.shapeId };
  if (wantsTextEdit(event, shapeTarget)) {
    editOnUp = shapeTarget;
    state.gesture = null;
    return;
  }
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
  wrap.setPointerCapture(event.pointerId);
  wrap.style.cursor = "crosshair";
  render();
}

function syncPortButtons() {
  if (nativePortDrag) return;
  const needed = new Map();
  for (const shape of state.doc.shapes) {
    if (!portsVisible(shape)) continue;
    for (const port of shapePorts(shape)) needed.set(`${shape.id}:${port}`, { shape, port });
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
      node.draggable = false;
      node.dataset.key = key;
      node.dataset.shapeId = info.shape.id;
      node.dataset.port = info.port;
      node.addEventListener("pointerdown", onPortPointerDown);
      node.addEventListener("dragstart", (dragEvent) => dragEvent.preventDefault());
      wrap.appendChild(node);
    }
    const numbered = /^(?:p|n)(\d+)$/.exec(String(info.port));
    const label = numbered
      ? ui("air-port", { name: info.shape.text || labelFor(info.shape.type), n: numbered[1] })
      : ui("port", { name: info.shape.text || labelFor(info.shape.type), side: ui(info.port) });
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
  busButton.setAttribute("aria-pressed", state.tool === "bus" ? "true" : "false");
  undoButton.disabled = state.past.length === 0;
  redoButton.disabled = state.future.length === 0;
  zoomLabel.textContent = `${Math.round(state.view.scale * 100)}%`;
  const shownEnds = shownConnectorEnds();
  if (endsSelect.value !== shownEnds) endsSelect.value = shownEnds;
  saveButton.classList.toggle("is-dirty", serialize() !== state.savedSnapshot);
  const lanes = selectedLanes();
  laneColorWrap.hidden = lanes.length === 0;
  if (lanes.length && document.activeElement !== laneColorInput) {
    const current = laneHex(lanes[lanes.length - 1].color) || LANE_HEAD;
    if (laneHex(laneColorInput.value) !== current) laneColorInput.value = current;
    for (const swatch of laneSwatches) {
      const wanted = laneHex(swatch.dataset.color) || LANE_HEAD;
      const matched = lanes.every((lane) => (laneHex(lane.color) || LANE_HEAD) === wanted);
      swatch.setAttribute("aria-pressed", matched ? "true" : "false");
    }
  }
  const connector = selectedConnector();
  connectorColorWrap.hidden = !connector;
  if (connector && document.activeElement !== connectorColorInput) {
    const current = laneHex(connector.color) || CONNECTOR_INK;
    if (laneHex(connectorColorInput.value) !== current) connectorColorInput.value = current;
    for (const swatch of connectorSwatches) {
      const wanted = laneHex(swatch.dataset.color) || CONNECTOR_INK;
      swatch.setAttribute("aria-pressed", current === wanted ? "true" : "false");
    }
  }
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
  if (selectedShapeIds().length !== 1) return null;
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
  const ports = shapePorts(shape);
  let best = ports[0];
  let bestDistance = Infinity;
  for (const port of ports) {
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
    if (shape.type === "lane") continue;
    if (options.excludeId && shape.id === options.excludeId) continue;
    const allowed = options.ignoreVisibility || state.tool === "connect" || portsVisible(shape) || hitShapeBody(shape, point);
    if (!allowed) continue;
    for (const port of shapePorts(shape)) {
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
  if (!shape || shape.id === excludeId || shape.type === "lane") return null;
  return { id: shape.id, port: nearestPort(shape, point) };
}

function hitShape(point) {
  for (let pass = 0; pass < 2; pass += 1) {
    for (let index = state.doc.shapes.length - 1; index >= 0; index -= 1) {
      const shape = state.doc.shapes[index];
      const lane = shape.type === "lane";
      if (pass === 0 ? lane : !lane) continue;
      if (hitShapeBody(shape, point)) return shape;
    }
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
  if (state.tool === "connect" || (state.gesture && state.gesture.type === "connect")) return "crosshair";
  const handle = hitHandle(point);
  if (handle === "nw" || handle === "se") return "nwse-resize";
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  if (hitPort(point)) return "crosshair";
  if (state.tool === "select" && hitShape(point)) return "move";
  if (state.tool === "connect" || state.tool === "bus") return "crosshair";
  return "default";
}

function setTool(tool) {
  state.tool = tool;
  wrap.style.cursor = tool === "connect" || tool === "bus" ? "crosshair" : "";
  render();
}

function addShape(master, world) {
  const before = serialize();
  const shape = {
    id: uid(),
    type: master.type,
    x: maybeSnap(world.x - master.w / 2),
    y: maybeSnap(world.y - master.h / 2),
    w: master.w,
    h: master.h,
    text: master.text,
  };
  state.doc.shapes.push(shape);
  wireDroppedShape(shape, world);
  selectShapes([shape.id]);
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
  if (corner.includes("e")) edgeX = maybeSnap(point.x);
  if (corner.includes("s")) edgeY = maybeSnap(point.y);
  if (corner.includes("w")) x = maybeSnap(point.x);
  if (corner.includes("n")) y = maybeSnap(point.y);
  if (shape.type === "bus") {
    y = shape.origin.y;
    edgeY = bottom;
  }
  const min = shape.type === "lane" ? laneMin(shape) : { w: MIN_SIZE, h: MIN_SIZE };
  if (edgeX - x < min.w) {
    if (corner.includes("w")) x = edgeX - min.w;
    else edgeX = x + min.w;
  }
  if (edgeY - y < min.h) {
    if (corner.includes("n")) y = edgeY - min.h;
    else edgeY = y + min.h;
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
    const ids = new Set(selectedShapeIds());
    state.doc.shapes = state.doc.shapes.filter((shape) => !ids.has(shape.id));
    state.doc.connectors = state.doc.connectors.filter((connector) => !ids.has(connector.fromId) && !ids.has(connector.toId));
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
    setStatus(ui("nothing-to-list"));
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
  setStatus(masters.length === 1 ? ui("legend-one") : ui("legend-many", { n: masters.length }));
}

function arrangeDiagram() {
  if (state.gesture) return;
  if (state.editor) closeEditor(true);
  const legends = state.doc.shapes.filter((shape) => shape.type === "legend");
  const lanes = state.doc.shapes.filter((shape) => shape.type === "lane");
  const body = state.doc.shapes.filter((shape) => shape.type !== "legend" && shape.type !== "lane");
  if (!body.length) {
    setStatus(ui("nothing-to-arrange"));
    return;
  }
  const before = serialize();
  state.doc.shapes = body;
  layoutDiagram(state.doc);
  for (const lane of lanes) state.doc.shapes.unshift(lane);
  for (const legend of legends) state.doc.shapes.push(legend);
  if (legends[0]) positionLegend(legends[0], body);
  commitChange(before);
  fitView();
  setStatus(ui("arranged"));
}

function addLane(axis) {
  const column = axis === "column";
  const before = serialize();
  const same = state.doc.shapes.filter((shape) => shape.type === "lane" && laneAxis(shape) === (column ? "column" : "row"));
  const other = state.doc.shapes.filter((shape) => shape.type === "lane" && laneAxis(shape) !== (column ? "column" : "row"));
  let x = 40;
  let y = 40;
  let w = column ? 220 : 760;
  let h = column ? 520 : 180;
  if (same.length) {
    if (column) {
      const right = same.reduce((best, shape) => (shape.x + shape.w > best.x + best.w ? shape : best));
      x = right.x + right.w;
      y = Math.min(...same.map((shape) => shape.y));
      w = right.w;
      h = Math.max(...same.map((shape) => shape.y + shape.h)) - y;
    } else {
      const bottom = same.reduce((best, shape) => (shape.y + shape.h > best.y + best.h ? shape : best));
      x = Math.min(...same.map((shape) => shape.x));
      y = bottom.y + bottom.h;
      w = Math.max(...same.map((shape) => shape.x + shape.w)) - x;
      h = bottom.h;
    }
  } else if (other.length) {
    const left = Math.min(...other.map((shape) => shape.x));
    const top = Math.min(...other.map((shape) => shape.y));
    const right = Math.max(...other.map((shape) => shape.x + shape.w));
    const bottom = Math.max(...other.map((shape) => shape.y + shape.h));
    if (column) {
      x = right;
      y = top;
      h = bottom - top;
    } else {
      x = left;
      y = bottom;
      w = right - left;
    }
  }
  const shape = {
    id: uid(),
    type: "lane",
    x,
    y,
    w,
    h,
    text: ui(column ? "column-name" : "lane-name", { n: same.length + 1 }),
    axis: column ? "column" : "row",
  };
  state.doc.shapes.unshift(shape);
  selectShapes([shape.id]);
  commitChange(before);
  hideConfirm();
  setStatus(ui(column ? "lane-added-column" : "lane-added-row"));
  render();
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

function setSnap(on, announce) {
  state.snap = Boolean(on);
  const button = document.getElementById("snap");
  if (button) button.setAttribute("aria-pressed", state.snap ? "true" : "false");
  try {
    localStorage.setItem("misio-snap", state.snap ? "on" : "off");
  } catch (error) {
    // The button still shows the choice if storage is blocked.
  }
  if (announce) setStatus(ui(state.snap ? "snap-on" : "snap-off"));
}

function nudge(dx, dy) {
  const ids = new Set(selectedShapeIds());
  if (!ids.size) return;
  for (const id of [...ids]) {
    const shape = getShape(id);
    if (!shape || shape.type !== "lane") continue;
    for (const inner of shapesInsideLane(shape)) ids.add(inner.id);
  }
  const before = serialize();
  for (const id of ids) {
    const shape = getShape(id);
    shape.x = maybeSnap(shape.x + dx);
    shape.y = maybeSnap(shape.y + dy);
  }
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
    if (shape.type === "lane") {
      const head = laneHead(shape);
      const column = laneAxis(shape) === "column";
      const width = Math.max(48, (column ? shape.w : head) * state.view.scale - 12);
      const height = Math.max(28, Math.min((column ? head : shape.h) * state.view.scale - 8, 80));
      textarea.style.left = `${origin.x + 6}px`;
      textarea.style.top = column
        ? `${origin.y + 4}px`
        : `${origin.y + (shape.h * state.view.scale - height) / 2}px`;
      textarea.style.width = `${width}px`;
      textarea.style.height = `${height}px`;
      return;
    }
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
  if (!master && raw.type !== "legend" && raw.type !== "lane") return null;
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
  if (shape.type === "text" && raw.bare) shape.bare = true;
  if (shapeAngle(raw)) shape.rotation = shapeAngle(raw);
  if (shape.type === "lane") {
    shape.axis = raw.axis === "column" ? "column" : "row";
    const color = laneHex(raw.color);
    if (color) shape.color = color;
    const min = laneMin(shape);
    shape.w = Math.max(min.w, shape.w);
    shape.h = Math.max(min.h, shape.h);
  }
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
  if (knownEnds(raw.ends)) connector.ends = raw.ends;
  const color = laneHex(raw.color);
  if (color && color !== CONNECTOR_INK) connector.color = color;
  if (!ids.has(connector.fromId) || !ids.has(connector.toId)) return null;
  if (connector.fromId === connector.toId) return null;
  if (!knownPort(connector.fromPort) || !knownPort(connector.toPort)) return null;
  bumpId(connector.id);
  return connector;
}

function openText(text) {
  let data;
  try {
    data = JSON.parse(String(text).replace(/^\uFEFF/, ""));
  } catch (error) {
    setStatus(ui("bad-file"));
    return;
  }
  if (!data || !Array.isArray(data.shapes) || !Array.isArray(data.connectors)) {
    setStatus(ui("bad-file"));
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
  persistDraft();
  hideConfirm();
  setStatus(ui("opened"));
  render();
}

function download(name, body, type) {
  const bytes = body instanceof Uint8Array ? body : null;
  lastDownload = { name, text: bytes ? "" : String(body), type, bytes };
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([bytes || body], { type }));
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function nearestPortName(shape, x, y, toward) {
  let best = shapePorts(shape)[0] || "bottom";
  let bestScore = Infinity;
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  const vx = toward ? toward.x - cx : 0;
  const vy = toward ? toward.y - cy : 0;
  const span = Math.hypot(vx, vy) || 1;
  for (const port of shapePorts(shape)) {
    const point = portPoint(shape, port);
    let score = Math.hypot(point.x - x, point.y - y);
    if (toward) {
      const [dx, dy] = portVectorOf(shape, port);
      score -= ((dx * vx + dy * vy) / span) * Math.min(shape.w, shape.h) * 0.45;
    }
    if (score < bestScore) {
      best = port;
      bestScore = score;
    }
  }
  return best;
}

function shapeNearPoint(shapes, x, y) {
  let best = null;
  let bestDistance = 260;
  for (const shape of shapes) {
    if (shape.type === "text") continue;
    const nearX = Math.max(shape.x, Math.min(x, shape.x + shape.w));
    const nearY = Math.max(shape.y, Math.min(y, shape.y + shape.h));
    const distance = Math.hypot(x - nearX, y - nearY);
    if (distance < bestDistance) {
      best = shape;
      bestDistance = distance;
    }
  }
  return best;
}

function rasterShape(shape) {
  const width = Math.max(1, Math.ceil(shape.w));
  const height = Math.max(1, Math.ceil(shape.h));
  const svgNode = document.createElementNS(SVGNS, "svg");
  svgNode.setAttribute("xmlns", SVGNS);
  svgNode.setAttribute("width", width);
  svgNode.setAttribute("height", height);
  svgNode.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const local = { ...shape, x: 0, y: 0, w: width, h: height };
  plainDraw = true;
  try {
    drawShapeBody(svgNode, local);
  } finally {
    plainDraw = false;
  }
  const markup = new XMLSerializer().serializeToString(svgNode);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext("2d");
      context.fillStyle = "#fffcf7";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(async (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

function openForeignVisio(result) {
  const shapes = (result.shapes || []).map((raw) => {
    const shape = {
      id: String(raw.id),
      type: TYPES.has(raw.type) ? raw.type : "process",
      x: raw.x,
      y: raw.y,
      w: Math.max(MIN_SIZE, raw.w),
      h: Math.max(raw.type === "bus" ? 20 : MIN_SIZE, raw.h),
      text: raw.text || "",
    };
    if (shape.type === "text" && raw.bare) {
      shape.bare = true;
      const wide = Math.min(280, Math.max(88, shape.text.length * 8));
      shape.x += shape.w / 2 - wide / 2;
      shape.y += shape.h / 2 - 16;
      shape.w = wide;
      shape.h = 32;
    }
    if (shape.type === "lane" && raw.fill && raw.fill !== "#e6eef6" && raw.fill !== "#fffcf7") shape.color = raw.fill;
    return shape;
  });
  const connectors = [];
  for (const raw of result.connectors || []) {
    const from = shapes.find((shape) => shape.id === String(raw.fromId)) || shapeNearPoint(shapes, raw.x1, raw.y1);
    const to = shapes.find((shape) => shape.id === String(raw.toId)) || shapeNearPoint(shapes, raw.x2, raw.y2);
    if (!from || !to || from.id === to.id) continue;
    const connector = {
      id: "c" + raw.id,
      fromId: from.id,
      fromPort: nearestPortName(from, raw.x1, raw.y1, { x: raw.x2, y: raw.y2 }),
      toId: to.id,
      toPort: nearestPortName(to, raw.x2, raw.y2, { x: raw.x1, y: raw.y1 }),
      text: raw.text || "",
    };
    if (raw.color && raw.color !== CONNECTOR_INK) connector.color = raw.color;
    connectors.push(connector);
  }
  openText(JSON.stringify({ app: "Misio", title: "Misio", version: 1, shapes, connectors }));
}

async function importVisio(buffer) {
  const result = await window.MisioVisio.read(buffer);
  if (result.misio) openText(result.misio);
  else openForeignVisio(result);
  setStatus(ui(result.pages > 1 ? "opened-visio-page" : "opened-visio"));
}

async function exportVisio(options) {
  const saveFile = !options || options.download !== false;
  const embed = !options || options.embed !== false;
  if (state.editor) closeEditor(true);
  if (!state.doc.shapes.length && !state.doc.connectors.length) {
    setStatus(ui("visio-empty"));
    return null;
  }
  const doc = JSON.parse(serialize());
  const images = {};
  for (const shape of doc.shapes) {
    if (shape.type === "legend" || symbolPack(shape.type)) {
      const png = await rasterShape(shape);
      if (png) images[shape.id] = png;
    }
  }
  const shapes = doc.shapes.map((shape) => ({
    ...shape,
    fill: shape.type === "lane" ? laneFills(shape, false).head : "#fffcf7",
    line: "#1c1915",
  }));
  const connectors = doc.connectors.map((connector) => ({
    ...connector,
    ends: connectorEnds(connector),
    color: connector.color || CONNECTOR_INK,
    points: connectorPoints(connector) || [],
  })).filter((connector) => connector.points.length >= 2);
  let bytes;
  try {
    bytes = window.MisioVisio.write({ json: serialize(), shapes, connectors, images }, { embed });
  } catch (error) {
    setStatus(ui("bad-visio"));
    return null;
  }
  if (!saveFile) return bytes;
  download("misio.vsdx", bytes, "application/vnd.ms-visio.drawing");
  state.savedSnapshot = serialize();
  persistDraft();
  updateChrome();
  setStatus(ui("saved-visio"));
  return bytes;
}

function saveDoc() {
  if (state.editor) closeEditor(true);
  const text = serialize();
  download("misio.json", text, "application/json");
  state.savedSnapshot = text;
  persistDraft();
  updateChrome();
  setStatus(ui("saved"));
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
  addArrowMarkers(el("defs", {}, out));
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
  setStatus(ui("exported-svg"));
}

function editTargetAt(world) {
  const shape = hitShape(world);
  if (shape && shape.type !== "legend") return { kind: "shape", id: shape.id };
  const connector = hitConnector(world);
  if (connector) return { kind: "connector", id: connector.id };
  return null;
}

const heldKeys = new Set();

function modifierHeld(event) {
  return Boolean(
    (event && (event.shiftKey || event.ctrlKey || event.metaKey))
    || heldKeys.has("Control")
    || heldKeys.has("Meta")
    || heldKeys.has("Shift")
  );
}

function wantsTextEdit(event, target) {
  if (modifierHeld(event)) return false;
  if (!target) {
    lastEditPress = null;
    return false;
  }
  const now = performance.now();
  const repeat = event.detail >= 2 || Boolean(
    lastEditPress
    && now - lastEditPress.time < 500
    && lastEditPress.kind === target.kind
    && lastEditPress.id === target.id
  );
  lastEditPress = { kind: target.kind, id: target.id, time: now };
  return repeat;
}

function shapesTouching(a, b) {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x);
  const y2 = Math.max(a.y, b.y);
  return state.doc.shapes.filter((shape) => {
    if (shape.type === "lane") return false;
    return shape.x < x2 && shape.x + shape.w > x1 && shape.y < y2 && shape.y + shape.h > y1;
  });
}

function marqueeGesture(world, event, base, laneId) {
  return {
    type: "marquee",
    start: { x: world.x, y: world.y },
    pointer: { x: world.x, y: world.y },
    client: { x: event.clientX, y: event.clientY },
    pointerId: event.pointerId,
    armed: false,
    base: base.slice(),
    laneId: laneId || null,
  };
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
  const world = clientToWorld(event.clientX, event.clientY);
  const target = editTargetAt(world);
  if (wantsTextEdit(event, target)) {
    editOnUp = target;
    state.gesture = null;
    event.preventDefault();
    return;
  }
  if (state.editor) closeEditor(true);
  if (state.tool === "bus") {
    state.gesture = { type: "bus", sx: maybeSnap(world.x), sy: maybeSnap(world.y), pointer: world, before: serialize() };
    wrap.setPointerCapture(event.pointerId);
    render();
    return;
  }
  if (state.tool === "connect") {
    const shape = hitShape(world);
    const port = hitPort(world) || (shape && shape.type !== "lane" ? { id: shape.id, port: nearestPort(shape, world) } : null);
    if (port) {
      state.gesture = { type: "connect", fromId: port.id, fromPort: port.port, pointer: world, before: serialize() };
      state.selection = { kind: "shape", id: port.id };
      wrap.setPointerCapture(event.pointerId);
      wrap.style.cursor = "crosshair";
      render();
    }
    return;
  }
  const handle = hitHandle(world);
  if (handle) {
    const shape = getShape(state.selection.id);
    state.gesture = { type: "resize", id: shape.id, corner: handle, before: serialize(), origin: { x: shape.x, y: shape.y, w: shape.w, h: shape.h } };
    shape.origin = state.gesture.origin;
    wrap.setPointerCapture(event.pointerId);
    return;
  }
  const port = hitPort(world);
  if (port && state.tool === "select" && !modifierHeld(event)) {
    state.gesture = { type: "connect", fromId: port.id, fromPort: port.port, pointer: world, before: serialize() };
    state.selection = { kind: "shape", id: port.id };
    wrap.setPointerCapture(event.pointerId);
    render();
    return;
  }
  if (state.tool === "select") {
    const shape = hitShape(world);
    if (shape) {
      if (modifierHeld(event) && shape.type === "lane") {
        state.gesture = marqueeGesture(world, event, selectedShapeIds(), shape.id);
        render();
        return;
      }
      let ids = selectedShapeIds();
      const addToSelection = modifierHeld(event);
      if (addToSelection) {
        ids = ids.includes(shape.id) ? ids.filter((id) => id !== shape.id) : ids.concat(shape.id);
        selectShapes(ids);
        if (!ids.includes(shape.id)) {
          state.gesture = null;
          render();
          return;
        }
      } else if (!ids.includes(shape.id)) {
        ids = [shape.id];
        selectShapes(ids);
      }
      if (addToSelection && ids.length > 1) setStatus(ui("selected-many", { n: ids.length }));
      const origins = {};
      const moving = new Set(selectedShapeIds());
      for (const id of selectedShapeIds()) {
        const item = getShape(id);
        origins[id] = { x: item.x, y: item.y };
        if (item.type !== "lane") continue;
        for (const inner of shapesInsideLane(item)) {
          if (moving.has(inner.id)) continue;
          moving.add(inner.id);
          origins[inner.id] = { x: inner.x, y: inner.y };
        }
      }
      state.gesture = {
        type: "move",
        id: shape.id,
        origins,
        start: { x: world.x, y: world.y },
        pointer: { x: event.clientX, y: event.clientY },
        pointerId: event.pointerId,
        before: serialize(),
        armed: false,
      };
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
    if (modifierHeld(event)) {
      state.gesture = marqueeGesture(world, event, selectedShapeIds(), null);
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
  if (gesture.type === "marquee") {
    if (!gesture.armed) {
      const dx = event.clientX - gesture.client.x;
      const dy = event.clientY - gesture.client.y;
      if (dx * dx + dy * dy < 16) return;
      gesture.armed = true;
      wrap.setPointerCapture(gesture.pointerId);
    }
    gesture.pointer = world;
    render();
    return;
  }
  if (gesture.type === "move") {
    if (!gesture.armed) {
      const dx = event.clientX - gesture.pointer.x;
      const dy = event.clientY - gesture.pointer.y;
      if (dx * dx + dy * dy < 16) return;
      gesture.armed = true;
      wrap.setPointerCapture(gesture.pointerId);
    }
    const dx = world.x - gesture.start.x;
    const dy = world.y - gesture.start.y;
    for (const [id, origin] of Object.entries(gesture.origins)) {
      const shape = getShape(id);
      if (!shape) continue;
      shape.x = maybeSnap(origin.x + dx);
      shape.y = maybeSnap(origin.y + dy);
    }
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
    return;
  }
  if (gesture.type === "bus") {
    gesture.pointer = world;
    render();
  }
}

function applyConnectorEnds(value) {
  if (value !== "auto" && !knownEnds(value)) return;
  state.connectorEnds = value;
  const selected = state.selection && state.selection.kind === "connector"
    ? getConnector(state.selection.id)
    : null;
  if (!selected) {
    setStatus(ui("ends-next-" + value));
    return;
  }
  const before = serialize();
  if (value === "auto") delete selected.ends;
  else selected.ends = value;
  commitChange(before);
  render();
  setStatus(ui("ends-set-" + value));
}

function busVertical(shape) {
  const angle = shapeAngle(shape);
  return angle === 90 || angle === 270;
}

function busAt(point) {
  let best = null;
  let bestDistance = 22;
  for (const shape of state.doc.shapes) {
    if (shape.type !== "bus") continue;
    const vertical = busVertical(shape);
    if (vertical) {
      if (point.y < shape.y || point.y > shape.y + shape.h) continue;
    } else if (point.x < shape.x || point.x > shape.x + shape.w) continue;
    const center = shapeCenter(shape);
    const distance = vertical ? Math.abs(point.x - center.x) : Math.abs(point.y - center.y);
    if (distance <= bestDistance) {
      best = shape;
      bestDistance = distance;
    }
  }
  return best;
}

function tapOnBus(bus, point, fromId) {
  const vertical = busVertical(bus);
  const center = shapeCenter(bus);
  const along = vertical
    ? Math.min(Math.max(point.y, bus.y + 8), bus.y + bus.h - 8)
    : Math.min(Math.max(point.x, bus.x + 8), bus.x + bus.w - 8);
  const cx = vertical ? center.x : along;
  const cy = vertical ? along : center.y;
  const source = getShape(fromId);
  const port = vertical
    ? ((source ? source.x + source.w / 2 : point.x) <= cx ? "left" : "right")
    : ((source ? source.y + source.h / 2 : point.y) <= cy ? "top" : "bottom");
  const existing = state.doc.shapes.find((shape) =>
    shape.type === "arei-node"
    && Math.abs(shape.x + shape.w / 2 - cx) <= 14
    && Math.abs(shape.y + shape.h / 2 - cy) <= 14);
  if (existing) return { id: existing.id, port };
  const node = {
    id: uid(),
    type: "arei-node",
    x: cx - 20,
    y: cy - 20,
    w: 40,
    h: 40,
    text: "",
  };
  state.doc.shapes.push(node);
  return { id: node.id, port };
}

function wireDroppedShape(shape, point) {
  if (shape.type === "bus" || shape.type === "arei-node" || shape.type === "legend" || shape.type === "lane") return;
  const bus = busAt(point);
  if (!bus) return;
  const center = shapeCenter(bus);
  const vertical = busVertical(bus);
  const gap = GRID;
  let fromPort = "bottom";
  if (vertical) {
    const left = point.x <= center.x;
    shape.x = left ? maybeSnap(center.x - gap - shape.w) : maybeSnap(center.x + gap);
    shape.y = maybeSnap(point.y - shape.h / 2);
    fromPort = left ? "right" : "left";
  } else {
    const above = point.y <= center.y;
    shape.x = maybeSnap(point.x - shape.w / 2);
    shape.y = above ? maybeSnap(center.y - gap - shape.h) : maybeSnap(center.y + gap);
    fromPort = above ? "bottom" : "top";
  }
  const tap = tapOnBus(bus, shapeCenter(shape), shape.id);
  state.doc.connectors.push({
    id: uid(),
    fromId: shape.id,
    fromPort,
    toId: tap.id,
    toPort: tap.port,
    text: "",
  });
}

function resolveTarget(fromId, point) {
  const direct = portTarget(point, fromId);
  const directShape = direct && getShape(direct.id);
  if (directShape && directShape.type === "bus") return tapOnBus(directShape, point, fromId);
  if (direct) return direct;
  const bus = busAt(point);
  if (bus && bus.id !== fromId) return tapOnBus(bus, point, fromId);
  return null;
}

function addConnector(fromId, fromPort, target) {
  if (!target || target.id === fromId || !getShape(fromId) || !getShape(target.id)) return null;
  const connector = {
    id: uid(),
    fromId,
    fromPort,
    toId: target.id,
    toPort: target.port,
    text: "",
  };
  if (knownEnds(state.connectorEnds)) connector.ends = state.connectorEnds;
  state.doc.connectors.push(connector);
  state.selection = { kind: "connector", id: connector.id };
  return connector;
}

function finishGesture() {
  const gesture = state.gesture;
  if (!gesture) return;
  state.gesture = null;
  if (gesture.type === "move" || gesture.type === "resize") {
    const shape = getShape(gesture.id);
    if (shape) delete shape.origin;
    commitChange(gesture.before);
  } else if (gesture.type === "marquee") {
    if (gesture.armed) {
      const ids = gesture.base.slice();
      for (const shape of shapesTouching(gesture.start, gesture.pointer)) {
        if (!ids.includes(shape.id)) ids.push(shape.id);
      }
      selectShapes(ids);
      if (ids.length > 1) setStatus(ui("selected-many", { n: ids.length }));
    } else if (gesture.laneId) {
      const ids = gesture.base.includes(gesture.laneId)
        ? gesture.base.filter((id) => id !== gesture.laneId)
        : gesture.base.concat(gesture.laneId);
      selectShapes(ids);
    }
  } else if (gesture.type === "connect" && !nativePortDrag) {
    const target = resolveTarget(gesture.fromId, gesture.pointer);
    if (addConnector(gesture.fromId, gesture.fromPort, target)) commitChange(gesture.before);
  } else if (gesture.type === "bus") {
    const end = gesture.pointer || { x: gesture.sx, y: gesture.sy };
    const x1 = maybeSnap(Math.min(gesture.sx, end.x));
    const x2 = maybeSnap(Math.max(gesture.sx, end.x));
    if (x2 - x1 >= MIN_SIZE) {
      const shape = {
        id: uid(),
        type: "bus",
        x: x1,
        y: maybeSnap(gesture.sy) - 20,
        w: x2 - x1,
        h: 40,
        text: "",
      };
      state.doc.shapes.push(shape);
      selectShapes([shape.id]);
      commitChange(gesture.before);
      setStatus(ui("bus-added"));
    }
  }
  nativePortDrag = false;
  state.hover = null;
  wrap.style.cursor = "";
  render();
}

function onPointerUp(event) {
  if (editOnUp) {
    const target = editOnUp;
    editOnUp = null;
    state.gesture = null;
    if (wrap.hasPointerCapture(event.pointerId)) wrap.releasePointerCapture(event.pointerId);
    openEditor(target.kind, target.id);
    return;
  }
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
let editOnUp = null;
let lastEditPress = null;

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
  summary.dataset.uiTitle = nested ? "group-symbols" : "group-group";
  summary.title = ui(summary.dataset.uiTitle);
  const list = document.createElement("div");
  list.className = "symbol-group-items";
  for (const node of nodes) list.appendChild(node);
  details.append(summary, list);
  return details;
}

function copiedRecords() {
  const ids = new Set(selectedShapeIds());
  if (!ids.size) return null;
  return {
    shapes: state.doc.shapes.filter((shape) => ids.has(shape.id)).map(shapeRecord),
    connectors: state.doc.connectors
      .filter((connector) => ids.has(connector.fromId) && ids.has(connector.toId))
      .map(connectorRecord),
  };
}

function stampCopies(records, dx, dy) {
  const before = serialize();
  const map = new Map();
  const ids = [];
  for (const raw of records.shapes) {
    const shape = {
      id: uid(),
      type: raw.type,
      x: maybeSnap(Number(raw.x) + dx),
      y: maybeSnap(Number(raw.y) + dy),
      w: raw.w,
      h: raw.h,
      text: raw.text,
    };
    if (raw.type === "lane") {
      shape.axis = raw.axis === "column" ? "column" : "row";
      const color = laneHex(raw.color);
      if (color) shape.color = color;
    }
    if (shapeAngle(raw)) shape.rotation = shapeAngle(raw);
    map.set(String(raw.id), shape.id);
    state.doc.shapes.push(shape);
    ids.push(shape.id);
  }
  for (const raw of records.connectors) {
    const fromId = map.get(String(raw.fromId));
    const toId = map.get(String(raw.toId));
    if (!fromId || !toId) continue;
    const connector = {
      id: uid(),
      fromId,
      fromPort: raw.fromPort,
      toId,
      toPort: raw.toPort,
      text: raw.text,
    };
    if (knownEnds(raw.ends)) connector.ends = raw.ends;
    const color = laneHex(raw.color);
    if (color && color !== CONNECTOR_INK) connector.color = color;
    state.doc.connectors.push(connector);
  }
  selectShapes(ids);
  commitChange(before);
  render();
  return ids.length;
}

function copySelection() {
  const records = copiedRecords();
  if (!records) {
    setStatus(ui("copy-none"));
    return;
  }
  state.clipboard = records;
  const count = records.shapes.length;
  setStatus(count === 1 ? ui("copied-one") : ui("copied-many", { n: count }));
}

function pasteClipboard() {
  if (!state.clipboard || !state.clipboard.shapes.length) {
    setStatus(ui("paste-none"));
    return;
  }
  const count = stampCopies(state.clipboard, GRID, GRID);
  for (const shape of state.clipboard.shapes) {
    shape.x += GRID;
    shape.y += GRID;
  }
  setStatus(count === 1 ? ui("pasted-one") : ui("pasted-many", { n: count }));
}

function duplicateSelection() {
  const records = copiedRecords();
  if (!records) {
    setStatus(ui("duplicate-none"));
    return;
  }
  const count = stampCopies(records, GRID, GRID);
  setStatus(count === 1 ? ui("duplicated-one") : ui("duplicated-many", { n: count }));
}

function rotateSelection(clockwise) {
  const shapes = selectedShapeIds().map(getShape).filter((shape) => shape && shape.type !== "lane" && shape.type !== "legend");
  if (!shapes.length) {
    setStatus(ui("rotate-none"));
    return;
  }
  const before = serialize();
  const step = clockwise ? 90 : 270;
  for (const shape of shapes) {
    const center = shapeCenter(shape);
    const w = shape.h;
    const h = shape.w;
    shape.w = w;
    shape.h = h;
    shape.x = center.x - w / 2;
    shape.y = center.y - h / 2;
    const angle = (shapeAngle(shape) + step) % 360;
    if (angle) shape.rotation = angle;
    else delete shape.rotation;
  }
  commitChange(before);
  render();
  setStatus(ui(clockwise ? "rotate-cw" : "rotate-ccw"));
}

function alignLeft() {
  const shapes = selectedShapeIds().map(getShape).filter(Boolean);
  if (shapes.length < 2) {
    setStatus(ui("align-none"));
    return;
  }
  const before = serialize();
  const left = Math.min(...shapes.map((shape) => shape.x));
  for (const shape of shapes) shape.x = left;
  commitChange(before);
  render();
  setStatus(ui("aligned"));
}

function spaceEven() {
  const shapes = selectedShapeIds().map(getShape).filter(Boolean);
  if (shapes.length < 2) {
    setStatus(ui("space-none"));
    return;
  }
  const spanX = Math.max(...shapes.map((shape) => shape.x + shape.w / 2)) - Math.min(...shapes.map((shape) => shape.x + shape.w / 2));
  const spanY = Math.max(...shapes.map((shape) => shape.y + shape.h / 2)) - Math.min(...shapes.map((shape) => shape.y + shape.h / 2));
  const horizontal = spanX >= spanY;
  const sorted = [...shapes].sort((a, b) => horizontal
    ? (a.x + a.w / 2) - (b.x + b.w / 2)
    : (a.y + a.h / 2) - (b.y + b.h / 2));
  const start = horizontal ? sorted[0].x + sorted[0].w / 2 : sorted[0].y + sorted[0].h / 2;
  const end = horizontal
    ? sorted[sorted.length - 1].x + sorted[sorted.length - 1].w / 2
    : sorted[sorted.length - 1].y + sorted[sorted.length - 1].h / 2;
  const before = serialize();
  sorted.forEach((shape, index) => {
    const at = start + (end - start) * (sorted.length === 1 ? 0 : index / (sorted.length - 1));
    if (horizontal) shape.x = maybeSnap(at - shape.w / 2);
    else shape.y = maybeSnap(at - shape.h / 2);
  });
  if (!commitChange(before)) {
    setStatus(ui("already-spaced"));
    return;
  }
  render();
  setStatus(horizontal ? ui("spaced-across") : ui("spaced-down"));
}

function persistDraft() {
  try {
    if (!state.doc.shapes.length && !state.doc.connectors.length) {
      localStorage.removeItem("misio-draft");
      return;
    }
    localStorage.setItem("misio-draft", JSON.stringify({
      text: serialize(),
      saved: state.savedSnapshot,
    }));
  } catch (error) {
    // The drawing still works if the browser refuses storage.
  }
}

function restoreDraft() {
  let raw = "";
  try {
    raw = localStorage.getItem("misio-draft") || "";
  } catch (error) {
    return;
  }
  if (!raw) return;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    return;
  }
  if (!data || typeof data.text !== "string") return;
  openText(data.text);
  state.past = [];
  state.future = [];
  if (typeof data.saved === "string") state.savedSnapshot = data.saved;
  persistDraft();
  updateChrome();
  setStatus(ui("restored"));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]));
}

function diagramTitle() {
  const text = state.doc.shapes.find((shape) => shape.type === "text" && String(shape.text || "").trim());
  if (!text) return "Misio";
  return String(text.text).split("\n")[0].trim() || "Misio";
}

function exportPdf() {
  if (state.editor) closeEditor(true);
  if (!state.doc.shapes.length) {
    setStatus(ui("export-none"));
    return;
  }
  let frame = document.getElementById("print-frame");
  if (!frame) {
    frame = document.createElement("iframe");
    frame.id = "print-frame";
    frame.setAttribute("title", "Print");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
  }
  const title = escapeHtml(diagramTitle());
  const svg = exportSvgString().replace(/^<\?xml[^>]*>\s*/, "");
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>
    @page { size: A3 landscape; margin: 12mm; }
    html, body { margin: 0; background: #fff; color: #1c1915; font-family: "Segoe UI", "Helvetica Neue", sans-serif; }
    h1 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
    svg { width: 100%; height: auto; max-height: 250mm; }
  </style></head><body><h1>${title}</h1>${svg}<` + `script>window.addEventListener("load", function () { window.print(); });<` + `/script></body></html>`);
  doc.close();
  setStatus(ui("pdf-ready"));
  window.setTimeout(() => {
    try {
      if (window.Misio && window.Misio.skipPrint) return;
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (error) {
      setStatus(ui("pdf-failed"));
    }
  }, 50);
}

function mastersIn(categoryId, query) {
  return MASTERS.filter((master) => master.category === categoryId && masterMatches(master, query)).map(masterButton);
}

function masterSearchText(master) {
  const bits = [master.name, master.type, labelFor(master.type)];
  const table = window.MisioLang || {};
  for (const lang of Object.values(table)) {
    if (lang && lang[master.type]) bits.push(lang[master.type]);
  }
  return bits.join(" ").toLowerCase();
}

function masterMatches(master, query) {
  if (!query) return true;
  const haystack = masterSearchText(master);
  return query.split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

function buildMasters() {
  const query = shapeSearch.value.trim().toLowerCase();
  mastersEl.replaceChildren();
  for (const master of MASTERS) {
    if (master.category && master.category !== "standard") continue;
    if (masterMatches(master, query)) mastersEl.appendChild(masterButton(master));
  }
  const areiSections = window.MisioArei.categories.map((category) => {
    const nodes = mastersIn(category.id, query);
    if (!nodes.length) return null;
    const group = symbolGroup(category.name, nodes, true, category.id);
    if (query) group.open = true;
    return group;
  }).filter(Boolean);
  if (areiSections.length) {
    const arei = symbolGroup("AREI", areiSections, false, "arei");
    if (query) arei.open = true;
    mastersEl.appendChild(arei);
  }
  for (const pack of [window.MisioNetwork, window.MisioVehicle, window.MisioAir, window.MisioWater]) {
    for (const category of pack.categories) {
      const nodes = mastersIn(category.id, query);
      if (!nodes.length) continue;
      const group = symbolGroup(category.name, nodes, false, category.id);
      if (query) group.open = true;
      mastersEl.appendChild(group);
    }
  }
  if (!mastersEl.children.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.dataset.ui = "no-match";
    empty.textContent = ui("no-match");
    mastersEl.appendChild(empty);
  }
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || tag === "BUTTON" || target.getAttribute("role") === "button";
}

function onKeyDown(event) {
  if (event.key === "Control" || event.key === "Shift" || event.key === "Meta") heldKeys.add(event.key);
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
  const field = event.target && (event.target.tagName === "INPUT" || event.target.tagName === "SELECT");
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && !field) {
    event.preventDefault();
    copySelection();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && !field) {
    event.preventDefault();
    pasteClipboard();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && !field) {
    event.preventDefault();
    duplicateSelection();
    return;
  }
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
  if (event.key === "b" || event.key === "B") {
    setTool("bus");
    return;
  }
  if (event.key === "l" || event.key === "L") {
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    addLane(event.shiftKey ? "column" : "row");
    return;
  }
  if (event.key === "r" || event.key === "R") {
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    rotateSelection(!event.shiftKey);
    return;
  }
  const step = state.snap ? GRID : 1;
  if (event.key === "ArrowLeft") { event.preventDefault(); nudge(-step, 0); }
  else if (event.key === "ArrowRight") { event.preventDefault(); nudge(step, 0); }
  else if (event.key === "ArrowUp") { event.preventDefault(); nudge(0, -step); }
  else if (event.key === "ArrowDown") { event.preventDefault(); nudge(0, step); }
}

function onDoubleClick(event) {
  if (event.target === textarea || modifierHeld(event)) return;
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
busButton.addEventListener("click", () => setTool("bus"));
endsSelect.addEventListener("change", () => applyConnectorEnds(endsSelect.value));
document.getElementById("align-left").addEventListener("click", alignLeft);
document.getElementById("space-even").addEventListener("click", spaceEven);
document.getElementById("snap").addEventListener("click", () => setSnap(!state.snap, true));
document.getElementById("rotate").addEventListener("click", (event) => rotateSelection(!event.shiftKey));
setSnap(state.snap, false);
document.getElementById("export-pdf").addEventListener("click", exportPdf);
document.getElementById("report").addEventListener("click", () => {
  document.getElementById("report-note").textContent = "";
  document.getElementById("report-dialog").showModal();
  document.getElementById("report-text").focus();
});
document.getElementById("report-cancel").addEventListener("click", () => {
  document.getElementById("report-dialog").close();
});
document.getElementById("report-form").addEventListener("submit", sendReport);

async function sendReport(event) {
  event.preventDefault();
  const note = document.getElementById("report-note");
  note.textContent = "";
  const payload = {
    kind: document.getElementById("report-kind").value,
    name: document.getElementById("report-name").value,
    text: document.getElementById("report-text").value,
  };
  try {
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(String(response.status));
    document.getElementById("report-text").value = "";
    document.getElementById("report-name").value = "";
    document.getElementById("report-dialog").close();
    setStatus(ui("report-sent"));
  } catch (error) {
    note.textContent = ui("report-failed");
  }
}
shapeSearch.addEventListener("input", () => buildMasters());
undoButton.addEventListener("click", undo);
redoButton.addEventListener("click", redo);
document.getElementById("arrange").addEventListener("click", arrangeDiagram);
document.getElementById("lane").addEventListener("click", (event) => addLane(event.shiftKey ? "column" : "row"));
for (const swatch of laneSwatches) {
  swatch.addEventListener("click", () => {
    const before = serialize();
    if (!paintSelectedLanes(swatch.dataset.color)) return;
    commitChange(before);
    render();
    setStatus(ui("lane-colored"));
  });
}
function finishLaneColor() {
  if (colorBefore == null) return;
  const before = colorBefore;
  colorBefore = null;
  if (commitChange(before)) setStatus(ui("lane-colored"));
  else updateChrome();
}
laneColorInput.addEventListener("input", () => {
  if (colorBefore == null) colorBefore = serialize();
  if (paintSelectedLanes(laneColorInput.value)) render();
});
laneColorInput.addEventListener("change", finishLaneColor);
laneColorInput.addEventListener("blur", finishLaneColor);
for (const swatch of connectorSwatches) {
  swatch.addEventListener("click", () => {
    const before = serialize();
    if (!paintSelectedConnector(swatch.dataset.color)) return;
    commitChange(before);
    render();
    setStatus(ui("connector-colored"));
  });
}
function finishConnectorColor() {
  if (colorBefore == null) return;
  const before = colorBefore;
  colorBefore = null;
  if (commitChange(before)) setStatus(ui("connector-colored"));
  else updateChrome();
}
connectorColorInput.addEventListener("input", () => {
  if (colorBefore == null) colorBefore = serialize();
  if (paintSelectedConnector(connectorColorInput.value)) render();
});
connectorColorInput.addEventListener("change", finishConnectorColor);
connectorColorInput.addEventListener("blur", finishConnectorColor);
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
const visioInput = document.getElementById("visio-input");
document.getElementById("import-visio").addEventListener("click", () => visioInput.click());
document.getElementById("export-visio").addEventListener("click", () => {
  exportVisio().catch(() => setStatus(ui("bad-visio")));
});
visioInput.addEventListener("change", () => {
  const file = visioInput.files && visioInput.files[0];
  visioInput.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    importVisio(reader.result).catch(() => setStatus(ui("bad-visio")));
  };
  reader.onerror = () => setStatus(ui("file-unreadable"));
  reader.readAsArrayBuffer(file);
});
document.getElementById("export-svg").addEventListener("click", exportSvg);
fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => setStatus(ui("file-unreadable"));
  if (/\.vsdx$/i.test(file.name)) {
    reader.onload = () => {
      importVisio(reader.result).catch(() => setStatus(ui("bad-visio")));
    };
    reader.readAsArrayBuffer(file);
    return;
  }
  reader.onload = () => openText(String(reader.result || ""));
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
    const point = clientToWorld(event.clientX, event.clientY);
    state.gesture = null;
    nativePortDrag = false;
    if (knownPort(fromPort) && getShape(fromId)) {
      const before = serialize();
      if (addConnector(fromId, fromPort, resolveTarget(fromId, point))) commitChange(before);
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
  editOnUp = null;
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
  if (event.key === "Control" || event.key === "Shift" || event.key === "Meta") heldKeys.delete(event.key);
  if (event.code === "Space") state.spaceDown = false;
});
window.addEventListener("blur", () => heldKeys.clear());
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
  for (const node of document.querySelectorAll("[data-ui]")) {
    node.textContent = ui(node.dataset.ui);
  }
  for (const node of document.querySelectorAll("[data-ui-title]")) {
    node.title = ui(node.dataset.uiTitle);
  }
  for (const node of document.querySelectorAll("[data-ui-label]")) {
    node.setAttribute("aria-label", ui(node.dataset.uiLabel));
  }
  for (const node of document.querySelectorAll("[data-ui-placeholder]")) {
    node.setAttribute("placeholder", ui(node.dataset.uiPlaceholder));
  }
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
langSelect.addEventListener("change", () => applyLanguage(langSelect.value));
state.savedSnapshot = serialize();
restoreDraft();
applyLanguage(state.lang);

window.Misio = {
  getDoc() {
    return JSON.parse(serialize());
  },
  loadText(text) {
    openText(text);
  },
  exportVisio,
  importVisio,
  lastDownload() {
    return lastDownload;
  },
  skipPrint: false,
};
