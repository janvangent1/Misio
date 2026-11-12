"use strict";

// Vehicle wiring, pneumatics, and plumbing. Icons are drawn in a 40-unit box.
// A wire between two of these symbols stays a plain line, like an AREI wire.

function schemeIconBox(shape) {
  const text = String(shape.text || "").trim();
  const pad = 4;
  if (!text) {
    const size = Math.max(16, Math.min(shape.w, shape.h) - pad * 2);
    return {
      x: shape.x + (shape.w - size) / 2,
      y: shape.y + (shape.h - size) / 2,
      w: size,
      h: size,
    };
  }
  const size = Math.max(28, Math.min(shape.w - pad * 2, shape.h - 30));
  return {
    x: shape.x + (shape.w - size) / 2,
    y: shape.y + 2,
    w: size,
    h: size,
  };
}

function schemePen(parent, paint, box) {
  const size = Math.min(box.w, box.h);
  const ox = box.x + (box.w - size) / 2;
  const oy = box.y + (box.h - size) / 2;
  const X = (n) => ox + (n / 40) * size;
  const Y = (n) => oy + (n / 40) * size;
  const stroke = paint.stroke;
  const sw = paint.sw;
  function line(x1, y1, x2, y2) {
    el("line", {
      x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2),
      stroke, "stroke-width": sw, "stroke-linecap": "round",
    }, parent);
  }
  function circle(cx, cy, r, filled) {
    el("circle", {
      cx: X(cx), cy: Y(cy), r: (r / 40) * size,
      fill: filled ? stroke : "none",
      stroke, "stroke-width": sw,
    }, parent);
  }
  function rect(x, y, w, h, radius) {
    el("rect", {
      x: X(x), y: Y(y),
      width: (w / 40) * size, height: (h / 40) * size,
      rx: radius ? (radius / 40) * size : null,
      fill: paint.fill, stroke, "stroke-width": sw,
    }, parent);
  }
  function poly(points, filled) {
    const d = points.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(" ");
    el("path", {
      d: filled ? `${d} Z` : d,
      fill: filled === "ink" ? stroke : (filled ? paint.fill : "none"),
      stroke, "stroke-width": sw, "stroke-linejoin": "round", "stroke-linecap": "round",
    }, parent);
  }
  function arrow(x1, y1, x2, y2) {
    line(x1, y1, x2, y2);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const s = 3.2;
    poly([
      [x2, y2],
      [x2 - ux * s - uy * s * 0.55, y2 - uy * s + ux * s * 0.55],
      [x2 - ux * s + uy * s * 0.55, y2 - uy * s - ux * s * 0.55],
    ], "ink");
  }
  function tag(str, x, y, font) {
    const node = el("text", {
      x: X(x),
      y: Y(y),
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "font-family": "Segoe UI, Helvetica Neue, sans-serif",
      "font-size": ((font || 8) / 40) * size,
      "font-weight": 600,
      fill: stroke,
    }, parent);
    node.textContent = str;
  }
  return { line, circle, rect, poly, arrow, tag };
}

