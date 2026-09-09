// Relatórios do administrador.
//
// Números que respondem perguntas de gestão: quantos estão estudando de
// verdade, o método está sendo vencido ou está travando gente, quantos
// certificados saíram.
//
// Cada número aqui é contado a partir de registro real. Nenhum é estimado.

import * as R from '../dados/repositorios.js';
import * as eventos from './eventos.js';
import * as progresso from './progresso.js';

const DIA = 86400000;
const diasDesde = (iso, agora) => (iso ? Math.floor((Date.parse(agora) - Date.parse(iso)) / DIA) : Infinity);

export function panorama({ agora = new Date().toISOString(), janelaDeAtividade = 14 } = {}) {
  const alunos = R.alunos.listar();
  const resultados = R.resultados.listar();
  const aprovados = resultados.filter((r) => r.aprovado);

  const ativos = alunos.filter((a) => diasDesde(eventos.ultimaAtividade(a.id), agora) <= janelaDeAtividade);
  const semAtividade = alunos.filter((a) => !eventos.ultimaAtividade(a.id));

  const fasesConcluidas = R.progressos.listar((p) => p.aprovadoEm).length;

  return {
    alunos: alunos.length,
    alunosAtivos: ativos.length,
    alunosSemAtividade: semAtividade.length,
    janelaDeAtividade,
    instrumentos: R.instrumentos.listar((i) => i.ativo !== false).length,
    metodos: R.metodos.listar((m) => m.ativo !== false).length,
    versoes: R.versoes.contar(),
    fases: R.fases.listar((f) => f.ativo !== false).length,
    matriculas: R.matriculas.contar(),
    matriculasEmCurso: R.matriculas.listar((m) => m.situacao === 'em_curso').length,
    matriculasConcluidas: R.matriculas.listar((m) => m.situacao === 'concluida').length,
    fasesConcluidas,
    avaliacoes: resultados.length,
    aprovacoes: aprovados.length,
    taxaDeAprovacao: resultados.length ? Math.round((aprovados.length / resultados.length) * 100) : 0,
    certificados: R.certificados.contar(),
    mediaDasNotas: resultados.length
      ? Math.round(resultados.reduce((s, r) => s + r.nota, 0) / resultados.length) : 0,
  };
}

// Como cada método está indo: quantos estudam, quantos concluíram, e — o que
// mais interessa — em que fase as pessoas empacam.
export function porMetodo() {
  return R.metodos.listar((m) => m.ativo !== false).map((metodo) => {
    const matriculas = R.matriculas.listar((m) => m.metodoId === metodo.id);
    const fases = R.fasesDoMetodo(metodo.id).filter((f) => f.ativo !== false);
    const resultados = R.resultados.listar((r) => fases.some((f) => f.id === r.faseId));
    const aprovados = resultados.filter((r) => r.aprovado);

    // A fase que mais reprova, com evidência mínima para não apontar uma fase
    // por causa de duas tentativas.
    const porFase = fases.map((fase) => {
      const daFase = resultados.filter((r) => r.faseId === fase.id);
      const passaram = daFase.filter((r) => r.aprovado).length;
      return {
        faseId: fase.id, ordem: fase.ordem, titulo: fase.titulo,
        tentativas: daFase.length,
        taxa: daFase.length ? Math.round((passaram / daFase.length) * 100) : null,
        alunosNaFase: matriculas.filter((m) => m.faseAtualId === fase.id).length,
      };
    });
    const gargalo = porFase.filter((f) => f.tentativas >= 5 && f.taxa !== null)
      .sort((a, b) => a.taxa - b.taxa)[0] || null;

    return {
      metodo,
      versaoVigente: R.versaoVigente(metodo.id),
      totalDeFases: fases.length,
      matriculas: matriculas.length,
      emCurso: matriculas.filter((m) => m.situacao === 'em_curso').length,
      concluidas: matriculas.filter((m) => m.situacao === 'concluida').length,
      taxaDeAprovacao: resultados.length ? Math.round((aprovados.length / resultados.length) * 100) : null,
      porFase,
      gargalo,
    };
  });
}

// Distribuição dos alunos por instrumento — para saber que naipe está
// crescendo e onde falta instrutor.
export function porInstrumento() {
  const contagem = new Map();
  for (const aluno of R.alunos.listar()) {
    const id = aluno.instrumentoId || '(sem instrumento)';
    contagem.set(id, (contagem.get(id) || 0) + 1);
  }
  return [...contagem.entries()].map(([id, alunos]) => {
    const instrumento = R.instrumentos.buscar(id);
    return { id, nome: instrumento ? instrumento.nome : 'Sem instrumento definido', alunos };
  }).sort((a, b) => b.alunos - a.alunos);
}

// Lista do painel: um aluno por linha, com o que o instrutor precisa ver.
export function quadroDeAlunos({ agora = new Date().toISOString() } = {}) {
  return R.alunos.listar().map((aluno) => {
    const situacao = progresso.situacaoDoAluno(aluno.id);
    const principal = situacao.matriculas[0] || null;
    const instrumento = aluno.instrumentoId ? R.instrumentos.buscar(aluno.instrumentoId) : null;
    const ultima = eventos.ultimaAtividade(aluno.id);
    return {
      aluno,
      instrumento: instrumento ? instrumento.nome : '',
      metodo: principal && principal.metodo ? principal.metodo.nome : '',
      fase: principal && principal.faseAtual ? principal.faseAtual.numero : null,
      tituloDaFase: principal && principal.faseAtual ? principal.faseAtual.titulo : '',
      percentual: situacao.percentual,
      concluidas: situacao.concluidas,
      total: situacao.total,
      ultimaAtividade: ultima,
      diasParado: ultima ? diasDesde(ultima, agora) : null,
    };
  });
}
