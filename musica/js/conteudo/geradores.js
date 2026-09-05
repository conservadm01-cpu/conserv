// Geradores de pergunta. Cada gerador declara o seu universo de VARIANTES —
// e cada variante tem uma chave única. A avaliação sorteia sempre entre as
// variantes que aquele aluno ainda não recebeu, então a mesma pergunta nunca
// cai duas vezes, embora o assunto seja sempre o da fase.

import { embaralhar, sortear } from '../aleatorio.js';
import { pentagrama, figuraSolta, teclado } from '../notacao.js';
import * as T from '../musica.js';

const nomeCurto = (n) => T.nomeDaNota(n, { curto: true });
const ordinal = ['', '1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º'];

// Monta 4 alternativas: a certa e três erradas tiradas do repertório do assunto.
function alternativas(correta, repertorio, rnd, quantidade = 4) {
  const vistas = new Set([String(correta)]);
  const distratores = [];
  for (const item of embaralhar(repertorio, rnd)) {
    const texto = String(item);
    if (vistas.has(texto)) continue;
    vistas.add(texto);
    distratores.push(texto);
    if (distratores.length === quantidade - 1) break;
  }
  return embaralhar([String(correta), ...distratores], rnd);
}

const pares = (lista) => lista.flatMap((a, i) => lista.slice(i + 1).map((b) => [a, b]));

const NOTAS_NATURAIS = T.LETRAS.map((l) => T.nota(l));
const TODAS_AS_NOTAS = T.LETRAS.flatMap((l) => [T.nota(l), T.nota(l, 1), T.nota(l, -1)]);

export const GERADORES = [];
const registrar = (g) => { GERADORES.push(g); return g; };

// ============================================================ FASE 1
registrar({
  id: 'f1.propriedade',
  fase: 1,
  variantes: () => T.PROPRIEDADES_DO_SOM.flatMap((p) => [0, 1, 2].map((molde) => ({ p: p.nome, molde }))),
  chave: (v) => `${v.p}-${v.molde}`,
  montar(v, rnd) {
    const p = T.PROPRIEDADES_DO_SOM.find((x) => x.nome === v.p);
    const nomes = T.PROPRIEDADES_DO_SOM.map((x) => x.nome);
    const enunciados = [
      `Qual propriedade do som ${p.definicao}?`,
      `"${p.definicao.charAt(0).toUpperCase() + p.definicao.slice(1)}." Estamos falando de qual propriedade do som?`,
      `Entre as quatro propriedades do som, qual delas se define assim: ${p.definicao}?`,
    ];
    return {
      enunciado: enunciados[v.molde],
      alternativas: alternativas(p.nome, nomes, rnd),
      correta: p.nome,
      explicacao: `${p.artigo} ${p.nome} ${p.definicao}.`,
      referencia: 'MSA, pág. 10',
    };
  },
});

registrar({
  id: 'f1.propriedade-exemplo',
  fase: 1,
  variantes: () => [
    { e: 'um som grave e um som agudo', p: 'altura' },
    { e: 'um som que sobe e outro que desce', p: 'altura' },
    { e: 'a nota mais aguda da flauta comparada à do contrabaixo', p: 'altura' },
    { e: 'um som longo e um som curto', p: 'duração' },
    { e: 'uma semibreve comparada a uma colcheia', p: 'duração' },
    { e: 'o tempo em que a nota permanece soando', p: 'duração' },
    { e: 'um som forte e um som fraco', p: 'intensidade' },
    { e: 'a diferença entre tocar em <i>piano</i> e em <i>forte</i>', p: 'intensidade' },
    { e: 'o volume com que a congregação canta', p: 'intensidade' },
    { e: 'a diferença entre a mesma nota no violino e no clarinete', p: 'timbre' },
    { e: 'reconhecer quem está falando sem ver a pessoa', p: 'timbre' },
    { e: 'a cor característica de cada instrumento', p: 'timbre' },
  ],
  chave: (v) => v.e,
  montar(v, rnd) {
    return {
      enunciado: `${v.e.charAt(0).toUpperCase() + v.e.slice(1)} — isso diz respeito a qual propriedade do som?`,
      alternativas: alternativas(v.p, T.PROPRIEDADES_DO_SOM.map((x) => x.nome), rnd),
      correta: v.p,
      explicacao: `É ${v.p}: ${T.PROPRIEDADES_DO_SOM.find((x) => x.nome === v.p).definicao.replace(/^é /, '')}.`,
      referencia: 'MSA, pág. 10',
    };
  },
});

registrar({
  id: 'f1.ordem-das-notas',
  fase: 1,
  variantes: () => T.LETRAS.flatMap((l) => [
    { l, direcao: 'depois', molde: 0 }, { l, direcao: 'antes', molde: 0 },
    { l, direcao: 'depois', molde: 1 }, { l, direcao: 'antes', molde: 1 },
  ]),
  chave: (v) => `${v.l}-${v.direcao}-${v.molde}`,
  montar(v, rnd) {
    const i = T.LETRAS.indexOf(v.l);
    const resposta = T.LETRAS[(i + (v.direcao === 'depois' ? 1 : 6)) % 7];
    const enunciados = [
      `Na ordem natural das notas, qual vem imediatamente ${v.direcao} de ${v.l}?`,
      `Subindo e descendo a série das sete notas, qual é a nota ${v.direcao === 'depois' ? 'seguinte a' : 'anterior a'} ${v.l}?`,
    ];
    return {
      enunciado: enunciados[v.molde],
      alternativas: alternativas(resposta, T.LETRAS, rnd),
      correta: resposta,
      explicacao: `A série é Dó Ré Mi Fá Sol Lá Si e recomeça. ${v.direcao === 'depois' ? 'Depois' : 'Antes'} de ${v.l} vem ${resposta}.`,
      referencia: 'MSA, pág. 11',
    };
  },
});

registrar({
  id: 'f1.cifra',
  fase: 1,
  variantes: () => T.LETRAS.flatMap((l, i) => [{ l, c: T.CIFRAS[i], sentido: 'cifra' }, { l, c: T.CIFRAS[i], sentido: 'nota' }]),
  chave: (v) => `${v.l}-${v.sentido}`,
  montar(v, rnd) {
    const paraCifra = v.sentido === 'cifra';
    return {
      enunciado: paraCifra ? `Qual é a cifra da nota ${v.l}?` : `Qual nota corresponde à cifra ${v.c}?`,
      alternativas: alternativas(paraCifra ? v.c : v.l, paraCifra ? T.CIFRAS : T.LETRAS, rnd),
      correta: paraCifra ? v.c : v.l,
      explicacao: `Na cifra internacional: Dó=C, Ré=D, Mi=E, Fá=F, Sol=G, Lá=A, Si=B. Logo ${v.l} = ${v.c}.`,
      referencia: 'MSA, pág. 11',
    };
  },
});

registrar({
  id: 'f1.contagem-na-serie',
  fase: 1,
  variantes: () => T.LETRAS.flatMap((l) => [2, 3, 4, 5, 6, 7].map((n) => ({ l, n }))),
  chave: (v) => `${v.l}-${v.n}`,
  montar(v, rnd) {
    const resposta = T.LETRAS[(T.LETRAS.indexOf(v.l) + v.n - 1) % 7];
    return {
      enunciado: `Contando ${v.l} como a 1ª nota e subindo, qual é a ${v.n}ª nota da série?`,
      alternativas: alternativas(resposta, T.LETRAS, rnd),
      correta: resposta,
      explicacao: `A partir de ${v.l}: ${Array.from({ length: v.n }, (_, k) => T.LETRAS[(T.LETRAS.indexOf(v.l) + k) % 7]).join(' – ')}.`,
      referencia: 'MSA, pág. 11',
    };
  },
});

registrar({
  id: 'f1.conceitos',
  fase: 1,
  variantes: () => [
    { t: 'som', d: 'a sensação produzida no ouvido pela vibração regular de um corpo' },
    { t: 'ruído', d: 'o resultado de uma vibração irregular, sem altura definida' },
    { t: 'melodia', d: 'a sucessão de sons ouvidos um depois do outro' },
    { t: 'harmonia', d: 'sons diferentes soando ao mesmo tempo' },
    { t: 'ritmo', d: 'a ordem e a proporção da duração dos sons' },
    { t: 'música', d: 'a arte de combinar os sons de forma agradável ao ouvido' },
  ].flatMap((x) => [{ ...x, molde: 0 }, { ...x, molde: 1 }]),
  chave: (v) => `${v.t}-${v.molde}`,
  montar(v, rnd) {
    const repertorio = ['som', 'ruído', 'melodia', 'harmonia', 'ritmo', 'música', 'timbre', 'pulsação'];
    return {
      enunciado: v.molde === 0
        ? `Como se chama ${v.d}?`
        : `A definição "${v.d}" corresponde a qual destes termos?`,
      alternativas: alternativas(v.t, repertorio, rnd),
      correta: v.t,
      explicacao: `${v.t.charAt(0).toUpperCase() + v.t.slice(1)} é ${v.d}.`,
      referencia: 'MSA, pág. 9',
    };
  },
});

// ============================================================ FASE 2
registrar({
  id: 'f2.clave-linha',
  fase: 2,
  variantes: () => Object.values(T.CLAVES).flatMap((c) => [
    { c: c.id, sentido: 'linha' }, { c: c.id, sentido: 'clave' }, { c: c.id, sentido: 'nota' },
  ]),
  chave: (v) => `${v.c}-${v.sentido}`,
  montar(v, rnd) {
    const clave = T.CLAVES[v.c];
    const nome = clave.nome.replace('clave de ', '');
    const linhas = ['1ª linha', '2ª linha', '3ª linha', '4ª linha', '5ª linha'];
    if (v.sentido === 'linha') {
      return {
        enunciado: `Em que linha do pentagrama se apoia a ${clave.nome}?`,
        alternativas: alternativas(`${clave.linha}ª linha`, linhas, rnd),
        correta: `${clave.linha}ª linha`,
        explicacao: `A ${clave.nome} marca a nota ${nome} na ${clave.linha}ª linha.`,
        referencia: 'MSA, pág. 13',
      };
    }
    if (v.sentido === 'clave') {
      const resposta = clave.nome;
      return {
        enunciado: `Qual clave marca a nota ${nome} na ${clave.linha}ª linha?`,
        alternativas: alternativas(resposta, Object.values(T.CLAVES).map((c) => c.nome), rnd, 3),
        correta: resposta,
        explicacao: `${clave.referencia}.`,
        referencia: 'MSA, pág. 13',
      };
    }
    return {
      enunciado: `Que nota está escrita nesta pauta?`,
      html: pentagrama({ clave: v.c, notas: [{ ...T.notaDaPosicao(v.c, (clave.linha - 1) * 2), figura: 'semibreve' }], largura: 260 }),
      alternativas: alternativas(nome, T.LETRAS, rnd),
      correta: nome,
      explicacao: `A clave é a ${clave.nome}: ela mesma nomeia a nota da ${clave.linha}ª linha, que é ${nome}.`,
      referencia: 'MSA, pág. 13',
    };
  },
});

registrar({
  id: 'f2.ler-nota',
  fase: 2,
  variantes: () => Object.keys(T.CLAVES).flatMap((c) => [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => ({ c, p }))),
  chave: (v) => `${v.c}-${v.p}`,
  montar(v, rnd) {
    const n = T.notaDaPosicao(v.c, v.p);
    return {
      enunciado: `Na ${T.CLAVES[v.c].nome}, que nota é esta?`,
      html: pentagrama({ clave: v.c, notas: [{ ...n, figura: 'semibreve' }], largura: 260 }),
      alternativas: alternativas(n.letra, T.LETRAS, rnd),
      correta: n.letra,
      explicacao: `A nota está na ${T.nomeDoLugar(v.p)}. Contando a partir da ${T.CLAVES[v.c].referencia}, é ${n.letra}.`,
      referencia: 'MSA, pág. 13',
    };
  },
});

registrar({
  id: 'f2.lugar-da-nota',
  fase: 2,
  variantes: () => Object.keys(T.CLAVES).flatMap((c) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((p) => ({ c, p }))),
  chave: (v) => `${v.c}-${v.p}`,
  montar(v, rnd) {
    const n = T.notaDaPosicao(v.c, v.p);
    const lugares = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((p) => T.nomeDoLugar(p));
    return {
      enunciado: `Na ${T.CLAVES[v.c].nome}, em que lugar da pauta se escreve a nota ${n.letra} indicada abaixo?`,
      html: pentagrama({ clave: v.c, notas: [{ ...n, figura: 'semibreve' }], largura: 260 }),
      alternativas: alternativas(T.nomeDoLugar(v.p), lugares, rnd),
      correta: T.nomeDoLugar(v.p),
      explicacao: `Contando de baixo para cima, essa nota ocupa a ${T.nomeDoLugar(v.p)}.`,
      referencia: 'MSA, pág. 12',
    };
  },
});

registrar({
  id: 'f2.figura-valor',
  fase: 2,
  variantes: () => T.FIGURAS.slice(0, 6).flatMap((f) => [{ f: f.id, molde: 0 }, { f: f.id, molde: 1 }]),
  chave: (v) => `${v.f}-${v.molde}`,
  montar(v, rnd) {
    const f = T.figuraPorId(v.f);
    const respostas = T.FIGURAS.map((x) => `${T.fracaoBonita(x.duracao)} tempo${x.duracao === 1 ? '' : 's'}`);
    const correta = `${T.fracaoBonita(f.duracao)} tempo${f.duracao === 1 ? '' : 's'}`;
    if (v.molde === 0) {
      return {
        enunciado: `Num compasso simples em que a semínima vale um tempo, quanto vale a ${f.nome}?`,
        html: figuraSolta(f.id, { tamanho: 66 }),
        alternativas: alternativas(correta, respostas, rnd),
        correta,
        explicacao: `A semibreve vale 4 tempos e cada figura seguinte vale a metade: a ${f.nome} vale ${correta}.`,
        referencia: 'MSA, pág. 15',
      };
    }
    return {
      enunciado: `Que figura vale ${correta} num compasso simples de semínima?`,
      alternativas: alternativas(f.nome, T.FIGURAS.map((x) => x.nome), rnd),
      correta: f.nome,
      explicacao: `${f.nome.charAt(0).toUpperCase() + f.nome.slice(1)} = ${correta}.`,
      referencia: 'MSA, pág. 15',
    };
  },
});

