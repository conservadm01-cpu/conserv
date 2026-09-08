/**
 * Isolamento pedagógico, com banco de verdade.
 *
 * A promessa que estes testes cobram: conteúdo, critérios e progresso de um
 * método NÃO vazam para outro. E, do outro lado, que o compartilhamento
 * declarado (conteúdo compartilhado + autorização para o instrumento) continua
 * funcionando — isolamento não pode virar paralisia.
 */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';

const urlApp = process.env.DATABASE_URL_TESTES_APP;
const urlDono = process.env.DATABASE_URL_TESTES;
if (!urlApp || !urlDono) throw new Error('Defina DATABASE_URL_TESTES e DATABASE_URL_TESTES_APP.');
process.env.DATABASE_URL = urlApp;

const { prisma, comoUsuario } = await import('../../src/lib/banco.ts');
const { podeAparecerNaJornada, filtroDeConteudo, metodosDoInstrumento, configuracoesDoMetodo } =
  await import('../../src/lib/metodos/isolamento.ts');
const { criteriosDoMetodo } = await import('../../src/lib/regras.ts');
const { registrarAnalise, revisarAnalise } = await import('../../src/lib/metodos/aplicar.ts');

const dono = new Client({ connectionString: urlDono });
const pessoas: Record<string, string> = {};

before(async () => {
  await dono.connect();
  for (const linha of (await dono.query('SELECT id, email FROM usuarios')).rows) pessoas[linha.email] = linha.id;
});

after(async () => {
  await dono.end();
  await prisma.$disconnect();
});

const ana = () => pessoas['ana.pedagogica@exemplo.org'];

// -------------------------------------------------------------- critérios

test('cada método resolve os seus critérios, sem herdar os do outro', async () => {
  const { deUm, doOutro } = await comoUsuario(ana(), async (banco) => {
    const metodos = await banco.metodo.findMany({ where: { codigo: { in: ['MSA', 'DEMO-CORDAS'] } } });
    const base = metodos.find((m) => m.codigo === 'MSA')!;
    const cordas = metodos.find((m) => m.codigo === 'DEMO-CORDAS')!;
    return {
      deUm: criteriosDoMetodo(await configuracoesDoMetodo(banco, base.id)),
      doOutro: criteriosDoMetodo(await configuracoesDoMetodo(banco, cordas.id)),
    };
  });

  assert.notEqual(deUm.percentualDeAproveitamento, doOutro.percentualDeAproveitamento,
    'dois métodos com percentuais diferentes não podem convergir para um número só');
  assert.equal(deUm.origem.percentualDeAproveitamento, 'metodo');
  assert.equal(doOutro.origem.percentualDeAproveitamento, 'metodo');
});

test('as competências de um método não aparecem no outro', async () => {
  const porMetodo = await comoUsuario(ana(), async (banco) => {
    const metodos = await banco.metodo.findMany({
      where: { codigo: { in: ['MSA', 'DEMO-CORDAS'] } },
      include: { competencias: { select: { codigo: true } } },
    });
    return Object.fromEntries(metodos.map((m) => [m.codigo, m.competencias.map((c) => c.codigo).sort()]));
  });

  assert.ok(porMetodo['DEMO-CORDAS'].includes('ARCO'));
  assert.ok(!porMetodo.MSA.includes('ARCO'), 'competência de instrumento não cai no método de teoria');
  assert.ok(porMetodo.MSA.includes('SOLFEJO'));
  assert.ok(!porMetodo['DEMO-CORDAS'].includes('SOLFEJO'));
});

// ---------------------------------------------------------------- conteúdo

test('lição de um método não entra na jornada de outro sem compartilhamento', () => {
  const jornada = { metodoId: 'metodo-do-instrumento', instrumentoId: 'violino' };
  const deOutroMetodo = { id: 'l1', metodoId: 'metodo-de-outro', instrumentoId: null, compartilhado: false };
  const decisao = podeAparecerNaJornada(deOutroMetodo, jornada, [
    { metodoId: 'metodo-de-outro', instrumentoId: 'violino' },
  ]);
  assert.equal(decisao.permitido, false);
  assert.match(decisao.motivo, /não marcado como compartilhado/);
});

