// Progresso do aluno, guardado no próprio aparelho (localStorage). Nada sai
// do celular: o app funciona offline e sem cadastro em servidor nenhum.

const CHAVE = 'msa.progresso.v1';

const vazio = () => ({
  versao: 1,
  aluno: { nome: '', criadoEm: null },
  fases: {},
  usadas: {},
  certificados: [],
  xp: 0,
});

let cache = null;

function ler() {
  if (cache) return cache;
  try {
    const bruto = localStorage.getItem(CHAVE);
    cache = bruto ? { ...vazio(), ...JSON.parse(bruto) } : vazio();
  } catch (erro) {
    cache = vazio();
  }
  return cache;
}

function gravar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(cache));
  } catch (erro) {
    // Aparelho sem espaço ou com armazenamento bloqueado: o app continua
    // funcionando nesta sessão, só não guarda o progresso.
    console.warn('Não foi possível guardar o progresso:', erro);
  }
}

export const progresso = () => ler();

export function definirAluno(nome) {
  const p = ler();
  p.aluno.nome = nome.trim();
  if (!p.aluno.criadoEm) p.aluno.criadoEm = new Date().toISOString();
  gravar();
  return p.aluno;
}

export function faseDoAluno(numero) {
  const p = ler();
  if (!p.fases[numero]) p.fases[numero] = { licoesLidas: [], jogos: {}, tentativas: [], aprovadoEm: null, melhorNota: 0 };
  return p.fases[numero];
}

export function marcarLicaoLida(fase, indice) {
  const f = faseDoAluno(fase);
  if (!f.licoesLidas.includes(indice)) {
    f.licoesLidas.push(indice);
    ler().xp += 5;
    gravar();
  }
}

export function registrarJogo(fase, tipo, pontos) {
  const f = faseDoAluno(fase);
  const anterior = f.jogos[tipo] || 0;
  if (pontos > anterior) {
    f.jogos[tipo] = pontos;
    ler().xp += Math.max(0, pontos - anterior);
  }
  gravar();
}

export function usadasDaFase(fase) {
  const p = ler();
  return p.usadas[fase] || [];
}

export function registrarUsadas(fase, assinaturas) {
  const p = ler();
  p.usadas[fase] = [...(p.usadas[fase] || []), ...assinaturas];
  gravar();
}

export function esquecerUsadas(fase, quantidade) {
  const p = ler();
  p.usadas[fase] = (p.usadas[fase] || []).slice(quantidade);
  gravar();
}

export function registrarTentativa(fase, tentativa) {
  const f = faseDoAluno(fase);
  f.tentativas.push(tentativa);
  f.melhorNota = Math.max(f.melhorNota || 0, tentativa.nota);
  if (tentativa.aprovado && !f.aprovadoEm) f.aprovadoEm = tentativa.data;
  ler().xp += tentativa.acertos * 10 + (tentativa.aprovado ? 50 : 0);
  gravar();
  return f;
}

export function guardarCertificado(certificado) {
  const p = ler();
  const existente = p.certificados.findIndex((c) => c.fase === certificado.fase);
  if (existente >= 0) p.certificados[existente] = certificado;
  else p.certificados.push(certificado);
  gravar();
}

export const certificados = () => ler().certificados;

export const faseAprovada = (numero) => Boolean(faseDoAluno(numero).aprovadoEm);

// Modo de demonstração: abre todas as fases para quem só quer experimentar o
// app. Vale enquanto a aba estiver aberta e não mexe no progresso guardado.
let modoTeste = false;

export function ativarModoTeste() {
  modoTeste = true;
  const p = ler();
  if (!p.aluno.nome) definirAluno('Aluno de teste');
}

export const emModoTeste = () => modoTeste;

// A fase 1 está sempre aberta; as demais abrem quando a anterior é aprovada.
export const faseLiberada = (numero) => numero === 1 || modoTeste || faseAprovada(numero - 1);

export function apagarTudo() {
  cache = vazio();
  try { localStorage.removeItem(CHAVE); } catch (erro) { /* nada a fazer */ }
}

export function exportar() {
  return JSON.stringify(ler(), null, 2);
}

export function importar(texto) {
  const dados = JSON.parse(texto);
  if (!dados || typeof dados !== 'object' || !('fases' in dados)) throw new Error('Arquivo de progresso inválido.');
  cache = { ...vazio(), ...dados };
  gravar();
  return cache;
}
