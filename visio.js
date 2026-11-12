"use strict";

// Read and write a Visio .vsdx package. A Misio drawing is stored inside the
// file so opening it here restores every shape. A drawing made in Visio is
// read as boxes, text, and connectors.

const VISIO_NS = "http://schemas.microsoft.com/office/visio/2012/main";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const PX_PER_INCH = 96;

const VISIO_NAMES = {
  "start/end": "terminator",
  terminator: "terminator",
  process: "process",
  decision: "decision",
  subprocess: "subprocess",
  "predefined process": "subprocess",
  document: "document",
  data: "data",
  database: "database",
  "stored data": "database",
  preparation: "preparation",
  "manual input": "manual",
  "manual operation": "manual",
  delay: "delay",
  "off-page connector": "offpage",
  "off-page reference": "offpage",
  "on-page reference": "onpage",
};

const VECTOR_TYPES = new Set([
  "terminator", "process", "decision", "subprocess", "document", "data",
  "database", "preparation", "manual", "delay", "offpage", "onpage", "text",
  "lane", "bus",
]);

function xml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;",
  }[ch]));
}

function num(value) {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 1000000) / 1000000);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function concat(parts) {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function zipSync(entries) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = entry.data;
    const stored = entry.method !== 8;
    const payload = stored ? data : entry.comp;
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(stored ? 0 : 8),
      u16(0),
      u16(0),
      u32(crc32(data)),
      u32(payload.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      payload,
    ]);
    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(stored ? 0 : 8),
      u16(0),
      u16(0),
      u32(crc32(data)),
      u32(payload.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const central = concat(centrals);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return concat(locals.concat([central, end]));
}

async function zip(files, method) {
  const entries = [];
  for (const file of files) {
    const data = file.data instanceof Uint8Array ? file.data : new TextEncoder().encode(file.data);
    if (method === 8) entries.push({ name: file.name, data, comp: await deflateRaw(data), method: 8 });
    else entries.push({ name: file.name, data, method: 0 });
  }
  return zipSync(entries);
}

async function unzip(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  const scan = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= scan; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a zip");
  const count = view.getUint16(end + 10, true);
  let central = view.getUint32(end + 16, true);
  const files = {};
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(central, true) !== 0x02014b50) throw new Error("bad zip");
    const method = view.getUint16(central + 10, true);
    const size = view.getUint32(central + 20, true);
    const nameLen = view.getUint16(central + 28, true);
    const extraLen = view.getUint16(central + 30, true);
    const commentLen = view.getUint16(central + 32, true);
    const localAt = view.getUint32(central + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(central + 46, central + 46 + nameLen));
    const nameLenLocal = view.getUint16(localAt + 26, true);
    const extraLenLocal = view.getUint16(localAt + 28, true);
    const start = localAt + 30 + nameLenLocal + extraLenLocal;
    const payload = bytes.subarray(start, start + size);
    if (method === 0) files[name] = payload;
    else if (method === 8) files[name] = await inflateRaw(payload);
    else throw new Error("unsupported zip");
    central += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function parseXml(bytes) {
  const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.documentElement && doc.documentElement.localName === "parsererror") throw new Error("xml");
  return doc;
}

function textOf(bytes) {
  return new TextDecoder().decode(bytes).replace(/^\uFEFF/, "");
}

function resolvePath(source, target) {
  if (!target) return "";
  if (target.charAt(0) === "/") return target.slice(1);
  const parts = source.split("/").slice(0, -1);
  for (const bit of target.split("/")) {
    if (bit === "..") parts.pop();
    else if (bit && bit !== ".") parts.push(bit);
  }
  return parts.join("/");
}

function relationships(bytes) {
  const doc = parseXml(bytes);
  const map = {};
  for (const node of doc.getElementsByTagNameNS("*", "Relationship")) {
    map[node.getAttribute("Id")] = node.getAttribute("Target");
  }
  return map;
}

function cellOf(shape, name) {
  for (const child of shape.children) {
    if (child.localName === "Cell" && child.getAttribute("N") === name) {
      const value = child.getAttribute("V");
      return value == null ? "" : value;
    }
  }
  return "";
}