registrar({
  id: 'f2.equivalencia',
  fase: 2,
  variantes: () => pares(T.FIGURAS.slice(0, 6).map((f) => f.id)).map(([a, b]) => ({ maior: a, menor: b })),
  chave: (v) => `${v.maior}-${v.menor}`,
  montar(v, rnd) {
    const maior = T.figuraPorId(v.maior);
    const menor = T.figuraPorId(v.menor);
    const quantidade = Math.round(maior.duracao / menor.duracao);
    return {
      enunciado: `Quantas ${menor.nome}s cabem em uma ${maior.nome}?`,
      alternativas: alternativas(String(quantidade), ['1', '2', '3', '4', '6', '8', '12', '16', '32'], rnd),
      correta: String(quantidade),
      explicacao: `Cada figura vale o dobro da seguinte: ${maior.nome} ÷ ${menor.nome} = ${quantidade}.`,
      referencia: 'MSA, pág. 17',
    };
  },
});

registrar({
  id: 'f2.numero-equivalencia',
  fase: 2,
  variantes: () => T.FIGURAS.flatMap((f) => [{ f: f.id, sentido: 'numero' }, { f: f.id, sentido: 'figura' }]),
  chave: (v) => `${v.f}-${v.sentido}`,
  montar(v, rnd) {
    const f = T.figuraPorId(v.f);
    if (v.sentido === 'numero') {
      return {
        enunciado: `Qual é o número de equivalência da ${f.nome}?`,
        alternativas: alternativas(String(f.equivalencia), T.FIGURAS.map((x) => String(x.equivalencia)), rnd),
        correta: String(f.equivalencia),
        explicacao: `O número de equivalência diz quantas dessas figuras cabem numa semibreve: ${f.equivalencia}.`,
        referencia: 'MSA, pág. 17',
      };
    }
    return {
      enunciado: `Que figura tem o número de equivalência ${f.equivalencia}?`,
      alternativas: alternativas(f.nome, T.FIGURAS.map((x) => x.nome), rnd),
      correta: f.nome,
      explicacao: `Cabem ${f.equivalencia} ${f.nome}${f.equivalencia > 1 ? 's' : ''} numa semibreve.`,
      referencia: 'MSA, pág. 17',
    };
  },
});

registrar({
  id: 'f2.pausas',
  fase: 2,
  variantes: () => T.FIGURAS.slice(0, 6).flatMap((f) => [{ f: f.id, molde: 0 }, { f: f.id, molde: 1 }]),
  chave: (v) => `${v.f}-${v.molde}`,
  montar(v, rnd) {
    const f = T.figuraPorId(v.f);
    const correta = `${T.fracaoBonita(f.duracao)} tempo${f.duracao === 1 ? '' : 's'}`;
    if (v.molde === 0) {
      return {
        enunciado: 'Qual é o valor desta pausa, num compasso simples de semínima?',
        html: figuraSolta(f.id, { pausa: true, tamanho: 66 }),
        alternativas: alternativas(correta, T.FIGURAS.map((x) => `${T.fracaoBonita(x.duracao)} tempo${x.duracao === 1 ? '' : 's'}`), rnd),
        correta,
        explicacao: `É a ${f.pausa}: vale o mesmo que a ${f.nome}, ou seja, ${correta} de silêncio.`,
        referencia: 'MSA, pág. 17',
      };
    }
    return {
      enunciado: `A pausa que corresponde à ${f.nome} chama-se:`,
      alternativas: alternativas(f.pausa, T.FIGURAS.map((x) => x.pausa), rnd),
      correta: f.pausa,
      explicacao: `Cada figura tem uma pausa de mesmo valor: a da ${f.nome} é a ${f.pausa}.`,
      referencia: 'MSA, pág. 17',
    };
  },
});

registrar({
  id: 'f2.partes-da-nota',
  fase: 2,
  variantes: () => [
    { t: 'cabeça', d: 'a parte oval da nota, que se coloca na linha ou no espaço' },
    { t: 'haste', d: 'o traço vertical ligado à cabeça da nota' },
    { t: 'colchete', d: 'o gancho na ponta da haste, a partir da colcheia' },
    { t: 'barra de ligação', d: 'o traço que une as hastes de colcheias vizinhas' },
    { t: 'linha suplementar', d: 'a linha curta usada quando a nota não cabe no pentagrama' },
    { t: 'pentagrama', d: 'o conjunto de 5 linhas e 4 espaços' },
  ].flatMap((x) => [{ ...x, molde: 0 }, { ...x, molde: 1 }]),
  chave: (v) => `${v.t}-${v.molde}`,
  montar(v, rnd) {
    const repertorio = ['cabeça', 'haste', 'colchete', 'barra de ligação', 'linha suplementar', 'pentagrama', 'clave', 'ponto de aumento'];
    return {
      enunciado: v.molde === 0 ? `Como se chama ${v.d}?` : `"${v.d.charAt(0).toUpperCase() + v.d.slice(1)}" — que elemento é esse?`,
      alternativas: alternativas(v.t, repertorio, rnd),
      correta: v.t,
      explicacao: `${v.t.charAt(0).toUpperCase() + v.t.slice(1)}: ${v.d}.`,
      referencia: 'MSA, pág. 12 e 19',
    };
  },
});

// ============================================================ FASE 3
registrar({
  id: 'f3.formula-tempos',
  fase: 3,
  variantes: () => T.COMPASSOS_SIMPLES.flatMap((c) => [{ f: c.formula, molde: 0 }, { f: c.formula, molde: 1 }]),
  chave: (v) => `${v.f}-${v.molde}`,
  montar(v, rnd) {
    const c = T.COMPASSOS_SIMPLES.find((x) => x.formula === v.f);
    return {
      enunciado: v.molde === 0
        ? `Quantos tempos tem cada compasso na fórmula ${c.formula}?`
        : `Uma peça escrita em ${c.formula} tem, em cada compasso, quantos tempos?`,
      html: pentagrama({ clave: 'sol', compasso: c.formula, notas: [], largura: 200 }),
      alternativas: alternativas(String(c.tempos), ['1', '2', '3', '4', '6', '8'], rnd),
      correta: String(c.tempos),
      explicacao: `Em compasso simples, o número de cima diz quantos tempos há: ${c.formula} tem ${c.tempos}.`,
      referencia: 'MSA, pág. 24',
    };
  },
});

registrar({
  id: 'f3.formula-unidade',
  fase: 3,
  variantes: () => T.COMPASSOS_SIMPLES.map((c) => ({ f: c.formula })),
  chave: (v) => v.f,
  montar(v, rnd) {
    const c = T.COMPASSOS_SIMPLES.find((x) => x.formula === v.f);
    const figura = T.figuraPorId(c.unidade);
    return {
      enunciado: `Na fórmula ${c.formula}, que figura vale um tempo?`,
      alternativas: alternativas(figura.nome, T.FIGURAS.map((x) => x.nome), rnd),
      correta: figura.nome,
      explicacao: `O número de baixo indica a unidade de tempo: 2 = mínima, 4 = semínima, 8 = colcheia. Em ${c.formula}, é a ${figura.nome}.`,
      referencia: 'MSA, pág. 24',
    };
  },
});

registrar({
  id: 'f3.formula-especie',
  fase: 3,
  variantes: () => T.COMPASSOS_SIMPLES.map((c) => ({ f: c.formula })),
  chave: (v) => v.f,
  montar(v, rnd) {
    const c = T.COMPASSOS_SIMPLES.find((x) => x.formula === v.f);
    return {
      enunciado: `Como se classifica o compasso ${c.formula} quanto à espécie?`,
      alternativas: alternativas(c.nome, ['binário simples', 'ternário simples', 'quaternário simples', 'binário composto', 'ternário composto'], rnd),
      correta: c.nome,
      explicacao: `${c.formula} tem ${c.tempos} tempos e subdivisão binária: é ${c.nome}.`,
      referencia: 'MSA, pág. 24',
    };
  },
});

registrar({
  id: 'f3.quantas-figuras',
  fase: 3,
  variantes: () => T.COMPASSOS_SIMPLES.flatMap((c) => ['semibreve', 'minima', 'seminima', 'colcheia', 'semicolcheia']
    .map((f) => ({ c: c.formula, f }))
    .filter(({ c: formula, f }) => {
      const comp = T.COMPASSOS_SIMPLES.find((x) => x.formula === formula);
      const total = comp.tempos * T.figuraPorId(comp.unidade).duracao;
      const q = total / T.figuraPorId(f).duracao;
      return Number.isInteger(q) && q > 0 && q <= 32;
    })),
  chave: (v) => `${v.c}-${v.f}`,
  montar(v, rnd) {
    const c = T.COMPASSOS_SIMPLES.find((x) => x.formula === v.c);
    const figura = T.figuraPorId(v.f);
    const total = c.tempos * T.figuraPorId(c.unidade).duracao;
    const quantidade = Math.round(total / figura.duracao);
    return {
      enunciado: `Quantas ${figura.nome}s são necessárias para completar um compasso ${c.formula}?`,
      alternativas: alternativas(String(quantidade), ['1', '2', '3', '4', '6', '8', '12', '16', '24', '32'], rnd),
      correta: String(quantidade),
      explicacao: `O compasso ${c.formula} tem ${c.tempos} × ${T.figuraPorId(c.unidade).nome} = ${T.fracaoBonita(total)} tempos de semínima; cabem ${quantidade} ${figura.nome}s.`,
      referencia: 'MSA, pág. 24',
    };
  },
});

registrar({
  id: 'f3.completa-compasso',
  fase: 3,
  variantes: () => ['2/4', '3/4', '4/4'].flatMap((f) => ['seminima', 'minima', 'colcheia', 'semicolcheia'].flatMap((falta) =>
    [0, 1].map((arranjo) => ({ f, falta, arranjo })))),
  chave: (v) => `${v.f}-${v.falta}-${v.arranjo}`,
  montar(v, rnd) {
    const c = T.COMPASSOS_SIMPLES.find((x) => x.formula === v.f);
    const faltante = T.figuraPorId(v.falta);
    const restante = c.tempos - faltante.duracao;
    if (restante <= 0) {
      return {
        enunciado: `Uma única figura preenche sozinha o compasso ${c.formula}. Qual é ela?`,
        alternativas: alternativas(T.FIGURAS.find((f) => f.duracao === c.tempos)?.nome || 'semibreve', T.FIGURAS.map((f) => f.nome), rnd),
        correta: T.FIGURAS.find((f) => f.duracao === c.tempos)?.nome || 'semibreve',
        explicacao: `Em ${c.formula} cabem ${c.tempos} tempos.`,
        referencia: 'MSA, pág. 24',
      };
    }
    // Escreve o que já está no compasso e pergunta o que falta.
    const escrito = [];
    let sobra = restante;
    const paleta = v.arranjo === 0 ? ['seminima', 'colcheia'] : ['minima', 'seminima'];
    for (const id of paleta) {
      const f = T.figuraPorId(id);
      while (sobra - f.duracao >= -1e-9 && escrito.length < 6) { escrito.push(id); sobra = +(sobra - f.duracao).toFixed(4); }
    }
    while (sobra > 1e-9) { escrito.push('semicolcheia'); sobra = +(sobra - 0.25).toFixed(4); }
    return {
      enunciado: `Que figura falta para completar este compasso ${c.formula}?`,
      html: pentagrama({
        clave: 'sol', compasso: c.formula, largura: 320,
        notas: escrito.map((id) => ({ letra: 'Si', oitava: 4, figura: id })).concat([{ letra: 'Si', oitava: 4, figura: 'seminima', pausa: true, interrogacao: true }]),
      }),
      alternativas: alternativas(faltante.nome, T.FIGURAS.map((f) => f.nome), rnd),
      correta: faltante.nome,
      explicacao: `O compasso ${c.formula} tem ${c.tempos} tempos; o que está escrito soma ${T.fracaoBonita(restante)}. Falta ${T.fracaoBonita(faltante.duracao)} tempo(s): uma ${faltante.nome}.`,
      referencia: 'MSA, pág. 24',
    };
  },
});

registrar({
  id: 'f3.tempo-forte',
  fase: 3,
  variantes: () => [
    { f: '2/4', t: 1, r: 'forte' }, { f: '2/4', t: 2, r: 'fraco' },
    { f: '3/4', t: 1, r: 'forte' }, { f: '3/4', t: 2, r: 'fraco' }, { f: '3/4', t: 3, r: 'fraco' },
    { f: '4/4', t: 1, r: 'forte' }, { f: '4/4', t: 2, r: 'fraco' }, { f: '4/4', t: 3, r: 'meio-forte' }, { f: '4/4', t: 4, r: 'fraco' },
  ].flatMap((x) => [{ ...x, molde: 0 }, { ...x, molde: 1 }]),
  chave: (v) => `${v.f}-${v.t}-${v.molde}`,
  montar(v, rnd) {
    return {
      enunciado: v.molde === 0
        ? `No compasso ${v.f}, como é o ${ordinal[v.t]} tempo?`
        : `Num compasso ${v.f}, o acento do ${ordinal[v.t]} tempo é:`,
      alternativas: alternativas(v.r, ['forte', 'fraco', 'meio-forte'], rnd, 3),
      correta: v.r,
      explicacao: `O 1º tempo é sempre forte. Em 4/4 o 3º é meio-forte, e os demais são fracos.`,
      referencia: 'MSA, pág. 26',
    };
  },
});

