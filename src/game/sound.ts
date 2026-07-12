// Alertas sonoros simples via WebAudio (sem assets externos).
let ctx: AudioContext | null = null;

function beep(freq: number, dur: number, type: OscillatorType, when = 0, vol = 0.2) {
  ctx = ctx ?? new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ctx.currentTime + when);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + when);
  osc.stop(ctx.currentTime + when + dur);
}

// Gol a favor: fanfarra ascendente
export function playGoal() {
  beep(523, 0.15, "square");
  beep(659, 0.15, "square", 0.13);
  beep(784, 0.3, "square", 0.26);
}

// Gol sofrido: descendente e grave, para diferenciar claramente do gol a favor
export function playGoalConceded() {
  beep(392, 0.15, "square");
  beep(311, 0.15, "square", 0.13);
  beep(233, 0.35, "square", 0.26);
}

// Cartão vermelho: buzina grave dupla
export function playRed() {
  beep(220, 0.25, "sawtooth");
  beep(180, 0.4, "sawtooth", 0.28);
}

// Pênalti marcado: apito longo e agudo do árbitro
export function playWhistle() {
  beep(1800, 0.12, "square", 0, 0.15);
  beep(1800, 0.35, "square", 0.14, 0.15);
}