function userValue(shape, rowName) {
  for (const section of shape.children) {
    if (section.localName !== "Section" || section.getAttribute("N") !== "User") continue;
    for (const row of section.children) {
      if (row.localName !== "Row" || row.getAttribute("N") !== rowName) continue;
      for (const cell of row.children) {
        if (cell.getAttribute("N") === "Value") return cell.getAttribute("V") || "";
      }
    }
  }
  return "";
}

function directText(shape) {
  for (const child of shape.children) {
    if (child.localName === "Text") return child.textContent.replace(/\u00a0/g, " ").replace(/\r/g, "").trim();
  }
  return "";
}

function hasEllipse(shape) {
  for (const section of shape.children) {
    if (section.localName !== "Section" || section.getAttribute("N") !== "Geometry") continue;
    for (const row of section.children) {
      if (row.getAttribute("T") === "Ellipse") return true;
    }
  }
  return false;
}

const AREI_NAMES = {
  aardinrichting: "arei-earth",
  automaat: "arei-breaker",
  differentieel: "arei-rcd",
  differentieelschakelaar: "arei-rcd",
  "stopcontact met contact voor beschermgeleider": "arei-socket-pe-child",
  "stopcontact met beschermgeleider en kinderbeveiliging": "arei-socket-pe-child",
  "enkelpolige vertraagde schakelaar": "arei-switch-delay",
  verlichtingstoestel: "arei-light",
  "enkelpolige wisselschakelaar": "arei-switch-two-way",
  "leiding in wand": "arei-line-inwall",
  "leiding in buis": "arei-line-conduit",
  wandverlichtingstoestel: "arei-light-wall",
  bel: "arei-bell",
  drukknop: "arei-push",
  boiler: "arei-boiler",
  "algemeen symbool huishoudelijk toestel": "arei-appliance",
  koelkast: "arei-fridge",
  kookfornuis: "arei-cooker",
  droogkast: "arei-dryer",
  wasmachine: "arei-washer",
  microgolfoven: "arei-microwave",
  transformator: "arei-transformer",
  "eenfasige wisselstroom": "arei-ac1",
  "waterdicht stopcontact": "arei-socket-h",
  "kwh-teller": "arei-meter",
};

