let ctx: AudioContext | null = null;
let enabled = true; // настройка пользователя
let suspended = false; // системная пауза: потеря фокуса, реклама, пауза платформы

export function setSoundEnabled(v: boolean) {
  enabled = v;
  if (!v) hardSuspend();
}

/**
 * Требование 1.3: при потере фокуса звук из игры останавливается.
 * Требование 4.7: при показе рекламы звук ставится на паузу.
 */
export function setSoundSuspended(v: boolean) {
  suspended = v;
  if (v) hardSuspend();
}

function hardSuspend() {
  try {
    if (ctx && ctx.state === "running") void ctx.suspend();
  } catch {
    /* noop */
  }
}

function ac(): AudioContext | null {
  if (!enabled || suspended || typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, dur: number, gain: number, type: OscillatorType = "square", when = 0) {
  const c = ac();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + when);
  g.gain.setValueAtTime(gain, c.currentTime + when);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + when + dur);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + when);
  osc.stop(c.currentTime + when + dur + 0.02);
}

export function sfxClick(crit: boolean) {
  blip(crit ? 660 : 210, 0.07, crit ? 0.09 : 0.05, "square");
  if (crit) blip(990, 0.12, 0.08, "sawtooth", 0.04);
}

export function sfxBuy() {
  blip(320, 0.09, 0.07, "triangle");
  blip(480, 0.12, 0.07, "triangle", 0.08);
}

export function sfxWin() {
  [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.16, 0.08, "triangle", i * 0.09));
}

export function sfxSpin() {
  blip(180, 0.05, 0.04, "square");
}

export function sfxFail() {
  blip(160, 0.18, 0.06, "sawtooth");
}
