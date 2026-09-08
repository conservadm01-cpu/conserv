// Núcleo de teoria musical do método: notas, figuras, compassos, escalas,
// armaduras e intervalos. Tudo em português, com a mesma nomenclatura do
// Método Simplificado de Aprendizagem Musical (MSA).

export const LETRAS = ['Dó', 'Ré', 'Mi', 'Fá', 'Sol', 'Lá', 'Si'];
export const CIFRAS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const SEMITONS_DA_LETRA = [0, 2, 4, 5, 7, 9, 11];

export const SINAIS = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };
export const NOME_DO_SINAL = {
  '-2': 'dobrado bemol', '-1': 'bemol', 0: 'natural', 1: 'sustenido', 2: 'dobrado sustenido',
};

export function nota(letra, alteracao = 0) {
  return { letra, alteracao };
}

export function nomeDaNota(n, { curto = false } = {}) {
  if (!n.alteracao) return n.letra;
  return curto ? n.letra + SINAIS[n.alteracao] : `${n.letra} ${NOME_DO_SINAL[n.alteracao]}`;
}

export function semitomDaNota(n) {
  return (SEMITONS_DA_LETRA[LETRAS.indexOf(n.letra)] + n.alteracao + 120) % 12;
}

// ---------------------------------------------------------------- figuras

// duracao = tempos em compasso simples cuja unidade de tempo é a semínima.
export const FIGURAS = [
  { id: 'semibreve', nome: 'semibreve', pausa: 'pausa de semibreve', duracao: 4, equivalencia: 1 },
  { id: 'minima', nome: 'mínima', pausa: 'pausa de mínima', duracao: 2, equivalencia: 2 },
  { id: 'seminima', nome: 'semínima', pausa: 'pausa de semínima', duracao: 1, equivalencia: 4 },
  { id: 'colcheia', nome: 'colcheia', pausa: 'pausa de colcheia', duracao: 0.5, equivalencia: 8 },
  { id: 'semicolcheia', nome: 'semicolcheia', pausa: 'pausa de semicolcheia', duracao: 0.25, equivalencia: 16 },
  { id: 'fusa', nome: 'fusa', pausa: 'pausa de fusa', duracao: 0.125, equivalencia: 32 },
  { id: 'semifusa', nome: 'semifusa', pausa: 'pausa de semifusa', duracao: 0.0625, equivalencia: 64 },
];

export const figuraPorId = (id) => FIGURAS.find((f) => f.id === id);

export function fracaoBonita(valor) {
  if (Number.isInteger(valor)) return String(valor);
  const denominadores = [2, 4, 8, 16, 32];
  for (const d of denominadores) {
    if (Math.abs(valor * d - Math.round(valor * d)) < 1e-9) {
      const n = Math.round(valor * d);
      const inteiro = Math.floor(n / d);
      const resto = n - inteiro * d;
      if (!resto) return String(inteiro);
      return inteiro ? `${inteiro} e ${resto}/${d}` : `${resto}/${d}`;
    }
  }
  return String(valor);
}

// ------------------------------------------------------------- compassos

export const COMPASSOS_SIMPLES = [
  { formula: '2/4', tempos: 2, unidade: 'seminima', especie: 'binário', nome: 'binário simples' },
  { formula: '3/4', tempos: 3, unidade: 'seminima', especie: 'ternário', nome: 'ternário simples' },
  { formula: '4/4', tempos: 4, unidade: 'seminima', especie: 'quaternário', nome: 'quaternário simples' },
  { formula: '2/2', tempos: 2, unidade: 'minima', especie: 'binário', nome: 'binário simples' },
  { formula: '3/2', tempos: 3, unidade: 'minima', especie: 'ternário', nome: 'ternário simples' },
  { formula: '4/2', tempos: 4, unidade: 'minima', especie: 'quaternário', nome: 'quaternário simples' },
  { formula: '2/8', tempos: 2, unidade: 'colcheia', especie: 'binário', nome: 'binário simples' },
  { formula: '3/8', tempos: 3, unidade: 'colcheia', especie: 'ternário', nome: 'ternário simples' },
  { formula: '4/8', tempos: 4, unidade: 'colcheia', especie: 'quaternário', nome: 'quaternário simples' },
];

export const COMPASSOS_COMPOSTOS = [
  { formula: '6/8', tempos: 2, unidade: 'colcheia pontuada', especie: 'binário', nome: 'binário composto', simples: '2/4' },
  { formula: '9/8', tempos: 3, unidade: 'colcheia pontuada', especie: 'ternário', nome: 'ternário composto', simples: '3/4' },
  { formula: '12/8', tempos: 4, unidade: 'colcheia pontuada', especie: 'quaternário', nome: 'quaternário composto', simples: '4/4' },
  { formula: '6/4', tempos: 2, unidade: 'semínima pontuada', especie: 'binário', nome: 'binário composto', simples: '2/2' },
  { formula: '9/4', tempos: 3, unidade: 'semínima pontuada', especie: 'ternário', nome: 'ternário composto', simples: '3/2' },
  { formula: '12/4', tempos: 4, unidade: 'semínima pontuada', especie: 'quaternário', nome: 'quaternário composto', simples: '4/2' },
  { formula: '6/16', tempos: 2, unidade: 'semicolcheia pontuada', especie: 'binário', nome: 'binário composto', simples: '2/8' },
  { formula: '9/16', tempos: 3, unidade: 'semicolcheia pontuada', especie: 'ternário', nome: 'ternário composto', simples: '3/8' },
];

