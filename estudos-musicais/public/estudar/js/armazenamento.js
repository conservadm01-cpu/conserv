// Fachada do armazenamento.
//
// Este arquivo tem a mesma cara de sempre: as telas continuam chamando
// `criarUsuario`, `faseDoAluno`, `registrarTentativa` exatamente como antes.
// O que mudou foi o que está por baixo. Onde havia um objetão único no
// localStorage, agora há entidades separadas — alunos, acessos, fases,
// progresso, resultados, certificados — atrás de repositórios (js/dados/).
//
// Por que manter a fachada em vez de mudar as telas: porque o aplicativo em
// uso não pode parar. Quem já tem progresso guardado abre o app, os dados são
// migrados uma única vez, e tudo continua funcionando. As telas migram para os
// repositórios aos poucos, sem pressa e sem risco.
//
// Duas mudanças de fundo, visíveis daqui:
//
//   Acesso e ficha são coisas diferentes. `usuarios()` devolve a ficha do
//   aluno junto com o que a tela precisa saber do acesso dele, mas no depósito
//   são duas entidades. Remover o acesso não apaga a ficha.
//
//   Não existe mais `senhaPadrao` gravado. Saber se a senha ainda é a de
//   fábrica é conferir o resumo, como se faz com qualquer senha.

import { CAMPOS_DA_FICHA, camposFaltando, fichaCompleta, fichaMinimaCompleta } from './ficha.js';
import * as R from './dados/repositorios.js';
import { autenticar, guardarSenha, normalizarLogin, senhaEhInicial, LOGIN_INICIAL, SENHA_INICIAL } from './dados/permissoes.js';
import { idDoAcesso, idDoCertificado, idDoProgresso, novoId } from './dados/ids.js';
import { CHAVE_V0, CHAVE_V1, depositoAtual } from './dados/deposito.js';
import { estadoVazio } from './dados/esquema.js';
import { semear } from './dados/semente.js';
import { VERSAO_DA_MIGRACAO, converterV1 } from './dados/migracao.js';

const CAMPOS = CAMPOS_DA_FICHA.map((c) => c.id);

export const escola = () => R.estadoAtual();

// Reexportado para quem precisa ir além da fachada (painel, relatórios).
export const dados = R;
export const pendenciasDoCadastro = () => R.pendenciasDoCadastro();
// Relê tudo do depósito, descartando o que estava em memória. É o que se faz
// depois de mexer no armazenamento por fora — outra aba, importação, testes.
export const recarregar = () => R.recarregar();
export const informacoesDaMigracao = () => R.informacoesDaMigracao();

// ------------------------------------------------------------------ o acesso

// O instrutor: o acesso de administrador. Se o cadastro ainda não tem nenhum
// (instalação nova), ele é criado aqui com o usuário e a senha de fábrica.
function acessoDoInstrutor() {
  const existente = R.usuarios.umPorCampo('papel', 'ADMIN');
  if (existente) return existente;
  return R.usuarios.criar({
    id: 'admin',
    login: LOGIN_INICIAL,
    papel: 'ADMIN',
    exigeSenha: true,
    ...guardarSenha(SENHA_INICIAL, 'admin'),
    alunoId: null,
    ativo: true,
  });
}

export const sessao = () => {
  const s = R.sessaoAtual();
  if (!s) return null;
  return s.papel === 'ALUNO' ? { tipo: 'aluno', id: s.alunoId } : { tipo: 'admin' };
};

export const ehAdmin = () => {
  const s = R.sessaoAtual();
  return Boolean(s && s.papel !== 'ALUNO');
};

const idDoAlunoNaSessao = () => {
  const s = R.sessaoAtual();
  return s && s.papel === 'ALUNO' ? s.alunoId : null;
};

export function alunoAtual() {
  const id = idDoAlunoNaSessao();
  return id ? usuarioPorId(id) : null;
}

export function entrarComoAdmin(usuario, senha) {
  const acesso = acessoDoInstrutor();
  if (normalizarLogin(usuario) !== normalizarLogin(acesso.login)) return false;
  if (!autenticar(acesso, senha)) return false;
  R.abrirSessao(acesso.id);
  return true;
}

export function entrarComoAluno(id, senha) {
  const aluno = R.alunos.buscar(id);
  if (!aluno) return false;
  const acesso = R.acessoDoAluno(id);
  if (!acesso) return false;
  if (!autenticar(acesso, senha)) return false;
  R.abrirSessao(acesso.id);
  return true;
}

export function sair() {
  R.fecharSessao();
}

