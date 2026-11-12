"use strict";

// Symbols from AREI Boek 1, tabel 2.23 (eendraadschema). Supply enters from the top.

function areiCaptionReserve(text) {
  const lines = Math.min(3, String(text || "").trim().split("\n").length);
  return lines ? 8 + lines * 15 : 0;
}

function areiIconBox(shape) {
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
  const reserve = areiCaptionReserve(text);
  const size = Math.max(28, Math.min(shape.w - pad * 2, shape.h - reserve));
  return {
    x: shape.x + (shape.w - size) / 2,
    y: shape.y + 2,
    w: size,
    h: size,
  };
}

function areiPen(parent, paint, box) {
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
  function rect(x, y, w, h, dashed) {
    el("rect", {
      x: X(x), y: Y(y),
      width: (w / 40) * size, height: (h / 40) * size,
      fill: "none", stroke, "stroke-width": sw,
      "stroke-dasharray": dashed ? `${Math.max(2, size / 10)} ${Math.max(1.6, size / 14)}` : null,
    }, parent);
  }
  function poly(points, filled) {
    const d = points.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(" ");
    el("path", {
      d: filled ? `${d} Z` : d,
      fill: filled ? stroke : "none",
      stroke, "stroke-width": sw, "stroke-linejoin": "round", "stroke-linecap": "round",
    }, parent);
  }
  function arc(x1, y1, rx, ry, x2, y2) {
    el("path", {
      d: `M ${X(x1)} ${Y(y1)} A ${(rx / 40) * size} ${(ry / 40) * size} 0 0 1 ${X(x2)} ${Y(y2)}`,
      fill: "none", stroke, "stroke-width": sw, "stroke-linecap": "round",
    }, parent);
  }
  function label(x, y, value, unitSize) {
    const node = el("text", {
      x: X(x), y: Y(y),
      fill: stroke,
      "font-size": ((unitSize || 10) / 40) * size,
      "font-family": "Segoe UI, Helvetica Neue, sans-serif",
      "font-weight": 600,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
    }, parent);
    node.textContent = value;
  }
  function hatch(x, y, w, h, step) {
    rect(x, y, w, h);
    for (let i = x + step; i < x + w - 0.5; i += step) line(i, y, i, y + h);
  }
  return { line, circle, rect, poly, arc, label, hatch };
}

function areiSocket(g, opt) {
  g.line(20, 1, 20, 11);
  if (opt.pe) g.line(10, 11, 30, 11);
  if (opt.multi) {
    g.arc(4, 24, 5, 6, 14, 24);
    g.arc(15, 24, 5, 6, 25, 24);
    g.arc(26, 24, 5, 6, 36, 24);
    if (opt.child) {
      g.line(4, 24, 4, 31);
      g.line(36, 24, 36, 31);
    }
    return;
  }
  g.arc(10, 24, 10, 10, 30, 24);
  if (opt.child) {
    g.line(10, 24, 10, 31);
    g.line(30, 24, 30, 31);
  }
  if (opt.h) g.label(34, 14, "h", 9);
}