function drawVehicleSymbol(parent, shape, paint) {
  const g = schemePen(parent, paint, schemeIconBox(shape));
  switch (shape.type) {
    case "veh-battery":
      g.line(2, 20, 8, 20);
      g.line(8, 8, 8, 32);
      g.line(14, 13, 14, 27);
      g.line(14, 20, 20, 20);
      g.line(20, 8, 20, 32);
      g.line(26, 13, 26, 27);
      g.line(26, 20, 36, 20);
      g.line(10, 5, 16, 5);
      g.line(13, 2, 13, 8);
      break;
    case "veh-ground":
      g.line(20, 4, 20, 16);
      g.line(8, 16, 32, 16);
      g.line(12, 22, 28, 22);
      g.line(16, 28, 24, 28);
      break;
    case "veh-fuse":
      g.line(2, 20, 10, 20);
      g.rect(10, 13, 20, 14, 1);
      g.line(14, 24, 18, 16);
      g.line(18, 16, 22, 24);
      g.line(22, 24, 26, 16);
      g.line(30, 20, 38, 20);
      break;
    case "veh-relay":
      g.rect(6, 4, 28, 32, 1);
      g.circle(16, 26, 5, false);
      g.line(12, 12, 18, 12);
      g.line(18, 12, 30, 8);
      g.circle(30, 14, 1.3, true);
      break;
    case "veh-switch":
      g.line(2, 26, 12, 26);
      g.circle(14, 26, 1.6, true);
      g.line(14, 26, 30, 12);
      g.circle(32, 26, 1.6, true);
      break;
    case "veh-lamp":
      g.circle(20, 20, 12, false);
      g.line(12, 12, 28, 28);
      g.line(28, 12, 12, 28);
      break;
    case "veh-horn":
      g.poly([[6, 15], [16, 11], [16, 29], [6, 25]], false);
      g.line(6, 15, 6, 25);
      g.line(16, 11, 33, 5);
      g.line(16, 29, 33, 35);
      g.line(33, 5, 33, 35);
      break;
    case "veh-motor":
      g.circle(20, 20, 13, false);
      g.line(13, 26, 13, 15);
      g.line(13, 15, 20, 23);
      g.line(20, 23, 27, 15);
      g.line(27, 15, 27, 26);
      break;
    case "veh-alternator":
      g.circle(20, 20, 13, false);
      g.poly([[9, 20], [13, 14], [17, 26], [21, 14], [25, 26], [29, 20], [32, 20]], false);
      break;
    case "veh-coil":
      g.line(4, 20, 10, 20);
      g.circle(16, 20, 6, false);
      g.circle(26, 20, 6, false);
      g.line(32, 20, 38, 20);
      break;
    case "veh-ecu":
      g.rect(10, 8, 20, 24, 1);
      g.line(4, 14, 10, 14);
      g.line(4, 20, 10, 20);
      g.line(4, 26, 10, 26);
      g.line(30, 14, 36, 14);
      g.line(30, 20, 36, 20);
      g.line(30, 26, 36, 26);
      g.tag("ECU", 20, 20, 7);
      break;
    case "veh-sensor":
      g.rect(8, 8, 24, 16, 1);
      g.poly([[12, 14], [16, 18], [20, 12], [24, 18], [28, 14]], false);
      g.line(20, 24, 20, 36);
      break;
    case "veh-plug":
      g.line(20, 2, 20, 10);
      g.rect(15, 10, 10, 8, 1);
      g.line(20, 18, 20, 28);
      g.line(16, 28, 24, 28);
      g.line(12, 36, 22, 28);
      break;
    case "veh-connector":
      g.line(2, 20, 8, 20);
      g.poly([[8, 12], [18, 20], [8, 28]], false);
      g.poly([[32, 12], [22, 20], [32, 28]], false);
      g.line(32, 20, 38, 20);
      break;
    default:
      g.rect(8, 8, 24, 24, 2);
  }
}