export function trocarSenhaAdmin(novaSenha) {
  const acesso = acessoDoInstrutor();
  R.usuarios.atualizar(acesso.id, { exigeSenha: true, ...guardarSenha(novaSenha, acesso.sal) });
}

export const senhaDoAdminEhPadrao = () => senhaEhInicial(acessoDoInstrutor());

export const usuarioDoAdmin = () => acessoDoInstrutor().login;

export const permiteAutocadastro = () => R.configuracoes.obter('autocadastro', true) !== false;

export function definirAutocadastro(permitido) {
  R.configuracoes.definir('autocadastro', Boolean(permitido));
}

// ----------------------------------------------------------------- cadastro

// A tela conhece "um aluno": ficha e acesso na mesma linha. O depósito guarda
// as duas coisas separadas. Esta função junta as duas para a tela.
function comAcesso(aluno) {
  if (!aluno) return null;
  const acesso = R.acessoDoAluno(aluno.id);
  return {
    ...aluno,
    sal: acesso ? acesso.sal : aluno.id,
    senhaHash: acesso ? acesso.senhaHash : null,
    exigeSenha: Boolean(acesso && acesso.exigeSenha),
  };
}

export const usuarios = () =>
  R.alunos.listar().map(comAcesso).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

export const usuarioPorId = (id) => comAcesso(R.alunos.buscar(id));

const conferirNome = (nome, idAtual = null) => {
  const limpo = String(nome || '').trim();
  if (!limpo) throw new Error('O nome do aluno é obrigatório.');
  const repetido = R.alunos.listar()
    .some((a) => a.id !== idAtual && String(a.nome).toLowerCase() === limpo.toLowerCase());
  if (repetido) throw new Error('Já existe um aluno com esse nome.');
  return limpo;
};

export function criarUsuario(dados = {}) {
  const nome = conferirNome(dados.nome);
  const id = novoId('u');

  const ficha = { id, criadoEm: new Date().toISOString(), ativo: true };
  for (const campo of CAMPOS) ficha[campo] = String(dados[campo] || '').trim();
  ficha.nome = nome;
  const aluno = R.alunos.criar(ficha);

  const senha = dados.senha ? guardarSenha(dados.senha, id) : { sal: id, senhaHash: null };
  R.usuarios.criar({
    id: idDoAcesso(id),
    login: nome,
    papel: 'ALUNO',
    ...senha,
    exigeSenha: Boolean(dados.exigeSenha && senha.senhaHash),
    alunoId: id,
    ativo: true,
  });

  return comAcesso(aluno);
}

export function atualizarUsuario(id, dados = {}) {
  const aluno = R.alunos.buscar(id);
  if (!aluno) throw new Error('Aluno não encontrado.');

  const mudancas = {};
  if (dados.nome !== undefined) mudancas.nome = conferirNome(dados.nome, id);
  for (const campo of CAMPOS) {
    if (campo === 'nome' || dados[campo] === undefined) continue;
    mudancas[campo] = String(dados[campo] || '').trim();
  }
  // O instrumento digitado precisa reencontrar o cadastro do instrumento.
  if (mudancas.instrumento !== undefined) mudancas.instrumentoId = '';
  const atualizado = R.alunos.atualizar(id, mudancas);

  const acesso = R.acessoDoAluno(id) || R.usuarios.criar({
    id: idDoAcesso(id), login: atualizado.nome, papel: 'ALUNO', sal: id, senhaHash: null,
    exigeSenha: false, alunoId: id, ativo: true,
  });

  const noAcesso = {};
  if (mudancas.nome) noAcesso.login = mudancas.nome;
  if (dados.senha) Object.assign(noAcesso, guardarSenha(dados.senha, acesso.sal));
  if (dados.exigeSenha !== undefined) {
    const temSenha = Boolean(noAcesso.senhaHash || acesso.senhaHash);
    noAcesso.exigeSenha = Boolean(dados.exigeSenha && temSenha);
    // Deixar de exigir senha apaga o resumo guardado: nada de senha órfã
    // esperando ser reativada sem o aluno saber.
    if (!dados.exigeSenha) noAcesso.senhaHash = null;
  }
  if (Object.keys(noAcesso).length) R.usuarios.atualizar(acesso.id, noAcesso);

  return comAcesso(R.alunos.buscar(id));
}

export const fichaDoAlunoCompleta = (id = null) => fichaCompleta(id ? usuarioPorId(id) : alunoAtual());
export const fichaDoAlunoFaltando = (id = null) => camposFaltando(id ? usuarioPorId(id) : alunoAtual());
export const fichaDoAlunoLiberada = (id = null) => fichaMinimaCompleta(id ? usuarioPorId(id) : alunoAtual());

