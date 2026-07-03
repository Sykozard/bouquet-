/* ═══════════════════════════════════════════════════════════════
   ROSE GARDEN — For Riji
   Complete vanilla JavaScript — no libraries, no frameworks
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── SVG Namespace ─────────────────────────────────────────── */
const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
  }
  return el;
}

/* ─── Global State ──────────────────────────────────────────── */
const state = {
  started: false,
  particleRAF: null,
  bokehBuilt: false,
};

/* ═══════════════════════════════════════════════════════════════
   AUDIO
   ═══════════════════════════════════════════════════════════════ */
const audioEl = document.getElementById('bg-audio');

function initAudio() {
  audioEl.src = 'assets/music.mp3';
  audioEl.volume = 0;
  audioEl.load();

  const playPromise = audioEl.play();
  if (playPromise !== undefined) {
    playPromise
      .then(() => fadeAudioIn())
      .catch(() => {
        // Autoplay blocked — audio already started on tap
      });
  }
}

function fadeAudioIn() {
  const target = 0.25;
  const duration = 5000;
  const step = 50;
  const increment = (target / duration) * step;
  const timer = setInterval(() => {
    audioEl.volume = Math.min(audioEl.volume + increment, target);
    if (audioEl.volume >= target) clearInterval(timer);
  }, step);
}

/* ═══════════════════════════════════════════════════════════════
   BOKEH
   ═══════════════════════════════════════════════════════════════ */
function buildBokeh() {
  const layer = document.getElementById('bokeh-layer');
  const colors = [
    'rgba(232,115,154,VAL)',
    'rgba(255,182,193,VAL)',
    'rgba(196,30,107,VAL)',
    'rgba(240,208,128,VAL)',
    'rgba(253,232,216,VAL)',
  ];

  for (let i = 0; i < 28; i++) {
    const dot = document.createElement('div');
    dot.className = 'bokeh-dot';

    const size   = 8 + Math.random() * 60;
    const left   = Math.random() * 100;
    const top    = Math.random() * 100;
    const col    = colors[Math.floor(Math.random() * colors.length)];
    const alpha  = (0.05 + Math.random() * 0.12).toFixed(3);
    const blur   = 4 + Math.random() * 20;
    const dur    = 8 + Math.random() * 16;
    const delay  = Math.random() * 10;
    const bx     = (Math.random() - 0.5) * 40;
    const by     = -10 - Math.random() * 40;
    const bs     = 0.8 + Math.random() * 0.5;

    dot.style.cssText = `
      width:${size}px;
      height:${size}px;
      left:${left}%;
      top:${top}%;
      background:${col.replace('VAL', alpha)};
      filter:blur(${blur}px);
      --dur:${dur}s;
      --delay:${-delay}s;
      --bx:${bx}px;
      --by:${by}px;
      --bs:${bs};
    `;

    layer.appendChild(dot);
  }
}

/* ═══════════════════════════════════════════════════════════════
   PARTICLE SYSTEM — canvas petals + sparkles
   ═══════════════════════════════════════════════════════════════ */
