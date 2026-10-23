/*
 * goo-tether
 * Gooey symbiote-style drag tether for any HTML element.
 * Grab the element and it chases your pointer on stretchy goo strands;
 * let go (or yank it too far) and the strands snap and it springs home.
 *
 * Vanilla JS, zero dependencies. MIT license.
 *
 * How it works:
 *  - A full-viewport SVG sits behind your element. Inside it, every strand
 *    is a chain of small circles drawn along a quadratic bezier between the
 *    (lagging) pointer end and the element.
 *  - The SVG group carries a "goo" filter (feGaussianBlur + high-contrast
 *    feColorMatrix on the alpha channel). Nearby circles merge into one
 *    smooth organic shape, so the circle chain reads as a single sticky
 *    strand that necks, beads up and breaks as it stretches.
 *  - Each strand endpoint trails the pointer with its own spring constant,
 *    so strands fan out and whip instead of moving as a rigid line.
 */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var filterCounter = 0;

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function GooTether(options) {
    var o = this.options = Object.assign({
      color: '#161616',        // goo color; match your element for a seamless merge
      strands: 7,              // number of tendril strands
      beads: 16,               // circles per strand (merged by the goo filter)
      thickness: 18,           // strand thickness at the thick end (px)
      tip: 2.5,                // strand thickness at the thin end (px)
      maxStretch: 480,         // px; past this the strands tear
      regrowDelay: 260,        // ms before torn strands regrow while still grabbed
      restLength: 210,       // px; the strand length the element dangles at while grabbed
      follow: 0.055,         // spring stiffness pulling the element toward rest length
      grabDamping: 0.90,     // velocity kept per frame while grabbed
      gravity: 0.22,         // pendulum pull while dangling (px/frame^2 at 60fps)
      returnSpring: 0.085,     // spring stiffness pulling the element home
      returnDamping: 0.865,    // velocity kept per frame while springing home
      trailMin: 0.10,          // slowest strand endpoint follow factor
      trailMax: 0.34,          // fastest strand endpoint follow factor
      wobble: 0.5,             // organic wobble amplitude (0 disables)
      spread: 15,            // px between strand roots across the element edge
      tipSpread: 9,          // px between strand tips at the pointer end
      zIndex: 0,
      onFrame: null           // called each frame with (tipPos, state)
    }, options || {});

    this.home = { x: 0, y: 0 };
    this.pos = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.pointer = { x: 0, y: 0 };
    this.pointerVel = { x: 0, y: 0 };
    this.state = 'idle';       // idle | grabbed | returning
    this.time = 0;
    this._lastT = 0;
    this._el = null;
    this._elSize = { w: 0, h: 0 };

    this._buildSvg();
    this._buildStrands();
    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
  }

  GooTether.prototype._buildSvg = function () {
    var o = this.options;
    var id = 'goo-tether-' + (++filterCounter);
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'goo-tether-svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    var s = svg.style;
    s.position = 'fixed';
    s.left = '0';
    s.top = '0';
    s.width = '100%';
    s.height = '100%';
    s.pointerEvents = 'none';
    s.zIndex = o.zIndex;
    s.overflow = 'visible';

    var blur = Math.max(3, o.thickness * 0.42);
    var k = 22; // alpha contrast; higher = sharper goo edges
    svg.innerHTML =
      '<defs><filter id="' + id + '">' +
      '<feGaussianBlur in="SourceGraphic" stdDeviation="' + blur + '" result="b"/>' +
      '<feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ' + k + ' -' + (k - 9) + '"/>' +
      '</filter></defs>';

    this.group = document.createElementNS(SVG_NS, 'g');
    this.group.setAttribute('filter', 'url(#' + id + ')');
    this.group.setAttribute('fill', o.color);
    svg.appendChild(this.group);
    (document.body || document.documentElement).appendChild(svg);
    this.svg = svg;

    // Blob that hides under the element so strands merge into it.
    this.bodyBlob = document.createElementNS(SVG_NS, 'circle');
    this.group.appendChild(this.bodyBlob);
    // Blob at the free (pointer) end while grabbed.
    this.tipBlob = document.createElementNS(SVG_NS, 'circle');
    this.group.appendChild(this.tipBlob);
  };

  GooTether.prototype._buildStrands = function () {
    var o = this.options;
    this.strands = [];
    for (var i = 0; i < o.strands; i++) {
      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', o.color);
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-width', '0');
      this.group.appendChild(path);
      this.strands.push({
        path: path,
        end: { x: 0, y: 0 },        // lagging pointer-side endpoint
        endVel: { x: 0, y: 0 },
        trail: lerp(o.trailMin, o.trailMax, o.strands === 1 ? 0.5 : i / (o.strands - 1)),
        phase: Math.random() * Math.PI * 2,
        curveBias: (Math.random() * 2 - 1),
        sag: 0,                      // perpendicular control-point offset (spring)
        sagVel: 0,
        growth: 1,                   // 0..1, regrow animation after tearing
        torn: false,
        tornAt: 0
      });
    }
    this.droplets = []; // {circle, x, y, vx, vy, r, life}
  };

  // Attach to an HTML element. Its current on-screen center becomes home.
  GooTether.prototype.attach = function (el) {
    this._el = el;
    var rect = el.getBoundingClientRect();
    this._elSize.w = rect.width;
    this._elSize.h = rect.height;
    this.home.x = rect.left + rect.width / 2;
    this.home.y = rect.top + rect.height / 2;
    this.pos.x = this.home.x;
    this.pos.y = this.home.y;
    this.pointer.x = this.home.x;
    this.pointer.y = this.home.y;

    var s = el.style;
    s.position = 'fixed';
    s.left = '0';
    s.top = '0';
    s.margin = '0';
    s.translate = 'none';
    s.touchAction = 'none';
    s.userSelect = 'none';
    s.webkitUserSelect = 'none';
    s.cursor = 'grab';
    this._place();

    var self = this;
    this._onDown = function (e) {
      e.preventDefault();
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      self.grab(e.clientX, e.clientY);
    };
    this._onMove = function (e) {
      if (self.state === 'grabbed') self.moveTo(e.clientX, e.clientY);
    };
    this._onUp = function () { self.release(); };
    el.addEventListener('pointerdown', this._onDown);
    el.addEventListener('pointermove', this._onMove);
    el.addEventListener('pointerup', this._onUp);
    el.addEventListener('pointercancel', this._onUp);
  };

  // Programmatic control (also used by the demo's attract mode and tests).
  GooTether.prototype.grab = function (x, y) {
    this.pointer.x = x; this.pointer.y = y;
    this.pointerVel.x = 0; this.pointerVel.y = 0;
    if (this.state !== 'grabbed') {
      this.state = 'grabbed';
      for (var i = 0; i < this.strands.length; i++) {
        var st = this.strands[i];
        st.end.x = this.pos.x; st.end.y = this.pos.y;
        st.endVel.x = 0; st.endVel.y = 0;
        st.torn = false; st.growth = Math.min(st.growth, 0.15);
      }
    }
    if (this._el) this._el.style.cursor = 'grabbing';
  };

  GooTether.prototype.moveTo = function (x, y) {
    this.pointerVel.x = x - this.pointer.x;
    this.pointerVel.y = y - this.pointer.y;
    this.pointer.x = x;
    this.pointer.y = y;
  };

  GooTether.prototype.release = function () {
    if (this.state !== 'grabbed') return;
    this.state = 'returning';
    // Whip: free ends keep the pointer's recent velocity, then recoil home.
    for (var i = 0; i < this.strands.length; i++) {
      var st = this.strands[i];
      st.endVel.x = this.pointerVel.x * 0.6;
      st.endVel.y = this.pointerVel.y * 0.6;
      st.sagVel += (Math.random() - 0.5) * 14;
    }
    if (this._el) this._el.style.cursor = 'grab';
  };

  GooTether.prototype.setHome = function (x, y) {
    this.home.x = x; this.home.y = y;
  };

  GooTether.prototype._place = function () {
    if (!this._el) return;
    this._el.style.transform =
      'translate3d(' + (this.pos.x - this._elSize.w / 2) + 'px,' +
      (this.pos.y - this._elSize.h / 2) + 'px,0)';
  };

  GooTether.prototype._spawnDroplets = function (x, y, n) {
    for (var i = 0; i < n; i++) {
      var c = document.createElementNS(SVG_NS, 'circle');
      this.group.appendChild(c);
      var a = Math.random() * Math.PI * 2;
      var sp = 1 + Math.random() * 3;
      this.droplets.push({
        circle: c, x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
        r: 3 + Math.random() * 5, life: 1
      });
    }
  };

  GooTether.prototype._tick = function (t) {
    this._raf = requestAnimationFrame(this._tick);
    if (!this._lastT) this._lastT = t;
    var dt = clamp((t - this._lastT) / 1000, 0.001, 0.05);
    this._lastT = t;
    var step = dt * 60; // 1.0 at 60fps
    this.time += dt;
    var o = this.options;
    var i, st, b;

    // --- body physics ---
    if (this.state === 'grabbed') {
      // dangle: spring toward a rest-length distance from the pointer, with gravity
      var pdx = this.pointer.x - this.pos.x;
      var pdy = this.pointer.y - this.pos.y;
      var pdist = Math.sqrt(pdx * pdx + pdy * pdy) || 0.001;
      var stretch = pdist - o.restLength;
      var fx = (pdx / pdist) * stretch * o.follow * step;
      var fy = (pdy / pdist) * stretch * o.follow * step;
      this.vel.x += fx;
      this.vel.y += fy + o.gravity * step;
      var gd = Math.pow(o.grabDamping, step);
      this.vel.x *= gd; this.vel.y *= gd;
      this.pos.x += this.vel.x * step;
      this.pos.y += this.vel.y * step;
    } else if (this.state === 'returning') {
      this.vel.x += (this.home.x - this.pos.x) * o.returnSpring * step;
      this.vel.y += (this.home.y - this.pos.y) * o.returnSpring * step;
      var d = Math.pow(o.returnDamping, step);
      this.vel.x *= d; this.vel.y *= d;
      this.pos.x += this.vel.x * step;
      this.pos.y += this.vel.y * step;
      if (Math.abs(this.pos.x - this.home.x) < 0.6 && Math.abs(this.pos.y - this.home.y) < 0.6 &&
          Math.abs(this.vel.x) < 0.6 && Math.abs(this.vel.y) < 0.6) {
        this.pos.x = this.home.x; this.pos.y = this.home.y;
        this.vel.x = 0; this.vel.y = 0;
        this.state = 'idle';
      }
    }
    this._place();

    var active = this.state !== 'idle';
    var bx = this.pos.x, by = this.pos.y;

    // body blob hides under the element
    this.bodyBlob.setAttribute('cx', bx);
    this.bodyBlob.setAttribute('cy', by);
    this.bodyBlob.setAttribute('r', active ? Math.max(10, Math.min(this._elSize.w, this._elSize.h) * 0.45) : 0);
    this.tipBlob.setAttribute('r', 0);

    // --- strands ---
    for (i = 0; i < this.strands.length; i++) {
      st = this.strands[i];
      if (!active) { this._hideStrand(st); continue; }

      if (st.torn) {
        this._hideStrand(st);
        if (this.state === 'grabbed' && this.time * 1000 - st.tornAt > o.regrowDelay) {
          st.torn = false;
          st.growth = 0.05;
          st.end.x = bx; st.end.y = by;
        } else {
          continue;
        }
      }
      if (st.growth < 1) st.growth = Math.min(1, st.growth + 0.05 * step);

      if (this.state === 'grabbed') {
        // endpoint trails the pointer; each strand trails differently
        var kf = 1 - Math.pow(1 - st.trail, step);
        st.endVel.x = (this.pointer.x - st.end.x) * kf;
        st.endVel.y = (this.pointer.y - st.end.y) * kf;
      } else {
        // released: recoil toward the body with a whipped velocity
        st.endVel.x += (bx - st.end.x) * 0.10 * step;
        st.endVel.y += (by - st.end.y) * 0.10 * step;
        var rd = Math.pow(0.90, step);
        st.endVel.x *= rd; st.endVel.y *= rd;
      }
      st.end.x += st.endVel.x * step;
      st.end.y += st.endVel.y * step;

      var dx = bx - st.end.x, dy = by - st.end.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 0.001;

      // tear when overstretched
      if (dist > o.maxStretch) {
        st.torn = true;
        st.tornAt = this.time * 1000;
        this._spawnDroplets((st.end.x + bx) / 2, (st.end.y + by) / 2, 3);
        this._hideStrand(st);
        continue;
      }

      // wobble / sag control point
      var nx = -dy / dist, ny = dx / dist; // unit normal
      var relVel = (this.state === 'grabbed')
        ? (this.pointerVel.x * nx + this.pointerVel.y * ny)
        : (this.vel.x * nx + this.vel.y * ny);
      st.sagVel += (-st.sag * 0.12 - st.sagVel * 0.10) * step + relVel * 0.05 * step;
      st.sag += st.sagVel * step;
      var wob = Math.sin(this.time * 9 + st.phase) * o.wobble * 10 * clamp(dist / 120, 0, 1);
      var off = (st.sag + wob + st.curveBias * dist * 0.16) * clamp(dist / 60, 0, 1);

      var fan = (i - (this.strands.length - 1) / 2);
      var ax = st.end.x + nx * fan * o.tipSpread;   // pointer-side root
      var ay = st.end.y + ny * fan * o.tipSpread;
      var bxx = bx + nx * fan * o.spread;           // element-side root
      var byy = by + ny * fan * o.spread;
      var mx = (ax + bxx) / 2 + nx * off;
      var my = (ay + byy) / 2 + ny * off;

      // necking: strands thin as they stretch
      var neck = clamp((dist - o.restLength) / (o.maxStretch - o.restLength), 0, 0.8);

      // tip blob at the pointer end (merges strand roots together there)
      if (this.state === 'grabbed' && i === 0) {
        this.tipBlob.setAttribute('cx', st.end.x);
        this.tipBlob.setAttribute('cy', st.end.y);
        this.tipBlob.setAttribute('r', o.thickness * 1.1);
      }

      // partial-growth draws only the first part of the curve
      var gxx = lerp(ax, bxx, st.growth), gyy = lerp(ay, byy, st.growth);
      var gmx = lerp(ax, mx, st.growth), gmy = lerp(ay, my, st.growth);
      var w = o.thickness * (1 - neck * 0.55) * st.growth;
      w *= 0.9 + 0.1 * Math.sin(this.time * 11 + st.phase); // organic pulse
      st.path.setAttribute('d',
        'M' + ax.toFixed(1) + ',' + ay.toFixed(1) +
        ' Q' + gmx.toFixed(1) + ',' + gmy.toFixed(1) +
        ' ' + gxx.toFixed(1) + ',' + gyy.toFixed(1));
      st.path.setAttribute('stroke-width', Math.max(0, w).toFixed(2));
    }

    // per-frame callback (demo uses it to place the cursor hand)
    if (typeof o.onFrame === 'function') {
      var tip = this.strands.length ? this.strands[0].end : this.pointer;
      o.onFrame({ x: tip.x, y: tip.y, px: this.pointer.x, py: this.pointer.y,
                  vx: this.pointerVel.x, vy: this.pointerVel.y }, this.state);
    }

    // --- droplets ---
    for (i = this.droplets.length - 1; i >= 0; i--) {
      var dr = this.droplets[i];
      dr.vy += 0.25 * step;
      dr.x += dr.vx * step;
      dr.y += dr.vy * step;
      dr.life -= 0.03 * step;
      if (dr.life <= 0) {
        this.group.removeChild(dr.circle);
        this.droplets.splice(i, 1);
      } else {
        dr.circle.setAttribute('cx', dr.x);
        dr.circle.setAttribute('cy', dr.y);
        dr.circle.setAttribute('r', Math.max(0, dr.r * dr.life));
      }
    }
  };

  GooTether.prototype._hideStrand = function (st) {
    st.path.setAttribute('stroke-width', '0');
  };

  GooTether.prototype.destroy = function () {
    cancelAnimationFrame(this._raf);
    if (this.svg && this.svg.parentNode) this.svg.parentNode.removeChild(this.svg);
    if (this._el) {
      this._el.removeEventListener('pointerdown', this._onDown);
      this._el.removeEventListener('pointermove', this._onMove);
      this._el.removeEventListener('pointerup', this._onUp);
      this._el.removeEventListener('pointercancel', this._onUp);
    }
  };

  global.GooTether = GooTether;
})(window);
