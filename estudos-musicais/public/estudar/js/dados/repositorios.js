// Repositórios: um por entidade.
//
// Esta é a única camada que conhece o formato do estado. As telas pedem
// "os alunos", "a fase tal", "o progresso deste aluno nesta fase" — e não
// sabem, nem precisam saber, se por baixo há localStorage, um arquivo ou um
// servidor. Trocar o depósito não muda uma linha aqui em cima.

import { criarDepositoLocal, definirDeposito, depositoAtual } from './deposito.js';
import {
  ENTIDADES, completarEstado, impedimentos, pendencias,
  validarAlunos, validarAvaliacoes, validarExercicios, validarFases, validarInstrumentos,
  validarJogos, validarLicoes, validarMetodos, validarQuestoes, validarUsuarios,
} from './esquema.js';
import { NORMALIZADORES } from './compatibilidade.js';
import { migrarDadosV1ParaV2 } from './migracao.js';
import { idDoProgresso, novoId } from './ids.js';

let estado = null;

// ------------------------------------------------------------ carga e gravação

// Na primeira leitura o aplicativo migra o que houver do V1 (uma única vez) e
// deixa o estado pronto na memória. Toda chamada seguinte usa o que está em
// memória; o depósito só é tocado para gravar.
export function estadoAtual() {
  if (!estado) {
    const resultado = migrarDadosV1ParaV2(depositoAtual());
    estado = completarEstado(resultado.estado);
  }
  return estado;
}

export function gravar() {
  if (!estado) return false;
  return depositoAtual().gravar(estado);
}

// Recomeça do zero a partir do depósito. Usado pelos testes e depois de
// importar um arquivo.
export function recarregar() {
  estado = null;
  return estadoAtual();
}

// Troca o depósito em uso — é o ponto de entrada para os testes e para o dia
// em que os dados forem para um servidor.
export function usarDeposito(deposito = criarDepositoLocal()) {
  definirDeposito(deposito);
  estado = null;
  return estadoAtual();
}

export function definirEstado(novo) {
  estado = completarEstado(novo);
  gravar();
  return estado;
}

export const informacoesDaMigracao = () => estadoAtual().migracao;

// ------------------------------------------------------------------ validação

const VALIDADORES = {
  instrumentos: (e) => validarInstrumentos(e.instrumentos),
  metodos: (e) => validarMetodos(e.metodos, e.instrumentos),
  fases: (e) => validarFases(e.fases, e.metodos),
  licoes: (e) => validarLicoes(e.licoes, e.fases),
  exercicios: (e) => validarExercicios(e.exercicios, e.licoes),
  jogos: (e) => validarJogos(e.jogos, e.fases),
  avaliacoes: (e) => validarAvaliacoes(e.avaliacoes, e.fases),
  questoes: (e) => validarQuestoes(e.questoes, e.avaliacoes),
  alunos: (e) => validarAlunos(e.alunos, e.instrumentos),
  usuarios: (e) => validarUsuarios(e.usuarios, e.alunos),
};

// Recusa a gravação quando o registro quebra a estrutura (id repetido, fase
// sem método, senha em texto). O registro apenas incompleto entra e fica
// pendente de conferência — é o que permite cadastrar o aluno primeiro e
// completar a ficha depois, como o aplicativo sempre fez.
function conferir(nome, id) {
  const validar = VALIDADORES[nome];
  if (!validar) return;
  const problemas = impedimentos(validar(estadoAtual()).filter((p) => p.id === id));
  if (problemas.length) throw new Error(problemas[0].mensagem);
}

// Tudo o que está incompleto no cadastro, para a lista de pendências do
// painel. Não trava nada: informa.
export function pendenciasDoCadastro() {
  const e = estadoAtual();
  return pendencias(Object.values(VALIDADORES).flatMap((validar) => validar(e)));
}

// Tudo o que quebra a estrutura. Deve estar sempre vazio; serve de conferência
// depois de importar um arquivo ou de migrar.
export function problemasDeEstrutura() {
  const e = estadoAtual();
  return impedimentos(Object.values(VALIDADORES).flatMap((validar) => validar(e)));
}

// --------------------------------------------------------- fábrica de repositório

