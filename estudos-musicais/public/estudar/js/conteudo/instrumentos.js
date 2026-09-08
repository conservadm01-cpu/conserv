// Instrumentos da orquestra e o que muda de um para o outro: clave, afinação,
// transposição, produção do som, partes e cuidados. É a base da trilha
// "Método do instrumento", que roda ao lado da trilha do MSA.
//
// Observação honesta: o método impresso de cada instrumento não foi fornecido.
// O conteúdo daqui é a técnica padrão do instrumento somada à teoria do MSA —
// serve de estudo dirigido, não substitui o método do instrumento nem o
// instrutor.

import * as T from '../musica.js';

export const FAMILIAS = {
  cordas: {
    nome: 'cordas friccionadas',
    producao: 'a fricção do arco sobre a corda',
    respiracao: 'a arcada — o arco desce (para baixo) e sobe (para cima), e a mudança de arco não pode cortar o som',
    postura: 'coluna ereta, ombros soltos, o instrumento sustentado sem apertar, e o braço direito conduzindo o arco pelo peso, não pela força',
    aquecimento: 'cordas soltas com arco inteiro, som longo e igual, antes de qualquer exercício',
  },
  madeiras: {
    nome: 'madeiras',
    producao: 'a vibração da palheta (ou do ar contra o bisel, na flauta)',
    respiracao: 'a respiração diafragmática — o ar sai apoiado e constante, sem estufar o peito nem os ombros',
    postura: 'coluna ereta, ombros baixos, cotovelos afastados do corpo e o instrumento vindo até a boca, nunca a cabeça descendo até ele',
    aquecimento: 'notas longas em som médio, ouvindo a afinação, antes das escalas',
  },
  metais: {
    nome: 'metais',
    producao: 'a vibração dos lábios no bocal',
    respiracao: 'a respiração diafragmática, com o ar apoiado e contínuo sustentando a vibração dos lábios',
    postura: 'coluna ereta, bocal apoiado sem pressão excessiva nos lábios e o instrumento na altura certa, sem levantar os ombros',
    aquecimento: 'sons filados no bocal e notas longas em som médio, sempre antes de tocar forte ou agudo',
  },
  teclas: {
    nome: 'teclas',
    producao: 'o mecanismo do próprio instrumento acionado pelas teclas',
    respiracao: 'a condução das frases — a respiração é da música, marcada pelo fraseado e pelo levantar das mãos',
    postura: 'banco na altura certa, antebraços na linha do teclado, punhos soltos e dedos curvos',
    aquecimento: 'escalas lentas com as duas mãos e exercícios de independência, antes dos hinos',
  },
};

// grau = quantos graus a nota desce (negativo) ao soar; semitons = a distância real.
const semTransposicao = { grau: 0, semitons: 0, descricao: 'soa exatamente como está escrito' };

