// Testes da trilha do instrumento: transposição, conteúdo por instrumento e a
// mesma regra de ouro do MSA — nenhuma pergunta se repete.
import test from 'node:test';
import assert from 'node:assert/strict';

const T = await import('../js/musica.js');
const { INSTRUMENTOS, instrumentoPorId, somReal, notaParaSoar, FAMILIAS } = await import('../js/conteudo/instrumentos.js');
const { FASES_INSTRUMENTO, GERADORES_INSTRUMENTO } = await import('../js/conteudo/fases-instrumento.js');
const { trilhasDoAluno, faseporId } = await import('../js/conteudo/trilhas.js');
const { totalDeVariantes } = await import('../js/conteudo/geradores.js');
const { montarProva, QUESTOES_POR_PROVA } = await import('../js/quiz.js');
const { criarAleatorio } = await import('../js/aleatorio.js');
const { montarCertificado, svgDoCertificado } = await import('../js/certificado.js');

const curto = (n) => T.nomeDaNota(n, { curto: true });

test('a transposição de cada instrumento sai com o nome certo', () => {
  const casos = [
    ['clarinete', 'Dó', 'Si♭'], ['clarinete', 'Ré', 'Dó'], ['clarinete', 'Fá', 'Mi♭'],
    ['trompete', 'Dó', 'Si♭'], ['sax-tenor', 'Dó', 'Si♭'], ['sax-soprano', 'Sol', 'Fá'],
    ['sax-alto', 'Dó', 'Mi♭'], ['sax-alto', 'Ré', 'Fá'], ['sax-baritono', 'Dó', 'Mi♭'],
    ['trompa', 'Dó', 'Fá'], ['corne', 'Sol', 'Dó'],
    ['violino', 'Dó', 'Dó'], ['contrabaixo', 'Sol', 'Sol'], ['tuba', 'Mi', 'Mi'], ['orgao', 'Si', 'Si'],
  ];
  for (const [id, escrita, esperada] of casos) {
    const i = instrumentoPorId(id);
    assert.equal(curto(somReal(i, T.nota(escrita))), esperada, `${i.nome}: ${escrita} deveria soar ${esperada}`);
  }
});

test('ler e soar são caminhos inversos', () => {
  for (const i of INSTRUMENTOS) {
    for (const letra of T.LETRAS) {
      const nota = T.nota(letra);
      assert.equal(curto(notaParaSoar(i, somReal(i, nota))), letra, `${i.nome} não fecha a volta em ${letra}`);
      const distancia = (T.semitomDaNota(somReal(i, nota)) - T.semitomDaNota(nota) + 24) % 12;
      assert.equal(distancia, ((i.transposicao.semitons % 12) + 12) % 12, `${i.nome}: distância errada`);
    }
  }
});

test('todo instrumento tem os dados que as lições usam', () => {
  for (const i of INSTRUMENTOS) {
    assert.ok(FAMILIAS[i.familia], `${i.nome} sem família válida`);
    assert.ok(i.claves.length >= 1 && i.claves.every((c) => T.CLAVES[c]), `${i.nome} com clave inválida`);
    assert.ok(['Dó', 'Si♭', 'Mi♭', 'Fá'].includes(i.afinacao), `${i.nome} com afinação estranha`);
    assert.ok(i.partes.length >= 4, `${i.nome} com poucas partes`);
    assert.ok(i.cuidado && i.tessitura, `${i.nome} sem cuidado ou tessitura`);
    assert.equal(i.transpositor, i.transposicao.semitons !== 0);
  }
  assert.equal(new Set(INSTRUMENTOS.map((i) => i.id)).size, INSTRUMENTOS.length, 'id de instrumento repetido');
});

test('as lições da trilha montam para todos os instrumentos', () => {
  for (const i of INSTRUMENTOS) {
    for (const fase of FASES_INSTRUMENTO) {
      for (const licao of fase.licoes) {
        const html = licao.corpo(i);
        assert.ok(html.length > 150, `${i.nome} / ${licao.titulo}: lição curta demais`);
        assert.ok(!html.includes('undefined'), `${i.nome} / ${licao.titulo}: sobrou um "undefined"`);
      }
    }
  }
});

