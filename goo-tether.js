/*
 * goo-tether
 * A fixed element wrapped in black liquid. When a pointer (mouse or finger)
 * comes near, the liquid around the element stretches toward it like it is
 * being pulled by a magnet. The element itself never moves. Move away and the
 * liquid settles back around it.
 *
 * Vanilla JS, zero dependencies. MIT license.
 *
 * How it works:
 *  - A full-viewport SVG sits behind the element. A ring of small circles
 *    follows the element's outline (the liquid "skin").
 *  - Each ring point is a spring. Points near the pointer get a target
 *    offset toward it, so a pointed bulge of liquid reaches out. Each point
 *    is drawn as a tapering chain of circles from the skin to its tip.
 *  - A goo filter (blur + alpha contrast) merges all circles into one
 *    smooth, sticky-looking liquid shape.
 */
(function (global) {
  'use strict';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var uid = 0;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  function GooTether(options) {
    this.o = Object.assign({
      color: '#0d0d0d',
      points: 56,        // springs around the outline
      chain: 9,          // circles per point
      skin: 8,           // px the liquid sticks out around the element at rest
      radius: 9,         // base circle radius (px)
      range: 260,        // px; how far away the pointer can attract liquid
      reach: 150,        // px; max stretch of liquid toward the pointer
      stiffness: 0.16,   // spring stiffness
      damping: 0.74,     // velocity kept per frame
      onFrame: null      // fn(pointer, active)
    }, options || {});
    this.el = null;
    this.rect = null;
    this.pt = { x: -9999, y: -9999, active: false };
    this.pts = [];
    this.t = 0;
    this._build();
    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
  }

  GooTether.prototype._build = function () {
    var o = this.o, id = 'goo-tether-' + (++uid);
    var svg = document.createElementNS(SVG_NS, 'svg');
    var s = svg.style;
    s.position = 'fixed'; s.left = '0'; s.top = '0'; s.width = '100%'; s.height = '100%';
    s.pointerEvents = 'none'; s.zIndex = '1'; s.overflow = 'visible';
    svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
    svg.innerHTML = '<defs><filter id="' + id + '" x="-10%" y="-10%" width="120%" height="120%">' +
      '<feGaussianBlur in="SourceGraphic" stdDeviation="5.5" result="b"/>' +
      '<feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10"/>' +
      '</filter></defs>';
    var g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('filter', 'url(#' + id + ')');
    g.setAttribute('fill', o.color);
    svg.appendChild(g);
    document.body.appendChild(svg);
    this.svg = svg; this.group = g;
    this.circles = [];
    var n = o.points * o.chain + 1;
    for (var i = 0; i < n; i++) {
      var c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('r', '0');
      g.appendChild(c);
      this.circles.push(c);
    }
    for (var k = 0; k < o.points; k++) {
      this.pts.push({ x: 0, y: 0, nx: 0, ny: 0, qx: 0, qy: 0, vx: 0, vy: 0, ph: Math.random() * 6.28 });
    }
  };

  GooTether.prototype.attach = function (el) {
    this.el = el;
    var self = this;
    this._measure();
    window.addEventListener('resize', function () { self._measure(); });
    // pointer tracking on the whole window: mouse hover, or finger anywhere
    window.addEventListener('pointermove', function (e) { self.setPointer(e.clientX, e.clientY); });
    window.addEventListener('pointerdown', function (e) { self.setPointer(e.clientX, e.clientY); });
    var end = function (e) { if (e.pointerType !== 'mouse') self.clearPointer(); };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', function () { self.clearPointer(); });
    document.addEventListener('mouseleave', function () { self.clearPointer(); });
  };

  GooTether.prototype.setPointer = function (x, y) { this.pt.x = x; this.pt.y = y; this.pt.active = true; };
  GooTether.prototype.clearPointer = function () { this.pt.active = false; };

  // Place ring points on the element's stadium-shaped outline.
  GooTether.prototype._measure = function () {
    if (!this.el) return;
    var r = this.el.getBoundingClientRect();
    this.rect = r;
    var o = this.o, w = r.width, h = r.height, cx = r.left + w / 2, cy = r.top + h / 2;
    var rad = Math.min(h / 2, w / 2), straight = w - 2 * rad, vstraight = h - 2 * rad;
    var per = 2 * straight + 2 * vstraight + 2 * Math.PI * rad;
    var n = o.points;
    for (var i = 0; i < n; i++) {
      var d = (i / n) * per, x, y, nx, ny;
      if (d < straight) { x = cx - straight / 2 + d; y = cy - h / 2; nx = 0; ny = -1; }
      else if ((d -= straight) < Math.PI * rad / 2) { var a = -Math.PI / 2 + d / rad; x = cx + straight / 2 + rad * Math.cos(a); y = cy - vstraight / 2 + rad * Math.sin(a); nx = Math.cos(a); ny = Math.sin(a); }
      else if ((d -= Math.PI * rad / 2) < vstraight) { x = cx + w / 2; y = cy - vstraight / 2 + d; nx = 1; ny = 0; }
      else if ((d -= vstraight) < Math.PI * rad / 2) { var a2 = d / rad; x = cx + straight / 2 + rad * Math.cos(a2); y = cy + vstraight / 2 + rad * Math.sin(a2); nx = Math.cos(a2); ny = Math.sin(a2); }
      else if ((d -= Math.PI * rad / 2) < straight) { x = cx + straight / 2 - d; y = cy + h / 2; nx = 0; ny = 1; }
      else if ((d -= straight) < Math.PI * rad / 2) { var a3 = Math.PI / 2 + d / rad; x = cx - straight / 2 + rad * Math.cos(a3); y = cy + vstraight / 2 + rad * Math.sin(a3); nx = Math.cos(a3); ny = Math.sin(a3); }
      else if ((d -= Math.PI * rad / 2) < vstraight) { x = cx - w / 2; y = cy + vstraight / 2 - d; nx = -1; ny = 0; }
      else { d -= vstraight; var a4 = Math.PI + d / rad; x = cx - straight / 2 + rad * Math.cos(a4); y = cy - vstraight / 2 + rad * Math.sin(a4); nx = Math.cos(a4); ny = Math.sin(a4); }
      var p = this.pts[i]; p.x = x; p.y = y; p.nx = nx; p.ny = ny;
    }
  };

  GooTether.prototype._tick = function (ts) {
    this._raf = requestAnimationFrame(this._tick);
    if (!this.rect) return;
    var o = this.o, pt = this.pt, t = this.t = ts / 1000, n = o.points, K = o.chain, ci = 0;
    var sx = this.rect.left + this.rect.width / 2, sy = this.rect.top + this.rect.height / 2;
    var maxPull = 0;
    for (var i = 0; i < n; i++) {
      var p = this.pts[i];
      var tx = 0, ty = 0;
      if (pt.active) {
        var dx = pt.x - p.x, dy = pt.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        var ux = dx / d, uy = dy / d;
        var near = Math.pow(1 - clamp(d / o.range, 0, 1), 1.4);       // closer to pointer = stronger
        var face = smooth(-0.35, 0.65, p.nx * ux + p.ny * uy);        // only the side facing it
        var len = Math.min(o.reach * near * face, d * 0.9);
        tx = ux * len; ty = uy * len;
      }
      p.vx = (p.vx + (tx - p.qx) * o.stiffness) * o.damping;
      p.vy = (p.vy + (ty - p.qy) * o.stiffness) * o.damping;
      p.qx += p.vx; p.qy += p.vy;
      var L = Math.sqrt(p.qx * p.qx + p.qy * p.qy);
      if (L > maxPull) maxPull = L;
      var wob = Math.sin(t * 2.2 + p.ph) * 0.9;
      var stretch = clamp(L / 60, 0, 1);
      for (var j = 0; j < K; j++) {
        var s = j / (K - 1);
        var c = this.circles[ci++];
        var ease = s * s * (3 - 2 * s);
        var px = p.x - p.nx * 2 + p.qx * ease + p.nx * o.skin * (1 - s) * 0.6;
        var py = p.y - p.ny * 2 + p.qy * ease + p.ny * o.skin * (1 - s) * 0.6;
        // sideways ripple that grows with the stretch
        var rip = Math.sin(t * 5 + p.ph + s * 4) * 2.2 * stretch * s;
        px += -p.qy / (L || 1) * rip; py += p.qx / (L || 1) * rip;
        var r = lerp(o.radius, o.radius * (0.55 - 0.2 * stretch), s) + wob * 0.4 * (1 - s);
        c.setAttribute('cx', px.toFixed(1)); c.setAttribute('cy', py.toFixed(1)); c.setAttribute('r', Math.max(0.5, r).toFixed(1));
      }
    }
    // spare circle: small droplet-like tip at the strongest pull toward pointer
    var tip = this.circles[ci];
    if (pt.active && maxPull > 30) {
      var tdx = pt.x - sx, tdy = pt.y - sy, td = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
      var lead = Math.min(maxPull * 0.98, td - 6);
      var edge = this._edgeAlong(tdx / td, tdy / td);
      tip.setAttribute('cx', (sx + tdx / td * (edge + lead)).toFixed(1));
      tip.setAttribute('cy', (sy + tdy / td * (edge + lead)).toFixed(1));
      tip.setAttribute('r', (o.radius * 0.5).toFixed(1));
    } else tip.setAttribute('r', '0');
    if (o.onFrame) o.onFrame(pt, pt.active);
  };

  // distance from element center to its outline along a unit direction (approx.)
  GooTether.prototype._edgeAlong = function (ux, uy) {
    var w = this.rect.width / 2, h = this.rect.height / 2;
    return Math.min(Math.abs(ux) > 1e-6 ? w / Math.abs(ux) : 1e9, Math.abs(uy) > 1e-6 ? h / Math.abs(uy) : 1e9);
  };

  GooTether.prototype.destroy = function () {
    cancelAnimationFrame(this._raf);
    if (this.svg && this.svg.parentNode) this.svg.parentNode.removeChild(this.svg);
  };

  global.GooTether = GooTether;
})(window);