registrar({
  id: 'f3.conducao',
  fase: 3,
  variantes: () => [
    { especie: 'binário', mov: 'baixo → cima', n: 2 },
    { especie: 'ternário', mov: 'baixo → lado → cima', n: 3 },
    { especie: 'quaternário', mov: 'baixo → esquerda → direita → cima', n: 4 },
  ].flatMap((x) => [{ ...x, sentido: 'movimento' }, { ...x, sentido: 'quantidade' }, { ...x, sentido: 'especie' }]),
  chave: (v) => `${v.especie}-${v.sentido}`,
  montar(v, rnd) {
    if (v.sentido === 'movimento') {
      return {
        enunciado: `Qual é o movimento de condução do compasso ${v.especie}?`,
        alternativas: alternativas(v.mov, ['baixo → cima', 'baixo → lado → cima', 'baixo → esquerda → direita → cima'], rnd, 3),
        correta: v.mov,
        explicacao: `No compasso ${v.especie} a mão faz ${v.n} movimentos: ${v.mov}.`,
        referencia: 'MSA, pág. 28',
      };
    }
    if (v.sentido === 'quantidade') {
      return {
        enunciado: `Quantos movimentos de condução tem o compasso ${v.especie}?`,
        alternativas: alternativas(String(v.n), ['2', '3', '4', '6'], rnd),
        correta: String(v.n),
        explicacao: `Um movimento para cada tempo: ${v.n}.`,
        referencia: 'MSA, pág. 28',
      };
    }
    return {
      enunciado: `O movimento "${v.mov}" conduz que espécie de compasso?`,
      alternativas: alternativas(v.especie, ['binário', 'ternário', 'quaternário'], rnd, 3),
      correta: v.especie,
      explicacao: `São ${v.n} movimentos: compasso ${v.especie}.`,
      referencia: 'MSA, pág. 28',
    };
  },
});

registrar({
  id: 'f3.conceitos',
  fase: 3,
  variantes: () => [
    { t: 'pulsação', d: 'a batida regular e constante que sustenta a música, como o tique-taque do relógio' },
    { t: 'ritmo', d: 'o desenho das durações longas e curtas apoiado na pulsação' },
    { t: 'compasso', d: 'a divisão da música em partes iguais, separadas por barras' },
    { t: 'barra de compasso', d: 'o traço vertical que separa um compasso do outro' },
    { t: 'barra final', d: 'o traço duplo, um fino e um grosso, que encerra a peça' },
    { t: 'solfejo', d: 'a leitura da música cantando o nome das notas no ritmo certo' },
    { t: 'fórmula de compasso', d: 'os dois números escritos depois da clave e da armadura' },
    { t: 'andamento', d: 'a velocidade em que a música deve ser executada' },
  ].flatMap((x) => [{ ...x, molde: 0 }, { ...x, molde: 1 }]),
  chave: (v) => `${v.t}-${v.molde}`,
  montar(v, rnd) {
    const repertorio = ['pulsação', 'ritmo', 'compasso', 'barra de compasso', 'barra final', 'solfejo', 'fórmula de compasso', 'andamento', 'armadura de clave'];
    return {
      enunciado: v.molde === 0 ? `Como se chama ${v.d}?` : `Qual termo corresponde a: ${v.d}?`,
      alternativas: alternativas(v.t, repertorio, rnd),
      correta: v.t,
      explicacao: `${v.t.charAt(0).toUpperCase() + v.t.slice(1)}: ${v.d}.`,
      referencia: 'MSA, pág. 22 a 28',
    };
  },
});

// ============================================================ FASE 4
registrar({
  id: 'f4.metronomo',
  fase: 4,
  variantes: () => [
    { p: 'Para que serve o metrônomo?', r: 'para marcar uma pulsação regular numa velocidade ajustável', e: ['para afinar o instrumento', 'para gravar o ensaio', 'para transpor a música de tom'] },
    { p: 'O que significa M.M. numa partitura?', r: 'metrônomo de Maelzel', e: ['movimento moderado', 'mínima marcada', 'meia medida'] },
    { p: 'O que quer dizer a indicação ♩ = 92?', r: '92 semínimas por minuto', e: ['92 compassos por minuto', '92 segundos de duração', '92 mínimas por minuto'] },
    { p: 'A sigla bpm significa:', r: 'batidas por minuto', e: ['barras por minuto', 'bemóis por movimento', 'batidas por medida'] },
    { p: 'Que tipos de metrônomo existem?', r: 'mecânicos e digitais', e: ['apenas mecânicos', 'apenas digitais', 'apenas de pêndulo'] },
    { p: 'Além do metrônomo, que função é recomendável ter no aparelho eletrônico do candidato?', r: 'afinador', e: ['gravador', 'amplificador', 'leitor de partitura'] },
  ],
  chave: (v) => v.p,
  montar(v, rnd) {
    return {
      enunciado: v.p,
      alternativas: embaralhar([v.r, ...v.e], rnd),
      correta: v.r,
      explicacao: `Resposta: ${v.r}.`,
      referencia: 'MSA, pág. 31',
    };
  },
});

registrar({
  id: 'f4.media-da-faixa',
  fase: 4,
  variantes: () => [[40, 60], [44, 54], [50, 66], [54, 72], [56, 76], [60, 72], [60, 80], [63, 81], [66, 84], [69, 87],
    [72, 88], [72, 96], [76, 92], [76, 100], [80, 96], [84, 104], [88, 108], [92, 112], [96, 120], [100, 120],
    [104, 132], [108, 126], [112, 132], [120, 144]].map(([a, b]) => ({ a, b })),
  chave: (v) => `${v.a}-${v.b}`,
  montar(v, rnd) {
    const media = (v.a + v.b) / 2;
    const erradas = [v.a, v.b, media + 4, media - 4, media + 6, v.b - v.a].map((x) => `${x} bpm`);
    return {
      enunciado: `Um hino traz a marcação ♩ = ${v.a} - ${v.b}. Seguindo a recomendação de ficar na média entre a velocidade mínima e a máxima, em que andamento ele deve ser entoado?`,
      alternativas: alternativas(`${media} bpm`, erradas, rnd),
      correta: `${media} bpm`,
      explicacao: `A média entre ${v.a} e ${v.b} é (${v.a} + ${v.b}) ÷ 2 = ${media} bpm.`,
      referencia: 'MSA, pág. 31',
    };
  },
});

registrar({
  id: 'f4.duracao-em-segundos',
  fase: 4,
  variantes: () => [60, 72, 80, 90, 100, 120].flatMap((bpm) => ['seminima', 'minima', 'colcheia', 'semibreve'].map((f) => ({ bpm, f }))),
  chave: (v) => `${v.bpm}-${v.f}`,
  montar(v, rnd) {
    const figura = T.figuraPorId(v.f);
    const segundos = (60 / v.bpm) * figura.duracao;
    const arredonda = (x) => `${Number(x.toFixed(3))} s`;
    const erradas = [segundos * 2, segundos / 2, segundos * 1.5, segundos * 4, segundos / 4].map(arredonda);
    return {
      enunciado: `Com o metrônomo em ♩ = ${v.bpm}, quanto tempo dura uma ${figura.nome}?`,
      alternativas: alternativas(arredonda(segundos), erradas, rnd),
      correta: arredonda(segundos),
      explicacao: `Cada semínima dura 60 ÷ ${v.bpm} = ${Number((60 / v.bpm).toFixed(3))} s. A ${figura.nome} vale ${T.fracaoBonita(figura.duracao)} tempo(s) → ${arredonda(segundos)}.`,
      referencia: 'MSA, pág. 31',
    };
  },
});

registrar({
  id: 'f4.ponto-de-aumento',
  fase: 4,
  variantes: () => T.FIGURAS.slice(0, 5).flatMap((f) => [{ f: f.id, pontos: 1, molde: 0 }, { f: f.id, pontos: 1, molde: 1 }, { f: f.id, pontos: 2, molde: 0 }]),
  chave: (v) => `${v.f}-${v.pontos}-${v.molde}`,
  montar(v, rnd) {
    const f = T.figuraPorId(v.f);
    const valor = v.pontos === 1 ? f.duracao * 1.5 : f.duracao * 1.75;
    const correta = `${T.fracaoBonita(valor)} tempo${valor === 1 ? '' : 's'}`;
    const erradas = [f.duracao, f.duracao * 2, f.duracao * 1.25, f.duracao * 3, f.duracao / 2, f.duracao * 1.5]
      .map((x) => `${T.fracaoBonita(x)} tempo${x === 1 ? '' : 's'}`);
    return {
      enunciado: v.molde === 0
        ? `Num compasso simples de semínima, quanto vale uma ${f.nome} com ${v.pontos === 1 ? 'ponto de aumento' : 'dois pontos de aumento'}?`
        : `A ${f.nome} pontuada, em compasso simples, equivale a quantos tempos?`,
      html: v.pontos === 1 ? figuraSolta(f.id, { pontuada: true, tamanho: 66 }) : '',
      alternativas: alternativas(correta, erradas, rnd),
      correta,
      explicacao: v.pontos === 1
        ? `O ponto acrescenta metade do valor: ${T.fracaoBonita(f.duracao)} + ${T.fracaoBonita(f.duracao / 2)} = ${T.fracaoBonita(valor)}.`
        : `O 1º ponto acrescenta metade e o 2º acrescenta metade do 1º: ${T.fracaoBonita(f.duracao)} + ${T.fracaoBonita(f.duracao / 2)} + ${T.fracaoBonita(f.duracao / 4)} = ${T.fracaoBonita(valor)}.`,
      referencia: 'MSA, pág. 35',
    };
  },
});

registrar({
  id: 'f4.ligadura',
  fase: 4,
  variantes: () => pares(['semibreve', 'minima', 'seminima', 'colcheia', 'semicolcheia'])
    .concat([['minima', 'minima'], ['seminima', 'seminima'], ['colcheia', 'colcheia'], ['semibreve', 'semibreve']])
    .map(([a, b]) => ({ a, b })),
  chave: (v) => `${v.a}+${v.b}`,
  montar(v, rnd) {
    const a = T.figuraPorId(v.a);
    const b = T.figuraPorId(v.b);
    const soma = a.duracao + b.duracao;
    const correta = `${T.fracaoBonita(soma)} tempo${soma === 1 ? '' : 's'}`;
    const erradas = [a.duracao, b.duracao, soma * 2, soma / 2, soma + 1, Math.abs(a.duracao - b.duracao)]
      .filter((x) => x > 0).map((x) => `${T.fracaoBonita(x)} tempo${x === 1 ? '' : 's'}`);
    return {
      enunciado: `Uma ${a.nome} ligada por ligadura de valor a uma ${b.nome}, em compasso simples de semínima, soa durante:`,
      alternativas: alternativas(correta, erradas, rnd),
      correta,
      explicacao: `A ligadura de valor soma as durações e ataca o som uma vez só: ${T.fracaoBonita(a.duracao)} + ${T.fracaoBonita(b.duracao)} = ${T.fracaoBonita(soma)}.`,
      referencia: 'MSA, pág. 38',
    };
  },
});

registrar({
  id: 'f4.conceitos',
  fase: 4,
  variantes: () => [
    { p: 'A ligadura que une duas notas de mesma altura e soma os seus valores chama-se:', r: 'ligadura de valor', e: ['ligadura de expressão', 'fermata', 'ponto de aumento'] },
    { p: 'A ligadura que une notas de alturas diferentes, pedindo que sejam tocadas sem interrupção, chama-se:', r: 'ligadura de expressão', e: ['ligadura de valor', 'tercina', 'síncopa'] },
    { p: 'O sinal que manda prolongar o som além do seu valor, a critério do regente, é:', r: 'a fermata', e: ['o ponto de aumento', 'o ritornello', 'o bequadro'] },
    { p: 'O ponto de aumento acrescenta à figura:', r: 'metade do seu valor', e: ['o dobro do seu valor', 'um tempo inteiro', 'um quarto do seu valor'] },
    { p: 'O segundo ponto de aumento acrescenta:', r: 'metade do valor do primeiro ponto', e: ['outra metade da figura', 'o valor inteiro da figura', 'nada, é apenas gráfico'] },
    { p: 'A tercina é a divisão de um valor em:', r: 'três partes iguais no lugar de duas', e: ['duas partes iguais no lugar de três', 'quatro partes iguais', 'três partes desiguais'] },
    { p: 'Uma tercina de colcheias ocupa o tempo de:', r: 'duas colcheias, ou uma semínima', e: ['três colcheias', 'uma mínima', 'quatro colcheias'] },
    { p: 'Onde se coloca o ponto de aumento?', r: 'à direita da cabeça da nota', e: ['acima da haste', 'à esquerda da nota', 'sobre a barra de compasso'] },
  ],
  chave: (v) => v.p,
  montar(v, rnd) {
    return { enunciado: v.p, alternativas: embaralhar([v.r, ...v.e], rnd), correta: v.r, explicacao: `Resposta: ${v.r}.`, referencia: 'MSA, pág. 35 a 44' };
  },
});

// ============================================================ FASE 5
registrar({
  id: 'f5.tom-ou-semitom',
  fase: 5,
  variantes: () => T.LETRAS.flatMap((l, i) => [{ a: l, b: T.LETRAS[(i + 1) % 7], molde: 0 }, { a: l, b: T.LETRAS[(i + 1) % 7], molde: 1 }]),
  chave: (v) => `${v.a}-${v.b}-${v.molde}`,
  montar(v, rnd) {
    const distancia = (T.semitomDaNota(T.nota(v.b)) - T.semitomDaNota(T.nota(v.a)) + 12) % 12;
    const correta = distancia === 1 ? 'um semitom' : 'um tom';
    return {
      enunciado: v.molde === 0
        ? `Qual é a distância entre ${v.a} e ${v.b} (notas naturais, subindo)?`
        : `Entre as notas naturais ${v.a} e ${v.b} há:`,
      alternativas: alternativas(correta, ['um semitom', 'um tom', 'um tom e meio', 'dois tons'], rnd),
      correta,
      explicacao: distancia === 1
        ? `Entre ${v.a} e ${v.b} não existe tecla preta: é ${correta}. Os únicos semitons naturais são Mi–Fá e Si–Dó.`
        : `Entre ${v.a} e ${v.b} existe uma tecla preta no meio: é ${correta}.`,
      referencia: 'MSA, pág. 52',
    };
  },
});