// ------------------------------------------------------------------ claves

// base = índice diatônico (oitava * 7 + grau) da 1ª linha do pentagrama.
export const CLAVES = {
  sol: { id: 'sol', nome: 'clave de Sol', linha: 2, base: 4 * 7 + 2, referencia: 'Sol 2ª linha' },
  do: { id: 'do', nome: 'clave de Dó', linha: 3, base: 3 * 7 + 3, referencia: 'Dó 3ª linha' },
  fa: { id: 'fa', nome: 'clave de Fá', linha: 4, base: 2 * 7 + 4, referencia: 'Fá 4ª linha' },
};

// posicao: 0 = 1ª linha, 1 = 1º espaço, 2 = 2ª linha ... (sobe de meio em meio)
export function notaDaPosicao(claveId, posicao) {
  const diatonico = CLAVES[claveId].base + posicao;
  return { letra: LETRAS[((diatonico % 7) + 7) % 7], oitava: Math.floor(diatonico / 7), alteracao: 0 };
}

export function posicaoDaNota(claveId, letra, oitava) {
  return oitava * 7 + LETRAS.indexOf(letra) - CLAVES[claveId].base;
}

export function nomeDoLugar(posicao) {
  const numero = Math.floor(posicao / 2) + 1;
  const ordinal = ['1ª', '2ª', '3ª', '4ª', '5ª'][numero - 1];
  if (posicao < 0 || posicao > 8) return posicao < 0 ? 'linha suplementar inferior' : 'linha suplementar superior';
  return posicao % 2 === 0 ? `${ordinal} linha` : `${['1º', '2º', '3º', '4º'][Math.floor(posicao / 2)]} espaço`;
}

// ------------------------------------------------------- escalas e armaduras

export const PADRAO_MAIOR = [2, 2, 1, 2, 2, 2, 1]; // T T st T T T st
export const PADRAO_MENOR_NATURAL = [2, 1, 2, 2, 1, 2, 2];

export function escala(tonica, padrao = PADRAO_MAIOR) {
  const indiceLetra = LETRAS.indexOf(tonica.letra);
  const notas = [tonica];
  let semitomAcumulado = semitomDaNota(tonica);
  for (let grau = 1; grau < 7; grau++) {
    semitomAcumulado += padrao[grau - 1];
    const letra = LETRAS[(indiceLetra + grau) % 7];
    const natural = SEMITONS_DA_LETRA[LETRAS.indexOf(letra)];
    let alteracao = (((semitomAcumulado % 12) - natural + 18) % 12) - 6;
    if (alteracao > 2) alteracao -= 12;
    if (alteracao < -2) alteracao += 12;
    notas.push(nota(letra, alteracao));
  }
  notas.push(nota(tonica.letra, tonica.alteracao));
  return notas;
}

export const ORDEM_SUSTENIDOS = ['Fá', 'Dó', 'Sol', 'Ré', 'Lá', 'Mi', 'Si'];
export const ORDEM_BEMOIS = ['Si', 'Mi', 'Lá', 'Ré', 'Sol', 'Dó', 'Fá'];

export const TONALIDADES = [
  { maior: nota('Dó'), menor: nota('Lá'), acidentes: 0, tipo: 'natural' },
  { maior: nota('Sol'), menor: nota('Mi'), acidentes: 1, tipo: 'sustenido' },
  { maior: nota('Ré'), menor: nota('Si'), acidentes: 2, tipo: 'sustenido' },
  { maior: nota('Lá'), menor: nota('Fá', 1), acidentes: 3, tipo: 'sustenido' },
  { maior: nota('Mi'), menor: nota('Dó', 1), acidentes: 4, tipo: 'sustenido' },
  { maior: nota('Si'), menor: nota('Sol', 1), acidentes: 5, tipo: 'sustenido' },
  { maior: nota('Fá', 1), menor: nota('Ré', 1), acidentes: 6, tipo: 'sustenido' },
  { maior: nota('Dó', 1), menor: nota('Lá', 1), acidentes: 7, tipo: 'sustenido' },
  { maior: nota('Fá'), menor: nota('Ré'), acidentes: 1, tipo: 'bemol' },
  { maior: nota('Si', -1), menor: nota('Sol'), acidentes: 2, tipo: 'bemol' },
  { maior: nota('Mi', -1), menor: nota('Dó'), acidentes: 3, tipo: 'bemol' },
  { maior: nota('Lá', -1), menor: nota('Fá'), acidentes: 4, tipo: 'bemol' },
  { maior: nota('Ré', -1), menor: nota('Si', -1), acidentes: 5, tipo: 'bemol' },
  { maior: nota('Sol', -1), menor: nota('Mi', -1), acidentes: 6, tipo: 'bemol' },
  { maior: nota('Dó', -1), menor: nota('Lá', -1), acidentes: 7, tipo: 'bemol' },
];