test('compartilhado só cruza com autorização para AQUELE instrumento', () => {
  const licao = { id: 'l1', metodoId: 'transversal', instrumentoId: null, compartilhado: true };
  const comAutorizacao = podeAparecerNaJornada(
    licao, { metodoId: 'de-cordas', instrumentoId: 'violino' },
    [{ metodoId: 'transversal', instrumentoId: 'violino' }],
  );
  assert.equal(comAutorizacao.permitido, true);

  const semAutorizacao = podeAparecerNaJornada(
    licao, { metodoId: 'de-sopros', instrumentoId: 'saxofone' },
    [{ metodoId: 'transversal', instrumentoId: 'violino' }],
  );
  assert.equal(semAutorizacao.permitido, false);
  assert.match(semAutorizacao.motivo, /não autorizado para o instrumento/);
});

test('lição escrita para um instrumento não vai para a jornada de outro', () => {
  const licao = { id: 'l1', metodoId: 'transversal', instrumentoId: 'violino', compartilhado: true };
  const decisao = podeAparecerNaJornada(
    licao, { metodoId: 'de-sopros', instrumentoId: 'saxofone' },
    [{ metodoId: 'transversal', instrumentoId: 'saxofone' }],
  );
  assert.equal(decisao.permitido, false);
  assert.match(decisao.motivo, /escrita para outro instrumento/);
});

test('o filtro que vai ao banco devolve só o método da jornada e o autorizado', async () => {
  const resultado = await comoUsuario(ana(), async (banco) => {
    const cordas = await banco.metodo.findUniqueOrThrow({ where: { codigo: 'DEMO-CORDAS' } });
    const violino = await banco.instrumento.findUniqueOrThrow({ where: { nome: 'Violino' } });
    const filtro = await filtroDeConteudo(banco, { metodoId: cordas.id, instrumentoId: violino.id });
    const licoes = await banco.licao.findMany({
      where: filtro, select: { metodoId: true, compartilhado: true }, take: 500,
    });
    const doProprio = licoes.filter((l) => l.metodoId === cordas.id).length;
    const deFora = licoes.filter((l) => l.metodoId !== cordas.id);
    return { doProprio, deFora: deFora.length, todasDeForaCompartilhadas: deFora.every((l) => l.compartilhado) };
  });

  assert.ok(resultado.doProprio > 0, 'o conteúdo do próprio método precisa aparecer');
  assert.equal(resultado.todasDeForaCompartilhadas, true,
    'o que vem de outro método só entra se estiver marcado como compartilhado');
});

test('a central do instrutor lista os métodos que alcançam o instrumento', async () => {
  const codigos = await comoUsuario(ana(), async (banco) => {
    const violino = await banco.instrumento.findUniqueOrThrow({ where: { nome: 'Violino' } });
    return (await metodosDoInstrumento(banco, violino.id)).map((m) => m.codigo).sort();
  });
  assert.ok(codigos.includes('DEMO-CORDAS'), 'o método do próprio instrumento');
  assert.ok(codigos.includes('MSA'), 'o transversal autorizado');
});

// ---------------------------------------------------------------- jornadas

test('o mesmo aluno tem jornadas independentes em métodos diferentes', async () => {
  const jornadas = await comoUsuario(ana(), (banco) => banco.jornadaDoAluno.findMany({
    where: { aluno: { email: 'joao.aluno@exemplo.org' } },
    include: { metodo: { select: { codigo: true } }, curriculo: { select: { metodoId: true } } },
  }));

  assert.ok(jornadas.length >= 2, 'João estuda teoria e o método do seu instrumento ao mesmo tempo');
  const metodos = new Set(jornadas.map((j) => j.metodoId));
  assert.equal(metodos.size, jornadas.length, 'uma jornada por método');
  for (const jornada of jornadas) {
    assert.equal(jornada.curriculo.metodoId, jornada.metodoId,
      'o currículo de uma jornada é sempre do método dela');
  }
});

test('progresso de uma jornada não conta na outra', async () => {
  const contagens = await comoUsuario(ana(), async (banco) => {
    const jornadas = await banco.jornadaDoAluno.findMany({
      where: { aluno: { email: 'joao.aluno@exemplo.org' } },
      include: { metodo: { select: { codigo: true } } },
    });
    return Promise.all(jornadas.map(async (jornada) => ({
      metodo: jornada.metodo.codigo,
      // Progresso registrado NESTA jornada, e lições do currículo DELA.
      progresso: await banco.progressoLicao.count({ where: { jornadaId: jornada.id } }),
      forasteiras: await banco.progressoLicao.count({
        where: { jornadaId: jornada.id, licao: { metodoId: { not: jornada.metodoId } } },
      }),
    })));
  });

  for (const contagem of contagens) {
    assert.equal(contagem.forasteiras, 0,
      `nenhum progresso da jornada de ${contagem.metodo} pode apontar para lição de outro método`);
  }
  assert.ok(contagens.some((c) => c.progresso > 0), 'a semente precisa deixar progresso para o teste valer');
});

