import { useEffect, useRef } from 'react';

const GLYPHS = '01ABCDEF#$%*+<>/\\|';
const BLUE = { r: 61, g: 80, b: 255 };
const PERIWINKLE = { r: 167, g: 175, b: 255 };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 13, 7, 15, 5];

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function hash(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function paintStaticDither(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const image = ctx.createImageData(width, height);
  const data = image.data;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const noise = hash(x, y);
      const falloff = 1 - (y / height) * 0.55;
      const intensity = noise * 0.42 * falloff;
      const threshold = (BAYER[(y % 4) * 4 + (x % 4)]! + 0.5) / 16;
      if (intensity <= threshold) continue;
      const i = (y * width + x) * 4;
      const mix = noise > 0.72 ? PERIWINKLE : BLUE;
      data[i] = mix.r;
      data[i + 1] = mix.g;
      data[i + 2] = mix.b;
      data[i + 3] = 38 + noise * 52;
    }
  }
  ctx.putImageData(image, 0, 0);
}

export function AuthMatrixField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return undefined;
    if (typeof CanvasRenderingContext2D === 'undefined') return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const reduced = prefersReducedMotion();
    const columns: { y: number; speed: number }[] = [];
    let frame = 0;
    let raf = 0;
    let stopped = false;

    const resize = () => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width < 2 || height < 2) return;
      const scale = 0.28;
      canvas.width = Math.max(1, Math.floor(width * scale));
      canvas.height = Math.max(1, Math.floor(height * scale));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      columns.length = 0;
      const glyphWidth = 7;
      const count = Math.ceil(canvas.width / glyphWidth);
      for (let i = 0; i < count; i += 1) {
        columns.push({
          y: Math.random() * canvas.height,
          speed: 0.35 + Math.random() * 1.15,
        });
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      paintStaticDither(ctx, canvas.width, canvas.height);
    };

    const drawRain = () => {
      const { width, height } = canvas;
      ctx.fillStyle = 'rgba(7, 9, 29, 0.22)';
      ctx.fillRect(0, 0, width, height);
      ctx.font = '8px "Geist Mono", ui-monospace, monospace';
      ctx.textBaseline = 'top';
      const glyphWidth = 7;
      for (let i = 0; i < columns.length; i += 1) {
        const column = columns[i];
        if (!column) continue;
        const x = i * glyphWidth;
        const head = GLYPHS[(i + frame) % GLYPHS.length]!;
        const trail = GLYPHS[(i * 3 + frame) % GLYPHS.length]!;
        ctx.fillStyle = 'rgba(219, 223, 255, 0.42)';
        ctx.fillText(head, x, column.y);
        ctx.fillStyle = i % 5 === 0 ? 'rgba(167, 175, 255, 0.28)' : 'rgba(61, 80, 255, 0.26)';
        ctx.fillText(trail, x, column.y - 8);
        column.y += column.speed * 7;
        if (column.y > height + 12) {
          column.y = -Math.random() * 28;
          column.speed = 0.35 + Math.random() * 1.15;
        }
      }
      frame += 1;
    };

    const tick = () => {
      if (stopped) return;
      drawRain();
      raf = window.requestAnimationFrame(tick);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    if (!reduced) raf = window.requestAnimationFrame(tick);

    return () => {
      stopped = true;
      window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="auth-matrix" aria-hidden="true" />;
}
