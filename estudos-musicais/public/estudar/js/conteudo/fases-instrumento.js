// Trilha "Método do instrumento": quatro fases que correm ao lado do MSA e
// mudam conforme o instrumento do aluno — clave, afinação, transposição,
// produção do som, partes, cuidados e rotina de estudo.

import { sortear } from '../aleatorio.js';
import * as T from '../musica.js';
import { pentagrama, teclado } from '../notacao.js';
import { ORDINAIS, alternativas, maiuscula } from './apoio.js';
import { FAMILIAS, INSTRUMENTOS, somReal, notaParaSoar } from './instrumentos.js';

const curto = (n) => T.nomeDaNota(n, { curto: true });
const nomeDaClave = (id) => T.CLAVES[id].nome;
const listaDeClaves = (i) => i.claves.map(nomeDaClave).join(' e ');

const tabela = (colunas, linhas) =>
  `<div class="rolagem"><table><thead><tr>${colunas.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
   <tbody>${linhas.map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

const colegas = (i) => INSTRUMENTOS.filter((x) => x.familia === i.familia && x.id !== i.id).map((x) => x.nome);

// ============================================================== as 4 fases

export const FASES_INSTRUMENTO = [
  {
    ordem: 1,
    id: 'inst1',
    titulo: 'Conhecendo o instrumento',
    subtitulo: 'Família, partes, montagem e cuidados',
    icone: '🧰',
    cor: '#7a5b2e',
    resumo: 'Antes de tirar som, saber o que se tem na mão: a que família o instrumento pertence, como ele se chama por partes, como se monta e como se guarda.',
    licoes: [
      {
        titulo: 'A família do seu instrumento',
        corpo: (i) => `
          <p>O <b>${i.nome}</b> pertence à família das <b>${i.familiaNome}</b>, em que o som nasce de
          ${FAMILIAS[i.familia].producao}.</p>
          <p>Na orquestra, os seus colegas de família são: ${colegas(i).join(', ')}.</p>
          <p>Saber a família não é enfeite: é ela que explica como se tira o som, como se afina,
          como se articula e o que estraga o instrumento.</p>
          ${tabela(['Família', 'O som nasce de'], Object.values(FAMILIAS).map((f) => [maiuscula(f.nome), f.producao]))}`,
      },
      {
        titulo: 'As partes do instrumento',
        corpo: (i) => `
          <p>Chamar cada peça pelo nome certo evita acidente e faz o instrutor ser entendido de primeira.
          No <b>${i.nome}</b>:</p>
          <ul class="lista-chave">${i.partes.map((p) => `<li><b>${p}</b></li>`).join('')}</ul>
          ${i.arco ? `<p>E o <b>arco</b>, com as suas próprias partes: <b>vareta</b>, <b>crina</b>,
            <b>talão</b>, <b>parafuso</b> e a <b>ponta</b>. A crina só agarra a corda quando está com
            <b>breu</b>.</p>` : ''}
          ${i.palheta ? `<p>O som depende de uma peça pequena e delicada: a <b>${i.palheta}</b>.
            É a primeira coisa a conferir quando o som não sai.</p>` : ''}`,
      },
      {
        titulo: 'Montar e guardar',
        corpo: (i) => `
          <p>Montagem sem pressa e sem força. Peça que não encaixa está desalinhada ou sem lubrificação —
          <b>forçar quebra</b>, e conserto de instrumento é caro e demorado.</p>
          <ul class="lista-chave">
            <li>Monte sempre sobre uma superfície firme, nunca no colo nem em pé no corredor.</li>
            <li>Segure pelas partes reforçadas, nunca pelas chaves, varas ou cordas.</li>
            <li>Guarde no estojo <b>fechado</b>, com o instrumento seco.</li>
            <li>Nada de deixar o estojo no sol, no chão molhado ou perto de aquecimento.</li>
          </ul>
          <p class="dica">${maiuscula(i.cuidado)}.</p>`,
      },
      {
        titulo: 'Cuidados do dia a dia',
        corpo: (i) => `
          <p>O instrumento da Congregação costuma ser de uso comum e de longa vida — quem cuida bem
          entrega em ordem para o próximo.</p>
          <ul class="lista-chave">
            <li><b>Depois de tocar</b>: ${i.cuidado}.</li>
            <li><b>Mãos limpas</b> e sem creme antes de pegar o instrumento.</li>
            <li><b>Nada de comer ou beber</b> (fora água) antes de tocar: resíduo estraga
            ${i.palheta ? 'a palheta' : i.familia === 'metais' ? 'o bocal e o tubo' : 'o instrumento'}.</li>
            <li><b>Revisão periódica</b> com quem entende: regulagem, cordas, sapatilhas, molas e vazamentos.</li>
          </ul>`,
      },
    ],
    jogos: [
      { tipo: 'memoria', baralho: 'familias', titulo: 'Memória das famílias', descricao: 'Junte cada família ao modo como o som nasce.' },
    ],
  },

  {
    ordem: 2,
    id: 'inst2',
    titulo: 'Som, postura e afinação',
    subtitulo: 'Como o som nasce e como mantê-lo bonito',
    icone: '🌬️',
    cor: '#1f7ae0',
    resumo: 'A produção do som no seu instrumento, a postura que o sustenta, a respiração ou a arcada e a afinação antes do culto.',
    licoes: [
      {
        titulo: 'Como nasce o som',
        corpo: (i) => `
          <p>No <b>${i.nome}</b>, o som nasce de ${FAMILIAS[i.familia].producao}.</p>
          ${i.palheta ? `<p>A peça que vibra é a <b>${i.palheta}</b>. Palheta rachada, lascada ou seca
            não vibra direito: o som sai duro, desafinado ou simplesmente não sai.</p>` : ''}
          ${i.familia === 'metais' ? `<p>O bocal não faz som sozinho: quem vibra são os <b>lábios</b>.
            O bocal apenas concentra essa vibração. Por isso o estudo do <b>som filado no bocal</b>
            vale tanto quanto o estudo com o instrumento montado.</p>` : ''}
          ${i.arco ? `<p>O arco tira som da corda pelo atrito da <b>crina com breu</b>. Três coisas mudam
            o som: <b>peso</b> do braço, <b>velocidade</b> do arco e <b>ponto de contato</b> (mais perto
            do cavalete, som mais firme).</p>` : ''}
          ${i.familia === 'teclas' ? `<p>Nas teclas, a variação do som vem do <b>toque</b> e do uso dos
            <b>registros</b> e do pedal de expressão — e, sobretudo, da <b>condução</b>: ligar bem as
            notas dentro da frase.</p>` : ''}
          <p class="dica">Som bom antes de som rápido. Não adianta correr as notas com o som feio.</p>`,
      },
      {
        titulo: 'Postura',
        corpo: (i) => `
          <p>${maiuscula(FAMILIAS[i.familia].postura)}.</p>
          <ul class="lista-chave">
            <li>Pés apoiados no chão, peso repartido; sentado, sem cruzar as pernas.</li>
            <li>Estante na altura dos olhos: quem abaixa a cabeça para ler perde o som e o regente.</li>
            <li>Nada de tensão no pescoço, nos ombros e na mandíbula — tensão aparece no som.</li>
          </ul>
          <p>Postura errada cansa em cinco minutos e machuca em cinco anos. Vale corrigir cedo.</p>`,
      },
      {
        titulo: i => 'Respiração e condução do som',
        tituloFixo: 'Respiração e condução do som',
        corpo: (i) => `
          <p>No seu instrumento, o que sustenta o som é ${FAMILIAS[i.familia].respiracao}.</p>
          ${i.familia === 'madeiras' || i.familia === 'metais' ? `
            <ul class="lista-chave">
              <li>Respire <b>pela boca</b>, rápido e silencioso, enchendo por baixo (barriga), não por cima.</li>
              <li>Solte o ar <b>apoiado e constante</b>: som que oscila quase sempre é ar que afrouxou.</li>
              <li>Respire <b>nas pausas e no fim da frase</b>, não no meio de uma nota longa.</li>
            </ul>` : ''}
          ${i.arco ? `<p>Planeje a arcada como quem planeja a respiração: a <b>frase</b> decide onde
            trocar o arco. Chegar ao fim do arco no meio da frase é o mesmo que ficar sem ar.</p>` : ''}
          <p><b>${FAMILIAS[i.familia].aquecimento}</b> — é o aquecimento que o seu instrumento pede.</p>`,
      },
      {
        titulo: 'Afinação',
        corpo: (i) => `
          <p>O padrão é o <b>Lá = 440 Hz</b>. Afine <b>antes</b> do culto ou do ensaio, com o instrumento
          já aquecido — instrumento frio afina em um lugar e desafina cinco minutos depois.</p>
          ${i.familia === 'cordas' ? `<p>As suas cordas soltas são <b>${i.cordas}</b>. Afine da mais grave
            para a mais aguda, sempre subindo até a nota (nunca descendo até ela), e confira com o
            afinador ou com o Lá de referência.</p>` : ''}
          ${i.familia === 'madeiras' || i.familia === 'metais' ? `<p>Ajuste ${i.familia === 'metais'
            ? 'as bombas de afinação' : 'o encaixe da boquilha ou do barrilete'}: puxar para fora
            <b>abaixa</b>, empurrar para dentro <b>sobe</b>. Antes de mexer, confira o óbvio —
            temperatura, ${i.palheta ? 'palheta' : 'embocadura'}, e a pressão do ar.</p>` : ''}
          ${i.familia === 'teclas' ? `<p>O órgão e o acordeon já vêm afinados de fábrica; o que cabe ao
            executante é <b>não desafinar o conjunto</b>: dar a nota de referência quando pedirem e
            manter o instrumento revisado.</p>` : ''}
          <p class="dica">Afinado não é "cada um no seu": é <b>o conjunto inteiro na mesma altura</b>.
          Ouvir o vizinho vale mais que confiar no visor do afinador.</p>`,
      },
    ],
    jogos: [
      { tipo: 'ouvido', modo: 'altura', titulo: 'Ouvido para afinar', descricao: 'Treine perceber se o som subiu ou desceu — é o que se faz ao afinar.' },
    ],
  },

  {
    ordem: 3,
    id: 'inst3',
    titulo: 'A leitura no meu instrumento',
    subtitulo: 'Clave, afinação, transposição e extensão',
    icone: '📖',
    cor: '#2f9e6b',
    resumo: 'A clave que você lê, o que a afinação do instrumento muda no papel, até onde ele vai e como a sua parte se encaixa no hino.',
    licoes: [
      {
        titulo: 'A clave que você lê',
        corpo: (i) => `
          <p>O <b>${i.nome}</b> lê em <b>${listaDeClaves(i)}</b>.</p>
          ${i.claves.map((c) => pentagrama({
            clave: c, largura: 280,
            notas: [{ ...T.notaDaPosicao(c, (T.CLAVES[c].linha - 1) * 2), figura: 'semibreve' }],
            rotulos: [T.CLAVES[c].referencia],
          })).join('')}
          <p>Essa é a mesma clave estudada na Fase 2 do MSA — a diferença é que agora ela é a
          <b>sua</b>: é nela que a sua parte do hino vem escrita.</p>
          ${i.claves.length > 1 ? `<p>O seu instrumento usa <b>mais de uma clave</b>: a segunda aparece
            nas passagens agudas, para evitar um monte de linhas suplementares. Muda a clave, mudam
            os nomes das notas nas mesmas linhas — por isso se estuda as duas.</p>` : ''}`,
      },
      {
        titulo: 'Afinação do instrumento e transposição',
        corpo: (i) => `
          <p>O seu instrumento está <b>em ${i.afinacao}</b>${i.transpositor ? '' : ' — ou seja, não é transpositor'}.</p>
          ${i.transpositor ? `
            <p>Isso quer dizer que ele <b>${i.transposicao.descricao}</b>. Quando você lê um
            <b>Dó</b>, o som que chega ao ouvido de quem escuta é <b>${curto(somReal(i, T.nota('Dó')))}</b>.</p>
            ${tabela(['Você lê', 'Sai soando'], ['Dó', 'Ré', 'Mi', 'Fá', 'Sol', 'Lá', 'Si']
              .map((l) => [l, curto(somReal(i, T.nota(l)))]))}
            <p>Por isso a sua parte é escrita em <b>outro tom</b> que a do órgão ou a das cordas: no papel
            é diferente, no ar é o mesmo hino. Para soar um <b>Dó</b> real, você precisa ler
            <b>${curto(notaParaSoar(i, T.nota('Dó')))}</b>.</p>
            <p class="dica">Nunca "corrija" a sua parte de ouvido comparando com o teclado: a parte já vem
            transposta certa para você. Toque o que está escrito.</p>`
            : `<p>O que está escrito é exatamente o que soa: um Dó escrito é um Dó ouvido.
            ${i.transposicao.semitons ? `A única diferença é a <b>oitava</b>: o seu instrumento
            ${i.transposicao.descricao}, para a partitura não ficar cheia de linhas suplementares.` : ''}</p>
            <p>Ainda assim vale conhecer os <b>transpositores</b> da orquestra: clarinete, trompete e
            saxofones soprano e tenor estão em Si♭; saxofones alto e barítono, em Mi♭; trompa e corne
            inglês, em Fá. Quando o instrutor diz "o Si♭ deles é o Lá♭ nosso", é disto que se trata.</p>`}
          <div class="quadro-teclado">${teclado({ marcadas: { 'Dó4': 'tonica', [`${curto(somReal(i, T.nota('Dó'))).replace('♭', '').replace('♯', '#')}4`]: 'alterada' } })}</div>`,
      },
      {
        titulo: 'Extensão do instrumento',
        corpo: (i) => `
          <p>A <b>tessitura</b> é o trecho em que o instrumento soa bem e seguro. No ${i.nome}:
          <b>${i.tessitura}</b>.</p>
          ${i.familia === 'cordas' ? `<p>As cordas soltas são <b>${i.cordas}</b> — a nota mais grave que
            você tem é a da corda mais grave, e é dela que a afinação parte.</p>` : ''}
          <p>Nota fora da tessitura não é bravura: é risco de som ruim e de erro no culto. Se a sua parte
          passa disso, é caso de conferir a edição com o instrutor.</p>
          <p class="dica">Extremos pedem mais ar, mais apoio e mais estudo. Suba aos poucos, com som
          controlado, e não force o agudo antes de o médio estar firme.</p>`,
      },
      {
        titulo: 'A sua parte no hino',
        corpo: (i) => `
          <p>O hinário é escrito em quatro vozes — <b>soprano</b>, <b>contralto</b>, <b>tenor</b> e
          <b>baixo</b>. Cada instrumento toca a voz que cabe à sua extensão e ao seu papel no conjunto,
          conforme a orientação do instrutor.</p>
          <ul class="lista-chave">
            <li>Confira <b>antes</b> qual voz é a sua no hino do dia — não descubra no meio.</li>
            <li>Marque a lápis (nunca a caneta) as entradas, respirações e passagens difíceis.</li>
            <li>Olhe o <b>regente</b>: andamento, entrada, dinâmica e fim de hino saem dele, não da sua conta.</li>
            <li>Se errar, <b>volte no tempo certo</b> e siga; não pare para consertar a nota perdida.</li>
          </ul>
          <p>Tudo o que o MSA ensina — armadura, compasso, ritmo inicial, andamento — aparece aqui na
          sua estante. Ler a música é o que permite tocar junto.</p>`,
      },
    ],
    jogos: [
      { tipo: 'pentagrama', modo: 'ler', titulo: 'Leitura na minha clave', descricao: 'Nomear as notas na clave do seu instrumento, contra o relógio.' },
    ],
  },

  {
    ordem: 4,
    id: 'inst4',
    titulo: 'Estudo diário e ensaio',
    subtitulo: 'Rotina, articulação, metrônomo e conjunto',
    icone: '📅',
    cor: '#c2185b',
    resumo: 'Como estudar sozinho para render no ensaio: rotina, escalas, articulação, dinâmica, metrônomo e o que muda quando se toca junto.',
    licoes: [
      {
        titulo: 'A rotina de estudo',
        corpo: (i) => `
          <p>Estudo curto e diário rende muito mais que estudo longo e raro. Meia hora por dia, na mesma
          ordem, resolve mais que três horas no sábado.</p>
          ${tabela(['Parte', 'O que fazer'], [
            ['Aquecimento', FAMILIAS[i.familia].aquecimento],
            ['Técnica', 'escalas e arpejos das tonalidades do hino, devagar e com metrônomo'],
            ['Estudo dirigido', 'os exercícios do método do instrumento, na ordem em que vêm'],
            ['Repertório', 'o hino do ensaio, primeiro lento, depois no andamento'],
            ['Encerramento', 'limpar e guardar o instrumento — faz parte do estudo'],
          ])}
          <p class="dica">Trecho difícil não se resolve repetindo inteiro: separe os dois compassos,
          toque devagar até sair certo <b>três vezes seguidas</b>, e só então junte.</p>`,
      },
      {
        titulo: 'Articulação',
        corpo: (i) => `
          <p>Articulação é o modo de <b>começar e ligar</b> cada nota — é o que dá caráter ao hino.</p>
          ${i.familia === 'madeiras' || i.familia === 'metais' ? `
            <ul class="lista-chave">
              <li><b>Ligado</b>: uma só emissão de ar para várias notas; a língua não interrompe.</li>
              <li><b>Destacado</b>: cada nota com o toque da língua, sem cortar o ar.</li>
              <li><b>Staccato</b>: notas curtas e separadas, mas ainda com som redondo.</li>
            </ul>
            <p>A língua articula; o <b>ar não para</b>. Quando o ar para a cada nota, o som fica picado e cansa.</p>` : ''}
          ${i.arco ? `
            <ul class="lista-chave">
              <li><b>Legato</b>: várias notas na mesma arcada, sem interromper o som.</li>
              <li><b>Détaché</b>: uma arcada por nota, som cheio, sem parar o arco.</li>
              <li><b>Staccato</b>: notas curtas, com o arco parando entre elas.</li>
            </ul>
            <p>A ligadura de expressão da partitura é, no seu instrumento, a <b>arcada</b>: o que está sob
            a ligadura sai numa arcada só.</p>` : ''}
          ${i.familia === 'teclas' ? `
            <ul class="lista-chave">
              <li><b>Legato</b>: a nota só é solta quando a seguinte já soa — é o toque do hino cantado.</li>
              <li><b>Destacado</b>: dedos levantando entre as notas, sem encurtar demais.</li>
            </ul>
            <p>Nas teclas a articulação é dos <b>dedos</b>: o legato de verdade se faz na troca, não no pedal.</p>` : ''}`,
      },
      {
        titulo: 'Metrônomo e andamento',
        corpo: (i) => `
          <p>O metrônomo é a mesma ferramenta da Fase 4 do MSA, aplicada ao instrumento.</p>
          <ul class="lista-chave">
            <li>Comece <b>abaixo</b> do andamento do hino e suba de 4 em 4 bpm, só quando sair limpo.</li>
            <li>Nos hinos, respeite a faixa marcada e fique na <b>média</b> entre mínima e máxima.</li>
            <li>Estude a passagem difícil <b>com subdivisão</b>: o metrônomo marcando a colcheia, não o tempo.</li>
            <li>Se acelera sozinho no forte e atrasa no piano, o problema é de pulsação, não de técnica.</li>
          </ul>`,
      },
      {
        titulo: 'Do estudo ao culto',
        corpo: (i) => `
          <p>Tocar junto é outra habilidade, e se aprende no ensaio.</p>
          <ul class="lista-chave">
            <li>Chegue <b>antes</b>, monte e afine com calma — afinar depois de começar atrapalha todo mundo.</li>
            <li><b>Ouça o conjunto</b> mais do que a si mesmo; quem só se ouve, desafina e atropela.</li>
            <li><b>Volume</b>: acompanhar o canto, nunca cobri-lo.</li>
            <li>Entradas, cortes, andamento e dinâmica saem do <b>regente</b>.</li>
            <li>Estante organizada, hinos marcados a lápis, lápis no estojo.</li>
          </ul>
          <p class="dica">O objetivo do estudo não é aparecer: é que o hino saia inteiro, afinado e no
          tempo, com o conjunto soando como um instrumento só.</p>`,
      },
    ],
    jogos: [
      { tipo: 'pulso', titulo: 'Estudo com metrônomo', descricao: 'Bata a pulsação junto com o metrônomo, como no estudo diário.' },
    ],
  },
];

// ========================================================== os geradores

export const GERADORES_INSTRUMENTO = [];
const registrar = (g) => { GERADORES_INSTRUMENTO.push(g); return g; };

const nomesDeFamilia = Object.values(FAMILIAS).map((f) => maiuscula(f.nome));
const producoes = Object.values(FAMILIAS).map((f) => f.producao);
const todasAsPartes = [...new Set(INSTRUMENTOS.flatMap((i) => i.partes))];

// ------------------------------------------------------------------ inst1
registrar({
  id: 'i1.minha-familia',
  fase: 'inst1',
  variantes: (i) => [0, 1, 2].map((molde) => ({ i: i.id, molde })),
  chave: (v) => `${v.i}-${v.molde}`,
  montar(v, rnd, i) {
    const correta = maiuscula(i.familiaNome);
    const enunciados = [
      `A que família pertence o ${i.nome}?`,
      `O ${i.nome} é classificado como instrumento de qual família?`,
      `Na orquestra, o ${i.nome} senta com que família?`,
    ];
    return {
      enunciado: enunciados[v.molde],
      alternativas: alternativas(correta, nomesDeFamilia, rnd),
      correta,
      explicacao: `O ${i.nome} é da família das ${i.familiaNome}, em que o som nasce de ${FAMILIAS[i.familia].producao}.`,
      referencia: 'Método do instrumento — Fase 1',
    };
  },
});

registrar({
  id: 'i1.familia-de-outro',
  fase: 'inst1',
  variantes: () => INSTRUMENTOS.map((x) => ({ alvo: x.id })),
  chave: (v) => v.alvo,
  montar(v, rnd) {
    const alvo = INSTRUMENTOS.find((x) => x.id === v.alvo);
    const correta = maiuscula(alvo.familiaNome);
    return {
      enunciado: `A que família pertence o ${alvo.nome}?`,
      alternativas: alternativas(correta, nomesDeFamilia, rnd),
      correta,
      explicacao: `O ${alvo.nome} é das ${alvo.familiaNome}.`,
      referencia: 'Método do instrumento — Fase 1',
    };
  },
});

registrar({
  id: 'i1.minhas-partes',
  fase: 'inst1',
  variantes: (i) => i.partes.flatMap((p) => [{ i: i.id, p, molde: 0 }, { i: i.id, p, molde: 1 }]),
  chave: (v) => `${v.i}-${v.p}-${v.molde}`,
  montar(v, rnd, i) {
    const foraDaLista = todasAsPartes.filter((p) => !i.partes.includes(p));
    if (v.molde === 0) {
      return {
        enunciado: `Qual destas peças faz parte do ${i.nome}?`,
        alternativas: alternativas(v.p, foraDaLista, rnd),
        correta: v.p,
        explicacao: `São partes do ${i.nome}: ${i.partes.join(', ')}.`,
        referencia: 'Método do instrumento — Fase 1',
      };
    }
    const intrusa = sortear(foraDaLista, rnd);
    const outras = i.partes.filter((p) => p !== v.p).slice(0, 2);
    return {
      enunciado: `Qual destas peças <b>não</b> pertence ao ${i.nome}?`,
      alternativas: alternativas(intrusa, [v.p, ...outras], rnd),
      correta: intrusa,
      explicacao: `"${maiuscula(intrusa)}" é peça de outro instrumento. O ${i.nome} tem: ${i.partes.join(', ')}.`,
      referencia: 'Método do instrumento — Fase 1',
    };
  },
});

registrar({
  id: 'i1.producao-da-familia',
  fase: 'inst1',
  variantes: () => Object.keys(FAMILIAS).flatMap((f) => [{ f, sentido: 'como' }, { f, sentido: 'qual' }]),
  chave: (v) => `${v.f}-${v.sentido}`,
  montar(v, rnd) {
    const familia = FAMILIAS[v.f];
    if (v.sentido === 'como') {
      return {
        enunciado: `Nos instrumentos de ${familia.nome}, o som nasce de quê?`,
        alternativas: alternativas(familia.producao, producoes, rnd),
        correta: familia.producao,
        explicacao: `Nas ${familia.nome}, o som nasce de ${familia.producao}.`,
        referencia: 'Método do instrumento — Fase 1',
      };
    }
    return {
      enunciado: `Em que família o som nasce de ${familia.producao}?`,
      alternativas: alternativas(maiuscula(familia.nome), nomesDeFamilia, rnd),
      correta: maiuscula(familia.nome),
      explicacao: `É a família das ${familia.nome}.`,
      referencia: 'Método do instrumento — Fase 1',
    };
  },
});

registrar({
  id: 'i1.cuidados',
  fase: 'inst1',
  variantes: () => [
    { p: 'Uma peça do instrumento não encaixa no lugar. O que fazer?', r: 'parar, conferir o alinhamento e a lubrificação, e nunca forçar', e: ['forçar até entrar, com cuidado', 'bater de leve para assentar', 'molhar a peça para deslizar'] },
    { p: 'Onde o instrumento deve ser montado?', r: 'sobre uma superfície firme, com espaço', e: ['no colo, enquanto se conversa', 'em pé, no corredor', 'em cima do banco da estante'] },
    { p: 'O instrumento deve ser guardado:', r: 'seco e no estojo fechado', e: ['ainda úmido, para não ressecar', 'fora do estojo, para arejar', 'no estojo aberto, perto da janela'] },
    { p: 'Antes de pegar o instrumento, as mãos devem estar:', r: 'limpas e sem creme', e: ['levemente úmidas', 'com creme, para deslizar', 'com talco'] },
    { p: 'O estojo do instrumento não deve ficar:', r: 'ao sol, no chão molhado ou perto de aquecimento', e: ['na sombra, dentro de casa', 'sobre uma mesa firme', 'no armário, fechado'] },
    { p: 'Comer antes de tocar, sem lavar a boca:', r: 'prejudica o instrumento — resíduo estraga palheta, bocal e tubo', e: ['não faz diferença nenhuma', 'ajuda a lubrificar', 'só atrapalha se for doce'] },
    { p: 'A revisão periódica do instrumento deve ser feita:', r: 'por quem entende de regulagem e manutenção', e: ['pelo próprio aluno, com ferramentas de casa', 'só quando o instrumento parar de funcionar', 'nunca, se estiver tocando'] },
    { p: 'Ao carregar o instrumento, deve-se segurá-lo:', r: 'pelas partes reforçadas, nunca pelas chaves, varas ou cordas', e: ['por onde for mais confortável', 'sempre pelas chaves, que são firmes', 'pela campana, que é mais larga'] },
  ],
  chave: (v) => v.p,
  montar(v, rnd) {
    return { enunciado: v.p, alternativas: alternativas(v.r, v.e, rnd), correta: v.r, explicacao: `Resposta: ${v.r}.`, referencia: 'Método do instrumento — Fase 1' };
  },
});

registrar({
  id: 'i1.meu-cuidado',
  fase: 'inst1',
  variantes: (i) => [{ i: i.id, molde: 0 }, { i: i.id, molde: 1 }],
  chave: (v) => `${v.i}-${v.molde}`,
  montar(v, rnd, i) {
    const outros = INSTRUMENTOS.filter((x) => x.id !== i.id).map((x) => x.cuidado);
    return {
      enunciado: v.molde === 0
        ? `Qual é o cuidado que o ${i.nome} pede depois de tocar?`
        : `Terminado o culto, o que se faz com o ${i.nome} antes de guardar?`,
      alternativas: alternativas(i.cuidado, outros, rnd),
      correta: i.cuidado,
      explicacao: `No ${i.nome}: ${i.cuidado}.`,
      referencia: 'Método do instrumento — Fase 1',
    };
  },
});

// ------------------------------------------------------------------ inst2
registrar({
  id: 'i2.producao-do-meu',
  fase: 'inst2',
  variantes: (i) => [0, 1, 2].map((molde) => ({ i: i.id, molde })),
  chave: (v) => `${v.i}-${v.molde}`,
  montar(v, rnd, i) {
    const correta = FAMILIAS[i.familia].producao;
    const enunciados = [
      `No ${i.nome}, o som é produzido por:`,
      `O que faz o som do ${i.nome} nascer?`,
      `Ao tocar o ${i.nome}, o som vem de:`,
    ];
    return {
      enunciado: enunciados[v.molde],
      alternativas: alternativas(correta, producoes, rnd),
      correta,
      explicacao: `No ${i.nome}, o som nasce de ${correta}.`,
      referencia: 'Método do instrumento — Fase 2',
    };
  },
});

registrar({
  id: 'i2.producao-de-outro',
  fase: 'inst2',
  variantes: () => INSTRUMENTOS.map((x) => ({ alvo: x.id })),
  chave: (v) => v.alvo,
  montar(v, rnd) {
    const alvo = INSTRUMENTOS.find((x) => x.id === v.alvo);
    const correta = FAMILIAS[alvo.familia].producao;
    return {
      enunciado: `No ${alvo.nome}, o som é produzido por:`,
      alternativas: alternativas(correta, producoes, rnd),
      correta,
      explicacao: `O ${alvo.nome} é das ${alvo.familiaNome}: o som nasce de ${correta}.`,
      referencia: 'Método do instrumento — Fase 2',
    };
  },
});

registrar({
  id: 'i2.postura-e-som',
  fase: 'inst2',
  variantes: () => [
    { p: 'A estante deve ficar:', r: 'na altura dos olhos, para não abaixar a cabeça', e: ['bem baixa, para ver o regente por cima', 'ao lado, para não atrapalhar', 'o mais longe possível'] },
    { p: 'Ao tocar sentado, o executante deve:', r: 'apoiar os pés no chão, sem cruzar as pernas', e: ['cruzar as pernas para firmar o instrumento', 'sentar na ponta do banco, inclinado', 'recostar-se totalmente na cadeira'] },
    { p: 'Tensão no pescoço e nos ombros:', r: 'aparece no som e machuca com o tempo', e: ['ajuda a firmar o instrumento', 'não tem relação com o som', 'é necessária no forte'] },
    { p: 'O que deve vir primeiro no estudo?', r: 'o som bonito, antes da velocidade', e: ['a velocidade, que o som melhora sozinho', 'o repertório, antes de qualquer técnica', 'o volume, antes da afinação'] },
    { p: 'O aquecimento serve para:', r: 'preparar o corpo e o instrumento antes do esforço', e: ['ganhar tempo antes do ensaio', 'afinar o instrumento frio', 'substituir o estudo técnico'] },
    { p: 'Som que oscila numa nota longa costuma indicar:', r: 'ar ou condução que afrouxaram no meio da nota', e: ['instrumento desafinado de fábrica', 'excesso de estudo no dia anterior', 'estante mal posicionada'] },
    { p: 'A afinação de referência da orquestra é:', r: 'Lá = 440 Hz', e: ['Dó = 440 Hz', 'Lá = 400 Hz', 'Sol = 440 Hz'] },
    { p: 'O melhor momento para afinar é:', r: 'antes do culto ou do ensaio, com o instrumento já aquecido', e: ['no meio do primeiro hino', 'assim que tirar o instrumento do estojo, ainda frio', 'só quando alguém reclamar'] },
    { p: 'Afinar em conjunto significa:', r: 'todo o grupo na mesma altura, ouvindo uns aos outros', e: ['cada um confiando apenas no seu afinador', 'apenas o regente afinar', 'afinar só os instrumentos graves'] },
    { p: 'Instrumento frio, recém-tirado do estojo:', r: 'muda de afinação conforme aquece', e: ['mantém a afinação o dia todo', 'fica sempre mais agudo', 'não pode ser tocado'] },
  ],
  chave: (v) => v.p,
  montar(v, rnd) {
    return { enunciado: v.p, alternativas: alternativas(v.r, v.e, rnd), correta: v.r, explicacao: `Resposta: ${v.r}.`, referencia: 'Método do instrumento — Fase 2' };
  },
});

registrar({
  id: 'i2.respiracao-familia',
  fase: 'inst2',
  variantes: () => Object.keys(FAMILIAS).flatMap((f) => [{ f, sentido: 'sustenta' }, { f, sentido: 'aquecimento' }, { f, sentido: 'postura' }]),
  chave: (v) => `${v.f}-${v.sentido}`,
  montar(v, rnd) {
    const familia = FAMILIAS[v.f];
    const campo = { sustenta: 'respiracao', aquecimento: 'aquecimento', postura: 'postura' }[v.sentido];
    const perguntas = {
      sustenta: `Nos instrumentos de ${familia.nome}, o que sustenta o som?`,
      aquecimento: `Qual é o aquecimento próprio dos instrumentos de ${familia.nome}?`,
      postura: `Qual é a postura correta nos instrumentos de ${familia.nome}?`,
    };
    const repertorio = Object.values(FAMILIAS).map((f) => f[campo]);
    return {
      enunciado: perguntas[v.sentido],
      alternativas: alternativas(familia[campo], repertorio, rnd),
      correta: familia[campo],
      explicacao: `Nas ${familia.nome}: ${familia[campo]}.`,
      referencia: 'Método do instrumento — Fase 2',
    };
  },
});

registrar({
  id: 'i2.som-nao-sai',
  fase: 'inst2',
  variantes: (i) => {
    const comuns = [
      { s: 'o som sai fraco e sem apoio', c: 'ar (ou peso do arco) insuficiente e postura encolhida' },
      { s: 'o som some no meio da nota longa', c: 'a respiração ou a condução afrouxaram antes do fim' },
      { s: 'o instrumento está mais agudo do que o grupo', c: 'ele aqueceu e precisa ser afinado outra vez' },
      { s: 'o som fica duro e travado', c: 'tensão no corpo e excesso de pressão' },
      { s: 'as notas agudas não respondem', c: 'falta de apoio e pressa em subir antes de o médio estar firme' },
      { s: 'o conjunto está desafinado só na hora do forte', c: 'excesso de volume individual, sem escutar o conjunto' },
    ];
    const especificos = i.palheta
      ? [{ s: 'o som não sai de jeito nenhum', c: 'a palheta está rachada, seca ou mal posicionada' }]
      : i.familia === 'metais'
        ? [{ s: 'o som não sai de jeito nenhum', c: 'os lábios não estão vibrando — falta som filado no bocal' }]
        : i.arco
          ? [{ s: 'o arco desliza sem tirar som', c: 'falta breu na crina' }]
          : [{ s: 'uma nota não responde ao toque', c: 'é caso de revisão do mecanismo, não de força no dedo' }];
    return [...comuns, ...especificos].map((x) => ({ ...x, i: i.id }));
  },
  chave: (v) => `${v.i}-${v.s}`,
  montar(v, rnd, i) {
    const repertorio = [
      'ar (ou peso do arco) insuficiente e postura encolhida',
      'a respiração ou a condução afrouxaram antes do fim',
      'ele aqueceu e precisa ser afinado outra vez',
      'tensão no corpo e excesso de pressão',
      'falta de apoio e pressa em subir antes de o médio estar firme',
      'excesso de volume individual, sem escutar o conjunto',
      'a palheta está rachada, seca ou mal posicionada',
      'os lábios não estão vibrando — falta som filado no bocal',
      'falta breu na crina',
      'é caso de revisão do mecanismo, não de força no dedo',
    ];
    return {
      enunciado: `Tocando o ${i.nome}, ${v.s}. Qual é a causa mais provável?`,
      alternativas: alternativas(v.c, repertorio, rnd),
      correta: v.c,
      explicacao: `Causa mais provável: ${v.c}.`,
      referencia: 'Método do instrumento — Fase 2',
    };
  },
});

// ------------------------------------------------------------------ inst3
registrar({
  id: 'i3.minha-clave',
  fase: 'inst3',
  variantes: (i) => [0, 1, 2].map((molde) => ({ i: i.id, molde })),
  chave: (v) => `${v.i}-${v.molde}`,
  montar(v, rnd, i) {
    const correta = listaDeClaves(i);
    const repertorio = [...new Set(INSTRUMENTOS.map((x) => listaDeClaves(x)))];
    const enunciados = [
      `Em que clave se escreve a parte do ${i.nome}?`,
      `Qual clave o executante de ${i.nome} lê na sua estante?`,
      `A parte do ${i.nome} no hinário vem escrita em:`,
    ];
    return {
      enunciado: enunciados[v.molde],
      alternativas: alternativas(correta, repertorio, rnd),
      correta,
      explicacao: `O ${i.nome} lê em ${correta}.`,
      referencia: 'Método do instrumento — Fase 3',
    };
  },
});

registrar({
  id: 'i3.clave-de-outro',
  fase: 'inst3',
  variantes: () => INSTRUMENTOS.map((x) => ({ alvo: x.id })),
  chave: (v) => v.alvo,
  montar(v, rnd) {
    const alvo = INSTRUMENTOS.find((x) => x.id === v.alvo);
    const correta = listaDeClaves(alvo);
    const repertorio = [...new Set(INSTRUMENTOS.map((x) => listaDeClaves(x)))];
    return {
      enunciado: `Em que clave se escreve a parte do ${alvo.nome}?`,
      alternativas: alternativas(correta, repertorio, rnd),
      correta,
      explicacao: `O ${alvo.nome} lê em ${correta}.`,
      referencia: 'Método do instrumento — Fase 3',
    };
  },
});

registrar({
  id: 'i3.leitura-na-minha-clave',
  fase: 'inst3',
  variantes: (i) => i.claves.flatMap((c) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((p) => ({ i: i.id, c, p }))),
  chave: (v) => `${v.i}-${v.c}-${v.p}`,
  montar(v, rnd, i) {
    const nota = T.notaDaPosicao(v.c, v.p);
    return {
      enunciado: `Na ${nomeDaClave(v.c)}, que nota é esta na sua parte?`,
      html: pentagrama({ clave: v.c, notas: [{ ...nota, figura: 'semibreve' }], largura: 260 }),
      alternativas: alternativas(nota.letra, T.LETRAS, rnd),
      correta: nota.letra,
      explicacao: `A nota está na ${T.nomeDoLugar(v.p)}; na ${nomeDaClave(v.c)}, é ${nota.letra}.`,
      referencia: 'Método do instrumento — Fase 3',
    };
  },
});

registrar({
  id: 'i3.minha-afinacao',
  fase: 'inst3',
  variantes: (i) => [{ i: i.id, sentido: 'afinacao' }, { i: i.id, sentido: 'transpositor' }],
  chave: (v) => `${v.i}-${v.sentido}`,
  montar(v, rnd, i) {
    if (v.sentido === 'afinacao') {
      return {
        enunciado: `Em que afinação está o ${i.nome}?`,
        alternativas: alternativas(i.afinacao, ['Dó', 'Si♭', 'Mi♭', 'Fá'], rnd),
        correta: i.afinacao,
        explicacao: `O ${i.nome} é um instrumento em ${i.afinacao}${i.transpositor ? `, e por isso ${i.transposicao.descricao}` : ', ou seja, não é transpositor'}.`,
        referencia: 'Método do instrumento — Fase 3',
      };
    }
    const correta = i.transpositor ? 'sim, é transpositor' : 'não, o que está escrito é o que soa';
    return {
      enunciado: `O ${i.nome} é um instrumento transpositor?`,
      alternativas: alternativas(correta, ['sim, é transpositor', 'não, o que está escrito é o que soa'], rnd, 2),
      correta,
      explicacao: i.transpositor
        ? `Sim: o ${i.nome} ${i.transposicao.descricao}.`
        : `Não: no ${i.nome} a nota escrita é a nota que soa${i.transposicao.semitons ? ' (mudando apenas de oitava)' : ''}.`,
      referencia: 'Método do instrumento — Fase 3',
    };
  },
});

registrar({
  id: 'i3.transposicao',
  fase: 'inst3',
  variantes: (i) => (i.transpositor
    ? T.LETRAS.flatMap((l) => [{ i: i.id, l, sentido: 'soa' }, { i: i.id, l, sentido: 'lê' }])
    : []),
  chave: (v) => `${v.i}-${v.l}-${v.sentido}`,
  montar(v, rnd, i) {
    const repertorio = T.LETRAS.flatMap((l) => [l, `${l}♭`, `${l}♯`]);
    if (v.sentido === 'soa') {
      const soando = curto(somReal(i, T.nota(v.l)));
      return {
        enunciado: `Você lê e toca um <b>${v.l}</b> no ${i.nome}. Que nota soa de verdade?`,
        alternativas: alternativas(soando, repertorio, rnd),
        correta: soando,
        explicacao: `O ${i.nome} ${i.transposicao.descricao}: o ${v.l} escrito soa ${soando}.`,
        referencia: 'Método do instrumento — Fase 3',
      };
    }
    const lendo = curto(notaParaSoar(i, T.nota(v.l)));
    return {
      enunciado: `Para que soe um <b>${v.l}</b> real, que nota o ${i.nome} precisa ler?`,
      alternativas: alternativas(lendo, repertorio, rnd),
      correta: lendo,
      explicacao: `Como o instrumento ${i.transposicao.descricao}, é preciso ler ${lendo} para soar ${v.l}.`,
      referencia: 'Método do instrumento — Fase 3',
    };
  },
});

registrar({
  id: 'i3.transpositores-da-orquestra',
  fase: 'inst3',
  variantes: () => INSTRUMENTOS.map((x) => ({ alvo: x.id })),
  chave: (v) => v.alvo,
  montar(v, rnd) {
    const alvo = INSTRUMENTOS.find((x) => x.id === v.alvo);
    return {
      enunciado: `Em que afinação está o ${alvo.nome}?`,
      alternativas: alternativas(alvo.afinacao, ['Dó', 'Si♭', 'Mi♭', 'Fá'], rnd),
      correta: alvo.afinacao,
      explicacao: `O ${alvo.nome} está em ${alvo.afinacao}${alvo.transpositor ? ` e ${alvo.transposicao.descricao}` : ' e não é transpositor'}.`,
      referencia: 'Método do instrumento — Fase 3',
    };
  },
});

registrar({
  id: 'i3.parte-no-hino',
  fase: 'inst3',
  variantes: () => [
    { p: 'As quatro vozes do hinário são:', r: 'soprano, contralto, tenor e baixo', e: ['soprano, alto, barítono e baixo', 'primeira, segunda, terceira e quarta', 'melodia, harmonia, ritmo e baixo'] },
    { p: 'Quem define o andamento, as entradas e o fim do hino no culto?', r: 'o regente', e: ['cada executante, pelo seu metrônomo', 'o organista', 'o instrumento mais grave'] },
    { p: 'Qual voz você toca em cada hino?', r: 'a que o instrutor indicar, conforme o instrumento e a extensão', e: ['sempre o soprano', 'sempre o baixo', 'a que estiver mais fácil no dia'] },
    { p: 'Marcações na partitura devem ser feitas:', r: 'a lápis, para poderem ser apagadas', e: ['a caneta, para não sumirem', 'com marca-texto colorido', 'nunca, em hipótese alguma'] },
    { p: 'Se você errar uma nota no meio do hino, o certo é:', r: 'voltar no tempo certo e seguir com o conjunto', e: ['parar e recomeçar o compasso', 'tocar mais forte para corrigir', 'parar até o fim do hino'] },
    { p: 'A tessitura de um instrumento é:', r: 'a extensão em que ele soa bem e com segurança', e: ['a marca do fabricante', 'o número de chaves ou pistos', 'a afinação de referência'] },
    { p: 'Tocar notas fora da tessitura do instrumento:', r: 'compromete o som e é caso de conferir a edição com o instrutor', e: ['é sinal de bom preparo técnico', 'é obrigatório em todos os hinos', 'não muda nada no resultado'] },
    { p: 'O volume do instrumento no culto deve:', r: 'acompanhar o canto, sem cobri-lo', e: ['superar o canto, para guiar', 'ser sempre o mais fraco possível', 'variar conforme a vontade de cada um'] },
  ],
  chave: (v) => v.p,
  montar(v, rnd) {
    return { enunciado: v.p, alternativas: alternativas(v.r, v.e, rnd), correta: v.r, explicacao: `Resposta: ${v.r}.`, referencia: 'Método do instrumento — Fase 3' };
  },
});

// ------------------------------------------------------------------ inst4
registrar({
  id: 'i4.rotina',
  fase: 'inst4',
  variantes: () => [
    { p: 'O que rende mais no aprendizado do instrumento?', r: 'estudo curto e diário', e: ['um estudo longo por semana', 'estudar só na véspera do ensaio', 'estudar apenas no ensaio'] },
    { p: 'Por onde começa a sessão de estudo?', r: 'pelo aquecimento', e: ['pelo hino do próximo culto', 'pela passagem mais difícil', 'pelas escalas mais rápidas'] },
    { p: 'Um trecho difícil se resolve:', r: 'separando os compassos e tocando devagar até sair certo várias vezes seguidas', e: ['repetindo a peça inteira até acertar', 'tocando mais rápido, para soltar os dedos', 'pulando o trecho no ensaio'] },
    { p: 'As escalas do estudo diário devem ser, de preferência:', r: 'as das tonalidades dos hinos que se está tocando', e: ['sempre só a de Dó Maior', 'as mais difíceis que existirem', 'escolhidas ao acaso a cada dia'] },
    { p: 'Guardar e limpar o instrumento:', r: 'faz parte do estudo, todo dia', e: ['é tarefa só do encarregado', 'só é preciso uma vez por mês', 'atrapalha o tempo de estudo'] },
    { p: 'Ao subir a velocidade com o metrônomo, o certo é:', r: 'subir de poucos bpm por vez, só quando sair limpo', e: ['dobrar a velocidade a cada acerto', 'ir direto ao andamento do hino', 'não usar metrônomo na velocidade final'] },
    { p: 'Estudar a passagem difícil com o metrônomo marcando a subdivisão serve para:', r: 'manter a precisão dentro do tempo', e: ['deixar o estudo mais rápido', 'substituir a contagem', 'afinar melhor'] },
    { p: 'Quem acelera no forte e atrasa no piano tem problema de:', r: 'pulsação', e: ['afinação', 'postura', 'palheta ou bocal'] },
    { p: 'O estudo do repertório deve começar:', r: 'lento, antes de ir ao andamento do hino', e: ['direto no andamento do culto', 'acima do andamento, para sobrar folga', 'só depois de decorado'] },
    { p: 'Nos hinos com faixa de andamento (por exemplo ♩ = 60 - 80), recomenda-se:', r: 'ficar na média entre a mínima e a máxima', e: ['usar sempre a velocidade máxima', 'usar sempre a mínima', 'ignorar a marcação e seguir o gosto'] },
  ],
  chave: (v) => v.p,
  montar(v, rnd) {
    return { enunciado: v.p, alternativas: alternativas(v.r, v.e, rnd), correta: v.r, explicacao: `Resposta: ${v.r}.`, referencia: 'Método do instrumento — Fase 4' };
  },
});

registrar({
  id: 'i4.articulacao',
  fase: 'inst4',
  variantes: (i) => {
    const sopro = [
      { p: 'No seu instrumento, tocar <b>ligado</b> significa:', r: 'várias notas numa só emissão de ar, sem a língua interromper', e: ['tocar cada nota com um toque de língua', 'tocar tudo bem curto', 'tocar sem respirar em nenhum momento'] },
      { p: 'Ao articular as notas, o ar deve:', r: 'continuar correndo — quem para é a língua', e: ['parar a cada nota', 'sair em golpes curtos e separados', 'ser segurado no peito'] },
      { p: '<b>Staccato</b>, no seu instrumento, é:', r: 'notas curtas e separadas, mas com som redondo', e: ['notas curtas e estouradas', 'notas ligadas e longas', 'notas tocadas mais forte'] },
    ];
    const arco = [
      { p: '<b>Legato</b>, no seu instrumento, é:', r: 'várias notas na mesma arcada, sem interromper o som', e: ['uma arcada por nota, bem curta', 'parar o arco entre as notas', 'tocar sem breu'] },
      { p: 'A ligadura de expressão, na sua parte, indica:', r: 'que as notas saem numa arcada só', e: ['que as notas devem ser repetidas', 'que se deve trocar de corda', 'que se deve tocar mais forte'] },
      { p: '<b>Détaché</b> é:', r: 'uma arcada por nota, com som cheio, sem parar o arco', e: ['notas curtíssimas e secas', 'todas as notas numa arcada', 'tocar só com a ponta do arco'] },
    ];
    const teclas = [
      { p: '<b>Legato</b>, nas teclas, se faz:', r: 'soltando a nota só quando a seguinte já soa', e: ['segurando o pedal o tempo todo', 'tocando tudo mais forte', 'levantando as duas mãos juntas'] },
      { p: 'O legato de verdade, nas teclas, depende:', r: 'da troca dos dedos, não do pedal', e: ['só do pedal de sustentação', 'do registro escolhido', 'da altura do banco'] },
      { p: 'Tocar destacado, nas teclas, é:', r: 'levantar os dedos entre as notas, sem encurtar demais', e: ['tocar com o pedal pressionado', 'tocar sempre em fortíssimo', 'tocar com as duas mãos em oitavas'] },
    ];
    const base = i.familia === 'cordas' ? arco : i.familia === 'teclas' ? teclas : sopro;
    const comuns = [
      { p: 'Articulação, em música, é:', r: 'o modo de começar e ligar cada nota', e: ['o volume do som', 'a velocidade da peça', 'a altura da nota'] },
      { p: 'Dinâmica trata de:', r: 'intensidade — forte e fraco', e: ['velocidade', 'articulação', 'afinação'] },
      { p: 'Tocar em <i>piano</i> (p) no conjunto significa:', r: 'tocar fraco, mantendo o som e a afinação', e: ['tocar devagar', 'parar de tocar', 'tocar só as notas graves'] },
      { p: 'Um <i>crescendo</i> bem feito é:', r: 'aumentar aos poucos, sem acelerar', e: ['aumentar de uma vez no fim', 'acelerar junto com o volume', 'aumentar apenas o agudo'] },
      { p: 'Manter a afinação no <i>forte</i> exige:', r: 'apoio e controle, não força', e: ['soprar ou pressionar com toda a força', 'afinar mais alto de propósito', 'tocar mais rápido'] },
    ];
    return [...base, ...comuns].map((x) => ({ ...x, i: i.id }));
  },
  chave: (v) => `${v.i}-${v.p}`,
  montar(v, rnd) {
    return { enunciado: v.p, alternativas: alternativas(v.r, v.e, rnd), correta: v.r, explicacao: `Resposta: ${v.r}.`, referencia: 'Método do instrumento — Fase 4' };
  },
});

registrar({
  id: 'i4.ensaio-e-culto',
  fase: 'inst4',
  variantes: () => [
    { p: 'A que horas se afina o instrumento no dia do culto?', r: 'antes de começar, com o instrumento aquecido', e: ['durante o primeiro hino', 'no intervalo, se der tempo', 'depois do culto'] },
    { p: 'No conjunto, o executante deve ouvir:', r: 'o conjunto mais do que a si mesmo', e: ['apenas o seu próprio som', 'apenas o instrumento mais próximo', 'apenas o metrônomo'] },
    { p: 'Chegar atrasado ao ensaio:', r: 'atrapalha o grupo inteiro, que precisa parar para o atrasado montar e afinar', e: ['não faz diferença se o hino for conhecido', 'só atrapalha quem chegou atrasado', 'é normal e esperado'] },
    { p: 'A partitura na estante deve estar:', r: 'organizada e marcada a lápis, com os hinos na ordem', e: ['solta, para trocar mais rápido', 'sem nenhuma marcação', 'compartilhada com o vizinho'] },
    { p: 'Quando o regente pede um andamento diferente do que você estudou:', r: 'segue-se o regente', e: ['mantém-se o andamento estudado', 'toca-se mais forte para avisar', 'para-se de tocar'] },
    { p: 'O objetivo do conjunto é:', r: 'que o hino saia inteiro, afinado e no tempo, soando como um instrumento só', e: ['que cada um mostre a sua técnica', 'que o instrumento mais agudo se destaque', 'que se toque o mais rápido possível'] },
    { p: 'Se o seu instrumento estiver com problema mecânico na hora do culto:', r: 'avisa-se o encarregado; não se tenta consertar na hora, no lugar', e: ['tenta-se o conserto ali mesmo', 'toca-se assim mesmo, forçando', 'empresta-se o instrumento de outro sem avisar'] },
    { p: 'Estudar em casa e não estudar em casa muda o ensaio porque:', r: 'o tempo do ensaio é para ajustar o conjunto, não para aprender as notas', e: ['o ensaio serve justamente para aprender as notas', 'não muda nada, o regente corrige tudo', 'o ensaio é apenas social'] },
    { p: 'A revisão periódica do instrumento deve ser combinada:', r: 'com antecedência, fora dos dias de culto', e: ['na hora, no dia do culto', 'somente quando quebrar de vez', 'nunca, se estiver tocando'] },
    { p: 'Quem cuida bem do instrumento de uso comum:', r: 'entrega em ordem para o próximo que for tocar', e: ['garante que ele será só seu', 'não precisa de revisão', 'pode dispensar a limpeza diária'] },
  ],
  chave: (v) => v.p,
  montar(v, rnd) {
    return { enunciado: v.p, alternativas: alternativas(v.r, v.e, rnd), correta: v.r, explicacao: `Resposta: ${v.r}.`, referencia: 'Método do instrumento — Fase 4' };
  },
});

registrar({
  id: 'i4.escalas-do-hino',
  fase: 'inst4',
  variantes: () => T.TONALIDADES.filter((t) => t.acidentes <= 4).flatMap((t) => [
    { t: T.nomeDaNota(t.maior), sentido: 'acidentes' }, { t: T.nomeDaNota(t.maior), sentido: 'graus' },
  ]),
  chave: (v) => `${v.t}-${v.sentido}`,
  montar(v, rnd) {
    const tonalidade = T.TONALIDADES.find((x) => T.nomeDaNota(x.maior) === v.t);
    if (v.sentido === 'acidentes') {
      const letras = T.armaduraDe(tonalidade);
      const sinal = tonalidade.tipo === 'sustenido' ? '♯' : '♭';
      const correta = letras.length ? letras.map((l) => l + sinal).join(', ') : 'nenhum acidente';
      const repertorio = ['nenhum acidente', ...T.TONALIDADES.filter((x) => x.acidentes > 0)
        .map((x) => T.armaduraDe(x).map((l) => l + (x.tipo === 'sustenido' ? '♯' : '♭')).join(', '))];
      return {
        enunciado: `Para tocar um hino em ${v.t} Maior, que acidentes você precisa fazer na sua escala?`,
        alternativas: alternativas(correta, repertorio, rnd),
        correta,
        explicacao: `${v.t} Maior tem ${correta}.`,
        referencia: 'Método do instrumento — Fase 4',
      };
    }
    const notas = T.escala(tonalidade.maior).slice(0, 8).map((n) => curto(n)).join(' – ');
    const repertorio = T.TONALIDADES.map((x) => T.escala(x.maior).slice(0, 8).map((n) => curto(n)).join(' – '));
    return {
      enunciado: `Quais são as notas da escala de ${v.t} Maior, do 1º ao 8º grau?`,
      alternativas: alternativas(notas, repertorio, rnd),
      correta: notas,
      explicacao: `${v.t} Maior: ${notas}.`,
      referencia: 'Método do instrumento — Fase 4',
    };
  },
});

// ------------------------------------------------- reforços das fases 1, 2 e 4
registrar({
  id: 'i1.orquestra',
  fase: 'inst1',
  variantes: () => Object.keys(FAMILIAS).flatMap((f) => [{ f, sentido: 'quem' }, { f, sentido: 'quantos' }])
    .concat(INSTRUMENTOS.map((x) => ({ f: x.familia, sentido: 'pertence', alvo: x.id }))),
  chave: (v) => `${v.f}-${v.sentido}-${v.alvo || ''}`,
  montar(v, rnd) {
    const daFamilia = INSTRUMENTOS.filter((x) => x.familia === v.f);
    if (v.sentido === 'quem') {
      const correta = daFamilia[0].nome;
      const deFora = INSTRUMENTOS.filter((x) => x.familia !== v.f).map((x) => x.nome);
      return {
        enunciado: `Qual destes instrumentos é da família das ${FAMILIAS[v.f].nome}?`,
        alternativas: alternativas(correta, deFora, rnd),
        correta,
        explicacao: `São das ${FAMILIAS[v.f].nome}: ${daFamilia.map((x) => x.nome).join(', ')}.`,
        referencia: 'Método do instrumento — Fase 1',
      };
    }
    if (v.sentido === 'quantos') {
      const correta = String(daFamilia.length);
      return {
        enunciado: `Neste método, quantos instrumentos estão listados na família das ${FAMILIAS[v.f].nome}?`,
        alternativas: alternativas(correta, ['2', '3', '4', '5', '6', '7', '8', '9', '10'], rnd),
        correta,
        explicacao: `${daFamilia.length}: ${daFamilia.map((x) => x.nome).join(', ')}.`,
        referencia: 'Método do instrumento — Fase 1',
      };
    }
    const alvo = INSTRUMENTOS.find((x) => x.id === v.alvo);
    const foraDaFamilia = INSTRUMENTOS.filter((x) => x.familia !== alvo.familia).map((x) => x.nome);
    const colega = sortear(INSTRUMENTOS.filter((x) => x.familia === alvo.familia && x.id !== alvo.id), rnd);
    const correta = colega ? colega.nome : alvo.nome;
    return {
      enunciado: `Com que instrumento o ${alvo.nome} divide família?`,
      alternativas: alternativas(correta, foraDaFamilia, rnd),
      correta,
      explicacao: `O ${alvo.nome} é das ${alvo.familiaNome}, junto com ${colegas(alvo).join(', ')}.`,
      referencia: 'Método do instrumento — Fase 1',
    };
  },
});

registrar({
  id: 'i2.ajuste-de-afinacao',
  fase: 'inst2',
  variantes: (i) => {
    const cordas = [
      { p: 'Afinando as cordas, o certo é:', r: 'ir subindo até a nota, nunca descendo até ela', e: ['descer sempre até a nota', 'afinar da mais aguda para a mais grave', 'afinar sem referência, de ouvido apenas'] },
      { p: 'A ordem de afinação das cordas é:', r: 'da mais grave para a mais aguda', e: ['da mais aguda para a mais grave', 'do meio para as pontas', 'não há ordem'] },
      { p: 'O microafinador (no estandarte) serve para:', r: 'o ajuste fino, depois da cravelha', e: ['trocar a corda', 'afinar a primeira vez', 'apertar o cavalete'] },
    ];
    const sopro = [
      { p: 'Para <b>abaixar</b> a afinação do seu instrumento:', r: 'puxa-se para fora o encaixe (ou a bomba)', e: ['empurra-se mais para dentro', 'aperta-se a abraçadeira', 'sopra-se com mais força'] },
      { p: 'Para <b>subir</b> a afinação do seu instrumento:', r: 'empurra-se o encaixe (ou a bomba) para dentro', e: ['puxa-se mais para fora', 'afrouxa-se a abraçadeira', 'sopra-se com menos força'] },
      { p: 'Antes de mexer na afinação mecânica, deve-se conferir:', r: 'temperatura, embocadura e apoio do ar', e: ['a marca do instrumento', 'a altura da estante', 'o número de chaves'] },
    ];
    const teclas = [
      { p: 'O órgão e o acordeon:', r: 'já vêm afinados; o cuidado é manter a revisão em dia', e: ['precisam ser afinados a cada culto', 'afinam-se pelos registros', 'afinam-se pelo pedal'] },
      { p: 'Quando o conjunto pede a nota de referência ao teclado, o executante deve:', r: 'dar a nota pedida com som firme e sustentado', e: ['tocar um acorde completo', 'tocar a melodia do hino', 'recusar, pois quem afina é o regente'] },
      { p: 'Um teclado com nota que não responde:', r: 'é caso de revisão do mecanismo', e: ['resolve-se apertando mais o dedo', 'resolve-se trocando o registro', 'é normal e não precisa de conserto'] },
    ];
    const base = i.familia === 'cordas' ? cordas : i.familia === 'teclas' ? teclas : sopro;
    return base.map((x) => ({ ...x, i: i.id }));
  },
  chave: (v) => `${v.i}-${v.p}`,
  montar(v, rnd) {
    return { enunciado: v.p, alternativas: alternativas(v.r, v.e, rnd), correta: v.r, explicacao: `Resposta: ${v.r}.`, referencia: 'Método do instrumento — Fase 2' };
  },
});

registrar({
  id: 'i2.som-longo',
  fase: 'inst2',
  variantes: () => [
    { p: 'O estudo de notas longas serve para:', r: 'firmar o som, o apoio e a afinação', e: ['ganhar velocidade nos dedos', 'decorar o hino', 'aquecer as mãos apenas'] },
    { p: 'Durante uma nota longa, o som deve:', r: 'manter-se constante do começo ao fim', e: ['crescer sempre até o fim', 'diminuir naturalmente', 'oscilar para ficar bonito'] },
    { p: 'Respirar no meio de uma nota longa:', r: 'corta o som e deve ser evitado', e: ['é obrigatório em notas de 4 tempos', 'melhora o apoio', 'não é percebido pelo ouvinte'] },
    { p: 'Som bonito e som rápido: qual vem primeiro no estudo?', r: 'o som bonito', e: ['o som rápido', 'os dois ao mesmo tempo, sempre', 'depende do instrumento'] },
    { p: 'Tocar forte com o som estourado indica:', r: 'excesso de pressão em vez de apoio', e: ['boa projeção', 'instrumento de boa qualidade', 'aquecimento suficiente'] },
    { p: 'O ponto de partida do estudo diário é:', r: 'o aquecimento próprio do instrumento', e: ['a passagem mais difícil do hino', 'a escala mais rápida que se souber', 'a leitura de uma peça nova'] },
  ],
  chave: (v) => v.p,
  montar(v, rnd) {
    return { enunciado: v.p, alternativas: alternativas(v.r, v.e, rnd), correta: v.r, explicacao: `Resposta: ${v.r}.`, referencia: 'Método do instrumento — Fase 2' };
  },
});

registrar({
  id: 'i4.andamento-do-hino',
  fase: 'inst4',
  variantes: () => [[44, 54], [50, 66], [54, 72], [56, 76], [60, 72], [60, 80], [66, 84], [72, 88],
    [72, 96], [76, 92], [80, 96], [84, 104]].flatMap(([a, b]) => [{ a, b, sentido: 'media' }, { a, b, sentido: 'limite' }]),
  chave: (v) => `${v.a}-${v.b}-${v.sentido}`,
  montar(v, rnd) {
    if (v.sentido === 'media') {
      const media = (v.a + v.b) / 2;
      const erradas = [v.a, v.b, media + 4, media - 4, media + 8].map((x) => `${x} bpm`);
      return {
        enunciado: `O hino do ensaio traz ♩ = ${v.a} - ${v.b}. Em que velocidade convém tocá-lo?`,
        alternativas: alternativas(`${media} bpm`, erradas, rnd),
        correta: `${media} bpm`,
        explicacao: `Recomenda-se a média entre a mínima e a máxima: (${v.a} + ${v.b}) ÷ 2 = ${media} bpm.`,
        referencia: 'Método do instrumento — Fase 4',
      };
    }
    const correta = `entre ${v.a} e ${v.b} bpm`;
    const erradas = [`acima de ${v.b} bpm`, `abaixo de ${v.a} bpm`, `exatamente ${v.b} bpm, sempre`, `qualquer velocidade confortável`];
    return {
      enunciado: `Com a marcação ♩ = ${v.a} - ${v.b}, o hino deve ser entoado:`,
      alternativas: alternativas(correta, erradas, rnd),
      correta,
      explicacao: `As marcações determinam os limites dentro dos quais o hino deve ser entoado: ${correta}.`,
      referencia: 'Método do instrumento — Fase 4',
    };
  },
});