function criarRepositorio(nome, { prefixo = nome.slice(0, 1), validar = true } = {}) {
  const definicao = ENTIDADES[nome];
  const chave = definicao.chavePrimaria;
  // O aluno é normalizado com o catálogo de instrumentos à mão: é assim que o
  // instrumento digitado ("violino") reencontra o instrumento cadastrado e o
  // registro ganha o seu instrumentoId.
  const base = NORMALIZADORES[nome] || ((x) => ({ ...x }));
  const normalizar = nome === 'alunos'
    ? (linha) => base(linha, { instrumentos: estadoAtual().instrumentos })
    : base;
  const colecao = () => estadoAtual()[nome];

  return {
    nome,
    listar(filtro = null) {
      const tudo = colecao();
      return filtro ? tudo.filter(filtro) : tudo.slice();
    },
    buscar(id) {
      return colecao().find((r) => r[chave] === id) || null;
    },
    porCampo(campo, valor) {
      return colecao().filter((r) => r[campo] === valor);
    },
    umPorCampo(campo, valor) {
      return colecao().find((r) => r[campo] === valor) || null;
    },
    contar(filtro = null) {
      return filtro ? colecao().filter(filtro).length : colecao().length;
    },
    criar(dados = {}) {
      const id = dados[chave] || novoId(prefixo);
      const registro = normalizar({ ...dados, [chave]: id });
      colecao().push(registro);
      if (validar) {
        try {
          conferir(nome, id);
        } catch (erro) {
          // Registro recusado: sai da coleção como se nunca tivesse entrado.
          const posicao = colecao().findIndex((r) => r[chave] === id);
          if (posicao >= 0) colecao().splice(posicao, 1);
          throw erro;
        }
      }
      gravar();
      return registro;
    },
    atualizar(id, mudancas = {}) {
      const colecaoAtual = colecao();
      const posicao = colecaoAtual.findIndex((r) => r[chave] === id);
      if (posicao < 0) throw new Error(`${definicao.nome}: registro "${id}" não encontrado.`);
      const anterior = colecaoAtual[posicao];
      colecaoAtual[posicao] = normalizar({ ...anterior, ...mudancas, [chave]: id });
      if (validar) {
        try {
          conferir(nome, id);
        } catch (erro) {
          colecaoAtual[posicao] = anterior;   // desfaz a alteração recusada
          throw erro;
        }
      }
      gravar();
      return colecaoAtual[posicao];
    },
    // Grava sem validar. Só para o progresso e para os registros que o próprio
    // aplicativo produz durante o estudo, onde não há formulário para corrigir.
    salvar(registro) {
      const colecaoAtual = colecao();
      const id = registro[chave];
      const posicao = colecaoAtual.findIndex((r) => r[chave] === id);
      if (posicao >= 0) colecaoAtual[posicao] = registro;
      else colecaoAtual.push(registro);
      gravar();
      return registro;
    },
    remover(id) {
      const colecaoAtual = colecao();
      const posicao = colecaoAtual.findIndex((r) => r[chave] === id);
      if (posicao < 0) return false;
      colecaoAtual.splice(posicao, 1);
      gravar();
      return true;
    },
    substituirTudo(linhas) {
      estadoAtual()[nome] = linhas.map(normalizar);
      gravar();
      return estadoAtual()[nome];
    },
  };
}

// ----------------------------------------------------------------- as entidades

export const instrumentos = criarRepositorio('instrumentos', { prefixo: 'i' });
export const metodos = criarRepositorio('metodos', { prefixo: 'm' });
export const fases = criarRepositorio('fases', { prefixo: 'f' });
export const licoes = criarRepositorio('licoes', { prefixo: 'l' });
export const exercicios = criarRepositorio('exercicios', { prefixo: 'e' });
export const jogos = criarRepositorio('jogos', { prefixo: 'j' });
export const avaliacoes = criarRepositorio('avaliacoes', { prefixo: 'av' });
export const questoes = criarRepositorio('questoes', { prefixo: 'q' });
export const alunos = criarRepositorio('alunos', { prefixo: 'u' });
export const usuarios = criarRepositorio('usuarios', { prefixo: 'ac' });
export const progressos = criarRepositorio('progressos', { prefixo: 'p', validar: false });
export const resultados = criarRepositorio('resultados', { prefixo: 'r', validar: false });
export const certificados = criarRepositorio('certificados', { prefixo: 'c', validar: false });

