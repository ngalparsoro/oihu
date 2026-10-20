// The page's demos: the climate waveform that plays as sound, the agent that waits for your approval,
// the map where every figure leads to its official file, and the predictive-maintenance threshold.
// Texts and the climate series come in #oihu-data (written by construir.py); the map and the threshold
// load their JSON from data/ when they get close to the screen.
(function () {
  'use strict';
  const D = JSON.parse(document.getElementById('oihu-data').textContent);
  const T = D.t;
  // browsers without Basque number data fall back to the Spanish format (same decimal comma and grouping)
  const LOC = D.lang === 'en' ? 'en-GB' : (Intl.NumberFormat.supportedLocalesOf([D.lang]).length ? D.lang : 'es');
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s, r) => (r || document).querySelector(s);

  function el(tag, cls, text, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function sv(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const txt = (s) => document.createTextNode(s);
  const fill = (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
  const nf = (o) => { try { return new Intl.NumberFormat(LOC, o); } catch (e) { return new Intl.NumberFormat('es', o); } };
  const INT = nf({ maximumFractionDigits: 0 });
  const EUR = nf({ style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const EURK = nf({ style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 0 });
  const SIGNED = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
  const pct = (v, d) => nf({ style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const sleep = (ms) => new Promise((r) => setTimeout(r, REDUCED ? 0 : ms));
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const hexrgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, f) => { const A = hexrgb(a), B = hexrgb(b); return 'rgb(' + A.map((v, j) => Math.round(v + (B[j] - v) * f)).join(',') + ')'; };
  const ramp = (stops, t) => {
    const x = Math.max(0, Math.min(1, t)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x));
    return mix(stops[i], stops[i + 1], x - i);
  };
  const ease = (k) => 1 - Math.pow(1 - k, 3);
  function tween(ms, step, done) {
    if (REDUCED) { step(1); if (done) done(); return; }
    const t0 = performance.now();
    (function frame(t) {
      const k = Math.max(0, Math.min(1, (t - t0) / ms));   // a frame can be stamped just before t0
      step(ease(k));
      if (k < 1) requestAnimationFrame(frame); else if (done) done();
    })(t0);
  }
  // run fn once: near the screen (margin > 0, to load data) or well into view (margin 0, to animate)
  function when(node, margin, fn) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
    }, { rootMargin: margin, threshold: margin === '0px' ? 0.2 : 0 });
    io.observe(node);
  }
  const CACHE = {};
  const getJSON = (f) => CACHE[f] || (CACHE[f] = fetch(D.r + 'data/' + f).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); }));
  // a nearest-thing tooltip inside a positioned box; its text is always set with textContent
  function place(tip, box, x, y) {
    tip.hidden = false;
    const bw = box.clientWidth, tw = tip.offsetWidth;
    tip.style.left = Math.max(tw / 2, Math.min(bw - tw / 2, x)) + 'px';
    tip.style.top = y + 'px';
  }

  // ---- 1. the climate waveform: read each year's temperature, compare it with the 1940–1970 average, pick a city, hear it ----
  (function climate() {
    const svg = $('#wave'), box = $('.wavebox'), now = $('#wnow'), read = $('#wread'), btn = $('#wplay'), pick = $('#wcity');
    if (!svg || !D.clima) return;
    const C = D.clima, Y0 = C.years[0], N = C.years.length, hint = read.textContent, playLabel = btn.lastChild.textContent;
    const all = [C.mean].concat(Object.keys(C.cities).map((c) => C.cities[c]));
    const lo = Math.min.apply(null, all.map((s) => Math.min.apply(null, s)));
    const hi = Math.max.apply(null, all.map((s) => Math.max.apply(null, s)));
    const far = Math.max(-lo, hi);
    // the same diverging scale as before: blue colder, red warmer, a pale midpoint at the 1940–1970 average
    const RD = ['#053061', '#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7', '#fddbc7', '#f4a582', '#d6604d', '#b2182b', '#67001f'];
    const col = (a) => ramp(RD, (a + 2) / 4);
    const TEMP = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const w = 1000 / N;
    // three shapes for the same bars: a plain line of colours (seeing), centred heights (reading) and rising or
    // falling from the 1940–1970 line (comparing)
    const ATTR = ['x', 'y', 'width', 'height', 'rx'];
    const shape = (m, a, i) => {
      if (m === 'see') return [i * w, 4, w + .6, 142, 0];
      const h = m === 'cmp' ? Math.max(1.5, 68 * Math.abs(a) / far) : 18 + 128 * (a - lo) / (hi - lo);
      return [i * w + w * .18, m === 'cmp' ? (a >= 0 ? 75 - h : 75) : 75 - h / 2, w * .64, h, w * .32];
    };
    let series = C.mean, cur = -1, city = pick.options[0].textContent, playing = false, mode = 'read';
    Object.keys(C.cities).forEach((c) => { el('option', null, c, pick).value = c; });
    const baseT = () => (pick.value ? C.baseT[pick.value] : C.baseT.mean);

    const base = sv('line', { x1: 0, x2: 1000, y1: 75, y2: 75, class: 'base', opacity: 0 }, svg);
    const rects = series.map((a, i) => {
      const attrs = { fill: col(a), style: 'animation-delay:' + (i * 9) + 'ms' };
      shape(mode, a, i).forEach((v, j) => { attrs[ATTR[j]] = v.toFixed(2); });
      return sv('rect', attrs, svg);
    });
    // every bar moves from where it is to the shape of the current mode and series; the colours follow the values
    function morph(from, ms) {
      const start = rects.map((r) => ATTR.map((n) => +r.getAttribute(n))), end = series.map((a, i) => shape(mode, a, i));
      const op0 = +base.getAttribute('opacity'), op1 = mode === 'cmp' ? 1 : 0;
      tween(ms, (k) => {
        rects.forEach((r, i) => {
          ATTR.forEach((n, j) => r.setAttribute(n, (start[i][j] + (end[i][j] - start[i][j]) * k).toFixed(2)));
          r.setAttribute('fill', col(from[i] + (series[i] - from[i]) * k));
        });
        base.setAttribute('opacity', op0 + (op1 - op0) * k);
      });
    }
    const idle = () => { now.textContent = mode === 'cmp' ? '— ' + T.clima.base : ''; };

    function show(i, force) {
      if (i === cur && !force) return;
      cur = i;
      rects.forEach((r, j) => r.classList.toggle('on', j === i));
      svg.classList.toggle('dim', i >= 0);
      if (i < 0) { idle(); read.textContent = hint; return; }
      // the year in view, in the free space of the control bar (the bar itself stays lit, the rest dim)
      const y = Y0 + i, v = SIGNED.format(series[i]).replace('-', '−') + ' °C', t = TEMP.format(baseT() + series[i]) + ' °C';
      now.textContent = '';
      el('b', null, String(y), now);
      now.appendChild(txt(fill(mode === 'cmp' ? T.clima.diff : T.clima.abs, { y: y, t: t, v: v }).slice(String(y).length)));
      read.textContent = fill(T.clima.read, { y: y, t: t, v: v, c: city });
    }
    const at = (x) => { const r = svg.getBoundingClientRect(); return Math.max(0, Math.min(N - 1, Math.floor((x - r.left) / r.width * N))); };
    svg.addEventListener('pointermove', (e) => { if (!playing) show(at(e.clientX)); });
    svg.addEventListener('pointerdown', (e) => { if (!playing) show(at(e.clientX)); });
    svg.addEventListener('pointerleave', (e) => { if (!playing && e.pointerType === 'mouse') show(-1); });
    svg.setAttribute('tabindex', '0');
    svg.setAttribute('aria-describedby', 'wread');
    svg.addEventListener('keydown', (e) => {
      let i = cur < 0 ? N - 1 : cur;
      if (e.key === 'ArrowLeft') i--; else if (e.key === 'ArrowRight') i++;
      else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = N - 1; else return;
      e.preventDefault();
      show(Math.max(0, Math.min(N - 1, i)));
    });
    svg.addEventListener('focus', () => { if (cur < 0) show(N - 1); });
    svg.addEventListener('blur', () => { if (!playing) show(-1); });

    pick.addEventListener('change', () => {
      if (playing) stop();
      city = pick.options[pick.selectedIndex].textContent;
      const from = series;
      series = pick.value ? C.cities[pick.value] : C.mean;
      morph(from, 450);
      if (cur >= 0) show(cur, true);
    });

    // sound: one short note per year, higher when warmer, on a pentatonic scale so it stays pleasant
    const DT = 0.12, STEPS = [0, 2, 4, 7, 9];
    let ctx = null, master = null, raf = 0, t0 = 0;
    const freq = (a) => {
      const k = Math.round((a - lo) / (hi - lo) * (STEPS.length * 3 - 1));
      return 196 * Math.pow(2, (Math.floor(k / 5) * 12 + STEPS[k % 5]) / 12);
    };
    const hearBtn = $('button.way[data-way="hear"]');
    function start() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = ctx || new AC();
      if (ctx.state === 'suspended') ctx.resume();
      master = ctx.createGain();
      master.gain.value = .5;
      master.connect(ctx.destination);
      t0 = ctx.currentTime + .08;
      series.forEach((a, i) => {
        const t = t0 + i * DT, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = freq(a);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(.2, t + .012);
        g.gain.exponentialRampToValueAtTime(.001, t + .3);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + .32);
      });
      playing = true;
      btn.setAttribute('aria-pressed', 'true');
      btn.lastChild.textContent = T.clima.stop;
      if (hearBtn) hearBtn.classList.add('on');
      (function frame() {
        const i = Math.floor((ctx.currentTime - t0) / DT);
        if (i >= N) { stop(); return; }
        if (i >= 0) show(i);
        raf = requestAnimationFrame(frame);
      })();
    }
    function stop() {
      cancelAnimationFrame(raf);
      if (master) {
        const m = master;
        m.gain.setTargetAtTime(0, ctx.currentTime, .03);
        setTimeout(() => m.disconnect(), 250);
        master = null;
      }
      playing = false;
      btn.setAttribute('aria-pressed', 'false');
      btn.lastChild.textContent = playLabel;
      if (hearBtn) hearBtn.classList.remove('on');
      show(-1);
    }
    btn.addEventListener('click', () => (playing ? stop() : start()));

    // the ways above the waveform: see (only the colours), read, compare, hear
    const ways = Array.prototype.slice.call(document.querySelectorAll('button.way'));
    function setMode(m) {
      mode = m;
      ways.forEach((b) => { if (b.dataset.way !== 'hear') b.classList.toggle('on', b.dataset.way === m); });
      morph(series, 450);
      if (cur >= 0) show(cur, true); else idle();
    }
    const WAYS = {
      see: () => { if (playing) stop(); setMode('see'); show(-1); },
      read: () => {
        if (playing) stop();
        setMode('read');
        let i = 0;
        series.forEach((a, k) => { if (a > series[i]) i = k; });
        show(i, true);
      },
      cmp: () => { if (playing) stop(); setMode('cmp'); show(N - 1, true); },
      hear: () => { if (!playing) start(); },
    };
    ways.forEach((b) => b.addEventListener('click', () => {
      const r = box.getBoundingClientRect();
      if (r.top < 70 || r.bottom > innerHeight) box.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
      WAYS[b.dataset.way]();
    }));
    setMode('read');
  })();

  // ---- 2. the agent: it reads, searches and prepares, then waits for a person to approve ----
  (function agent() {
    const root = $('#agente');
    if (!root) return;
    const A = T.agent, STOP = {};
    const FILE = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4.5 1.5h6l3.5 3.5v11.5h-9.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M10.5 1.5v3.5h3.5M7 9h4.5M7 11.8h4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
    const tabs = el('div', 'ag-tabs', null, root);
    tabs.setAttribute('role', 'tablist');
    const body = el('div', 'ag-body', null, root);
    body.setAttribute('role', 'tabpanel');
    const left = el('div', null, null, body);
    el('p', 'lbl', A.in, left);
    const doc = el('div', 'doc', null, left);
    const run = el('div', 'ag-run', null, body);
    el('p', 'lbl', A.does, run);
    const steps = el('ol', 'ag-steps', null, run);
    steps.setAttribute('aria-live', 'polite');
    const logBox = el('div', 'log', null, root);
    el('p', 'lbl', A.log, logBox);
    const logList = el('ol', null, null, logBox);
    logList.setAttribute('aria-live', 'polite');
    el('li', 'empty', A.logEmpty, logList);
    el('p', 'log-note', A.logNote, logBox);
    const clock = new Intl.DateTimeFormat(LOC, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let token = 0, current = 0;
    const buttons = A.tasks.map((t, k) => {
      const b = el('button', 'chip', t.tab, tabs);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', 'false');
      b.addEventListener('click', () => start(k));
      return b;
    });

    function prepare(k) {
      const task = A.tasks[k];
      current = k;
      buttons.forEach((b, j) => b.setAttribute('aria-selected', String(j === k)));
      doc.textContent = '';
      const h = el('p', 'doc-t', null, doc);
      h.innerHTML = FILE;
      h.appendChild(txt(task.doc));
      const ul = el('ul', null, null, doc);
      steps.textContent = '';
      while (run.lastChild !== steps) run.removeChild(run.lastChild);
      return task.lines.map((l) => el('li', null, l, ul));
    }
    async function type(node, text, live) {
      if (REDUCED) { node.textContent = text; return; }
      for (let i = 3; i < text.length + 3; i += 3) {
        node.textContent = text.slice(0, i);
        await sleep(16);
        live();
      }
    }
    async function render(o, live) {
      const box = el('div', 'out reveal', null, run);
      if (o.title) el('h4', null, o.title, box);
      requestAnimationFrame(() => box.classList.add('in'));
      if (o.type === 'list') {
        for (const it of o.items) {
          await sleep(260); live();
          const row = el('div', 'res reveal', null, box), name = el('div', null, null, row);
          el('b', null, it[0], name);
          el('span', null, it[1], name);
          const sc = el('div', 'score', null, row), bar = el('span', 'bar', null, sc), fillBar = el('i', null, null, bar);
          el('span', null, String(it[2]), sc);
          requestAnimationFrame(() => { row.classList.add('in'); fillBar.style.width = it[2] + '%'; });
        }
      } else if (o.type === 'text') {
        await type(el('p', 'typed', null, box), o.text, live);
      } else if (o.type === 'form') {
        const dl = el('dl', 'form', null, box);
        for (const f of o.fields) {
          el('dt', null, f[0], dl);
          await type(el('dd', null, null, dl), f[1], live);
        }
      } else if (o.type === 'alert') {
        box.className = 'alert reveal';
        box.textContent = o.text;
      }
    }
    function decide(task) {
      const my = token;
      const box = el('div', 'decide reveal', null, run);
      el('p', 'lbl', A.you, box);
      el('p', 'q', task.ask, box);
      const btns = el('div', 'btns', null, box);
      const yes = el('button', 'btn primary', task.yes, btns), no = el('button', 'btn', A.reject, btns);
      yes.type = no.type = 'button';
      const wait = el('p', 'wait', A.wait, box);
      requestAnimationFrame(() => box.classList.add('in'));
      function choose(ok) {
        if (my !== token) return;
        yes.disabled = no.disabled = true;
        wait.remove();
        const empty = logList.querySelector('.empty');
        if (empty) empty.remove();
        const entry = el('li', null, null);
        logList.insertBefore(entry, logList.firstChild);
        el('time', null, clock.format(new Date()), entry);
        el('span', null, task.tab, entry);
        el('span', ok ? 'ok' : 'ko', (ok ? A.ok : A.ko) + ' ' + A.by, entry);
        const v = el('p', 'verdict reveal' + (ok ? '' : ' no'), (ok ? '✓ ' : '✕ ') + (ok ? task.done : task.undone), run);
        const again = el('button', 'again', A.again, run);
        again.type = 'button';
        again.addEventListener('click', () => start(current));
        requestAnimationFrame(() => v.classList.add('in'));
      }
      yes.addEventListener('click', () => choose(true));
      no.addEventListener('click', () => choose(false));
    }
    async function start(k) {
      const my = ++token, task = A.tasks[k];
      const live = () => { if (my !== token) throw STOP; };
      const lines = prepare(k);
      try {
        for (let i = 0; i < task.steps.length; i++) {
          const s = task.steps[i];
          const li = el('li', 'run reveal', null, steps);
          el('span', 'dot', null, li);
          const d = el('div', null, null, li);
          el('code', null, s[0], d);
          el('p', null, s[1], d);
          await sleep(40); live();
          li.classList.add('in');
          if (i === 0) {
            for (const l of lines) { await sleep(150); live(); l.classList.add('read'); }
          } else {
            await sleep(950); live();
          }
          li.classList.remove('run');
          li.classList.add('ok');
          if (s[2] != null) await render(task.out[s[2]], live);
          await sleep(260); live();
        }
        decide(task);
      } catch (e) {
        if (e !== STOP) throw e;
      }
    }
    prepare(0);
    when(root, '0px', () => { if (!token) start(0); });
  })();

  // ---- 3. the map: European-election turnout, and each figure followed back to its official file ----
  (function mapa() {
    const root = $('#mapa');
    if (!root) return;
    const M = T.map, TERR = T.terr, YKEY = { 2024: '2024-06', 2019: '2019-05' };
    // one hue, light to dark (dark mode: dark to light), computed in OKLCH with evenly spaced lightness
    const RAMP = {
      light: ['#def6f6', '#acdbdc', '#7ac0c3', '#48a4aa', '#008790', '#006a75', '#004e59'],
      dark: ['#193b3f', '#13585e', '#02757c', '#03949a', '#2bb2b6', '#56cfd0', '#85ecea'],
    };
    const LO = 40, HI = 90, START = '20069';   // Donostia, selected when the map first comes into view
    let year = '2024', data = null, paths = [], sel = -1, hov = -1, hoverPath, selPath;
    const names = new Map();

    const ctl = el('div', 'mp-ctl', null, root);
    const seg = el('div', 'seg', null, ctl);
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', M.years);
    const ybtn = ['2024', '2019'].map((y) => {
      const b = el('button', 'chip', y, seg);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(y === year));
      b.addEventListener('click', () => setYear(y));
      return b;
    });
    const search = el('input', 'mp-search', null, ctl);
    search.type = 'search';
    search.placeholder = M.search;
    search.setAttribute('aria-label', M.search);
    search.setAttribute('list', 'mp-names');
    search.autocomplete = 'off';
    const list = el('datalist', null, null, ctl);
    list.id = 'mp-names';
    const body = el('div', 'mp-body', null, root);
    const box = el('div', 'mp-map pre', null, body);
    const tip = el('div', 'tip', null, box);
    tip.hidden = true;
    const panel = el('div', 'mp-panel', null, body);
    panel.setAttribute('aria-live', 'polite');
    el('p', 'mp-pick', M.pick, panel);
    const legend = el('div', 'legend', null, root);
    el('span', null, M.legend, legend);
    const rampBox = el('div', 'ramp', null, legend), rampBar = el('i', null, null, rampBox), ticks = el('div', null, null, rampBox);
    for (let v = LO; v <= HI; v += 10) el('span', null, pct(v / 100, 0), ticks);
    const nd = el('span', 'nd', null, legend);
    nd.innerHTML = '<svg viewBox="0 0 16 12" aria-hidden="true"><defs><pattern id="mp-nd2" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" style="fill:var(--paper)"/><rect width="1.6" height="4" style="fill:var(--line-2)"/></pattern></defs><rect width="16" height="12" fill="url(#mp-nd2)"/></svg>';
    nd.appendChild(txt(M.nodata));

    const name = (m) => (D.lang === 'eu' ? m[2] : m[1]);
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const val = (m) => { const d = m[year === '2019' ? 5 : 6]; return d && d[0] ? 100 * d[1] / d[0] : null; };
    function paint() {
      const stops = RAMP[isDark() ? 'dark' : 'light'];
      rampBar.style.background = 'linear-gradient(90deg,' + stops.join(',') + ')';
      paths.forEach((p, i) => {
        const v = val(data.munis[i]);
        p.setAttribute('fill', v == null ? 'url(#mp-nd)' : ramp(stops, (v - LO) / (HI - LO)));
      });
    }
    function setYear(y) {
      year = y;
      ybtn.forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === y)));
      if (!data) return;
      paint();
      if (sel >= 0) renderPanel();
    }
    function hover(i, e) {
      if (i < 0) { hov = -1; hoverPath.setAttribute('d', ''); tip.hidden = true; return; }
      if (i !== hov) {
        hov = i;
        const m = data.munis[i], v = val(m);
        hoverPath.setAttribute('d', m[4]);
        tip.textContent = '';
        el('b', null, name(m), tip);
        tip.appendChild(txt(' · ' + (v == null ? M.nodata : pct(v / 100, 1))));
      }
      const r = box.getBoundingClientRect();
      place(tip, box, e.clientX - r.left, e.clientY - r.top);
    }
    function select(i) {
      sel = i;
      selPath.setAttribute('d', data.munis[i][4]);
      renderPanel();
    }
    function step(ol, n, title) {
      const li = el('li', 'reveal', null, ol);
      el('span', 'n', String(n), li);
      const d = el('div', null, null, li);
      el('h4', null, title, d);
      return d;
    }
    function link(parent, text, href) {
      const a = el('a', null, text + ' ↗', el('p', null, null, parent));
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
    }
    function renderPanel() {
      const m = data.munis[sel], src = data.sources[m[0].indexOf('FR') === 0 ? 'iparralde' : 'hegoalde'];
      const d = m[year === '2019' ? 5 : 6];
      panel.textContent = '';
      el('p', 'mp-place', name(m) + (m[3] ? ' · ' + (TERR[m[3]] || m[3]) : ''), panel);
      if (!d || !d[0]) {
        el('p', 'mp-big', '—', panel);
        el('p', 'mp-sub', M.nodataWhy, panel);
        return;
      }
      const p = pct(d[1] / d[0], 1), c = INT.format(d[0]), v = INT.format(d[1]), f = src.files[year];
      el('p', 'mp-big', p, panel);
      el('p', 'mp-sub', fill(M.turnout, { y: year }), panel);
      const ol = el('ol', 'chain', null, panel);
      el('p', null, fill(M.s1t, { v: v, c: c, p: p }), step(ol, 1, M.s1));
      const s2 = step(ol, 2, M.s2);
      el('code', null, src.tables[year], el('p', null, null, s2));
      el('p', null, fill(M.s2t, { name: name(m), id: m[0], c: c, v: v }), s2);
      link(s2, M.beh, data.behatokia.replace('{y}', YKEY[year]).replace('{id}', m[0]) + (D.lang === 'eu' ? '' : '&l=' + D.lang));
      const s3 = step(ol, 3, M.s3);
      const p3 = el('p', null, null, s3);
      el('code', null, f.file, p3);
      p3.appendChild(txt(' · ' + src.org + ' (' + src.dataset + ')'));
      const ph = el('p', null, M.hash + ': ', s3);
      el('code', null, f.sha256, ph);
      el('p', null, fill(M.got, { d: f.date }), s3);
      link(s3, M.page, src.page);
      const items = Array.prototype.slice.call(ol.children);
      if (REDUCED) { ol.classList.add('in'); items.forEach((li) => li.classList.add('in')); return; }
      requestAnimationFrame(() => {
        ol.classList.add('in');
        items.forEach((li, k) => setTimeout(() => li.classList.add('in'), 120 + k * 260));
      });
    }
    function find() {
      const q = norm(search.value);
      if (!q) return;
      let i = names.get(q);
      if (i == null) for (const [k, j] of names) if (k.indexOf(q) === 0) { i = j; break; }
      if (i != null) select(i);
    }
    function reveal() {
      const first = () => { const i = data.munis.findIndex((m) => m[0] === START); if (i >= 0 && sel < 0) select(i); };
      if (REDUCED) { box.classList.remove('pre'); first(); return; }
      paths.forEach((p) => { p.style.transitionDelay = Math.round(p.getBBox().x / data.w * 700) + 'ms'; });
      requestAnimationFrame(() => {
        box.classList.remove('pre');
        setTimeout(() => { paths.forEach((p) => { p.style.transitionDelay = ''; }); first(); }, 1250);
      });
    }
    function init(d) {
      data = d;
      const svg = sv('svg', { viewBox: '0 0 ' + d.w + ' ' + d.h, role: 'img', 'aria-label': $('#demo-mapa-h').textContent });
      box.insertBefore(svg, tip);
      svg.innerHTML = '<defs><pattern id="mp-nd" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" style="fill:var(--paper)"/><rect width="2" height="6" style="fill:var(--line-2)"/></pattern></defs>';
      const g = sv('g', {}, svg);
      paths = d.munis.map((m, i) => {
        const p = sv('path', { d: m[4], class: 'm', 'fill-rule': 'evenodd' }, g);
        p.dataset.i = i;
        names.set(norm(m[1]), i);
        names.set(norm(m[2]), i);
        return p;
      });
      d.munis.map(name).sort((a, b) => a.localeCompare(b, LOC)).forEach((n) => { el('option', null, null, list).value = n; });
      d.terr.forEach((t) => sv('path', { d: t, class: 'mp-terr' }, svg));
      hoverPath = sv('path', { class: 'mp-hover' }, svg);
      selPath = sv('path', { class: 'mp-sel' }, svg);
      paint();
      svg.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const i = e.target.dataset ? +e.target.dataset.i : NaN;
        hover(isNaN(i) ? -1 : i, e);
      });
      svg.addEventListener('pointerleave', () => hover(-1));
      svg.addEventListener('click', (e) => { const i = e.target.dataset ? +e.target.dataset.i : NaN; if (!isNaN(i)) select(i); });
      search.addEventListener('change', find);
      search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); find(); } });
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint);
      when(root, '0px', reveal);
    }
    when(root, '600px', () => getJSON('mapa.json').then(init).catch(() => { panel.textContent = M.nodata; }));
  })();

  // ---- 4. the threshold: the model's real probabilities on 2,000 test parts, what each threshold costs, and the model seen four ways ----
  (function umbral() {
    const root = $('#umbral');
    if (!root) return;
    const U = T.um, MO = T.modelo, mroot = $('#modelo');
    const ICON = {
      tp: '<svg class="ico" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" style="fill:var(--good)"/><path d="M5.2 9.3l2.5 2.4 5-5.2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      fn: '<svg class="ico" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" style="fill:var(--crit)"/><path d="M6.2 6.2l5.6 5.6M11.8 6.2l-5.6 5.6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
      fp: '<svg class="ico" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 1.6l8 14.6H1z" style="fill:var(--warn)" stroke-linejoin="round"/><path d="M9 6.6v4.6" stroke="#021B2E" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="13.7" r="1.1" fill="#021B2E"/></svg>',
    };
    // a shape per state as well as a colour: circle, triangle, cross
    const SHAPE = {
      n: 'M-2.4 0a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0z',
      tp: 'M-4.5 0a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0z',
      fp: 'M0-5.6L5.2 3.4H-5.2z',
      fn: 'M-5.2-3.2l2-2 3.2 3.2 3.2-3.2 2 2-3.2 3.2 3.2 3.2-2 2-3.2-3.2-3.2 3.2-2-2 3.2-3.2z',
    };
    const stats = el('div', 'um-stats', null, root), tiles = {};
    [['tp', U.found], ['fn', U.missed], ['fp', U.false], ['cost', U.cost]].forEach((k) => {
      const t = el('div', 'stat', null, stats), l = el('div', 'l', null, t);
      if (ICON[k[0]]) l.innerHTML = ICON[k[0]];
      l.appendChild(txt(k[1]));
      tiles[k[0]] = el('div', 'v', '–', t);
    });
    const ctl = el('div', 'um-ctl', null, root);
    const lab = el('label', null, U.label, ctl);
    lab.htmlFor = 'um-range';
    const range = el('input', null, null, ctl);
    range.type = 'range'; range.id = 'um-range'; range.min = '0'; range.max = '1000'; range.step = '1'; range.disabled = true;
    const out = el('output', null, '', ctl);
    const reset = el('button', 'chip', U.reset, ctl);
    reset.type = 'button';
    const toMin = el('button', 'chip', U.toMin, ctl);
    toMin.type = 'button';
    // the plant's own costs: they move the cheapest threshold
    const costs = el('div', 'costs', null, root), cin = {};
    [['miss', U.cMiss, 500, 20000, 500], ['false', U.cFalse, 50, 3000, 50]].forEach((c) => {
      const l = el('label', null, null, costs), top = el('span', null, null, l);
      top.appendChild(txt(c[1]));
      const o = el('output', null, '', top), r = el('input', null, null, l);
      r.type = 'range'; r.min = String(c[2]); r.max = String(c[3]); r.step = String(c[4]); r.disabled = true;
      cin[c[0]] = { r: r, o: o };
    });
    const charts = el('div', 'um-charts', null, root);
    const c1 = el('div', 'chart', null, charts), c2 = el('div', 'chart', null, charts);
    const tip = el('div', 'tip', null, c1);
    tip.hidden = true;
    const legend = el('div', 'um-legend', null, root);
    ['n', 'tp', 'fn', 'fp'].forEach((k) => {
      const s = el('span', null, null, legend);
      s.innerHTML = '<svg viewBox="-7 -7 14 14" aria-hidden="true"><path class="pt ' + k + '" d="' + SHAPE[k] + '"/></svg>';
      s.appendChild(txt(U.legend[k]));
    });
    const minNote = el('p', 'um-min', '', root);

    const clamp = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
    const z = (p) => { p = clamp(p); return Math.log(p / (1 - p)); };
    const unz = (v) => 1 / (1 + Math.exp(-v));
    const Z0 = z(0.04), Z1 = z(0.9999);
    const TICKS = [[0.1, 0], [0.5, 0], [0.9, 0], [0.99, 0], [0.999, 1], [0.9999, 2]];
    const fmtP = (p) => pct(p, p >= 0.995 ? 2 : 1);

    function init(d) {
      const P = d.p, Y = d.y, Wr = d.wear, K = d.kind, n = P.length;
      const F = Y.reduce((a, b) => a + b, 0), ZP = P.map(z), ZM = z(d.threshold);
      let cMiss = d.cost_miss, cFalse = d.cost_false, curve = [], best = null, cmax = 0, cstep = 1;
      const zs = [ZM];
      for (let k = 0; k <= 240; k++) zs.push(Z0 + (Z1 - Z0) * k / 240);
      zs.sort((a, b) => a - b);
      const counts = zs.map((v) => {
        const t = unz(v);
        let fn = 0, fp = 0;
        for (let i = 0; i < n; i++) { if (P[i] >= t) { if (!Y[i]) fp++; } else if (Y[i]) fn++; }
        return [fn, fp];
      });
      function recost() {
        curve = zs.map((v, k) => [v, counts[k][0] * cMiss + counts[k][1] * cFalse]);
        best = curve.reduce((a, b) => (b[1] < a[1] ? b : a));
        const atModel = curve.find((c) => c[0] === ZM);
        if (atModel[1] === best[1]) best = atModel;
        const top = Math.max.apply(null, curve.map((c) => c[1])), raw = top / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
        cstep = [1, 2, 5, 10].map((k) => k * mag).find((v) => v >= raw);
        cmax = Math.ceil(top / cstep) * cstep;
        cin.miss.o.textContent = EUR.format(cMiss);
        cin.false.o.textContent = EUR.format(cFalse);
        minNote.textContent = fill(U.minT, { p: fmtP(unz(best[0])), m: fmtP(d.threshold) });
      }
      let zt = z(0.9), shown = REDUCED ? 1 : 0, G = null, drag = false, width = 0;

      // both charts are drawn at their real width (and redrawn when it changes), so the axis text stays at 11.5 px
      function layout() {
        width = c1.clientWidth;
        c1.querySelectorAll('svg').forEach((x) => x.remove());
        c2.textContent = '';
        const W1 = Math.max(280, c1.clientWidth), H1 = Math.round(Math.min(380, Math.max(270, W1 * .56))), m1 = { l: 54, r: 14, t: 28, b: 46 };
        const x1 = (w) => m1.l + w / 260 * (W1 - m1.l - m1.r);
        const y1 = (v) => m1.t + (1 - (v - Z0) / (Z1 - Z0)) * (H1 - m1.t - m1.b);
        const s1 = sv('svg', { viewBox: '0 0 ' + W1 + ' ' + H1, width: W1, height: H1, role: 'img', 'aria-label': $('#demo-umbral-h').textContent });
        c1.insertBefore(s1, tip);
        const clip = sv('rect', { x: 0, y: 0, width: W1 * shown, height: H1 }, sv('clipPath', { id: 'um-clip' }, sv('defs', {}, s1)));
        const grid = sv('g', { class: 'grid' }, s1);
        TICKS.forEach((t) => {
          const y = y1(z(t[0]));
          sv('line', { x1: m1.l, x2: W1 - m1.r, y1: y, y2: y }, grid);
          sv('text', { x: m1.l - 8, y: y + 4, 'text-anchor': 'end' }, s1).textContent = pct(t[0], t[1]);
        });
        for (let w = 0; w <= 250; w += 50) sv('text', { x: x1(w), y: H1 - m1.b + 18, 'text-anchor': 'middle' }, s1).textContent = String(w);
        sv('text', { x: (m1.l + W1 - m1.r) / 2, y: H1 - 6, 'text-anchor': 'middle' }, s1).textContent = U.x;
        sv('text', { x: 0, y: 13, class: 't' }, s1).textContent = U.y;
        const zone = sv('rect', { class: 'zone', x: m1.l, y: m1.t, width: W1 - m1.l - m1.r, height: 0 }, s1);
        const dots = sv('g', { 'clip-path': 'url(#um-clip)' }, s1);
        const pts = new Array(n), PX = Wr.map(x1), PY = ZP.map(y1);
        P.map((p, i) => i).sort((a, b) => Y[a] - Y[b]).forEach((i) => {   // failures drawn on top
          pts[i] = sv('path', { transform: 'translate(' + PX[i].toFixed(1) + ' ' + PY[i].toFixed(1) + ')' }, dots);
        });
        const zAlarm = sv('text', { x: m1.l + 8, y: m1.t + 16, class: 't' }, s1);
        zAlarm.textContent = U.alarm;
        const zQuiet = sv('text', { x: m1.l + 8, y: 0, class: 't' }, s1);
        zQuiet.textContent = U.quiet;
        const th = sv('g', { class: 'th' }, s1);
        const thLine = sv('line', { x1: m1.l, x2: W1 - m1.r, y1: 0, y2: 0 }, th);
        const thGrip = sv('circle', { class: 'grip', cx: W1 - m1.r, cy: 0, r: 6 }, th);
        const thText = sv('text', { x: W1 - m1.r - 12, y: 0, 'text-anchor': 'end' }, th);
        const thHit = sv('rect', { class: 'hit', x: m1.l, y: 0, width: W1 - m1.l - m1.r, height: 30, style: 'touch-action:none' }, th);

        const W2 = Math.max(260, c2.clientWidth), H2 = Math.round(Math.min(330, Math.max(240, W2 * .78))), m2 = { l: 64, r: 16, t: 40, b: 46 };
        const x2 = (v) => m2.l + (v - Z0) / (Z1 - Z0) * (W2 - m2.l - m2.r);
        const y2 = (c) => m2.t + (1 - c / cmax) * (H2 - m2.t - m2.b);
        const s2 = sv('svg', { viewBox: '0 0 ' + W2 + ' ' + H2, width: W2, height: H2, role: 'img', 'aria-label': U.costT }, c2);
        sv('text', { x: 0, y: 13, class: 't' }, s2).textContent = U.costT;
        const g2 = sv('g', { class: 'grid' }, s2);
        for (let c = 0; c <= cmax + 1e-6; c += cstep) {
          sv('line', { x1: m2.l, x2: W2 - m2.r, y1: y2(c), y2: y2(c) }, g2);
          sv('text', { x: m2.l - 8, y: y2(c) + 4, 'text-anchor': 'end' }, s2).textContent = EURK.format(c);
        }
        TICKS.forEach((t, k) => {
          if (k === 0 || k === 4) return;
          sv('text', { x: x2(z(t[0])), y: H2 - m2.b + 18, 'text-anchor': 'middle' }, s2).textContent = pct(t[0], t[1]);
        });
        sv('text', { x: (m2.l + W2 - m2.r) / 2, y: H2 - 6, 'text-anchor': 'middle' }, s2).textContent = U.label;
        const mg = sv('g', { class: 'min' }, s2);
        sv('line', { x1: x2(best[0]), x2: x2(best[0]), y1: m2.t - 8, y2: H2 - m2.b }, mg);
        sv('text', { x: x2(best[0]) - 5, y: m2.t - 12, 'text-anchor': 'end' }, mg).textContent = U.min;
        sv('line', { x1: x2(ZM), x2: x2(ZM), y1: m2.t - 8, y2: H2 - m2.b }, mg);
        sv('text', { x: x2(ZM) + 5, y: m2.t - 12 }, mg).textContent = U.model;   // the cheapest to the left of its line, the model's to the right
        sv('path', { class: 'cost', d: curve.map((c, k) => (k ? 'L' : 'M') + x2(c[0]).toFixed(1) + ' ' + y2(c[1]).toFixed(1)).join('') }, s2);
        const dot = sv('circle', { class: 'cost-dot', r: 5 }, s2);
        const dotText = sv('text', { class: 't', 'text-anchor': 'middle' }, s2);
        G = { W1: W1, H1: H1, m1: m1, x1: x1, y1: y1, PX: PX, PY: PY, s1: s1, clip: clip, zone: zone, zAlarm: zAlarm, zQuiet: zQuiet, pts: pts, cls: new Array(n),
              thLine: thLine, thGrip: thGrip, thText: thText, thHit: thHit, W2: W2, m2: m2, x2: x2, y2: y2, dot: dot, dotText: dotText };
      }

      // the model card: confusion matrix, precision–recall, ROC and failure types, all following the same threshold
      const order = P.map((p, i) => i).sort((a, b) => P[b] - P[a]);
      const PRC = [], ROC = [[0, 0]];
      let tp0 = 0, fp0 = 0;
      order.forEach((i, k) => {
        if (Y[i]) tp0++; else fp0++;
        if (k === n - 1 || P[order[k + 1]] !== P[i]) { PRC.push([tp0 / F, tp0 / (tp0 + fp0)]); ROC.push([fp0 / (n - F), tp0 / F]); }
      });
      let auc = 0;
      for (let k = 1; k < ROC.length; k++) auc += (ROC[k][0] - ROC[k - 1][0]) * (ROC[k][1] + ROC[k - 1][1]) / 2;
      const KINDS = ['HDF', 'OSF', 'PWF', 'TWF', ''];
      let mtab = 'cm', M = null;
      const mt = mroot ? el('div', 'vrow', null, mroot) : null, mbody = mroot ? el('div', 'vbody', null, mroot) : null;
      if (mt) {
        mt.setAttribute('role', 'tablist');
        const mbtn = Object.keys(MO.tabs).map((k) => {
          const b = el('button', 'chip', MO.tabs[k], mt);
          b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(k === mtab));
          b.addEventListener('click', () => { mtab = k; mbtn.forEach((x) => x.setAttribute('aria-selected', String(x === b))); buildModel(); update(zt); });
          return b;
        });
      }
      function curveChart(pts, xl, yl, extra) {
        const W = Math.min(640, Math.max(280, mbody.clientWidth)), H = Math.round(Math.min(380, W * .7)), m = { l: 54, r: 16, t: 16, b: 46 };
        const x = (v) => m.l + v * (W - m.l - m.r), y = (v) => m.t + (1 - v) * (H - m.t - m.b);
        const box = el('div', 'chart', null, mbody), s = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': yl }, box);
        const g = sv('g', { class: 'grid' }, s);
        for (let k = 0; k <= 4; k++) {
          sv('line', { x1: m.l, x2: W - m.r, y1: y(k / 4), y2: y(k / 4) }, g);
          sv('text', { x: m.l - 8, y: y(k / 4) + 4, 'text-anchor': 'end' }, s).textContent = pct(k / 4, 0);
          sv('text', { x: x(k / 4), y: H - m.b + 18, 'text-anchor': 'middle' }, s).textContent = pct(k / 4, 0);
        }
        sv('text', { x: (m.l + W - m.r) / 2, y: H - 6, 'text-anchor': 'middle' }, s).textContent = xl;
        sv('text', { x: 0, y: 11, class: 't' }, s).textContent = yl;
        if (extra) extra(s, x, y, W, H, m);
        sv('path', { class: 'cost', d: pts.map((p, k) => (k ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join('') }, s);
        return { dot: sv('circle', { class: 'cost-dot', r: 6 }, s), label: sv('text', { class: 't' }, s), x: x, y: y, W: W, m: m };
      }
      function buildModel() {
        if (!mbody) return;
        mbody.textContent = '';
        M = { tab: mtab };
        if (mtab === 'cm') {
          const g = el('div', 'cm', null, mbody);
          el('span', 'h', '', g);
          el('span', 'h', MO.pred + ': ' + MO.alarm, g);
          el('span', 'h', MO.pred + ': ' + MO.quiet, g);
          const cell = (cls, label, icon) => { const c = el('div', 'cell ' + cls, null, g), b = el('b', null, '–', c), s = el('span', null, null, c); if (icon) s.innerHTML = icon; s.appendChild(txt(label)); return b; };
          el('span', 'h rh', MO.real + ': ' + MO.fail, g);
          M.tp = cell('tp', MO.tp, ICON.tp); M.fn = cell('fn', MO.fn, ICON.fn);
          el('span', 'h rh', MO.real + ': ' + MO.ok, g);
          M.fp = cell('fp', MO.fp, ICON.fp); M.tn = cell('tn', MO.tn);
          M.line = el('p', 'pr-line', '', mbody);
        } else if (mtab === 'pr') {
          M.c = curveChart(PRC, MO.prX, MO.prY);
        } else if (mtab === 'roc') {
          M.c = curveChart(ROC, MO.rocX, MO.rocY, (s, x, y) => {
            sv('line', { x1: x(0), y1: y(0), x2: x(1), y2: y(1), class: 'diag' }, s);
          });
          el('p', 'pr-line', fill(MO.auc, { v: nf({ minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(auc) }), mbody);
        } else {
          el('p', 'vtitle', MO.kindsT, mbody);
          const kb = el('div', 'kb', null, mbody);
          M.rows = KINDS.map((k) => {
            const row = el('div', 'kb-row', null, kb);
            el('span', null, k ? U.kinds[k] : MO.none, row);
            const bar = el('div', 'kb-bar', null, row), a = el('i', null, null, bar), b = el('i', null, null, bar);
            a.style.background = 'var(--good)'; b.style.background = 'var(--crit)';
            return { a: a, b: b, v: el('b', null, '', row) };
          });
          const lg = el('div', 'um-legend', null, mbody);
          [['tp', MO.caught], ['fn', MO.missed]].forEach((x) => { const s = el('span', null, null, lg); s.innerHTML = ICON[x[0]]; s.appendChild(txt(x[1])); });
        }
      }
      const total = {}; KINDS.forEach((k) => { total[k] = 0; });
      for (let i = 0; i < n; i++) if (Y[i]) total[K[i] || '']++;
      const kmax = Math.max.apply(null, KINDS.map((k) => total[k]));
      function updateModel(t, tp, fn, fp) {
        if (!M) return;
        const prec = tp + fp ? tp / (tp + fp) : 1, rec = tp / F;
        if (M.tab === 'cm') {
          M.tp.textContent = String(tp); M.fn.textContent = String(fn); M.fp.textContent = String(fp); M.tn.textContent = String(n - F - fp);
          M.line.textContent = MO.prec + ' ' + pct(prec, 1) + ' · ' + MO.rec + ' ' + pct(rec, 1);
        } else if (M.tab === 'pr' || M.tab === 'roc') {
          const p = M.tab === 'pr' ? [rec, prec] : [fp / (n - F), rec], c = M.c;
          c.dot.setAttribute('cx', c.x(p[0])); c.dot.setAttribute('cy', c.y(p[1]));
          const right = c.x(p[0]) > c.W - 150;
          c.label.setAttribute('x', c.x(p[0]) + (right ? -10 : 10)); c.label.setAttribute('y', c.y(p[1]) + (M.tab === 'pr' ? 18 : -10));
          c.label.setAttribute('text-anchor', right ? 'end' : 'start');
          c.label.textContent = MO.here + ' ' + fmtP(t);
        } else {
          const caught = {}; KINDS.forEach((k) => { caught[k] = 0; });
          for (let i = 0; i < n; i++) if (Y[i] && P[i] >= t) caught[K[i] || '']++;
          KINDS.forEach((k, j) => {
            const r = M.rows[j];
            r.a.style.width = (caught[k] / kmax * 100) + '%';
            r.b.style.width = ((total[k] - caught[k]) / kmax * 100) + '%';
            r.v.textContent = caught[k] + ' / ' + total[k];
          });
        }
      }

      function update(v) {
        zt = Math.max(Z0, Math.min(Z1, v));
        const t = unz(zt);
        let tp = 0, fn = 0, fp = 0;
        for (let i = 0; i < n; i++) {
          const alarm = P[i] >= t, c = Y[i] ? (alarm ? 'tp' : 'fn') : (alarm ? 'fp' : 'n');
          if (c === 'tp') tp++; else if (c === 'fn') fn++; else if (c === 'fp') fp++;
          if (G.cls[i] !== c) { G.cls[i] = c; G.pts[i].setAttribute('class', 'pt ' + c); G.pts[i].setAttribute('d', SHAPE[c]); }
        }
        const cost = fn * cMiss + fp * cFalse;
        tiles.tp.textContent = String(tp);
        el('small', null, fill(U.of, { n: F }), tiles.tp);
        tiles.fn.textContent = String(fn);
        tiles.fp.textContent = String(fp);
        tiles.cost.textContent = EUR.format(cost);
        const y = G.y1(zt), m1 = G.m1;
        G.thLine.setAttribute('y1', y); G.thLine.setAttribute('y2', y);
        G.thGrip.setAttribute('cy', y);
        G.thText.setAttribute('y', y - 9);
        G.thText.textContent = fmtP(t);
        G.thHit.setAttribute('y', y - 15);
        G.zone.setAttribute('height', Math.max(0, y - m1.t));
        G.zAlarm.style.display = y - m1.t > 24 ? '' : 'none';
        G.zQuiet.setAttribute('y', Math.min(G.H1 - m1.b - 6, y + 20));
        range.value = String(Math.round((zt - Z0) / (Z1 - Z0) * 1000));
        range.setAttribute('aria-valuetext', fmtP(t));
        out.textContent = fmtP(t);
        G.dot.setAttribute('cx', G.x2(zt)); G.dot.setAttribute('cy', G.y2(cost));
        G.dotText.setAttribute('x', Math.max(G.m2.l + 32, Math.min(G.W2 - G.m2.r - 32, G.x2(zt))));
        G.dotText.setAttribute('y', G.y2(cost) - 12);
        G.dotText.textContent = EUR.format(cost);
        updateModel(t, tp, fn, fp);
      }
      const glide = (to, ms) => { const from = zt; tween(ms, (k) => update(from + (to - from) * k)); };

      // the slider, the two buttons, dragging the line and clicking in the plot all move the threshold
      const svgPt = (e) => { const p = G.s1.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(G.s1.getScreenCTM().inverse()); };
      const fromY = (y) => Z0 + (1 - (y - G.m1.t) / (G.H1 - G.m1.t - G.m1.b)) * (Z1 - Z0);
      range.disabled = false;
      range.addEventListener('input', () => update(Z0 + (Z1 - Z0) * range.value / 1000));
      reset.addEventListener('click', () => glide(ZM, 700));
      toMin.addEventListener('click', () => glide(best[0], 700));
      cin.miss.r.value = String(cMiss); cin.false.r.value = String(cFalse);
      [['miss', (v) => { cMiss = v; }], ['false', (v) => { cFalse = v; }]].forEach((c) => {
        const r = cin[c[0]].r;
        r.disabled = false;
        r.addEventListener('input', () => { c[1](+r.value); recost(); layout(); update(zt); });
      });
      c1.addEventListener('pointerdown', (e) => {
        if (e.target !== G.thHit) return;
        drag = true;
        c1.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      c1.addEventListener('pointerup', () => { drag = false; });
      c1.addEventListener('pointercancel', () => { drag = false; });
      c1.addEventListener('click', (e) => {
        const q = svgPt(e), m1 = G.m1;
        if (q.x >= m1.l && q.x <= G.W1 - m1.r && q.y >= m1.t && q.y <= G.H1 - m1.b) update(fromY(q.y));
      });
      // dragging, or else a tooltip for the nearest part within reach
      c1.addEventListener('pointermove', (e) => {
        const q = svgPt(e);
        if (drag) { update(fromY(q.y)); return; }
        if (e.pointerType !== 'mouse') return;
        let near = -1, bd = 196;
        for (let i = 0; i < n; i++) {
          const dx = G.PX[i] - q.x, dy = G.PY[i] - q.y, dd = dx * dx + dy * dy;
          if (dd < bd || (dd === bd && Y[i])) { bd = dd; near = i; }
        }
        if (near < 0) { tip.hidden = true; return; }
        tip.textContent = '';
        el('b', null, U.legend[G.cls[near]], tip);
        el('br', null, null, tip);
        tip.appendChild(txt((K[near] ? fill(U.cause, { k: U.kinds[K[near]] }) + ' · ' : '') + fill(U.tip, { w: Wr[near], p: fmtP(P[near]) })));
        place(tip, c1, G.PX[near], G.PY[near]);
      });
      c1.addEventListener('pointerleave', () => { tip.hidden = true; });
      let timer = 0;
      window.addEventListener('resize', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { if (c1.clientWidth !== width) { layout(); buildModel(); update(zt); } }, 150);
      });

      recost();
      layout();
      buildModel();
      update(zt);
      when(root, '0px', () => {
        tween(900, (k) => { shown = k; G.clip.setAttribute('width', G.W1 * k); }, () => glide(ZM, 1400));
      });
    }
    when(root, '600px', () => getJSON('mantenimiento.json').then(init).catch(() => { tiles.cost.textContent = '–'; }));
  })();
  // ---- 5. the same European-election results, five ways: ranking, 2019 against 2024, distribution, trend and table ----
  (function views() {
    const root = $('#miradas');
    if (!root) return;
    const V = T.views, TERR = T.terr, ORDER = ['Araba', 'Bizkaia', 'Gipuzkoa', 'Nafarroa', 'Lapurdi', 'Behe Nafarroa', 'Zuberoa'];
    const PTS = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' });
    let view = 'rank', terr = '', year = '2024', big = false, rows = [], evo = null, sortKey = 'p24', sortDir = -1, shown = 25, query = '';
    const ctl = el('div', 'vctl', null, root);
    const r1 = el('div', 'vrow', null, ctl);
    r1.setAttribute('role', 'tablist');
    const tabs = Object.keys(V.tabs).map((k) => {
      const b = el('button', 'chip', V.tabs[k], r1);
      b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(k === view));
      b.addEventListener('click', () => { view = k; tabs.forEach((x) => x.setAttribute('aria-selected', String(x === b))); render(); });
      return b;
    });
    const r2 = el('div', 'vrow', null, ctl);
    const terrs = [''].concat(ORDER).map((t) => {
      const b = el('button', 'chip s', t ? TERR[t] : V.all, r2);
      b.type = 'button'; b.setAttribute('aria-pressed', String(t === terr));
      b.addEventListener('click', () => { terr = t; shown = 25; terrs.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render(); });
      return b;
    });
    const r3 = el('div', 'vrow', null, ctl), years = el('span', 'vrow', null, r3);
    const ybtn = ['2024', '2019'].map((y) => {
      const b = el('button', 'chip s', y, years);
      b.type = 'button'; b.setAttribute('aria-pressed', String(y === year));
      b.addEventListener('click', () => { year = y; ybtn.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render(); });
      return b;
    });
    const bigLab = el('label', 'check', null, r3), bigIn = el('input', null, null, bigLab);
    bigIn.type = 'checkbox';
    bigLab.appendChild(txt(V.big));
    bigIn.addEventListener('change', () => { big = bigIn.checked; shown = 25; render(); });
    const box = el('div', 'vbody', null, root);
    box.style.position = 'relative';
    const body = el('div', null, null, box), tip = el('div', 'tip', null, box);
    tip.hidden = true;
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const pick = () => rows.filter((r) => (!terr || r.terr === terr) && (!big || (r.c24 || r.c19 || 0) > 1000));
    const pv = (v) => (v == null ? '—' : pct(v / 100, 1));
    const hash = (s) => ((Math.imul(parseInt(s.replace(/\D/g, ''), 10) || 7, 2654435761) >>> 0) % 1000) / 1000;
    function frame(W, H) {
      const c = el('div', 'chart', null, body);
      return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, c);
    }
    function nearest(s, list, e, max) {
      const p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
      const q = p.matrixTransform(s.getScreenCTM().inverse());
      let best = null, bd = max * max;
      list.forEach((o) => { const d = (o.x - q.x) * (o.x - q.x) + (o.y - q.y) * (o.y - q.y); if (d < bd) { bd = d; best = o; } });
      return best;
    }
    function showTip(lines, x, y) {
      tip.textContent = '';
      lines.forEach((l, k) => { if (k) el('br', null, null, tip); if (k === 0) el('b', null, l, tip); else tip.appendChild(txt(l)); });
      place(tip, box, x, y);
    }
    function render() {
      years.hidden = !(view === 'rank' || view === 'dist');
      bigLab.hidden = view === 'evo';
      if (!rows.length) return;
      body.textContent = '';
      tip.hidden = true;
      ({ rank: rank, scatter: scatter, dist: dist, evo: trend, table: table })[view]();
    }
    function rank() {
      const k = 'p' + year.slice(2), list = pick().filter((r) => r[k] != null).sort((a, b) => b[k] - a[k]);
      el('p', 'vtitle', fill(V.rankT, { y: year }), body);
      const hb = el('div', 'hb', null, body);
      const groups = list.length > 20 ? [[V.more, list.slice(0, 10)], [V.less, list.slice(-10).reverse()]] : [[null, list]];
      groups.forEach((g) => {
        if (g[0]) el('h4', null, g[0], hb);
        g[1].forEach((r) => {
          const row = el('div', 'hb-row', null, hb), n = el('span', null, r.name, row);
          el('small', null, TERR[r.terr], n);
          const f = el('i', null, null, el('div', 'hb-bar', null, row));
          el('b', null, pv(r[k]), row);
          requestAnimationFrame(() => { f.style.width = Math.min(100, r[k]) + '%'; });
        });
      });
    }
    function scatter() {
      el('p', 'vtitle', V.scatterT, body);
      const W = Math.max(280, body.clientWidth), H = Math.round(Math.min(480, Math.max(300, W * .62))), m = { l: 52, r: 16, t: 14, b: 46 }, lo = 20, hi = 100;
      const x = (v) => m.l + (v - lo) / (hi - lo) * (W - m.l - m.r), y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
      const s = frame(W, H), g = sv('g', { class: 'grid' }, s);
      for (let v = lo; v <= hi; v += 20) {
        sv('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, g);
        sv('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, s).textContent = pct(v / 100, 0);
        sv('text', { x: x(v), y: H - m.b + 18, 'text-anchor': 'middle' }, s).textContent = pct(v / 100, 0);
      }
      sv('text', { x: (m.l + W - m.r) / 2, y: H - 6, 'text-anchor': 'middle' }, s).textContent = V.x19;
      sv('text', { x: m.l + 6, y: m.t + 12, class: 't' }, s).textContent = V.y24;
      sv('line', { x1: x(lo), y1: y(lo), x2: x(hi), y2: y(hi), class: 'diag' }, s);
      sv('text', { x: x(hi) - 6, y: y(hi) + 16, 'text-anchor': 'end' }, s).textContent = V.diag;
      const list = rows.filter((r) => r.p19 != null && r.p24 != null && (!big || r.c24 > 1000));
      const on = (r) => !terr || r.terr === terr;
      const pts = list.map((r) => ({ r: r, x: x(Math.max(lo, Math.min(hi, r.p19))), y: y(Math.max(lo, Math.min(hi, r.p24))) }));
      pts.sort((a, b) => on(a.r) - on(b.r)).forEach((p) => sv('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 3.4, class: 'vdot' + (on(p.r) ? (terr ? '' : ' all') : ' off') }, s));
      s.addEventListener('pointermove', (e) => {
        const p = nearest(s, pts, e, 14);
        if (!p) { tip.hidden = true; return; }
        showTip([p.r.name + ' · ' + TERR[p.r.terr], '2019 ' + pv(p.r.p19) + ' → 2024 ' + pv(p.r.p24)], p.x, p.y + body.firstChild.offsetHeight + 12);
      });
      s.addEventListener('pointerleave', () => { tip.hidden = true; });
    }
    function dist() {
      const k = 'p' + year.slice(2);
      el('p', 'vtitle', V.distT, body);
      const W = Math.max(280, body.clientWidth), rowH = 46, m = { l: 104, r: 16, t: 6, b: 40 }, H = m.t + m.b + rowH * ORDER.length, lo = 20, hi = 100;
      const x = (v) => m.l + (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * (W - m.l - m.r);
      const s = frame(W, H), g = sv('g', { class: 'grid' }, s);
      for (let v = lo; v <= hi; v += 10) {
        sv('line', { x1: x(v), x2: x(v), y1: m.t, y2: H - m.b }, g);
        if (v % 20 === 0) sv('text', { x: x(v), y: H - m.b + 18, 'text-anchor': 'middle' }, s).textContent = pct(v / 100, 0);
      }
      const pts = [];
      ORDER.forEach((t, i) => {
        const cy = m.t + rowH * (i + .5), list = pick().filter((r) => r.terr === t && r[k] != null), on = !terr || terr === t;
        sv('text', { x: 0, y: cy + 4, class: on && terr ? 't' : '' }, s).textContent = TERR[t];
        list.forEach((r) => {
          const p = { r: r, x: x(r[k]), y: cy + (hash(r.id) - .5) * rowH * .62 };
          pts.push(p);
          sv('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 2.8, class: 'vdot' + (on ? (terr ? '' : ' all') : ' off') }, s);
        });
        if (list.length) {
          const v = list.map((r) => r[k]).sort((a, b) => a - b), med = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
          sv('line', { x1: x(med), x2: x(med), y1: cy - rowH * .4, y2: cy + rowH * .4, class: 'med' }, s);
          const lab = sv('text', { x: x(med) + 5, y: cy - rowH * .26, class: 't' }, s);
          lab.textContent = pct(med / 100, 1);
        }
      });
      s.addEventListener('pointermove', (e) => {
        const p = nearest(s, pts, e, 12);
        if (!p) { tip.hidden = true; return; }
        showTip([p.r.name, year + ' · ' + pv(p.r[k])], p.x, p.y + body.firstChild.offsetHeight + 12);
      });
      s.addEventListener('pointerleave', () => { tip.hidden = true; });
    }
    function trend() {
      el('p', 'vtitle', V.evoT, body);
      const yrs = evo.years, val = (y, ts) => { let c = 0, v = 0; ts.forEach((t) => { const d = evo.data[y][t]; if (d) { c += d[0]; v += d[1]; } }); return c ? 100 * v / c : null; };
      const series = ORDER.map((t) => ({ t: t, name: TERR[t], v: yrs.map((y) => val(y, [t])) }));
      const eh = { t: '', name: V.eh, v: yrs.map((y) => val(y, ORDER)) };
      const allv = series.concat([eh]).reduce((a, s) => a.concat(s.v.filter((x) => x != null)), []);
      const lo = Math.floor(Math.min.apply(null, allv) / 5) * 5, hi = Math.ceil(Math.max.apply(null, allv) / 5) * 5;
      const W = Math.max(280, body.clientWidth), H = Math.round(Math.min(420, Math.max(280, W * .52))), m = { l: 48, r: W > 520 ? 118 : 16, t: 14, b: 36 };
      const x = (i) => m.l + i / (yrs.length - 1) * (W - m.l - m.r), y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
      const s = frame(W, H), g = sv('g', { class: 'grid' }, s);
      for (let v = lo; v <= hi; v += 5) {
        sv('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, g);
        if (v % 10 === 0) sv('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, s).textContent = pct(v / 100, 0);
      }
      yrs.forEach((yr, i) => { sv('text', { x: x(i), y: H - m.b + 18, 'text-anchor': 'middle' }, s).textContent = yr; });
      const path = (v) => v.map((p, i) => (p == null ? '' : (i && v[i - 1] != null ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p).toFixed(1))).join('');
      const hl = series.filter((sr) => sr.t === terr);
      series.forEach((sr) => sv('path', { d: path(sr.v), class: 'vline' + (sr.t === terr ? ' on' : '') }, s));
      sv('path', { d: path(eh.v), class: 'vline eh' }, s);
      [eh].concat(hl).forEach((sr) => sr.v.forEach((p, i) => { if (p != null) sv('circle', { cx: x(i), cy: y(p), r: 4, class: 'vpt' + (sr.t ? ' on' : '') }, s); }));
      if (m.r > 100) {
        const ends = [eh].concat(hl).map((sr) => ({ sr: sr, y: y(sr.v[sr.v.length - 1]) }));
        if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 14) { const d = (14 - Math.abs(ends[0].y - ends[1].y)) / 2, up = ends[0].y < ends[1].y ? 0 : 1; ends[up].y -= d; ends[1 - up].y += d; }
        ends.forEach((e) => { sv('text', { x: W - m.r + 8, y: e.y + 4, class: 't' }, s).textContent = e.sr.name; });
      }
      const cross = sv('line', { class: 'cross', y1: m.t, y2: H - m.b, x1: 0, x2: 0, visibility: 'hidden' }, s);
      s.addEventListener('pointermove', (e) => {
        const p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
        const q = p.matrixTransform(s.getScreenCTM().inverse());
        const i = Math.max(0, Math.min(yrs.length - 1, Math.round((q.x - m.l) / (W - m.l - m.r) * (yrs.length - 1))));
        cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
        const list = [eh].concat(series).filter((sr) => sr.v[i] != null).sort((a, b) => b.v[i] - a.v[i]);
        showTip([yrs[i]].concat(list.map((sr) => pv(sr.v[i]) + '  ' + sr.name)), x(i), m.t + body.firstChild.offsetHeight + 12);
      });
      s.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
    }
    function table() {
      const c = el('div', 'tbl-ctl', null, body), q = el('input', 'mp-search', null, c), count = el('span', null, '', c);
      q.type = 'search'; q.placeholder = V.filter; q.setAttribute('aria-label', V.filter); q.value = query;
      const wrap = el('div', 'tbl-wrap', null, body), tb = el('table', 'tbl', null, wrap), thead = el('tr', null, null, el('thead', null, null, tb)), tbody = el('tbody', null, null, tb);
      const keys = ['name', 'terr', 'c24', 'p19', 'p24', 'd'], ths = keys.map((k, j) => {
        const th = el('th', j > 1 ? 'n' : null, null, thead), b = el('button', null, V.cols[j], th);
        b.type = 'button';
        b.addEventListener('click', () => { sortDir = sortKey === k ? -sortDir : (j > 1 ? -1 : 1); sortKey = k; draw(); });
        return th;
      });
      const more = el('button', 'chip more', V.more10, body);
      more.type = 'button';
      more.addEventListener('click', () => { shown += 50; draw(); });
      q.addEventListener('input', () => { query = q.value; shown = 25; draw(); });
      function draw() {
        const nq = norm(query.trim());
        const list = pick().filter((r) => !nq || norm(r.name).indexOf(nq) >= 0).map((r) => Object.assign({ d: r.p19 != null && r.p24 != null ? r.p24 - r.p19 : null }, r));
        const val = (r) => (sortKey === 'terr' ? TERR[r.terr] : r[sortKey]);
        list.sort((a, b) => {
          const A = val(a), B = val(b);
          if (A == null) return 1; if (B == null) return -1;
          return (typeof A === 'string' ? A.localeCompare(B, LOC) : A - B) * sortDir;
        });
        ths.forEach((th, j) => th.setAttribute('aria-sort', keys[j] === sortKey ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'));
        tbody.textContent = '';
        list.slice(0, shown).forEach((r) => {
          const tr = el('tr', null, null, tbody);
          el('td', null, r.name, tr); el('td', null, TERR[r.terr], tr);
          el('td', 'n', r.c24 ? INT.format(r.c24) : '—', tr); el('td', 'n', pv(r.p19), tr); el('td', 'n', pv(r.p24), tr);
          el('td', 'n', r.d == null ? '—' : fill(V.pts, { v: PTS.format(r.d).replace('-', '−') }), tr);
        });
        count.textContent = fill(V.rows, { n: INT.format(list.length) });
        more.hidden = list.length <= shown;
      }
      draw();
    }
    let timer = 0, width = 0;
    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (body.clientWidth !== width && view !== 'table' && view !== 'rank') { width = body.clientWidth; render(); } }, 150);
    });
    when(root, '600px', () => Promise.all([getJSON('mapa.json'), getJSON('europa_bilakaera.json')]).then((res) => {
      const pv2 = (d) => (d && d[0] ? 100 * d[1] / d[0] : null);
      rows = res[0].munis.filter((m) => m[5] || m[6]).map((m) => ({
        id: m[0], name: D.lang === 'eu' ? m[2] : m[1], terr: m[3],
        c19: m[5] && m[5][0], c24: m[6] && m[6][0], p19: pv2(m[5]), p24: pv2(m[6]),
      }));
      evo = res[1];
      width = body.clientWidth;
      render();
    }));
  })();

  // ---- 6. the climate month by month: a calendar of anomalies and the yearly series with its 10-year trend ----
  (function klima() {
    const root = $('#klima');
    if (!root) return;
    const K = T.clima2;
    const RD = ['#053061', '#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7', '#fddbc7', '#f4a582', '#d6604d', '#b2182b', '#67001f'];
    const col = (a) => ramp(RD, (a + 3) / 6);
    const degrees = (v) => SIGNED.format(v).replace('-', '−') + ' °C';
    const AXIS = nf({ maximumFractionDigits: 1, signDisplay: 'exceptZero' }), tick = (v) => AXIS.format(v).replace('-', '−') + ' °C';
    let view = 'cal', city = '', data = null;
    const ctl = el('div', 'vrow', null, root);
    ctl.setAttribute('role', 'tablist');
    const tabs = Object.keys(K.tabs).map((k) => {
      const b = el('button', 'chip', K.tabs[k], ctl);
      b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(k === view));
      b.addEventListener('click', () => { view = k; tabs.forEach((x) => x.setAttribute('aria-selected', String(x === b))); render(); });
      return b;
    });
    el('span', 'sep', null, ctl);
    const lab = el('label', 'wcity', null, ctl);
    el('span', null, K.city, lab);
    const sel = el('select', null, null, lab);
    el('option', null, K.mean, sel).value = '';
    sel.addEventListener('change', () => { city = sel.value; render(); });
    const box = el('div', 'vbody', null, root);
    box.style.position = 'relative';
    const body = el('div', null, null, box), tip = el('div', 'tip', null, box);
    tip.hidden = true;
    const legend = el('div', 'cal-legend', null, root);
    el('span', null, K.legend, legend);
    const rb = el('div', 'ramp', null, legend);
    el('i', null, null, rb).style.background = 'linear-gradient(90deg,' + RD.join(',') + ')';
    const rt = el('div', null, null, rb);
    [-3, -1.5, 0, 1.5, 3].forEach((v) => el('span', null, tick(v), rt));
    const series = () => (city ? data.cities[city] : data.mean);
    function render() {
      if (!data) return;
      body.textContent = '';
      tip.hidden = true;
      legend.hidden = view !== 'cal';
      (view === 'cal' ? cal : lines)();
    }
    function cal() {
      const S = series(), N = S.length, Y0 = data.years[0];
      const W = Math.max(280, body.clientWidth), m = { l: 22, r: 4, t: 4, b: 24 }, cw = (W - m.l - m.r) / N, ch = Math.max(11, Math.min(17, cw * 1.4)), H = m.t + m.b + 12 * ch;
      const c = el('div', 'chart', null, body), s = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': $('#demo-klima-h').textContent }, c);
      const gap = cw > 5 ? 1 : 0;
      S.forEach((row, i) => row.forEach((v, j) => {
        if (v == null) return;
        sv('rect', { x: (m.l + i * cw).toFixed(2), y: (m.t + j * ch).toFixed(2), width: Math.max(.5, cw - gap).toFixed(2), height: (ch - 1).toFixed(2), fill: col(v) }, s);
      }));
      K.short.forEach((t, j) => { if (ch >= 13 || j % 2 === 0) sv('text', { x: m.l - 6, y: m.t + j * ch + ch * .72, 'text-anchor': 'end' }, s).textContent = t; });
      for (let yr = 1940; yr <= Y0 + N - 1; yr += (W < 520 ? 20 : 10)) sv('text', { x: m.l + (yr - Y0 + .5) * cw, y: H - 6, 'text-anchor': 'middle' }, s).textContent = String(yr);
      const hi = sv('rect', { class: 'cell-hi', width: Math.max(1, cw - gap), height: ch - 1, x: -50, y: -50 }, s);
      s.addEventListener('pointermove', (e) => {
        const p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
        const q = p.matrixTransform(s.getScreenCTM().inverse());
        const i = Math.floor((q.x - m.l) / cw), j = Math.floor((q.y - m.t) / ch);
        if (i < 0 || i >= N || j < 0 || j > 11 || S[i][j] == null) { tip.hidden = true; hi.setAttribute('x', -50); return; }
        hi.setAttribute('x', m.l + i * cw); hi.setAttribute('y', m.t + j * ch);
        tip.textContent = '';
        el('b', null, fill(K.tip, { m: K.months[j], y: Y0 + i, v: '' }).replace(/ · $/, ''), tip);
        tip.appendChild(txt(' · ' + degrees(S[i][j])));
        place(tip, box, m.l + (i + .5) * cw, m.t + j * ch);
      });
      s.addEventListener('pointerleave', () => { tip.hidden = true; hi.setAttribute('x', -50); });
    }
    function lines() {
      const S = series(), Y0 = data.years[0];
      const yr = S.map((row) => { const v = row.filter((x) => x != null); return v.reduce((a, b) => a + b, 0) / v.length; });
      const tr = yr.map((v, i) => (i < 9 ? null : yr.slice(i - 9, i + 1).reduce((a, b) => a + b, 0) / 10));
      const lo = Math.floor(Math.min.apply(null, yr) * 2) / 2, hi = Math.ceil(Math.max.apply(null, yr) * 2) / 2;
      const W = Math.max(280, body.clientWidth), H = Math.round(Math.min(380, Math.max(260, W * .45))), m = { l: 56, r: 16, t: 14, b: 36 };
      const x = (i) => m.l + i / (yr.length - 1) * (W - m.l - m.r), y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
      const c = el('div', 'chart', null, body), s = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': K.tabs.lines }, c);
      const g = sv('g', { class: 'grid' }, s);
      for (let v = lo; v <= hi + 1e-9; v += .5) {
        sv('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: Math.abs(v) < 1e-9 ? 'zero' : '' }, g);
        if (Math.abs(v * 2 % 2) < 1e-9 || hi - lo <= 2.5) sv('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, s).textContent = tick(Math.abs(v) < 1e-9 ? 0 : v);
      }
      for (let k = 0; k < yr.length; k += 10) sv('text', { x: x(k), y: H - m.b + 18, 'text-anchor': 'middle' }, s).textContent = String(Y0 + k);
      sv('path', { class: 'vline', d: yr.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join('') }, s);
      yr.forEach((v, i) => sv('circle', { cx: x(i), cy: y(v), r: 2.2, class: 'vdot off' }, s));
      sv('path', { class: 'cost', d: tr.map((v, i) => (v == null ? '' : (tr[i - 1] == null ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(v).toFixed(1))).join('') }, s);
      sv('text', { x: x(yr.length - 1), y: y(tr[tr.length - 1]) - 12, 'text-anchor': 'end', class: 't' }, s).textContent = K.trend;
      const cross = sv('line', { class: 'cross', y1: m.t, y2: H - m.b, x1: 0, x2: 0, visibility: 'hidden' }, s);
      s.addEventListener('pointermove', (e) => {
        const p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
        const q = p.matrixTransform(s.getScreenCTM().inverse());
        const i = Math.max(0, Math.min(yr.length - 1, Math.round((q.x - m.l) / (W - m.l - m.r) * (yr.length - 1))));
        cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
        tip.textContent = '';
        el('b', null, String(Y0 + i), tip);
        tip.appendChild(txt(' · ' + degrees(yr[i])));
        if (tr[i] != null) { el('br', null, null, tip); tip.appendChild(txt(K.trend + ': ' + degrees(tr[i]))); }
        place(tip, box, x(i), y(yr[i]));
      });
      s.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
    }
    let timer = 0, width = 0;
    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (body.clientWidth !== width) { width = body.clientWidth; render(); } }, 150);
    });
    when(root, '600px', () => getJSON('clima_hilabeteak.json').then((d) => {
      data = d;
      Object.keys(d.cities).forEach((c) => { el('option', null, c, sel).value = c; });
      width = body.clientWidth;
      render();
    }));
  })();

  // ---- 7. criteria: the visitor sets the weights, the openings re-order, and each score shows where it comes from ----
  (function criterios() {
    const root = $('#criterios');
    if (!root) return;
    const C = T.crit, N = C.labels.length, ROW = 60;
    const w = C.labels.map(() => 3);
    const kr = el('div', 'kr', null, root);
    const wbox = el('div', 'weights', null, kr);
    el('p', 'lbl', C.weight, wbox);
    const outs = C.labels.map((l, k) => {
      const lab = el('label', null, null, wbox);
      el('span', 'sw', null, lab).style.background = 'var(--c' + (k + 1) + ')';
      el('span', null, l, lab);
      const r = el('input', null, null, lab);
      r.type = 'range'; r.min = '0'; r.max = '5'; r.step = '1'; r.value = String(w[k]);
      const o = el('b', null, String(w[k]), lab);
      r.addEventListener('input', () => { w[k] = +r.value; o.textContent = r.value; update(); });
      return o;
    });
    const right = el('div', null, null, kr);
    right.style.position = 'relative';
    el('p', 'lbl', C.score, right);
    const list = el('div', 'rank', null, right);
    list.style.height = (ROW * C.offers.length) + 'px';
    const tip = el('div', 'tip', null, right);
    tip.hidden = true;
    const rows = C.offers.map((o, i) => {
      const row = el('div', 'rank-row', null, list), d = el('div', null, null, row);
      el('b', null, o[0], d);
      el('span', null, o[1], d);
      const st = el('div', 'stack', null, row);
      const segs = C.labels.map((l, k) => { const sgm = el('i', null, null, st); sgm.style.background = 'var(--c' + (k + 1) + ')'; sgm.style.flex = '0 0 0%'; return sgm; });
      const sc = el('em', null, '0', row);
      row.addEventListener('pointerenter', () => {
        if (!row.parts) return;   // the scores are computed when the card first comes into view
        tip.textContent = '';
        el('b', null, C.from, tip);
        row.parts.forEach((p, k) => { el('br', null, null, tip); tip.appendChild(txt(C.labels[k] + ': ' + Math.round(p))); });
        place(tip, right, row.offsetLeft + row.offsetWidth * .62, row.offsetTop + list.offsetTop);
      });
      row.addEventListener('pointerleave', () => { tip.hidden = true; });
      row.style.transform = 'translateY(' + (i * ROW) + 'px)';
      return { row: row, segs: segs, sc: sc, fit: C.fits[i], i: i };
    });
    const det = el('details', 'tview', null, root);
    el('summary', null, C.table, det);
    const tw = el('div', 'tbl-wrap', null, det), tb = el('table', 'tbl', null, tw), hr = el('tr', null, null, el('thead', null, null, tb)), tbody = el('tbody', null, null, tb);
    [C.offer].concat(C.labels, [C.total]).forEach((h, j) => el('th', j ? 'n' : null, h, hr));
    function update() {
      const sw = w.reduce((a, b) => a + b, 0);
      rows.forEach((r) => {
        r.parts = r.fit.map((f, k) => (sw ? w[k] * f / sw : 0));
        r.score = r.parts.reduce((a, b) => a + b, 0);
        r.parts.forEach((p, k) => { r.segs[k].style.flex = '0 0 ' + p.toFixed(2) + '%'; r.segs[k].style.display = p > 0 ? '' : 'none'; });
        r.sc.textContent = String(Math.round(r.score));
        r.row.parts = r.parts;
      });
      rows.slice().sort((a, b) => b.score - a.score || a.i - b.i).forEach((r, k) => { r.row.style.transform = 'translateY(' + (k * ROW) + 'px)'; });
      tbody.textContent = '';
      rows.slice().sort((a, b) => b.score - a.score || a.i - b.i).forEach((r) => {
        const tr = el('tr', null, null, tbody);
        el('td', null, C.offers[r.i][0], tr);
        r.parts.forEach((p) => el('td', 'n', String(Math.round(p)), tr));
        el('td', 'n', String(Math.round(r.score)), tr);
      });
    }
    when(root, '0px', update);
  })();

  // ---- 8. what the AI costs: queries a month against the cost per month, with the MITÜMI estimate marked ----
  (function coste() {
    const root = $('#coste');
    if (!root) return;
    const Q = T.cost, REF = 4560, PER = 6.70 / REF, LO = 100, HI = 100000;
    const EURC = nf({ style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const stats = el('div', 'um-stats', null, root), tiles = {};
    stats.style.gridTemplateColumns = 'repeat(3,minmax(0,1fr))';
    [['month', Q.month], ['year', Q.year], ['each', Q.each]].forEach((k) => {
      const t = el('div', 'stat', null, stats);
      el('div', 'l', k[1], t);
      tiles[k[0]] = el('div', 'v', '–', t);
    });
    const ctl = el('div', 'um-ctl', null, root);
    const r = el('input', null, null, ctl);
    r.type = 'range'; r.min = '0'; r.max = '1000'; r.step = '1';
    r.setAttribute('aria-label', Q.x);
    const out = el('output', null, '', ctl);
    out.style.minWidth = '12em';
    const chart = el('div', 'chart', null, root);
    chart.style.marginTop = '14px';
    const lq = (q) => Math.log10(q), qOf = (t) => Math.round(Math.pow(10, lq(LO) + t / 1000 * (lq(HI) - lq(LO)))), tOf = (q) => (lq(q) - lq(LO)) / (lq(HI) - lq(LO)) * 1000;
    let G = null, q = REF, width = 0;
    function layout() {
      width = chart.clientWidth;
      chart.textContent = '';
      const W = Math.max(280, chart.clientWidth), H = Math.round(Math.min(300, Math.max(220, W * .38))), m = { l: 60, r: 18, t: 18, b: 40 }, top = 150;
      const x = (v) => m.l + (lq(v) - lq(LO)) / (lq(HI) - lq(LO)) * (W - m.l - m.r), y = (c) => m.t + (1 - c / top) * (H - m.t - m.b);
      const s = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': $('#demo-coste-h').textContent }, chart);
      const g = sv('g', { class: 'grid' }, s);
      for (let c = 0; c <= top; c += 50) { sv('line', { x1: m.l, x2: W - m.r, y1: y(c), y2: y(c) }, g); sv('text', { x: m.l - 8, y: y(c) + 4, 'text-anchor': 'end' }, s).textContent = EUR.format(c); }
      [100, 1000, 10000, 100000].forEach((v) => { sv('text', { x: x(v), y: H - m.b + 18, 'text-anchor': 'middle' }, s).textContent = INT.format(v); });
      sv('text', { x: (m.l + W - m.r) / 2, y: H - 6, 'text-anchor': 'middle' }, s).textContent = Q.x;
      sv('text', { x: 0, y: 12, class: 't' }, s).textContent = Q.y;
      const pts = []; for (let k = 0; k <= 60; k++) { const v = Math.pow(10, lq(LO) + k / 60 * (lq(HI) - lq(LO))); pts.push((k ? 'L' : 'M') + x(v).toFixed(1) + ' ' + y(v * PER).toFixed(1)); }
      sv('path', { class: 'cost', d: pts.join('') }, s);
      sv('circle', { class: 'ref', cx: x(REF), cy: y(REF * PER), r: 5 }, s);
      sv('text', { x: x(REF) - 8, y: y(REF * PER) - 10, 'text-anchor': 'end' }, s).textContent = Q.ref + ' · ' + EURC.format(REF * PER);
      G = { x: x, y: y, W: W, m: m, dot: sv('circle', { class: 'cost-dot', r: 6 }, s), label: sv('text', { class: 't' }, s) };
    }
    function update(v) {
      q = v;
      const c = q * PER;
      tiles.month.textContent = EURC.format(c);
      tiles.year.textContent = EURC.format(c * 12);
      tiles.each.textContent = fill(Q.cent, { v: nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(PER * 100) });
      out.textContent = INT.format(q) + ' ' + Q.per;
      r.value = String(Math.round(tOf(q)));
      r.setAttribute('aria-valuetext', out.textContent);
      const left = G.x(q) > G.W - 120;
      G.dot.setAttribute('cx', G.x(q)); G.dot.setAttribute('cy', G.y(c));
      G.label.setAttribute('x', G.x(q) + (left ? -10 : 10)); G.label.setAttribute('y', G.y(c) - 10);
      G.label.setAttribute('text-anchor', left ? 'end' : 'start');
      G.label.textContent = Math.abs(G.x(q) - G.x(REF)) < 60 ? '' : EURC.format(c);   // the estimate is labelled already
    }
    r.addEventListener('input', () => update(qOf(+r.value)));
    let timer = 0;
    window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => { if (chart.clientWidth !== width) { layout(); update(q); } }, 150); });
    layout();
    update(REF);
  })();
})();