function areiSwitch(g, opt) {
  if (opt.inBoard) g.rect(6, 4, 28, 32);
  const cy = opt.push ? 20 : 26;
  if (opt.push) {
    g.circle(20, cy, 8, false);
    g.circle(20, cy, 3.2, false);
    if (opt.lamp) g.circle(32, 10, 2.4, false);
    if (opt.glass) g.rect(8, 8, 24, 24);
    return;
  }
  if (opt.cross) {
    g.circle(20, 22, 6, false);
    g.line(8, 12, 32, 32);
    g.line(8, 32, 32, 12);
    g.line(5, 10, 9, 14);
    g.line(5, 30, 9, 28);
    g.line(31, 10, 35, 14);
    g.line(31, 34, 35, 30);
    return;
  }
  if (opt.twoWay) {
    g.circle(20, 22, 6, false);
    g.line(4, 32, 16, 22);
    g.line(24, 22, 36, 10);
    g.line(2, 28, 6, 32);
    g.line(34, 6, 38, 10);
    if (opt.poles === 2) {
      g.line(6, 34, 16, 26);
      g.line(24, 26, 34, 14);
    }
    return;
  }
  g.circle(16, cy, 5.5, false);
  if (opt.series) {
    g.line(16, cy, 28, 12);
    g.line(16, cy, 32, 18);
  } else if (opt.poles === 2) {
    g.line(14, cy, 28, 12);
    g.line(18, cy, 32, 12);
  } else {
    g.line(16, cy, 30, 12);
  }
  if (opt.dimmer) g.poly([[27, 15], [36, 8], [30, 6]]);
  if (opt.poles === 3) g.label(34, 8, "3", 8);
  if (opt.lamp) g.circle(33, 30, 2.6, false);
  if (opt.pilot) g.circle(33, 32, 2.4, true);
  if (opt.delay) g.arc(18, 34, 7, 5, 32, 30);
  if (opt.pull) g.line(16, cy + 5, 16, 38);
}

function areiLight(g, opt) {
  if (opt.box) g.rect(6, 8, 28, 28);
  g.line(10, 12, 30, 32);
  g.line(30, 12, 10, 32);
  if (opt.dot) g.circle(20, 22, 2.2, true);
  if (opt.wall) g.line(33, 10, 33, 34);
  if (opt.switched) {
    g.circle(33, 16, 2.5, false);
    g.line(33, 16, 38, 10);
  }
}

function areiBreaker(g, opt) {
  if (opt.dashed) g.rect(4, 6, 32, 28, true);
  g.circle(14, 28, 2.1, true);
  g.line(14, 28, 28, 14);
  g.poly([[24, 16], [33, 11], [30, 6], [21, 11]], true);
  if (opt.ring) g.circle(10, 16, 3.2, false);
}

