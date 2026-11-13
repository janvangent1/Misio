"use strict";

// Network diagram symbols. Most names sit under the icon. A switch keeps its name inside the chassis.

function netIconBox(shape) {
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

function netPen(parent, paint, box) {
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
  function curve(d, filled) {
    el("path", {
      d, fill: filled ? paint.fill : "none",
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
    const s = 3.4;
    poly([
      [x2, y2],
      [x2 - ux * s - uy * s * 0.55, y2 - uy * s + ux * s * 0.55],
      [x2 - ux * s + uy * s * 0.55, y2 - uy * s - ux * s * 0.55],
    ], "ink");
  }
  return { line, circle, rect, poly, curve, arrow, X, Y };
}

function netCloud(g) {
  const d = [
    `M ${g.X(12)} ${g.Y(26)}`,
    `C ${g.X(4)} ${g.Y(26)}, ${g.X(5)} ${g.Y(16)}, ${g.X(14)} ${g.Y(16)}`,
    `C ${g.X(16)} ${g.Y(8)}, ${g.X(26)} ${g.Y(9)}, ${g.X(28)} ${g.Y(16)}`,
    `C ${g.X(36)} ${g.Y(15)}, ${g.X(37)} ${g.Y(26)}, ${g.X(28)} ${g.Y(28)}`,
    `C ${g.X(22)} ${g.Y(33)}, ${g.X(14)} ${g.Y(32)}, ${g.X(12)} ${g.Y(26)}`,
    "Z",
  ].join(" ");
  g.curve(d, true);
}

function netRouter(g) {
  g.circle(20, 22, 5.5, false);
  g.arrow(20, 16, 20, 6);
  g.arrow(26, 22, 36, 22);
  g.arrow(20, 28, 20, 37);
  g.arrow(14, 22, 5, 22);
}

function jackCount(type) {
  if (type === "net-switch-4") return 4;
  if (type === "net-switch") return 8;
  if (type === "net-switch-24" || type === "net-patch") return 24;
  return 0;
}

function jackFrame(shape) {
  const inset = 0.06;
  const height = Math.max(28, Math.min(shape.h * 0.55, 48));
  return {
    x: shape.x + shape.w * inset,
    y: shape.y + 6,
    w: shape.w * (1 - inset * 2),
    h: height,
  };
}

function jackCaptionBox(shape) {
  const frame = jackFrame(shape);
  const jackH = Math.min(10, frame.h * 0.38);
  const pad = 8;
  return {
    x: frame.x + pad,
    y: frame.y + 2,
    w: Math.max(24, frame.w - pad * 2),
    h: Math.max(14, frame.h - jackH - 8),
  };
}

function netCaptionBox(shape) {
  return jackCount(shape.type) ? jackCaptionBox(shape) : null;
}

function drawJackRow(parent, shape, paint, count) {
  const frame = jackFrame(shape);
  el("rect", {
    x: frame.x, y: frame.y, width: frame.w, height: frame.h, rx: 4,
    fill: paint.fill, stroke: paint.stroke, "stroke-width": paint.sw,
  }, parent);
  const jackW = Math.min(8, (frame.w / count) * 0.46);
  const jackH = Math.min(10, frame.h * 0.38);
  for (let i = 0; i < count; i += 1) {
    const cx = frame.x + frame.w * (i + 0.5) / count;
    el("rect", {
      x: cx - jackW / 2,
      y: frame.y + frame.h - jackH - 4,
      width: jackW,
      height: jackH,
      rx: 1,
      fill: paint.fill,
      stroke: paint.stroke,
      "stroke-width": paint.sw,
    }, parent);
    el("line", {
      x1: cx, y1: frame.y + frame.h - 4, x2: cx, y2: shape.y + shape.h,
      stroke: paint.stroke, "stroke-width": paint.sw, "stroke-linecap": "round",
    }, parent);
  }
}

function rowPorts(count) {
  const inset = 0.06;
  const ports = [];
  for (let i = 0; i < count; i += 1) {
    ports.push({
      id: "n" + (i + 1),
      x: inset + (1 - inset * 2) * ((i + 0.5) / count),
      y: 1,
      dir: "bottom",
      edge: true,
    });
  }
  return ports;
}

function drawNetworkSymbol(parent, shape, paint) {
  const count = jackCount(shape.type);
  if (count) {
    drawJackRow(parent, shape, paint, count);
    return;
  }
  const g = netPen(parent, paint, netIconBox(shape));
  switch (shape.type) {
    case "net-server":
      g.rect(12, 4, 16, 32, 1.5);
      g.line(15, 11, 25, 11);
      g.line(15, 17, 25, 17);
      g.line(15, 23, 25, 23);
      g.circle(16, 31, 1.3, true);
      break;
    case "net-rack":
      g.rect(10, 3, 20, 34, 1);
      for (let y = 8; y <= 32; y += 6) g.line(12, y, 28, y);
      break;
    case "net-hub":
      g.circle(20, 20, 6, false);
      g.line(20, 14, 20, 4);
      g.line(20, 26, 20, 36);
      g.line(26, 20, 36, 20);
      g.line(14, 20, 4, 20);
      g.line(24, 16, 32, 8);
      g.line(16, 16, 8, 8);
      break;
    case "net-router":
      netRouter(g);
      break;
    case "net-wifi-router":
      netRouter(g);
      g.curve(`M ${g.X(27)} ${g.Y(12)} Q ${g.X(32)} ${g.Y(6)} ${g.X(37)} ${g.Y(12)}`, false);
      g.curve(`M ${g.X(29)} ${g.Y(14)} Q ${g.X(32)} ${g.Y(10)} ${g.X(35)} ${g.Y(14)}`, false);
      break;
    case "net-firewall":
      g.rect(5, 8, 30, 24, 1);
      g.line(5, 16, 35, 16);
      g.line(5, 24, 35, 24);
      g.line(15, 8, 15, 16);
      g.line(25, 8, 25, 16);
      g.line(10, 16, 10, 24);
      g.line(20, 16, 20, 24);
      g.line(30, 16, 30, 24);
      g.line(15, 24, 15, 32);
      g.line(25, 24, 25, 32);
      break;
    case "net-ap":
      g.rect(14, 24, 12, 6, 1);
      g.line(20, 30, 20, 36);
      g.line(14, 36, 26, 36);
      g.curve(`M ${g.X(12)} ${g.Y(20)} Q ${g.X(20)} ${g.Y(12)} ${g.X(28)} ${g.Y(20)}`, false);
      g.curve(`M ${g.X(8)} ${g.Y(16)} Q ${g.X(20)} ${g.Y(4)} ${g.X(32)} ${g.Y(16)}`, false);
      break;
    case "net-cloud":
    case "net-internet":
      netCloud(g);
      break;
    case "net-pc":
      g.rect(8, 6, 24, 16, 1);
      g.line(20, 22, 20, 30);
      g.line(12, 30, 28, 30);
      break;
    case "net-laptop":
      g.poly([[12, 8], [28, 8], [26, 22], [14, 22]], true);
      g.line(6, 26, 34, 26);
      g.line(8, 29, 32, 29);
      break;
    case "net-printer":
      g.rect(12, 6, 16, 6, 0.5);
      g.rect(6, 12, 28, 14, 1);
      g.line(8, 30, 32, 30);
      g.line(10, 33, 30, 33);
      break;
    case "net-phone":
      g.rect(12, 14, 16, 18, 2);
      g.rect(15, 18, 8, 6, 0.5);
      g.curve(`M ${g.X(14)} ${g.Y(12)} Q ${g.X(20)} ${g.Y(4)} ${g.X(26)} ${g.Y(12)}`, false);
      g.line(14, 12, 16, 14);
      g.line(26, 12, 24, 14);
      break;
    case "net-tablet":
      g.rect(11, 4, 18, 32, 2);
      g.circle(20, 32, 1.2, true);
      break;
    case "net-nas":
      g.rect(8, 6, 24, 28, 1);
      g.line(12, 14, 28, 14);
      g.line(12, 22, 28, 22);
      g.circle(26, 11, 1.3, true);
      g.circle(26, 19, 1.3, true);
      g.circle(26, 27, 1.3, true);
      break;
    case "net-balancer":
      g.rect(14, 4, 12, 8, 1);
      g.line(20, 12, 20, 20);
      g.line(20, 20, 8, 28);
      g.line(20, 20, 32, 28);
      g.arrow(8, 28, 8, 36);
      g.arrow(32, 28, 32, 36);
      break;
    case "net-modem":
      g.rect(6, 14, 28, 14, 1.5);
      g.circle(12, 21, 1.4, true);
      g.circle(17, 21, 1.4, true);
      g.line(20, 4, 20, 14);
      g.line(26, 8, 34, 8);
      break;
    case "net-ups":
      g.rect(12, 10, 16, 22, 1);
      g.rect(16, 6, 8, 4, 0.4);
      g.line(16, 18, 24, 18);
      g.line(16, 23, 22, 23);
      g.line(16, 28, 20, 28);
      break;
    case "net-camera":
      g.rect(4, 16, 18, 12, 1);
      g.circle(28, 22, 6, false);
      g.circle(28, 22, 2.4, true);
      g.line(10, 28, 16, 34);
      g.line(16, 34, 24, 34);
      break;
    case "net-patch":
      g.rect(3, 12, 34, 16, 1);
      for (let x = 6; x <= 32; x += 4) g.rect(x, 16, 2.4, 8, 0.3);
      break;
    case "net-hub":
      g.circle(20, 20, 6, false);
      g.line(20, 14, 20, 4);
      g.line(20, 26, 20, 36);
      g.line(26, 20, 36, 20);
      g.line(14, 20, 4, 20);
      g.line(24, 16, 32, 8);
      g.line(16, 16, 8, 8);
      break;
    case "net-gateway":
      g.rect(6, 8, 28, 24, 1);
      g.arrow(10, 20, 30, 20);
      break;
    default:
      g.rect(8, 8, 24, 24, 2);
  }
}

function netMaster(type, name, w, h) {
  return {
    category: "network",
    type,
    name,
    text: name,
    w: w || 136,
    h: h || 104,
  };
}

window.MisioNetwork = {
  categories: [
    { id: "network", name: "Network" },
  ],
  masters: [
    netMaster("net-server", "Server"),
    netMaster("net-rack", "Rack"),
    netMaster("net-switch-4", "4-port switch", 168, 88),
    netMaster("net-switch", "8-port switch", 248, 88),
    netMaster("net-switch-24", "24-port switch", 560, 88),
    netMaster("net-router", "Router"),
    netMaster("net-wifi-router", "Wireless router"),
    netMaster("net-firewall", "Firewall"),
    netMaster("net-ap", "Access point"),
    netMaster("net-cloud", "Cloud"),
    netMaster("net-internet", "Internet"),
    netMaster("net-gateway", "Gateway"),
    netMaster("net-balancer", "Load balancer"),
    netMaster("net-modem", "Modem"),
    netMaster("net-hub", "Hub"),
    netMaster("net-patch", "Patch panel", 560, 88),
    netMaster("net-nas", "NAS"),
    netMaster("net-ups", "UPS"),
    netMaster("net-pc", "Workstation"),
    netMaster("net-laptop", "Laptop"),
    netMaster("net-tablet", "Tablet"),
    netMaster("net-phone", "IP phone"),
    netMaster("net-printer", "Printer"),
    netMaster("net-camera", "IP camera"),
  ],
  draw: drawNetworkSymbol,
  iconBox: netIconBox,
  captionBox: netCaptionBox,
  ports: {
    "net-switch-4": rowPorts(4),
    "net-switch": rowPorts(8),
    "net-switch-24": rowPorts(24),
    "net-patch": rowPorts(24),
    "net-hub": [
      { id: "n1", x: 20, y: 4, dir: "top" },
      { id: "n2", x: 36, y: 20, dir: "right" },
      { id: "n3", x: 20, y: 36, dir: "bottom" },
      { id: "n4", x: 4, y: 20, dir: "left" },
      { id: "n5", x: 32, y: 8, dir: "top" },
      { id: "n6", x: 8, y: 8, dir: "top" },
    ],
    "net-balancer": [
      { id: "n1", x: 20, y: 4, dir: "top" },
      { id: "n2", x: 8, y: 36, dir: "bottom" },
      { id: "n3", x: 32, y: 36, dir: "bottom" },
    ],
    "net-server": [
      { id: "top", x: 20, y: 4, dir: "top" },
      { id: "right", x: 28, y: 20, dir: "right" },
      { id: "bottom", x: 20, y: 36, dir: "bottom" },
      { id: "left", x: 12, y: 20, dir: "left" },
    ],
    "net-rack": [
      { id: "top", x: 20, y: 3, dir: "top" },
      { id: "right", x: 30, y: 20, dir: "right" },
      { id: "bottom", x: 20, y: 37, dir: "bottom" },
      { id: "left", x: 10, y: 20, dir: "left" },
    ],
    "net-router": [
      { id: "top", x: 20, y: 6, dir: "top" },
      { id: "right", x: 36, y: 22, dir: "right" },
      { id: "bottom", x: 20, y: 37, dir: "bottom" },
      { id: "left", x: 5, y: 22, dir: "left" },
    ],
    "net-wifi-router": [
      { id: "top", x: 20, y: 6, dir: "top" },
      { id: "right", x: 36, y: 22, dir: "right" },
      { id: "bottom", x: 20, y: 37, dir: "bottom" },
      { id: "left", x: 5, y: 22, dir: "left" },
    ],
    "net-firewall": [
      { id: "top", x: 20, y: 8, dir: "top" },
      { id: "right", x: 35, y: 20, dir: "right" },
      { id: "bottom", x: 20, y: 32, dir: "bottom" },
      { id: "left", x: 5, y: 20, dir: "left" },
    ],
    "net-ap": [{ id: "bottom", x: 20, y: 36, dir: "bottom" }],
    "net-cloud": [
      { id: "top", x: 14, y: 16, dir: "top" },
      { id: "right", x: 28, y: 16, dir: "right" },
      { id: "bottom", x: 28, y: 28, dir: "bottom" },
      { id: "left", x: 12, y: 26, dir: "left" },
    ],
    "net-internet": [
      { id: "top", x: 14, y: 16, dir: "top" },
      { id: "right", x: 28, y: 16, dir: "right" },
      { id: "bottom", x: 28, y: 28, dir: "bottom" },
      { id: "left", x: 12, y: 26, dir: "left" },
    ],
    "net-gateway": [
      { id: "top", x: 20, y: 8, dir: "top" },
      { id: "right", x: 34, y: 20, dir: "right" },
      { id: "bottom", x: 20, y: 32, dir: "bottom" },
      { id: "left", x: 6, y: 20, dir: "left" },
    ],
    "net-modem": [
      { id: "top", x: 20, y: 4, dir: "top" },
      { id: "right", x: 34, y: 21, dir: "right" },
      { id: "left", x: 6, y: 21, dir: "left" },
    ],
    "net-pc": [
      { id: "top", x: 20, y: 6, dir: "top" },
      { id: "bottom", x: 20, y: 30, dir: "bottom" },
    ],
    "net-laptop": [{ id: "bottom", x: 20, y: 29, dir: "bottom" }],
    "net-printer": [{ id: "bottom", x: 20, y: 33, dir: "bottom" }],
    "net-phone": [
      { id: "top", x: 20, y: 14, dir: "top" },
      { id: "right", x: 28, y: 23, dir: "right" },
      { id: "bottom", x: 20, y: 32, dir: "bottom" },
      { id: "left", x: 12, y: 23, dir: "left" },
    ],
    "net-tablet": [
      { id: "top", x: 20, y: 4, dir: "top" },
      { id: "right", x: 29, y: 20, dir: "right" },
      { id: "bottom", x: 20, y: 36, dir: "bottom" },
      { id: "left", x: 11, y: 20, dir: "left" },
    ],
    "net-nas": [
      { id: "top", x: 20, y: 6, dir: "top" },
      { id: "right", x: 32, y: 20, dir: "right" },
      { id: "bottom", x: 20, y: 34, dir: "bottom" },
      { id: "left", x: 8, y: 20, dir: "left" },
    ],
    "net-ups": [
      { id: "top", x: 20, y: 6, dir: "top" },
      { id: "right", x: 28, y: 21, dir: "right" },
      { id: "bottom", x: 20, y: 32, dir: "bottom" },
      { id: "left", x: 12, y: 21, dir: "left" },
    ],
    "net-camera": [
      { id: "left", x: 4, y: 22, dir: "left" },
      { id: "right", x: 34, y: 22, dir: "right" },
    ],
  },
};