test('cada gerador do instrumento produz perguntas válidas', () => {
  const rnd = criarAleatorio(4242);
  for (const i of INSTRUMENTOS) {
    for (const gerador of GERADORES_INSTRUMENTO) {
      const variantes = gerador.variantes(i);
      const chaves = new Set(variantes.map(gerador.chave));
      assert.equal(chaves.size, variantes.length, `${gerador.id} repete chave em ${i.nome}`);
      for (const variante of variantes) {
        const q = gerador.montar(variante, rnd, i);
        assert.ok(q.enunciado.length > 8, `${gerador.id}: enunciado vazio`);
        assert.ok(q.alternativas.includes(q.correta), `${gerador.id} (${i.nome}): resposta certa fora das alternativas`);
        assert.equal(new Set(q.alternativas).size, q.alternativas.length, `${gerador.id} (${i.nome}): alternativa repetida`);
        assert.ok(q.explicacao && q.referencia);
      }
    }
  }
});

test('toda fase de instrumento dá para pelo menos 6 provas inéditas', () => {
  for (const i of INSTRUMENTOS) {
    for (const fase of trilhasDoAluno(i.id).instrumento) {
      const total = totalDeVariantes(fase.id, fase.contexto);
      assert.ok(total >= QUESTOES_POR_PROVA * 6,
        `${i.nome} / ${fase.id}: só ${total} perguntas possíveis`);
    }
  }
});

test('na trilha do instrumento a pergunta também nunca repete', () => {
  for (const id of ['clarinete', 'violino', 'orgao', 'trompa']) {
    const i = instrumentoPorId(id);
    for (const fase of trilhasDoAluno(id).instrumento) {
      const possiveis = totalDeVariantes(fase.id, fase.contexto);
      const provas = Math.floor(possiveis / QUESTOES_POR_PROVA);
      const vistas = new Set();
      let usadas = [];
      for (let n = 0; n < provas; n++) {
        const prova = montarProva(fase.id, usadas, { semente: 400 + n, contexto: fase.contexto });
        assert.equal(prova.reciclou, false, `${i.nome}/${fase.id}: reciclou antes da hora`);
        for (const q of prova.questoes) {
          assert.ok(!vistas.has(q.assinatura), `${i.nome}/${fase.id}: repetiu ${q.assinatura}`);
          vistas.add(q.assinatura);
        }
        usadas = usadas.concat(prova.questoes.map((q) => q.assinatura));
      }
      assert.equal(vistas.size, provas * QUESTOES_POR_PROVA);
    }
  }
});

test('as perguntas do instrumento falam do instrumento do aluno', () => {
  const clarinete = instrumentoPorId('clarinete');
  const fase = faseporId('inst3', 'clarinete');
  const prova = montarProva('inst3', [], { semente: 77, contexto: fase.contexto });
  const texto = prova.questoes.map((q) => `${q.enunciado} ${q.explicacao}`).join(' ');
  assert.match(texto, /Clarinete|clave|Si♭/, 'a prova deveria tratar do instrumento do aluno');
  assert.equal(clarinete.transpositor, true);
});

test('as duas trilhas convivem com identificadores próprios', () => {
  const t = trilhasDoAluno('trompete');
  assert.equal(t.msa.length, 10);
  assert.equal(t.instrumento.length, 4);
  assert.deepEqual(t.msa.map((f) => f.id), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  assert.deepEqual(t.instrumento.map((f) => f.id), ['inst1', 'inst2', 'inst3', 'inst4']);
  assert.equal(t.msa[0].anteriorId, null);
  assert.equal(t.instrumento[0].anteriorId, null, 'a fase 1 do instrumento não depende do MSA');
  assert.equal(t.instrumento[2].anteriorId, 'inst2');
  assert.equal(trilhasDoAluno('').instrumento.length, 0, 'sem instrumento, sem trilha do instrumento');
});

test('o certificado do instrumento sai identificado', () => {
  const fase = faseporId('inst2', 'trompa');
  const c = montarCertificado({ nome: 'João da Silva', fase, nota: 80, acertos: 8, total: 10, data: '2026-05-05T12:00:00.000Z' });
  assert.match(c.codigo, /^INS-02-/);
  assert.equal(c.trilha, 'instrumento');
  assert.equal(c.instrumento, 'Trompa');
  const svg = svgDoCertificado(c);
  assert.match(svg, /Trompa/);
  assert.match(svg, /João da Silva/);

  const msa = montarCertificado({ nome: 'João da Silva', fase: faseporId('3', 'trompa'), nota: 80, acertos: 8, total: 10 });
  assert.match(msa.codigo, /^MSA-03-/);
  assert.match(svgDoCertificado(msa), /Método Simplificado/);
});