function drawAreiSymbol(parent, shape, paint) {
  const g = areiPen(parent, paint, areiIconBox(shape));
  switch (shape.type) {
    case "arei-dc":
      g.line(8, 16, 32, 16);
      g.line(10, 22, 14, 22); g.line(18, 22, 22, 22); g.line(26, 22, 30, 22);
      break;
    case "arei-ac":
      g.arc(8, 20, 6, 6, 20, 20);
      g.arc(20, 20, 6, 6, 32, 20);
      break;
    case "arei-ac1": g.label(20, 20, "1~", 16); break;
    case "arei-ac3": g.label(20, 20, "3~", 16); break;
    case "arei-board": g.rect(4, 10, 32, 20); break;
    case "arei-board-feeds":
      g.rect(6, 4, 28, 16);
      for (let i = 0; i < 5; i += 1) g.line(10 + i * 5, 20, 10 + i * 5, 34);
      break;
    case "arei-box": g.rect(8, 8, 24, 24); break;
    case "arei-junction": g.circle(20, 20, 10, false); g.circle(20, 20, 4, true); break;
    case "arei-node":
      g.line(0, 20, 40, 20);
      g.line(20, 0, 20, 40);
      g.circle(20, 20, 2.4, true);
      break;
    case "arei-branchbox":
      g.rect(8, 8, 24, 18);
      g.line(20, 2, 20, 8);
      g.line(14, 26, 14, 36);
      g.line(26, 26, 26, 36);
      g.line(14, 26, 26, 26);
      break;
    case "arei-earth-link":
      g.line(2, 20, 12, 20);
      g.line(28, 20, 38, 20);
      g.line(12, 12, 12, 28);
      g.line(16, 15, 16, 25);
      g.line(24, 15, 24, 25);
      g.line(28, 12, 28, 28);
      break;
    case "arei-line": g.line(2, 20, 38, 20); break;
    case "arei-line-buried":
      g.line(2, 14, 38, 14);
      for (let x = 8; x <= 32; x += 8) g.line(x, 14, x, 26);
      break;
    case "arei-line-overhead":
      g.line(2, 26, 38, 26);
      g.circle(12, 16, 3.2, false);
      g.circle(28, 16, 3.2, false);
      break;
    case "arei-line-conduit":
      g.line(2, 20, 38, 20);
      g.circle(20, 20, 7, false);
      break;
    case "arei-line-bundle":
      for (let row = 0; row < 2; row += 1) {
        for (let col = 0; col < 3; col += 1) g.circle(10 + col * 10, 14 + row * 12, 4, false);
      }
      break;
    case "arei-line-inwall":
      g.line(4, 28, 36, 28);
      g.line(12, 28, 12, 10); g.line(12, 14, 20, 14); g.line(12, 20, 20, 20); g.line(12, 26, 20, 26);
      g.line(24, 28, 24, 10); g.line(24, 14, 32, 14); g.line(24, 20, 32, 20); g.line(24, 26, 32, 26);
      break;
    case "arei-line-onwall":
      g.line(4, 12, 36, 12);
      g.line(12, 12, 12, 30); g.line(12, 16, 20, 16); g.line(12, 22, 20, 22); g.line(12, 28, 20, 28);
      g.line(24, 12, 24, 30); g.line(24, 16, 32, 16); g.line(24, 22, 32, 22); g.line(24, 28, 32, 28);
      break;
    case "arei-line-conduit-wall":
      g.line(4, 30, 36, 30);
      g.line(10, 30, 10, 12); g.line(10, 16, 18, 16); g.line(10, 22, 18, 22); g.line(10, 28, 18, 28);
      g.circle(28, 20, 6, false);
      g.line(22, 20, 34, 20);
      break;
    case "arei-line-two":
      g.line(2, 15, 38, 15);
      g.line(2, 25, 38, 25);
      break;
    case "arei-line-n":
      g.line(2, 12, 38, 12);
      g.line(2, 22, 38, 22);
      g.line(2, 32, 16, 32);
      g.label(28, 32, "n", 11);
      break;
    case "arei-cond-3":
      g.line(14, 30, 26, 8);
      g.label(30, 28, "3", 12);
      break;
    case "arei-cond-n":
      g.line(14, 30, 26, 8);
      g.label(30, 28, "n", 12);
      break;
    case "arei-fuse":
      g.line(20, 1, 20, 12);
      g.rect(13, 12, 14, 16);
      g.line(20, 28, 20, 39);
      break;
    case "arei-breaker": areiBreaker(g, {}); break;
    case "arei-rcd": areiBreaker(g, { dashed: true, ring: true }); break;
    case "arei-rcbo": areiBreaker(g, { dashed: true, ring: true }); break;
    case "arei-earth":
      g.line(20, 2, 20, 16);
      g.line(6, 16, 34, 16);
      g.line(11, 23, 29, 23);
      g.line(16, 30, 24, 30);
      break;
    case "arei-switch": areiSwitch(g, {}); break;
    case "arei-switch-lamp": areiSwitch(g, { lamp: true }); break;
    case "arei-switch-delay": areiSwitch(g, { delay: true }); break;
    case "arei-switch-2p": areiSwitch(g, { poles: 2 }); break;
    case "arei-switch-3p": areiSwitch(g, { poles: 3 }); break;
    case "arei-switch-series": areiSwitch(g, { series: true }); break;
    case "arei-switch-two-way": areiSwitch(g, { twoWay: true }); break;
    case "arei-switch-two-way-2p": areiSwitch(g, { twoWay: true, poles: 2 }); break;
    case "arei-switch-cross": areiSwitch(g, { cross: true }); break;
    case "arei-dimmer": areiSwitch(g, { dimmer: true }); break;
    case "arei-pull": areiSwitch(g, { pull: true }); break;
    case "arei-switch-pilot": areiSwitch(g, { pilot: true }); break;
    case "arei-push": areiSwitch(g, { push: true }); break;
    case "arei-push-lamp": areiSwitch(g, { push: true, lamp: true }); break;
    case "arei-push-glass": areiSwitch(g, { push: true, glass: true }); break;
    case "arei-timer":
      g.rect(8, 8, 24, 24);
      g.circle(20, 20, 6, false);
      g.line(20, 20, 20, 15);
      g.line(20, 20, 24, 22);
      break;
    case "arei-clock":
      g.circle(20, 20, 12, false);
      g.line(20, 20, 20, 12);
      g.line(20, 20, 26, 23);
      break;
    case "arei-impulse":
      g.rect(6, 10, 28, 20);
      g.line(14, 16, 14, 24);
      g.line(14, 16, 18, 16);
      g.line(26, 16, 26, 24);
      g.line(22, 24, 26, 24);
      break;
    case "arei-thermostat":
      g.rect(6, 8, 28, 24);
      g.circle(20, 20, 6, false);
      g.line(14, 20, 26, 20);
      break;
    case "arei-lock-check":
      g.circle(20, 18, 8, false);
      g.rect(17, 24, 6, 10);
      g.circle(20, 18, 2, true);
      break;
    case "arei-sensor":
      g.rect(12, 14, 16, 20);
      g.arc(12, 12, 6, 6, 20, 8);
      g.arc(20, 8, 6, 6, 28, 12);
      break;
    case "arei-switch-board": areiSwitch(g, { inBoard: true }); break;
    case "arei-socket": areiSocket(g, {}); break;
    case "arei-socket-multi": areiSocket(g, { pe: true, child: true, multi: true }); break;
    case "arei-socket-h": areiSocket(g, { pe: true, child: true, h: true }); break;
    case "arei-socket-pe": areiSocket(g, { pe: true }); break;
    case "arei-socket-child": areiSocket(g, { child: true }); break;
    case "arei-socket-pe-child": areiSocket(g, { pe: true, child: true }); break;
    case "arei-socket-switch":
      areiSocket(g, { pe: true, child: true });
      g.circle(33, 14, 2.4, false);
      g.line(33, 14, 38, 8);
      break;
    case "arei-socket-lock":
      areiSocket(g, { pe: true, child: true });
      g.rect(30, 6, 7, 8);
      g.circle(33.5, 9, 1.4, true);
      break;
    case "arei-socket-shave":
      g.line(20, 1, 20, 8);
      g.circle(20, 14, 7, false);
      g.arc(10, 28, 10, 9, 30, 28);
      break;
    case "arei-data":
      g.line(20, 1, 20, 10);
      g.line(14, 10, 14, 32);
      g.line(14, 10, 26, 10);
      g.line(14, 32, 26, 32);
      break;
    case "arei-socket-board":
      g.rect(4, 4, 32, 32);
      areiSocket(g, { pe: true, child: true });
      break;
    case "arei-light": areiLight(g, {}); break;
    case "arei-light-wall": areiLight(g, { wall: true }); break;
    case "arei-light-fluo":
      g.line(6, 20, 34, 20);
      g.line(8, 15, 8, 25);
      g.line(32, 15, 32, 25);
      break;
    case "arei-light-fluo-3":
      for (let y = 12; y <= 28; y += 8) {
        g.line(8, y, 32, y);
        g.line(10, y - 3, 10, y + 3);
        g.line(30, y - 3, 30, y + 3);
      }
      break;
    case "arei-projector":
      g.circle(12, 20, 5, false);
      g.poly([[16, 16], [34, 10], [34, 30], [16, 24]]);
      break;
    case "arei-projector-narrow":
      g.circle(12, 20, 5, false);
      g.poly([[16, 17], [34, 14], [34, 26], [16, 23]]);
      break;
    case "arei-projector-wide":
      g.circle(12, 20, 5, false);
      g.poly([[16, 16], [34, 4], [34, 36], [16, 24]]);
      break;
    case "arei-light-switch": areiLight(g, { switched: true }); break;
    case "arei-light-safety": areiLight(g, { dot: true }); break;
    case "arei-light-safety-auto": areiLight(g, { dot: true, box: true }); break;
    case "arei-ballast":
      g.rect(8, 10, 24, 20);
      g.arc(12, 20, 4, 4, 20, 20);
      g.arc(20, 20, 4, 4, 28, 20);
      break;
    case "arei-bell":
      g.arc(10, 26, 10, 12, 30, 26);
      g.line(10, 26, 30, 26);
      g.circle(20, 18, 2, true);
      break;
    case "arei-buzzer":
      g.circle(20, 20, 10, false);
      g.line(14, 16, 18, 20); g.line(18, 20, 14, 24);
      g.line(22, 16, 26, 20); g.line(26, 20, 22, 24);
      break;
    case "arei-horn":
      g.poly([[10, 16], [28, 8], [28, 32], [10, 24]]);
      g.line(28, 20, 36, 20);
      break;
    case "arei-siren":
      g.circle(16, 22, 8, false);
      g.arc(24, 14, 6, 6, 32, 10);
      g.arc(24, 22, 8, 8, 34, 16);
      break;
    case "arei-watch":
      g.circle(20, 20, 12, false);
      g.line(20, 20, 20, 12);
      g.line(20, 20, 27, 22);
      break;
    case "arei-master-clock":
      g.circle(16, 18, 9, false);
      g.line(16, 18, 16, 12);
      g.rect(24, 22, 12, 10);
      break;
    case "arei-door-lock":
      g.rect(10, 8, 20, 24);
      g.circle(20, 18, 3, false);
      g.line(20, 21, 20, 26);
      break;
    case "arei-fan":
      g.circle(20, 20, 12, false);
      g.line(20, 20, 20, 9);
      g.line(20, 20, 30, 26);
      g.line(20, 20, 10, 26);
      g.circle(20, 20, 2,2, true);
      g.line(20, 2, 20, 8);
      break;
    case "arei-heater": g.hatch(8, 10, 24, 20, 5); break;
    case "arei-heater-storage":
      g.hatch(8, 8, 24, 16, 5);
      g.rect(8, 24, 24, 8);
      break;
    case "arei-heater-fan":
      g.hatch(6, 8, 18, 22, 4);
      g.circle(30, 20, 6, false);
      g.line(30, 20, 30, 15);
      g.line(30, 20, 34, 23);
      break;
    case "arei-boiler":
      g.circle(20, 20, 13, false);
      g.line(14, 12, 14, 28);
      g.line(20, 8, 20, 32);
      g.line(26, 12, 26, 28);
      break;
    case "arei-boiler-storage":
      g.circle(20, 16, 10, false);
      g.line(14, 12, 14, 22); g.line(20, 10, 20, 24); g.line(26, 12, 26, 22);
      g.rect(12, 26, 16, 8);
      break;
    case "arei-appliance": g.rect(8, 8, 24, 24); break;
    case "arei-cooker":
      g.rect(8, 8, 24, 24);
      g.circle(14, 20, 2, true); g.circle(20, 20, 2, true); g.circle(26, 20, 2, true);
      break;
    case "arei-microwave":
      g.rect(6, 8, 28, 24);
      g.arc(14, 18, 4, 4, 22, 18);
      g.arc(14, 24, 5, 4, 24, 24);
      break;
    case "arei-oven":
      g.rect(8, 6, 24, 28);
      g.line(12, 12, 28, 12);
      g.circle(20, 22, 2.2, true);
      break;
    case "arei-washer":
      g.rect(8, 6, 24, 28);
      g.circle(20, 20, 7, false);
      g.circle(20, 20, 2, true);
      break;
    case "arei-dryer":
      g.rect(6, 6, 28, 28);
      g.circle(16, 18, 5, false);
      g.circle(24, 22, 5, false);
      g.circle(20, 20, 1.6, true);
      break;
    case "arei-dishwasher":
      g.rect(8, 6, 24, 28);
      g.line(8, 6, 32, 34);
      g.line(32, 6, 8, 34);
      g.circle(20, 20, 3, false);
      break;
    case "arei-fridge":
      g.rect(8, 6, 24, 28);
      g.line(20, 12, 20, 28);
      g.line(14, 20, 26, 20);
      g.line(16, 16, 24, 24);
      g.line(24, 16, 16, 24);
      break;
    case "arei-freezer":
      g.rect(4, 10, 32, 20);
      for (let x = 10; x <= 30; x += 10) {
        g.line(x, 14, x, 26);
        g.line(x - 3, 20, x + 3, 20);
      }
      break;
    case "arei-motor":
      g.circle(20, 22, 12, false);
      g.label(20, 22, "M", 12);
      g.line(20, 2, 20, 10);
      break;
    case "arei-ev":
      g.rect(12, 8, 16, 22);
      g.rect(8, 30, 24, 5);
      g.line(28, 16, 36, 16);
      g.line(36, 16, 36, 24);
      g.label(20, 18, "EV", 7);
      break;
    case "arei-meter":
      g.rect(6, 6, 28, 28);
      g.label(20, 20, "kWh", 9);
      break;
    case "arei-transformer":
      g.circle(15, 20, 9, false);
      g.circle(25, 20, 9, false);
      break;
    case "arei-pv":
      g.rect(6, 8, 28, 22);
      g.line(6, 8, 34, 30);
      g.line(22, 6, 30, 6); g.line(30, 6, 30, 14);
      g.line(26, 10, 32, 4);
      break;
    case "arei-rectifier":
      g.rect(8, 8, 24, 24);
      g.poly([[16, 14], [24, 20], [16, 26]]);
      g.line(16, 20, 24, 20);
      g.label(12, 20, "~", 8);
      break;
    case "arei-inverter":
      g.rect(8, 8, 24, 24);
      g.line(14, 14, 26, 26);
      g.line(12, 18, 16, 18);
      g.line(14, 16, 14, 20);
      g.label(28, 16, "~", 8);
      break;
    case "arei-chopper":
      g.rect(8, 8, 24, 24);
      g.line(12, 16, 18, 16);
      g.line(15, 14, 15, 18);
      g.line(22, 24, 28, 16);
      g.line(24, 22, 28, 22);
      g.line(26, 20, 26, 24);
      break;
    case "arei-domotica":
      g.rect(6, 4, 28, 32);
      g.line(6, 18, 34, 18);
      g.circle(14, 28, 3, false);
      g.line(14, 28, 22, 22);
      g.rect(22, 8, 6, 6);
      break;
    default:
      g.rect(8, 8, 24, 24);
  }
}

