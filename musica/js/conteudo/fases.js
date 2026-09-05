// Currículo do app, fase a fase, seguindo a ordem dos assuntos do
// Método Simplificado de Aprendizagem Musical (MSA) da Congregação Cristã no
// Brasil (1ª edição, dez/2022). A referência de página aponta para o livro
// impresso, para o aluno estudar os dois juntos.

import { pentagrama, figuraSolta, teclado } from '../notacao.js';
import { FIGURAS, ANDAMENTOS, DINAMICAS, PROPRIEDADES_DO_SOM, TERMOS_DE_EXPRESSAO } from '../musica.js';

const linhaDeFiguras = (pausa = false) =>
  `<div class="tira-figuras">${FIGURAS.slice(0, 5)
    .map((f) => `<figure>${figuraSolta(f.id, { pausa, tamanho: 62 })}<figcaption>${pausa ? f.pausa.replace('pausa de ', 'p. ') : f.nome}</figcaption></figure>`)
    .join('')}</div>`;

const tabela = (colunas, linhas) =>
  `<div class="rolagem"><table><thead><tr>${colunas.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
   <tbody>${linhas.map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

export const FASES = [
  // ------------------------------------------------------------------ 1
  {
    numero: 1,
    id: 'som',
    titulo: 'O som e a música',
    subtitulo: 'Propriedades do som, notas musicais',
    paginas: '9 a 11',
    icone: '🎧',
    cor: '#2f9e6b',
    resumo: 'Antes de ler uma partitura é preciso saber o que a partitura escreve: o som. Aqui você aprende as quatro propriedades do som e o nome das sete notas.',
    licoes: [
      {
        titulo: 'Som, ruído e música',
        pagina: 9,
        corpo: () => `
          <p><b>Som</b> é tudo aquilo que os nossos ouvidos podem perceber, produzido pela vibração de um corpo.
          Quando essa vibração é <b>regular</b>, temos o som musical; quando é <b>irregular</b>, temos o <b>ruído</b>.</p>
          <p><b>Música</b> é a arte de combinar os sons de forma agradável ao ouvido, obedecendo às leis da
          <b>melodia</b>, da <b>harmonia</b> e do <b>ritmo</b>.</p>
          <ul class="lista-chave">
            <li><b>Melodia</b> — sons que soam um depois do outro, formando o desenho da música.</li>
            <li><b>Harmonia</b> — sons diferentes que soam ao mesmo tempo, um apoiando o outro.</li>
            <li><b>Ritmo</b> — a ordem e a proporção da duração dos sons no tempo.</li>
          </ul>`,
      },
      {
        titulo: 'As quatro propriedades do som',
        pagina: 10,
        corpo: () => `
          <p>Todo som musical tem quatro propriedades. Guardar bem estas quatro palavras resolve boa parte da teoria:</p>
          ${tabela(['Propriedade', 'O que é'], PROPRIEDADES_DO_SOM.map((p) => [`<b>${p.nome}</b>`, p.definicao.replace(/^é /, '')]))}
          <p class="dica">Truque de memória: <b>A-D-I-T</b> — <b>A</b>ltura, <b>D</b>uração, <b>I</b>ntensidade, <b>T</b>imbre.
          Altura é grave/agudo; intensidade é fraco/forte. Trocar uma pela outra é o erro mais comum da prova.</p>`,
      },
      {
        titulo: 'As sete notas musicais',
        pagina: 11,
        corpo: () => `
          <p>As notas musicais são <b>sete</b>: <b>Dó, Ré, Mi, Fá, Sol, Lá e Si</b>. Depois do Si, a série recomeça no Dó,
          agora mais aguda — é a mesma nota, uma <b>oitava</b> acima.</p>
          <p>Na cifra internacional, usada em muitos instrumentos e métodos, elas se chamam:</p>
          ${tabela(['Dó', 'Ré', 'Mi', 'Fá', 'Sol', 'Lá', 'Si'], [['C', 'D', 'E', 'F', 'G', 'A', 'B']])}
          <p>No teclado, o <b>Dó</b> é sempre a tecla branca imediatamente à esquerda do grupo de <b>duas</b> teclas pretas:</p>
          <div class="quadro-teclado">${teclado({ marcadas: { 'Dó4': 'tonica', 'Dó5': 'tonica' } })}</div>`,
      },
    ],
    jogos: [
      { tipo: 'ouvido', modo: 'altura', titulo: 'Grave ou agudo?', descricao: 'Ouça as duas notas e diga se a segunda subiu ou desceu.' },
      { tipo: 'memoria', baralho: 'propriedades', titulo: 'Jogo da memória: propriedades do som', descricao: 'Junte cada propriedade com a sua definição.' },
    ],
  },

  // ------------------------------------------------------------------ 2
  {
    numero: 2,
    id: 'escrita',
    titulo: 'A escrita musical',
    subtitulo: 'Pentagrama, claves, figuras e pausas',
    paginas: '12 a 21',
    icone: '🎼',
    cor: '#1f7ae0',
    resumo: 'A pauta, as claves de Sol, Dó e Fá, as figuras de nota e de pausa e o número de equivalência: o alfabeto da partitura.',
    licoes: [
      {
        titulo: 'Pauta e pentagrama',
        pagina: 12,
        corpo: () => `
          <p>A <b>pauta musical</b> (ou <b>pentagrama</b>) é o conjunto de <b>5 linhas</b> e <b>4 espaços</b>,
          contados sempre <b>de baixo para cima</b>.</p>
          ${pentagrama({ clave: 'sol', notas: [], largura: 300 })}
          <p>Quando a nota não cabe na pauta, escrevemos <b>linhas suplementares</b>, acima ou abaixo dela.</p>`,
      },
      {
        titulo: 'As claves',
        pagina: 13,
        corpo: () => `
          <p>A <b>clave</b> é o sinal colocado no início da pauta que dá o nome às notas. O método usa três:</p>
          ${tabela(['Clave', 'Onde se apoia', 'Instrumentos/vozes'], [
            ['Clave de <b>Sol</b>', '2ª linha', 'flauta, violino, soprano, contralto'],
            ['Clave de <b>Dó</b>', '3ª linha', 'viola, trombone tenor, contralto'],
            ['Clave de <b>Fá</b>', '4ª linha', 'violoncelo, tuba, baixo'],
          ])}
          <div class="tres-claves">
            ${pentagrama({ clave: 'sol', notas: [{ letra: 'Sol', oitava: 4, figura: 'semibreve' }], largura: 190, rotulos: ['Sol'] })}
            ${pentagrama({ clave: 'do', notas: [{ letra: 'Dó', oitava: 4, figura: 'semibreve' }], largura: 190, rotulos: ['Dó'] })}
            ${pentagrama({ clave: 'fa', notas: [{ letra: 'Fá', oitava: 3, figura: 'semibreve' }], largura: 190, rotulos: ['Fá'] })}
          </div>
          <p class="dica">A clave marca <b>uma</b> nota na pauta; todas as outras saem contando linha e espaço a partir dela.</p>`,
      },
      {
        titulo: 'Figuras de nota',
        pagina: 15,
        corpo: () => `
          <p>As <b>figuras</b> indicam a <b>duração</b> do som. Cada uma vale o dobro da seguinte:</p>
          ${linhaDeFiguras(false)}
          ${tabela(['Figura', 'Nº de equivalência', 'Vale, em compasso simples de semínima'],
            FIGURAS.slice(0, 5).map((f) => [f.nome, String(f.equivalencia), f.duracao >= 1 ? `${f.duracao} tempo${f.duracao > 1 ? 's' : ''}` : `${1 / f.duracao === 2 ? 'meio tempo' : `1/${1 / f.duracao} de tempo`}`]))}
          <p>O <b>número de equivalência</b> diz quantas figuras daquele tipo cabem numa semibreve: 1 semibreve = 2 mínimas =
          4 semínimas = 8 colcheias = 16 semicolcheias.</p>`,
      },
      {
        titulo: 'Partes da nota e pausas',
        pagina: 17,
        corpo: () => `
          <p>A nota escrita tem <b>cabeça</b>, <b>haste</b> e, a partir da colcheia, <b>colchete</b> (bandeirola).
          Quando várias colcheias vêm juntas, os colchetes viram uma <b>barra de ligação</b>.</p>
          <p>Para cada figura existe uma <b>pausa</b> de mesmo valor — o silêncio também é medido:</p>
          ${linhaDeFiguras(true)}
          <p class="dica">Pausa não é descanso do músico: é som que não soa, mas que continua sendo contado.</p>`,
      },
    ],
    jogos: [
      { tipo: 'memoria', baralho: 'figuras', titulo: 'Memória das figuras', descricao: 'Junte cada figura ao seu nome e valor.' },
      { tipo: 'pentagrama', modo: 'ler', titulo: 'Leitura relâmpago', descricao: 'Diga o nome da nota que aparecer na pauta.' },
    ],
  },

  // ------------------------------------------------------------------ 3
  {
    numero: 3,
    id: 'ritmo',
    titulo: 'Ritmo, pulsação e compasso',
    subtitulo: 'Fórmulas simples, tempos fortes e condução',
    paginas: '22 a 30',
    icone: '🥁',
    cor: '#e0761f',
    resumo: 'Pulsação, ritmo, barras de compasso e as fórmulas 2/4, 3/4 e 4/4 — mais os movimentos de condução para o solfejo.',
    licoes: [
      {
        titulo: 'Pulsação e ritmo',
        pagina: 22,
        corpo: () => `
          <p>A <b>pulsação</b> é a batida regular que corre por baixo da música, sempre igual, como o tique-taque do relógio
          ou as batidas do coração. É o que fazemos com o pé.</p>
          <p>O <b>ritmo</b> é o desenho das durações que se apoia nessa pulsação: notas longas e curtas, sons e silêncios.</p>
          <p class="dica">Pulsação é o chão; ritmo é o que se dança em cima do chão.</p>`,
      },
      {
        titulo: 'Compasso e fórmula de compasso',
        pagina: 24,
        corpo: () => `
          <p>A música é dividida em <b>compassos</b>, separados por <b>barras de compasso</b>. No fim da peça vem a
          <b>barra final</b> (uma fina e uma grossa).</p>
          <p>A <b>fórmula de compasso</b> aparece no início, depois da clave e da armadura. Nos compassos simples:</p>
          <ul class="lista-chave">
            <li>o número de <b>cima</b> diz <b>quantos tempos</b> tem cada compasso;</li>
            <li>o número de <b>baixo</b> diz <b>qual figura vale um tempo</b> (4 = semínima, 2 = mínima, 8 = colcheia).</li>
          </ul>
          ${pentagrama({ clave: 'sol', compasso: '3/4', notas: [
            { letra: 'Sol', oitava: 4, figura: 'seminima' }, { letra: 'Lá', oitava: 4, figura: 'seminima' }, { letra: 'Si', oitava: 4, figura: 'seminima' }], largura: 300 })}
          ${tabela(['Fórmula', 'Tempos', 'Espécie'], [['2/4', '2', 'binário'], ['3/4', '3', 'ternário'], ['4/4', '4', 'quaternário']])}`,
      },
      {
        titulo: 'Tempos fortes e fracos',
        pagina: 26,
        corpo: () => `
          <p>Dentro do compasso os tempos não têm todos o mesmo peso. O <b>1º tempo é sempre forte</b>.</p>
          ${tabela(['Compasso', 'Desenho dos tempos'], [
            ['Binário (2/4)', '<b>forte</b> · fraco'],
            ['Ternário (3/4)', '<b>forte</b> · fraco · fraco'],
            ['Quaternário (4/4)', '<b>forte</b> · fraco · meio-forte · fraco'],
          ])}
          <p>É esse desenho que faz o ouvinte sentir onde o compasso começa, mesmo sem ver a partitura.</p>`,
      },
      {
        titulo: 'Solfejo e movimentos de condução',
        pagina: 27,
        corpo: () => `
          <p><b>Solfejar</b> é ler a música cantando o nome das notas, no ritmo certo. Para não perder a pulsação,
          usamos o <b>movimento de condução</b> da mão, um desenho para cada espécie de compasso.</p>
          ${tabela(['Compasso', 'Movimento da mão'], [
            ['em 2', 'baixo → cima'],
            ['em 3', 'baixo → lado → cima'],
            ['em 4', 'baixo → esquerda → direita → cima'],
          ])}
          <p>O pé marca a <b>pulsação</b>; a mão marca o <b>compasso</b>; a voz faz o <b>ritmo</b>. Os três ao mesmo tempo.</p>`,
      },
    ],
    jogos: [
      { tipo: 'ritmo', titulo: 'Fecha o compasso', descricao: 'Escolha as figuras que completam o compasso, sem sobrar nem faltar.' },
      { tipo: 'pulso', titulo: 'No compasso', descricao: 'Toque na tela junto com o metrônomo e veja a sua precisão.' },
    ],
  },

  // ------------------------------------------------------------------ 4
  {
    numero: 4,
    id: 'duracao',
    titulo: 'Metrônomo, ponto de aumento e tercinas',
    subtitulo: 'Velocidade, prolongamento e divisão especial',
    paginas: '31 a 51',
    icone: '⏱️',
    cor: '#8a4fd3',
    resumo: 'O metrônomo e o bpm, o ponto de aumento, a ligadura de valor, a fermata e a tercina — as ferramentas que esticam e dividem o tempo.',
    licoes: [
      {
        titulo: 'Metrônomo e andamento',
        pagina: 31,
        corpo: () => `
          <p>O <b>metrônomo</b> é o aparelho que dá cliques regulares numa velocidade ajustável. Serve para determinar
          a velocidade da música e para manter a frequência regular das batidas — a <b>pulsação musical</b>.</p>
          <p>Existe o mecânico, o <b>metrônomo de Maelzel (M.M.)</b>, e os digitais — inclusive aplicativos de celular.</p>
          <p>A indicação <b>♩ = 100</b> (ou M.M. = 100) quer dizer <b>100 batidas por minuto</b>, cada batida valendo uma semínima.</p>
          <blockquote>Quando o hino traz uma faixa, por exemplo <b>♩ = 60 - 80</b>, ele deve ser entoado dentro desses
          limites, sendo recomendável ficar na <b>média</b> entre a velocidade mínima e a máxima.</blockquote>
          <p class="dica">Faixa 60–80 → a média é <b>70</b>. Essa conta cai na avaliação.</p>`,
      },
      {
        titulo: 'Ponto de aumento',
        pagina: 35,
        corpo: () => `
          <p>O <b>ponto de aumento</b> é o pontinho colocado à direita da figura. Ele <b>aumenta metade do valor</b> da figura.</p>
          ${tabela(['Figura', 'Vale', 'Com ponto, vale'], [
            ['semibreve', '4 tempos', '6 tempos'],
            ['mínima', '2 tempos', '3 tempos'],
            ['semínima', '1 tempo', '1 tempo e meio'],
            ['colcheia', 'meio tempo', '3/4 de tempo'],
          ])}
          <p>Um <b>segundo ponto</b> acrescenta a metade do primeiro ponto (1/4 do valor original):
          mínima com dois pontos = 2 + 1 + 0,5 = <b>3,5 tempos</b>.</p>`,
      },
      {
        titulo: 'Ligadura e fermata',
        pagina: 38,
        corpo: () => `
          <p>A <b>ligadura de valor</b> une duas notas <b>de mesma altura</b>: soa uma nota só, com a soma das durações.
          A <b>ligadura de expressão</b> (portamento) une notas <b>diferentes</b> e pede que sejam tocadas ligadas, sem cortar o som.</p>
          <p>A <b>fermata</b> (o olhinho sobre a nota) manda prolongar o som além do seu valor, a critério do regente.</p>
          <p class="dica">Mínima ligada a uma semínima = 2 + 1 = <b>3 tempos</b> de som contínuo, atacado uma vez só.</p>`,
      },
      {
        titulo: 'Tercinas',
        pagina: 44,
        corpo: () => `
          <p>A <b>tercina</b> é a divisão de um valor em <b>três partes iguais</b> no lugar de duas. Vem escrita com o
          número <b>3</b> sobre (ou sob) o grupo.</p>
          <ul class="lista-chave">
            <li>tercina de colcheias = 3 colcheias no tempo de <b>2</b> colcheias (1 semínima);</li>
            <li>tercina de semínimas = 3 semínimas no tempo de <b>2</b> semínimas (1 mínima).</li>
          </ul>
          <p>É a divisão <b>ternária</b> aparecendo dentro de um compasso <b>simples</b>, que é binário por natureza.</p>`,
      },
    ],
    jogos: [
      { tipo: 'pulso', titulo: 'Acerta o bpm', descricao: 'Marque a pulsação e descubra em que velocidade você está batendo.' },
      { tipo: 'ritmo', titulo: 'Fecha o compasso com ponto', descricao: 'Agora com figuras pontuadas na conta.', comPonto: true },
    ],
  },

  // ------------------------------------------------------------------ 5
  {
    numero: 5,
    id: 'semitons',
    titulo: 'Tons, semitons e acidentes',
    subtitulo: 'Sustenido, bemol, bequadro e enarmonia',
    paginas: '52 a 60',
    icone: '🎹',
    cor: '#d33f6a',
    resumo: 'A menor distância entre dois sons, os sinais que alteram a nota e a diferença entre semitom cromático e diatônico.',
    licoes: [
      {
        titulo: 'Tom e semitom',
        pagina: 52,
        corpo: () => `
          <p>O <b>semitom</b> é a <b>menor distância</b> entre dois sons no nosso sistema musical. Dois semitons formam um <b>tom</b>.</p>
          <p>No teclado, o semitom é a distância de uma tecla para a tecla <b>imediatamente vizinha</b>, seja branca ou preta.
          Por isso, entre <b>Mi–Fá</b> e entre <b>Si–Dó</b> há apenas um semitom: não existe tecla preta entre elas.</p>
          <div class="quadro-teclado">${teclado({ marcadas: { 'Mi4': 'grau', 'Fá4': 'grau', 'Si4': 'alterada', 'Dó5': 'alterada' } })}</div>`,
      },
      {
        titulo: 'Os acidentes',
        pagina: 53,
        corpo: () => `
          <p>Os <b>acidentes</b> alteram a altura da nota:</p>
          ${tabela(['Sinal', 'Nome', 'O que faz'], [
            ['♯', 'sustenido', 'sobe a nota um semitom'],
            ['♭', 'bemol', 'desce a nota um semitom'],
            ['♮', 'bequadro', 'cancela o acidente anterior'],
            ['𝄪', 'dobrado sustenido', 'sobe a nota um tom'],
            ['𝄫', 'dobrado bemol', 'desce a nota um tom'],
          ])}
          <p>O acidente escrito no meio da música vale <b>até o fim do compasso</b>, e só para as notas naquela mesma linha
          ou espaço. Já o acidente da <b>armadura de clave</b> vale para a peça inteira, em todas as oitavas.</p>`,
      },
      {
        titulo: 'Semitom cromático e diatônico',
        pagina: 53,
        corpo: () => `
          <p>Dois semitons podem soar igual e se escrever de modos diferentes:</p>
          <ul class="lista-chave">
            <li><b>Semitom cromático</b>: as duas notas têm o <b>mesmo nome</b> — Dó → Dó♯, Lá → Lá♭.</li>
            <li><b>Semitom diatônico</b>: as duas notas têm <b>nomes diferentes</b> — Mi → Fá, Dó → Ré♭.</li>
          </ul>
          <p class="dica">Mesmo nome = cromático. Nome trocado = diatônico. Só isso.</p>`,
      },
      {
        titulo: 'Enarmonia e uníssono',
        pagina: 54,
        corpo: () => `
          <p><b>Notas enarmônicas</b> são notas de nomes diferentes que soam igual: Dó♯ = Ré♭, Fá♯ = Sol♭, Mi = Fá♭.</p>
          <p><b>Uníssono</b> é o mesmo som cantado ou tocado por vozes ou instrumentos diferentes ao mesmo tempo —
          quando toda a congregação canta a mesma melodia, está cantando em uníssono.</p>`,
      },
    ],
    jogos: [
      { tipo: 'teclado', modo: 'semitom', titulo: 'Caça ao semitom', descricao: 'Toque a tecla que fica um semitom acima ou abaixo.' },
      { tipo: 'memoria', baralho: 'acidentes', titulo: 'Memória dos acidentes', descricao: 'Junte cada sinal ao seu efeito.' },
    ],
  },

  // ------------------------------------------------------------------ 6
  {
    numero: 6,
    id: 'escalas',
    titulo: 'Escalas maiores e armaduras',
    subtitulo: 'T T st T T T st, sustenidos e bemóis',
    paginas: '61 a 79',
    icone: '🔑',
    cor: '#0f8f9e',
    resumo: 'Como se constrói qualquer escala maior, a ordem dos sustenidos e dos bemóis e como descobrir a tonalidade só de olhar a armadura.',
    licoes: [
      {
        titulo: 'A escala maior modelo',
        pagina: 61,
        corpo: () => `
          <p>A escala de <b>Dó Maior</b> é a escala modelo: só notas naturais. O que a define não são as notas, e sim o
          <b>padrão de tons e semitons</b> entre elas:</p>
          <p class="padrao">T &nbsp; T &nbsp; st &nbsp; T &nbsp; T &nbsp; T &nbsp; st</p>
          <p>Ou seja: os semitons caem sempre entre o <b>3º e o 4º</b> graus e entre o <b>7º e o 8º</b> graus.
          Qualquer nota pode ser tônica, desde que esse padrão seja mantido — e é aí que entram os acidentes.</p>
          <div class="quadro-teclado">${teclado({ marcadas: { 'Dó4': 'tonica', 'Ré4': 'grau', 'Mi4': 'grau', 'Fá4': 'grau', 'Sol4': 'grau', 'Lá4': 'grau', 'Si4': 'grau', 'Dó5': 'tonica' } })}</div>`,
      },
      {
        titulo: 'Escalas com sustenidos',
        pagina: 63,
        corpo: () => `
          <p>Para achar a próxima escala com sustenido, tomamos a <b>5ª nota</b> da escala anterior como nova tônica
          (Dó → Sol → Ré → Lá → Mi → Si → Fá♯ → Dó♯) e acrescentamos o sustenido necessário para manter o padrão.</p>
          <p>Os sustenidos entram sempre nesta ordem — <b>Fá, Dó, Sol, Ré, Lá, Mi, Si</b>:</p>
          ${pentagrama({ clave: 'sol', armadura: { letras: ['Fá', 'Dó', 'Sol', 'Ré', 'Lá', 'Mi', 'Si'], tipo: 'sustenido' }, largura: 300 })}
          <p class="dica">Com sustenidos: a <b>tônica é um semitom acima do último sustenido</b> da armadura.
          Armadura com Fá♯ e Dó♯ → último é Dó♯ → tonalidade de <b>Ré Maior</b>.</p>`,
      },
      {
        titulo: 'Escalas com bemóis',
        pagina: 61,
        corpo: () => `
          <p>Para as escalas com bemol partimos da <b>4ª nota</b> da escala anterior (Dó → Fá → Si♭ → Mi♭ → Lá♭ → Ré♭ → Sol♭ → Dó♭),
          mantendo o mesmo padrão T T st T T T st. O nome da escala leva o acidente da tônica: não é "Si Maior", é <b>Si bemol Maior</b>.</p>
          <p>Os bemóis entram na ordem inversa dos sustenidos — <b>Si, Mi, Lá, Ré, Sol, Dó, Fá</b>:</p>
          ${pentagrama({ clave: 'sol', armadura: { letras: ['Si', 'Mi', 'Lá', 'Ré', 'Sol', 'Dó', 'Fá'], tipo: 'bemol' }, largura: 300 })}
          <p class="dica">Com bemóis: o <b>penúltimo bemol dá o nome</b> da tonalidade. Com um bemol só (Si♭), é <b>Fá Maior</b> — esse decora.</p>`,
      },
      {
        titulo: 'Armadura de clave',
        pagina: 66,
        corpo: () => `
          <p>A <b>armadura de clave</b> é o conjunto de sustenidos ou bemóis escrito logo depois da clave. Ela evita repetir
          o acidente a cada nota e vale para a música inteira, em qualquer oitava.</p>
          <p>Numa mesma armadura nunca se misturam sustenidos e bemóis, e a ordem dos acidentes é sempre a mesma.</p>
          ${tabela(['Acidentes', 'Tonalidade maior', 'Relativa menor'], [
            ['nenhum', 'Dó Maior', 'Lá menor'],
            ['1 ♯ (Fá♯)', 'Sol Maior', 'Mi menor'],
            ['2 ♯', 'Ré Maior', 'Si menor'],
            ['3 ♯', 'Lá Maior', 'Fá♯ menor'],
            ['1 ♭ (Si♭)', 'Fá Maior', 'Ré menor'],
            ['2 ♭', 'Si♭ Maior', 'Sol menor'],
            ['3 ♭', 'Mi♭ Maior', 'Dó menor'],
          ])}`,
      },
    ],
    jogos: [
      { tipo: 'teclado', modo: 'escala', titulo: 'Monte a escala', descricao: 'Construa a escala maior tecla por tecla, seguindo T T st T T T st.' },
      { tipo: 'armadura', titulo: 'Que tonalidade é essa?', descricao: 'Olhe a armadura e acerte a tonalidade.' },
    ],
  },

  // ------------------------------------------------------------------ 7
  {
    numero: 7,
    id: 'tonalidade',
    titulo: 'Tonalidade, intervalos e dinâmica',
    subtitulo: 'Maior e menor, distâncias e volume',
    paginas: '80 a 100',
    icone: '🎵',
    cor: '#c2185b',
    resumo: 'Tonalidade maior e menor, relativa menor, intervalos entre notas, ritornello e os sinais de dinâmica.',
    licoes: [
      {
        titulo: 'Tonalidade maior e menor',
        pagina: 80,
        corpo: () => `
          <p><b>Tonalidade</b> é o conjunto de sons de uma escala organizados em torno da <b>tônica</b>, a nota que dá
          o nome e o repouso à música.</p>
          <ul class="lista-chave">
            <li><b>Maior</b> — 3º grau a <b>dois tons</b> da tônica (3ª maior). Som mais aberto, alegre.</li>
            <li><b>Menor</b> — 3º grau a <b>um tom e meio</b> da tônica (3ª menor). Som mais recolhido.</li>
          </ul>
          <p>Cada tonalidade maior tem uma <b>relativa menor</b>, com a <b>mesma armadura</b>, cuja tônica está uma
          <b>3ª menor abaixo</b> (ou, o que dá no mesmo, no <b>6º grau</b> da escala maior): Dó Maior ↔ Lá menor.</p>`,
      },
      {
        titulo: 'Intervalos',
        pagina: 84,
        corpo: () => `
          <p><b>Intervalo</b> é a distância entre duas notas. Conta-se pelo <b>número de graus</b>, incluindo as duas pontas:
          de Dó a Mi contam-se Dó, Ré, Mi = <b>3ª</b>.</p>
          ${tabela(['Intervalo', 'Tons e semitons', 'Exemplo'], [
            ['2ª menor', '1 semitom', 'Mi → Fá'],
            ['2ª maior', '1 tom', 'Dó → Ré'],
            ['3ª menor', '1 tom e meio', 'Lá → Dó'],
            ['3ª maior', '2 tons', 'Dó → Mi'],
            ['4ª justa', '2 tons e meio', 'Dó → Fá'],
            ['5ª justa', '3 tons e meio', 'Dó → Sol'],
            ['8ª justa', '6 tons', 'Dó → Dó'],
          ])}
          <p>Intervalo <b>melódico</b> é uma nota depois da outra; <b>harmônico</b> é as duas ao mesmo tempo.</p>`,
      },
      {
        titulo: 'Dinâmica',
        pagina: 93,
        corpo: () => `
          <p>Os sinais de <b>dinâmica</b> dizem com que <b>intensidade</b> tocar ou cantar:</p>
          ${tabela(['Sinal', 'Termo', 'Sentido'], DINAMICAS.map((d) => [`<b>${d.sigla}</b>`, `<i>${d.termo}</i>`, d.sentido]))}
          <p>Ainda existem o <b>crescendo</b> (&lt;), que aumenta aos poucos, e o <b>diminuendo</b> (&gt;), que diminui.</p>`,
      },
      {
        titulo: 'Sinais de repetição',
        pagina: 86,
        corpo: () => `
          <p>O <b>ritornello</b> (‖: … :‖) manda repetir o trecho entre os dois sinais. Se aparece só o de fechar,
          repete-se desde o início.</p>
          <ul class="lista-chave">
            <li><b>Casa 1 e casa 2</b> — na repetição, pula-se a primeira casa e toca-se a segunda.</li>
            <li><b>D.C. (Da Capo)</b> — volta ao começo.</li>
            <li><b>Fine</b> — marca onde a música termina de verdade.</li>
          </ul>`,
      },
    ],
    jogos: [
      { tipo: 'teclado', modo: 'intervalo', titulo: 'Mede o intervalo', descricao: 'Toque a nota que fica à distância pedida.' },
      { tipo: 'ouvido', modo: 'intensidade', titulo: 'Forte ou fraco?', descricao: 'Ouça e diga qual sinal de dinâmica corresponde.' },
    ],
  },

  // ------------------------------------------------------------------ 8
  {
    numero: 8,
    id: 'composto',
    titulo: 'Compasso composto e subdivisão',
    subtitulo: '6/8, 9/8, 12/8 e a divisão do tempo',
    paginas: '101 a 110',
    icone: '🌀',
    cor: '#4a6cf7',
    resumo: 'Subdivisão binária e ternária, a unidade de tempo pontuada e os movimentos de condução em 6, 9 e 12.',
    licoes: [
      {
        titulo: 'Subdivisão binária e ternária',
        pagina: 101,
        corpo: () => `
          <p><b>Subdividir</b> é partir cada tempo em partes iguais.</p>
          <ul class="lista-chave">
            <li><b>Subdivisão binária</b> — o tempo se divide em <b>2</b> partes. É o compasso <b>simples</b>.</li>
            <li><b>Subdivisão ternária</b> — o tempo se divide em <b>3</b> partes. É o compasso <b>composto</b>.</li>
          </ul>
          <p>Em 4/4, uma semínima (1 tempo) se parte em 2 colcheias. Em 6/8, o tempo é a colcheia pontuada e se parte
          em 3 colcheias.</p>`,
      },
      {
        titulo: 'Como ler a fórmula composta',
        pagina: 102,
        corpo: () => `
          <p>Nos compassos compostos os números <b>não</b> se leem como nos simples. Para achar o número de tempos,
          <b>divida o número de cima por 3</b>; a unidade de tempo é a figura de baixo <b>pontuada</b>.</p>
          ${tabela(['Fórmula', 'Tempos', 'Unidade de tempo', 'Espécie'], [
            ['6/8', '2', 'colcheia pontuada', 'binário composto'],
            ['9/8', '3', 'colcheia pontuada', 'ternário composto'],
            ['12/8', '4', 'colcheia pontuada', 'quaternário composto'],
            ['6/4', '2', 'semínima pontuada', 'binário composto'],
          ])}
          ${pentagrama({ clave: 'sol', compasso: '6/8', notas: [
            { letra: 'Sol', oitava: 4, figura: 'colcheia' }, { letra: 'Lá', oitava: 4, figura: 'colcheia' },
            { letra: 'Si', oitava: 4, figura: 'colcheia' }, { letra: 'Dó', oitava: 5, figura: 'seminima', pontuada: true }], largura: 320 })}`,
      },
      {
        titulo: 'Compasso composto e o seu simples correspondente',
        pagina: 104,
        corpo: () => `
          <p>Cada composto tem um simples de mesma espécie — muda a subdivisão, não a quantidade de tempos:</p>
          ${tabela(['Simples', 'Composto', 'Espécie'], [
            ['2/4', '6/8', 'binário'], ['3/4', '9/8', 'ternário'], ['4/4', '12/8', 'quaternário'],
          ])}
          <p>Os <b>movimentos de condução</b> são os mesmos do simples de mesma espécie: 6/8 conduz-se como binário
          (baixo–cima), 9/8 como ternário, 12/8 como quaternário. O que muda é que cada movimento carrega <b>três</b>
          subdivisões em vez de duas.</p>`,
      },
      {
        titulo: 'Solfejo em 6, 9 e 12',
        pagina: 106,
        corpo: () => `
          <p>Quando o andamento é lento, o compasso composto pode ser conduzido <b>subdividido</b>: em vez de 2 movimentos
          em 6/8, fazem-se <b>6</b>; em vez de 3 em 9/8, fazem-se <b>9</b>; em 12/8, <b>12</b>.</p>
          <p>Isso ajuda a manter a precisão nas passagens lentas e nas figuras curtas, e é o mesmo recurso usado no
          estudo dos hinos em andamento reduzido.</p>`,
      },
    ],
    jogos: [
      { tipo: 'ritmo', titulo: 'Fecha o compasso composto', descricao: 'Complete compassos 6/8, 9/8 e 12/8.', composto: true },
      { tipo: 'pulso', titulo: 'Conduzir em 6/8', descricao: 'Bata a pulsação da colcheia pontuada.', compasso: '6/8' },
    ],
  },

  // ------------------------------------------------------------------ 9
  {
    numero: 9,
    id: 'sincopa',
    titulo: 'Síncopa, contratempo e ritmos iniciais',
    subtitulo: 'Tético, anacrústico e acéfalo',
    paginas: '111 a 125',
    icone: '⚡',
    cor: '#e6a700',
    resumo: 'O deslocamento do acento, o ataque no tempo fraco e as três maneiras de uma música começar.',
    licoes: [
      {
        titulo: 'Síncopa',
        pagina: 111,
        corpo: () => `
          <p><b>Síncopa</b> é a nota que <b>começa num tempo (ou parte) fraco e se prolonga</b> sobre o tempo forte
          seguinte, deslocando o acento natural do compasso.</p>
          <p>Ela nasce de uma nota curta, uma longa e outra curta, ou de uma ligadura que atravessa a batida.
          É o balanço característico de muitos hinos e de quase toda a música popular brasileira.</p>`,
      },
      {
        titulo: 'Contratempo',
        pagina: 114,
        corpo: () => `
          <p><b>Contratempo</b> é o som que ataca no tempo (ou parte) <b>fraco</b> e <b>não</b> se prolonga sobre o forte:
          antes do forte há uma <b>pausa</b>.</p>
          <p class="dica">A diferença é só essa: se o som <b>invade</b> o tempo forte, é <b>síncopa</b>;
          se o tempo forte está <b>em silêncio</b>, é <b>contratempo</b>.</p>`,
      },
      {
        titulo: 'Ritmos iniciais',
        pagina: 118,
        corpo: () => `
          <p>Toda peça começa de uma destas três maneiras — e o nome depende do <b>primeiro compasso</b>:</p>
          ${tabela(['Ritmo inicial', 'Como começa'], [
            ['<b>Tético</b>', 'no <b>1º tempo</b>, forte, com o compasso completo'],
            ['<b>Anacrústico</b>', 'antes do 1º tempo forte, com um compasso incompleto (anacruse)'],
            ['<b>Acéfalo</b>', 'com <b>pausa</b> no 1º tempo, escrita ou não escrita'],
          ])}
          <p>Considera-se <b>acéfalo</b> quando as notas desse primeiro compasso abrangem <b>mais da metade</b> de um
          compasso binário ou quaternário, ou <b>mais de dois terços</b> de um compasso ternário.</p>`,
      },
      {
        titulo: 'Onde o ritmo inicial vale',
        pagina: 121,
        corpo: () => `
          <p>Os ritmos iniciais <b>somente iniciam</b> a partitura: nunca se encontram no meio dela.
          Um contratempo que aparece no meio do hino é apenas um contratempo — não é compasso de ritmo acéfalo.</p>
          <p>Quando o contratempo está no <b>primeiro tempo</b> da peça, aí sim ele recebe o nome de
          <b>ritmo inicial acéfalo</b>.</p>
          <p>No hinário há apenas <b>dois</b> hinos acéfalos, ambos <b>sem pausa inicial escrita</b>:
          o <b>208</b> ("Conserva a paz, ó minha alma") e o <b>377</b> ("No céu, Senhor, no céu").</p>`,
      },
    ],
    jogos: [
      { tipo: 'ritmo', modo: 'classificar', titulo: 'Síncopa ou contratempo?', descricao: 'Veja o desenho e classifique.' },
      { tipo: 'memoria', baralho: 'iniciais', titulo: 'Memória dos ritmos iniciais', descricao: 'Junte cada ritmo inicial à sua definição.' },
    ],
  },

  // ------------------------------------------------------------------ 10
  {
    numero: 10,
    id: 'interpretacao',
    titulo: 'Interpretação, andamento e forma',
    subtitulo: 'Termos, agógica, frase e semifrase',
    paginas: '126 a 140',
    icone: '🎯',
    cor: '#6d4c41',
    resumo: 'Notas pontuadas na subdivisão, os termos de andamento e de expressão e o desenho da frase musical.',
    licoes: [
      {
        titulo: 'Notas pontuadas na subdivisão',
        pagina: 126,
        corpo: () => `
          <p>No compasso <b>simples</b>, a semínima pontuada vale 1 tempo e meio: ela ocupa o tempo inteiro
          <b>mais</b> a primeira metade do tempo seguinte.</p>
          <p>No compasso <b>composto</b>, a mesma figura pontuada costuma valer <b>um tempo inteiro</b>,
          porque ali a unidade de tempo já é pontuada.</p>
          <p class="dica">Antes de contar o valor de uma figura pontuada, olhe primeiro a fórmula de compasso:
          simples ou composto muda a resposta.</p>`,
      },
      {
        titulo: 'Termos de andamento',
        pagina: 129,
        corpo: () => `
          <p>Os termos de andamento, quase todos em italiano, dizem a velocidade da peça:</p>
          ${tabela(['Termo', 'Aproximadamente', 'Sentido'], ANDAMENTOS.map((a) => [`<b>${a.termo}</b>`, a.faixa, a.sentido]))}`,
      },
      {
        titulo: 'Mudanças de andamento e expressão',
        pagina: 131,
        corpo: () => `
          <p>Durante a música o andamento pode mudar de propósito:</p>
          ${tabela(['Termo', 'Sentido'], TERMOS_DE_EXPRESSAO.map((t) => [`<i>${t.termo}</i>`, t.sentido]))}
          <p>São indicações de <b>agógica</b> e de <b>expressão</b>: não mudam as notas, mudam o modo de dizê-las.</p>`,
      },
      {
        titulo: 'Frase e semifrase',
        pagina: 136,
        corpo: () => `
          <p>A música se organiza como a fala. A <b>frase musical</b> é a ideia completa, que termina numa espécie de
          ponto final; a <b>semifrase</b> é a metade dessa ideia, com uma vírgula no meio.</p>
          <p>Frases costumam ter <b>4 ou 8 compassos</b>, e as semifrases, a metade disso. É o que orienta onde
          <b>respirar</b> ao cantar e onde o regente pede o fraseado.</p>
          <p>Indicações como <i>solene</i>, escritas no alto da partitura, dizem o <b>caráter</b> da execução —
          na Congregação, é a diferença entre um hino de louvor e um hino de súplica.</p>`,
      },
    ],
    jogos: [
      { tipo: 'memoria', baralho: 'andamentos', titulo: 'Memória dos andamentos', descricao: 'Junte cada termo à sua velocidade.' },
      { tipo: 'pentagrama', modo: 'ler', titulo: 'Leitura relâmpago — final', descricao: 'Leitura nas três claves, contra o relógio.', claves: ['sol', 'do', 'fa'] },
    ],
  },
];

export const faseNumero = (n) => FASES.find((f) => f.numero === n);
export const TOTAL_DE_FASES = FASES.length;