function drawAirSymbol(parent, shape, paint) {
  const g = schemePen(parent, paint, schemeIconBox(shape));
  switch (shape.type) {
    case "air-compressor":
      g.circle(22, 20, 12, false);
      g.rect(2, 16, 8, 8, 0);
      g.poly([[14, 13], [14, 27], [30, 20]], "ink");
      break;
    case "air-tank":
      g.rect(6, 12, 28, 16, 8);
      g.line(20, 12, 20, 4);
      g.line(20, 28, 20, 36);
      break;
    case "air-filter":
      g.poly([[20, 4], [36, 20], [20, 36], [4, 20]], false);
      g.line(8, 28, 32, 12);
      break;
    case "air-regulator":
      g.rect(8, 10, 24, 20, 1);
      g.line(2, 20, 8, 20);
      g.line(32, 20, 38, 20);
      g.arrow(12, 28, 30, 12);
      break;
    case "air-gauge":
      g.circle(20, 17, 12, false);
      g.line(20, 17, 28, 11);
      g.circle(20, 17, 1.4, true);
      g.line(20, 29, 20, 38);
      break;
    case "air-valve32":
      g.tag("3/2", 20, 6, 7);
      g.rect(6, 12, 28, 14, 0.6);
      g.line(20, 12, 20, 26);
      g.arrow(13, 24, 13, 16);
      g.line(24, 16, 32, 24);
      g.line(13, 26, 13, 36);
      g.line(27, 26, 27, 36);
      g.line(13, 12, 13, 8);
      break;
    case "air-valve52":
      g.tag("5/2", 20, 6, 7);
      g.rect(4, 12, 32, 14, 0.6);
      g.line(20, 12, 20, 26);
      g.arrow(12, 24, 12, 16);
      g.arrow(28, 16, 28, 24);
      g.line(10, 26, 10, 36);
      g.line(20, 26, 20, 36);
      g.line(30, 26, 30, 36);
      g.line(10, 12, 10, 8);
      g.line(30, 12, 30, 8);
      break;
    case "air-check":
      g.line(2, 20, 8, 20);
      g.poly([[8, 10], [8, 30], [24, 20]], false);
      g.line(24, 10, 24, 30);
      g.line(24, 20, 38, 20);
      break;
    case "air-cylinder":
      g.line(2, 20, 12, 20);
      g.rect(12, 10, 18, 20, 0);
      g.line(18, 10, 18, 30);
      g.line(16, 10, 16, 4);
      g.line(30, 20, 38, 20);
      break;
    case "air-motor":
      g.circle(18, 20, 12, false);
      g.poly([[26, 12], [26, 28], [12, 20]], false);
      g.line(30, 20, 38, 20);
      break;
    case "air-silencer":
      g.line(20, 2, 20, 8);
      g.rect(14, 8, 12, 8, 0);
      g.line(8, 20, 32, 20);
      g.line(10, 26, 30, 26);
      g.line(13, 32, 27, 32);
      break;
    case "air-coupling":
      g.line(2, 20, 12, 20);
      g.line(12, 12, 12, 28);
      g.line(17, 12, 17, 28);
      g.line(23, 12, 23, 28);
      g.line(28, 12, 28, 28);
      g.line(28, 20, 38, 20);
      break;
    default:
      g.rect(8, 8, 24, 24, 2);
  }
}

function drawWaterSymbol(parent, shape, paint) {
  const g = schemePen(parent, paint, schemeIconBox(shape));
  switch (shape.type) {
    case "h2o-pump":
      g.circle(20, 17, 12, false);
      g.poly([[14, 23], [14, 11], [28, 17]], "ink");
      g.line(20, 29, 20, 38);
      break;
    case "h2o-valve":
      g.poly([[4, 12], [20, 20], [4, 28]], false);
      g.poly([[36, 12], [20, 20], [36, 28]], false);
      g.line(20, 20, 20, 6);
      g.line(14, 6, 26, 6);
      break;
    case "h2o-check":
      g.line(2, 20, 8, 20);
      g.poly([[8, 10], [8, 30], [24, 20]], false);
      g.line(24, 10, 24, 30);
      g.line(24, 20, 38, 20);
      break;
    case "h2o-tank":
      g.rect(10, 4, 20, 32, 1);
      g.poly([[10, 24], [15, 20], [20, 24], [25, 20], [30, 24]], false);
      break;
    case "h2o-boiler":
      g.rect(8, 4, 24, 18, 1);
      g.line(20, 22, 20, 28);
      g.line(14, 36, 20, 26);
      g.line(26, 36, 20, 26);
      break;
    case "h2o-radiator":
      g.line(6, 10, 34, 10);
      g.line(6, 30, 34, 30);
      g.line(8, 10, 8, 30);
      g.line(14, 10, 14, 30);
      g.line(20, 10, 20, 30);
      g.line(26, 10, 26, 30);
      g.line(32, 10, 32, 30);
      break;
    case "h2o-tap":
      g.circle(22, 8, 4, false);
      g.line(18, 8, 26, 8);
      g.line(22, 12, 22, 20);
      g.line(8, 20, 22, 20);
      g.line(8, 20, 8, 30);
      break;
    case "h2o-filter":
      g.poly([[6, 6], [34, 6], [20, 34]], false);
      g.line(11, 14, 29, 14);
      g.line(13, 20, 27, 20);
      break;
    case "h2o-meter":
      g.circle(20, 15, 11, false);
      g.line(20, 15, 27, 10);
      g.circle(20, 15, 1.3, true);
      g.rect(10, 28, 20, 8, 1);
      break;
    case "h2o-drain":
      g.line(6, 8, 34, 8);
      g.line(10, 8, 6, 18);
      g.line(16, 8, 12, 18);
      g.line(22, 8, 18, 18);
      g.line(28, 8, 24, 18);
      g.line(34, 8, 30, 18);
      break;
    case "h2o-exchanger":
      g.rect(6, 6, 28, 28, 1);
      g.poly([[10, 30], [15, 12], [20, 30], [25, 12], [30, 30]], false);
      break;
    case "h2o-mixer":
      g.line(6, 32, 16, 18);
      g.line(34, 32, 24, 18);
      g.line(20, 18, 20, 4);
      g.circle(20, 18, 3, true);
      break;
    default:
      g.rect(8, 8, 24, 24, 2);
  }
}

