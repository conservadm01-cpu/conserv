/**
 * Os números dos painéis.
 *
 * Ficam aqui, fora das telas, por dois motivos. O primeiro é que a mesma
 * pergunta aparece em três lugares — instrutor, coordenação e relatório — e
 * três contas parecidas divergem. O segundo é que número de painel vira
 * decisão sobre gente: se "aluno em atraso" pode ser calculado de dois jeitos,
 * mais cedo ou mais tarde alguém é cobrado pelo jeito errado.
 *
 * Regra que atravessa o arquivo: nada é afirmado sem evidência suficiente, e
 * ausência de dado não vira zero. Aluno sem aula não tem 0% de frequência;
 * método sem avaliação não tem 0% de aprovação. Nos dois casos a resposta é
 * "ainda não dá para dizer", e é isso que a tela mostra.
 */

export const DIAS_PARA_ATRASO = 21;
export const MINIMO_DE_AVALIACOES_PARA_TAXA = 5;

const DIA = 86400000;

export const diasDesde = (data: Date | string | null | undefined, agora: Date = new Date()): number | null =>
  data ? Math.floor((agora.getTime() - new Date(data).getTime()) / DIA) : null;

export interface LinhaDoAluno {
  alunoId: string;
  nome: string;
  instrumento: string | null;
  metodo: string | null;
  unidadeAtual: string | null;
  percentual: number | null;
  ultimoAcesso: Date | null;
  ultimaAula: Date | null;
  frequencia: number | null;
  aulas: number;
  enviosPendentes: number;
}

export type Situacao = 'atencao' | 'acompanhar' | 'em_dia' | 'nao_comecou';

export interface SituacaoDoAluno {
  chave: Situacao;
  texto: string;
  icone: string;
  motivos: string[];
}

/**
 * A situação de um aluno em uma palavra — e nos motivos que a sustentam.
 *
 * Sai sempre com ícone E texto. Cor e ícone sozinhos não informam quem não os
 * distingue, e "🔴" sem explicação não diz ao instrutor o que fazer.
 */
export function situacaoDoAluno(linha: LinhaDoAluno, agora: Date = new Date()): SituacaoDoAluno {
  const motivos: string[] = [];
  const primeiroNome = linha.nome.split(' ')[0];

  const semAtividade = !linha.ultimoAcesso && !linha.ultimaAula;
  if (semAtividade) {
    return {
      chave: 'nao_comecou', texto: 'não começou', icone: '🟡',
      motivos: [`${primeiroNome} ainda não acessou nem teve aula registrada.`],
    };
  }

  // O atraso é medido pelo sinal MAIS RECENTE de vida: quem não abre o
  // aplicativo mas vai à aula toda semana não está em atraso.
  const referencia = [linha.ultimoAcesso, linha.ultimaAula]
    .filter(Boolean)
    .map((d) => new Date(d as Date).getTime())
    .sort((a, b) => b - a)[0];
  const dias = referencia ? Math.floor((agora.getTime() - referencia) / DIA) : null;

  if (dias !== null && dias >= DIAS_PARA_ATRASO) {
    motivos.push(`${primeiroNome} está há ${dias} dias sem estudar nem ter aula.`);
  }
  if (linha.frequencia !== null && linha.aulas >= 4 && linha.frequencia < 75) {
    motivos.push(`${primeiroNome} está com ${linha.frequencia}% de presença em ${linha.aulas} aulas.`);
  }
  if (linha.enviosPendentes > 0) {
    motivos.push(`${linha.enviosPendentes} atividade(s) de ${primeiroNome} esperando avaliação.`);
  }

  const grave = motivos.some((m) => /sem estudar|presença/.test(m));
  if (grave) return { chave: 'atencao', texto: 'precisa de atenção', icone: '🔴', motivos };
  if (motivos.length) return { chave: 'acompanhar', texto: 'acompanhar', icone: '🟡', motivos };
  return { chave: 'em_dia', texto: 'em dia', icone: '🟢', motivos: [] };
}

export interface Panorama {
  alunos: number;
  alunosAtivos: number;
  alunosSemAtividade: number;
  emAtraso: number;
  precisamDeAtencao: number;
  enviosPendentes: number;
  progressoMedio: number | null;
  frequenciaMedia: number | null;
}