function plainName(value) {
  return String(value || "").toLowerCase().replace(/\.\d+$/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function typeFromName(value) {
  const raw = plainName(value);
  if (!raw) return "";
  if (VISIO_NAMES[raw]) return VISIO_NAMES[raw];
  if (AREI_NAMES[raw]) return AREI_NAMES[raw];
  if (raw.includes("stopcontact")) return "arei-socket";
  if (raw.includes("schakelaar")) return "arei-switch";
  if (raw.includes("verlicht")) return "arei-light";
  if (raw.includes("leiding") || raw.includes("kabel")) return "arei-line";
  return "";
}

function typeFromShape(shape, master) {
  const stored = userValue(shape, "MisioType");
  if (stored) return stored;
  const masterName = master && typeof master === "object" ? master.name : master;
  const masterTitle = master && typeof master === "object" ? master.title : "";
  const named = typeFromName(shape.getAttribute("NameU") || "")
    || typeFromName(shape.getAttribute("Name") || "")
    || typeFromName(masterTitle)
    || typeFromName(masterName);
  if (named) return named;
  if (hasEllipse(shape)) return "terminator";
  return "";
}

function gatheredText(shape) {
  const lines = [];
  for (const node of shape.getElementsByTagNameNS("*", "Text")) {
    const text = node.textContent.replace(/\u00a0/g, " ").replace(/\r/g, "").trim();
    if (text) lines.push(text);
  }
  return lines.join("\n");
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPixel(pageWidth, pageHeight, x, y) {
  return { x: x * PX_PER_INCH, y: (pageHeight - y) * PX_PER_INCH };
}

function pageMetrics(doc) {
  let width = 11;
  let height = 8.5;
  let pages = 0;
  for (const page of doc.getElementsByTagNameNS("*", "Page")) {
    pages += 1;
    if (pages > 1) continue;
    for (const sheet of page.children) {
      if (sheet.localName !== "PageSheet") continue;
      width = numberOr(cellOf(sheet, "PageWidth"), width);
      height = numberOr(cellOf(sheet, "PageHeight"), height);
    }
  }
  return { width, height, pages: Math.max(pages, 1) };
}

function readMasters(bytes) {
  const doc = parseXml(bytes);
  const masters = {};
  const connectorIds = new Set();
  for (const master of doc.getElementsByTagNameNS("*", "Master")) {
    const id = master.getAttribute("ID");
    if (!id) continue;
    const name = master.getAttribute("NameU") || master.getAttribute("Name") || "";
    const title = master.getAttribute("Name") || name;
    let width = NaN;
    let height = NaN;
    for (const sheet of master.children) {
      if (sheet.localName !== "PageSheet") continue;
      width = numberOr(cellOf(sheet, "PageWidth"), width);
      height = numberOr(cellOf(sheet, "PageHeight"), height);
    }
    masters[id] = { name, title, width, height };
    if (/connector|verbindingslijn/i.test(name)) connectorIds.add(id);
  }
  return { masters, connectorIds };
}

function readPage(bytes, pageWidth, pageHeight, catalog) {
  const doc = parseXml(bytes);
  const root = doc.documentElement;
  const masters = (catalog && catalog.masters) || {};
  const connectorIds = (catalog && catalog.connectorIds) || new Set();
  const shapes = [];
  const oneD = [];
  const topOf = {};
  const shapesNode = [...root.children].find((node) => node.localName === "Shapes");
  function indexShape(shape, topId) {
    const id = shape.getAttribute("ID");
    if (id) topOf[id] = topId;
    // A symbol is a group. Visio glues a wire to a shape inside that group,
    // and those shapes sit under a Shapes element, not directly on the group.
    for (const child of shape.getElementsByTagNameNS("*", "Shape")) {
      const childId = child.getAttribute("ID");
      if (childId) topOf[childId] = topId;
    }
  }
  for (const shape of shapesNode ? [...shapesNode.children] : []) {
    if (shape.localName !== "Shape") continue;
    if (shape.getAttribute("Type") === "Guide") continue;
    const id = shape.getAttribute("ID") || String(shapes.length + oneD.length + 1);
    indexShape(shape, id);
    const master = masters[shape.getAttribute("Master")] || null;
    const pinX = numberOr(cellOf(shape, "PinX"), NaN);
    const pinY = numberOr(cellOf(shape, "PinY"), NaN);
    if (!Number.isFinite(pinX) || !Number.isFinite(pinY)) continue;
    let width = numberOr(cellOf(shape, "Width"), NaN);
    let height = numberOr(cellOf(shape, "Height"), NaN);
    if (!Number.isFinite(width) && master) width = master.width;
    if (!Number.isFinite(height) && master) height = master.height;
    if (!Number.isFinite(width)) width = 0.4;
    if (!Number.isFinite(height)) height = 0.3;
    width = Math.abs(width);
    height = Math.abs(height);
    const locX = numberOr(cellOf(shape, "LocPinX"), width / 2);
    const locY = numberOr(cellOf(shape, "LocPinY"), height / 2);
    const angle = numberOr(cellOf(shape, "Angle"), 0);
    const textAngle = numberOr(cellOf(shape, "TxtAngle"), 0);
    let boxW = width;
    let boxH = height;
    const turned = Math.abs(Math.sin(angle)) > 0.9;
    if (turned || Math.abs(Math.sin(textAngle)) > 0.9) {
      boxW = height;
      boxH = width;
    }
    const center = toPixel(pageWidth, pageHeight, pinX - locX + width / 2, pinY - locY + height / 2);
    const named = typeFromShape(shape, master);
    const text = gatheredText(shape);
    const type = named || (!master && text ? "text" : "process");
    const box = {
      id,
      type,
      x: center.x - (boxW * PX_PER_INCH) / 2,
      y: center.y - (boxH * PX_PER_INCH) / 2,
      w: Math.max(1, boxW * PX_PER_INCH),
      h: Math.max(1, boxH * PX_PER_INCH),
      text,
      bare: type === "text",
      fill: /^#[0-9a-fA-F]{6}$/.test(cellOf(shape, "FillForegnd")) ? cellOf(shape, "FillForegnd").toLowerCase() : "",
      line: /^#[0-9a-fA-F]{6}$/.test(cellOf(shape, "LineColor")) ? cellOf(shape, "LineColor").toLowerCase() : "",
    };
    const connector = cellOf(shape, "BeginX") !== "" || connectorIds.has(shape.getAttribute("Master") || "") || cellOf(shape, "ObjType") === "2";
    if (connector) {
      const begin = toPixel(pageWidth, pageHeight, numberOr(cellOf(shape, "BeginX"), pinX), numberOr(cellOf(shape, "BeginY"), pinY));
      const end = toPixel(pageWidth, pageHeight, numberOr(cellOf(shape, "EndX"), pinX), numberOr(cellOf(shape, "EndY"), pinY));
      oneD.push({ ...box, x1: begin.x, y1: begin.y, x2: end.x, y2: end.y });
    } else shapes.push(box);
  }
  const links = [];
  const connects = [...root.children].find((node) => node.localName === "Connects");
  const bySheet = {};
  const wireIds = new Set(oneD.map((line) => line.id));
  for (const node of connects ? [...connects.children] : []) {
    if (node.localName !== "Connect") continue;
    const from = topOf[node.getAttribute("FromSheet")] || node.getAttribute("FromSheet");
    const to = topOf[node.getAttribute("ToSheet")] || node.getAttribute("ToSheet");
    if (!from || !wireIds.has(from) || !to || wireIds.has(to)) continue;
    if (!bySheet[from]) bySheet[from] = {};
    const cell = node.getAttribute("FromCell") || "";
    bySheet[from][/begin/i.test(cell) ? "fromId" : "toId"] = to;
  }
  for (const line of oneD) {
    const glued = bySheet[line.id] || {};
    links.push({
      id: line.id,
      fromId: glued.fromId || "",
      toId: glued.toId || "",
      text: line.text,
      color: line.line,
      x1: line.x1,
      y1: line.y1,
      x2: line.x2,
      y2: line.y2,
    });
  }
  return { shapes, connectors: links };
}

function fitForeign(shapes, connectors) {
  const widths = shapes.filter((shape) => shape.type !== "text").map((shape) => Math.min(shape.w, shape.h)).filter((size) => size > 1).sort((a, b) => a - b);
  if (!widths.length) return;
  const median = widths[Math.floor(widths.length / 2)];
  if (median >= 56) return;
  const scale = 72 / median;
  for (const shape of shapes) {
    shape.x *= scale;
    shape.y *= scale;
    shape.w *= scale;
    shape.h *= scale;
  }
  for (const connector of connectors) {
    connector.x1 *= scale;
    connector.y1 *= scale;
    connector.x2 *= scale;
    connector.y2 *= scale;
  }
}

function misioPayload(bytes) {
  const doc = parseXml(bytes);
  for (const node of doc.getElementsByTagNameNS("*", "SolutionXML")) {
    if (node.getAttribute("Name") !== "Misio") continue;
    const text = node.textContent.trim();
    if (text.charAt(0) === "{") return text;
  }
  return "";
}

async function read(buffer) {
  const files = await unzip(buffer);
  const names = Object.keys(files);
  const documentName = names.find((name) => /(^|\/)document\.xml$/.test(name));
  if (!documentName) throw new Error("document");
  const misio = misioPayload(files[documentName]);
  let pagesName = "";
  const docRelsName = documentName.replace(/[^/]+$/, "_rels/") + "document.xml.rels";
  if (files[docRelsName]) {
    const rels = relationships(files[docRelsName]);
    const target = Object.values(rels).find((item) => /pages\.xml$/.test(item || ""));
    if (target) pagesName = resolvePath(documentName, target);
  }
  if (!pagesName) pagesName = names.find((name) => /pages\.xml$/.test(name)) || "";
  let metrics = { width: 11, height: 8.5, pages: 1 };
  const pageNames = [];
  if (pagesName && files[pagesName]) {
    const pagesDoc = parseXml(files[pagesName]);
    metrics = pageMetrics(pagesDoc);
    const pagesRelsName = pagesName.replace(/[^/]+$/, "_rels/") + "pages.xml.rels";
    if (files[pagesRelsName]) {
      for (const target of Object.values(relationships(files[pagesRelsName]))) {
        if (/page\d*\.xml$/.test(target) && !/pages\.xml$/.test(target)) pageNames.push(resolvePath(pagesName, target));
      }
    }
  }
  if (!pageNames.length) {
    for (const name of names) {
      if (/page\d+\.xml$/.test(name)) pageNames.push(name);
    }
  }
  const shapes = [];
  const connectors = [];
  const pageFile = pageNames.find((name) => files[name]);
  const mastersName = names.find((name) => /masters\.xml$/.test(name) && !name.includes("_rels"));
  const catalog = mastersName && files[mastersName] ? readMasters(files[mastersName]) : { masters: {}, connectorIds: new Set() };
  if (pageFile) {
    const page = readPage(files[pageFile], metrics.width, metrics.height, catalog);
    shapes.push(...page.shapes);
    connectors.push(...page.connectors);
  }
  if (!misio) fitForeign(shapes, connectors);
  return { misio, pages: Math.max(metrics.pages, pageNames.length || 1), shapes, connectors };
}

function cdata(value) {
  return "<![CDATA[" + String(value).replace(/]]>/g, "]]]]><![CDATA[>") + "]]>";
}

function cell(name, value, formula) {
  return `<Cell N="${name}" V="${xml(value)}"${formula ? ` F="${xml(formula)}"` : ""}/>`;
}

function section(noFill, rows) {
  return `<Section N="Geometry" IX="0"><Cell N="NoFill" V="${noFill}"/><Cell N="NoLine" V="0"/>${rows}</Section>`;
}

function relPoint(type, index, x, y) {
  return `<Row T="${type}" IX="${index}"><Cell N="X" V="${num(x)}"/><Cell N="Y" V="${num(y)}"/></Row>`;
}

function relLoop(points) {
  return points.map((point, index) => relPoint(index ? "RelLineTo" : "RelMoveTo", index + 1, point[0], point[1])).join("");
}

function geometryFor(type, width, height) {
  if (type === "terminator" || type === "onpage") {
    return section(0, `<Row T="Ellipse" IX="1"><Cell N="X" V="${num(width / 2)}" F="Width*0.5"/><Cell N="Y" V="${num(height / 2)}" F="Height*0.5"/><Cell N="A" V="${num(width)}" F="Width*1"/><Cell N="B" V="${num(height / 2)}" F="Height*0.5"/><Cell N="C" V="${num(width / 2)}" F="Width*0.5"/><Cell N="D" V="${num(height)}" F="Height*1"/></Row>`);
  }
  if (type === "decision") return section(0, relLoop([[0.5, 1], [1, 0.5], [0.5, 0], [0, 0.5], [0.5, 1]]));
  if (type === "data") return section(0, relLoop([[0.18, 1], [1, 1], [0.82, 0], [0, 0], [0.18, 1]]));
  if (type === "preparation") return section(0, relLoop([[0.2, 1], [0.8, 1], [1, 0.5], [0.8, 0], [0.2, 0], [0, 0.5], [0.2, 1]]));
  if (type === "manual") return section(0, relLoop([[0, 0.72], [1, 1], [1, 0], [0, 0], [0, 0.72]]));
  if (type === "offpage") return section(0, relLoop([[0, 1], [0.76, 1], [1, 0.5], [0.76, 0], [0, 0], [0, 1]]));
  if (type === "delay") {
    return section(0, [
      relPoint("RelMoveTo", 1, 0, 1),
      relPoint("RelLineTo", 2, 0.62, 1),
      `<Row T="RelQuadBezTo" IX="3"><Cell N="X" V="0.62"/><Cell N="Y" V="0"/><Cell N="A" V="1.05"/><Cell N="B" V="0.5"/></Row>`,
      relPoint("RelLineTo", 4, 0, 0),
      relPoint("RelLineTo", 5, 0, 1),
    ].join(""));
  }
  if (type === "document") {
    return section(0, [
      relPoint("RelMoveTo", 1, 0, 1),
      relPoint("RelLineTo", 2, 1, 1),
      relPoint("RelLineTo", 3, 1, 0.18),
      `<Row T="RelQuadBezTo" IX="4"><Cell N="X" V="0.5"/><Cell N="Y" V="0.04"/><Cell N="A" V="0.75"/><Cell N="B" V="0.32"/></Row>`,
      `<Row T="RelQuadBezTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0.18"/><Cell N="A" V="0.25"/><Cell N="B" V="-0.08"/></Row>`,
      relPoint("RelLineTo", 6, 0, 1),
    ].join(""));
  }
  if (type === "bus") {
    const y = height / 2;
    return section(1, `<Row T="MoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="${num(y)}" F="Height*0.5"/></Row><Row T="LineTo" IX="2"><Cell N="X" V="${num(width)}" F="Width*1"/><Cell N="Y" V="${num(y)}" F="Height*0.5"/></Row>`);
  }
  if (type === "subprocess") {
    const inset = Math.min(width * 0.12, 0.18);
    const bar = (index, x) => `<Section N="Geometry" IX="${index}"><Cell N="NoFill" V="1"/><Cell N="NoLine" V="0"/><Row T="MoveTo" IX="1"><Cell N="X" V="${num(x)}"/><Cell N="Y" V="0"/></Row><Row T="LineTo" IX="2"><Cell N="X" V="${num(x)}"/><Cell N="Y" V="${num(height)}" F="Height*1"/></Row></Section>`;
    return section(0, relLoop([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]])) + bar(1, inset) + bar(2, width - inset);
  }
  return section(0, relLoop([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]));
}

