// Camada de compatibilidade.
//
// Dados gravados por versões anteriores do aplicativo não têm todos os campos
// que o V2 espera. Em vez de recusá-los — ou pior, de espalhar "if (campo)"
// por todas as telas — cada registro passa por uma função que devolve a forma
// completa, preenchendo o que falta e preservando o que existe.
//
// Regra desta camada: ela COMPLETA, nunca inventa. Um campo que não existia
// no dado antigo vira vazio, nulo ou zero — jamais um valor plausível.

const texto = (valor) => String(valor === undefined || valor === null ? '' : valor).trim();
const lista = (valor) => (Array.isArray(valor) ? valor.slice() : []);
const objeto = (valor) => (valor && typeof valor === 'object' && !Array.isArray(valor) ? { ...valor } : {});
const numero = (valor, padrao = 0) => (Number.isFinite(Number(valor)) ? Number(valor) : padrao);

// Antes o instrumento do aluno era só o nome digitado ("violino"); agora há um
// cadastro de instrumentos com identificador. Quando o registro antigo traz só
// o nome, ele é mantido em `instrumento` e o identificador fica pendente até
// que se encontre o instrumento correspondente no catálogo.
export function normalizeAluno(bruto = {}, { instrumentos = [] } = {}) {
  const aluno = {
    id: texto(bruto.id),
    nome: texto(bruto.nome),
    comum: texto(bruto.comum),
    instrumentoId: texto(bruto.instrumentoId),
    instrumento: texto(bruto.instrumento),
    encarregadoLocal: texto(bruto.encarregadoLocal),
    encarregadoRegional: texto(bruto.encarregadoRegional),
    anciao: texto(bruto.anciao),
    email: texto(bruto.email),
    whatsapp: texto(bruto.whatsapp),
    criadoEm: texto(bruto.criadoEm) || new Date().toISOString(),
    ativo: bruto.ativo === undefined ? true : Boolean(bruto.ativo),
    xpHistorico: numero(bruto.xpHistorico, 0),
  };
  if (!aluno.instrumentoId && aluno.instrumento && instrumentos.length) {
    const alvo = texto(aluno.instrumento).toLowerCase();
    const achado = instrumentos.find((i) => texto(i.id).toLowerCase() === alvo)
      || instrumentos.find((i) => texto(i.nome).toLowerCase() === alvo);
    if (achado) aluno.instrumentoId = achado.id;
  }
  if (aluno.instrumentoId && !aluno.instrumento && instrumentos.length) {
    const achado = instrumentos.find((i) => i.id === aluno.instrumentoId);
    if (achado) aluno.instrumento = achado.id;
  }
  return aluno;
}

// No V1 o progresso era um objeto por aluno, com todas as fases dentro. No V2
// é uma linha por aluno e fase. Esta função normaliza UMA linha.
export function normalizeProgresso(bruto = {}) {
  return {
    id: texto(bruto.id) || `${texto(bruto.alunoId)}#${texto(bruto.faseId)}`,
    alunoId: texto(bruto.alunoId),
    faseId: texto(bruto.faseId),
    licoesLidas: lista(bruto.licoesLidas),
    jogos: objeto(bruto.jogos),
    usadas: lista(bruto.usadas),
    melhorNota: numero(bruto.melhorNota, 0),
    aprovadoEm: bruto.aprovadoEm ? texto(bruto.aprovadoEm) : null,
    xp: numero(bruto.xp, 0),
    atualizadoEm: texto(bruto.atualizadoEm) || null,
  };
}

// Um método antigo pode não dizer a quem serve. `universal` marca o método que
// vale para todos os instrumentos (a teoria do MSA); `porInstrumento` marca o
// método cujo conteúdo é apresentado conforme o instrumento do aluno.
export function normalizeMetodo(bruto = {}) {
  return {
    id: texto(bruto.id),
    nome: texto(bruto.nome),
    descricao: texto(bruto.descricao),
    instrumentoIds: lista(bruto.instrumentoIds).map(texto).filter(Boolean),
    universal: Boolean(bruto.universal),
    porInstrumento: Boolean(bruto.porInstrumento),
    ordem: numero(bruto.ordem, 0),
    fonte: texto(bruto.fonte),
    ativo: bruto.ativo === undefined ? true : Boolean(bruto.ativo),
  };
}

