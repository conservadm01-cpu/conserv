// Testes do miolo do app: teoria, geradores de pergunta e a regra de ouro —
// a avaliação nunca repete uma pergunta para o mesmo aluno.
import test from 'node:test';
import assert from 'node:assert/strict';

const T = await import('../js/musica.js');
const { criarAleatorio } = await import('../js/aleatorio.js');
const { GERADORES, universoDaFase, totalDeVariantes } = await import('../js/conteudo/geradores.js');
const { FASES } = await import('../js/conteudo/fases.js');
const { montarProva, corrigir, QUESTOES_POR_PROVA } = await import('../js/quiz.js');
const { montarCertificado, svgDoCertificado } = await import('../js/certificado.js');

const curto = (n) => T.nomeDaNota(n, { curto: true });

test('escalas maiores mantêm o padrão T T st T T T st', () => {
  for (const tonalidade of T.TONALIDADES) {
    const notas = T.escala(tonalidade.maior);
    const distancias = notas.slice(1).map((n, i) => (T.semitomDaNota(n) - T.semitomDaNota(notas[i]) + 12) % 12);
    assert.deepEqual(distancias, T.PADRAO_MAIOR, `padrão errado em ${curto(tonalidade.maior)} Maior`);
    const letras = notas.slice(0, 7).map((n) => n.letra);
    assert.equal(new Set(letras).size, 7, `letra repetida em ${curto(tonalidade.maior)} Maior`);
  }
});

test('escalas conhecidas saem com os acidentes certos', () => {
  assert.equal(T.escala(T.nota('Fá')).map(curto).join(' '), 'Fá Sol Lá Si♭ Dó Ré Mi Fá');
  assert.equal(T.escala(T.nota('Ré')).map(curto).join(' '), 'Ré Mi Fá♯ Sol Lá Si Dó♯ Ré');
  assert.equal(T.escala(T.nota('Si', -1)).map(curto).join(' '), 'Si♭ Dó Ré Mi♭ Fá Sol Lá Si♭');
});

test('armadura de clave respeita a ordem dos acidentes', () => {
  const sol = T.TONALIDADES.find((t) => curto(t.maior) === 'Sol');
  assert.deepEqual(T.armaduraDe(sol), ['Fá']);
  const mib = T.TONALIDADES.find((t) => curto(t.maior) === 'Mi♭');
  assert.deepEqual(T.armaduraDe(mib), ['Si', 'Mi', 'Lá']);
});

test('intervalos são classificados corretamente', () => {
  assert.equal(T.intervalo(T.nota('Dó'), T.nota('Mi')).rotulo, '3ª maior');
  assert.equal(T.intervalo(T.nota('Mi'), T.nota('Fá')).rotulo, '2ª menor');
  assert.equal(T.intervalo(T.nota('Si'), T.nota('Fá')).rotulo, '5ª diminuta');
  assert.equal(T.intervalo(T.nota('Ré'), T.nota('Lá')).rotulo, '5ª justa');
});

test('leitura de notas na pauta bate com cada clave', () => {
  assert.equal(T.notaDaPosicao('sol', 0).letra, 'Mi');
  assert.equal(T.notaDaPosicao('fa', 6).letra, 'Fá');
  assert.equal(T.notaDaPosicao('do', 4).letra, 'Dó');
  assert.equal(T.nomeDoLugar(0), '1ª linha');
  assert.equal(T.nomeDoLugar(3), '2º espaço');
});

test('cada gerador produz perguntas válidas em todas as suas variantes', () => {
  const rnd = criarAleatorio(2024);
  for (const gerador of GERADORES) {
    const variantes = gerador.variantes();
    assert.ok(variantes.length > 0, `${gerador.id} sem variantes`);
    const chaves = new Set(variantes.map(gerador.chave));
    assert.equal(chaves.size, variantes.length, `${gerador.id} tem chaves repetidas`);
    for (const variante of variantes) {
      const q = gerador.montar(variante, rnd);
      assert.ok(q.enunciado && q.enunciado.length > 8, `${gerador.id}: enunciado vazio`);
      assert.ok(q.alternativas.length >= 2, `${gerador.id}: poucas alternativas`);
      assert.equal(new Set(q.alternativas).size, q.alternativas.length, `${gerador.id}: alternativa repetida`);
      assert.ok(q.alternativas.includes(q.correta), `${gerador.id}: a resposta certa não está entre as alternativas`);
      assert.ok(q.explicacao && q.referencia, `${gerador.id}: falta explicação ou referência`);
    }
  }
});