function polyline(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (maxX - minX < 0.02) {
    const mid = (minX + maxX) / 2;
    minX = mid - 0.01;
    maxX = mid + 0.01;
  }
  if (maxY - minY < 0.02) {
    const mid = (minY + maxY) / 2;
    minY = mid - 0.01;
    maxY = mid + 0.01;
  }
  const rows = points.map((point, index) => {
    const type = index ? "LineTo" : "MoveTo";
    return `<Row T="${type}" IX="${index + 1}"><Cell N="X" V="${num(point.x - minX)}"/><Cell N="Y" V="${num(point.y - minY)}"/></Row>`;
  }).join("");
  return {
    pinX: (minX + maxX) / 2,
    pinY: (minY + maxY) / 2,
    w: maxX - minX,
    h: maxY - minY,
    geometry: section(1, rows),
  };
}

function userSection(type) {
  if (!type) return "";
  return `<Section N="User"><Row N="MisioType"><Cell N="Value" V="${xml(type)}" U="STR"/><Cell N="Prompt" V=""/></Row></Section>`;
}

function shapeXml(id, shape, extra) {
  const arrows = shape.arrows || "";
  return `<Shape ID="${id}" Type="Shape" LineStyle="3" FillStyle="3" TextStyle="3">${[
    cell("PinX", shape.pinX),
    cell("PinY", shape.pinY),
    cell("Width", shape.w),
    cell("Height", shape.h),
    cell("LocPinX", shape.w / 2, "Width*0.5"),
    cell("LocPinY", shape.h / 2, "Height*0.5"),
    cell("Angle", 0),
    cell("FlipX", 0),
    cell("FlipY", 0),
    shape.beginX == null ? "" : cell("BeginX", shape.beginX),
    shape.beginY == null ? "" : cell("BeginY", shape.beginY),
    shape.endX == null ? "" : cell("EndX", shape.endX),
    shape.endY == null ? "" : cell("EndY", shape.endY),
    cell("FillForegnd", shape.fill || "#fffcf7"),
    cell("FillPattern", shape.noFill ? 0 : 1),
    cell("LineColor", shape.line || "#1c1915"),
    cell("LineWeight", shape.weight || 0.015625),
    cell("LinePattern", shape.dashed ? 2 : 1),
    cell("VerticalAlign", shape.valign || 1),
    shape.hideText ? cell("HideText", 1) : "",
    arrows,
    userSection(shape.misioType),
    shape.geometry,
    extra || "",
    `<Text>${xml(shape.text || "")}</Text>`,
  ].join("")}</Shape>`;
}