function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  const ctx    = canvas.getContext('2d');

  let W = 0, H = 0;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  /* ── Falling rose petals ── */
  const petalColors = [
    [340, 80, 78],  // deep rose
    [340, 70, 85],  // rose pink
    [345, 85, 88],  // blush
    [355, 60, 90],  // soft pink
    [330, 50, 92],  // petal peach
  ];

  const petals = Array.from({ length: 38 }, (_, i) => {
    const hsl  = petalColors[i % petalColors.length];
    return {
      x:      Math.random() * 1.2 - 0.1,   // 0..1 normalised
      y:      Math.random(),
      vy:     0.0008 + Math.random() * 0.0014,
      vx:     (Math.random() - 0.5) * 0.0006,
      angle:  Math.random() * Math.PI * 2,
      spin:   (Math.random() - 0.5) * 0.025,
      w:      6 + Math.random() * 12,
      h:      4 + Math.random() * 8,
      hue:    hsl[0] + (Math.random() - 0.5) * 15,
      sat:    hsl[1],
      lit:    hsl[2],
      alpha:  0.25 + Math.random() * 0.5,
      wave:   Math.random() * Math.PI * 2,
      waveAmp: 0.0002 + Math.random() * 0.0004,
      waveFreq: 0.5 + Math.random() * 1.5,
    };
  });

  /* ── Sparkles ── */
  const sparkleHues = [340, 350, 40, 35, 355];
  const sparkles = Array.from({ length: 22 }, (_, i) => ({
    x:     Math.random() * 1.2 - 0.1,
    y:     Math.random(),
    vy:    0.0003 + Math.random() * 0.0007,
    vx:    (Math.random() - 0.5) * 0.0003,
    size:  2 + Math.random() * 4,
    hue:   sparkleHues[i % sparkleHues.length],
    phase: Math.random() * Math.PI * 2,
    speed: 0.8 + Math.random() * 2,
  }));

  let t = 0;

  function tick() {
    ctx.clearRect(0, 0, W, H);
    t += 0.016;

    /* petals */
    for (const p of petals) {
      p.wave += 0.016 * p.waveFreq;
      p.x    += p.vx + Math.sin(p.wave) * p.waveAmp;
      p.y    += p.vy;
      p.angle += p.spin;

      if (p.y > 1.05) {
        p.y = -0.05;
        p.x = Math.random() * 1.2 - 0.1;
      }
      if (p.x < -0.12) p.x = 1.12;
      if (p.x >  1.12) p.x = -0.12;

      const px = p.x * W;
      const py = p.y * H;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.angle);
      ctx.globalAlpha = p.alpha;

      // Petal: ellipse with slight bend
      ctx.beginPath();
      ctx.ellipse(0, 0, p.w * 0.5, p.h, 0, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(0, -p.h * 0.3, 1, 0, 0, p.h);
      grad.addColorStop(0, `hsla(${p.hue},${p.sat}%,${Math.min(p.lit + 8,100)}%,1)`);
      grad.addColorStop(1, `hsla(${p.hue},${p.sat}%,${p.lit}%,0)`);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }

    /* sparkles */
    for (const s of sparkles) {
      s.x += s.vx;
      s.y += s.vy;

      if (s.y > 1.05) {
        s.y = -0.05;
        s.x = Math.random() * 1.2 - 0.1;
      }

      const sx    = s.x * W;
      const sy    = s.y * H;
      const pulse = 0.4 + 0.6 * Math.abs(Math.sin(t * s.speed + s.phase));
      const r     = s.size * pulse;

      ctx.save();
      ctx.globalAlpha = 0.6 * pulse;
      ctx.translate(sx, sy);

      // 4-pointed star
      ctx.beginPath();
      const arms = 4;
      for (let a = 0; a < arms * 2; a++) {
        const rad   = (a % 2 === 0) ? r : r * 0.35;
        const theta = (a / (arms * 2)) * Math.PI * 2 - Math.PI / 4;
        if (a === 0) ctx.moveTo(Math.cos(theta) * rad, Math.sin(theta) * rad);
        else         ctx.lineTo(Math.cos(theta) * rad, Math.sin(theta) * rad);
      }
      ctx.closePath();

      const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      sg.addColorStop(0, `hsla(${s.hue},90%,95%,1)`);
      sg.addColorStop(1, `hsla(${s.hue},80%,70%,0)`);
      ctx.fillStyle = sg;
      ctx.fill();
      ctx.restore();
    }

    state.particleRAF = requestAnimationFrame(tick);
  }

  tick();
}

/* ═══════════════════════════════════════════════════════════════
   SVG ROSE BUILDER
   ═══════════════════════════════════════════════════════════════ */

/**
 * Returns the SVG <path> d-string for one rose petal,
 * centred at origin, pointing upward.
 * The caller applies rotation / translation via <g transform>.
 */
function petalPath(len, widthRatio, curve) {
  const w  = len * widthRatio;
  const c  = len * curve;       // control-point pull toward centre
  const ct = len * 0.15;        // tip control offset

  return [
    `M 0 0`,
    `C ${-w} ${-ct} ${-w * 0.9} ${-(len - c)} ${0} ${-len}`,
    `C ${w * 0.9} ${-(len - c)} ${w} ${-ct} 0 0`,
    `Z`,
  ].join(' ');
}

