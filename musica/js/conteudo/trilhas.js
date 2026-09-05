// As duas trilhas do aluno: a teoria do MSA e o método do seu instrumento.
// Cada fase ganha aqui o seu identificador ('1' a '10' no MSA, 'inst1' a
// 'inst4' no instrumento) e a fase que precisa ser aprovada antes dela.

import { FASES } from './fases.js';
import { FASES_INSTRUMENTO } from './fases-instrumento.js';
import { instrumentoPorId } from './instrumentos.js';

const fasesDoMsa = () => FASES.map((f, i) => ({
  ...f,
  id: String(f.numero),
  trilha: 'msa',
  nomeTrilha: 'Teoria — MSA',
  anteriorId: i > 0 ? String(FASES[i - 1].numero) : null,
  contexto: null,
}));

const fasesDoInstrumento = (instrumento) => (instrumento ? FASES_INSTRUMENTO.map((f, i) => ({
  ...f,
  numero: f.ordem,
  trilha: 'instrumento',
  nomeTrilha: `Método — ${instrumento.nome}`,
  paginas: null,
  anteriorId: i > 0 ? FASES_INSTRUMENTO[i - 1].id : null,
  contexto: instrumento,
  instrumento: instrumento.nome,
})) : []);

export function trilhasDoAluno(instrumentoId) {
  const instrumento = instrumentoPorId(instrumentoId);
  const msa = fasesDoMsa();
  const doInstrumento = fasesDoInstrumento(instrumento);
  return { msa, instrumento: doInstrumento, todas: [...msa, ...doInstrumento], dadosDoInstrumento: instrumento };
}

export const faseporId = (id, instrumentoId) =>
  trilhasDoAluno(instrumentoId).todas.find((f) => f.id === String(id)) || null;

export const TOTAL_DE_FASES_MSA = FASES.length;
export const TOTAL_DE_FASES_INSTRUMENTO = FASES_INSTRUMENTO.length;