const INSTRUMENTOS_BRUTOS = [
  // ------------------------------------------------------------- cordas
  {
    id: 'violino', nome: 'Violino', familia: 'cordas', claves: ['sol'], afinacao: 'Dó',
    transposicao: semTransposicao, cordas: 'Sol3 – Ré4 – Lá4 – Mi5', tessitura: 'Sol3 a Lá6',
    partes: ['cravelha', 'espelho', 'cavalete', 'estandarte', 'queixeira', 'alma', 'efe'],
    arco: true, cuidado: 'afrouxar a crina do arco depois de tocar e limpar o breu do tampo com flanela seca',
  },
  {
    id: 'viola', nome: 'Viola', familia: 'cordas', claves: ['do', 'sol'], afinacao: 'Dó',
    transposicao: semTransposicao, cordas: 'Dó3 – Sol3 – Ré4 – Lá4', tessitura: 'Dó3 a Mi6',
    partes: ['cravelha', 'espelho', 'cavalete', 'estandarte', 'queixeira', 'alma', 'efe'],
    arco: true, cuidado: 'afrouxar a crina do arco depois de tocar e limpar o breu do tampo com flanela seca',
  },
  {
    id: 'violoncelo', nome: 'Violoncelo', familia: 'cordas', claves: ['fa', 'do', 'sol'], afinacao: 'Dó',
    transposicao: semTransposicao, cordas: 'Dó2 – Sol2 – Ré3 – Lá3', tessitura: 'Dó2 a Lá5',
    partes: ['cravelha', 'espelho', 'cavalete', 'estandarte', 'espigão', 'alma', 'efe'],
    arco: true, cuidado: 'recolher o espigão antes de guardar e limpar o breu do tampo com flanela seca',
  },
  {
    id: 'contrabaixo', nome: 'Contrabaixo', familia: 'cordas', claves: ['fa'], afinacao: 'Dó',
    transposicao: { grau: 0, semitons: -12, descricao: 'soa uma oitava abaixo do escrito' },
    cordas: 'Mi1 – Lá1 – Ré2 – Sol2', tessitura: 'Mi1 a Sol4 (soando)',
    partes: ['cravelha', 'espelho', 'cavalete', 'estandarte', 'espigão', 'alma', 'efe'],
    arco: true, cuidado: 'recolher o espigão, afrouxar a crina do arco e guardar em pé, apoiado com segurança',
  },
  // ----------------------------------------------------------- madeiras
  {
    id: 'flauta', nome: 'Flauta transversal', familia: 'madeiras', claves: ['sol'], afinacao: 'Dó',
    transposicao: semTransposicao, tessitura: 'Dó4 a Dó7',
    partes: ['cabeça', 'corpo', 'pé', 'bocal (bisel)', 'chaves', 'sapatilhas'],
    palheta: 'nenhuma — o som nasce do ar cortado no bisel',
    cuidado: 'passar a vareta com a flanela por dentro depois de tocar, para não deixar umidade nas sapatilhas',
  },
  {
    id: 'oboe', nome: 'Oboé', familia: 'madeiras', claves: ['sol'], afinacao: 'Dó',
    transposicao: semTransposicao, tessitura: 'Si♭3 a Sol6',
    partes: ['palheta dupla', 'corpo superior', 'corpo inferior', 'campana', 'chaves'],
    palheta: 'palheta dupla', cuidado: 'guardar a palheta no estojo próprio, úmida mas nunca amassada, e secar o corpo por dentro',
  },
  {
    id: 'corne', nome: 'Corne inglês', familia: 'madeiras', claves: ['sol'], afinacao: 'Fá',
    transposicao: { grau: -4, semitons: -7, descricao: 'soa uma 5ª justa abaixo do escrito' },
    tessitura: 'Mi3 a Dó6 (escritos)',
    partes: ['palheta dupla', 'tudel', 'corpo superior', 'corpo inferior', 'campana em bulbo'],
    palheta: 'palheta dupla', cuidado: 'guardar a palheta no estojo próprio e secar o tudel e o corpo por dentro',
  },
  {
    id: 'clarinete', nome: 'Clarinete', familia: 'madeiras', claves: ['sol'], afinacao: 'Si♭',
    transposicao: { grau: -1, semitons: -2, descricao: 'soa um tom (2ª maior) abaixo do escrito' },
    tessitura: 'Mi3 a Dó7 (escritos)',
    partes: ['boquilha', 'abraçadeira', 'barrilete', 'corpo superior', 'corpo inferior', 'campana', 'palheta'],
    palheta: 'palheta simples', cuidado: 'tirar a palheta e guardá-la no porta-palheta, e passar a escovinha por dentro do corpo',
  },
  {
    id: 'clarone', nome: 'Clarone (clarinete baixo)', familia: 'madeiras', claves: ['sol'], afinacao: 'Si♭',
    transposicao: { grau: -1, semitons: -14, descricao: 'soa uma 9ª maior abaixo do escrito (um tom e uma oitava)' },
    tessitura: 'Mi3 a Sol6 (escritos)',
    partes: ['boquilha', 'abraçadeira', 'tudel curvo', 'corpo', 'campana metálica', 'palheta', 'espigão'],
    palheta: 'palheta simples', cuidado: 'guardar a palheta no porta-palheta e secar o tudel, onde a umidade se acumula',
  },
  {
    id: 'fagote', nome: 'Fagote', familia: 'madeiras', claves: ['fa', 'do'], afinacao: 'Dó',
    transposicao: semTransposicao, tessitura: 'Si♭1 a Mi5',
    partes: ['palheta dupla', 'tudel', 'culatra', 'perna', 'asa', 'campana'],
    palheta: 'palheta dupla', cuidado: 'esvaziar a água da culatra e guardar a palheta no estojo, sem amassar',
  },
  {
    id: 'sax-soprano', nome: 'Saxofone soprano', familia: 'madeiras', claves: ['sol'], afinacao: 'Si♭',
    transposicao: { grau: -1, semitons: -2, descricao: 'soa um tom (2ª maior) abaixo do escrito' },
    tessitura: 'Si♭3 a Fá6 (escritos)',
    partes: ['boquilha', 'abraçadeira', 'corpo', 'campana', 'palheta', 'chaves'],
    palheta: 'palheta simples', cuidado: 'passar o pano de limpeza por dentro depois de tocar e guardar a palheta seca',
  },
  {
    id: 'sax-alto', nome: 'Saxofone alto', familia: 'madeiras', claves: ['sol'], afinacao: 'Mi♭',
    transposicao: { grau: -5, semitons: -9, descricao: 'soa uma 6ª maior abaixo do escrito' },
    tessitura: 'Si♭3 a Fá6 (escritos)',
    partes: ['boquilha', 'abraçadeira', 'tudel', 'corpo', 'campana', 'palheta', 'grampo'],
    palheta: 'palheta simples', cuidado: 'passar o pano de limpeza por dentro depois de tocar e guardar a palheta seca',
  },
  {
    id: 'sax-tenor', nome: 'Saxofone tenor', familia: 'madeiras', claves: ['sol'], afinacao: 'Si♭',
    transposicao: { grau: -1, semitons: -14, descricao: 'soa uma 9ª maior abaixo do escrito (um tom e uma oitava)' },
    tessitura: 'Si♭3 a Fá6 (escritos)',
    partes: ['boquilha', 'abraçadeira', 'tudel', 'corpo', 'campana', 'palheta', 'grampo'],
    palheta: 'palheta simples', cuidado: 'passar o pano de limpeza por dentro depois de tocar e guardar a palheta seca',
  },
  {
    id: 'sax-baritono', nome: 'Saxofone barítono', familia: 'madeiras', claves: ['sol'], afinacao: 'Mi♭',
    transposicao: { grau: -5, semitons: -21, descricao: 'soa uma 6ª maior mais uma oitava abaixo do escrito' },
    tessitura: 'Lá3 a Fá6 (escritos)',
    partes: ['boquilha', 'abraçadeira', 'tudel', 'corpo', 'campana', 'palheta', 'grampo'],
    palheta: 'palheta simples', cuidado: 'passar o pano de limpeza por dentro depois de tocar e guardar a palheta seca',
  },
  // -------------------------------------------------------------- metais
  {
    id: 'trompete', nome: 'Trompete', familia: 'metais', claves: ['sol'], afinacao: 'Si♭',
    transposicao: { grau: -1, semitons: -2, descricao: 'soa um tom (2ª maior) abaixo do escrito' },
    tessitura: 'Fá♯3 a Dó6 (escritos)',
    partes: ['bocal', 'tudel', 'pistos', 'bombas de afinação', 'campana', 'chave de água'],
    cuidado: 'esvaziar a água pela chave, lavar o bocal e lubrificar os pistos com óleo próprio',
  },
  {
    id: 'trompa', nome: 'Trompa', familia: 'metais', claves: ['sol', 'fa'], afinacao: 'Fá',
    transposicao: { grau: -4, semitons: -7, descricao: 'soa uma 5ª justa abaixo do escrito' },
    tessitura: 'Sol2 a Dó6 (escritos)',
    partes: ['bocal', 'tudel', 'rotores', 'bombas de afinação', 'campana', 'chave de água'],
    cuidado: 'esvaziar a água, lubrificar os rotores com óleo próprio e nunca forçar as bombas secas',
  },
  {
    id: 'trombone', nome: 'Trombone', familia: 'metais', claves: ['fa', 'do'], afinacao: 'Dó',
    transposicao: semTransposicao, tessitura: 'Mi2 a Si♭4',
    partes: ['bocal', 'vara', 'campana', 'bomba de afinação', 'chave de água', 'contrapeso'],
    cuidado: 'manter a vara limpa e lubrificada com creme próprio e água, e nunca apoiar o instrumento pela vara',
  },
  {
    id: 'bombardino', nome: 'Bombardino', familia: 'metais', claves: ['fa'], afinacao: 'Dó',
    transposicao: semTransposicao, tessitura: 'Mi2 a Si♭4',
    partes: ['bocal', 'tudel', 'pistos', 'bombas de afinação', 'campana', 'chave de água'],
    cuidado: 'esvaziar a água pela chave, lavar o bocal e lubrificar os pistos com óleo próprio',
  },
  {
    id: 'tuba', nome: 'Tuba', familia: 'metais', claves: ['fa'], afinacao: 'Dó',
    transposicao: semTransposicao, tessitura: 'Mi1 a Fá4',
    partes: ['bocal', 'tudel', 'pistos', 'bombas de afinação', 'campana', 'chave de água'],
    cuidado: 'esvaziar a água pela chave, lavar o bocal e guardar o instrumento apoiado, nunca deitado sobre a campana',
  },
  // -------------------------------------------------------------- teclas
  {
    id: 'orgao', nome: 'Órgão', familia: 'teclas', claves: ['sol', 'fa'], afinacao: 'Dó',
    transposicao: semTransposicao, tessitura: 'toda a extensão do teclado',
    partes: ['teclado', 'registros', 'pedal de expressão', 'estante'],
    cuidado: 'desligar e cobrir o instrumento após o culto, e nunca deixar copos ou objetos sobre o teclado',
  },
  {
    id: 'acordeon', nome: 'Acordeon', familia: 'teclas', claves: ['sol', 'fa'], afinacao: 'Dó',
    transposicao: semTransposicao, tessitura: 'Fá3 a Lá6 (mão direita)',
    partes: ['teclado', 'baixos', 'fole', 'registros', 'correias'],
    cuidado: 'fechar o fole com o fecho antes de guardar e manter o instrumento em pé, longe da umidade',
  },
];