export function removerUsuario(id) {
  const acesso = R.acessoDoAluno(id);
  if (R.sessaoAtual() && R.sessaoAtual().alunoId === id) R.fecharSessao();
  for (const p of R.progressoDeTodasAsFases(id)) R.progressos.remover(p.id);
  for (const r of R.resultadosDoAluno(id)) R.resultados.remover(r.id);
  for (const c of R.certificadosDoAluno(id)) R.certificados.remover(c.id);
  if (acesso) R.usuarios.remover(acesso.id);
  R.alunos.remover(id);
}

// ---------------------------------------------------------------- progresso

// A tela ainda pede "o progresso do aluno" como um bloco só. Aqui ele é
// remontado a partir das linhas por fase — o formato de leitura continua o
// mesmo, mas a gravação já vai para a entidade certa.
export function progresso(id = null) {
  const alvo = id || idDoAlunoNaSessao();
  if (!alvo) return { fases: {}, usadas: {}, certificados: [], xp: 0 };

  const linhas = R.progressoDeTodasAsFases(alvo);
  const fases = {};
  const usadas = {};
  for (const linha of linhas) {
    fases[linha.faseId] = faseDoAluno(linha.faseId, alvo);
    usadas[linha.faseId] = linha.usadas;
  }
  const aluno = R.alunos.buscar(alvo);
  const xp = (aluno ? aluno.xpHistorico : 0) + linhas.reduce((soma, l) => soma + (l.xp || 0), 0);
  return { fases, usadas, certificados: R.certificadosDoAluno(alvo), xp };
}

const faseVazia = () => ({ licoesLidas: [], jogos: {}, tentativas: [], aprovadoEm: null, melhorNota: 0 });

export function faseDoAluno(faseId, id = null) {
  const alvo = id || idDoAlunoNaSessao();
  if (!alvo) return faseVazia();
  const linha = R.progressoDoAluno(alvo, faseId);
  return {
    licoesLidas: linha.licoesLidas,
    jogos: linha.jogos,
    tentativas: R.resultadosDoAluno(alvo, faseId),
    aprovadoEm: linha.aprovadoEm,
    melhorNota: linha.melhorNota,
  };
}

// Soma pontos na fase em que foram ganhos. O total do aluno é o histórico
// anterior à atualização mais o que ele somou fase a fase.
function pontuar(linha, pontos) {
  linha.xp = (linha.xp || 0) + pontos;
}

export function marcarLicaoLida(faseId, indice) {
  const alvo = idDoAlunoNaSessao();
  if (!alvo) return;
  const linha = R.progressoDoAluno(alvo, faseId);
  if (linha.licoesLidas.includes(indice)) return;
  linha.licoesLidas.push(indice);
  pontuar(linha, 5);
  linha.atualizadoEm = new Date().toISOString();
  R.progressos.salvar(linha);
}

export function registrarJogo(faseId, tipo, pontos) {
  const alvo = idDoAlunoNaSessao();
  if (!alvo) return;
  const linha = R.progressoDoAluno(alvo, faseId);
  const anterior = linha.jogos[tipo] || 0;
  if (pontos > anterior) {
    linha.jogos[tipo] = pontos;
    pontuar(linha, Math.max(0, pontos - anterior));
  }
  linha.atualizadoEm = new Date().toISOString();
  R.progressos.salvar(linha);
}

export function usadasDaFase(faseId) {
  const alvo = idDoAlunoNaSessao();
  return alvo ? R.progressoDoAluno(alvo, faseId).usadas : [];
}

export function registrarUsadas(faseId, assinaturas) {
  const alvo = idDoAlunoNaSessao();
  if (!alvo) return;
  const linha = R.progressoDoAluno(alvo, faseId);
  linha.usadas = [...linha.usadas, ...assinaturas];
  R.progressos.salvar(linha);
}

export function registrarTentativa(faseId, tentativa) {
  const alvo = idDoAlunoNaSessao();
  if (!alvo) return faseVazia();

  const linha = R.progressoDoAluno(alvo, faseId);
  R.resultados.criar({
    alunoId: alvo,
    faseId: String(faseId),
    avaliacaoId: `av-${faseId}`,
    data: tentativa.data,
    nota: tentativa.nota,
    acertos: tentativa.acertos,
    total: tentativa.total,
    aprovado: tentativa.aprovado,
    respostas: tentativa.respostas || [],
  });

  linha.melhorNota = Math.max(linha.melhorNota || 0, tentativa.nota);
  if (tentativa.aprovado && !linha.aprovadoEm) linha.aprovadoEm = tentativa.data;
  pontuar(linha, tentativa.acertos * 10 + (tentativa.aprovado ? 50 : 0));
  linha.atualizadoEm = new Date().toISOString();
  R.progressos.salvar(linha);

  return faseDoAluno(faseId, alvo);
}