registrar({
  id: 'f5.acidentes',
  fase: 5,
  variantes: () => [
    { s: 'sustenido (♯)', r: 'sobe a nota um semitom' },
    { s: 'bemol (♭)', r: 'desce a nota um semitom' },
    { s: 'bequadro (♮)', r: 'cancela o acidente anterior' },
    { s: 'dobrado sustenido (𝄪)', r: 'sobe a nota um tom' },
    { s: 'dobrado bemol (𝄫)', r: 'desce a nota um tom' },
  ].flatMap((x) => [{ ...x, sentido: 'efeito' }, { ...x, sentido: 'sinal' }]),
  chave: (v) => `${v.s}-${v.sentido}`,
  montar(v, rnd) {
    const efeitos = ['sobe a nota um semitom', 'desce a nota um semitom', 'cancela o acidente anterior', 'sobe a nota um tom', 'desce a nota um tom'];
    const sinais = ['sustenido (♯)', 'bemol (♭)', 'bequadro (♮)', 'dobrado sustenido (𝄪)', 'dobrado bemol (𝄫)'];
    if (v.sentido === 'efeito') {
      return {
        enunciado: `O que faz o ${v.s}?`,
        alternativas: alternativas(v.r, efeitos, rnd),
        correta: v.r,
        explicacao: `O ${v.s} ${v.r}.`,
        referencia: 'MSA, pág. 53',
      };
    }
    return {
      enunciado: `Que acidente ${v.r}?`,
      alternativas: alternativas(v.s, sinais, rnd),
      correta: v.s,
      explicacao: `É o ${v.s}.`,
      referencia: 'MSA, pág. 53',
    };
  },
});

registrar({
  id: 'f5.altera-nota',
  fase: 5,
  variantes: () => T.LETRAS.flatMap((l) => [
    { l, op: 'sobe-semitom' }, { l, op: 'desce-semitom' }, { l, op: 'sobe-tom' }, { l, op: 'desce-tom' },
  ]),
  chave: (v) => `${v.l}-${v.op}`,
  montar(v, rnd) {
    const mapa = {
      'sobe-semitom': { texto: 'um semitom acima', alt: 1 }, 'desce-semitom': { texto: 'um semitom abaixo', alt: -1 },
      'sobe-tom': { texto: 'um tom acima', alt: 2 }, 'desce-tom': { texto: 'um tom abaixo', alt: -2 },
    }[v.op];
    const base = T.nota(v.l);
    const alvo = (T.semitomDaNota(base) + mapa.alt + 12) % 12;
    // Mantém o nome da letra quando cabe (alteração cromática); senão usa a vizinha natural.
    let resposta = null;
    for (const alteracao of [0, 1, -1, 2, -2]) {
      const candidata = T.nota(v.l, alteracao);
      if (T.semitomDaNota(candidata) === alvo && Math.abs(alteracao) <= 2) { resposta = candidata; break; }
    }
    if (!resposta || Math.abs(resposta.alteracao) > 1) {
      const vizinha = T.LETRAS.find((l) => T.SEMITONS_DA_LETRA[T.LETRAS.indexOf(l)] === alvo);
      if (vizinha) resposta = T.nota(vizinha);
    }
    const nome = T.nomeDaNota(resposta);
    const repertorio = TODAS_AS_NOTAS.map((n) => T.nomeDaNota(n));
    return {
      enunciado: `Que nota fica ${mapa.texto} de ${v.l}?`,
      alternativas: alternativas(nome, repertorio, rnd),
      correta: nome,
      explicacao: `Contando ${mapa.texto} a partir de ${v.l} no teclado, chega-se a ${nome}.`,
      referencia: 'MSA, pág. 52 e 53',
    };
  },
});

registrar({
  id: 'f5.tipo-de-semitom',
  fase: 5,
  variantes: () => [
    { a: 'Dó', b: 'Dó♯', t: 'cromático' }, { a: 'Ré', b: 'Ré♯', t: 'cromático' }, { a: 'Fá', b: 'Fá♯', t: 'cromático' },
    { a: 'Sol', b: 'Sol♯', t: 'cromático' }, { a: 'Lá', b: 'Lá♯', t: 'cromático' }, { a: 'Si', b: 'Si♭', t: 'cromático' },
    { a: 'Mi', b: 'Mi♭', t: 'cromático' }, { a: 'Lá', b: 'Lá♭', t: 'cromático' }, { a: 'Ré', b: 'Ré♭', t: 'cromático' },
    { a: 'Sol', b: 'Sol♭', t: 'cromático' }, { a: 'Dó', b: 'Dó♭', t: 'cromático' }, { a: 'Fá', b: 'Fá♯', t: 'cromático' },
    { a: 'Mi', b: 'Fá', t: 'diatônico' }, { a: 'Si', b: 'Dó', t: 'diatônico' }, { a: 'Dó', b: 'Ré♭', t: 'diatônico' },
    { a: 'Ré', b: 'Mi♭', t: 'diatônico' }, { a: 'Sol', b: 'Lá♭', t: 'diatônico' }, { a: 'Lá', b: 'Si♭', t: 'diatônico' },
    { a: 'Dó♯', b: 'Ré', t: 'diatônico' }, { a: 'Fá♯', b: 'Sol', t: 'diatônico' }, { a: 'Sol♯', b: 'Lá', t: 'diatônico' },
    { a: 'Ré♯', b: 'Mi', t: 'diatônico' }, { a: 'Lá♯', b: 'Si', t: 'diatônico' }, { a: 'Mi', b: 'Fá♯', t: 'diatônico' },
  ].filter((x, i, todos) => todos.findIndex((y) => y.a === x.a && y.b === x.b) === i),
  chave: (v) => `${v.a}-${v.b}`,
  montar(v, rnd) {
    const correta = `semitom ${v.t}`;
    return {
      enunciado: `De ${v.a} para ${v.b}, que tipo de semitom temos?`,
      alternativas: alternativas(correta, ['semitom cromático', 'semitom diatônico', 'um tom inteiro', 'uníssono'], rnd),
      correta,
      explicacao: v.t === 'cromático'
        ? `As duas notas têm o mesmo nome (${v.a} e ${v.b}): semitom cromático.`
        : `As notas têm nomes diferentes (${v.a} e ${v.b}): semitom diatônico.`,
      referencia: 'MSA, pág. 53 e 54',
    };
  },
});

registrar({
  id: 'f5.enarmonia',
  fase: 5,
  variantes: () => [
    { a: 'Dó♯', b: 'Ré♭' }, { a: 'Ré♯', b: 'Mi♭' }, { a: 'Fá♯', b: 'Sol♭' }, { a: 'Sol♯', b: 'Lá♭' },
    { a: 'Lá♯', b: 'Si♭' }, { a: 'Mi', b: 'Fá♭' }, { a: 'Si', b: 'Dó♭' }, { a: 'Fá', b: 'Mi♯' }, { a: 'Dó', b: 'Si♯' },
  ].flatMap((x) => [{ ...x, sentido: 0 }, { ...x, sentido: 1 }]),
  chave: (v) => `${v.a}-${v.b}-${v.sentido}`,
  montar(v, rnd) {
    const de = v.sentido === 0 ? v.a : v.b;
    const para = v.sentido === 0 ? v.b : v.a;
    const repertorio = TODAS_AS_NOTAS.map((n) => nomeCurto(n));
    return {
      enunciado: `Qual destas notas é enarmônica de ${de}, isto é, soa exatamente igual com outro nome?`,
      alternativas: alternativas(para, repertorio, rnd),
      correta: para,
      explicacao: `${de} e ${para} são a mesma tecla do teclado, escritas de dois modos: são enarmônicas.`,
      referencia: 'MSA, pág. 54',
    };
  },
});

registrar({
  id: 'f5.conceitos',
  fase: 5,
  variantes: () => [
    { p: 'A menor distância entre dois sons no nosso sistema musical chama-se:', r: 'semitom', e: ['tom', 'oitava', 'uníssono'] },
    { p: 'Um tom é formado por:', r: 'dois semitons', e: ['três semitons', 'meio semitom', 'quatro semitons'] },
    { p: 'Entre quais notas naturais existe apenas um semitom?', r: 'Mi–Fá e Si–Dó', e: ['Dó–Ré e Fá–Sol', 'Lá–Si e Ré–Mi', 'Sol–Lá e Dó–Ré'] },
    { p: 'Um acidente escrito no meio da música vale:', r: 'até o fim do compasso em que aparece', e: ['para a música inteira', 'só para a nota seguinte', 'para todas as oitavas até o fim'] },
    { p: 'O acidente escrito na armadura de clave vale:', r: 'para a peça inteira e em todas as oitavas', e: ['só para o primeiro compasso', 'só na oitava em que está escrito', 'até aparecer um bequadro no fim da linha'] },
    { p: 'Notas de nomes diferentes que soam exatamente iguais são chamadas:', r: 'enarmônicas', e: ['homônimas', 'sinônimas', 'relativas'] },
    { p: 'Uníssono é:', r: 'o mesmo som executado por vozes ou instrumentos diferentes ao mesmo tempo', e: ['dois sons à distância de uma oitava', 'dois sons diferentes soando juntos', 'o silêncio entre dois sons'] },
    { p: 'Quando a congregação inteira canta a mesma melodia, ela canta:', r: 'em uníssono', e: ['em harmonia', 'em contratempo', 'em cânone'] },
  ],
  chave: (v) => v.p,
  montar(v, rnd) {
    return { enunciado: v.p, alternativas: embaralhar([v.r, ...v.e], rnd), correta: v.r, explicacao: `Resposta: ${v.r}.`, referencia: 'MSA, pág. 52 a 54' };
  },
});

// ============================================================ FASE 6
const TONALIDADES_USUAIS = T.TONALIDADES.filter((t) => t.acidentes <= 6);

registrar({
  id: 'f6.grau-da-escala',
  fase: 6,
  variantes: () => TONALIDADES_USUAIS.flatMap((t) => [2, 3, 4, 5, 6, 7].map((grau) => ({ t: T.nomeDaNota(t.maior), grau }))),
  chave: (v) => `${v.t}-${v.grau}`,
  montar(v, rnd) {
    const tonalidade = T.TONALIDADES.find((x) => T.nomeDaNota(x.maior) === v.t);
    const notas = T.escala(tonalidade.maior);
    const resposta = nomeCurto(notas[v.grau - 1]);
    const repertorio = TODAS_AS_NOTAS.map((n) => nomeCurto(n));
    return {
      enunciado: `Qual é o ${ordinal[v.grau]} grau da escala de ${v.t} Maior?`,
      alternativas: alternativas(resposta, repertorio, rnd),
      correta: resposta,
      explicacao: `${v.t} Maior: ${notas.slice(0, 7).map(nomeCurto).join(' – ')}. O ${ordinal[v.grau]} grau é ${resposta}.`,
      referencia: 'MSA, pág. 61 a 65',
    };
  },
});

registrar({
  id: 'f6.quantos-acidentes',
  fase: 6,
  variantes: () => T.TONALIDADES.flatMap((t) => [{ t: T.nomeDaNota(t.maior), modo: 'maior' }, { t: T.nomeDaNota(t.menor), modo: 'menor' }]),
  chave: (v) => `${v.t}-${v.modo}`,
  montar(v, rnd) {
    const alvo = T.TONALIDADES.find((x) => T.nomeDaNota(v.modo === 'maior' ? x.maior : x.menor) === v.t);
    const correta = alvo.acidentes === 0 ? 'nenhum acidente' : `${alvo.acidentes} ${alvo.tipo}${alvo.acidentes > 1 ? 's' : ''}`;
    const repertorio = ['nenhum acidente', '1 sustenido', '2 sustenidos', '3 sustenidos', '4 sustenidos', '5 sustenidos',
      '1 bemol', '2 bemóis', '3 bemóis', '4 bemóis', '5 bemóis'];
    const arruma = (t) => t.replace('bemols', 'bemóis');
    return {
      enunciado: `Quantos acidentes tem a armadura de ${v.t} ${v.modo === 'maior' ? 'Maior' : 'menor'}?`,
      alternativas: alternativas(arruma(correta), repertorio, rnd),
      correta: arruma(correta),
      explicacao: `${v.t} ${v.modo === 'maior' ? 'Maior' : 'menor'} tem ${arruma(correta)} na armadura.`,
      referencia: 'MSA, pág. 66',
    };
  },
});

registrar({
  id: 'f6.armadura-para-tonalidade',
  fase: 6,
  variantes: () => T.TONALIDADES.filter((t) => t.acidentes <= 6).flatMap((t) => [
    { a: t.acidentes, tipo: t.tipo, modo: 'maior' }, { a: t.acidentes, tipo: t.tipo, modo: 'menor' },
  ]).filter((v, i, todos) => todos.findIndex((x) => x.a === v.a && x.tipo === v.tipo && x.modo === v.modo) === i),
  chave: (v) => `${v.a}${v.tipo}-${v.modo}`,
  montar(v, rnd) {
    const tonalidade = T.TONALIDADES.find((t) => t.acidentes === v.a && (v.a === 0 || t.tipo === v.tipo));
    const correta = T.nomeDaTonalidade(tonalidade, v.modo);
    const repertorio = T.TONALIDADES.map((t) => T.nomeDaTonalidade(t, v.modo));
    return {
      enunciado: `Que tonalidade ${v.modo === 'maior' ? 'maior' : 'menor'} corresponde a esta armadura?`,
      html: pentagrama({ clave: 'sol', armadura: { letras: T.armaduraDe(tonalidade), tipo: tonalidade.tipo }, largura: 240 }),
      alternativas: alternativas(correta, repertorio, rnd),
      correta,
      explicacao: v.a === 0
        ? 'Sem acidentes: Dó Maior ou a sua relativa, Lá menor.'
        : tonalidade.tipo === 'sustenido'
          ? `Com sustenidos, a tônica maior fica um semitom acima do último sustenido (${T.armaduraDe(tonalidade).slice(-1)[0]}♯) → ${T.nomeDaTonalidade(tonalidade, 'maior')}, relativa ${T.nomeDaTonalidade(tonalidade, 'menor')}.`
          : `Com bemóis, o penúltimo bemol dá o nome da tonalidade maior → ${T.nomeDaTonalidade(tonalidade, 'maior')}, relativa ${T.nomeDaTonalidade(tonalidade, 'menor')}.`,
      referencia: 'MSA, pág. 66',
    };
  },
});