/**
 * O retrato do conjunto.
 *
 * Média só de quem tem o dado: incluir como zero quem ainda não começou
 * puxaria o número para baixo e faria parecer que o ensino vai mal quando o
 * que houve foi matrícula nova.
 */
export function panorama(linhas: LinhaDoAluno[], agora: Date = new Date()): Panorama {
  const situacoes = linhas.map((l) => situacaoDoAluno(l, agora));
  const comProgresso = linhas.filter((l) => l.percentual !== null);
  const comFrequencia = linhas.filter((l) => l.frequencia !== null && l.aulas > 0);
  const media = (valores: number[]) =>
    valores.length ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length) : null;

  return {
    alunos: linhas.length,
    alunosAtivos: linhas.filter((_, i) => situacoes[i].chave === 'em_dia' || situacoes[i].chave === 'acompanhar').length,
    alunosSemAtividade: situacoes.filter((s) => s.chave === 'nao_comecou').length,
    emAtraso: situacoes.filter((s) => s.motivos.some((m) => /sem estudar/.test(m))).length,
    precisamDeAtencao: situacoes.filter((s) => s.chave === 'atencao').length,
    enviosPendentes: linhas.reduce((soma, l) => soma + l.enviosPendentes, 0),
    progressoMedio: media(comProgresso.map((l) => l.percentual as number)),
    frequenciaMedia: media(comFrequencia.map((l) => l.frequencia as number)),
  };
}

/** Alunos por fase, para ver onde a turma está e onde ela empaca. */
export function distribuicaoPorFase(linhas: LinhaDoAluno[]): Array<{ fase: string; alunos: number }> {
  const contagem = new Map<string, number>();
  for (const linha of linhas) {
    const fase = linha.unidadeAtual ?? 'sem fase definida';
    contagem.set(fase, (contagem.get(fase) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .map(([fase, alunos]) => ({ fase, alunos }))
    .sort((a, b) => b.alunos - a.alunos);
}

export function distribuicaoPor(
  linhas: LinhaDoAluno[],
  campo: 'instrumento' | 'metodo',
): Array<{ nome: string; alunos: number }> {
  const contagem = new Map<string, number>();
  for (const linha of linhas) {
    const chave = linha[campo] ?? 'não definido';
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .map(([nome, alunos]) => ({ nome, alunos }))
    .sort((a, b) => b.alunos - a.alunos);
}

/**
 * Taxa de aprovação de um conjunto de tentativas.
 *
 * Devolve nulo abaixo de um mínimo de avaliações. Uma reprovação em duas
 * tentativas dá 50%, e esse 50% ao lado de outro calculado sobre duzentas
 * convida a comparar coisas que não se comparam.
 */
export function taxaDeAprovacao(
  tentativas: Array<{ aprovado: boolean | null }>,
  minimo: number = MINIMO_DE_AVALIACOES_PARA_TAXA,
): { taxa: number | null; total: number; conclusiva: boolean } {
  const decididas = tentativas.filter((t) => t.aprovado !== null);
  const total = decididas.length;
  if (total === 0) return { taxa: null, total: 0, conclusiva: false };
  const taxa = Math.round((decididas.filter((t) => t.aprovado).length / total) * 100);
  return { taxa, total, conclusiva: total >= minimo };
}

/**
 * Busca global. Uma caixa só, sobre o que já foi carregado e que a RLS já
 * limitou ao escopo de quem procura — não existe busca que enxergue além do
 * vínculo.
 */
export interface Achado {
  tipo: 'aluno' | 'instrutor' | 'metodo' | 'instrumento' | 'localidade' | 'turma';
  id: string;
  titulo: string;
  detalhe: string;
  destino: string;
}

const semAcento = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function buscar(termo: string, universo: Achado[], limite = 20): Achado[] {
  const procurado = semAcento(termo.trim());
  if (procurado.length < 2) return [];
  return universo
    .filter((item) => semAcento(`${item.titulo} ${item.detalhe}`).includes(procurado))
    // Quem começa com o termo aparece antes: procurando "ana", Ana Lima vem
    // antes de Mariana.
    .sort((a, b) => {
      const aComeca = semAcento(a.titulo).startsWith(procurado) ? 0 : 1;
      const bComeca = semAcento(b.titulo).startsWith(procurado) ? 0 : 1;
      return aComeca - bComeca || a.titulo.localeCompare(b.titulo, 'pt-BR');
    })
    .slice(0, limite);
}