export function guardarCertificado(certificado) {
  const alvo = idDoAlunoNaSessao();
  if (!alvo) return;
  R.certificados.salvar({
    ...certificado,
    id: idDoCertificado(alvo, String(certificado.faseId)),
    alunoId: alvo,
    faseId: String(certificado.faseId),
  });
}

export const certificados = (id = null) => {
  const alvo = id || idDoAlunoNaSessao();
  return alvo ? R.certificadosDoAluno(alvo) : [];
};

export function faseAprovada(faseId, id = null) {
  const alvo = id || idDoAlunoNaSessao();
  if (!alvo) return false;
  const linha = R.progressos.buscar(idDoProgresso(alvo, String(faseId)));
  return Boolean(linha && linha.aprovadoEm);
}

// ------------------------------------------------------------ demonstração

let modoTeste = false;

export function ativarModoTeste() {
  modoTeste = true;
  if (R.sessaoAtual()) return;
  let demo = R.alunos.listar((a) => a.nome === 'Aluno de teste')[0];
  if (!demo) {
    demo = criarUsuario({
      nome: 'Aluno de teste', comum: 'Comum de demonstração', instrumento: 'violino',
      encarregadoLocal: 'Encarregado local (exemplo)', encarregadoRegional: 'Encarregado regional (exemplo)',
      anciao: 'Ancião (exemplo)', email: 'demonstracao@exemplo.com', whatsapp: '(11) 90000-0000',
    });
  }
  const acesso = R.acessoDoAluno(demo.id);
  if (acesso) R.abrirSessao(acesso.id);
}

export const emModoTeste = () => modoTeste;

// A primeira fase de cada método está sempre aberta; as demais abrem quando a
// anterior daquele mesmo método é aprovada. A regra não conhece quantas fases
// o método tem — serve igual para um de 10, de 16 ou de 20.
export function faseLiberada(fase) {
  if (modoTeste || fase.numero === 1 || fase.ordem === 1) return true;
  return fase.anteriorId ? faseAprovada(fase.anteriorId) : true;
}

// -------------------------------------------------------- painel e arquivos

export function resumoDoAluno(id) {
  const linhas = R.progressoDeTodasAsFases(id);
  const tentativas = R.resultadosDoAluno(id);
  const ultima = tentativas.map((t) => t.data).sort().pop() || null;
  const aluno = R.alunos.buscar(id);
  return {
    aprovadas: linhas.filter((l) => l.aprovadoEm).length,
    licoes: linhas.reduce((soma, l) => soma + l.licoesLidas.length, 0),
    certificados: R.certificadosDoAluno(id).length,
    tentativas: tentativas.length,
    xp: (aluno ? aluno.xpHistorico : 0) + linhas.reduce((soma, l) => soma + (l.xp || 0), 0),
    ultimaAtividade: ultima,
  };
}

export function apagarTudo() {
  const deposito = depositoAtual();
  deposito.remover();
  if (deposito.removerChave) {
    deposito.removerChave(CHAVE_V1);
    deposito.removerChave(CHAVE_V0);
  }
  const limpo = { ...estadoVazio(), ...semear() };
  limpo.migracao = { versao: VERSAO_DA_MIGRACAO, migradoEm: new Date().toISOString(), origem: null, backup: null, registros: 0 };
  R.definirEstado(limpo);
}

export function exportar() {
  return JSON.stringify(R.estadoAtual(), null, 2);
}

export function importar(texto) {
  const dados = JSON.parse(texto);
  if (!dados || typeof dados !== 'object') throw new Error('Arquivo inválido: não parece uma cópia deste aplicativo.');

  // Arquivo do V2: entra como está.
  if (Array.isArray(dados.alunos) && Array.isArray(dados.progressos)) {
    R.definirEstado({ ...dados, sessao: null });
    return R.estadoAtual();
  }

  // Arquivo gravado pela versão anterior do aplicativo: é convertido na
  // entrada, do mesmo jeito que os dados do próprio aparelho foram.
  if (Array.isArray(dados.usuarios) && dados.progressos && typeof dados.progressos === 'object') {
    const convertido = converterV1(dados);
    convertido.migracao = {
      versao: VERSAO_DA_MIGRACAO, migradoEm: new Date().toISOString(),
      origem: 'arquivo', backup: null, registros: convertido.alunos.length,
    };
    R.definirEstado({ ...convertido, sessao: null });
    return R.estadoAtual();
  }

  throw new Error('Arquivo inválido: não parece uma cópia deste aplicativo.');
}
