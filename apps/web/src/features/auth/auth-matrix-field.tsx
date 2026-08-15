import { useEffect, useRef } from 'react';

const BLUE = { r: 61, g: 80, b: 255 };
const PERIWINKLE = { r: 167, g: 175, b: 255 };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 13, 7, 15, 5];
const WAVE = { periodMs: 8000, span: 30, band: 4, tail: 6 } as const;
const CELL = 3;
const GAP = 2;

export type AuthSquareWave = {
  readonly periodMs: number;
  readonly span: number;
  readonly band: number;
  readonly tail: number;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function authSquareWaveLevel(
  col: number,
  row: number,
  timeMs: number,
  wave: AuthSquareWave,
): number {
  const front = ((timeMs % wave.periodMs) / wave.periodMs) * wave.span;
  const delta = front - (col + row);
  if (delta < 0 || delta > wave.band + wave.tail) return 0;
  if (delta <= wave.band) {
    const t = delta / Math.max(wave.band, Number.EPSILON);
    return 0.55 + 0.45 * Math.sin(t * Math.PI);
  }
  const fade = 1 - (delta - wave.band) / wave.tail;
  return Math.max(0, fade * fade);
}

function writeCell(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  col: number,
  row: number,
  level: number,
) {
  const step = CELL + GAP;
  const ox = col * step;
  const oy = row * step;
  const presence = 0.2 + level * 0.8;
  for (let dy = 0; dy < CELL; dy += 1) {
    for (let dx = 0; dx < CELL; dx += 1) {
      const x = ox + dx;
      const y = oy + dy;
      if (x >= width || y >= height) continue;
      const threshold = (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
      if (threshold > presence * 0.88 + 0.14 && level < 0.2) continue;
      const i = (y * width + x) * 4;
      data[i] = Math.round(BLUE.r + (PERIWINKLE.r - BLUE.r) * level);
      data[i + 1] = Math.round(BLUE.g + (PERIWINKLE.g - BLUE.g) * level);
      data[i + 2] = Math.round(BLUE.b + (PERIWINKLE.b - BLUE.b) * level);
      data[i + 3] = Math.round(32 + presence * 168);
    }
  }
}

function paintSquareWave(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
  animate: boolean,
) {
  const image = ctx.createImageData(width, height);
  const data = image.data;
  const step = CELL + GAP;
  const cols = Math.max(1, Math.ceil(width / step));
  const rows = Math.max(1, Math.ceil(height / step));
  const colScale = WAVE.span / 2 / Math.max(cols - 1, 1);
  const rowScale = WAVE.span / 2 / Math.max(rows - 1, 1);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const level = animate
        ? authSquareWaveLevel(col * colScale, row * rowScale, timeMs, WAVE)
        : 0;
      writeCell(data, width, height, col, row, level);
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
    let raf = 0;
    let stopped = false;
    const startedAt = performance.now();

    const resize = () => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width < 2 || height < 2) return;
      const scale = 0.32;
      canvas.width = Math.max(1, Math.floor(width * scale));
      canvas.height = Math.max(1, Math.floor(height * scale));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      paintSquareWave(ctx, canvas.width, canvas.height, 0, false);
    };

    const tick = (now: number) => {
      if (stopped) return;
      paintSquareWave(ctx, canvas.width, canvas.height, now - startedAt, true);
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

  return (
    <canvas
      ref={canvasRef}
      className="auth-matrix"
      data-field="square-wave"
      aria-hidden="true"
    />
  );
}