registrar({
  id: 'f6.ordem-dos-acidentes',
  fase: 6,
  variantes: () => [1, 2, 3, 4, 5, 6, 7].flatMap((n) => [{ n, tipo: 'sustenido' }, { n, tipo: 'bemol' }]),
  chave: (v) => `${v.n}-${v.tipo}`,
  montar(v, rnd) {
    const ordem = v.tipo === 'sustenido' ? T.ORDEM_SUSTENIDOS : T.ORDEM_BEMOIS;
    const resposta = ordem[v.n - 1];
    return {
      enunciado: `Na ordem dos ${v.tipo === 'sustenido' ? 'sustenidos' : 'bemóis'} da armadura, qual é o ${ordinal[v.n]}?`,
      alternativas: alternativas(resposta, T.LETRAS, rnd),
      correta: resposta,
      explicacao: `A ordem dos ${v.tipo === 'sustenido' ? 'sustenidos é Fá, Dó, Sol, Ré, Lá, Mi, Si' : 'bemóis é Si, Mi, Lá, Ré, Sol, Dó, Fá'} — o ${ordinal[v.n]} é ${resposta}.`,
      referencia: 'MSA, pág. 66',
    };
  },
});

registrar({
  id: 'f6.escala-tem-acidente',
  fase: 6,
  variantes: () => TONALIDADES_USUAIS.filter((t) => t.acidentes > 0).map((t) => ({ t: T.nomeDaNota(t.maior) })),
  chave: (v) => v.t,
  montar(v, rnd) {
    const tonalidade = T.TONALIDADES.find((x) => T.nomeDaNota(x.maior) === v.t);
    const letras = T.armaduraDe(tonalidade);
    const sinal = tonalidade.tipo === 'sustenido' ? '♯' : '♭';
    const correta = letras.map((l) => l + sinal).join(', ');
    const repertorio = T.TONALIDADES.filter((t) => t.acidentes > 0)
      .map((t) => T.armaduraDe(t).map((l) => l + (t.tipo === 'sustenido' ? '♯' : '♭')).join(', '));
    return {
      enunciado: `Quais são os acidentes da escala de ${v.t} Maior?`,
      alternativas: alternativas(correta, repertorio, rnd),
      correta,
      explicacao: `${v.t} Maior tem ${letras.length} ${tonalidade.tipo}${letras.length > 1 ? (tonalidade.tipo === 'bemol' ? 'is' : 's') : ''}: ${correta}.`,
      referencia: 'MSA, pág. 61 a 66',
    };
  },
});

registrar({
  id: 'f6.proxima-escala',
  fase: 6,
  variantes: () => [
    ['Dó', 'Sol'], ['Sol', 'Ré'], ['Ré', 'Lá'], ['Lá', 'Mi'], ['Mi', 'Si'], ['Si', 'Fá♯'],
  ].map(([a, b]) => ({ a, b, tipo: 'sustenido' })).concat([
    ['Dó', 'Fá'], ['Fá', 'Si♭'], ['Si♭', 'Mi♭'], ['Mi♭', 'Lá♭'], ['Lá♭', 'Ré♭'], ['Ré♭', 'Sol♭'],
  ].map(([a, b]) => ({ a, b, tipo: 'bemol' }))),
  chave: (v) => `${v.a}-${v.tipo}`,
  montar(v, rnd) {
    const grau = v.tipo === 'sustenido' ? '5ª' : '4ª';
    const repertorio = T.TONALIDADES.map((t) => nomeCurto(t.maior));
    return {
      enunciado: `Partindo de ${v.a} Maior, qual é a próxima escala maior com ${v.tipo === 'sustenido' ? 'sustenidos' : 'bemóis'}?`,
      alternativas: alternativas(v.b, repertorio, rnd),
      correta: v.b,
      explicacao: `Toma-se a ${grau} nota da escala anterior como nova tônica: a ${grau} de ${v.a} é ${v.b}.`,
      referencia: 'MSA, pág. 61 a 65',
    };
  },
});

registrar({
  id: 'f6.padrao',
  fase: 6,
  variantes: () => [
    { p: 'Qual é o padrão de tons e semitons da escala maior?', r: 'T T st T T T st', e: ['T st T T st T T', 'T T T st T T st', 'st T T T st T T'] },
    { p: 'Na escala maior, entre quais graus caem os semitons?', r: 'entre o 3º e o 4º e entre o 7º e o 8º', e: ['entre o 2º e o 3º e entre o 6º e o 7º', 'entre o 1º e o 2º e entre o 5º e o 6º', 'entre o 4º e o 5º e entre o 7º e o 8º'] },
    { p: 'A escala usada como modelo para todas as escalas maiores é:', r: 'Dó Maior', e: ['Sol Maior', 'Lá menor', 'Fá Maior'] },
    { p: 'O 1º grau da escala, que dá nome à tonalidade, chama-se:', r: 'tônica', e: ['dominante', 'sensível', 'mediante'] },
    { p: 'Numa mesma armadura de clave:', r: 'nunca se misturam sustenidos e bemóis', e: ['podem aparecer os dois, se a música mudar de tom', 'só se usam bemóis', 'a ordem dos acidentes é livre'] },
    { p: 'Quando a tônica da escala é alterada por um bemol, o nome da escala:', r: 'leva o acidente junto — por exemplo, Si bemol Maior', e: ['ignora o acidente e usa só a letra', 'passa a ser o da relativa menor', 'usa sempre o nome enarmônico'] },
    { p: 'Para construir a escala maior com bemóis, parte-se de qual nota da escala anterior?', r: 'da 4ª nota', e: ['da 5ª nota', 'da 2ª nota', 'da 7ª nota'] },
    { p: 'Para construir a escala maior com sustenidos, parte-se de qual nota da escala anterior?', r: 'da 5ª nota', e: ['da 4ª nota', 'da 3ª nota', 'da 6ª nota'] },
    { p: 'A armadura de clave é escrita:', r: 'logo depois da clave, antes da fórmula de compasso', e: ['depois da fórmula de compasso', 'no fim de cada linha', 'apenas no primeiro compasso da peça'] },
  ],
  chave: (v) => v.p,
  montar(v, rnd) {
    return { enunciado: v.p, alternativas: embaralhar([v.r, ...v.e], rnd), correta: v.r, explicacao: `Resposta: ${v.r}.`, referencia: 'MSA, pág. 61 a 66' };
  },
});

// ============================================================ FASE 7
registrar({
  id: 'f7.relativa',
  fase: 7,
  variantes: () => T.TONALIDADES.flatMap((t) => [{ t: T.nomeDaNota(t.maior), sentido: 'menor' }, { t: T.nomeDaNota(t.menor), sentido: 'maior' }]),
  chave: (v) => `${v.t}-${v.sentido}`,
  montar(v, rnd) {
    const tonalidade = T.TONALIDADES.find((x) => T.nomeDaNota(v.sentido === 'menor' ? x.maior : x.menor) === v.t);
    const correta = T.nomeDaTonalidade(tonalidade, v.sentido);
    const repertorio = T.TONALIDADES.map((x) => T.nomeDaTonalidade(x, v.sentido));
    return {
      enunciado: v.sentido === 'menor'
        ? `Qual é a relativa menor de ${v.t} Maior?`
        : `De qual tonalidade maior ${v.t} menor é a relativa?`,
      alternativas: alternativas(correta, repertorio, rnd),
      correta,
      explicacao: `Relativas têm a mesma armadura; a menor fica uma 3ª menor abaixo da maior (ou no 6º grau dela): ${T.nomeDaTonalidade(tonalidade, 'maior')} ↔ ${T.nomeDaTonalidade(tonalidade, 'menor')}.`,
      referencia: 'MSA, pág. 80',
    };
  },
});

registrar({
  id: 'f7.intervalo',
  fase: 7,
  variantes: () => NOTAS_NATURAIS.flatMap((a) => NOTAS_NATURAIS.filter((b) => b.letra !== a.letra)
    .map((b) => ({ a: a.letra, b: b.letra }))),
  chave: (v) => `${v.a}-${v.b}`,
  montar(v, rnd) {
    const resultado = T.intervalo(T.nota(v.a), T.nota(v.b));
    const repertorio = ['2ª menor', '2ª maior', '3ª menor', '3ª maior', '4ª justa', '4ª aumentada', '5ª diminuta',
      '5ª justa', '6ª menor', '6ª maior', '7ª menor', '7ª maior'];
    return {
      enunciado: `Que intervalo há entre ${v.a} e ${v.b}, subindo?`,
      alternativas: alternativas(resultado.rotulo, repertorio, rnd),
      correta: resultado.rotulo,
      explicacao: `Contando os graus de ${v.a} a ${v.b} temos uma ${resultado.nome}; com ${resultado.semitons} semitons, ela é ${resultado.qualidade}.`,
      referencia: 'MSA, pág. 84',
    };
  },
});

registrar({
  id: 'f7.intervalo-tamanho',
  fase: 7,
  variantes: () => [
    { i: '2ª menor', t: '1 semitom' }, { i: '2ª maior', t: '1 tom' }, { i: '3ª menor', t: '1 tom e meio' },
    { i: '3ª maior', t: '2 tons' }, { i: '4ª justa', t: '2 tons e meio' }, { i: '5ª justa', t: '3 tons e meio' },
    { i: '6ª maior', t: '4 tons e meio' }, { i: '7ª maior', t: '5 tons e meio' }, { i: '8ª justa', t: '6 tons' },
  ].flatMap((x) => [{ ...x, sentido: 'tamanho' }, { ...x, sentido: 'nome' }]),
  chave: (v) => `${v.i}-${v.sentido}`,
  montar(v, rnd) {
    const tamanhos = ['1 semitom', '1 tom', '1 tom e meio', '2 tons', '2 tons e meio', '3 tons', '3 tons e meio', '4 tons', '4 tons e meio', '5 tons e meio', '6 tons'];
    const nomes = ['2ª menor', '2ª maior', '3ª menor', '3ª maior', '4ª justa', '5ª justa', '6ª maior', '7ª maior', '8ª justa'];
    if (v.sentido === 'tamanho') {
      return {
        enunciado: `Quantos tons e semitons tem uma ${v.i}?`,
        alternativas: alternativas(v.t, tamanhos, rnd),
        correta: v.t,
        explicacao: `A ${v.i} mede ${v.t}.`,
        referencia: 'MSA, pág. 84',
      };
    }
    return {
      enunciado: `Que intervalo mede ${v.t}?`,
      alternativas: alternativas(v.i, nomes, rnd),
      correta: v.i,
      explicacao: `${v.t} corresponde a uma ${v.i}.`,
      referencia: 'MSA, pág. 84',
    };
  },
});

registrar({
  id: 'f7.dinamica',
  fase: 7,
  variantes: () => T.DINAMICAS.flatMap((d) => [{ s: d.sigla, sentido: 'sentido' }, { s: d.sigla, sentido: 'sigla' }, { s: d.sigla, sentido: 'termo' }]),
  chave: (v) => `${v.s}-${v.sentido}`,
  montar(v, rnd) {
    const d = T.DINAMICAS.find((x) => x.sigla === v.s);
    if (v.sentido === 'sentido') {
      return {
        enunciado: `O que indica o sinal de dinâmica <b>${d.sigla}</b>?`,
        alternativas: alternativas(d.sentido, T.DINAMICAS.map((x) => x.sentido), rnd),
        correta: d.sentido,
        explicacao: `${d.sigla} é ${d.termo}: ${d.sentido}.`,
        referencia: 'MSA, pág. 93',
      };
    }
    if (v.sentido === 'sigla') {
      return {
        enunciado: `Qual sinal de dinâmica indica "${d.sentido}"?`,
        alternativas: alternativas(d.sigla, T.DINAMICAS.map((x) => x.sigla), rnd),
        correta: d.sigla,
        explicacao: `${d.sentido} = ${d.termo} = ${d.sigla}.`,
        referencia: 'MSA, pág. 93',
      };
    }
    return {
      enunciado: `Como se chama, por extenso, o sinal <b>${d.sigla}</b>?`,
      alternativas: alternativas(d.termo, T.DINAMICAS.map((x) => x.termo), rnd),
      correta: d.termo,
      explicacao: `${d.sigla} = ${d.termo} (${d.sentido}).`,
      referencia: 'MSA, pág. 93',
    };
  },
});

