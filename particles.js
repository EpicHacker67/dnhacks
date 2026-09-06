export function initParticleText(canvas, options = {}) {
  if (!canvas) {
    return null;
  }

  const text = options.text ?? "MiniMap";
  const particleSize = options.particleSize ?? 2.1;
  const density = options.density ?? 13;
  const color = options.color ?? "#111111";
  const highlightColor = options.highlightColor ?? "#5c5a56";
  const scatter = options.scatter ?? 190;
  const gatherDuration = options.gatherDuration ?? 1600;
  const stagger = options.stagger ?? 420;
  const pointerRepel = options.pointerRepel ?? 42;
  const repelRadius = options.repelRadius ?? 120;
  const idleDrift = options.idleDrift ?? 1.6;
  const glow = options.glow ?? false;
  const fontFamily = options.fontFamily ?? '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const fontWeight = options.fontWeight ?? 700;

  const ctx = canvas.getContext("2d", { alpha: true });
  const pointer = { x: 0, y: 0, on: false };
  let particles = [];
  let width = 0;
  let height = 0;
  let started = false;
  let startAt = 0;
  let raf = 0;
  let dotSize = particleSize;

  function hexToRgb(hex) {
    const n = hex.replace("#", "");
    const v = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
    return {
      r: parseInt(v.slice(0, 2), 16),
      g: parseInt(v.slice(2, 4), 16),
      b: parseInt(v.slice(4, 6), 16),
    };
  }

  const rgbA = hexToRgb(color);
  const rgbB = hexToRgb(highlightColor);

  function mix(t) {
    return {
      r: Math.round(rgbA.r + (rgbB.r - rgbA.r) * t),
      g: Math.round(rgbA.g + (rgbB.g - rgbA.g) * t),
      b: Math.round(rgbA.b + (rgbB.b - rgbA.b) * t),
    };
  }

  function easeOut(t) {
    const x = Math.min(1, Math.max(0, t));
    return 1 - (1 - x) ** 3;
  }

  function glyphBounds(metrics, fallbackSize) {
    const w = (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || 0);
    const h = (metrics.actualBoundingBoxAscent || 0) + (metrics.actualBoundingBoxDescent || 0);
    return {
      w: w || metrics.width || fallbackSize,
      h: h || fallbackSize * 0.72,
    };
  }

  function viewSize() {
    const host = canvas.parentElement ?? canvas;
    const hostW = host.clientWidth || host.getBoundingClientRect().width;
    const hostH = host.clientHeight || host.getBoundingClientRect().height;
    const nextW = Math.max(1, Math.round(hostW || canvas.clientWidth));
    const nextH = Math.max(1, Math.round(hostH || canvas.clientHeight));
    return { nextW, nextH };
  }

  function sample() {
    const { nextW, nextH } = viewSize();
    if (nextW < 8 || nextH < 8) {
      requestAnimationFrame(sample);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const narrow = nextW < 500;
    width = nextW;
    height = nextH;
    canvas.width = Math.floor(nextW * dpr);
    canvas.height = Math.floor(nextH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padX = nextW * (narrow ? 0.09 : 0.06);
    const padY = nextH * (narrow ? 0.1 : 0.12);
    const maxW = Math.max(24, nextW - padX * 2);
    const maxH = Math.max(24, nextH - padY * 2);

    const off = document.createElement("canvas");
    off.width = nextW;
    off.height = nextH;
    const octx = off.getContext("2d", { willReadFrequently: true });
    let size = narrow ? Math.min(maxH, maxW * 0.34) : Math.min(nextH * 0.42, nextW * 0.18);
    octx.font = `${fontWeight} ${size}px ${fontFamily}`;
    let metrics = octx.measureText(text);
    let bounds = glyphBounds(metrics, size);
    const fit = Math.min(maxW / Math.max(bounds.w, 1), maxH / Math.max(bounds.h, 1), 1);
    if (fit < 0.999) {
      size *= fit;
      octx.font = `${fontWeight} ${size}px ${fontFamily}`;
      metrics = octx.measureText(text);
      bounds = glyphBounds(metrics, size);
    }

    octx.fillStyle = "#000";
    octx.textAlign = "left";
    octx.textBaseline = "alphabetic";
    const drawX = (nextW - bounds.w) / 2 + (metrics.actualBoundingBoxLeft || 0);
    const drawY = (nextH - bounds.h) / 2 + (metrics.actualBoundingBoxAscent || size * 0.72);
    octx.fillText(text, drawX, drawY);

    const data = octx.getImageData(0, 0, off.width, off.height).data;
    const next = [];
    const step = Math.max(narrow ? 6 : 3, Math.round(density * Math.min(1, size / 220)));
    const skip = narrow ? 0.08 : 0.16;
    const jitter = step * (narrow ? 0.28 : 0.7);
    dotSize = particleSize;
    for (let y = 0; y < off.height; y += step) {
      for (let x = 0; x < off.width; x += step) {
        if (data[(y * off.width + x) * 4 + 3] < 90) {
          continue;
        }
        if (Math.random() < skip) {
          continue;
        }
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * scatter;
        const tx = x + (Math.random() - 0.5) * jitter;
        const ty = y + (Math.random() - 0.5) * jitter;
        next.push({
          tx,
          ty,
          sx: tx + Math.cos(angle) * dist,
          sy: ty + Math.sin(angle) * dist,
          x: tx + Math.cos(angle) * dist,
          y: ty + Math.sin(angle) * dist,
          delay: Math.random() * stagger,
          tint: Math.random(),
          phase: Math.random() * Math.PI * 2,
          size: 0.65 + Math.random() * 0.7,
        });
      }
    }

    if (next.length) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      next.forEach((p) => {
        minX = Math.min(minX, p.tx);
        minY = Math.min(minY, p.ty);
        maxX = Math.max(maxX, p.tx);
        maxY = Math.max(maxY, p.ty);
      });
      const boxW = Math.max(1, maxX - minX);
      const boxH = Math.max(1, maxY - minY);
      const edge = dotSize * 1.5 + idleDrift + 2;
      const fitW = Math.max(24, nextW - Math.max(padX, edge) * 2);
      const fitH = Math.max(24, nextH - Math.max(padY, edge) * 2);
      const scale = Math.min(fitW / boxW, fitH / boxH, 1);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      next.forEach((p) => {
        const ntx = (p.tx - cx) * scale + nextW / 2;
        const nty = (p.ty - cy) * scale + nextH / 2;
        p.sx += ntx - p.tx;
        p.sy += nty - p.ty;
        p.x += ntx - p.tx;
        p.y += nty - p.ty;
        p.tx = ntx;
        p.ty = nty;
      });
    }

    particles = next;
    if (started) {
      startAt = performance.now();
    }
  }

  function replay() {
    particles.forEach((p) => {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * scatter;
      p.sx = p.tx + Math.cos(angle) * dist;
      p.sy = p.ty + Math.sin(angle) * dist;
      p.delay = Math.random() * stagger;
    });
    startAt = performance.now();
    started = true;
  }

  function start() {
    if (!particles.length) {
      sample();
    }
    replay();
  }

  function draw(now) {
    raf = requestAnimationFrame(draw);
    ctx.clearRect(0, 0, width, height);
    if (!particles.length) {
      return;
    }
    const t0 = started ? startAt : now;
    particles.forEach((p) => {
      const gather = easeOut((now - t0 - p.delay) / gatherDuration);
      let x = p.sx + (p.tx - p.sx) * gather;
      let y = p.sy + (p.ty - p.sy) * gather;
      if (gather > 0.98) {
        x += Math.sin(now * 0.0012 + p.phase) * idleDrift;
        y += Math.cos(now * 0.001 + p.phase) * idleDrift;
      }
      if (pointer.on) {
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const d2 = dx * dx + dy * dy;
        const r2 = repelRadius * repelRadius;
        if (d2 < r2 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const force = (1 - d / repelRadius) * pointerRepel;
          x += (dx / d) * force;
          y += (dy / d) * force;
        }
      }
      p.x = x;
      p.y = y;
      const rgb = mix(p.tint * 0.55);
      if (glow) {
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.16)`;
        ctx.beginPath();
        ctx.arc(x, y, dotSize * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
      ctx.beginPath();
      ctx.arc(x, y, dotSize * p.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function onPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.on = true;
  }

  const pointerRoot = options.pointerRoot ?? canvas;
  pointerRoot.addEventListener("pointermove", onPointer);
  pointerRoot.addEventListener("pointerenter", onPointer);
  pointerRoot.addEventListener("pointerleave", () => {
    pointer.on = false;
  });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !started) {
          start();
        }
      });
    },
    { threshold: 0.28 },
  );
  io.observe(canvas);

  const ready = document.fonts?.ready ?? Promise.resolve();
  ready.then(() => {
    sample();
    raf = requestAnimationFrame(draw);
  });

  window.addEventListener("resize", () => {
    sample();
  });

  return { start, replay };
}
