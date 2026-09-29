'use strict';

// The Farm draws a colony (a graph of pages) as a cross-section of soil:
// the entrance chamber at the top, deeper chambers further down. Ants can be
// placed on chambers, at the nest (idle), or sent home.

(function () {
  const { s, h } = AG;

  const LAYER_GAP = 92;
  const TOP = 86;
  const NEST = { x: 46, y: 34 };

  function layout(g, { showForeign = true } = {}) {
    const host = AG.hostOf(g.start);
    const depth = new Map([[g.start, 0]]);
    const order = [g.start];
    for (let i = 0; i < order.length; i++) {
      const u = order[i];
      if (AG.hostOf(u) !== host) continue;
      for (const v of g.pages[u] || []) {
        if (depth.has(v)) continue;
        if (!showForeign && AG.hostOf(v) !== host) continue;
        depth.set(v, depth.get(u) + 1);
        order.push(v);
      }
    }
    const layers = [];
    for (const u of order) (layers[depth.get(u)] ||= []).push(u);
    const widest = Math.max(...layers.map(l => l.length));
    const width = Math.max(560, widest * 84 + 40);
    const height = TOP + (layers.length - 1) * LAYER_GAP + 60;
    const pos = new Map();
    layers.forEach((layer, d) => {
      layer.forEach((u, i) => {
        pos.set(u, { x: 20 + ((i + 0.5) / layer.length) * (width - 40), y: TOP + d * LAYER_GAP, d });
      });
    });
    return { host, pos, order, width, height };
  }

  function antGlyph(color) {
    const legs = s('g', { class: 'legs', stroke: color, 'stroke-width': 1.3, 'stroke-linecap': 'round', fill: 'none' });
    for (const x of [-3, 0, 3]) {
      legs.append(s('path', { d: `M${x} 0 L${x - 3} -7` }), s('path', { d: `M${x} 0 L${x - 3} 7` }));
    }
    return s(
      'g',
      { class: 'glyph' },
      legs,
      s('ellipse', { cx: -8, cy: 0, rx: 6.2, ry: 4.4, fill: color }),
      s('ellipse', { cx: 0, cy: 0, rx: 3.6, ry: 2.6, fill: color }),
      s('circle', { cx: 6, cy: 0, r: 3.1, fill: color }),
      s('path', { d: 'M8 -1.5 Q11 -6 14 -5 M8 1.5 Q11 6 14 5', stroke: color, 'stroke-width': 1, fill: 'none' })
    );
  }

  class Farm {
    constructor(graph, opts = {}) {
      this.g = graph;
      this.opts = opts;
      this.L = layout(graph, opts);
      const { width, height } = this.L;
      this.svg = s('svg', {
        class: 'farm-svg',
        viewBox: `0 0 ${width} ${height}`,
        role: 'img',
        'aria-label': opts.ariaLabel || 'A colony drawn as chambers joined by tunnels',
      });
      this.el = h('div', { class: 'farm-view' }, this.svg);
      this.edgeLayer = s('g', { class: 'edges' });
      this.nodeLayer = s('g', { class: 'nodes' });
      this.antLayer = s('g', { class: 'ants' });
      this.svg.append(
        s('rect', { class: 'surface', x: 0, y: 0, width, height: 54 }),
        s('path', { class: 'grass', d: `M0 54 ${grassPath(width)}` }),
        s('g', { class: 'nest-spot', transform: `translate(${NEST.x} ${NEST.y})` },
          s('ellipse', { rx: 34, ry: 13 }),
          s('text', { y: -17, 'text-anchor': 'middle', text: 'idle ants' })
        ),
        this.edgeLayer,
        this.nodeLayer,
        this.antLayer
      );
      this.nodes = new Map();
      this.edges = new Map();
      this.ants = [];
      this.drawEdges();
      this.drawNodes();
      if (opts.ants) for (let i = 0; i < opts.ants; i++) this.addAnt(i);
    }

    drawEdges() {
      const { pos, host } = this.L;
      const done = new Set();
      for (const [u, links] of Object.entries(this.g.pages)) {
        if (!pos.has(u) || AG.hostOf(u) !== host) continue;
        for (const v of links) {
          if (!pos.has(v) || u === v) continue;
          const key = [u, v].sort().join('|');
          if (done.has(key)) {
            this.edges.get(key).from.push(u);
            continue;
          }
          done.add(key);
          const a = pos.get(u);
          const b = pos.get(v);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          let bend = Math.abs(a.d - b.d) === 1 ? 0 : 46;
          if (a.d === b.d) bend = 30;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const cx = mx + (-dy / len) * bend;
          const cy = my + (dx / len) * bend;
          const foreign = AG.hostOf(v) !== host;
          const path = s('path', {
            class: 'tunnel' + (foreign ? ' foreign' : ''),
            d: `M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}`,
          });
          this.edgeLayer.append(path);
          this.edges.set(key, { el: path, from: [u] });
        }
      }
    }

    drawNodes() {
      const { pos, host } = this.L;
      const many = pos.size > 26;
      for (const [u, p] of pos) {
        const foreign = AG.hostOf(u) !== host;
        const g = s(
          'g',
          { class: 'chamber' + (foreign ? ' foreign' : ''), transform: `translate(${p.x} ${p.y})` },
          s('ellipse', { class: 'room', rx: 27, ry: 16 }),
          s('circle', { class: 'scent', cx: 20, cy: -12, r: 4.5 }),
          s('text', { class: 'name' + (many ? ' small' : ''), y: 31, 'text-anchor': 'middle', text: AG.label(u) })
        );
        this.nodeLayer.append(g);
        this.nodes.set(u, g);
        this.state(u, 'unknown');
        if (this.opts.reveal && u !== this.g.start) g.classList.add('hidden');
      }
      if (this.opts.reveal) {
        for (const e of this.edges.values()) e.el.classList.add('hidden');
      }
    }

    has(u) {
      return this.nodes.has(u);
    }

    // unknown | seen | active | done
    state(u, st) {
      const g = this.nodes.get(u);
      if (!g) return;
      g.classList.remove('st-unknown', 'st-seen', 'st-active', 'st-done', 'st-flash');
      g.classList.add('st-' + st);
    }

    flash(u, cls = 'st-flash') {
      const g = this.nodes.get(u);
      if (!g) return;
      g.classList.remove(cls);
      void g.getBBox();
      g.classList.add(cls);
    }

    reveal(u) {
      this.nodes.get(u)?.classList.remove('hidden');
    }

    revealEdgesFrom(u) {
      for (const [key, e] of this.edges) {
        if (e.from.includes(u)) {
          e.el.classList.remove('hidden');
          for (const end of key.split('|')) this.reveal(end);
        }
      }
    }

    resetStates() {
      for (const u of this.nodes.keys()) this.state(u, 'unknown');
    }

    addAnt(i) {
      const info = AG.ANTS[i % AG.ANTS.length];
      const glyph = antGlyph(info.color);
      const el = s(
        'g',
        { class: 'ant', 'data-name': info.name },
        s('g', { class: 'flip' }, glyph),
        s('text', { class: 'ant-name', y: 19, 'text-anchor': 'middle', text: info.name, fill: info.color }),
        s('text', { class: 'zzz', x: 8, y: -10, text: 'z z' })
      );
      this.antLayer.append(el);
      const ant = { i, info, el, at: 'nest', x: 0, y: 0 };
      this.ants.push(ant);
      this.place(ant, 'nest', true);
      return ant;
    }

    antSpot(ant, where) {
      if (where === 'home') return { x: -60, y: NEST.y };
      const peers = this.ants.filter(a => a.at === where);
      const k = peers.indexOf(ant);
      if (where === 'nest') return { x: NEST.x - 22 + (ant.i % 6) * 17, y: NEST.y + (ant.i >= 3 ? 4 : -2) };
      const p = this.L.pos.get(where);
      const offsets = [[-9, 2], [11, 2], [0, -9], [-14, -8], [15, -8], [1, 10]];
      const [ox, oy] = offsets[Math.max(0, k) % offsets.length];
      return { x: p.x + ox, y: p.y + oy };
    }

    place(ant, where, instant = false) {
      ant.at = where;
      const spot = this.antSpot(ant, where);
      const flip = spot.x < ant.x - 1;
      ant.el.querySelector('.flip').style.transform = flip ? 'scaleX(-1)' : '';
      if (instant) ant.el.style.transition = 'none';
      ant.el.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
      if (instant) {
        void ant.el.getBoundingClientRect();
        ant.el.style.transition = '';
      }
      ant.x = spot.x;
      ant.y = spot.y;
      ant.el.classList.toggle('gone', where === 'home');
      // Re-spread any ants sharing the spot we just left or joined.
      for (const other of this.ants) {
        if (other !== ant && other.at === where && where !== 'home') {
          const sp = this.antSpot(other, where);
          other.el.style.transform = `translate(${sp.x}px, ${sp.y}px)`;
          other.x = sp.x;
          other.y = sp.y;
        }
      }
    }

    // walking | thinking | sleeping | idle
    mode(ant, m) {
      ant.el.classList.remove('walking', 'thinking', 'sleeping', 'idle');
      if (m) ant.el.classList.add(m);
    }
  }

  function grassPath(width) {
    let d = '';
    for (let x = 0; x <= width; x += 9) d += `L${x} ${54 - (x % 18 ? 5 : 9)} L${x + 4.5} 54 `;
    return d;
  }

  AG.Farm = Farm;
  AG.antGlyph = antGlyph;
})();
