// Som do app: notas, metrônomo e efeitos, feitos na hora com Web Audio.
// Sem arquivos de áudio, para o app continuar leve e funcionar offline.

let contexto = null;

export function contextoDeAudio() {
  if (!contexto) {
    const Classe = window.AudioContext || window.webkitAudioContext;
    if (!Classe) return null;
    contexto = new Classe();
  }
  if (contexto.state === 'suspended') contexto.resume();
  return contexto;
}

export const audioDisponivel = () => Boolean(window.AudioContext || window.webkitAudioContext);

const SEMITONS = { 'Dó': 0, 'Ré': 2, 'Mi': 4, 'Fá': 5, 'Sol': 7, 'Lá': 9, 'Si': 11 };

export function frequencia(letra, oitava = 4, alteracao = 0) {
  const semitom = SEMITONS[letra] + alteracao + (oitava - 4) * 12;
  // Lá4 = 440 Hz e está 9 semitons acima do Dó4.
  return 440 * Math.pow(2, (semitom - 9) / 12);
}

export function tocarFrequencia(hz, { duracao = 0.6, volume = 0.25, timbre = 'triangle', atraso = 0 } = {}) {
  const ctx = contextoDeAudio();
  if (!ctx) return;
  const inicio = ctx.currentTime + atraso;
  const oscilador = ctx.createOscillator();
  const ganho = ctx.createGain();
  oscilador.type = timbre;
  oscilador.frequency.value = hz;
  ganho.gain.setValueAtTime(0.0001, inicio);
  ganho.gain.exponentialRampToValueAtTime(volume, inicio + 0.02);
  ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
  oscilador.connect(ganho).connect(ctx.destination);
  oscilador.start(inicio);
  oscilador.stop(inicio + duracao + 0.05);
}

export const tocarNota = (letra, oitava = 4, opcoes = {}) => tocarFrequencia(frequencia(letra, oitava, opcoes.alteracao || 0), opcoes);

export function tocarSequencia(notas, { intervalo = 0.55, duracao = 0.5, volume = 0.25 } = {}) {
  notas.forEach((n, i) => tocarFrequencia(
    typeof n === 'number' ? n : frequencia(n.letra, n.oitava ?? 4, n.alteracao || 0),
    { duracao, volume, atraso: i * intervalo },
  ));
}

export function efeito(tipo) {
  if (tipo === 'acerto') tocarSequencia([frequencia('Dó', 5), frequencia('Mi', 5), frequencia('Sol', 5)], { intervalo: 0.09, duracao: 0.18, volume: 0.2 });
  else if (tipo === 'erro') tocarSequencia([frequencia('Si', 3), frequencia('Fá', 3)], { intervalo: 0.13, duracao: 0.25, volume: 0.18 });
  else if (tipo === 'vitoria') tocarSequencia([frequencia('Dó', 5), frequencia('Mi', 5), frequencia('Sol', 5), frequencia('Dó', 6)], { intervalo: 0.14, duracao: 0.3, volume: 0.22 });
}

// Metrônomo agendado no relógio do áudio, que não escorrega como o setInterval.
export class Metronomo {
  constructor({ bpm = 80, porCompasso = 4, aoBater = null } = {}) {
    this.bpm = bpm;
    this.porCompasso = porCompasso;
    this.aoBater = aoBater;
    this.tocando = false;
    this.batida = 0;
    this.proxima = 0;
    this.timer = null;
  }

  clique(forte, quando) {
    const ctx = contextoDeAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.frequency.value = forte ? 1600 : 1000;
    ganho.gain.setValueAtTime(forte ? 0.35 : 0.2, quando);
    ganho.gain.exponentialRampToValueAtTime(0.0001, quando + 0.06);
    osc.connect(ganho).connect(ctx.destination);
    osc.start(quando);
    osc.stop(quando + 0.08);
  }

  comecar() {
    const ctx = contextoDeAudio();
    if (!ctx || this.tocando) return;
    this.tocando = true;
    this.batida = 0;
    this.proxima = ctx.currentTime + 0.12;
    const agendar = () => {
      if (!this.tocando) return;
      while (this.proxima < ctx.currentTime + 0.2) {
        const forte = this.batida % this.porCompasso === 0;
        this.clique(forte, this.proxima);
        if (this.aoBater) this.aoBater(this.batida, forte, this.proxima);
        this.batida++;
        this.proxima += 60 / this.bpm;
      }
      this.timer = setTimeout(agendar, 60);
    };
    agendar();
  }

  parar() {
    this.tocando = false;
    clearTimeout(this.timer);
  }

  ajustar(bpm) {
    this.bpm = bpm;
  }
}
