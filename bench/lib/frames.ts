import { readFileSync } from 'node:fs';
import type { Cdp } from './cdp';

export function summarize(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null;
  return { samples: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: at(1) };
}
export async function startFrames(cdp?: Cdp) {
  if (cdp)
    await cdp.eval(`(() => {
    const sample = { frames: [], inputs: [], stop: false, last: null, input: null };
    window.__benchFrames = sample;
    sample.key = (event) => { if (event.target.matches('textarea[aria-label="Message"]')) sample.input = performance.now(); };
    document.addEventListener('keydown', sample.key, true);
    const tick = (now) => {
      if (sample.stop) return;
      if (sample.last !== null && sample.frames.length < 100000) sample.frames.push(now - sample.last);
      if (sample.input !== null) { sample.inputs.push(performance.now() - sample.input); sample.input = null; }
      sample.last = now; requestAnimationFrame(tick);
    }; requestAnimationFrame(tick);
  })()`);
  return Date.now();
}
export async function stopFrames(log: string, since: number, cdp?: Cdp) {
  if (cdp) {
    const data = await cdp.eval<{ frames: number[]; inputs: number[] }>(`(() => {
      const s = window.__benchFrames; s.stop = true; document.removeEventListener('keydown', s.key, true);
      return { frames: s.frames, inputs: s.inputs };
    })()`);
    return {
      intervalMs: summarize(data.frames),
      inputToFrameMs: summarize(data.inputs),
      cpuFrameMs: null,
      clock: 'rAF callback (not hardware presentation)',
    };
  }
  const lines = readFileSync(log, 'utf8')
    .split('\n')
    .map((l) => l.split(' '))
    .filter((p) => Number(p[1]) >= since);
  const frames = lines.filter((p) => p[0] === 'OPENCODEX_BENCH_FRAME');
  return {
    intervalMs: summarize(frames.slice(1).map((p) => Number(p[2]))),
    cpuFrameMs: summarize(frames.map((p) => Number(p[3]))),
    inputToFrameMs: summarize(
      lines.filter((p) => p[0] === 'OPENCODEX_BENCH_INPUT').map((p) => Number(p[2])),
    ),
    clock: 'Rune display-link target/start; key to drawn callback (not hardware presentation)',
  };
}

export async function cdpExercise(cdp: Cdp, action: 'scroll' | 'type', wheelPixels = 60) {
  if (action === 'scroll') {
    const point = await cdp.eval<{ x: number; y: number }>(`(() => {
      const row = document.querySelector('.timeline-row'); if (!row) throw new Error('No transcript');
      const r = row.getBoundingClientRect(); return { x: Math.max(400, r.x + 100), y: Math.max(100, Math.min(innerHeight - 200, r.y + 40)) };
    })()`);
    for (let i = 0; i < 240; i++) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        ...point,
        deltaX: 0,
        deltaY: i < 120 ? -wheelPixels : wheelPixels,
      });
      await Bun.sleep(1000 / 120);
    }
  } else {
    await cdp.eval(
      `(() => { const e = document.querySelector('textarea[aria-label="Message"]'); if (!e) throw new Error('No composer'); e.focus(); })()`,
    );
    for (let i = 0; i < 30; i++) {
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'a',
        code: 'KeyA',
        text: 'a',
        windowsVirtualKeyCode: 65,
      });
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'a',
        code: 'KeyA',
        windowsVirtualKeyCode: 65,
      });
      await Bun.sleep(80);
    }
  }
}