export function armaduraDe(tonalidade) {
  const ordem = tonalidade.tipo === 'bemol' ? ORDEM_BEMOIS : ORDEM_SUSTENIDOS;
  return ordem.slice(0, tonalidade.acidentes);
}

export function nomeDaTonalidade(tonalidade, modo = 'maior') {
  const n = modo === 'maior' ? tonalidade.maior : tonalidade.menor;
  return `${nomeDaNota(n)} ${modo === 'maior' ? 'Maior' : 'menor'}`;
}

// -------------------------------------------------------------- intervalos

export const NOMES_DE_INTERVALO = ['uníssono', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª', '8ª'];
const JUSTOS = [0, 3, 4, 7]; // graus (0-based) de uníssono, 4ª, 5ª e 8ª
const SEMITONS_JUSTOS = [0, 5, 7, 12];
const SEMITONS_MAIORES = [2, 4, 9, 11]; // 2ª, 3ª, 6ª, 7ª maiores

export function intervalo(a, b) {
  const grau = (LETRAS.indexOf(b.letra) - LETRAS.indexOf(a.letra) + 7) % 7;
  const semitons = (semitomDaNota(b) - semitomDaNota(a) + 12) % 12;
  const numero = grau + 1;
  const ehJusto = JUSTOS.includes(grau);
  const referencia = ehJusto
    ? SEMITONS_JUSTOS[JUSTOS.indexOf(grau)] % 12
    : SEMITONS_MAIORES[[1, 2, 5, 6].indexOf(grau)];
  let diferenca = ((semitons - referencia + 18) % 12) - 6;
  let qualidade;
  if (diferenca === 0) qualidade = ehJusto ? 'justa' : 'maior';
  else if (diferenca === -1) qualidade = ehJusto ? 'diminuta' : 'menor';
  else if (diferenca === 1) qualidade = 'aumentada';
  else if (diferenca === -2) qualidade = 'diminuta';
  else qualidade = 'aumentada';
  return { numero, nome: NOMES_DE_INTERVALO[grau], qualidade, semitons, rotulo: `${NOMES_DE_INTERVALO[grau]} ${qualidade}` };
}

// ------------------------------------------------------------ vocabulário

export const ANDAMENTOS = [
  { termo: 'Largo', faixa: '40 a 60 bpm', sentido: 'muito lento e largo' },
  { termo: 'Adagio', faixa: '66 a 76 bpm', sentido: 'lento, à vontade' },
  { termo: 'Andante', faixa: '76 a 108 bpm', sentido: 'andando, passo tranquilo' },
  { termo: 'Moderato', faixa: '108 a 120 bpm', sentido: 'moderado' },
  { termo: 'Allegro', faixa: '120 a 168 bpm', sentido: 'alegre, rápido' },
  { termo: 'Presto', faixa: '168 a 200 bpm', sentido: 'muito rápido' },
];

export const DINAMICAS = [
  { sigla: 'pp', termo: 'pianissimo', sentido: 'muito fraco' },
  { sigla: 'p', termo: 'piano', sentido: 'fraco' },
  { sigla: 'mp', termo: 'mezzo piano', sentido: 'meio fraco' },
  { sigla: 'mf', termo: 'mezzo forte', sentido: 'meio forte' },
  { sigla: 'f', termo: 'forte', sentido: 'forte' },
  { sigla: 'ff', termo: 'fortissimo', sentido: 'muito forte' },
];

export const TERMOS_DE_EXPRESSAO = [
  { termo: 'ritenuto', sentido: 'retendo o andamento de imediato' },
  { termo: 'poco rallentando', sentido: 'alargando o andamento pouco a pouco' },
  { termo: 'a tempo', sentido: 'voltando à velocidade original' },
  { termo: 'fermata', sentido: 'prolongando o som além do seu valor' },
  { termo: 'solene', sentido: 'com solenidade, gravidade' },
  { termo: 'ritornello', sentido: 'sinal que manda repetir o trecho' },
  { termo: 'legato', sentido: 'ligando os sons, sem interrupção' },
  { termo: 'staccato', sentido: 'destacando os sons, curtos' },
];

export const PROPRIEDADES_DO_SOM = [
  { nome: 'altura', artigo: 'A', definicao: 'é o grau de elevação do som: som grave ou som agudo' },
  { nome: 'duração', artigo: 'A', definicao: 'é o tempo que o som permanece: som longo ou som curto' },
  { nome: 'intensidade', artigo: 'A', definicao: 'é o volume do som: som forte ou som fraco' },
  { nome: 'timbre', artigo: 'O', definicao: 'é a cor do som, o que distingue uma voz ou um instrumento de outro' },
];