function areiMaster(category, type, name, text, w) {
  return {
    category,
    type,
    name,
    text: text || "",
    w: w || (text ? 120 : 84),
    h: text ? 92 : 76,
  };
}

const AREI_CATEGORIES = [
  { id: "arei-supply", name: "Supply" },
  { id: "arei-boards", name: "Boards" },
  { id: "arei-cables", name: "Cables" },
  { id: "arei-protection", name: "Protection" },
  { id: "arei-switches", name: "Switches" },
  { id: "arei-sockets", name: "Sockets" },
  { id: "arei-loads", name: "Loads" },
  { id: "arei-sources", name: "Sources" },
  { id: "arei-domotica", name: "Home automation" },
];

const AREI_MASTERS = [
  areiMaster("arei-supply", "arei-dc", "Direct current"),
  areiMaster("arei-supply", "arei-ac", "Alternating current"),
  areiMaster("arei-supply", "arei-ac1", "Single-phase"),
  areiMaster("arei-supply", "arei-ac3", "Three-phase"),

  areiMaster("arei-boards", "arei-board", "Distribution board", "Board"),
  areiMaster("arei-boards", "arei-board-feeds", "Board with outgoing circuits", "5"),
  areiMaster("arei-boards", "arei-box", "Box"),
  areiMaster("arei-boards", "arei-junction", "Junction box"),
  areiMaster("arei-boards", "arei-node", "Tap"),
  areiMaster("arei-boards", "arei-branchbox", "Branch box"),
  areiMaster("arei-boards", "arei-earth-link", "Earth disconnect"),

  areiMaster("arei-cables", "arei-line", "Cable"),
  areiMaster("arei-cables", "arei-line-buried", "Underground cable"),
  areiMaster("arei-cables", "arei-line-overhead", "Overhead line"),
  areiMaster("arei-cables", "arei-line-conduit", "Cable in conduit"),
  areiMaster("arei-cables", "arei-line-bundle", "Conduit bundle", "6"),
  areiMaster("arei-cables", "arei-line-inwall", "Cable in a wall"),
  areiMaster("arei-cables", "arei-line-onwall", "Cable on a wall", "XVB 3G2,5 Cca", 150),
  areiMaster("arei-cables", "arei-line-conduit-wall", "Cable in conduit in a wall", "XVB 5G4 Cca", 146),
  areiMaster("arei-cables", "arei-line-two", "Two cables"),
  areiMaster("arei-cables", "arei-line-n", "n cables", "n"),
  areiMaster("arei-cables", "arei-cond-3", "3 conductors", "3"),
  areiMaster("arei-cables", "arei-cond-n", "n conductors", "n"),

  areiMaster("arei-protection", "arei-fuse", "Fuse", "gG 16A"),
  areiMaster("arei-protection", "arei-breaker", "Circuit breaker", "C20"),
  areiMaster("arei-protection", "arei-rcd", "RCD", "40/0,03A Type A", 156),
  areiMaster("arei-protection", "arei-rcbo", "RCBO", "C20 30mA", 140),
  areiMaster("arei-protection", "arei-earth", "Earth"),

  areiMaster("arei-switches", "arei-switch", "Switch"),
  areiMaster("arei-switches", "arei-switch-lamp", "Switch with indicator lamp"),
  areiMaster("arei-switches", "arei-switch-delay", "Switch with delayed opening"),
  areiMaster("arei-switches", "arei-switch-2p", "Two-pole switch"),
  areiMaster("arei-switches", "arei-switch-3p", "Three-pole switch"),
  areiMaster("arei-switches", "arei-switch-series", "Double switch"),
  areiMaster("arei-switches", "arei-switch-two-way", "Two-way switch"),
  areiMaster("arei-switches", "arei-switch-two-way-2p", "Two-pole two-way switch"),
  areiMaster("arei-switches", "arei-switch-cross", "Intermediate switch"),
  areiMaster("arei-switches", "arei-dimmer", "Dimmer"),
  areiMaster("arei-switches", "arei-pull", "Pull switch"),
  areiMaster("arei-switches", "arei-switch-pilot", "Switch with pilot lamp"),
  areiMaster("arei-switches", "arei-push", "Push button"),
  areiMaster("arei-switches", "arei-push-lamp", "Push button with indicator"),
  areiMaster("arei-switches", "arei-push-glass", "Break-glass push button"),
  areiMaster("arei-switches", "arei-timer", "Time switch"),
  areiMaster("arei-switches", "arei-clock", "Time clock"),
  areiMaster("arei-switches", "arei-impulse", "Impulse switch"),
  areiMaster("arei-switches", "arei-thermostat", "Thermostat"),
  areiMaster("arei-switches", "arei-lock-check", "Key interlock"),
  areiMaster("arei-switches", "arei-sensor", "Motion sensor", "IR"),
  areiMaster("arei-switches", "arei-switch-board", "Switch in a board"),

  areiMaster("arei-sockets", "arei-socket", "Socket"),
  areiMaster("arei-sockets", "arei-socket-pe-child", "Earthed socket, child protection"),
  areiMaster("arei-sockets", "arei-socket-multi", "Multiple socket", "3"),
  areiMaster("arei-sockets", "arei-socket-h", "Waterproof socket"),
  areiMaster("arei-sockets", "arei-socket-pe", "Earthed socket"),
  areiMaster("arei-sockets", "arei-socket-child", "Socket with child protection"),
  areiMaster("arei-sockets", "arei-socket-switch", "Switched socket"),
  areiMaster("arei-sockets", "arei-socket-lock", "Interlocked socket"),
  areiMaster("arei-sockets", "arei-socket-shave", "Shaver socket"),
  areiMaster("arei-sockets", "arei-data", "Data socket"),
  areiMaster("arei-sockets", "arei-socket-board", "Socket in a board"),

  areiMaster("arei-loads", "arei-light", "Lighting point"),
  areiMaster("arei-loads", "arei-light-wall", "Wall light"),
  areiMaster("arei-loads", "arei-light-fluo", "Fluorescent light"),
  areiMaster("arei-loads", "arei-light-fluo-3", "Three fluorescent tubes", "3"),
  areiMaster("arei-loads", "arei-projector", "Spotlight"),
  areiMaster("arei-loads", "arei-projector-narrow", "Spotlight, narrow beam"),
  areiMaster("arei-loads", "arei-projector-wide", "Spotlight, wide beam"),
  areiMaster("arei-loads", "arei-light-switch", "Light with switch"),
  areiMaster("arei-loads", "arei-light-safety", "Emergency light"),
  areiMaster("arei-loads", "arei-light-safety-auto", "Self-contained emergency light"),
  areiMaster("arei-loads", "arei-ballast", "Ballast"),
  areiMaster("arei-loads", "arei-bell", "Bell"),
  areiMaster("arei-loads", "arei-buzzer", "Buzzer"),
  areiMaster("arei-loads", "arei-horn", "Horn"),
  areiMaster("arei-loads", "arei-siren", "Siren"),
  areiMaster("arei-loads", "arei-watch", "Clock"),
  areiMaster("arei-loads", "arei-master-clock", "Master clock"),
  areiMaster("arei-loads", "arei-door-lock", "Electric lock"),
  areiMaster("arei-loads", "arei-fan", "Fan"),
  areiMaster("arei-loads", "arei-heater", "Heater"),
  areiMaster("arei-loads", "arei-heater-storage", "Storage heater"),
  areiMaster("arei-loads", "arei-heater-fan", "Storage heater with fan"),
  areiMaster("arei-loads", "arei-boiler", "Water heater"),
  areiMaster("arei-loads", "arei-boiler-storage", "Storage water heater"),
  areiMaster("arei-loads", "arei-appliance", "Household appliance"),
  areiMaster("arei-loads", "arei-cooker", "Hob / cooker"),
  areiMaster("arei-loads", "arei-microwave", "Microwave"),
  areiMaster("arei-loads", "arei-oven", "Oven"),
  areiMaster("arei-loads", "arei-washer", "Washing machine"),
  areiMaster("arei-loads", "arei-dryer", "Tumble dryer"),
  areiMaster("arei-loads", "arei-dishwasher", "Dishwasher"),
  areiMaster("arei-loads", "arei-fridge", "Fridge"),
  areiMaster("arei-loads", "arei-freezer", "Freezer"),
  areiMaster("arei-loads", "arei-motor", "Motor"),
  areiMaster("arei-loads", "arei-ev", "EV charger"),
  areiMaster("arei-loads", "arei-meter", "kWh meter", "In=32A", 120),

  areiMaster("arei-sources", "arei-transformer", "Transformer"),
  areiMaster("arei-sources", "arei-pv", "Photovoltaic panel"),
  areiMaster("arei-sources", "arei-rectifier", "Rectifier"),
  areiMaster("arei-sources", "arei-inverter", "Inverter"),
  areiMaster("arei-sources", "arei-chopper", "Chopper"),

  areiMaster("arei-domotica", "arei-domotica", "Control unit"),
];

window.MisioArei = {
  categories: AREI_CATEGORIES,
  masters: AREI_MASTERS,
  draw: drawAreiSymbol,
  iconBox: areiIconBox,
};