function contentTypes(hasPng) {
  const png = hasPng ? `<Default Extension="png" ContentType="image/png"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${png}
  <Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>
  <Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>
  <Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>
  <Override PartName="/visio/windows.xml" ContentType="application/vnd.ms-visio.windows+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function documentXml(pageWidth, pageHeight, payload) {
  const embedded = payload ? `<SolutionXML Name="Misio">${cdata(payload)}</SolutionXML>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<VisioDocument xmlns="${VISIO_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xml:space="preserve">
  <DocumentSettings TopPage="0" DefaultTextStyle="3" DefaultLineStyle="3" DefaultFillStyle="3" DefaultGuideStyle="4">
    <GlueSettings>9</GlueSettings>
    <SnapSettings>295</SnapSettings>
    <SnapExtensions>34</SnapExtensions>
    <DynamicGridEnabled>0</DynamicGridEnabled>
  </DocumentSettings>
  <FaceNames><FaceName NameU="Segoe UI" CharSets="1073742335 -65536" Flags="325"/></FaceNames>
  <StyleSheets>
    <StyleSheet ID="0" NameU="No Style" Name="No Style">
      <Cell N="EnableLineProps" V="1"/>
      <Cell N="EnableFillProps" V="1"/>
      <Cell N="EnableTextProps" V="1"/>
    </StyleSheet>
    <StyleSheet ID="3" NameU="Normal" Name="Normal" LineStyle="3" FillStyle="3" TextStyle="3">
      <Cell N="LineWeight" V="0.01041666666666667"/>
      <Cell N="LineColor" V="#1c1915"/>
      <Cell N="LinePattern" V="1"/>
      <Cell N="FillForegnd" V="#fffcf7"/>
      <Cell N="FillPattern" V="1"/>
      <Cell N="Font" V="0"/>
      <Cell N="Size" V="0.16666666666666666"/>
    </StyleSheet>
  </StyleSheets>
  ${embedded}
</VisioDocument>`;
}

function pagesXml(pageWidth, pageHeight) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Pages xmlns="${VISIO_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xml:space="preserve">
  <Page ID="0" NameU="Page-1" Name="Page-1">
    <PageSheet LineStyle="0" FillStyle="0" TextStyle="0">
      ${cell("PageWidth", pageWidth)}
      ${cell("PageHeight", pageHeight)}
      ${cell("PageScale", 1)}
      ${cell("DrawingScale", 1)}
      ${cell("DrawingResizeType", 1)}
    </PageSheet>
    <Rel r:id="rId1"/>
  </Page>
</Pages>`;
}

