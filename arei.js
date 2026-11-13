"use strict";

// Symbols from AREI Boek 1, tabel 2.23. Drawn as on the Volta symbol sheet.

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
  function poly(points, filled, strokeWidth) {
    const d = points.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(" ");
    el("path", {
      d: filled ? `${d} Z` : d,
      fill: filled ? stroke : "none",
      stroke, "stroke-width": strokeWidth == null ? sw : strokeWidth, "stroke-linejoin": "round", "stroke-linecap": "round",
    }, parent);
  }
  function arc(x1, y1, rx, ry, x2, y2, sweep) {
    el("path", {
      d: `M ${X(x1)} ${Y(y1)} A ${(rx / 40) * size} ${(ry / 40) * size} 0 0 ${sweep === 0 ? 0 : 1} ${X(x2)} ${Y(y2)}`,
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

function areiArch(g, x, y, w, h) {
  g.arc(x, y + h, w / 2, h, x + w, y + h, 1);
}

function areiSocket(g, opt) {
  if (opt.multi) {
    g.line(2, 4, 16, 4);
    g.line(16, 4, 16, 35);
    for (let i = 0; i < 3; i += 1) areiArch(g, 10, 10 + i * 9, 12, 7);
    return;
  }
  g.line(2, 6, 16, 6);
  g.line(16, 6, 16, 17);
  if (opt.pe) g.line(8, 14, 24, 14);
  if (opt.shave) {
    g.circle(16, 13, 6, false);
    areiArch(g, 8, 16, 16, 12);
    return;
  }
  areiArch(g, 8, 17, 16, 11);
  if (opt.child) {
    g.line(4, 28, 8, 28);
    g.line(24, 28, 28, 28);
  }
  if (opt.h) g.label(28, 12, "h", 9);
  if (opt.lock) g.circle(16, 17, 1.8, true);
  if (opt.switched || opt.lock) areiPoleTip(g, 16, 6, 32, 2, 2);
}

function areiPoleTip(g, x1, y1, x2, y2, poles) {
  g.line(x1, y1, x2, y2);
  const count = poles || 1;
  if (count < 2) return;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  for (let i = 1; i < count; i += 1) {
    const off = i * 2.6;
    g.line(x2 - ux * 5 + px * off, y2 - uy * 5 + py * off, x2 + px * off, y2 + py * off);
  }
}

function areiHook(g, x, y, px, py) {
  g.line(x - px, y - py, x + px, y + py);
}

function areiSwitch(g, opt) {
  if (opt.inBoard) {
    g.rect(4, 2, 32, 36);
    g.line(8, 34, 32, 34);
    g.line(8, 37, 32, 37);
  }
  if (opt.push) {
    g.circle(20, 20, 11, false);
    g.circle(20, 20, 4.5, false);
    if (opt.lamp) {
      g.line(16, 16, 24, 24);
      g.line(24, 16, 16, 24);
    }
    if (opt.glass) {
      g.line(33, 8, 33, 32);
      g.line(33, 8, 38, 8);
      g.line(33, 20, 38, 20);
      g.line(33, 32, 38, 32);
    }
    return;
  }
  if (opt.pilot) {
    g.circle(8, 24, 5, false);
    g.line(5, 21, 11, 27);
    g.line(11, 21, 5, 27);
    g.line(13, 24, 20, 24);
    g.circle(24, 24, 4.2, false);
    g.line(27, 21, 36, 10);
    return;
  }
  if (opt.cross) {
    g.circle(20, 20, 4, false);
    g.line(8, 8, 32, 32);
    g.line(8, 32, 32, 8);
    areiHook(g, 8, 8, 3, -3);
    areiHook(g, 32, 32, 3, -3);
    areiHook(g, 8, 32, 3, 3);
    areiHook(g, 32, 8, 3, 3);
    return;
  }
  if (opt.twoWay) {
    g.circle(20, 20, 4, false);
    g.line(7, 33, 33, 7);
    areiHook(g, 7, 33, 3.2, 3.2);
    areiHook(g, 33, 7, 3.2, 3.2);
    if (opt.poles === 2) {
      areiHook(g, 11, 31, 2.4, 2.4);
      areiHook(g, 31, 9, 2.4, 2.4);
    }
    return;
  }
  if (opt.series) {
    g.circle(20, 30, 5, false);
    g.line(17, 26, 8, 10);
    g.line(23, 26, 32, 10);
    return;
  }
  if (opt.dimmer) {
    g.circle(12, 30, 4.2, false);
    g.line(15, 27, 22, 18);
    g.poly([[22, 18], [36, 8], [26, 6], [22, 18]]);
    return;
  }
  if (opt.pull) {
    g.circle(12, 28, 4.2, false);
    g.line(15, 25, 24, 14);
    g.poly([[20, 14], [28, 14], [24, 22]], true);
    return;
  }
  const lamp = opt.lamp;
  g.circle(lamp ? 15 : 16, 27, lamp ? 6 : 5, false);
  if (lamp) {
    g.line(11, 23, 19, 31);
    g.line(19, 23, 11, 31);
  }
  areiPoleTip(g, lamp ? 19 : 19, lamp ? 22 : 23, 32, 8, opt.poles);
  if (opt.delay) g.label(34, 16, "t", 9);
}

function areiLight(g, opt) {
  if (opt.box) g.rect(8, 6, 26, 28);
  if (!opt.wall && !opt.box) g.line(1, 22, 20, 22);
  g.line(12, 12, 28, 32);
  g.line(28, 12, 12, 32);
  if (opt.dot) g.circle(20, 22, 2.2, true);
  if (opt.wall) g.line(32, 8, 32, 36);
  if (opt.switched) {
    g.line(26, 14, 34, 6);
    g.line(34, 6, 38, 9);
  }
}

function areiBreaker(g) {
  // Open contact: upper stem, a gap, a tilted block, then the lower stem.
  g.line(24, 2, 24, 13.7);
  g.poly([[12.9, 15.8], [17.4, 14.2], [19.1, 18.7], [14.6, 20.4]], true, 0);
  g.line(19.1, 18.7, 24, 26);
  g.line(24, 26, 24, 38);
}

function areiComb(g, x, base, up) {
  const tip = base + (up ? -8 : 8);
  g.line(x, base, x + 8, base);
  g.line(x, base, x, tip);
  g.line(x + 4, base, x + 4, tip);
  g.line(x + 8, base, x + 8, tip);
}

function areiSine(g, x, y, w, h) {
  g.arc(x, y, w / 4, h, x + w / 2, y, 1);
  g.arc(x + w / 2, y, w / 4, h, x + w, y, 0);
}

function areiFlake(g, x, y, r) {
  for (let i = 0; i < 6; i += 1) {
    const a = -Math.PI / 2 + i * Math.PI / 3;
    const ex = x + Math.cos(a) * r;
    const ey = y + Math.sin(a) * r;
    g.line(x, y, ex, ey);
    const bx = x + Math.cos(a) * r * 0.55;
    const by = y + Math.sin(a) * r * 0.55;
    g.line(bx, by, bx + Math.cos(a + 0.7) * r * 0.28, by + Math.sin(a + 0.7) * r * 0.28);
    g.line(bx, by, bx + Math.cos(a - 0.7) * r * 0.28, by + Math.sin(a - 0.7) * r * 0.28);
  }
}

function areiFed(g) {
  g.line(1, 20, 10, 20);
  g.rect(10, 8, 24, 24);
}

function drawAreiSymbol(parent, shape, paint) {
  const g = areiPen(parent, paint, areiIconBox(shape));
  switch (shape.type) {
    case "arei-dc":
      g.line(6, 20, 34, 20);
      break;
    case "arei-ac":
      areiSine(g, 6, 20, 28, 7);
      break;
    case "arei-ac1":
      g.label(8, 13, "1", 11);
      areiSine(g, 14, 22, 22, 6);
      break;
    case "arei-ac3":
      g.label(8, 13, "3", 11);
      areiSine(g, 14, 22, 22, 6);
      break;
    case "arei-board": g.rect(4, 12, 32, 16); break;
    case "arei-board-feeds":
      g.rect(6, 14, 28, 12);
      g.line(20, 26, 20, 36);
      for (let i = 0; i < 5; i += 1) g.line(10 + i * 5, 4, 10 + i * 5, 14);
      break;
    case "arei-box": g.circle(20, 20, 11, false); break;
    case "arei-junction": g.circle(20, 20, 10, false); g.circle(20, 20, 4, true); break;
    case "arei-junction-line":
      g.line(1, 20, 39, 20);
      g.rect(12, 14, 16, 12);
      g.circle(20, 20, 2.2, true);
      break;
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
      g.line(1, 20, 12, 20);
      g.line(28, 20, 39, 20);
      g.line(12, 14, 12, 26);
      g.line(16, 14, 16, 26);
      g.line(24, 14, 24, 26);
      g.line(28, 14, 28, 26);
      break;
    case "arei-line": g.line(2, 20, 38, 20); break;
    case "arei-line-buried":
      g.line(4, 26, 36, 26);
      g.line(14, 18, 26, 18);
      g.line(16, 14, 24, 14);
      g.line(18, 10, 22, 10);
      break;
    case "arei-line-overhead":
      g.line(2, 20, 38, 20);
      g.circle(20, 20, 5, false);
      break;
    case "arei-line-conduit":
      g.line(2, 28, 38, 28);
      g.circle(20, 22, 6, false);
      break;
    case "arei-line-bundle":
      g.line(2, 26, 38, 26);
      g.circle(16, 16, 6, false);
      g.label(26, 9, "6", 9);
      break;
    case "arei-line-inwall":
      g.line(2, 28, 38, 28);
      areiComb(g, 4, 28, true);
      areiComb(g, 26, 28, true);
      break;
    case "arei-line-onwall":
      g.line(2, 12, 38, 12);
      areiComb(g, 4, 12, false);
      areiComb(g, 26, 12, false);
      break;
    case "arei-line-conduit-wall":
      g.line(2, 28, 38, 28);
      areiComb(g, 4, 28, true);
      g.circle(30, 22, 6, false);
      break;
    case "arei-line-two":
      g.line(2, 20, 38, 20);
      g.line(16, 13, 16, 27);
      g.line(22, 13, 22, 27);
      break;
    case "arei-line-n":
      g.line(2, 22, 38, 22);
      g.line(18, 14, 18, 30);
      g.label(26, 13, "n", 10);
      break;
    case "arei-cond-3":
      g.line(4, 22, 36, 22);
      g.line(13, 30, 19, 12);
      g.line(18, 30, 24, 12);
      g.line(23, 30, 29, 12);
      break;
    case "arei-cond-n":
      g.line(4, 24, 36, 24);
      g.line(14, 32, 24, 12);
      g.label(28, 14, "n", 10);
      break;
    case "arei-fuse":
      g.line(1, 20, 12, 20);
      g.rect(12, 14, 16, 12);
      g.line(28, 20, 39, 20);
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
      g.rect(4, 12, 32, 16);
      g.label(20, 20, "t", 12);
      break;
    case "arei-clock":
      g.rect(2, 12, 36, 16);
      g.circle(10, 20, 5, false);
      g.line(10, 20, 10, 16);
      g.line(10, 20, 13, 22);
      g.line(18, 20, 24, 20);
      g.line(24, 20, 30, 16);
      g.line(30, 16, 34, 20);
      break;
    case "arei-impulse":
      g.rect(4, 12, 32, 16);
      g.line(12, 16, 12, 24);
      g.line(12, 24, 17, 24);
      g.line(28, 16, 28, 24);
      g.line(23, 24, 28, 24);
      break;
    case "arei-thermostat":
      g.rect(2, 13, 36, 14);
      g.circle(20, 20, 5, false);
      g.line(14, 20, 26, 20);
      break;
    case "arei-lock-check":
      g.rect(10, 6, 20, 28);
      g.circle(20, 14, 4, true);
      g.poly([[16, 18], [24, 18], [20, 28]], true);
      break;
    case "arei-sensor":
      g.rect(12, 4, 16, 32);
      g.line(12, 22, 28, 22);
      g.arc(15, 14, 3, 4, 19, 10, 0);
      g.arc(19, 14, 3, 4, 23, 10, 0);
      g.label(20, 29, "*", 10);
      break;
    case "arei-switch-board": areiSwitch(g, { inBoard: true }); break;
    case "arei-socket": areiSocket(g, {}); break;
    case "arei-socket-multi": areiSocket(g, { multi: true }); break;
    case "arei-socket-h": areiSocket(g, { h: true }); break;
    case "arei-socket-pe": areiSocket(g, { pe: true }); break;
    case "arei-socket-child": areiSocket(g, { child: true }); break;
    case "arei-socket-pe-child": areiSocket(g, { pe: true, child: true }); break;
    case "arei-socket-switch": areiSocket(g, { switched: true }); break;
    case "arei-socket-lock": areiSocket(g, { switched: true, lock: true }); break;
    case "arei-socket-shave": areiSocket(g, { shave: true }); break;
    case "arei-data":
      g.line(2, 20, 14, 20);
      g.line(14, 10, 14, 30);
      g.line(14, 10, 26, 10);
      g.line(14, 30, 26, 30);
      break;
    case "arei-socket-board":
      g.rect(2, 2, 36, 36);
      g.line(6, 12, 16, 12);
      g.line(16, 12, 16, 20);
      areiArch(g, 10, 20, 12, 8);
      g.line(16, 12, 28, 4);
      g.line(6, 33, 34, 33);
      g.line(6, 36, 34, 36);
      break;
    case "arei-light": areiLight(g, {}); break;
    case "arei-light-wall": areiLight(g, { wall: true }); break;
    case "arei-light-fluo":
      g.line(8, 20, 32, 20);
      g.line(8, 14, 8, 26);
      g.line(32, 14, 32, 26);
      break;
    case "arei-light-fluo-3":
      for (let y = 12; y <= 28; y += 8) {
        g.line(4, y, 24, y);
        g.line(4, y - 3, 4, y + 3);
        g.line(24, y - 3, 24, y + 3);
      }
      g.line(28, 20, 34, 20);
      g.line(28, 17, 28, 23);
      g.line(34, 17, 34, 23);
      g.line(30, 26, 36, 14);
      g.label(37, 26, "3", 7);
      break;
    case "arei-projector":
      g.arc(8, 10, 8, 10, 8, 30, 0);
      g.circle(18, 20, 6, false);
      g.line(14, 16, 22, 24);
      g.line(22, 16, 14, 24);
      break;
    case "arei-projector-narrow":
      g.arc(6, 10, 8, 10, 6, 30, 0);
      g.circle(14, 20, 6, false);
      g.line(10, 16, 18, 24);
      g.line(18, 16, 10, 24);
      g.line(24, 16, 36, 16);
      g.poly([[33, 14], [38, 16], [33, 18]], true);
      g.line(24, 24, 36, 24);
      g.poly([[33, 22], [38, 24], [33, 26]], true);
      break;
    case "arei-projector-wide":
      g.arc(6, 12, 8, 8, 6, 28, 0);
      g.circle(14, 20, 6, false);
      g.line(10, 16, 18, 24);
      g.line(18, 16, 10, 24);
      g.line(22, 16, 34, 6);
      g.poly([[30, 6], [36, 4], [34, 10]], true);
      g.line(22, 24, 34, 34);
      g.poly([[30, 34], [36, 36], [34, 30]], true);
      break;
    case "arei-light-switch": areiLight(g, { switched: true }); break;
    case "arei-light-safety": areiLight(g, { dot: true }); break;
    case "arei-light-safety-auto": areiLight(g, { dot: true, box: true }); break;
    case "arei-ballast":
      g.rect(4, 12, 32, 16);
      g.rect(8, 16, 24, 8);
      break;
    case "arei-bell":
      g.line(2, 20, 14, 20);
      g.arc(14, 12, 9, 8, 14, 28, 0);
      g.circle(18, 20, 1.6, true);
      break;
    case "arei-buzzer":
      g.line(2, 20, 14, 20);
      g.arc(14, 12, 9, 8, 14, 28, 0);
      break;
    case "arei-horn":
      g.line(2, 20, 10, 20);
      g.rect(10, 14, 10, 12);
      g.poly([[20, 15], [32, 20], [20, 25]]);
      break;
    case "arei-siren":
      g.line(2, 20, 12, 20);
      g.poly([[12, 10], [34, 20], [12, 30]]);
      break;
    case "arei-watch":
      g.circle(20, 20, 12, false);
      g.circle(20, 20, 1.4, true);
      g.line(20, 20, 20, 11);
      g.line(20, 20, 27, 23);
      break;
    case "arei-master-clock":
      g.line(18, 4, 18, 10);
      g.rect(4, 10, 32, 18);
      areiSine(g, 6, 18, 8, 2.4);
      areiSine(g, 14, 18, 8, 2.4);
      g.poly([[24, 14], [34, 26], [24, 26]]);
      break;
    case "arei-door-lock":
      g.line(2, 20, 8, 20);
      g.rect(8, 8, 26, 24);
      g.circle(16, 20, 5, false);
      g.circle(22, 20, 5, false);
      break;
    case "arei-fan":
      g.line(1, 20, 8, 20);
      g.rect(8, 8, 24, 24);
      for (let x = 12; x <= 28; x += 4) g.line(x, 10, x, 30);
      break;
    case "arei-heater":
      g.line(1, 20, 10, 20);
      for (let x = 12; x <= 34; x += 3) g.line(x, 8, x, 32);
      break;
    case "arei-heater-storage":
      g.line(1, 20, 8, 20);
      g.rect(8, 8, 26, 24);
      for (let x = 12; x <= 30; x += 3) g.line(x, 10, x, 30);
      break;
    case "arei-heater-fan":
      g.line(1, 20, 6, 20);
      g.rect(6, 10, 30, 20);
      for (let x = 9; x <= 18; x += 3) g.line(x, 12, x, 28);
      g.circle(24, 20, 4, false);
      g.circle(29, 20, 4, false);
      break;
    case "arei-boiler":
      g.circle(20, 20, 14, false);
      for (let x = 10; x <= 30; x += 4) {
        const half = Math.sqrt(Math.max(0, 196 - (x - 20) * (x - 20)));
        g.line(x, 20 - half, x, 20 + half);
      }
      break;
    case "arei-boiler-storage":
      g.circle(20, 20, 15, false);
      g.circle(20, 20, 10, false);
      for (let x = 14; x <= 26; x += 4) {
        const half = Math.sqrt(Math.max(0, 100 - (x - 20) * (x - 20)));
        g.line(x, 20 - half, x, 20 + half);
      }
      break;
    case "arei-appliance":
      areiFed(g);
      break;
    case "arei-cooker":
      areiFed(g);
      g.circle(16, 16, 2, true);
      g.circle(26, 16, 2, true);
      g.circle(21, 26, 2, true);
      break;
    case "arei-microwave":
      areiFed(g);
      areiSine(g, 14, 14, 16, 2);
      areiSine(g, 14, 20, 16, 2);
      areiSine(g, 14, 26, 16, 2);
      break;
    case "arei-oven":
      areiFed(g);
      g.line(12, 12, 32, 12);
      g.circle(21, 22, 2.4, true);
      break;
    case "arei-washer":
      areiFed(g);
      g.circle(22, 20, 7, false);
      g.circle(22, 20, 2.2, true);
      break;
    case "arei-dryer":
      areiFed(g);
      g.circle(17, 16, 3.6, false);
      g.circle(25, 16, 3.6, false);
      g.circle(21, 26, 2, true);
      break;
    case "arei-dishwasher":
      areiFed(g);
      g.line(10, 8, 19, 24);
      g.line(34, 8, 25, 24);
      g.circle(22, 27, 3.2, false);
      break;
    case "arei-fridge":
      areiFed(g);
      areiFlake(g, 22, 20, 7);
      break;
    case "arei-freezer":
      g.line(1, 20, 6, 20);
      g.rect(6, 12, 32, 16);
      areiFlake(g, 12, 20, 3.2);
      areiFlake(g, 22, 20, 3.2);
      areiFlake(g, 32, 20, 3.2);
      break;
    case "arei-motor":
      g.line(1, 20, 8, 20);
      g.circle(22, 20, 12, false);
      g.label(22, 20, "M", 12);
      break;
    case "arei-ev":
      g.rect(6, 2, 18, 28);
      g.rect(4, 30, 22, 5);
      g.rect(8, 4, 14, 7);
      g.line(15, 14, 15, 28);
      g.label(11, 18, "V", 7);
      g.label(19, 18, "E", 7);
      g.label(11, 25, "E", 7);
      g.label(19, 25, "V", 7);
      g.rect(26, 4, 4, 6);
      g.line(28, 10, 28, 24);
      break;
    case "arei-meter":
      g.line(1, 20, 10, 20);
      g.rect(10, 8, 24, 24);
      g.label(22, 22, "kWh", 8);
      break;
    case "arei-transformer":
      g.line(1, 20, 8, 20);
      g.circle(14, 20, 8, false);
      g.circle(24, 20, 8, false);
      g.line(32, 20, 39, 20);
      break;
    case "arei-pv":
      g.rect(8, 6, 24, 28);
      g.line(8, 20, 32, 20);
      g.line(22, 8, 16, 14);
      g.line(16, 14, 22, 14);
      g.line(22, 14, 16, 19);
      break;
    case "arei-rectifier":
      g.rect(8, 6, 24, 28);
      g.line(8, 6, 32, 34);
      areiSine(g, 12, 14, 12, 2);
      g.line(14, 26, 26, 26);
      g.line(16, 29, 19, 29);
      g.line(22, 29, 25, 29);
      g.line(12, 37, 18, 37);
      g.poly([[14, 35.6], [10, 37], [14, 38.4]], true);
      g.line(22, 37, 28, 37);
      g.poly([[26, 35.6], [30, 37], [26, 38.4]], true);
      break;
    case "arei-inverter":
      g.rect(8, 6, 24, 28);
      g.line(8, 6, 32, 34);
      g.line(14, 12, 26, 12);
      g.line(16, 15, 19, 15);
      g.line(22, 15, 25, 15);
      areiSine(g, 12, 26, 12, 2);
      break;
    case "arei-chopper":
      g.rect(8, 6, 24, 28);
      g.line(8, 6, 32, 34);
      g.line(14, 12, 26, 12);
      g.line(16, 15, 19, 15);
      g.line(22, 15, 25, 15);
      g.line(14, 26, 26, 26);
      g.line(16, 29, 19, 29);
      g.line(22, 29, 25, 29);
      break;
    case "arei-domotica":
      g.rect(8, 2, 24, 36);
      g.line(8, 16, 32, 16);
      g.arc(12, 10, 3, 3, 16, 6, 0);
      g.arc(16, 10, 3, 3, 20, 6, 0);
      g.circle(26, 9, 4, false);
      g.line(26, 9, 26, 6);
      g.circle(16, 28, 4, false);
      g.line(18, 25, 26, 18);
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
  areiMaster("arei-boards", "arei-junction-line", "In-line junction box"),
  areiMaster("arei-boards", "arei-node", "Tap"),
  areiMaster("arei-boards", "arei-branchbox", "Branch box"),
  areiMaster("arei-boards", "arei-earth-link", "Earth disconnect"),

  areiMaster("arei-cables", "arei-line", "Cable"),
  areiMaster("arei-cables", "arei-line-buried", "Underground cable"),
  areiMaster("arei-cables", "arei-line-overhead", "Overhead line"),
  areiMaster("arei-cables", "arei-line-conduit", "Cable in conduit"),
  areiMaster("arei-cables", "arei-line-bundle", "Conduit bundle"),
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

function areiPort(id, x, y, dir) {
  return { id, x, y, dir: dir || id };
}

function areiAcross(y, x1, x2) {
  return [areiPort("left", x1, y, "left"), areiPort("right", x2, y, "right")];
}

function areiDown(x, y1, y2) {
  return [areiPort("top", x, y1, "top"), areiPort("bottom", x, y2, "bottom")];
}

function areiBox(x, y, w, h) {
  return [
    areiPort("top", x + w / 2, y, "top"),
    areiPort("right", x + w, y + h / 2, "right"),
    areiPort("bottom", x + w / 2, y + h, "bottom"),
    areiPort("left", x, y + h / 2, "left"),
  ];
}

function areiRing(cx, cy, r) {
  return [
    areiPort("top", cx, cy - r, "top"),
    areiPort("right", cx + r, cy, "right"),
    areiPort("bottom", cx, cy + r, "bottom"),
    areiPort("left", cx - r, cy, "left"),
  ];
}

window.MisioArei = {
  categories: AREI_CATEGORIES,
  masters: AREI_MASTERS,
  draw: drawAreiSymbol,
  iconBox: areiIconBox,
  ports: {
    "arei-dc": areiAcross(20, 6, 34),
    "arei-ac": areiAcross(20, 6, 34),
    "arei-ac1": areiAcross(22, 14, 36),
    "arei-ac3": areiAcross(22, 14, 36),
    "arei-board": areiBox(4, 12, 32, 16),
    "arei-board-feeds": [
      areiPort("n1", 20, 36, "bottom"),
      areiPort("n2", 10, 4, "top"),
      areiPort("n3", 15, 4, "top"),
      areiPort("n4", 20, 4, "top"),
      areiPort("n5", 25, 4, "top"),
      areiPort("n6", 30, 4, "top"),
    ],
    "arei-box": areiRing(20, 20, 11),
    "arei-junction": areiRing(20, 20, 10),
    "arei-junction-line": areiAcross(20, 1, 39),
    "arei-node": areiAcross(20, 0, 40).concat(areiDown(20, 0, 40)),
    "arei-branchbox": [
      areiPort("n1", 20, 2, "top"),
      areiPort("n2", 14, 36, "bottom"),
      areiPort("n3", 26, 36, "bottom"),
    ],
    "arei-earth-link": areiAcross(20, 1, 39),
    "arei-line": areiAcross(20, 2, 38),
    "arei-line-buried": areiAcross(26, 4, 36),
    "arei-line-overhead": areiAcross(20, 2, 38),
    "arei-line-conduit": areiAcross(28, 2, 38),
    "arei-line-bundle": areiAcross(26, 2, 38),
    "arei-line-inwall": areiAcross(28, 2, 38),
    "arei-line-onwall": areiAcross(12, 2, 38),
    "arei-line-conduit-wall": areiAcross(28, 2, 38),
    "arei-line-two": areiAcross(20, 2, 38),
    "arei-line-n": areiAcross(22, 2, 38),
    "arei-cond-3": areiAcross(22, 4, 36),
    "arei-cond-n": areiAcross(24, 4, 36),
    "arei-fuse": areiAcross(20, 1, 39),
    "arei-breaker": areiDown(24, 2, 38),
    "arei-rcd": areiDown(24, 2, 38),
    "arei-rcbo": areiDown(24, 2, 38),
    "arei-earth": [areiPort("top", 20, 2, "top")],
    "arei-switch": [areiPort("top", 32, 8, "top"), areiPort("bottom", 16, 32, "bottom")],
    "arei-switch-lamp": [areiPort("top", 32, 8, "top"), areiPort("bottom", 15, 33, "bottom")],
    "arei-switch-delay": [areiPort("top", 32, 8, "top"), areiPort("bottom", 16, 32, "bottom")],
    "arei-switch-2p": [areiPort("top", 32, 8, "top"), areiPort("bottom", 16, 32, "bottom")],
    "arei-switch-3p": [areiPort("top", 32, 8, "top"), areiPort("bottom", 16, 32, "bottom")],
    "arei-switch-series": [areiPort("left", 8, 10, "left"), areiPort("right", 32, 10, "right")],
    "arei-switch-two-way": [areiPort("bottom", 7, 33, "bottom"), areiPort("top", 33, 7, "top")],
    "arei-switch-two-way-2p": [areiPort("bottom", 7, 33, "bottom"), areiPort("top", 33, 7, "top")],
    "arei-switch-cross": [
      areiPort("n1", 8, 8, "top"),
      areiPort("n2", 32, 8, "top"),
      areiPort("n3", 8, 32, "bottom"),
      areiPort("n4", 32, 32, "bottom"),
    ],
    "arei-dimmer": [areiPort("top", 36, 8, "top"), areiPort("left", 7.8, 30, "left")],
    "arei-pull": [areiPort("top", 24, 14, "top"), areiPort("left", 7.8, 28, "left")],
    "arei-switch-pilot": [areiPort("top", 36, 10, "top"), areiPort("left", 3, 24, "left")],
    "arei-push": areiRing(20, 20, 11),
    "arei-push-lamp": areiRing(20, 20, 11),
    "arei-push-glass": areiRing(20, 20, 11),
    "arei-timer": areiBox(4, 12, 32, 16),
    "arei-clock": areiBox(2, 12, 36, 16),
    "arei-impulse": areiBox(4, 12, 32, 16),
    "arei-thermostat": areiBox(2, 13, 36, 14),
    "arei-lock-check": areiBox(10, 6, 20, 28),
    "arei-sensor": areiBox(12, 4, 16, 32),
    "arei-switch-board": areiBox(4, 2, 32, 36),
    "arei-socket": [areiPort("left", 2, 6, "left")],
    "arei-socket-multi": [areiPort("left", 2, 4, "left")],
    "arei-socket-h": [areiPort("left", 2, 6, "left")],
    "arei-socket-pe": [areiPort("left", 2, 6, "left")],
    "arei-socket-child": [areiPort("left", 2, 6, "left")],
    "arei-socket-pe-child": [areiPort("left", 2, 6, "left")],
    "arei-socket-switch": [areiPort("left", 2, 6, "left")],
    "arei-socket-lock": [areiPort("left", 2, 6, "left")],
    "arei-socket-shave": [areiPort("left", 2, 6, "left")],
    "arei-data": [areiPort("left", 2, 20, "left")],
    "arei-socket-board": areiBox(2, 2, 36, 36),
    "arei-light": [areiPort("left", 1, 22, "left")],
    "arei-light-wall": areiDown(32, 8, 36),
    "arei-light-fluo": areiAcross(20, 8, 32),
    "arei-light-fluo-3": areiAcross(20, 4, 34),
    "arei-projector": [areiPort("top", 8, 10, "top"), areiPort("bottom", 8, 30, "bottom")],
    "arei-projector-narrow": [areiPort("top", 6, 10, "top"), areiPort("bottom", 6, 30, "bottom"), areiPort("right", 38, 16, "right")],
    "arei-projector-wide": [areiPort("top", 6, 12, "top"), areiPort("bottom", 6, 28, "bottom")],
    "arei-light-switch": [areiPort("left", 1, 22, "left")],
    "arei-light-safety": [areiPort("left", 1, 22, "left")],
    "arei-light-safety-auto": areiBox(8, 6, 26, 28),
    "arei-ballast": areiBox(4, 12, 32, 16),
    "arei-bell": [areiPort("left", 2, 20, "left")],
    "arei-buzzer": [areiPort("left", 2, 20, "left")],
    "arei-horn": [areiPort("left", 2, 20, "left")],
    "arei-siren": [areiPort("left", 2, 20, "left")],
    "arei-watch": areiRing(20, 20, 12),
    "arei-master-clock": [areiPort("top", 18, 4, "top")].concat(areiBox(4, 10, 32, 18).filter((port) => port.id !== "top")),
    "arei-door-lock": [areiPort("left", 2, 20, "left")],
    "arei-fan": [areiPort("left", 1, 20, "left")],
    "arei-heater": [areiPort("left", 1, 20, "left")],
    "arei-heater-storage": [areiPort("left", 1, 20, "left")],
    "arei-heater-fan": [areiPort("left", 1, 20, "left")],
    "arei-boiler": areiRing(20, 20, 14),
    "arei-boiler-storage": areiRing(20, 20, 15),
    "arei-appliance": [areiPort("left", 1, 20, "left")],
    "arei-cooker": [areiPort("left", 1, 20, "left")],
    "arei-microwave": [areiPort("left", 1, 20, "left")],
    "arei-oven": [areiPort("left", 1, 20, "left")],
    "arei-washer": [areiPort("left", 1, 20, "left")],
    "arei-dryer": [areiPort("left", 1, 20, "left")],
    "arei-dishwasher": [areiPort("left", 1, 20, "left")],
    "arei-fridge": [areiPort("left", 1, 20, "left")],
    "arei-freezer": [areiPort("left", 1, 20, "left")],
    "arei-motor": [areiPort("left", 1, 20, "left"), areiPort("right", 34, 20, "right")],
    "arei-ev": [
      areiPort("top", 15, 2, "top"),
      areiPort("bottom", 15, 35, "bottom"),
      areiPort("left", 6, 16, "left"),
      areiPort("right", 30, 7, "right"),
    ],
    "arei-meter": [areiPort("left", 1, 20, "left")],
    "arei-transformer": areiAcross(20, 1, 39),
    "arei-pv": areiBox(8, 6, 24, 28),
    "arei-rectifier": areiBox(8, 6, 24, 28),
    "arei-inverter": areiBox(8, 6, 24, 28),
    "arei-chopper": areiBox(8, 6, 24, 28),
    "arei-domotica": areiBox(8, 2, 24, 36),
  },
};