registrar({
  id: 'f7.conceitos',
  fase: 7,
  variantes: () => [
    { p: 'Tonalidade é:', r: 'o conjunto de sons de uma escala organizados em torno da tônica', e: ['a velocidade da execução', 'a intensidade do som', 'a divisão do compasso em tempos'] },
    { p: 'O que diferencia a tonalidade maior da menor?', r: 'a distância entre a tônica e o 3º grau', e: ['o número de tempos do compasso', 'a clave usada na pauta', 'a velocidade indicada pelo metrônomo'] },
    { p: 'Na tonalidade maior, o 3º grau está a que distância da tônica?', r: 'dois tons (3ª maior)', e: ['um tom e meio (3ª menor)', 'dois tons e meio (4ª justa)', 'três tons e meio (5ª justa)'] },
    { p: 'Na tonalidade menor, o 3º grau está a que distância da tônica?', r: 'um tom e meio (3ª menor)', e: ['dois tons (3ª maior)', 'meio tom (2ª menor)', 'três tons (4ª aumentada)'] },
    { p: 'Tonalidades relativas são as que:', r: 'têm a mesma armadura de clave', e: ['têm a mesma tônica', 'têm o mesmo número de tempos', 'usam a mesma clave'] },
    { p: 'A relativa menor está em que grau da escala maior?', r: 'no 6º grau', e: ['no 5º grau', 'no 3º grau', 'no 7º grau'] },
    { p: 'Intervalo melódico é aquele em que as notas soam:', r: 'uma depois da outra', e: ['ao mesmo tempo', 'em oitavas diferentes', 'com a mesma duração'] },
    { p: 'Intervalo harmônico é aquele em que as notas soam:', r: 'ao mesmo tempo', e: ['uma depois da outra', 'em compassos diferentes', 'em claves diferentes'] },
    { p: 'Para contar um intervalo, contam-se os graus:', r: 'incluindo as duas notas das pontas', e: ['sem contar a primeira nota', 'sem contar a última nota', 'contando apenas as teclas pretas'] },
    { p: 'O sinal ‖: … :‖ que manda repetir um trecho chama-se:', r: 'ritornello', e: ['fermata', 'ligadura de expressão', 'anacruse'] },
    { p: 'Numa peça com casa 1 e casa 2, na repetição o executante deve:', r: 'pular a casa 1 e tocar a casa 2', e: ['tocar as duas casas', 'repetir a casa 1 duas vezes', 'parar na casa 1'] },
    { p: 'A indicação D.C. (Da Capo) manda:', r: 'voltar ao início da música', e: ['acelerar o andamento', 'diminuir o volume', 'saltar para o fim'] },
    { p: 'O sinal < escrito sob a pauta indica:', r: 'crescendo — aumentar a intensidade aos poucos', e: ['diminuendo', 'acelerar o andamento', 'prolongar a última nota'] },
  ],
  chave: (v) => v.p,
  montar(v, rnd) {
    return { enunciado: v.p, alternativas: embaralhar([v.r, ...v.e], rnd), correta: v.r, explicacao: `Resposta: ${v.r}.`, referencia: 'MSA, pág. 80 a 93' };
  },
});

// ============================================================ FASE 8
registrar({
  id: 'f8.composto-tempos',
  fase: 8,
  variantes: () => T.COMPASSOS_COMPOSTOS.flatMap((c) => [{ f: c.formula, molde: 0 }, { f: c.formula, molde: 1 }]),
  chave: (v) => `${v.f}-${v.molde}`,
  montar(v, rnd) {
    const c = T.COMPASSOS_COMPOSTOS.find((x) => x.formula === v.f);
    return {
      enunciado: v.molde === 0
        ? `Quantos tempos tem o compasso ${c.formula}?`
        : `Numa peça escrita em ${c.formula}, quantos tempos o regente conduz por compasso?`,
      html: pentagrama({ clave: 'sol', compasso: c.formula, notas: [], largura: 200 }),
      alternativas: alternativas(String(c.tempos), ['2', '3', '4', '6', '8', '9', '12'], rnd),
      correta: String(c.tempos),
      explicacao: `Em compasso composto divide-se o número de cima por 3: ${c.formula.split('/')[0]} ÷ 3 = ${c.tempos} tempos.`,
      referencia: 'MSA, pág. 102',
    };
  },
});

registrar({
  id: 'f8.composto-unidade',
  fase: 8,
  variantes: () => T.COMPASSOS_COMPOSTOS.map((c) => ({ f: c.formula })),
  chave: (v) => v.f,
  montar(v, rnd) {
    const c = T.COMPASSOS_COMPOSTOS.find((x) => x.formula === v.f);
    const repertorio = ['colcheia', 'colcheia pontuada', 'semínima', 'semínima pontuada', 'semicolcheia', 'semicolcheia pontuada', 'mínima', 'mínima pontuada'];
    return {
      enunciado: `Qual é a unidade de tempo do compasso ${c.formula}?`,
      alternativas: alternativas(c.unidade, repertorio, rnd),
      correta: c.unidade,
      explicacao: `No composto a unidade de tempo é sempre pontuada: em ${c.formula}, é a ${c.unidade}.`,
      referencia: 'MSA, pág. 102',
    };
  },
});

registrar({
  id: 'f8.correspondencia',
  fase: 8,
  variantes: () => T.COMPASSOS_COMPOSTOS.flatMap((c) => [{ f: c.formula, sentido: 'simples' }, { f: c.formula, sentido: 'composto' }]),
  chave: (v) => `${v.f}-${v.sentido}`,
  montar(v, rnd) {
    const c = T.COMPASSOS_COMPOSTOS.find((x) => x.formula === v.f);
    if (v.sentido === 'simples') {
      return {
        enunciado: `Qual compasso simples corresponde ao composto ${c.formula}?`,
        alternativas: alternativas(c.simples, T.COMPASSOS_SIMPLES.map((x) => x.formula), rnd),
        correta: c.simples,
        explicacao: `${c.formula} é ${c.nome}; o simples de mesma espécie é ${c.simples}.`,
        referencia: 'MSA, pág. 104',
      };
    }
    return {
      enunciado: `Qual compasso composto corresponde ao simples ${c.simples}?`,
      alternativas: alternativas(c.formula, T.COMPASSOS_COMPOSTOS.map((x) => x.formula), rnd),
      correta: c.formula,
      explicacao: `${c.simples} é ${c.especie} simples; o composto de mesma espécie é ${c.formula}.`,
      referencia: 'MSA, pág. 104',
    };
  },
});

registrar({
  id: 'f8.simples-ou-composto',
  fase: 8,
  variantes: () => T.COMPASSOS_SIMPLES.map((c) => ({ f: c.formula, tipo: 'simples' }))
    .concat(T.COMPASSOS_COMPOSTOS.map((c) => ({ f: c.formula, tipo: 'composto' }))),
  chave: (v) => v.f,
  montar(v, rnd) {
    const correta = v.tipo === 'simples' ? 'simples, com subdivisão binária' : 'composto, com subdivisão ternária';
    return {
      enunciado: `O compasso ${v.f} é:`,
      alternativas: alternativas(correta, ['simples, com subdivisão binária', 'composto, com subdivisão ternária', 'simples, com subdivisão ternária', 'composto, com subdivisão binária'], rnd),
      correta,
      explicacao: v.tipo === 'simples'
        ? `Em ${v.f} cada tempo se divide em 2 partes iguais: compasso simples.`
        : `Em ${v.f} o número de cima é múltiplo de 3 e cada tempo se divide em 3 partes: compasso composto.`,
      referencia: 'MSA, pág. 101 e 102',
    };
  },
});

registrar({
  id: 'f8.figuras-no-composto',
  fase: 8,
  variantes: () => T.COMPASSOS_COMPOSTOS.flatMap((c) => ['colcheia', 'semicolcheia', 'seminima'].map((f) => ({ c: c.formula, f })))
    .filter(({ c, f }) => {
      const comp = T.COMPASSOS_COMPOSTOS.find((x) => x.formula === c);
      const [cima, baixo] = comp.formula.split('/').map(Number);
      const total = cima * T.FIGURAS.find((x) => x.equivalencia === baixo).duracao;
      const q = total / T.figuraPorId(f).duracao;
      return Number.isInteger(q) && q <= 48;
    }),
  chave: (v) => `${v.c}-${v.f}`,
  montar(v, rnd) {
    const comp = T.COMPASSOS_COMPOSTOS.find((x) => x.formula === v.c);
    const [cima, baixo] = comp.formula.split('/').map(Number);
    const total = cima * T.FIGURAS.find((x) => x.equivalencia === baixo).duracao;
    const figura = T.figuraPorId(v.f);
    const quantidade = Math.round(total / figura.duracao);
    return {
      enunciado: `Quantas ${figura.nome}s completam um compasso ${comp.formula}?`,
      alternativas: alternativas(String(quantidade), ['2', '3', '4', '6', '9', '12', '18', '24', '36', '48'], rnd),
      correta: String(quantidade),
      explicacao: `${comp.formula} = ${cima} ${T.FIGURAS.find((x) => x.equivalencia === baixo).nome}s por compasso; em ${figura.nome}s, dá ${quantidade}.`,
      referencia: 'MSA, pág. 102',
    };
  },
});

registrar({
  id: 'f8.conceitos',
  fase: 8,
  variantes: () => [
    { p: 'Subdivisão binária é aquela em que cada tempo se divide em:', r: '2 partes iguais', e: ['3 partes iguais', '4 partes desiguais', '6 partes iguais'] },
    { p: 'Subdivisão ternária é aquela em que cada tempo se divide em:', r: '3 partes iguais', e: ['2 partes iguais', '4 partes iguais', '3 partes desiguais'] },
    { p: 'O compasso composto tem subdivisão:', r: 'ternária', e: ['binária', 'quaternária', 'livre'] },
    { p: 'No compasso composto, para achar o número de tempos, divide-se o número de cima por:', r: '3', e: ['2', '4', '6'] },
    { p: 'A unidade de tempo do compasso composto é sempre uma figura:', r: 'pontuada', e: ['ligada', 'sem haste', 'com bandeirola dupla'] },
    { p: 'O compasso 6/8 conduz-se com o mesmo movimento de qual compasso simples?', r: '2/4', e: ['3/4', '4/4', '6/4'] },
    { p: 'Em andamento lento, um compasso 9/8 pode ser conduzido com quantos movimentos?', r: '9, subdividindo cada tempo', e: ['6', '4', '12'] },
    { p: 'Em 6/8, quantas colcheias formam um tempo?', r: '3', e: ['2', '6', '4'] },
    { p: 'O que muda entre 3/4 e 9/8?', r: 'a subdivisão de cada tempo, que passa de binária para ternária', e: ['o número de tempos, que passa de 3 para 9', 'a clave da peça', 'a armadura de clave'] },
  ],
  chave: (v) => v.p,
  montar(v, rnd) {
    return { enunciado: v.p, alternativas: embaralhar([v.r, ...v.e], rnd), correta: v.r, explicacao: `Resposta: ${v.r}.`, referencia: 'MSA, pág. 101 a 106' };
  },
});

// ============================================================ FASE 9
registrar({
  id: 'f9.sincopa-contratempo',
  fase: 9,
  variantes: () => ['2/4', '3/4', '4/4', '6/8'].flatMap((c) => [
    { c, onde: 'na segunda metade do 1º tempo', prolonga: true },
    { c, onde: 'na segunda metade do 1º tempo', prolonga: false },
    { c, onde: 'na segunda metade do 2º tempo', prolonga: true },
    { c, onde: 'na segunda metade do 2º tempo', prolonga: false },
    { c, onde: 'na parte fraca do tempo, logo depois de uma pausa', prolonga: false },
    { c, onde: 'no contratempo, com ligadura até a batida seguinte', prolonga: true },
  ]),
  chave: (v) => `${v.c}-${v.onde}-${v.prolonga}`,
  montar(v, rnd) {
    const correta = v.prolonga ? 'síncopa' : 'contratempo';
    return {
      enunciado: `Num compasso ${v.c}, uma nota ataca ${v.onde} e ${v.prolonga ? '<b>prolonga-se sobre</b>' : '<b>não alcança</b>'} o tempo forte seguinte (que fica ${v.prolonga ? 'coberto por ela' : 'em silêncio'}). Como se chama esse recurso?`,
      alternativas: alternativas(correta, ['síncopa', 'contratempo', 'anacruse', 'tercina'], rnd),
      correta,
      explicacao: v.prolonga
        ? 'Quando o som começa no fraco e invade o tempo forte, é síncopa.'
        : 'Quando o som começa no fraco e o tempo forte fica em silêncio, é contratempo.',
      referencia: 'MSA, pág. 111 e 114',
    };
  },
});

registrar({
  id: 'f9.ritmo-inicial-caso',
  fase: 9,
  variantes: () => ['2/4', '3/4', '4/4', '6/8'].flatMap((c) => [
    { c, i: 'o primeiro compasso está completo e a música ataca no 1º tempo', r: 'tético' },
    { c, i: 'a música começa com uma nota antes da primeira barra de compasso, num compasso incompleto', r: 'anacrústico' },
    { c, i: 'o primeiro compasso começa com uma pausa no 1º tempo', r: 'acéfalo' },
    { c, i: 'a peça abre com uma pausa não escrita no tempo forte, e o som entra depois dela', r: 'acéfalo' },
    { c, i: 'a melodia entra no último tempo do compasso anterior, apoiando-se no 1º tempo seguinte', r: 'anacrústico' },
    { c, i: 'o ataque cai exatamente no tempo forte, com o compasso cheio', r: 'tético' },
  ]),
  chave: (v) => `${v.c}-${v.i}`,
  montar(v, rnd) {
    return {
      enunciado: `Um hino em ${v.c} começa assim: ${v.i}. Qual é o ritmo inicial?`,
      alternativas: alternativas(v.r, ['tético', 'anacrústico', 'acéfalo', 'sincopado'], rnd),
      correta: v.r,
      explicacao: {
        tético: 'Tético: a peça começa no 1º tempo, forte, com o compasso completo.',
        anacrústico: 'Anacrústico: a peça começa antes do 1º tempo forte, com um compasso incompleto (anacruse).',
        acéfalo: 'Acéfalo: o 1º tempo é ocupado por pausa, escrita ou não escrita.',
      }[v.r],
      referencia: 'MSA, pág. 118',
    };
  },
});