test('toda fase tem repertório para várias provas inéditas', () => {
  for (const fase of FASES) {
    const total = totalDeVariantes(fase.numero);
    assert.ok(total >= QUESTOES_POR_PROVA * 6,
      `fase ${fase.numero} só tem ${total} perguntas possíveis`);
  }
});

test('a mesma pergunta nunca cai duas vezes para o mesmo aluno', () => {
  for (const fase of FASES) {
    const possiveis = totalDeVariantes(fase.numero);
    const provas = Math.floor(possiveis / QUESTOES_POR_PROVA);
    const vistas = new Set();
    let usadas = [];
    for (let i = 0; i < provas; i++) {
      const prova = montarProva(fase.numero, usadas, { semente: 7000 + i });
      assert.equal(prova.reciclou, false, `fase ${fase.numero}: reciclou antes da hora`);
      assert.equal(prova.questoes.length, QUESTOES_POR_PROVA);
      for (const q of prova.questoes) {
        assert.ok(!vistas.has(q.assinatura), `fase ${fase.numero}: pergunta repetida (${q.assinatura})`);
        vistas.add(q.assinatura);
      }
      usadas = usadas.concat(prova.questoes.map((q) => q.assinatura));
    }
    assert.equal(vistas.size, provas * QUESTOES_POR_PROVA);
  }
});

test('dentro de uma prova não há duas perguntas iguais', () => {
  for (let i = 0; i < 40; i++) {
    const prova = montarProva((i % 10) + 1, [], { semente: i * 31 + 1 });
    const assinaturas = prova.questoes.map((q) => q.assinatura);
    assert.equal(new Set(assinaturas).size, assinaturas.length);
  }
});

test('quando o repertório inédito acaba, o app recicla e avisa', () => {
  const fase = 9;
  const todas = universoDaFase(fase).map((u) => u.assinatura);
  const prova = montarProva(fase, todas, { semente: 99 });
  assert.equal(prova.reciclou, true);
  assert.equal(prova.questoes.length, QUESTOES_POR_PROVA);
});

test('correção calcula nota e aprovação', () => {
  const prova = montarProva(1, [], { semente: 12 });
  const todasCertas = prova.questoes.map((q) => q.correta);
  const resultado = corrigir(prova, todasCertas);
  assert.equal(resultado.nota, 100);
  assert.equal(resultado.aprovado, true);

  const seteCertas = prova.questoes.map((q, i) => (i < 7 ? q.correta : 'resposta errada'));
  const parcial = corrigir(prova, seteCertas);
  assert.equal(parcial.nota, 70);
  assert.equal(parcial.aprovado, true);

  const seisCertas = prova.questoes.map((q, i) => (i < 6 ? q.correta : 'resposta errada'));
  assert.equal(corrigir(prova, seisCertas).aprovado, false);
});

test('certificado sai com código estável e SVG completo', () => {
  const dados = { nome: 'Maria da Silva', fase: 4, nota: 90, acertos: 9, total: 10, data: '2026-03-10T12:00:00.000Z' };
  const a = montarCertificado(dados);
  const b = montarCertificado(dados);
  assert.equal(a.codigo, b.codigo);
  assert.match(a.codigo, /^MSA-04-[0-9A-Z]+$/);
  const svg = svgDoCertificado(a);
  assert.match(svg, /Maria da Silva/);
  assert.match(svg, /Fase 4/);
  assert.match(svg, /<\/svg>$/);
});

test('as fases cobrem o método na ordem e têm conteúdo montável', () => {
  assert.equal(FASES.length, 10);
  FASES.forEach((fase, i) => {
    assert.equal(fase.numero, i + 1);
    assert.ok(fase.licoes.length >= 3, `fase ${fase.numero} com poucas lições`);
    assert.ok(fase.jogos.length >= 1);
    for (const licao of fase.licoes) {
      const html = licao.corpo();
      assert.ok(html.length > 120, `lição "${licao.titulo}" curta demais`);
      assert.ok(Number.isInteger(licao.pagina), `lição "${licao.titulo}" sem página do método`);
    }
  });
});
