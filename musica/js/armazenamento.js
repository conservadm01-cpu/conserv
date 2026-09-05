// Cadastro e progresso, guardados no próprio aparelho (localStorage).
// Uma "escola" por aparelho: o instrutor (administrador) cadastra os alunos,
// cada aluno tem o seu instrumento, a sua senha e o seu progresso separado.
// Nada sai do celular: não há servidor nem envio de dados.

import { conferirSenha, criarHash } from './senha.js';

const CHAVE = 'msa.escola.v1';
const CHAVE_ANTIGA = 'msa.progresso.v1';

const ADMIN_PADRAO = { usuario: 'RENATO', senha: 'CCB123' };

const progressoVazio = () => ({ fases: {}, usadas: {}, certificados: [], xp: 0 });

const vazio = () => ({
  versao: 2,
  admin: {
    usuario: ADMIN_PADRAO.usuario,
    sal: 'admin',
    senhaHash: criarHash(ADMIN_PADRAO.senha, 'admin'),
    senhaPadrao: true,
  },
  usuarios: [],
  progressos: {},
  config: { autocadastro: true },
  sessao: null,
});

let cache = null;

const novoId = () => `u${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36).padStart(3, '0')}`;

function ler() {
  if (cache) return cache;
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) {
      cache = { ...vazio(), ...JSON.parse(bruto) };
    } else {
      cache = vazio();
      migrarDaVersaoAntiga();
    }
  } catch (erro) {
    cache = vazio();
  }
  return cache;
}

// Quem já usava o app antes do cadastro vira o primeiro aluno, sem senha,
// com o progresso que tinha.
function migrarDaVersaoAntiga() {
  try {
    const bruto = localStorage.getItem(CHAVE_ANTIGA);
    if (!bruto) return;
    const antigo = JSON.parse(bruto);
    if (!antigo || !antigo.aluno || !antigo.aluno.nome) return;
    const id = novoId();
    cache.usuarios.push({
      id, nome: antigo.aluno.nome, instrumento: '', exigeSenha: false, sal: id, senhaHash: null,
      criadoEm: antigo.aluno.criadoEm || new Date().toISOString(),
    });
    cache.progressos[id] = {
      fases: antigo.fases || {}, usadas: antigo.usadas || {},
      certificados: (antigo.certificados || []).map((c) => ({ ...c, faseId: c.faseId || String(c.fase), trilha: c.trilha || 'msa' })),
      xp: antigo.xp || 0,
    };
    gravar();
  } catch (erro) {
    // Progresso antigo ilegível: começa limpo, sem travar o app.
  }
}

function gravar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(cache));
  } catch (erro) {
    // Aparelho sem espaço ou com armazenamento bloqueado: o app continua
    // funcionando nesta sessão, só não guarda o que foi feito.
    console.warn('Não foi possível guardar os dados:', erro);
  }
}

export const escola = () => ler();

// ------------------------------------------------------------------ sessão

export const sessao = () => ler().sessao;
export const ehAdmin = () => Boolean(ler().sessao && ler().sessao.tipo === 'admin');

export function alunoAtual() {
  const s = ler().sessao;
  if (!s || s.tipo !== 'aluno') return null;
  return ler().usuarios.find((u) => u.id === s.id) || null;
}

export function entrarComoAdmin(usuario, senha) {
  const { admin } = ler();
  const nomeConfere = String(usuario || '').trim().toLowerCase() === admin.usuario.toLowerCase();
  if (!nomeConfere || !conferirSenha(senha, admin.sal, admin.senhaHash)) return false;
  ler().sessao = { tipo: 'admin' };
  gravar();
  return true;
}

export function entrarComoAluno(id, senha) {
  const usuario = ler().usuarios.find((u) => u.id === id);
  if (!usuario) return false;
  if (usuario.exigeSenha && !conferirSenha(senha, usuario.sal, usuario.senhaHash)) return false;
  ler().sessao = { tipo: 'aluno', id };
  gravar();
  return true;
}

export function sair() {
  ler().sessao = null;
  gravar();
}

export function trocarSenhaAdmin(novaSenha) {
  const p = ler();
  p.admin.senhaHash = criarHash(novaSenha, p.admin.sal);
  p.admin.senhaPadrao = false;
  gravar();
}

export const senhaDoAdminEhPadrao = () => Boolean(ler().admin.senhaPadrao);

export const permiteAutocadastro = () => (ler().config || { autocadastro: true }).autocadastro !== false;

export function definirAutocadastro(permitido) {
  const p = ler();
  p.config = { ...(p.config || {}), autocadastro: Boolean(permitido) };
  gravar();
}
export const usuarioDoAdmin = () => ler().admin.usuario;

// ----------------------------------------------------------------- cadastro

export const usuarios = () => ler().usuarios.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

export const usuarioPorId = (id) => ler().usuarios.find((u) => u.id === id) || null;

export function criarUsuario({ nome, instrumento = '', exigeSenha = false, senha = '' }) {
  const limpo = String(nome || '').trim();
  if (!limpo) throw new Error('O nome do aluno é obrigatório.');
  const p = ler();
  if (p.usuarios.some((u) => u.nome.toLowerCase() === limpo.toLowerCase())) {
    throw new Error('Já existe um aluno com esse nome.');
  }
  const id = novoId();
  const usuario = {
    id, nome: limpo, instrumento, exigeSenha: Boolean(exigeSenha && senha), sal: id,
    senhaHash: exigeSenha && senha ? criarHash(senha, id) : null,
    criadoEm: new Date().toISOString(),
  };
  p.usuarios.push(usuario);
  p.progressos[id] = progressoVazio();
  gravar();
  return usuario;
}