registrar({
  id: 'f9.conceitos',
  fase: 9,
  variantes: () => [
    { p: 'Síncopa é a nota que:', r: 'começa em tempo ou parte fraca e se prolonga sobre o tempo forte', e: ['começa e termina no tempo forte', 'ataca no fraco e para antes do forte', 'dura exatamente um compasso'] },
    { p: 'Contratempo é o som que:', r: 'ataca no tempo fraco enquanto o tempo forte fica em silêncio', e: ['ataca no tempo forte', 'se prolonga sobre o tempo forte', 'divide o tempo em três partes'] },
    { p: 'A diferença essencial entre síncopa e contratempo está em:', r: 'o som invadir ou não o tempo forte', e: ['o compasso ser simples ou composto', 'a clave utilizada', 'o andamento da peça'] },
    { p: 'O ritmo inicial em que a música começa no 1º tempo, com o compasso completo, chama-se:', r: 'tético', e: ['anacrústico', 'acéfalo', 'sincopado'] },
    { p: 'O ritmo inicial que começa antes do tempo forte, com compasso incompleto, chama-se:', r: 'anacrústico', e: ['tético', 'acéfalo', 'ternário'] },
    { p: 'O ritmo inicial que começa com pausa no 1º tempo chama-se:', r: 'acéfalo', e: ['tético', 'anacrústico', 'sincopado'] },
    { p: 'O compasso incompleto do início de uma peça anacrústica chama-se:', r: 'anacruse', e: ['acéfalo', 'ritornello', 'semifrase'] },
    { p: 'Os ritmos iniciais:', r: 'somente iniciam a partitura, nunca aparecem no meio dela', e: ['aparecem em qualquer ponto da peça', 'só aparecem no fim da peça', 'aparecem uma vez em cada frase'] },
    { p: 'Um contratempo que aparece no meio do hino é:', r: 'apenas um contratempo, e não um ritmo inicial acéfalo', e: ['sempre um ritmo acéfalo', 'sempre uma síncopa', 'um erro de grafia'] },
    { p: 'Considera-se acéfalo o compasso inicial cujas notas abrangem:', r: 'mais da metade do compasso binário ou quaternário, ou mais de dois terços do ternário', e: ['menos de um quarto do compasso', 'exatamente metade do compasso', 'qualquer parte do compasso'] },
    { p: 'No hinário, quantos hinos acéfalos existem?', r: 'dois', e: ['nenhum', 'cinco', 'doze'] },
    { p: 'Os dois hinos acéfalos do hinário são:', r: 'o 208 e o 377', e: ['o 303 e o 337', 'o 433 e o 440', 'o 121 e o 158'] },
    { p: 'Nos dois hinos acéfalos do hinário, a pausa inicial:', r: 'não está escrita', e: ['está escrita como pausa de semínima', 'está escrita como pausa de mínima', 'aparece só na voz do baixo'] },
    { p: 'Quando o contratempo está no primeiro tempo da peça, ele recebe o nome de:', r: 'ritmo inicial acéfalo', e: ['anacruse', 'síncopa', 'tercina'] },
  ],
  chave: (v) => v.p,
  montar(v, rnd) {
    return { enunciado: v.p, alternativas: embaralhar([v.r, ...v.e], rnd), correta: v.r, explicacao: `Resposta: ${v.r}.`, referencia: 'MSA, pág. 111 a 121' };
  },
});

registrar({
  id: 'f9.hinos',
  fase: 9,
  variantes: () => [
    { h: '208', t: 'Conserva a paz, ó minha alma' },
    { h: '377', t: 'No céu, Senhor, no céu' },
  ].flatMap((x) => [{ ...x, sentido: 'titulo' }, { ...x, sentido: 'numero' }, { ...x, sentido: 'classificacao' }]),
  chave: (v) => `${v.h}-${v.sentido}`,
  montar(v, rnd) {
    if (v.sentido === 'titulo') {
      return {
        enunciado: `Qual é o título do hino ${v.h}, um dos dois hinos acéfalos do hinário?`,
        alternativas: alternativas(v.t, ['Conserva a paz, ó minha alma', 'No céu, Senhor, no céu', 'Ó Deus, escuta o meu clamor', 'Cantai ao Senhor um novo cântico'], rnd),
        correta: v.t,
        explicacao: `O hino ${v.h} é "${v.t}".`,
        referencia: 'MSA, pág. 121',
      };
    }
    if (v.sentido === 'numero') {
      return {
        enunciado: `Que número tem, no hinário, o hino acéfalo "${v.t}"?`,
        alternativas: alternativas(v.h, ['208', '377', '303', '337', '433', '440'], rnd),
        correta: v.h,
        explicacao: `"${v.t}" é o hino ${v.h}.`,
        referencia: 'MSA, pág. 121',
      };
    }
    return {
      enunciado: `O hino ${v.h} ("${v.t}") tem que ritmo inicial?`,
      alternativas: alternativas('acéfalo, sem pausa inicial escrita', ['tético', 'anacrústico', 'acéfalo, com pausa inicial escrita', 'acéfalo, sem pausa inicial escrita'], rnd),
      correta: 'acéfalo, sem pausa inicial escrita',
      explicacao: `Os dois hinos acéfalos do hinário — 208 e 377 — são acéfalos sem pausa inicial escrita.`,
      referencia: 'MSA, pág. 121',
    };
  },
});

// ============================================================ FASE 10
registrar({
  id: 'f10.andamento',
  fase: 10,
  variantes: () => T.ANDAMENTOS.flatMap((a) => [{ t: a.termo, sentido: 'sentido' }, { t: a.termo, sentido: 'faixa' }, { t: a.termo, sentido: 'termo' }]),
  chave: (v) => `${v.t}-${v.sentido}`,
  montar(v, rnd) {
    const a = T.ANDAMENTOS.find((x) => x.termo === v.t);
    if (v.sentido === 'sentido') {
      return {
        enunciado: `O que indica o termo de andamento <i>${a.termo}</i>?`,
        alternativas: alternativas(a.sentido, T.ANDAMENTOS.map((x) => x.sentido), rnd),
        correta: a.sentido,
        explicacao: `<i>${a.termo}</i> significa ${a.sentido} (${a.faixa}).`,
        referencia: 'MSA, pág. 129',
      };
    }
    if (v.sentido === 'faixa') {
      return {
        enunciado: `A que velocidade aproximada corresponde o andamento <i>${a.termo}</i>?`,
        alternativas: alternativas(a.faixa, T.ANDAMENTOS.map((x) => x.faixa), rnd),
        correta: a.faixa,
        explicacao: `<i>${a.termo}</i> fica em torno de ${a.faixa}.`,
        referencia: 'MSA, pág. 129',
      };
    }
    return {
      enunciado: `Que termo indica um andamento ${a.sentido}?`,
      alternativas: alternativas(a.termo, T.ANDAMENTOS.map((x) => x.termo), rnd),
      correta: a.termo,
      explicacao: `${a.sentido.charAt(0).toUpperCase() + a.sentido.slice(1)} = <i>${a.termo}</i>.`,
      referencia: 'MSA, pág. 129',
    };
  },
});

registrar({
  id: 'f10.mais-rapido',
  fase: 10,
  variantes: () => pares(T.ANDAMENTOS.map((a) => a.termo)).flatMap(([a, b]) => [{ a, b, pergunta: 'rápido' }, { a, b, pergunta: 'lento' }]),
  chave: (v) => `${v.a}-${v.b}-${v.pergunta}`,
  montar(v, rnd) {
    const indices = T.ANDAMENTOS.map((x) => x.termo);
    const maisRapido = indices.indexOf(v.a) > indices.indexOf(v.b) ? v.a : v.b;
    const maisLento = maisRapido === v.a ? v.b : v.a;
    const correta = v.pergunta === 'rápido' ? maisRapido : maisLento;
    return {
      enunciado: `Entre <i>${v.a}</i> e <i>${v.b}</i>, qual é o andamento mais ${v.pergunta}?`,
      alternativas: embaralhar([v.a, v.b], rnd),
      correta,
      explicacao: `Do mais lento ao mais rápido: ${indices.map((t) => t).join(' < ')}. Logo, o mais ${v.pergunta} é <i>${correta}</i>.`,
      referencia: 'MSA, pág. 129',
    };
  },
});

registrar({
  id: 'f10.expressao',
  fase: 10,
  variantes: () => T.TERMOS_DE_EXPRESSAO.flatMap((t) => [{ t: t.termo, sentido: 'sentido' }, { t: t.termo, sentido: 'termo' }]),
  chave: (v) => `${v.t}-${v.sentido}`,
  montar(v, rnd) {
    const item = T.TERMOS_DE_EXPRESSAO.find((x) => x.termo === v.t);
    if (v.sentido === 'sentido') {
      return {
        enunciado: `O que significa a indicação <i>${item.termo}</i>?`,
        alternativas: alternativas(item.sentido, T.TERMOS_DE_EXPRESSAO.map((x) => x.sentido), rnd),
        correta: item.sentido,
        explicacao: `<i>${item.termo}</i>: ${item.sentido}.`,
        referencia: 'MSA, pág. 131',
      };
    }
    return {
      enunciado: `Que indicação manda executar ${item.sentido}?`,
      alternativas: alternativas(item.termo, T.TERMOS_DE_EXPRESSAO.map((x) => x.termo), rnd),
      correta: item.termo,
      explicacao: `É <i>${item.termo}</i>.`,
      referencia: 'MSA, pág. 131',
    };
  },
});

registrar({
  id: 'f10.pontuada-no-contexto',
  fase: 10,
  variantes: () => [
    { f: 'seminima', c: '4/4', tipo: 'simples' }, { f: 'seminima', c: '3/4', tipo: 'simples' },
    { f: 'seminima', c: '2/4', tipo: 'simples' }, { f: 'minima', c: '4/4', tipo: 'simples' },
    { f: 'minima', c: '3/4', tipo: 'simples' }, { f: 'colcheia', c: '4/4', tipo: 'simples' },
    { f: 'colcheia', c: '6/8', tipo: 'composto' }, { f: 'colcheia', c: '9/8', tipo: 'composto' },
    { f: 'colcheia', c: '12/8', tipo: 'composto' }, { f: 'seminima', c: '6/4', tipo: 'composto' },
    { f: 'seminima', c: '9/4', tipo: 'composto' }, { f: 'semicolcheia', c: '6/16', tipo: 'composto' },
  ],
  chave: (v) => `${v.f}-${v.c}`,
  montar(v, rnd) {
    const figura = T.figuraPorId(v.f);
    let correta;
    if (v.tipo === 'composto') correta = '1 tempo inteiro';
    else {
      const valor = figura.duracao * 1.5;
      const unidade = T.figuraPorId(T.COMPASSOS_SIMPLES.find((x) => x.formula === v.c).unidade).duracao;
      const emTempos = valor / unidade;
      correta = `${T.fracaoBonita(emTempos)} tempo${emTempos === 1 ? '' : 's'}`;
    }
    const erradas = ['1 tempo inteiro', 'meio tempo', '1 e 1/2 tempos', '2 tempos', '3 tempos', '3/4 de tempo'];
    return {
      enunciado: `Num compasso ${v.c}, quanto vale uma ${figura.nome} pontuada?`,
      html: figuraSolta(v.f, { pontuada: true, tamanho: 62 }),
      alternativas: alternativas(correta, erradas, rnd),
      correta,
      explicacao: v.tipo === 'composto'
        ? `${v.c} é compasso composto: a unidade de tempo já é a ${figura.nome} pontuada, que vale 1 tempo inteiro.`
        : `${v.c} é compasso simples: a ${figura.nome} pontuada vale o seu valor mais a metade, ou seja, ${correta}.`,
      referencia: 'MSA, pág. 126',
    };
  },
});

registrar({
  id: 'f10.forma',
  fase: 10,
  variantes: () => [
    { p: 'Frase musical é:', r: 'uma ideia musical completa, com sentido próprio', e: ['a metade de uma ideia musical', 'um compasso isolado', 'o mesmo que armadura de clave'] },
    { p: 'Semifrase é:', r: 'a metade de uma frase musical', e: ['o dobro de uma frase', 'a repetição da frase', 'a última nota da frase'] },
    { p: 'Uma frase musical costuma ter:', r: '4 ou 8 compassos', e: ['1 ou 2 compassos', '16 ou 32 compassos', 'número sempre ímpar de compassos'] },
    { p: 'A divisão em frases e semifrases orienta principalmente:', r: 'onde respirar e como frasear', e: ['a escolha da clave', 'o número de acidentes na armadura', 'a espessura da barra final'] },
    { p: 'A indicação <i>solene</i> no alto da partitura diz respeito a:', r: 'ao caráter da execução', e: ['à velocidade exata em bpm', 'à altura das notas', 'ao número de vozes'] },
    { p: 'Dinâmica trata de:', r: 'intensidade — forte e fraco', e: ['velocidade — rápido e lento', 'altura — grave e agudo', 'duração — longo e curto'] },
    { p: 'Agógica trata de:', r: 'variações de andamento durante a peça', e: ['variações de intensidade', 'variações de timbre', 'variações de armadura'] },
    { p: '<i>A tempo</i> significa:', r: 'voltar à velocidade original', e: ['acelerar até o fim', 'diminuir o volume', 'repetir o trecho anterior'] },
    { p: 'A diferença entre <i>ritenuto</i> e <i>rallentando</i> é que:', r: 'o ritenuto retém o andamento de imediato e o rallentando alarga aos poucos', e: ['são exatamente sinônimos', 'o ritenuto é mais rápido que o andamento original', 'o rallentando só vale para o último compasso'] },
    { p: 'A fermata sobre a última nota de um hino indica:', r: 'prolongar o som além do seu valor, a critério do regente', e: ['repetir a nota', 'tocar a nota mais forte', 'encurtar a nota'] },
  ],
  chave: (v) => v.p,
  montar(v, rnd) {
    return { enunciado: v.p, alternativas: embaralhar([v.r, ...v.e], rnd), correta: v.r, explicacao: `Resposta: ${v.r}.`, referencia: 'MSA, pág. 131 a 138' };
  },
});