function pageXml(shapes, connects) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<PageContents xmlns="${VISIO_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xml:space="preserve">
  <Shapes>${shapes.join("")}</Shapes>
  <Connects>${connects.join("")}</Connects>
</PageContents>`;
}

function rels(pairs) {
  const rows = pairs.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">${rows}</Relationships>`;
}

function write(model, options) {
  const embed = !options || options.embed !== false;
  const shapes = model.shapes || [];
  const connectors = (model.connectors || []).filter((connector) => connector.points && connector.points.length >= 2);
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
  for (const shape of shapes) {
    include(shape.x, shape.y);
    include(shape.x + shape.w, shape.y + shape.h);
  }
  for (const connector of connectors) {
    for (const point of connector.points) include(point.x, point.y);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 320;
    maxY = 180;
  }
  const margin = 0.5;
  const pageWidth = (maxX - minX) / PX_PER_INCH + margin * 2;
  const pageHeight = (maxY - minY) / PX_PER_INCH + margin * 2;
  const vx = (x) => (x - minX) / PX_PER_INCH + margin;
  const vy = (y) => pageHeight - ((y - minY) / PX_PER_INCH + margin);
  const images = model.images || {};
  const shapeXmls = [];
  const connectXml = [];
  const media = [];
  let nextId = 1;
  const idOf = {};
  for (const shape of shapes) {
    const id = nextId;
    nextId += 1;
    idOf[String(shape.id)] = id;
    const pinX = vx(shape.x + shape.w / 2);
    const pinY = vy(shape.y + shape.h / 2);
    const width = Math.max(shape.w / PX_PER_INCH, 0.05);
    const height = Math.max(shape.h / PX_PER_INCH, 0.05);
    const png = images[shape.id] || images[String(shape.id)];
    let extra = "";
    let hideText = false;
    if (png) {
      media.push(png);
      const rel = "rId" + media.length;
      extra = `${cell("ImgOffsetX", 0)}${cell("ImgOffsetY", 0)}${cell("ImgWidth", width, "Width*1")}${cell("ImgHeight", height, "Height*1")}<ForeignData ForeignType="Bitmap" CompressionType="PNG"><Rel r:id="${rel}"/></ForeignData>`;
      hideText = true;
    }
    const kind = VECTOR_TYPES.has(shape.type) && !png ? shape.type : "process";
    shapeXmls.push(shapeXml(id, {
      pinX,
      pinY,
      w: width,
      h: height,
      text: shape.text || "",
      fill: shape.fill || "#fffcf7",
      line: shape.line || "#1c1915",
      weight: shape.type === "bus" ? 0.03 : 0.015625,
      dashed: shape.type === "text",
      noFill: shape.type === "bus",
      hideText,
      valign: shape.type === "lane" ? 0 : 1,
      misioType: shape.type,
      geometry: png ? geometryFor("process", width, height) : geometryFor(kind, width, height),
    }, extra));
  }
  for (const connector of connectors) {
    const id = nextId;
    nextId += 1;
    const inches = connector.points.map((point) => ({ x: vx(point.x), y: vy(point.y) }));
    const line = polyline(inches);
    const ends = connector.ends === "both" ? "both" : connector.ends === "none" ? "none" : "end";
    const arrows = [
      cell("BeginArrow", ends === "both" ? 5 : 0),
      cell("EndArrow", ends === "none" ? 0 : 5),
      cell("BeginArrowSize", 1),
      cell("EndArrowSize", 1),
    ].join("");
    const last = inches[inches.length - 1];
    shapeXmls.push(shapeXml(id, {
      pinX: line.pinX,
      pinY: line.pinY,
      w: line.w,
      h: line.h,
      text: connector.text || "",
      fill: "#fffcf7",
      line: connector.color || "#1c1915",
      noFill: true,
      geometry: line.geometry,
      arrows,
      misioType: "",
      beginX: inches[0].x,
      beginY: inches[0].y,
      endX: last.x,
      endY: last.y,
    }));
    const fromId = idOf[String(connector.fromId)];
    const toId = idOf[String(connector.toId)];
    if (fromId && toId) {
      connectXml.push(`<Connect FromSheet="${id}" FromCell="BeginX" ToSheet="${fromId}" ToCell="PinX"/>`);
      connectXml.push(`<Connect FromSheet="${id}" FromCell="EndX" ToSheet="${toId}" ToCell="PinX"/>`);
    }
  }
  const pageRels = media.map((png, index) => [
    "rId" + (index + 1),
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    "../media/image" + (index + 1) + ".png",
  ]);
  const files = [
    { name: "[Content_Types].xml", data: contentTypes(media.length > 0) },
    { name: "_rels/.rels", data: rels([
      ["rId1", "http://schemas.microsoft.com/visio/2010/relationships/document", "visio/document.xml"],
      ["rId2", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", "docProps/core.xml"],
      ["rId3", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties", "docProps/app.xml"],
    ]) },
    { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Misio</dc:title><dc:creator>Misio</dc:creator></cp:coreProperties>` },
    { name: "docProps/app.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Misio</Application></Properties>` },
    { name: "visio/document.xml", data: documentXml(pageWidth, pageHeight, embed ? model.json || "" : "") },
    { name: "visio/_rels/document.xml.rels", data: rels([
      ["rId1", "http://schemas.microsoft.com/visio/2010/relationships/pages", "pages/pages.xml"],
      ["rId2", "http://schemas.microsoft.com/visio/2010/relationships/windows", "windows.xml"],
    ]) },
    { name: "visio/pages/pages.xml", data: pagesXml(pageWidth, pageHeight) },
    { name: "visio/pages/_rels/pages.xml.rels", data: rels([
      ["rId1", "http://schemas.microsoft.com/visio/2010/relationships/page", "page1.xml"],
    ]) },
    { name: "visio/pages/page1.xml", data: pageXml(shapeXmls, connectXml) },
    { name: "visio/windows.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Windows xmlns="${VISIO_NS}" ClientWidth="1600" ClientHeight="900"><Window ID="0" WindowType="Drawing" WindowState="1073741824"><Page ID="0"/></Window></Windows>` },
  ];
  if (pageRels.length) {
    files.push({ name: "visio/pages/_rels/page1.xml.rels", data: rels(pageRels) });
    media.forEach((png, index) => {
      files.push({ name: "visio/media/image" + (index + 1) + ".png", data: png });
    });
  }
  return zipSync(files.map((file) => ({
    name: file.name,
    data: file.data instanceof Uint8Array ? file.data : new TextEncoder().encode(file.data),
    method: 0,
  })));
}

window.MisioVisio = {
  read,
  write,
  unzip,
  zip,
};