/**
 * Builds one full rose SVG group.
 * cx, cy — centre of rose in the bouquet coordinate system
 * scale  — overall scale factor
 * hueShift — slight colour variation
 * delayMs  — when bloom animation starts (ms after scene start)
 */
function buildRose({ cx, cy, scale, hueShift, delayMs, id }) {
  const g = svgEl('g', {
    class: 'rose-group',
    id: `rose-${id}`,
    style: [
      `--rose-delay:${delayMs}ms`,
      `transform-origin:${cx}px ${cy}px`,
    ].join(';'),
  });

  const defs = document.getElementById('global-defs');

  /* colour scheme for this rose */
  const baseHue = 340 + hueShift;   // pinkish-red family
  const layers = [
    // [outer-petal color, inner highlight]
    { outer: `hsl(${baseHue},72%,42%)`,  inner: `hsl(${baseHue},60%,68%)`,  hi: `hsl(${baseHue+5},50%,82%)` },
    { outer: `hsl(${baseHue},70%,48%)`,  inner: `hsl(${baseHue},58%,72%)`,  hi: `hsl(${baseHue+5},45%,86%)` },
    { outer: `hsl(${baseHue},65%,55%)`,  inner: `hsl(${baseHue},55%,78%)`,  hi: `hsl(${baseHue+5},40%,90%)` },
    { outer: `hsl(${baseHue},60%,62%)`,  inner: `hsl(${baseHue},50%,82%)`,  hi: `hsl(${baseHue+5},35%,93%)` },
    { outer: `hsl(${baseHue},55%,68%)`,  inner: `hsl(${baseHue},45%,86%)`,  hi: `hsl(${baseHue+5},30%,95%)` },
    { outer: `hsl(${baseHue},50%,74%)`,  inner: `hsl(${baseHue},40%,89%)`,  hi: `#fff5f8` },
    { outer: `hsl(${baseHue},45%,80%)`,  inner: `hsl(${baseHue},35%,92%)`,  hi: `#fff8fb` },
  ];

  /* create gradients for each layer */
  layers.forEach((lc, li) => {
    const gid = `rose-${id}-grad-${li}`;
    const rg   = svgEl('radialGradient', { id: gid, cx: '50%', cy: '80%', r: '70%' });
    const s0   = svgEl('stop'); s0.setAttribute('offset', '0%');   s0.setAttribute('stop-color', lc.inner);
    const s1   = svgEl('stop'); s1.setAttribute('offset', '60%');  s1.setAttribute('stop-color', lc.outer);
    const s2   = svgEl('stop'); s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', `hsl(${baseHue},72%,32%)`);
    rg.append(s0, s1, s2);
    defs.appendChild(rg);

    const hgid = `rose-${id}-hi-${li}`;
    const hg   = svgEl('radialGradient', { id: hgid, cx: '35%', cy: '25%', r: '55%' });
    const h0   = svgEl('stop'); h0.setAttribute('offset', '0%');   h0.setAttribute('stop-color', lc.hi);  h0.setAttribute('stop-opacity','0.55');
    const h1   = svgEl('stop'); h1.setAttribute('offset', '100%'); h1.setAttribute('stop-color', lc.hi);  h1.setAttribute('stop-opacity','0');
    hg.append(h0, h1);
    defs.appendChild(hg);
  });

  /* shadow filter */
  const fid = `rose-${id}-shadow`;
  const filt = svgEl('filter', { id: fid, x: '-30%', y: '-30%', width: '160%', height: '160%' });
  const fe   = svgEl('feDropShadow', { dx: '0', dy: '3', stdDeviation: '4', 'flood-color': `hsl(${baseHue},60%,20%)`, 'flood-opacity': '0.35' });
  filt.appendChild(fe);
  defs.appendChild(filt);

  const rg = svgEl('g', { transform: `translate(${cx},${cy}) scale(${scale})` });

  /* ── Petal layers from outer to inner ── */
  // Each layer: { count, len, widthRatio, curve, yOffset, scaleY, rot0 }
  const layerDefs = [
    { count: 7,  len: 58, wr: 0.46, curve: 0.20, yOff:  18, sy: 0.45, rot0: 0   },
    { count: 6,  len: 54, wr: 0.44, curve: 0.22, yOff:  12, sy: 0.55, rot0: 26  },
    { count: 6,  len: 48, wr: 0.42, curve: 0.24, yOff:   6, sy: 0.65, rot0: 8   },
    { count: 5,  len: 42, wr: 0.40, curve: 0.26, yOff:   0, sy: 0.75, rot0: 20  },
    { count: 5,  len: 34, wr: 0.38, curve: 0.28, yOff:  -6, sy: 0.82, rot0: 5   },
    { count: 4,  len: 26, wr: 0.36, curve: 0.30, yOff: -12, sy: 0.88, rot0: 15  },
    { count: 3,  len: 16, wr: 0.34, curve: 0.32, yOff: -18, sy: 0.92, rot0: 0   },
  ];

  layerDefs.forEach((ld, li) => {
    const gradId  = `rose-${id}-grad-${li}`;
    const hiId    = `rose-${id}-hi-${li}`;
    const layerG  = svgEl('g', { transform: `translate(0,${ld.yOff})` });

    for (let pi = 0; pi < ld.count; pi++) {
      const baseAngle = (360 / ld.count) * pi + ld.rot0;
      // natural slight irregularity
      const jitter    = (Math.random() - 0.5) * 6;
      const angle     = baseAngle + jitter;
      const pDelay    = delayMs + li * 200 + pi * 35;
      const pRot      = (Math.random() - 0.5) * 8;

      const petalG = svgEl('g', {
        class: 'petal-layer',
        transform: `rotate(${angle})`,
        style: [
          `--petal-delay:${pDelay}ms`,
          `--pr:${pRot}deg`,
          `transform-origin: 0px 0px`,
        ].join(';'),
      });

      const d    = petalPath(ld.len, ld.wr, ld.curve);
      const base = svgEl('path', {
        d,
        fill: `url(#${gradId})`,
        filter: li === 0 ? `url(#${fid})` : '',
      });
      base.style.transformOrigin = '0px 0px';

      // highlight overlay
      const hi = svgEl('path', {
        d,
        fill: `url(#${hiId})`,
        opacity: '0.7',
      });

      // subtle inner shadow edge
      if (li < 4) {
        const edge = svgEl('path', {
          d,
          fill:   'none',
          stroke: `hsl(${baseHue},65%,25%)`,
          'stroke-width':   '0.5',
          'stroke-opacity': '0.18',
        });
        petalG.appendChild(base);
        petalG.appendChild(hi);
        petalG.appendChild(edge);
      } else {
        petalG.appendChild(base);
        petalG.appendChild(hi);
      }

      layerG.appendChild(petalG);
    }

    rg.appendChild(layerG);
  });

  /* ── Sepal (calyx) at base ── */
  const sepalG  = svgEl('g', { opacity: '0.9' });
  const sepalHue = 120;
  for (let si = 0; si < 5; si++) {
    const sa = (72 * si) + 18;
    const sep = svgEl('ellipse', {
      cx:   '0',
      cy:   '22',
      rx:   '4',
      ry:   '14',
      fill: `hsl(${sepalHue},45%,25%)`,
      transform: `rotate(${sa})`,
    });
    sepalG.appendChild(sep);
  }
  rg.appendChild(sepalG);

  g.appendChild(rg);
  return g;
}