function schemeMaster(category, type, name) {
  return {
    category,
    type,
    name,
    text: "",
    w: 96,
    h: 80,
  };
}

window.MisioVehicle = {
  categories: [{ id: "vehicle", name: "Vehicle" }],
  masters: [
    schemeMaster("vehicle", "veh-battery", "Battery"),
    schemeMaster("vehicle", "veh-ground", "Ground"),
    schemeMaster("vehicle", "veh-fuse", "Fuse"),
    schemeMaster("vehicle", "veh-relay", "Relay"),
    schemeMaster("vehicle", "veh-switch", "Switch"),
    schemeMaster("vehicle", "veh-lamp", "Lamp"),
    schemeMaster("vehicle", "veh-horn", "Horn"),
    schemeMaster("vehicle", "veh-motor", "Motor"),
    schemeMaster("vehicle", "veh-alternator", "Alternator"),
    schemeMaster("vehicle", "veh-coil", "Ignition coil"),
    schemeMaster("vehicle", "veh-ecu", "ECU"),
    schemeMaster("vehicle", "veh-sensor", "Sensor"),
    schemeMaster("vehicle", "veh-plug", "Spark plug"),
    schemeMaster("vehicle", "veh-connector", "Connector"),
  ],
  draw: drawVehicleSymbol,
  iconBox: schemeIconBox,
};

window.MisioAir = {
  categories: [{ id: "air", name: "Pneumatics" }],
  masters: [
    schemeMaster("air", "air-compressor", "Compressor"),
    schemeMaster("air", "air-tank", "Air tank"),
    schemeMaster("air", "air-filter", "Filter"),
    schemeMaster("air", "air-regulator", "Regulator"),
    schemeMaster("air", "air-gauge", "Pressure gauge"),
    schemeMaster("air", "air-valve32", "3/2 valve"),
    schemeMaster("air", "air-valve52", "5/2 valve"),
    schemeMaster("air", "air-check", "Check valve"),
    schemeMaster("air", "air-cylinder", "Cylinder"),
    schemeMaster("air", "air-motor", "Air motor"),
    schemeMaster("air", "air-silencer", "Silencer"),
    schemeMaster("air", "air-coupling", "Coupling"),
  ],
  draw: drawAirSymbol,
  iconBox: schemeIconBox,
};

window.MisioWater = {
  categories: [{ id: "water", name: "Plumbing" }],
  masters: [
    schemeMaster("water", "h2o-pump", "Pump"),
    schemeMaster("water", "h2o-valve", "Stop valve"),
    schemeMaster("water", "h2o-check", "Check valve"),
    schemeMaster("water", "h2o-tank", "Tank"),
    schemeMaster("water", "h2o-boiler", "Boiler"),
    schemeMaster("water", "h2o-radiator", "Radiator"),
    schemeMaster("water", "h2o-tap", "Tap"),
    schemeMaster("water", "h2o-filter", "Filter"),
    schemeMaster("water", "h2o-meter", "Water meter"),
    schemeMaster("water", "h2o-drain", "Drain"),
    schemeMaster("water", "h2o-exchanger", "Heat exchanger"),
    schemeMaster("water", "h2o-mixer", "Mixer tap"),
  ],
  draw: drawWaterSymbol,
  iconBox: schemeIconBox,
};