// -------------------------------------------------- reforços das fases 4, 8, 9 e 10
const VALORES_COMPARAVEIS = [
  { rotulo: 'semibreve', v: 4 }, { rotulo: 'mínima', v: 2 }, { rotulo: 'semínima', v: 1 },
  { rotulo: 'colcheia', v: 0.5 }, { rotulo: 'semicolcheia', v: 0.25 },
  { rotulo: 'mínima pontuada', v: 3 }, { rotulo: 'semínima pontuada', v: 1.5 },
  { rotulo: 'colcheia pontuada', v: 0.75 }, { rotulo: 'semibreve pontuada', v: 6 },
  { rotulo: 'mínima ligada a uma semínima', v: 3 }, { rotulo: 'semínima ligada a uma colcheia', v: 1.5 },
  { rotulo: 'duas semínimas ligadas', v: 2 },
];

registrar({
  id: 'f4.compara-valores',
  fase: 4,
  variantes: () => pares(VALORES_COMPARAVEIS.map((x) => x.rotulo))
    .filter(([a, b]) => VALORES_COMPARAVEIS.find((x) => x.rotulo === a).v !== VALORES_COMPARAVEIS.find((x) => x.rotulo === b).v)
    .map(([a, b]) => ({ a, b })),
  chave: (v) => `${v.a}|${v.b}`,
  montar(v, rnd) {
    const a = VALORES_COMPARAVEIS.find((x) => x.rotulo === v.a);
    const b = VALORES_COMPARAVEIS.find((x) => x.rotulo === v.b);
    const maior = a.v > b.v ? a : b;
    return {
      enunciado: `Em compasso simples de semínima, qual dura mais: uma ${v.a} ou uma ${v.b}?`,
      alternativas: embaralhar([v.a, v.b], rnd),
      correta: maior.rotulo,
      explicacao: `${v.a} = ${T.fracaoBonita(a.v)} tempo(s); ${v.b} = ${T.fracaoBonita(b.v)} tempo(s). Dura mais a ${maior.rotulo}.`,
      referencia: 'MSA, pág. 35 e 38',
    };
  },
});

registrar({
  id: 'f4.tercina-conta',
  fase: 4,
  variantes: () => [
    { f: 'colcheia', ocupa: 'uma semínima', equivale: 'duas colcheias' },
    { f: 'semínima', ocupa: 'uma mínima', equivale: 'duas semínimas' },
    { f: 'semicolcheia', ocupa: 'uma colcheia', equivale: 'duas semicolcheias' },
    { f: 'mínima', ocupa: 'uma semibreve', equivale: 'duas mínimas' },
  ].flatMap((x) => [{ ...x, sentido: 'ocupa' }, { ...x, sentido: 'equivale' }, { ...x, sentido: 'quantas' }]),
  chave: (v) => `${v.f}-${v.sentido}`,
  montar(v, rnd) {
    if (v.sentido === 'ocupa') {
      return {
        enunciado: `Uma tercina de ${v.f}s ocupa a duração de:`,
        alternativas: alternativas(v.ocupa, ['uma semínima', 'uma mínima', 'uma semibreve', 'uma colcheia'], rnd),
        correta: v.ocupa,
        explicacao: `A tercina põe 3 figuras no lugar de 2: 3 ${v.f}s ocupam ${v.ocupa}.`,
        referencia: 'MSA, pág. 44',
      };
    }
    if (v.sentido === 'equivale') {
      return {
        enunciado: `Uma tercina de ${v.f}s vale o mesmo que:`,
        alternativas: alternativas(v.equivale, ['duas colcheias', 'duas semínimas', 'duas semicolcheias', 'duas mínimas'], rnd),
        correta: v.equivale,
        explicacao: `As 3 figuras da tercina cabem no tempo de ${v.equivale}.`,
        referencia: 'MSA, pág. 44',
      };
    }
    return {
      enunciado: `Quantas figuras tem uma tercina de ${v.f}s?`,
      alternativas: alternativas('3', ['2', '3', '4', '6'], rnd),
      correta: '3',
      explicacao: 'Tercina = três figuras iguais no tempo de duas.',
      referencia: 'MSA, pág. 44',
    };
  },
});

registrar({
  id: 'f8.tempo-em-figuras',
  fase: 8,
  variantes: () => T.COMPASSOS_COMPOSTOS.flatMap((c) => ['a subdivisão do tempo', 'o tempo inteiro'].map((alvo) => ({ f: c.formula, alvo }))),
  chave: (v) => `${v.f}-${v.alvo}`,
  montar(v, rnd) {
    const c = T.COMPASSOS_COMPOSTOS.find((x) => x.formula === v.f);
    const baixo = Number(c.formula.split('/')[1]);
    const figuraBase = T.FIGURAS.find((x) => x.equivalencia === baixo);
    if (v.alvo === 'a subdivisão do tempo') {
      return {
        enunciado: `Em ${c.formula}, cada tempo se divide em quantas ${figuraBase.nome}s?`,
        alternativas: alternativas('3', ['2', '3', '4', '6'], rnd),
        correta: '3',
        explicacao: `No compasso composto o tempo é sempre ternário: 3 ${figuraBase.nome}s por tempo.`,
        referencia: 'MSA, pág. 102',
      };
    }
    return {
      enunciado: `Em ${c.formula}, quantas ${figuraBase.nome}s há no compasso inteiro?`,
      alternativas: alternativas(c.formula.split('/')[0], ['2', '3', '4', '6', '9', '12'], rnd),
      correta: c.formula.split('/')[0],
      explicacao: `O número de cima conta as figuras do compasso: ${c.formula.split('/')[0]} ${figuraBase.nome}s, agrupadas de 3 em 3.`,
      referencia: 'MSA, pág. 102',
    };
  },
});

registrar({
  id: 'f8.conducao-composto',
  fase: 8,
  variantes: () => T.COMPASSOS_COMPOSTOS.flatMap((c) => [{ f: c.formula, sentido: 'movimentos' }, { f: c.formula, sentido: 'subdividido' }, { f: c.formula, sentido: 'especie' }]),
  chave: (v) => `${v.f}-${v.sentido}`,
  montar(v, rnd) {
    const c = T.COMPASSOS_COMPOSTOS.find((x) => x.formula === v.f);
    if (v.sentido === 'movimentos') {
      return {
        enunciado: `Quantos movimentos de condução tem o compasso ${c.formula} em andamento normal?`,
        alternativas: alternativas(String(c.tempos), ['2', '3', '4', '6', '9', '12'], rnd),
        correta: String(c.tempos),
        explicacao: `${c.formula} tem ${c.tempos} tempos: são ${c.tempos} movimentos, como no ${c.simples}.`,
        referencia: 'MSA, pág. 104',
      };
    }
    if (v.sentido === 'subdividido') {
      const total = String(c.tempos * 3);
      return {
        enunciado: `Em andamento lento, conduzindo ${c.formula} subdividido, quantos movimentos são feitos?`,
        alternativas: alternativas(total, ['2', '3', '4', '6', '9', '12', '18'], rnd),
        correta: total,
        explicacao: `Cada um dos ${c.tempos} tempos tem 3 subdivisões: ${c.tempos} × 3 = ${total} movimentos.`,
        referencia: 'MSA, pág. 106',
      };
    }
    return {
      enunciado: `A que espécie pertence o compasso ${c.formula}?`,
      alternativas: alternativas(c.nome, ['binário composto', 'ternário composto', 'quaternário composto', 'binário simples'], rnd),
      correta: c.nome,
      explicacao: `${c.formula}: ${c.tempos} tempos com subdivisão ternária = ${c.nome}.`,
      referencia: 'MSA, pág. 104',
    };
  },
});

registrar({
  id: 'f9.acefalo-medida',
  fase: 9,
  variantes: () => [
    { c: '2/4', regra: 'mais da metade do compasso' }, { c: '4/4', regra: 'mais da metade do compasso' },
    { c: '2/2', regra: 'mais da metade do compasso' }, { c: '6/8', regra: 'mais da metade do compasso' },
    { c: '3/4', regra: 'mais de dois terços do compasso' }, { c: '3/2', regra: 'mais de dois terços do compasso' },
    { c: '9/8', regra: 'mais de dois terços do compasso' }, { c: '3/8', regra: 'mais de dois terços do compasso' },
  ].flatMap((x) => [{ ...x, molde: 0 }, { ...x, molde: 1 }]),
  chave: (v) => `${v.c}-${v.molde}`,
  montar(v, rnd) {
    return {
      enunciado: v.molde === 0
        ? `Num compasso ${v.c}, o ritmo inicial é considerado acéfalo quando as notas do primeiro compasso abrangem:`
        : `Para classificar como acéfalo o primeiro compasso de uma peça em ${v.c}, as notas devem ocupar:`,
      alternativas: alternativas(v.regra, ['mais da metade do compasso', 'mais de dois terços do compasso', 'menos de um quarto do compasso', 'exatamente um tempo'], rnd),
      correta: v.regra,
      explicacao: 'Binário e quaternário: mais da metade. Ternário: mais de dois terços.',
      referencia: 'MSA, pág. 118',
    };
  },
});

registrar({
  id: 'f9.padrao-ritmico',
  fase: 9,
  variantes: () => [
    { d: 'colcheia — semínima — colcheia, tudo ligado ao tempo seguinte', r: 'síncopa' },
    { d: 'pausa de colcheia — colcheia, em cada tempo', r: 'contratempo' },
    { d: 'semínima — mínima — semínima em 4/4', r: 'síncopa' },
    { d: 'pausa de semínima no 1º tempo e nota no 2º', r: 'contratempo' },
    { d: 'nota curta no fim do tempo, ligada por ligadura ao tempo forte seguinte', r: 'síncopa' },
    { d: 'ataques sempre nas partes fracas, com o tempo forte em pausa', r: 'contratempo' },
    { d: 'nota longa começando na segunda colcheia do tempo e atravessando a batida', r: 'síncopa' },
    { d: 'pausa de colcheia no tempo forte e colcheia logo depois, sem prolongar', r: 'contratempo' },
  ].flatMap((x) => [{ ...x, molde: 0 }, { ...x, molde: 1 }]),
  chave: (v) => `${v.d}-${v.molde}`,
  montar(v, rnd) {
    return {
      enunciado: v.molde === 0
        ? `Um trecho traz o seguinte desenho: ${v.d}. Trata-se de:`
        : `Como se classifica este desenho rítmico — ${v.d}?`,
      alternativas: alternativas(v.r, ['síncopa', 'contratempo', 'tercina', 'anacruse'], rnd),
      correta: v.r,
      explicacao: v.r === 'síncopa'
        ? 'O som atravessa o tempo forte: síncopa.'
        : 'O tempo forte fica em silêncio e o som entra depois: contratempo.',
      referencia: 'MSA, pág. 111 e 114',
    };
  },
});

registrar({
  id: 'f10.bpm-para-termo',
  fase: 10,
  variantes: () => [46, 52, 58, 70, 74, 84, 96, 100, 112, 116, 130, 140, 152, 176, 190].map((bpm) => ({ bpm })),
  chave: (v) => String(v.bpm),
  montar(v, rnd) {
    const faixas = [
      { termo: 'Largo', min: 40, max: 60 }, { termo: 'Adagio', min: 61, max: 76 },
      { termo: 'Andante', min: 77, max: 107 }, { termo: 'Moderato', min: 108, max: 119 },
      { termo: 'Allegro', min: 120, max: 167 }, { termo: 'Presto', min: 168, max: 200 },
    ];
    const correta = faixas.find((f) => v.bpm >= f.min && v.bpm <= f.max).termo;
    return {
      enunciado: `A indicação ♩ = ${v.bpm} corresponde aproximadamente a que termo de andamento?`,
      alternativas: alternativas(correta, faixas.map((f) => f.termo), rnd),
      correta,
      explicacao: `${v.bpm} bpm cai na faixa de <i>${correta}</i>.`,
      referencia: 'MSA, pág. 129',
    };
  },
});

registrar({
  id: 'f10.classifica-indicacao',
  fase: 10,
  variantes: () => [
    { t: 'Allegro', c: 'andamento' }, { t: 'Adagio', c: 'andamento' }, { t: 'Moderato', c: 'andamento' },
    { t: 'pianissimo', c: 'dinâmica' }, { t: 'forte', c: 'dinâmica' }, { t: 'crescendo', c: 'dinâmica' },
    { t: 'diminuendo', c: 'dinâmica' }, { t: 'ritenuto', c: 'agógica' }, { t: 'poco rallentando', c: 'agógica' },
    { t: 'a tempo', c: 'agógica' }, { t: 'solene', c: 'caráter' }, { t: 'legato', c: 'articulação' },
    { t: 'staccato', c: 'articulação' }, { t: 'fermata', c: 'agógica' },
  ].flatMap((x) => [{ ...x, molde: 0 }, { ...x, molde: 1 }]),
  chave: (v) => `${v.t}-${v.molde}`,
  montar(v, rnd) {
    return {
      enunciado: v.molde === 0
        ? `A indicação <i>${v.t}</i> diz respeito a qual aspecto da execução?`
        : `<i>${v.t}</i> é uma indicação de:`,
      alternativas: alternativas(v.c, ['andamento', 'dinâmica', 'agógica', 'caráter', 'articulação'], rnd),
      correta: v.c,
      explicacao: `<i>${v.t}</i> é indicação de ${v.c}.`,
      referencia: 'MSA, pág. 93 e 131',
    };
  },
});

// ------------------------------------------------------- consultas do motor
export const geradoresDaFase = (fase) => GERADORES.filter((g) => g.fase === fase);

// Universo completo de perguntas possíveis de uma fase: cada item é uma
// pergunta distinta que ainda pode ser sorteada.
export function universoDaFase(fase) {
  const itens = [];
  for (const gerador of geradoresDaFase(fase)) {
    for (const variante of gerador.variantes()) {
      itens.push({ gerador, variante, assinatura: `${gerador.id}#${gerador.chave(variante)}` });
    }
  }
  return itens;
}

export const totalDeVariantes = (fase) => universoDaFase(fase).length;