// A fase antiga vinha com `numero` e sem `metodoId` — o método estava
// implícito no código. Aqui ela passa a declarar a que método pertence.
export function normalizeFase(bruto = {}, { metodoId = '' } = {}) {
  const ordem = numero(bruto.ordem, numero(bruto.numero, 0));
  return {
    id: texto(bruto.id) || String(bruto.numero || ''),
    metodoId: texto(bruto.metodoId) || texto(metodoId),
    ordem,
    titulo: texto(bruto.titulo),
    subtitulo: texto(bruto.subtitulo),
    resumo: texto(bruto.resumo),
    icone: texto(bruto.icone),
    cor: texto(bruto.cor),
    paginas: bruto.paginas === undefined ? null : bruto.paginas,
    anteriorId: bruto.anteriorId ? texto(bruto.anteriorId) : null,
    conteudoRef: texto(bruto.conteudoRef) || texto(bruto.id) || String(bruto.numero || ''),
  };
}

export function normalizeInstrumento(bruto = {}) {
  return {
    id: texto(bruto.id),
    nome: texto(bruto.nome),
    familia: texto(bruto.familia),
    familiaNome: texto(bruto.familiaNome),
    claves: lista(bruto.claves),
    afinacao: texto(bruto.afinacao),
    transposicao: bruto.transposicao === undefined ? null : bruto.transposicao,
    ativo: bruto.ativo === undefined ? true : Boolean(bruto.ativo),
  };
}

// Acesso: só o resumo da senha e o sal. Se um registro antigo trouxer uma
// senha em texto, ela é descartada aqui e nunca chega ao depósito.
export function normalizeUsuario(bruto = {}) {
  const usuario = {
    id: texto(bruto.id),
    login: texto(bruto.login) || texto(bruto.usuario) || texto(bruto.nome),
    papel: ['ADMIN', 'PROFESSOR', 'ALUNO'].includes(bruto.papel) ? bruto.papel : 'ALUNO',
    sal: texto(bruto.sal) || texto(bruto.id),
    senhaHash: bruto.senhaHash ? texto(bruto.senhaHash) : null,
    exigeSenha: Boolean(bruto.exigeSenha && bruto.senhaHash),
    alunoId: bruto.alunoId ? texto(bruto.alunoId) : null,
    ativo: bruto.ativo === undefined ? true : Boolean(bruto.ativo),
    criadoEm: texto(bruto.criadoEm) || new Date().toISOString(),
  };
  if (usuario.papel === 'ADMIN' || usuario.papel === 'PROFESSOR') usuario.exigeSenha = true;
  return usuario;
}

export function normalizeResultado(bruto = {}) {
  return {
    id: texto(bruto.id),
    alunoId: texto(bruto.alunoId),
    faseId: texto(bruto.faseId),
    avaliacaoId: texto(bruto.avaliacaoId) || `av-${texto(bruto.faseId)}`,
    data: texto(bruto.data) || new Date().toISOString(),
    nota: numero(bruto.nota, 0),
    acertos: numero(bruto.acertos, 0),
    total: numero(bruto.total, 0),
    aprovado: Boolean(bruto.aprovado),
    respostas: lista(bruto.respostas),
  };
}

export function normalizeCertificado(bruto = {}) {
  const faseId = texto(bruto.faseId) || String(bruto.fase || '');
  return {
    ...bruto,
    id: texto(bruto.id) || `${texto(bruto.alunoId)}#${faseId}`,
    alunoId: texto(bruto.alunoId),
    faseId,
    trilha: texto(bruto.trilha) || 'msa',
    data: texto(bruto.data) || new Date().toISOString(),
    nota: numero(bruto.nota, 0),
    codigo: texto(bruto.codigo) || texto(bruto.numero),
  };
}

export const NORMALIZADORES = {
  alunos: normalizeAluno,
  usuarios: normalizeUsuario,
  instrumentos: normalizeInstrumento,
  metodos: normalizeMetodo,
  fases: normalizeFase,
  progressos: normalizeProgresso,
  resultados: normalizeResultado,
  certificados: normalizeCertificado,
};