export function atualizarUsuario(id, { nome, instrumento, exigeSenha, senha }) {
  const usuario = usuarioPorId(id);
  if (!usuario) throw new Error('Aluno não encontrado.');
  if (nome !== undefined) {
    const limpo = String(nome).trim();
    if (!limpo) throw new Error('O nome do aluno é obrigatório.');
    if (ler().usuarios.some((u) => u.id !== id && u.nome.toLowerCase() === limpo.toLowerCase())) {
      throw new Error('Já existe um aluno com esse nome.');
    }
    usuario.nome = limpo;
  }
  if (instrumento !== undefined) usuario.instrumento = instrumento;
  if (senha) usuario.senhaHash = criarHash(senha, usuario.sal);
  if (exigeSenha !== undefined) {
    usuario.exigeSenha = Boolean(exigeSenha && usuario.senhaHash);
    if (!exigeSenha) usuario.senhaHash = null;
  }
  gravar();
  return usuario;
}

export function removerUsuario(id) {
  const p = ler();
  p.usuarios = p.usuarios.filter((u) => u.id !== id);
  delete p.progressos[id];
  if (p.sessao && p.sessao.tipo === 'aluno' && p.sessao.id === id) p.sessao = null;
  gravar();
}

// ---------------------------------------------------------------- progresso

function progressoDe(id) {
  const p = ler();
  if (!p.progressos[id]) p.progressos[id] = progressoVazio();
  return p.progressos[id];
}

export function progresso(id = null) {
  const alvo = id || (ler().sessao && ler().sessao.tipo === 'aluno' ? ler().sessao.id : null);
  return alvo ? progressoDe(alvo) : progressoVazio();
}

export function faseDoAluno(faseId, id = null) {
  const p = progresso(id);
  const chave = String(faseId);
  if (!p.fases[chave]) p.fases[chave] = { licoesLidas: [], jogos: {}, tentativas: [], aprovadoEm: null, melhorNota: 0 };
  return p.fases[chave];
}

export function marcarLicaoLida(faseId, indice) {
  const f = faseDoAluno(faseId);
  if (!f.licoesLidas.includes(indice)) {
    f.licoesLidas.push(indice);
    progresso().xp += 5;
    gravar();
  }
}

export function registrarJogo(faseId, tipo, pontos) {
  const f = faseDoAluno(faseId);
  const anterior = f.jogos[tipo] || 0;
  if (pontos > anterior) {
    f.jogos[tipo] = pontos;
    progresso().xp += Math.max(0, pontos - anterior);
  }
  gravar();
}

export const usadasDaFase = (faseId) => progresso().usadas[String(faseId)] || [];

export function registrarUsadas(faseId, assinaturas) {
  const p = progresso();
  const chave = String(faseId);
  p.usadas[chave] = [...(p.usadas[chave] || []), ...assinaturas];
  gravar();
}

export function registrarTentativa(faseId, tentativa) {
  const f = faseDoAluno(faseId);
  f.tentativas.push(tentativa);
  f.melhorNota = Math.max(f.melhorNota || 0, tentativa.nota);
  if (tentativa.aprovado && !f.aprovadoEm) f.aprovadoEm = tentativa.data;
  progresso().xp += tentativa.acertos * 10 + (tentativa.aprovado ? 50 : 0);
  gravar();
  return f;
}

export function guardarCertificado(certificado) {
  const p = progresso();
  const existente = p.certificados.findIndex((c) => c.faseId === certificado.faseId);
  if (existente >= 0) p.certificados[existente] = certificado;
  else p.certificados.push(certificado);
  gravar();
}

export const certificados = (id = null) => progresso(id).certificados;

export const faseAprovada = (faseId, id = null) => Boolean(faseDoAluno(faseId, id).aprovadoEm);

// ------------------------------------------------------------ demonstração

let modoTeste = false;

export function ativarModoTeste() {
  modoTeste = true;
  const p = ler();
  if (p.sessao) return;
  let demo = p.usuarios.find((u) => u.nome === 'Aluno de teste');
  if (!demo) demo = criarUsuario({ nome: 'Aluno de teste', instrumento: 'violino' });
  p.sessao = { tipo: 'aluno', id: demo.id };
  gravar();
}

export const emModoTeste = () => modoTeste;

// A fase 1 de cada trilha está sempre aberta; as demais abrem quando a
// anterior daquela mesma trilha é aprovada.
export function faseLiberada(fase) {
  if (modoTeste || fase.numero === 1) return true;
  return fase.anteriorId ? faseAprovada(fase.anteriorId) : true;
}

// -------------------------------------------------------- painel e arquivos

export function resumoDoAluno(id) {
  const p = progressoDe(id);
  const fases = Object.entries(p.fases);
  const tentativas = fases.flatMap(([, f]) => f.tentativas || []);
  const ultima = tentativas.map((t) => t.data).sort().pop() || null;
  return {
    aprovadas: fases.filter(([, f]) => f.aprovadoEm).length,
    licoes: fases.reduce((soma, [, f]) => soma + f.licoesLidas.length, 0),
    certificados: p.certificados.length,
    tentativas: tentativas.length,
    xp: p.xp,
    ultimaAtividade: ultima,
  };
}

export function apagarTudo() {
  cache = vazio();
  try {
    localStorage.removeItem(CHAVE);
    localStorage.removeItem(CHAVE_ANTIGA);
  } catch (erro) { /* nada a fazer */ }
}

export function exportar() {
  return JSON.stringify(ler(), null, 2);
}

export function importar(texto) {
  const dados = JSON.parse(texto);
  if (!dados || typeof dados !== 'object' || !('usuarios' in dados) || !('progressos' in dados)) {
    throw new Error('Arquivo inválido: não parece uma cópia deste aplicativo.');
  }
  cache = { ...vazio(), ...dados, sessao: null };
  gravar();
  return cache;
}