export const INSTRUMENTOS = INSTRUMENTOS_BRUTOS.map((i) => ({
  ...i,
  transpositor: i.transposicao.semitons !== 0,
  familiaNome: FAMILIAS[i.familia].nome,
}));

export const instrumentoPorId = (id) => INSTRUMENTOS.find((i) => i.id === id) || null;

export const INSTRUMENTOS_POR_FAMILIA = Object.keys(FAMILIAS).map((familia) => ({
  familia, nome: FAMILIAS[familia].nome, lista: INSTRUMENTOS.filter((i) => i.familia === familia),
}));

/**
 * Que som sai quando o instrumento toca uma nota escrita.
 * O nome da nota vem do grau (quantas letras desce) e o acidente sai da conta
 * de semitons, que é o que faz Dó escrito soar Si♭ no clarinete.
 */
export function somReal(instrumento, notaEscrita) {
  const { grau, semitons } = instrumento.transposicao;
  if (!semitons) return { ...notaEscrita };
  const indice = T.LETRAS.indexOf(notaEscrita.letra);
  const letra = T.LETRAS[((indice + grau) % 7 + 7) % 7];
  const alvo = ((T.semitomDaNota(notaEscrita) + semitons) % 12 + 12) % 12;
  const natural = T.SEMITONS_DA_LETRA[T.LETRAS.indexOf(letra)];
  let alteracao = ((alvo - natural + 18) % 12) - 6;
  if (alteracao > 2) alteracao -= 12;
  if (alteracao < -2) alteracao += 12;
  return T.nota(letra, alteracao);
}

// O caminho contrário: que nota o instrumento precisa ler para soar a nota
// pedida — é a conta que o instrutor faz ao passar um hino de tom.
export function notaParaSoar(instrumento, notaDesejada) {
  const { grau, semitons } = instrumento.transposicao;
  if (!semitons) return { ...notaDesejada };
  const indice = T.LETRAS.indexOf(notaDesejada.letra);
  const letra = T.LETRAS[((indice - grau) % 7 + 7) % 7];
  const alvo = ((T.semitomDaNota(notaDesejada) - semitons) % 12 + 12) % 12;
  const natural = T.SEMITONS_DA_LETRA[T.LETRAS.indexOf(letra)];
  let alteracao = ((alvo - natural + 18) % 12) - 6;
  if (alteracao > 2) alteracao -= 12;
  if (alteracao < -2) alteracao += 12;
  return T.nota(letra, alteracao);
}
