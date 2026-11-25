/* AlphaBrain — LAB_01
   Ambient field, intro sequence, hidden signal. No dependencies. */
(() => {
  'use strict';

  const root = document.documentElement;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 560;

  const mark = document.querySelector('.mark');
  const glyphs = document.querySelector('.mark__glyphs');
  const dot = document.querySelector('.mark__dot');
  const tagText = document.querySelector('.tagline__text');
  const status = document.getElementById('status');
  const canvas = document.querySelector('.field');

  const RED = '237,27,73';
  const WHITE = '236,239,238';
  const TAGLINE = 'INTELLIGENCE IN PROGRESS.';
  const SIGNAL = 'SIGNAL RECEIVED.';

  let reduced = motionQuery.matches;
  let settled = false;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const rand = (a, b) => a + Math.random() * (b - a);
  const now = () => performance.now();

  /* ─────────────────── text decode ─────────────────── */

  const NOISE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\_-:.#';
  const hash = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

  function scramble(node, target, duration = 650, delay = 0) {
    return new Promise((resolve) => {
      const from = node.nodeValue;
      const seeds = Array.from({ length: Math.max(from.length, target.length) }, () => Math.random());
      const t0 = now() + delay;
      const step = (ts) => {
        const t = (ts - t0) / duration;
        if (t < 0) { requestAnimationFrame(step); return; }
        if (t >= 1) { node.nodeValue = target; resolve(); return; }
        const len = Math.round(from.length + (target.length - from.length) * smooth(0, .6, t));
        const tick = Math.floor(ts / 48);
        let out = '';
        for (let i = 0; i < len; i++) {
          const ch = target[i] || ' ';
          const resolveAt = (i / Math.max(len, 1)) * .55 + seeds[i] * .35;
          if (t >= resolveAt || ch === ' ') out += ch;
          else out += NOISE[Math.floor(hash(i, tick) * NOISE.length)];
        }
        node.nodeValue = out;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  function textNodes(el) {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) out.push(walker.currentNode);
    return out;
  }

  /* ─────────────────── field ─────────────────── */

  const ctx = canvas && canvas.getContext ? canvas.getContext('2d', { alpha: true }) : null;
  if (!ctx) root.classList.add('no-canvas');

  const field = {
    W: 0, H: 0, dpr: 1,
    nodes: [], signals: [], waves: [],
    linkD: 120, zone: null, dial: null,
    pointer: { x: -9999, y: -9999, presence: 0, active: false, lastMove: 0, lastSignal: 0 },
    par: { x: 0, y: 0 },
    boost: 0,
    nextAmbient: 0,
    wakeOrigin: null,
    raf: 0, last: 0, acc: 0, t: 0,
  };

  const WAVE_SPEED = 0.62; // px per ms

  function dotCentre() {
    const r = dot.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function zoneDist(x, y) {
    const z = field.zone;
    const dx = (x - z.x) / z.rx, dy = (y - z.y) / z.ry;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // clean zones: behind the mark, and the HUD bands top + bottom
  function fadeAt(x, y) {
    const edge = Math.min(y, field.H - y);
    return smooth(1, 1.55, zoneDist(x, y)) * (.3 + .7 * smooth(36, 124, edge));
  }

  function measure() {
    const W = innerWidth, H = innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    field.W = W; field.H = H; field.dpr = dpr;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const m = mark.getBoundingClientRect();
    const tagBottom = document.querySelector('.tagline').getBoundingClientRect().bottom;
    const cy = (m.top + tagBottom) / 2;
    field.zone = {
      x: m.left + m.width / 2,
      y: cy,
      rx: m.width * .64 + 18,
      ry: (tagBottom - m.top) * .62 + 22,
    };
    const R = clamp(m.width * .78, Math.min(W, H) * .3, Math.min(W, H) * .47);
    field.dial = { x: m.left + m.width / 2, y: m.top + m.height / 2, r: R };
  }

  function build() {
    measure();
    const { W, H } = field;
    const target = coarse ? 44 : clamp((W * H) / 11500, 60, 135);
    const s = Math.sqrt((W * H) / target);
    field.linkD = s * 1.62;
    const nodes = [];
    const origin = field.wakeOrigin;
    for (let gy = -0.5; gy < H / s + 0.5; gy++) {
      for (let gx = -0.5; gx < W / s + 0.5; gx++) {
        const hx = (gx + .5 + rand(-.42, .42)) * s;
        const hy = (gy + .5 + rand(-.42, .42)) * s;
        if (zoneDist(hx, hy) < .95) continue;
        const z = rand(.3, 1);
        let wake = 0;
        if (origin) wake = origin.t + Math.hypot(hx - origin.x, hy - origin.y) / WAVE_SPEED;
        nodes.push({
          hx, hy, x: hx, y: hy, vx: 0, vy: 0, z,
          f1: rand(.00011, .00026), f2: rand(.00009, .00022),
          p1: rand(0, 6.283), p2: rand(0, 6.283),
          amp: rand(6, 16) * (.5 + z * .5),
          flash: 0, wake, vis: 0,
        });
      }
    }
    field.nodes = nodes;
    field.signals.length = 0;
  }

  /* signals: red impulses hopping node → node */

  function neighbours(n, exclude) {
    const D2 = field.linkD * field.linkD;
    const out = [];
    for (const o of field.nodes) {
      if (o === n || o === exclude || o.vis < .25) continue;
      const dx = o.x - n.x, dy = o.y - n.y;
      if (dx * dx + dy * dy < D2) out.push(o);
    }
    return out;
  }

  function emit(from, hops, prefer) {
    if (field.signals.length > (coarse ? 8 : 18)) return;
    let options = neighbours(from, null);
    if (!options.length) return;
    let to;
    if (prefer) {
      options.sort((a, b) => prefer(b) - prefer(a));
      to = options[Math.floor(Math.random() * Math.min(2, options.length))];
    } else {
      to = options[Math.floor(Math.random() * options.length)];
    }
    field.signals.push({ a: from, b: to, p: 0, hops, speed: rand(.11, .17), prefer });
    from.flash = Math.max(from.flash, .6);
  }

  function nearestNode(x, y, maxD) {
    let best = null, bd = maxD * maxD;
    for (const n of field.nodes) {
      if (n.vis < .2) continue;
      const dx = n.x - x, dy = n.y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  function wave(x, y, strength, band = 70) {
    field.waves.push({ x, y, t0: field.t, strength, band });
  }

  function burst() {
    const c = dotCentre();
    wave(c.x, c.y, 2.4, 90);
    field.boost = 1;
    const ranked = field.nodes
      .filter((n) => n.vis > .3)
      .sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))
      .slice(0, coarse ? 5 : 9);
    const away = (n) => Math.hypot(n.x - c.x, n.y - c.y);
    ranked.forEach((n, i) => setTimeout(() => emit(n, 6 + (i % 3), away), i * 70));
  }

  /* ─────────────────── render ─────────────────── */

  function step(dt) {
    const f = dt / 16.667;
    const { nodes, pointer, par, zone } = field;
    const t = field.t;

    // parallax eases toward pointer, home when idle
    const tx = pointer.active ? (pointer.x / field.W - .5) : 0;
    const ty = pointer.active ? (pointer.y / field.H - .5) : 0;
    par.x += (tx - par.x) * .035 * f;
    par.y += (ty - par.y) * .035 * f;
    pointer.presence += ((pointer.active && t - pointer.lastMove < 2400 ? 1 : 0) - pointer.presence) * .03 * f;

    field.boost *= Math.pow(.975, f);
    field.waves = field.waves.filter((w) => t - w.t0 < 3200);

    const R = coarse ? 110 : 170;
    const damp = Math.pow(.9, f);

    for (const n of nodes) {
      const gx = n.hx + Math.sin(t * n.f1 + n.p1) * n.amp - par.x * 26 * n.z;
      const gy = n.hy + Math.cos(t * n.f2 + n.p2) * n.amp - par.y * 26 * n.z;
      n.vx += (gx - n.x) * .006 * f;
      n.vy += (gy - n.y) * .006 * f;

      if (pointer.active) {
        const dx = n.x - pointer.x, dy = n.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < R && d > .01) {
          const k = (1 - d / R); const push = k * k * .55 * f * n.z;
          n.vx += dx / d * push; n.vy += dy / d * push;
        }
      }

      for (const w of field.waves) {
        const age = t - w.t0;
        const dx = n.x - w.x, dy = n.y - w.y;
        const d = Math.hypot(dx, dy) || 1;
        const off = Math.abs(d - age * WAVE_SPEED);
        if (off < w.band) {
          const k = (1 - off / w.band) * w.strength * (1 - age / 3200) * f;
          n.vx += dx / d * k * .35; n.vy += dy / d * k * .35;
        }
      }

      n.vx *= damp; n.vy *= damp;
      n.x += n.vx * f; n.y += n.vy * f;
      n.flash *= Math.pow(.955, f);

      const life = n.wake ? smooth(n.wake, n.wake + 900, t) : 1;
      n.fade = fadeAt(n.x, n.y);
      n.vis = life * n.fade;
    }

    // signals travel
    for (let i = field.signals.length - 1; i >= 0; i--) {
      const s = field.signals[i];
      const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) || 1;
      s.p += (s.speed * dt) / len;
      if (s.p >= 1) {
        field.signals.splice(i, 1);
        s.b.flash = 1;
        if (s.hops > 0) {
          const opts = neighbours(s.b, s.a);
          if (opts.length) {
            let next;
            if (s.prefer) { opts.sort((x, y) => s.prefer(y) - s.prefer(x)); next = opts[Math.floor(Math.random() * Math.min(2, opts.length))]; }
            else next = opts[Math.floor(Math.random() * opts.length)];
            field.signals.push({ a: s.b, b: next, p: 0, hops: s.hops - 1, speed: s.speed, prefer: s.prefer });
          }
        }
      }
    }

    // ambient impulses, rare
    if (settled && t > field.nextAmbient) {
      field.nextAmbient = t + rand(3200, 6500);
      const pool = nodes.filter((n) => n.vis > .6);
      if (pool.length) emit(pool[Math.floor(Math.random() * pool.length)], Math.floor(rand(3, 7)));
    }
  }

  function draw() {
    const { nodes, pointer, dial } = field;
    const t = field.t;
    ctx.clearRect(0, 0, field.W, field.H);

    const R = coarse ? 110 : 170;
    const presence = pointer.presence;
    const D = field.linkD, D2 = D * D;
    const boost = 1 + field.boost * 2.2;

    // ── instrument dial: a slowly rotating ring of ticks around the mark
    if (dial) {
      const wakeDial = field.wakeOrigin ? smooth(field.wakeOrigin.t + 300, field.wakeOrigin.t + 1800, t) : 1;
      if (wakeDial > 0) {
        const rot = t * 0.0000105;
        const pa = Math.atan2(pointer.y - dial.y, pointer.x - dial.x);
        const N = coarse ? 90 : 144;
        ctx.lineWidth = 1;
        for (let i = 0; i < N; i++) {
          const a = rot + (i / N) * Math.PI * 2;
          const major = i % 12 === 0;
          let diff = Math.abs(((a - pa + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          const near = Math.exp(-(diff * diff) / .05) * presence;
          const alpha = (major ? .13 : .06) * wakeDial * (1 + field.boost * 1.5) + near * .22;
          const l = major ? 7 : 3.5;
          const c = Math.cos(a), s = Math.sin(a);
          ctx.strokeStyle = `rgba(${WHITE},${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(dial.x + c * dial.r, dial.y + s * dial.r);
          ctx.lineTo(dial.x + c * (dial.r + l), dial.y + s * (dial.r + l));
          ctx.stroke();
        }
        // a short arc sweeping the opposite way — the system "scanning"
        const sweep = -t * 0.000032;
        ctx.strokeStyle = `rgba(${WHITE},${(.07 * wakeDial).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(dial.x, dial.y, dial.r - 6, sweep, sweep + .42);
        ctx.stroke();
      }
    }

    // ── links
    ctx.lineWidth = .6;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (a.vis < .02) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (b.vis < .02) continue;
        const dx = b.x - a.x;
        if (dx > D || dx < -D) continue;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > D2) continue;
        const k = 1 - Math.sqrt(d2) / D;
        let alpha = Math.pow(k, 1.35) * .14 * (a.z + b.z) * .5 * boost;
        if (presence > .01) {
          const mx = (a.x + b.x) / 2 - pointer.x, my = (a.y + b.y) / 2 - pointer.y;
          const md = Math.sqrt(mx * mx + my * my);
          if (md < R * 1.5) alpha += (1 - md / (R * 1.5)) * .26 * k * presence;
        }
        alpha *= Math.min(a.vis, b.vis);
        if (alpha < .004) continue;
        ctx.strokeStyle = `rgba(${WHITE},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // ── nodes
    for (const n of nodes) {
      if (n.vis < .02) continue;
      let alpha = (.14 + .34 * n.z) * n.vis;
      if (presence > .01) {
        const d = Math.hypot(n.x - pointer.x, n.y - pointer.y);
        if (d < R) alpha += (1 - d / R) * .3 * presence * n.vis;
      }
      const r = .55 + n.z * .85;
      if (n.flash > .03) {
        ctx.fillStyle = `rgba(${RED},${(n.flash * .16 * n.vis).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 5 * n.flash, 0, 6.283); ctx.fill();
        ctx.fillStyle = `rgba(${RED},${Math.min(1, n.flash * .9 * n.vis).toFixed(3)})`;
      } else {
        ctx.fillStyle = `rgba(${WHITE},${alpha.toFixed(3)})`;
      }
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 6.283); ctx.fill();
    }

    // ── signals
    ctx.lineWidth = 1;
    for (const s of field.signals) {
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
      const len = Math.hypot(dx, dy) || 1;
      const tail = Math.max(0, s.p - 34 / len);
      const vis = Math.min(s.a.vis, s.b.vis);
      const hx = s.a.x + dx * s.p, hy = s.a.y + dy * s.p;
      const grad = ctx.createLinearGradient(s.a.x + dx * tail, s.a.y + dy * tail, hx, hy);
      grad.addColorStop(0, `rgba(${RED},0)`);
      grad.addColorStop(1, `rgba(${RED},${(.75 * vis).toFixed(3)})`);
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(s.a.x + dx * tail, s.a.y + dy * tail);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.fillStyle = `rgba(${RED},${(.14 * vis).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(hx, hy, 4, 0, 6.283); ctx.fill();
      ctx.fillStyle = `rgba(${RED},${(.95 * vis).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(hx, hy, 1.3, 0, 6.283); ctx.fill();
    }
  }

  function frame(ts) {
    field.raf = requestAnimationFrame(frame);
    let dt = ts - field.last;
    field.last = ts;
    if (dt > 80) dt = 16.667; // returning from a stall: don't jump
    // touch devices: ~30fps is plenty for something this slow
    if (coarse) {
      field.acc += dt;
      if (field.acc < 30) return;
      dt = field.acc; field.acc = 0;
    }
    field.t += dt;
    step(dt);
    draw();
  }

  function start() {
    if (!ctx || reduced || field.raf || document.hidden) return;
    field.last = now();
    field.raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(field.raf);
    field.raf = 0;
  }

  function renderStill() {
    // reduced motion: a single, composed, motionless frame
    field.t = 60000;
    for (const n of field.nodes) { n.x = n.hx; n.y = n.hy; n.fade = fadeAt(n.x, n.y); n.vis = n.fade; n.wake = 0; }
    draw();
  }

  /* ─────────────────── input ─────────────────── */

  function onPointer(e) {
    const p = field.pointer;
    p.x = e.clientX; p.y = e.clientY;
    p.active = true;
    p.lastMove = field.t;
    if (settled && field.t - p.lastSignal > 1300 && Math.random() < .45) {
      p.lastSignal = field.t;
      const n = nearestNode(p.x, p.y, coarse ? 110 : 170);
      if (n) emit(n, Math.floor(rand(2, 5)));
    }
  }

  if (ctx) {
    addEventListener('pointermove', onPointer, { passive: true });
    addEventListener('pointerdown', onPointer, { passive: true });
    document.addEventListener('pointerleave', () => { field.pointer.active = false; });
    addEventListener('blur', () => { field.pointer.active = false; });
    addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') field.pointer.active = false; });

    let resizeTimer = 0, lastW = innerWidth;
    addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // mobile URL-bar show/hide changes height only — keep the field, just remeasure
        if (innerWidth === lastW && coarse) measure();
        else { field.wakeOrigin = null; build(); }
        lastW = innerWidth;
        if (reduced) renderStill();
      }, 140);
    });

    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  }

  motionQuery.addEventListener?.('change', (e) => {
    reduced = e.matches;
    if (!ctx) return;
    if (reduced) { stop(); renderStill(); } else start();
  });

  /* ─────────────────── hidden signal ─────────────────── */

  let signalBusy = false;
  async function activate() {
    if (!settled || signalBusy) return;
    signalBusy = true;
    const node = tagText.firstChild;

    root.classList.remove('is-signal');
    void root.offsetWidth; // restart CSS animations
    root.classList.add('is-signal');
    status.textContent = 'Signal received.';

    if (ctx && !reduced) burst();

    if (reduced) node.nodeValue = SIGNAL;
    else await scramble(node, SIGNAL, 520, 140);

    await new Promise((r) => setTimeout(r, 2600));

    if (reduced) node.nodeValue = TAGLINE;
    else await scramble(node, TAGLINE, 760);
    root.classList.remove('is-signal');
    status.textContent = '';
    signalBusy = false;
  }

  dot.addEventListener('click', activate);

  /* ─────────────────── clocks ─────────────────── */

  const clockEl = document.getElementById('clock');
  const uptimeEl = document.getElementById('uptime');
  const EPOCH = Date.UTC(2017, 11, 31, 16, 0, 0); // 2018-01-01 00:00 ULAT (UTC+8)
  let ubFormat = null;
  try {
    ubFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ulaanbaatar', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch (_) { /* very old engines: fall back to fixed UTC+8 */ }
  const pad = (n) => String(n).padStart(2, '0');

  function tickClocks() {
    const t = Date.now();
    if (ubFormat) clockEl.textContent = ubFormat.format(t);
    else { const d = new Date(t + 8 * 3600e3); clockEl.textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`; }
    const s = Math.floor((t - EPOCH) / 1000);
    const days = Math.floor(s / 86400);
    uptimeEl.textContent = `${days}D ${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  }
  tickClocks();
  setInterval(tickClocks, 1000);

  /* ─────────────────── intro ─────────────────── */

  function settle() {
    settled = true;
    root.classList.add('settled');
    root.classList.remove('intro');
  }

  async function boot() {
    if (ctx) build();

    if (reduced) {
      settle();
      if (ctx) renderStill();
      return;
    }

    // wait for the mark to be ready so the reveal never shows a half-loaded image
    try {
      await Promise.race([glyphs.decode(), new Promise((r) => setTimeout(r, 1500))]);
    } catch (_) { /* decode can reject on some engines; carry on */ }

    root.classList.add('intro');

    if (ctx) {
      // the disturbance leaves the dot as it pulses (CSS .95s); the network wakes in its wake
      field.t = 0;
      const c = dotCentre();
      field.wakeOrigin = { x: c.x, y: c.y, t: 950 };
      for (const n of field.nodes) n.wake = 950 + Math.hypot(n.hx - c.x, n.hy - c.y) / WAVE_SPEED;
      setTimeout(() => wave(c.x, c.y, 1.3, 60), 950);
      field.nextAmbient = 4200;
      start();
    }

    // peripheral text decodes in as it fades up
    scramble(tagText.firstChild, TAGLINE, 900, 1850);
    const items = document.querySelectorAll('[data-decode]');
    items.forEach((el, i) => {
      textNodes(el).forEach((n) => scramble(n, n.nodeValue, 650, 1950 + i * 100));
    });

    setTimeout(settle, 3300);
  }

  boot();
})();
