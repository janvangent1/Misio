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

function schemeIconPoint(shape, nx, ny) {
  const box = schemeIconBox(shape);
  const size = Math.min(box.w, box.h);
  const ox = box.x + (box.w - size) / 2;
  const oy = box.y + (box.h - size) / 2;
  return {
    x: ox + (nx / 40) * size,
    y: oy + (ny / 40) * size,
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
  function arc(x1, y1, rx, ry, x2, y2, sweep) {
    el("path", {
      d: `M ${X(x1)} ${Y(y1)} A ${(rx / 40) * size} ${(ry / 40) * size} 0 0 ${sweep === 0 ? 0 : 1} ${X(x2)} ${Y(y2)}`,
      fill: "none", stroke, "stroke-width": sw, "stroke-linecap": "round",
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
  return { line, circle, arc, rect, poly, arrow, tag };
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
      g.line(2, 20, 8, 20);
      g.circle(22, 20, 12, false);
      g.tag("M", 22, 20, 11);
      g.line(34, 20, 38, 20);
      break;
    case "veh-alternator":
      g.circle(20, 20, 13, false);
      g.poly([[9, 20], [13, 14], [17, 26], [21, 14], [25, 26], [29, 20], [32, 20]], false);
      break;
    case "veh-coil":
      g.line(2, 22, 8, 22);
      g.arc(8, 22, 4, 6, 16, 22, 0);
      g.arc(16, 22, 4, 6, 24, 22, 0);
      g.arc(24, 22, 4, 6, 32, 22, 0);
      g.line(32, 22, 38, 22);
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
      g.line(20, 2, 20, 12);
      g.rect(14, 12, 12, 8, 1);
      g.line(20, 20, 20, 28);
      g.line(14, 28, 26, 28);
      g.line(14, 34, 20, 28);
      g.line(20, 28, 20, 36);
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
  // ISO 1219 marks, the same ones Festo prints: one square per valve position,
  // an open triangle for air, a zigzag for a spring, a slashed box for a coil.
  function spring(x, y) {
    g.poly([[x, y], [x + 2, y - 3.5], [x + 4, y + 3.5], [x + 6, y - 3.5], [x + 8, y]], false);
  }
  function coil(x, y, w, h) {
    g.rect(x, y, w, h, 0);
    g.line(x + 1, y + h - 2, x + w - 1, y + 2);
  }
  function pilot(x, y, dir) {
    g.poly([[x, y - 4], [x, y + 4], [x + dir * 5, y]], "ink");
  }
  function flow(x1, y1, x2, y2) {
    g.line(x1, y1, x2, y2);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const s = 2.1;
    g.poly([
      [x2, y2],
      [x2 - ux * s - uy * s * 0.7, y2 - uy * s + ux * s * 0.7],
      [x2 - ux * s + uy * s * 0.7, y2 - uy * s - ux * s * 0.7],
    ], "ink");
  }
  switch (shape.type) {
    case "air-compressor":
      g.line(2, 20, 8, 20);
      g.circle(22, 20, 11, false);
      g.poly([[14, 14], [14, 26], [32, 20]], "ink");
      g.line(33, 20, 38, 20);
      break;
    case "air-tank":
      g.rect(6, 12, 28, 16, 8);
      g.line(20, 12, 20, 4);
      g.line(20, 28, 20, 36);
      break;
    case "air-filter":
      g.poly([[20, 4], [34, 20], [20, 36], [6, 20]], true);
      g.line(11, 20, 15, 20);
      g.line(18, 20, 22, 20);
      g.line(25, 20, 29, 20);
      break;
    case "air-regulator":
      spring(16, 8);
      g.rect(8, 12, 24, 16, 0);
      g.line(2, 20, 8, 20);
      g.line(32, 20, 38, 20);
      g.arrow(12, 24, 28, 16);
      break;
    case "air-gauge":
      g.circle(20, 17, 12, false);
      g.line(20, 17, 28, 11);
      g.circle(20, 17, 1.4, true);
      g.line(20, 29, 20, 38);
      break;
    case "air-valve22":
      coil(1, 16, 7, 8);
      g.rect(8, 13, 10, 14, 0);
      g.rect(18, 13, 10, 14, 0);
      flow(11, 24, 15, 16);
      g.line(23, 13, 23, 18);
      g.line(20, 18, 26, 18);
      g.line(23, 27, 23, 22);
      g.line(20, 22, 26, 22);
      spring(28, 20);
      g.line(23, 3, 23, 13);
      g.line(23, 27, 23, 38);
      break;
    case "air-valve32":
      coil(1, 16, 7, 8);
      g.rect(8, 13, 10, 14, 0);
      g.rect(18, 13, 10, 14, 0);
      flow(11, 24, 15, 16);
      g.line(13, 24, 13, 27);
      g.line(11, 27, 15, 27);
      flow(21, 16, 26, 24);
      g.line(20, 24, 20, 27);
      g.line(18, 27, 22, 27);
      spring(28, 20);
      g.line(22, 3, 22, 13);
      g.line(20, 27, 20, 38);
      g.line(26, 27, 26, 38);
      break;
    case "air-valve52":
      coil(0, 16, 6, 8);
      g.rect(6, 12, 11, 16, 0);
      g.rect(17, 12, 11, 16, 0);
      flow(8, 25, 8, 15);
      flow(14, 15, 14, 25);
      flow(20, 25, 20, 15);
      flow(25, 15, 25, 25);
      spring(28, 20);
      g.line(20, 2, 20, 12);
      g.line(25, 2, 25, 12);
      g.line(19, 28, 19, 38);
      g.line(23, 28, 23, 38);
      g.line(27, 28, 27, 38);
      break;
    case "air-valve32-bi":
      pilot(1, 20, 1);
      g.rect(7, 13, 12, 14, 0);
      g.rect(19, 13, 12, 14, 0);
      pilot(37, 20, -1);
      flow(10, 24, 16, 16);
      flow(22, 16, 28, 24);
      g.line(23, 3, 23, 13);
      g.line(21, 27, 21, 38);
      g.line(28, 27, 28, 38);
      break;
    case "air-valve52-bi":
      pilot(0, 20, 1);
      g.rect(6, 12, 11, 16, 0);
      g.rect(17, 12, 11, 16, 0);
      pilot(36, 20, -1);
      flow(8, 25, 8, 15);
      flow(14, 15, 14, 25);
      flow(20, 25, 20, 15);
      flow(25, 15, 25, 25);
      g.line(20, 2, 20, 12);
      g.line(25, 2, 25, 12);
      g.line(19, 28, 19, 38);
      g.line(23, 28, 23, 38);
      g.line(27, 28, 27, 38);
      break;
    case "air-valve53":
      coil(0, 16, 5, 8);
      g.rect(5, 12, 9, 16, 0);
      g.rect(14, 12, 12, 16, 0);
      g.rect(26, 12, 9, 16, 0);
      coil(35, 16, 5, 8);
      flow(7, 25, 7, 15);
      flow(12, 15, 12, 25);
      g.line(17, 12, 17, 16);
      g.line(15, 16, 19, 16);
      g.line(23, 12, 23, 16);
      g.line(21, 16, 25, 16);
      g.line(16, 28, 16, 24);
      g.line(14, 24, 18, 24);
      g.line(20, 28, 20, 24);
      g.line(18, 24, 22, 24);
      g.line(24, 28, 24, 24);
      g.line(22, 24, 26, 24);
      flow(28, 25, 28, 15);
      flow(33, 15, 33, 25);
      g.line(17, 2, 17, 12);
      g.line(23, 2, 23, 12);
      g.line(16, 28, 16, 38);
      g.line(20, 28, 20, 38);
      g.line(24, 28, 24, 38);
      break;
    case "air-check":
      g.line(2, 20, 8, 20);
      g.poly([[8, 11], [8, 29], [24, 20]], "ink");
      g.line(24, 11, 24, 29);
      g.line(24, 20, 38, 20);
      break;
    case "air-cylinder":
      g.line(2, 20, 10, 20);
      g.rect(10, 12, 18, 16, 0);
      g.line(18, 12, 18, 28);
      g.line(28, 20, 38, 20);
      break;
    case "air-cylinder-sa":
      g.line(2, 20, 8, 20);
      g.rect(8, 12, 20, 16, 0);
      g.line(15, 12, 15, 28);
      g.poly([[17, 20], [19, 16], [21, 24], [23, 16], [25, 24], [26, 20]], false);
      g.line(28, 20, 38, 20);
      break;
    case "air-cylinder-da":
      g.line(2, 20, 8, 20);
      g.rect(8, 12, 20, 16, 0);
      g.line(16, 12, 16, 28);
      g.line(28, 20, 38, 20);
      g.line(24, 28, 24, 36);
      break;
    case "air-lubricator":
      g.line(2, 16, 10, 16);
      g.rect(10, 8, 20, 22, 0);
      g.line(30, 16, 38, 16);
      g.poly([[20, 14], [17, 20], [20, 25], [23, 20]], true);
      break;
    case "air-throttle":
      g.line(2, 11, 14, 11);
      g.line(14, 7, 20, 11);
      g.line(14, 15, 20, 11);
      g.arrow(12, 16, 22, 6);
      g.line(20, 11, 38, 11);
      g.line(2, 29, 14, 29);
      g.poly([[22, 24], [22, 34], [12, 29]], true);
      g.line(12, 24, 12, 34);
      g.line(22, 29, 38, 29);
      break;
    case "air-shuttle":
      g.line(2, 12, 14, 18);
      g.line(2, 28, 14, 22);
      g.line(14, 14, 14, 26);
      g.circle(18, 20, 2.4, true);
      g.line(21, 20, 38, 20);
      break;
    case "air-and":
      g.line(2, 12, 14, 12);
      g.line(2, 28, 14, 28);
      g.circle(14, 16, 2.2, true);
      g.circle(14, 24, 2.2, true);
      g.line(14, 12, 24, 20);
      g.line(14, 28, 24, 20);
      g.line(24, 20, 38, 20);
      break;
    case "air-quick":
      g.line(2, 24, 10, 24);
      g.poly([[10, 16], [10, 32], [24, 24]], true);
      g.line(24, 16, 24, 32);
      g.line(24, 24, 38, 24);
      g.line(16, 16, 16, 6);
      break;
    case "air-relief":
      g.line(2, 28, 12, 28);
      g.line(12, 22, 12, 34);
      g.arrow(12, 28, 22, 16);
      spring(24, 16);
      g.line(18, 8, 26, 4);
      g.line(22, 11, 30, 7);
      break;
    case "air-softstart":
      g.arrow(2, 28, 12, 16);
      g.rect(8, 13, 11, 14, 0);
      g.rect(19, 13, 11, 14, 0);
      g.arrow(10, 24, 16, 16);
      g.line(22, 23, 27, 23);
      g.line(24.5, 21, 24.5, 25);
      spring(30, 20);
      g.line(24, 7, 24, 13);
      g.line(24, 27, 24, 36);
      break;
    case "air-pswitch":
      g.line(20, 38, 20, 28);
      g.rect(11, 16, 18, 12, 0);
      g.arrow(14, 25, 26, 19);
      g.line(20, 16, 20, 10);
      g.line(14, 10, 20, 10);
      g.line(20, 10, 28, 5);
      break;
    case "air-solenoid":
      coil(10, 10, 20, 16);
      g.line(20, 26, 20, 36);
      break;
    case "air-reed":
      g.rect(2, 16, 14, 8, 0);
      g.poly([[18, 20], [24, 14], [30, 20], [24, 26]], true);
      g.line(30, 20, 36, 20);
      g.line(36, 16, 36, 24);
      g.line(36, 16, 39, 12);
      break;
    case "air-ejector":
      g.line(2, 20, 8, 20);
      g.poly([[8, 15], [18, 18], [18, 22], [8, 25]], true);
      g.poly([[20, 13], [36, 20], [20, 27]], true);
      g.line(18, 6, 18, 18);
      break;
    case "air-cup":
      g.line(20, 2, 20, 14);
      g.line(10, 16, 30, 16);
      g.line(10, 16, 6, 32);
      g.line(30, 16, 34, 32);
      break;
    case "air-motor":
      g.line(2, 20, 8, 20);
      g.circle(20, 20, 11, false);
      g.poly([[28, 14], [28, 26], [14, 20]], "ink");
      g.line(31, 20, 38, 20);
      break;
    case "air-silencer":
      g.line(20, 2, 20, 10);
      g.line(8, 14, 32, 14);
      g.line(11, 20, 29, 20);
      g.line(14, 26, 26, 26);
      g.line(17, 32, 23, 32);
      break;
    case "air-coupling":
      g.line(2, 20, 12, 20);
      g.line(12, 12, 12, 28);
      g.line(12, 12, 18, 16);
      g.line(12, 28, 18, 24);
      g.line(22, 16, 22, 24);
      g.line(22, 16, 28, 12);
      g.line(22, 24, 28, 28);
      g.line(28, 20, 38, 20);
      break;
    case "air-vibrator":
      g.line(2, 20, 8, 20);
      g.circle(22, 20, 12, false);
      g.circle(27, 15, 4, true);
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
  ports: {
    "veh-ecu": [
      { id: "n1", x: 4, y: 14, dir: "left" },
      { id: "n2", x: 4, y: 20, dir: "left" },
      { id: "n3", x: 4, y: 26, dir: "left" },
      { id: "n4", x: 36, y: 14, dir: "right" },
      { id: "n5", x: 36, y: 20, dir: "right" },
      { id: "n6", x: 36, y: 26, dir: "right" },
    ],
  },
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
    schemeMaster("air", "air-valve22", "2/2 valve"),
    schemeMaster("air", "air-valve32-bi", "3/2 bistable"),
    schemeMaster("air", "air-valve52-bi", "5/2 bistable"),
    schemeMaster("air", "air-valve53", "5/3 valve"),
    schemeMaster("air", "air-check", "Check valve"),
    schemeMaster("air", "air-throttle", "Flow control"),
    schemeMaster("air", "air-shuttle", "Shuttle valve"),
    schemeMaster("air", "air-and", "Two-pressure valve"),
    schemeMaster("air", "air-quick", "Quick exhaust"),
    schemeMaster("air", "air-relief", "Relief valve"),
    schemeMaster("air", "air-softstart", "Soft-start valve"),
    schemeMaster("air", "air-cylinder", "Cylinder"),
    schemeMaster("air", "air-cylinder-sa", "Single-acting cylinder"),
    schemeMaster("air", "air-cylinder-da", "Double-acting cylinder"),
    schemeMaster("air", "air-lubricator", "Lubricator"),
    schemeMaster("air", "air-pswitch", "Pressure switch"),
    schemeMaster("air", "air-solenoid", "Solenoid"),
    schemeMaster("air", "air-reed", "Cylinder sensor"),
    schemeMaster("air", "air-ejector", "Vacuum generator"),
    schemeMaster("air", "air-cup", "Suction cup"),
    schemeMaster("air", "air-motor", "Air motor"),
    schemeMaster("air", "air-silencer", "Silencer"),
    schemeMaster("air", "air-coupling", "Coupling"),
    schemeMaster("air", "air-vibrator", "Pneumatic vibrator"),
  ],
  draw: drawAirSymbol,
  iconBox: schemeIconBox,
  iconPoint: schemeIconPoint,
  ports: {
    "air-valve22": [
      { id: "p2", x: 23, y: 3 },
      { id: "p1", x: 23, y: 38 },
    ],
    "air-valve32": [
      { id: "p2", x: 22, y: 3 },
      { id: "p1", x: 20, y: 38 },
      { id: "p3", x: 26, y: 38 },
    ],
    "air-valve32-bi": [
      { id: "p2", x: 23, y: 3 },
      { id: "p1", x: 21, y: 38 },
      { id: "p3", x: 28, y: 38 },
    ],
    "air-valve52": [
      { id: "p2", x: 20, y: 2 },
      { id: "p4", x: 25, y: 2 },
      { id: "p3", x: 19, y: 38 },
      { id: "p1", x: 23, y: 38 },
      { id: "p5", x: 27, y: 38 },
    ],
    "air-valve52-bi": [
      { id: "p2", x: 20, y: 2 },
      { id: "p4", x: 25, y: 2 },
      { id: "p3", x: 19, y: 38 },
      { id: "p1", x: 23, y: 38 },
      { id: "p5", x: 27, y: 38 },
    ],
    "air-valve53": [
      { id: "p2", x: 17, y: 2 },
      { id: "p4", x: 23, y: 2 },
      { id: "p3", x: 16, y: 38 },
      { id: "p1", x: 20, y: 38 },
      { id: "p5", x: 24, y: 38 },
    ],
    "air-cylinder-da": [
      { id: "n1", x: 2, y: 20, dir: "left" },
      { id: "n2", x: 24, y: 36, dir: "bottom" },
    ],
    "air-shuttle": [
      { id: "n1", x: 2, y: 12, dir: "left" },
      { id: "n2", x: 2, y: 28, dir: "left" },
      { id: "n3", x: 38, y: 20, dir: "right" },
    ],
    "air-and": [
      { id: "n1", x: 2, y: 12, dir: "left" },
      { id: "n2", x: 2, y: 28, dir: "left" },
      { id: "n3", x: 38, y: 20, dir: "right" },
    ],
    "air-quick": [
      { id: "n1", x: 2, y: 24, dir: "left" },
      { id: "n2", x: 38, y: 24, dir: "right" },
      { id: "n3", x: 16, y: 6, dir: "top" },
    ],
    "air-ejector": [
      { id: "n1", x: 2, y: 20, dir: "left" },
      { id: "n2", x: 18, y: 6, dir: "top" },
      { id: "n3", x: 36, y: 20, dir: "right" },
    ],
  },
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
  ports: {
    "h2o-mixer": [
      { id: "n1", x: 6, y: 32, dir: "bottom" },
      { id: "n2", x: 34, y: 32, dir: "bottom" },
      { id: "n3", x: 20, y: 4, dir: "top" },
    ],
  },
};
