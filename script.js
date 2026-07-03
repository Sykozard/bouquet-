/* ═══════════════════════════════════════════════════════════════
   ROSE GARDEN — For Riji
   Polished, performant vanilla JavaScript
   Target: 60 FPS — GPU transforms only — no layout thrashing
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
  started:       false,
  particleRAF:   null,
  bouquetPetals: false,   // true after 18s, enables rose-detach petals
  stems:         [],
  leaves:        [],
  swayGroup:     null,
};

/* ═══════════════════════════════════════════════════════════════
   AUDIO
   Fades in over 5 s; resolves promise when playback begins.
   ═══════════════════════════════════════════════════════════════ */
const audioEl = document.getElementById('bg-audio');

function initAudio() {
  return new Promise(resolve => {
    audioEl.src    = 'assets/music.mp3';
    audioEl.volume = 0;
    audioEl.load();

    const fadeIn = () => {
      const target    = 0.25;
      const stepMs    = 60;
      const increment = (target / 5000) * stepMs;
      const timer     = setInterval(() => {
        audioEl.volume = Math.min(audioEl.volume + increment, target);
        if (audioEl.volume >= target) clearInterval(timer);
      }, stepMs);
      resolve();
    };

    const attempt = audioEl.play();
    if (attempt !== undefined) {
      attempt.then(fadeIn).catch(fadeIn); // start anim regardless
    } else {
      fadeIn();
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   BOKEH — DOM circles, static blur, only transform animated
   ═══════════════════════════════════════════════════════════════ */
function buildBokeh() {
  const layer = document.getElementById('bokeh-layer');
  const colorGroups = [
    'rgba(232,115,154,ALPHA)',
    'rgba(255,182,193,ALPHA)',
    'rgba(196,30,107,ALPHA)',
    'rgba(240,208,128,ALPHA)',
    'rgba(253,232,216,ALPHA)',
  ];

  for (let i = 0; i < 16; i++) {
    const dot    = document.createElement('div');
    dot.className = 'bokeh-dot';

    const size  = 12 + Math.random() * 55;
    const left  = Math.random() * 100;
    const top   = Math.random() * 100;
    const col   = colorGroups[i % colorGroups.length];
    const alpha = (0.06 + Math.random() * 0.10).toFixed(3);
    const blur  = 6 + Math.random() * 18;
    const dur   = 10 + Math.random() * 14;
    const delay = Math.random() * 8;
    const bx    = (Math.random() - 0.5) * 35;
    const by    = -8 - Math.random() * 35;
    const bs    = 0.82 + Math.random() * 0.4;

    dot.style.cssText = [
      `width:${size}px`,
      `height:${size}px`,
      `left:${left}%`,
      `top:${top}%`,
      `background:${col.replace('ALPHA', alpha)}`,
      `filter:blur(${blur}px)`,
      `--dur:${dur}s`,
      `--delay:${-delay}s`,
      `--bx:${bx}px`,
      `--by:${by}px`,
      `--bs:${bs}`,
    ].join(';');

    layer.appendChild(dot);
  }

  // Stagger bokeh fade-in for a dreamy appearance
  requestAnimationFrame(() => {
    Array.from(layer.querySelectorAll('.bokeh-dot')).forEach((d, i) => {
      setTimeout(() => d.classList.add('visible'), i * 120);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   PARTICLE SPRITES — pre-rendered onto OffscreenCanvas
   Eliminates per-frame gradient creation (major perf win)
   ═══════════════════════════════════════════════════════════════ */

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const PETAL_CONFIGS = [
  [340, 78, 72],   // deep rose
  [342, 68, 80],   // rose pink
  [346, 82, 85],   // blush
  [352, 58, 88],   // soft pink
  [332, 52, 90],   // peach pink
];

const petalSprites = PETAL_CONFIGS.map(([hue, sat, lit]) => {
  const oc  = makeCanvas(52, 68);
  const cx  = oc.getContext('2d');
  cx.save();
  cx.translate(26, 64);
  cx.beginPath();
  cx.ellipse(0, -20, 20, 30, 0, 0, Math.PI * 2);
  const g = cx.createRadialGradient(0, -28, 2, 0, -10, 32);
  g.addColorStop(0,   `hsla(${hue},${sat}%,${Math.min(lit + 10, 100)}%,1)`);
  g.addColorStop(0.6, `hsla(${hue},${sat}%,${lit}%,0.7)`);
  g.addColorStop(1,   `hsla(${hue},${sat}%,${lit - 8}%,0)`);
  cx.fillStyle = g;
  cx.fill();
  cx.restore();
  return oc;
});

const sparkleSprite = (() => {
  const oc = makeCanvas(36, 36);
  const cx = oc.getContext('2d');
  cx.save();
  cx.translate(18, 18);
  const g = cx.createRadialGradient(0, 0, 0, 0, 0, 16);
  g.addColorStop(0,    'rgba(255,248,252,1)');
  g.addColorStop(0.25, 'rgba(255,220,235,0.85)');
  g.addColorStop(0.6,  'rgba(240,170,200,0.4)');
  g.addColorStop(1,    'rgba(220,130,170,0)');
  cx.fillStyle = g;
  cx.beginPath();
  cx.arc(0, 0, 16, 0, Math.PI * 2);
  cx.fill();
  cx.restore();
  return oc;
})();

/* ═══════════════════════════════════════════════════════════════
   PARTICLE SYSTEM
   All positions stored as 0-1 normalised to avoid recomputing
   on resize. Only canvas drawing happens per frame.
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
  window.addEventListener('resize', resize, { passive: true });

  /* ── Ambient floating petals ── */
  const ambientPetals = Array.from({ length: 26 }, (_, i) => ({
    x:        Math.random() * 1.2 - 0.1,
    y:        Math.random(),
    vy:       0.00055 + Math.random() * 0.0009,
    vx:       (Math.random() - 0.5) * 0.00040,
    angle:    Math.random() * Math.PI * 2,
    spin:     (Math.random() - 0.5) * 0.022,
    scaleX:   0.55 + Math.random() * 0.55,
    scaleY:   0.55 + Math.random() * 0.55,
    alpha:    0.18 + Math.random() * 0.38,
    wave:     Math.random() * Math.PI * 2,
    waveAmp:  0.00015 + Math.random() * 0.00025,
    waveFreq: 0.6 + Math.random() * 1.2,
    spriteIdx: i % PETAL_CONFIGS.length,
  }));

  /* ── Bouquet-detach petals — spawned from rose positions after 18 s ── */
  // Rose centres in SVG viewBox (700×750). Normalised to 0-1 below.
  const roseNorm = [
    { nx: 350/700, ny: 195/750 },
    { nx: 228/700, ny: 155/750 },
    { nx: 472/700, ny: 165/750 },
    { nx: 262/700, ny: 298/750 },
    { nx: 438/700, ny: 308/750 },
  ];

  // We maintain a small pool of detached petals, each reset when they drift offscreen
  const detachPool = Array.from({ length: 10 }, (_, i) => ({
    active:   false,
    x:        0,
    y:        0,
    vy:       0,
    vx:       0,
    angle:    0,
    spin:     0,
    scaleX:   0,
    scaleY:   0,
    alpha:    0,
    wave:     0,
    waveAmp:  0,
    waveFreq: 0,
    spriteIdx: i % PETAL_CONFIGS.length,
    life:     0,
    maxLife:  0,
  }));

  let lastDetachMs = 0;

  function spawnDetach(now) {
    if (now - lastDetachMs < 1800) return; // max 1 petal every 1.8 s
    const pool = detachPool.find(p => !p.active);
    if (!pool) return;

    const rose     = roseNorm[Math.floor(Math.random() * roseNorm.length)];
    // Map normalised SVG position to normalised screen position
    // The SVG container is min(90vw,600px) × min(95vh,750px), centred
    const cw    = Math.min(window.innerWidth  * 0.9, 600);
    const ch    = Math.min(window.innerHeight * 0.95, 750);
    const ox    = (window.innerWidth  - cw) / 2;
    const oy    = (window.innerHeight - ch) / 2;
    const sx    = (ox + rose.nx * cw) / window.innerWidth;
    const sy    = (oy + rose.ny * ch) / window.innerHeight;

    pool.active   = true;
    pool.x        = sx + (Math.random() - 0.5) * 0.04;
    pool.y        = sy + (Math.random() - 0.5) * 0.04;
    pool.vy       = 0.00025 + Math.random() * 0.00045;  // drifts slowly
    pool.vx       = (Math.random() - 0.5) * 0.00055;
    pool.angle    = Math.random() * Math.PI * 2;
    pool.spin     = (Math.random() - 0.5) * 0.018;
    pool.scaleX   = 0.45 + Math.random() * 0.35;
    pool.scaleY   = 0.45 + Math.random() * 0.35;
    pool.alpha    = 0.55 + Math.random() * 0.35;
    pool.wave     = Math.random() * Math.PI * 2;
    pool.waveAmp  = 0.00022 + Math.random() * 0.00028;
    pool.waveFreq = 0.4 + Math.random() * 0.8;
    pool.life     = 0;
    pool.maxLife  = 280 + Math.floor(Math.random() * 200); // frames alive

    lastDetachMs = now;
  }

  /* ── Sparkles ── */
  const sparkles = Array.from({ length: 18 }, () => ({
    x:     Math.random() * 1.2 - 0.1,
    y:     Math.random(),
    vy:    0.00018 + Math.random() * 0.00035,
    vx:    (Math.random() - 0.5) * 0.00018,
    size:  3.5 + Math.random() * 5,
    phase: Math.random() * Math.PI * 2,
    speed: 0.6 + Math.random() * 1.6,
  }));

  let t = 0;

  function tick(now) {
    ctx.clearRect(0, 0, W, H);
    t += 0.016;

    /* ── Ambient petals ── */
    for (const p of ambientPetals) {
      p.wave += 0.016 * p.waveFreq;
      p.x    += p.vx + Math.sin(p.wave) * p.waveAmp;
      p.y    += p.vy;
      p.angle += p.spin;

      if (p.y > 1.06) { p.y = -0.06; p.x = Math.random() * 1.2 - 0.1; }
      if (p.x < -0.13) p.x = 1.13;
      if (p.x >  1.13) p.x = -0.13;

      const sp  = petalSprites[p.spriteIdx];
      const pw  = 52 * p.scaleX;
      const ph  = 68 * p.scaleY;

      ctx.save();
      ctx.translate(p.x * W, p.y * H);
      ctx.rotate(p.angle);
      ctx.globalAlpha = p.alpha;
      ctx.drawImage(sp, -pw * 0.5, -ph * 0.94, pw, ph);
      ctx.restore();
    }

    /* ── Detached bouquet petals ── */
    if (state.bouquetPetals) {
      spawnDetach(now);

      for (const p of detachPool) {
        if (!p.active) continue;

        p.wave  += 0.016 * p.waveFreq;
        p.x     += p.vx + Math.sin(p.wave) * p.waveAmp;
        p.y     += p.vy;
        p.angle += p.spin;
        p.life  += 1;

        // Fade out near end of life
        const lifeRatio = p.life / p.maxLife;
        const fadedAlpha = lifeRatio > 0.75
          ? p.alpha * (1 - (lifeRatio - 0.75) / 0.25)
          : p.alpha;

        if (p.life >= p.maxLife || p.y > 1.08) {
          p.active = false;
          continue;
        }

        const sp = petalSprites[p.spriteIdx];
        const pw = 52 * p.scaleX;
        const ph = 68 * p.scaleY;

        ctx.save();
        ctx.translate(p.x * W, p.y * H);
        ctx.rotate(p.angle);
        ctx.globalAlpha = fadedAlpha;
        ctx.drawImage(sp, -pw * 0.5, -ph * 0.94, pw, ph);
        ctx.restore();
      }
    }

    /* ── Sparkles ── */
    for (const s of sparkles) {
      s.x += s.vx;
      s.y += s.vy;
      if (s.y > 1.06) { s.y = -0.06; s.x = Math.random() * 1.2 - 0.1; }

      const pulse = 0.35 + 0.65 * Math.abs(Math.sin(t * s.speed + s.phase));
      const r     = s.size * pulse;
      const dr    = r / 16; // sprite is radius-16

      ctx.save();
      ctx.globalAlpha = 0.65 * pulse;
      ctx.translate(s.x * W, s.y * H);
      ctx.scale(dr, dr);
      ctx.drawImage(sparkleSprite, -18, -18);
      ctx.restore();
    }

    state.particleRAF = requestAnimationFrame(tick);
  }

  state.particleRAF = requestAnimationFrame(tick);
}

/* ═══════════════════════════════════════════════════════════════
   SVG ROSE BUILDER
   8 petal layers, rich gradients, highlights, inner shadows
   ═══════════════════════════════════════════════════════════════ */

/**
 * Organic rose petal path — slightly concave inner surface,
 * slight asymmetry injected via jitterX.
 */
function petalPath(len, widthRatio, curvature, jitterX) {
  const w   = len * widthRatio;
  const jx  = jitterX || 0;
  const tip = -len;

  const lx1 = -(w * 0.92) + jx * 0.3;
  const ly1 = -(len * 0.14);
  const lx2 = -(w * 0.78) + jx * 0.5;
  const ly2 = tip + len * curvature * 0.9;
  const rx2 =  (w * 0.82) + jx * 0.4;
  const ry2 = tip + len * curvature;
  const rx1 =  (w * 0.94) + jx * 0.2;
  const ry1 = -(len * 0.12);

  // Small notch at petal base (organic imperfection)
  const nb = len * 0.03;

  return [
    `M ${-nb} ${nb}`,
    `C ${lx1} ${ly1} ${lx2} ${ly2} 0 ${tip}`,
    `C ${rx2} ${ry2} ${rx1} ${ry1} ${nb} ${nb}`,
    `Z`,
  ].join(' ');
}

function buildRose({ cx, cy, scale, hueShift, budDelayMs, bloomDelayMs, id }) {
  const g = svgEl('g', {
    class: 'rose-group',
    id:    `rose-${id}`,
  });
  g.style.setProperty('--bud-delay',   `${budDelayMs}ms`);
  g.style.setProperty('--bloom-delay', `${bloomDelayMs}ms`);
  g.style.cssText += `transform-origin:${cx}px ${cy}px;`;

  const defs    = document.getElementById('global-defs');
  const baseHue = 338 + hueShift;

  /* ── Per-layer colour config: outer → inner ── */
  const layerColors = [
    { outer: `hsl(${baseHue},74%,38%)`,   mid: `hsl(${baseHue},62%,58%)`,   hi: `hsl(${baseHue+4},48%,76%)` },
    { outer: `hsl(${baseHue},71%,44%)`,   mid: `hsl(${baseHue},60%,64%)`,   hi: `hsl(${baseHue+4},44%,80%)` },
    { outer: `hsl(${baseHue},66%,50%)`,   mid: `hsl(${baseHue},57%,70%)`,   hi: `hsl(${baseHue+5},40%,84%)` },
    { outer: `hsl(${baseHue},62%,57%)`,   mid: `hsl(${baseHue},53%,74%)`,   hi: `hsl(${baseHue+5},36%,88%)` },
    { outer: `hsl(${baseHue},57%,63%)`,   mid: `hsl(${baseHue},49%,79%)`,   hi: `hsl(${baseHue+5},32%,91%)` },
    { outer: `hsl(${baseHue},52%,70%)`,   mid: `hsl(${baseHue},44%,83%)`,   hi: `#fff2f6` },
    { outer: `hsl(${baseHue},46%,76%)`,   mid: `hsl(${baseHue},38%,87%)`,   hi: `#fff5f8` },
    { outer: `hsl(${baseHue},40%,82%)`,   mid: `hsl(${baseHue},32%,91%)`,   hi: `#fff8fb` },
  ];

  layerColors.forEach((lc, li) => {
    const gid = `r${id}-g${li}`;
    const rg  = svgEl('radialGradient', { id: gid, cx: '48%', cy: '78%', r: '68%' });
    const s0  = svgEl('stop'); s0.setAttribute('offset', '0%');   s0.setAttribute('stop-color', lc.mid);
    const s1  = svgEl('stop'); s1.setAttribute('offset', '55%');  s1.setAttribute('stop-color', lc.outer);
    const s2  = svgEl('stop'); s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', `hsl(${baseHue},72%,26%)`);
    rg.append(s0, s1, s2);
    defs.appendChild(rg);

    const hid = `r${id}-h${li}`;
    const hg  = svgEl('radialGradient', { id: hid, cx: '32%', cy: '22%', r: '52%' });
    const h0  = svgEl('stop'); h0.setAttribute('offset', '0%');   h0.setAttribute('stop-color', lc.hi); h0.setAttribute('stop-opacity', '0.60');
    const h1  = svgEl('stop'); h1.setAttribute('offset', '100%'); h1.setAttribute('stop-color', lc.hi); h1.setAttribute('stop-opacity', '0');
    hg.append(h0, h1);
    defs.appendChild(hg);

    // Rim-light gradient — subtle light from above-left
    const rid2 = `r${id}-r${li}`;
    const rl   = svgEl('linearGradient', { id: rid2, x1: '0%', y1: '100%', x2: '60%', y2: '0%' });
    const r0   = svgEl('stop'); r0.setAttribute('offset', '0%');   r0.setAttribute('stop-color', `hsl(${baseHue+10},50%,88%)`); r0.setAttribute('stop-opacity', '0.12');
    const r1   = svgEl('stop'); r1.setAttribute('offset', '100%'); r1.setAttribute('stop-color', `hsl(${baseHue+10},50%,88%)`); r1.setAttribute('stop-opacity', '0');
    rl.append(r0, r1);
    defs.appendChild(rl);
  });

  /* shadow filter — only applied to outermost layer */
  const fid  = `r${id}-f`;
  const filt = svgEl('filter', { id: fid, x: '-25%', y: '-25%', width: '150%', height: '150%' });
  const fds  = svgEl('feDropShadow', {
    dx: '0', dy: '4', stdDeviation: '5',
    'flood-color': `hsl(${baseHue},65%,18%)`,
    'flood-opacity': '0.38',
  });
  filt.appendChild(fds);
  defs.appendChild(filt);

  /* inner-glow filter for centre petals */
  const igid  = `r${id}-ig`;
  const igilt = svgEl('filter', { id: igid, x: '-20%', y: '-20%', width: '140%', height: '140%' });
  const igfe  = svgEl('feGaussianBlur', { stdDeviation: '1.2', result: 'blur' });
  const igcmp = svgEl('feComposite',    { in: 'SourceGraphic', in2: 'blur', operator: 'over' });
  igilt.append(igfe, igcmp);
  defs.appendChild(igilt);

  const rg = svgEl('g', { transform: `translate(${cx},${cy}) scale(${scale})` });

  /* ── 8 petal layers, outer (li=0) to inner (li=7) ── */
  const layerDefs = [
    { count: 8,  len: 62, wr: 0.46, curv: 0.18, yOff:  22, rot0:  0,  dur: 2.8, cls: 'petal-outer' },
    { count: 7,  len: 57, wr: 0.44, curv: 0.20, yOff:  15, rot0:  23, dur: 2.8, cls: 'petal-outer' },
    { count: 7,  len: 52, wr: 0.42, curv: 0.22, yOff:   9, rot0:  6,  dur: 2.5, cls: 'petal-outer' },
    { count: 6,  len: 45, wr: 0.40, curv: 0.24, yOff:   3, rot0:  18, dur: 2.4, cls: 'petal-mid'   },
    { count: 6,  len: 38, wr: 0.38, curv: 0.26, yOff:  -4, rot0:  4,  dur: 2.4, cls: 'petal-mid'   },
    { count: 5,  len: 30, wr: 0.36, curv: 0.28, yOff: -11, rot0:  14, dur: 2.1, cls: 'petal-mid'   },
    { count: 4,  len: 21, wr: 0.34, curv: 0.30, yOff: -17, rot0:  2,  dur: 2.0, cls: 'petal-inner' },
    { count: 3,  len: 13, wr: 0.32, curv: 0.32, yOff: -22, rot0:  10, dur: 2.0, cls: 'petal-inner' },
  ];

  layerDefs.forEach((ld, li) => {
    const gradId = `r${id}-g${li}`;
    const hiId   = `r${id}-h${li}`;
    const rimId  = `r${id}-r${li}`;
    const layerG = svgEl('g', { transform: `translate(0,${ld.yOff})` });

    for (let pi = 0; pi < ld.count; pi++) {
      const baseAngle = (360 / ld.count) * pi + ld.rot0;
      const jitter    = (Math.random() - 0.5) * 7;   // natural irregularity
      const angle     = baseAngle + jitter;
      const jitterX   = (Math.random() - 0.5) * (ld.len * 0.06);

      // Stagger: outer blooms first (+0ms), inner blooms last (+1750ms)
      // Within each layer, petals stagger slightly
      const petalDelay = bloomDelayMs + li * 220 + pi * 42;

      // Outer group carries the radial rotation via SVG attribute.
      // CSS animation must NEVER touch this element's transform.
      const rotG = svgEl('g', { transform: `rotate(${angle})` });

      // Inner group receives the CSS bloom animation (scale only, no rotation).
      // transform-origin 0,0 = base of petal = centre of rose in this coord system.
      const petalG = svgEl('g', { class: `petal-layer ${ld.cls}` });
      petalG.style.setProperty('--petal-delay', `${petalDelay}ms`);
      petalG.style.transformOrigin = '0px 0px';

      const d    = petalPath(ld.len, ld.wr, ld.curv, jitterX);
      const base = svgEl('path', {
        d,
        fill:   `url(#${gradId})`,
        filter: li === 0 ? `url(#${fid})` : '',
      });

      const hi = svgEl('path', { d, fill: `url(#${hiId})`, opacity: '0.65' });
      const rm = svgEl('path', { d, fill: `url(#${rimId})`, opacity: '0.8' });

      // Edge stroke for inner petals — gives depth/separation
      if (li >= 3) {
        const edge = svgEl('path', {
          d,
          fill:             'none',
          stroke:           `hsl(${baseHue},70%,22%)`,
          'stroke-width':   '0.4',
          'stroke-opacity': '0.14',
        });
        petalG.append(base, hi, rm, edge);
      } else {
        petalG.append(base, hi, rm);
      }

      rotG.appendChild(petalG);
      layerG.appendChild(rotG);
    }

    rg.appendChild(layerG);
  });

  /* ── Sepal (calyx) ── */
  const sepalG = svgEl('g', { opacity: '0.92' });
  for (let si = 0; si < 5; si++) {
    const sa  = (72 * si) + 14;
    const sep = svgEl('ellipse', {
      cx: '0', cy: '24', rx: '4.5', ry: '16',
      fill: `hsl(120,44%,22%)`,
      transform: `rotate(${sa})`,
    });
    sepalG.appendChild(sep);
  }
  rg.appendChild(sepalG);

  /* ── Centre glow (soft light catching innermost petals) ── */
  const glow = svgEl('ellipse', {
    cx: '0', cy: '-8', rx: '8', ry: '10',
    fill: `hsl(${baseHue+8},55%,90%)`,
    opacity: '0.22',
    filter: `url(#${igid})`,
  });
  rg.appendChild(glow);

  g.appendChild(rg);
  return g;
}

/* ─── Leaf builder ──────────────────────────────────────────── */
function buildLeaf({ x, y, scale, rotation, flip }) {
  const g = svgEl('g', {
    class: 'leaf-group',
    transform: `translate(${x},${y}) scale(${scale * (flip ? -1 : 1)},${scale}) rotate(${rotation})`,
  });
  g.style.setProperty('--lr', flip ? '22deg' : '-22deg');
  g.style.transformOrigin = `${x}px ${y}px`;

  const defs = document.getElementById('global-defs');
  const gid  = `lg-${Math.round(x)}-${Math.round(y)}`;

  if (!document.getElementById(gid)) {
    const lg = svgEl('linearGradient', { id: gid, x1: '0%', y1: '0%', x2: '80%', y2: '100%' });
    const s0 = svgEl('stop'); s0.setAttribute('offset', '0%');   s0.setAttribute('stop-color', '#174020');
    const s1 = svgEl('stop'); s1.setAttribute('offset', '45%');  s1.setAttribute('stop-color', '#2a6e32');
    const s2 = svgEl('stop'); s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#174020');
    lg.append(s0, s1, s2);
    defs.appendChild(lg);
  }

  const body = svgEl('path', {
    d:       'M 0 0 C -24 -6 -40 -26 -22 -54 C -9 -70 9 -70 22 -54 C 40 -26 24 -6 0 0 Z',
    fill:    `url(#${gid})`,
    opacity: '0.88',
  });

  const vein = svgEl('path', {
    d:              'M 0 0 C 0 -18 0 -36 0 -58',
    stroke:         '#17401f',
    'stroke-width': '0.9',
    fill:           'none',
    opacity:        '0.5',
  });

  // Side veins
  for (let v = 1; v <= 4; v++) {
    const yv = -12 * v;
    const xv = 12 + v * 1.5;
    [1, -1].forEach(side => {
      const sv = svgEl('path', {
        d:              `M 0 ${yv} Q ${side * xv * 0.5} ${yv - 4} ${side * xv} ${yv - 9}`,
        stroke:         '#17401f',
        'stroke-width': '0.45',
        fill:           'none',
        opacity:        '0.28',
      });
      g.appendChild(sv);
    });
  }

  g.append(body, vein);
  return g;
}

/* ─── Stem builder ──────────────────────────────────────────── */
function buildStem({ d, color, stemId }) {
  const gradId = `sg-${stemId}`;
  const defs   = document.getElementById('global-defs');

  if (!document.getElementById(gradId)) {
    const lg = svgEl('linearGradient', { id: gradId, x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
    const s0 = svgEl('stop'); s0.setAttribute('offset', '0%');   s0.setAttribute('stop-color', '#0b2710');
    const s1 = svgEl('stop'); s1.setAttribute('offset', '50%');  s1.setAttribute('stop-color', color || '#1d5924');
    const s2 = svgEl('stop'); s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#0b2710');
    lg.append(s0, s1, s2);
    defs.appendChild(lg);
  }

  const path = svgEl('path', {
    class:            'stem-path',
    d,
    fill:             'none',
    stroke:           `url(#${gradId})`,
    'stroke-width':   '7',
    'stroke-linecap': 'round',
    'stroke-linejoin':'round',
  });

  document.getElementById('stems-layer').appendChild(path);

  try {
    const len = path.getTotalLength();
    path.style.setProperty('--dash-len', len);
    path.setAttribute('stroke-dasharray',  len);
    path.setAttribute('stroke-dashoffset', len);
  } catch (e) {
    path.style.setProperty('--dash-len', 600);
    path.setAttribute('stroke-dasharray',  600);
    path.setAttribute('stroke-dashoffset', 600);
  }

  return path;
}

/* ═══════════════════════════════════════════════════════════════
   BOUQUET LAYOUT
   ═══════════════════════════════════════════════════════════════ */
function buildBouquet() {
  const stemsLayer  = document.getElementById('stems-layer');
  const leavesLayer = document.getElementById('leaves-layer');
  const rosesLayer  = document.getElementById('roses-layer');

  /* Stems */
  const stemPaths = [
    { d: 'M 350 740 C 350 620 348 500 350 200', stemId: 0 },
    { d: 'M 348 740 C 340 620 308 478 228 158', stemId: 1 },
    { d: 'M 352 740 C 360 620 392 480 472 168', stemId: 2 },
    { d: 'M 349 740 C 344 648 318 538 262 300', stemId: 3 },
    { d: 'M 351 740 C 358 648 382 540 438 312', stemId: 4 },
  ];
  state.stems = stemPaths.map(s => buildStem({ ...s, color: '#1d5924' }));

  /* Leaves */
  const leafDefs = [
    { x: 288, y: 392, scale: 0.96, rotation: -32, flip: false },
    { x: 412, y: 402, scale: 0.92, rotation:  36, flip: true  },
    { x: 255, y: 278, scale: 0.82, rotation: -42, flip: false },
    { x: 445, y: 288, scale: 0.80, rotation:  44, flip: true  },
    { x: 308, y: 494, scale: 0.72, rotation: -22, flip: false },
    { x: 392, y: 498, scale: 0.74, rotation:  24, flip: true  },
    { x: 234, y: 198, scale: 0.68, rotation: -55, flip: false },
    { x: 466, y: 210, scale: 0.70, rotation:  58, flip: true  },
  ];
  state.leaves = leafDefs.map(l => {
    const el = buildLeaf(l);
    leavesLayer.appendChild(el);
    return el;
  });

  /* Roses — proper cinematic timeline bloom stagger
     budDelayMs  = when tiny bud appears
     bloomDelayMs = when petals start opening (budDelay + 300ms)
  */
  const roseDefs = [
    { cx: 350, cy: 196, scale: 1.12, hueShift:  0, budDelayMs:  7000, bloomDelayMs:  7300, id: 'a' },
    { cx: 228, cy: 158, scale: 0.93, hueShift:  9, budDelayMs:  9400, bloomDelayMs:  9700, id: 'b' },
    { cx: 472, cy: 168, scale: 0.96, hueShift: -7, budDelayMs: 11200, bloomDelayMs: 11500, id: 'c' },
    { cx: 262, cy: 300, scale: 0.86, hueShift: 15, budDelayMs: 13400, bloomDelayMs: 13700, id: 'd' },
    { cx: 438, cy: 310, scale: 0.89, hueShift: -5, budDelayMs: 15600, bloomDelayMs: 15900, id: 'e' },
  ];

  const roseGroups = roseDefs.map(r => {
    const g = buildRose(r);
    rosesLayer.appendChild(g);
    return { el: g, def: r };
  });

  /* Wrap leaves + roses in sway group */
  const swayG = svgEl('g', { class: 'bouquet-sway', id: 'sway-group' });
  while (leavesLayer.firstChild) swayG.appendChild(leavesLayer.firstChild);
  while (rosesLayer.firstChild)  swayG.appendChild(rosesLayer.firstChild);
  rosesLayer.appendChild(swayG);
  state.swayGroup = swayG;

  return roseGroups;
}

/* ═══════════════════════════════════════════════════════════════
   MESSAGE REVEAL — triggers line animations fresh from 0
   ═══════════════════════════════════════════════════════════════ */
function revealMessage() {
  const card = document.getElementById('message-card');
  card.classList.add('visible');

  const lines = card.querySelectorAll('.msg-line, .msg-signature');
  lines.forEach((el, i) => {
    el.style.setProperty('--line-delay', `${i * 550}ms`);
    // Force reflow so animation restarts cleanly
    void el.offsetWidth;
    el.classList.add('reveal');
  });
}

/* ═══════════════════════════════════════════════════════════════
   LIGHTING PHASE — progressive orb visibility
   ═══════════════════════════════════════════════════════════════ */
function revealOrbs() {
  document.querySelectorAll('.orb').forEach((o, i) => {
    setTimeout(() => o.classList.add('visible'), i * 300);
  });
}

/* ═══════════════════════════════════════════════════════════════
   ANIMATION TIMELINE
   All times are absolute milliseconds from the moment the user taps.

   0 ms      : scene fades in, audio starts
   800 ms    : camera float begins
   2 000 ms  : ambient light orbs appear, fog activates, particles start
   2 500 ms  : bokeh dots appear
   4 000 ms  : centre stem starts drawing
   4 150 ms  : left + right stems start
   4 350 ms  : mid-left + mid-right stems start
   5 400 ms  : all leaves grow
   7 000 ms  : rose A bud appears → bloom starts (centre)
   9 400 ms  : rose B bud appears → bloom (far left)
  11 200 ms  : rose C bud appears → bloom (far right)
  13 400 ms  : rose D bud appears → bloom (mid-left)
  15 600 ms  : rose E bud appears → bloom (mid-right)
  18 000 ms  : bouquet sway begins, detach-petal mode on
  22 000 ms  : message card fades in
   ═══════════════════════════════════════════════════════════════ */
function runTimeline(roseGroups) {

  /* T+0: scene visible */
  document.getElementById('scene').classList.add('revealed');

  /* T+800: camera float */
  setTimeout(() => {
    document.getElementById('stage').classList.add('floating');
  }, 800);

  /* T+2000: orbs, fog, particles */
  setTimeout(() => {
    revealOrbs();
    document.querySelector('.fog-1').classList.add('active');
    document.querySelector('.fog-2').classList.add('active');
    initParticles();
  }, 2000);

  /* T+2500: bokeh */
  setTimeout(() => {
    buildBokeh();
  }, 2500);

  /* T+4000: stems grow sequentially */
  setTimeout(() => {
    state.stems[0].classList.add('grow');
  }, 4000);
  setTimeout(() => {
    state.stems[1].classList.add('grow');
    state.stems[2].classList.add('grow');
  }, 4150);
  setTimeout(() => {
    state.stems[3].classList.add('grow');
    state.stems[4].classList.add('grow');
  }, 4350);

  /* T+5400: leaves appear */
  setTimeout(() => {
    state.leaves.forEach((l, i) => {
      setTimeout(() => l.classList.add('grow'), i * 160);
    });
  }, 5400);

  /* T+7000–15600: roses bud then bloom (delays baked into CSS vars) */
  roseGroups.forEach(({ el }) => {
    el.classList.add('bud');      // triggers CSS vars --bud-delay / --bloom-delay
  });

  /* Blooming class must be added at bloomDelayMs so petals start running */
  roseGroups.forEach(({ el, def }) => {
    setTimeout(() => el.classList.add('blooming'), def.bloomDelayMs);
  });

  /* T+18000: sway + detach petals */
  setTimeout(() => {
    if (state.swayGroup) state.swayGroup.classList.add('swaying');
    state.bouquetPetals = true;
  }, 18000);

  /* T+22000: message */
  setTimeout(() => {
    revealMessage();
  }, 22000);
}

/* ═══════════════════════════════════════════════════════════════
   SEQUENCE START — called after first tap
   ═══════════════════════════════════════════════════════════════ */
async function startSequence() {
  await initAudio();

  /* Build bouquet into SVG (DOM manipulation before animations) */
  const roseGroups = buildBouquet();

  /* Run timeline */
  runTimeline(roseGroups);
}

/* ═══════════════════════════════════════════════════════════════
   TAP HANDLER
   ═══════════════════════════════════════════════════════════════ */
function handleFirstTap() {
  if (state.started) return;
  state.started = true;

  const overlay = document.getElementById('tap-overlay');
  overlay.classList.add('hidden');
  setTimeout(() => overlay.remove(), 1700);

  startSequence();
}

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('tap-overlay');
  overlay.addEventListener('click',     handleFirstTap);
  overlay.addEventListener('touchstart', handleFirstTap, { passive: true });
  document.addEventListener('keydown',  handleFirstTap, { once: true });

  /* Font warm-up probe */
  const probe       = document.createElement('span');
  probe.style.cssText = 'position:absolute;left:-9999px;opacity:0;font-family:"Dancing Script","Cormorant Garamond"';
  probe.textContent  = 'For My Beautiful Riji ❤';
  document.body.appendChild(probe);
  requestAnimationFrame(() => probe.remove());
});