/* ─── Leaf SVG path helper ──────────────────────────────────── */
function buildLeaf({ x, y, scale, rotation, delayMs, flip }) {
  const g = svgEl('g', {
    class: 'leaf-group',
    style: [
      `--leaf-delay:${delayMs}ms`,
      `--lr:${flip ? '20deg' : '-20deg'}`,
      `transform-origin:${x}px ${y}px`,
    ].join(';'),
    transform: `translate(${x},${y}) scale(${scale * (flip ? -1 : 1)},${scale}) rotate(${rotation})`,
  });

  const defs = document.getElementById('global-defs');
  const gid  = `leaf-grad-${Math.round(x)}-${Math.round(y)}`;
  const rg   = svgEl('linearGradient', { id: gid, x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
  const s0   = svgEl('stop'); s0.setAttribute('offset', '0%');   s0.setAttribute('stop-color', '#1a4d22');
  const s1   = svgEl('stop'); s1.setAttribute('offset', '50%');  s1.setAttribute('stop-color', '#2d7a38');
  const s2   = svgEl('stop'); s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#1a4d22');
  rg.append(s0, s1, s2);
  defs.appendChild(rg);

  // Leaf shape: pointed ellipse with mid-vein
  const leafBody = svgEl('path', {
    d: 'M 0 0 C -22 -8 -38 -28 -20 -52 C -8 -68 8 -68 20 -52 C 38 -28 22 -8 0 0 Z',
    fill: `url(#${gid})`,
    opacity: '0.9',
  });

  // Mid-vein
  const vein = svgEl('path', {
    d: 'M 0 0 C 0 -20 0 -38 0 -56',
    stroke: '#1a4d22',
    'stroke-width': '0.8',
    fill: 'none',
    opacity: '0.4',
  });

  // Side veins
  for (let v = 1; v <= 3; v++) {
    const yv = -14 * v;
    const xv = 14 + v * 2;
    const sv = svgEl('path', {
      d: `M 0 ${yv} Q ${xv * 0.5} ${yv - 5} ${xv} ${yv - 10}`,
      stroke: '#1a4d22',
      'stroke-width': '0.5',
      fill: 'none',
      opacity: '0.25',
    });
    const sv2 = svgEl('path', {
      d: `M 0 ${yv} Q ${-xv * 0.5} ${yv - 5} ${-xv} ${yv - 10}`,
      stroke: '#1a4d22',
      'stroke-width': '0.5',
      fill: 'none',
      opacity: '0.25',
    });
    g.appendChild(sv);
    g.appendChild(sv2);
  }

  g.appendChild(leafBody);
  g.appendChild(vein);
  return g;
}

/* ─── Stem builder ──────────────────────────────────────────── */
function buildStem({ d, delayMs, color }) {
  const gradId = `stem-grad-${delayMs}`;
  const defs   = document.getElementById('global-defs');
  const lg     = svgEl('linearGradient', { id: gradId, x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
  const s0     = svgEl('stop'); s0.setAttribute('offset', '0%');   s0.setAttribute('stop-color', '#0d2e11');
  const s1     = svgEl('stop'); s1.setAttribute('offset', '50%');  s1.setAttribute('stop-color', color || '#1e5c26');
  const s2     = svgEl('stop'); s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#0d2e11');
  lg.append(s0, s1, s2);
  defs.appendChild(lg);

  const path = svgEl('path', {
    class: 'stem-path',
    d,
    fill:             'none',
    stroke:           `url(#${gradId})`,
    'stroke-width':   '7',
    'stroke-linecap': 'round',
    'stroke-linejoin':'round',
  });

  // Measure actual path length
  document.getElementById('stems-layer').appendChild(path);
  try {
    const len = path.getTotalLength();
    path.style.setProperty('--dash-len', len);
    path.setAttribute('stroke-dasharray',  len);
    path.setAttribute('stroke-dashoffset', len);
  } catch(e) {
    path.style.setProperty('--dash-len', 600);
  }
  path.style.animationDelay = `${delayMs}ms`;
  return path;
}

/* ═══════════════════════════════════════════════════════════════
   BOUQUET LAYOUT
   ═══════════════════════════════════════════════════════════════ */
function buildBouquet() {
  const stemsLayer  = document.getElementById('stems-layer');
  const leavesLayer = document.getElementById('leaves-layer');
  const rosesLayer  = document.getElementById('roses-layer');

  /* stems — from bottom-centre upward, slightly bent */
  const stemDefs = [
    { d: 'M 350 740 C 350 620 348 500 350 200', delayMs: 200  },  // centre main
    { d: 'M 348 740 C 340 620 310 480 230 160', delayMs: 350  },  // far left
    { d: 'M 352 740 C 360 620 390 480 470 170', delayMs: 350  },  // far right
    { d: 'M 349 740 C 344 650 320 540 265 300', delayMs: 500  },  // mid-left
    { d: 'M 351 740 C 356 650 380 540 435 310', delayMs: 500  },  // mid-right
  ];
  stemDefs.forEach(s => buildStem({ ...s, color: '#1e5c26' }));

  /* leaves */
  const leafDefs = [
    { x: 290, y: 390, scale: 0.95, rotation: -30, delayMs: 1400, flip: false },
    { x: 410, y: 400, scale: 0.90, rotation: 35,  delayMs: 1500, flip: true  },
    { x: 258, y: 280, scale: 0.80, rotation: -40, delayMs: 1800, flip: false },
    { x: 442, y: 290, scale: 0.78, rotation: 42,  delayMs: 1900, flip: true  },
    { x: 310, y: 490, scale: 0.70, rotation: -20, delayMs: 2100, flip: false },
    { x: 390, y: 495, scale: 0.72, rotation: 22,  delayMs: 2200, flip: true  },
  ];
  leafDefs.forEach(l => leavesLayer.appendChild(buildLeaf(l)));

  /* roses — 5 blooms, centre + surrounding */
  const roseDefs = [
    { cx: 350, cy: 195, scale: 1.10, hueShift:  0, delayMs: 2600, id: 'a' },  // centre top
    { cx: 228, cy: 155, scale: 0.92, hueShift:  8, delayMs: 3200, id: 'b' },  // far left
    { cx: 472, cy: 165, scale: 0.95, hueShift: -6, delayMs: 3600, id: 'c' },  // far right
    { cx: 262, cy: 298, scale: 0.85, hueShift: 14, delayMs: 4100, id: 'd' },  // mid-left
    { cx: 438, cy: 308, scale: 0.88, hueShift: -4, delayMs: 4600, id: 'e' },  // mid-right
  ];

  const roseGroups = roseDefs.map(r => {
    const g = buildRose(r);
    rosesLayer.appendChild(g);
    return { el: g, def: r };
  });

  /* wrap in sway group */
  const swayG = svgEl('g', { class: 'bouquet-sway' });
  while (rosesLayer.firstChild) swayG.appendChild(rosesLayer.firstChild);
  while (leavesLayer.firstChild) swayG.appendChild(leavesLayer.firstChild);
  rosesLayer.appendChild(swayG);

  return roseGroups;
}

/* ═══════════════════════════════════════════════════════════════
   ANIMATION SEQUENCE
   ═══════════════════════════════════════════════════════════════ */
function startSequence() {
  const scene = document.getElementById('scene');
  scene.classList.add('revealed');

  initParticles();

  if (!state.bokehBuilt) {
    buildBokeh();
    state.bokehBuilt = true;
  }

  const roseGroups = buildBouquet();

  /* trigger rose blooms staggered */
  roseGroups.forEach(({ el, def }) => {
    setTimeout(() => {
      el.classList.add('blooming');
    }, def.delayMs);
  });

  /* show message card after all roses bloomed */
  const lastBloom = Math.max(...roseGroups.map(r => r.def.delayMs)) + 2800;
  setTimeout(() => {
    document.getElementById('message-card').classList.add('visible');
  }, lastBloom);
}

/* ═══════════════════════════════════════════════════════════════
   TAP OVERLAY → BEGIN EXPERIENCE
   ═══════════════════════════════════════════════════════════════ */
function handleFirstTap() {
  if (state.started) return;
  state.started = true;

  const overlay = document.getElementById('tap-overlay');
  overlay.classList.add('hidden');

  /* remove from DOM after transition */
  setTimeout(() => overlay.remove(), 1500);

  initAudio();
  startSequence();
}

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('tap-overlay');
  overlay.addEventListener('click',     handleFirstTap, { once: false });
  overlay.addEventListener('touchstart', handleFirstTap, { once: false });

  /* also allow keyboard (accessibility) */
  document.addEventListener('keydown', handleFirstTap, { once: true });

  /* preload font — touch to trigger font render */
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;left:-9999px;font-family:"Dancing Script"';
  probe.textContent   = 'Riji';
  document.body.appendChild(probe);
  requestAnimationFrame(() => probe.remove());
});