test('a turma segue o método dela, e a matrícula segue a jornada do mesmo método', async () => {
  const matriculas = await comoUsuario(ana(), (banco) => banco.matriculaEmTurma.findMany({
    where: { jornadaId: { not: null } },
    include: { turma: { select: { metodoId: true } }, jornada: { select: { metodoId: true } } },
  }));
  assert.ok(matriculas.length > 0);
  for (const matricula of matriculas) {
    assert.equal(matricula.jornada!.metodoId, matricula.turma.metodoId,
      'matricular numa turma não pode ligar o aluno à jornada de outro método');
  }
});

// ------------------------------------------------- análise e revisão humana

test('análise rejeitada não cria currículo nenhum', async () => {
  const resultado = await comoUsuario(ana(), async (banco) => {
    const metodo = await banco.metodo.findUniqueOrThrow({ where: { codigo: 'MEM' } });
    const antes = await banco.curriculo.count({ where: { metodoId: metodo.id } });
    const analise = await registrarAnalise(banco, {
      metodoId: metodo.id, origem: 'teste',
      estrutura: {
        analisador: 'teste', metodo: {}, avisos: [], resumo: {},
        unidades: [{
          tipo: 'FASE', codigo: 'X', nome: 'Proposta a rejeitar', descricao: null, ordem: 1,
          paginaInicio: null, paginaFim: null, referencia: null, fonte: null,
          statusConferencia: 'PENDENTE_CONFERENCIA', filhas: [], itens: [],
        }],
      },
    });
    const revisao = await revisarAnalise(banco, {
      analiseId: analise.id, decisao: 'REJEITAR', revisorId: pessoas['ana.pedagogica@exemplo.org'],
      parecer: 'Estrutura não confere com o documento.',
    });
    const depois = await banco.curriculo.count({ where: { metodoId: metodo.id } });
    return { antes, depois, status: revisao.analise.status, curriculo: revisao.curriculo };
  });

  assert.equal(resultado.status, 'REJEITADA');
  assert.equal(resultado.curriculo, null);
  assert.equal(resultado.depois, resultado.antes, 'rejeitar não pode deixar rastro de currículo');
});

test('editar ou rejeitar sem parecer é recusado', async () => {
  await assert.rejects(
    () => comoUsuario(ana(), async (banco) => {
      const metodo = await banco.metodo.findUniqueOrThrow({ where: { codigo: 'MEM' } });
      const analise = await registrarAnalise(banco, {
        metodoId: metodo.id, origem: 'teste',
        estrutura: { analisador: 'teste', metodo: {}, unidades: [], avisos: [], resumo: {} },
      });
      return revisarAnalise(banco, {
        analiseId: analise.id, decisao: 'REJEITAR', revisorId: pessoas['ana.pedagogica@exemplo.org'],
      });
    }),
    /parecer/i,
  );
});

test('a mesma análise não é decidida duas vezes', async () => {
  await assert.rejects(
    () => comoUsuario(ana(), async (banco) => {
      const metodo = await banco.metodo.findUniqueOrThrow({ where: { codigo: 'MEM' } });
      const analise = await registrarAnalise(banco, {
        metodoId: metodo.id, origem: 'teste',
        estrutura: { analisador: 'teste', metodo: {}, unidades: [], avisos: [], resumo: {} },
      });
      const revisao = {
        analiseId: analise.id, decisao: 'REJEITAR' as const,
        revisorId: pessoas['ana.pedagogica@exemplo.org'], parecer: 'primeira decisão',
      };
      await revisarAnalise(banco, revisao);
      return revisarAnalise(banco, { ...revisao, parecer: 'segunda decisão' });
    }),
    /já foi/i,
  );
});

test('a importação não publica: currículo novo nasce em rascunho', async () => {
  const situacoes = await comoUsuario(ana(), (banco) => banco.licao.groupBy({
    by: ['statusPublicacao', 'statusConferencia'], _count: { _all: true },
  }));
  const publicadoENaoConferido = situacoes.find(
    (s) => s.statusPublicacao === 'PUBLICADO' && s.statusConferencia === 'DIVERGENTE',
  );
  assert.equal(publicadoENaoConferido, undefined, 'nada divergente pode estar publicado');
});