// ------------------------------------------------------- consultas compostas

// As fases de um método, na ordem. É por aqui que um método com 10, 16 ou 20
// fases funciona sem mudar código: a quantidade vem do dado.
export const fasesDoMetodo = (metodoId) =>
  fases.porCampo('metodoId', metodoId).slice().sort((a, b) => a.ordem - b.ordem);

// Os métodos que servem a um instrumento: os universais (a teoria, que vale
// para todos) mais os que citam aquele instrumento.
export function metodosDoInstrumento(instrumentoId) {
  return metodos.listar((m) => m.ativo !== false)
    .filter((m) => m.universal || (m.instrumentoIds || []).includes(instrumentoId))
    .sort((a, b) => a.ordem - b.ordem);
}

export const licoesDaFase = (faseId) =>
  licoes.porCampo('faseId', faseId).slice().sort((a, b) => a.ordem - b.ordem);

export const jogosDaFase = (faseId) =>
  jogos.porCampo('faseId', faseId).slice().sort((a, b) => a.ordem - b.ordem);

export const avaliacaoDaFase = (faseId) => avaliacoes.umPorCampo('faseId', faseId);

export const questoesDaAvaliacao = (avaliacaoId) => questoes.porCampo('avaliacaoId', avaliacaoId);

export const exerciciosDaLicao = (licaoId) =>
  exercicios.porCampo('licaoId', licaoId).slice().sort((a, b) => a.ordem - b.ordem);

// O progresso de um aluno em uma fase. Se ainda não existir, devolve uma
// linha vazia SEM gravá-la: abrir a tela das trilhas não pode encher o
// depósito com catorze linhas em branco. A linha entra no depósito quando o
// aluno de fato fizer alguma coisa — e quem faz isso chama `progressos.salvar`.
export function progressoDoAluno(alunoId, faseId) {
  const id = idDoProgresso(alunoId, String(faseId));
  return progressos.buscar(id) || NORMALIZADORES.progressos({ id, alunoId, faseId: String(faseId) });
}

export const progressoDeTodasAsFases = (alunoId) => progressos.porCampo('alunoId', alunoId);

export const resultadosDoAluno = (alunoId, faseId = null) =>
  resultados.porCampo('alunoId', alunoId).filter((r) => (faseId === null ? true : r.faseId === String(faseId)));

export const certificadosDoAluno = (alunoId) => certificados.porCampo('alunoId', alunoId);

// O acesso ligado a uma ficha de aluno, e o contrário.
export const acessoDoAluno = (alunoId) => usuarios.umPorCampo('alunoId', alunoId);
export const alunoDoAcesso = (usuarioId) => {
  const acesso = usuarios.buscar(usuarioId);
  return acesso && acesso.alunoId ? alunos.buscar(acesso.alunoId) : null;
};

// -------------------------------------------------------------- configurações

export const configuracoes = {
  todas() {
    return estadoAtual().configuracoes.slice();
  },
  obter(chave, padrao = null) {
    const linha = estadoAtual().configuracoes.find((c) => c.chave === chave);
    return linha ? linha.valor : padrao;
  },
  definir(chave, valor) {
    const lista = estadoAtual().configuracoes;
    const posicao = lista.findIndex((c) => c.chave === chave);
    if (posicao >= 0) lista[posicao] = { chave, valor };
    else lista.push({ chave, valor });
    gravar();
    return valor;
  },
};

// -------------------------------------------------------------------- sessão

export const sessaoAtual = () => estadoAtual().sessao;

export function abrirSessao(usuarioId) {
  const acesso = usuarios.buscar(usuarioId);
  if (!acesso) return null;
  estadoAtual().sessao = { usuarioId, papel: acesso.papel, alunoId: acesso.alunoId || null };
  gravar();
  return estadoAtual().sessao;
}

export function fecharSessao() {
  estadoAtual().sessao = null;
  gravar();
}
