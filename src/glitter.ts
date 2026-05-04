// src/glitter.ts
// Star glitter particle system for highlighted (tier-classed) tweet cards.
// Attach via attachGlitter(cardEl, opts). The controller installs a canvas
// overlay, gates rendering on IntersectionObserver visibility, and tears
// itself down via detachGlitter or implicitly when the host is GC'd.

export interface GlitterOptions {
  density?: number;
  maxParticles?: number;
  colors?: string[];
  sizeRange?: [number, number];
  lifetimeRange?: [number, number];
  twinkle?: boolean;
  gravity?: number;
  upwardBias?: number;
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  rot: number;
  vr: number;
  age: number;
  life: number;
  color: string;
  spikes: number;
}

const DEFAULTS: Required<GlitterOptions> = {
  density: 18,
  maxParticles: 60,
  colors: ['#ffffff', '#fff4a3', '#a8e7ff', '#ffd1f2'],
  sizeRange: [2, 6],
  lifetimeRange: [700, 1500],
  twinkle: true,
  gravity: 14,
  upwardBias: 18,
};

const ATTACHED = new WeakMap<HTMLElement, GlitterController>();

class GlitterController {
  private host: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private opts: Required<GlitterOptions>;
  private rafId = 0;
  private lastTs = 0;
  private spawnAccum = 0;
  private visible = false;
  private io: IntersectionObserver;
  private ro: ResizeObserver;
  private destroyed = false;
  private dpr = 1;

  constructor(host: HTMLElement, opts: GlitterOptions = {}) {
    this.host = host;
    this.opts = { ...DEFAULTS, ...opts };

    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'mm-glitter-layer';
    Object.assign(this.canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '2',
    } as CSSStyleDeclaration);
    host.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d', { alpha: true })!;
    this.resize();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);

    this.io = new IntersectionObserver(
      ([entry]) => {
        this.visible = entry.isIntersecting;
        this.visible ? this.start() : this.stop();
      },
      { threshold: 0.01 },
    );
    this.io.observe(host);

    document.addEventListener('visibilitychange', this.onVis, { passive: true });
  }

  private onVis = () => {
    if (document.hidden) this.stop();
    else if (this.visible) this.start();
  };

  private resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.host.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    this.canvas.width = Math.max(1, Math.floor(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(r.height * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private start() {
    if (this.rafId || this.destroyed) return;
    this.lastTs = performance.now();
    const tick = (ts: number) => {
      if (this.destroyed) return;
      const dt = Math.min(64, ts - this.lastTs);
      this.lastTs = ts;
      this.update(dt);
      this.draw();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private spawn() {
    if (this.particles.length >= this.opts.maxParticles) return;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const [s0, s1] = this.opts.sizeRange;
    const [l0, l1] = this.opts.lifetimeRange;
    const colors = this.opts.colors;
    this.particles.push({
      x: Math.random() * w,
      y: h - Math.random() * (h * 0.4),
      vx: (Math.random() - 0.5) * 12,
      vy: -this.opts.upwardBias - Math.random() * 14,
      size: s0 + Math.random() * (s1 - s0),
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 4,
      age: 0,
      life: l0 + Math.random() * (l1 - l0),
      color: colors[(Math.random() * colors.length) | 0],
      spikes: Math.random() < 0.5 ? 4 : 5,
    });
  }

  private update(dt: number) {
    this.spawnAccum += (this.opts.density * dt) / 1000;
    while (this.spawnAccum >= 1) {
      this.spawn();
      this.spawnAccum -= 1;
    }
    const dts = dt / 1000;
    const g = this.opts.gravity;
    const ps = this.particles;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.age += dt;
      p.x += p.vx * dts * 8;
      p.y += p.vy * dts * 8;
      p.vy += g * dts;
      p.rot += p.vr * dts;
    }
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      if (ps[i].age < ps[i].life) ps[w++] = ps[i];
    }
    ps.length = w;
  }

  private drawStar(x: number, y: number, spikes: number, outer: number, inner: number) {
    const ctx = this.ctx;
    let rot = -Math.PI / 2;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
    for (let i = 0; i < spikes; i++) {
      rot += step;
      ctx.lineTo(x + Math.cos(rot) * inner, y + Math.sin(rot) * inner);
      rot += step;
      ctx.lineTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
    }
    ctx.closePath();
  }

  private draw() {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const t = p.age / p.life;
      const base = Math.sin(t * Math.PI);
      const flicker = this.opts.twinkle ? 0.6 + 0.4 * Math.sin(p.age * 0.02) : 1;
      const alpha = Math.max(0, base * flicker);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = p.size * 2;
      ctx.shadowColor = p.color;
      this.drawStar(0, 0, p.spikes, p.size, p.size * 0.4);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    this.io.disconnect();
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
    this.canvas.remove();
  }
}

export function attachGlitter(host: HTMLElement, opts?: GlitterOptions): GlitterController {
  let c = ATTACHED.get(host);
  if (c) return c;
  c = new GlitterController(host, opts);
  ATTACHED.set(host, c);
  return c;
}

export function detachGlitter(host: HTMLElement): void {
  const c = ATTACHED.get(host);
  if (!c) return;
  c.destroy();
  ATTACHED.delete(host);
}

export function isGlitterAttached(host: HTMLElement): boolean {
  return ATTACHED.has(host);
}
