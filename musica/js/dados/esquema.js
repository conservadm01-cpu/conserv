// Esquema do V2: as entidades do aplicativo, os campos de cada uma e as
// regras que dizem quando um registro está inválido.
//
// Duas coisas importantes sobre este arquivo:
//
// 1. Ele descreve a FORMA dos dados, não o conteúdo. O texto das lições, os
//    geradores de questões e os jogos continuam onde sempre estiveram, em
//    js/conteudo/. As entidades guardam o cadastro (o que existe, de quem é,
//    em que ordem vem) e apontam para esse conteúdo por referência.
//
// 2. Autenticação e pedagogia são separadas. ALUNOS é a ficha pedagógica;
//    USUARIOS é o acesso (login, papel, resumo da senha). Um não guarda os
//    campos do outro.

export const VERSAO_DO_ESQUEMA = 3;

// ------------------------------------------------------------- as entidades

export const ENTIDADES = {
  instrumentos: {
    nome: 'Instrumentos',
    chavePrimaria: 'id',
    campos: ['id', 'nome', 'familia', 'familiaNome', 'claves', 'afinacao', 'transposicao', 'ativo'],
    unicos: ['id', 'nome'],
  },
  metodos: {
    nome: 'Métodos',
    chavePrimaria: 'id',
    campos: ['id', 'nome', 'descricao', 'instrumentoIds', 'universal', 'porInstrumento', 'ordem', 'fonte', 'ativo'],
    unicos: ['id', 'nome'],
  },
  fases: {
    nome: 'Fases',
    chavePrimaria: 'id',
    campos: ['id', 'metodoId', 'ordem', 'titulo', 'subtitulo', 'resumo', 'icone', 'cor', 'paginas', 'anteriorId', 'conteudoRef'],
    unicos: ['id'],
  },
  licoes: {
    nome: 'Lições',
    chavePrimaria: 'id',
    campos: ['id', 'faseId', 'ordem', 'titulo', 'pagina', 'conteudoRef'],
    unicos: ['id'],
  },
  exercicios: {
    nome: 'Exercícios',
    chavePrimaria: 'id',
    campos: ['id', 'licaoId', 'ordem', 'titulo', 'enunciado', 'tipo', 'conteudoRef'],
    unicos: ['id'],
  },
  jogos: {
    nome: 'Jogos',
    chavePrimaria: 'id',
    campos: ['id', 'faseId', 'ordem', 'tipo', 'modo', 'baralho', 'titulo', 'descricao'],
    unicos: ['id'],
  },
  avaliacoes: {
    nome: 'Avaliações',
    chavePrimaria: 'id',
    campos: ['id', 'faseId', 'titulo', 'quantidadeDeQuestoes', 'notaMinima', 'geradorRef'],
    unicos: ['id'],
  },
  questoes: {
    nome: 'Questões',
    chavePrimaria: 'id',
    campos: ['id', 'avaliacaoId', 'enunciado', 'alternativas', 'correta', 'origem', 'status'],
    unicos: ['id'],
  },
  alunos: {
    nome: 'Alunos',
    chavePrimaria: 'id',
    campos: ['id', 'nome', 'comum', 'instrumentoId', 'instrumento', 'encarregadoLocal',
      'encarregadoRegional', 'anciao', 'email', 'whatsapp', 'criadoEm', 'ativo', 'xpHistorico'],
    unicos: ['id'],
  },
  usuarios: {
    nome: 'Usuários',
    chavePrimaria: 'id',
    campos: ['id', 'login', 'papel', 'sal', 'senhaHash', 'exigeSenha', 'alunoId', 'ativo', 'criadoEm'],
    unicos: ['id'],
  },
  progressos: {
    nome: 'Progresso do aluno',
    chavePrimaria: 'id',
    campos: ['id', 'alunoId', 'faseId', 'licoesLidas', 'jogos', 'usadas', 'melhorNota', 'aprovadoEm', 'xp', 'atualizadoEm'],
    unicos: ['id'],
  },
  resultados: {
    nome: 'Resultados de avaliação',
    chavePrimaria: 'id',
    campos: ['id', 'alunoId', 'faseId', 'avaliacaoId', 'data', 'nota', 'acertos', 'total', 'aprovado', 'respostas'],
    unicos: ['id'],
  },
  certificados: {
    nome: 'Certificados',
    chavePrimaria: 'id',
    campos: ['id', 'alunoId', 'faseId', 'data', 'nota', 'codigo', 'titulo', 'trilha', 'aluno', 'numero'],
    unicos: ['id'],
  },
  configuracoes: {
    nome: 'Configurações',
    chavePrimaria: 'chave',
    campos: ['chave', 'valor'],
    unicos: ['chave'],
  },
};

export const NOMES_DAS_ENTIDADES = Object.keys(ENTIDADES);

// -------------------------------------------------------------------- papéis

export const PAPEIS = ['ADMIN', 'PROFESSOR', 'ALUNO'];

// ------------------------------------------------------------ estado inicial

export function estadoVazio() {
  const estado = {
    versao: VERSAO_DO_ESQUEMA,
    migracao: null,
    sessao: null,
  };
  for (const nome of NOMES_DAS_ENTIDADES) estado[nome] = [];
  return estado;
}

// Completa um estado lido do depósito com as coleções que faltarem, sem
// mexer no que já existe. É o que permite abrir um arquivo gravado por uma
// versão anterior do V2 sem quebrar.
export function completarEstado(bruto) {
  const estado = { ...estadoVazio(), ...(bruto && typeof bruto === 'object' ? bruto : {}) };
  for (const nome of NOMES_DAS_ENTIDADES) {
    if (!Array.isArray(estado[nome])) estado[nome] = [];
  }
  estado.versao = VERSAO_DO_ESQUEMA;
  return estado;
}

// ---------------------------------------------------------------- validações

const texto = (valor) => String(valor === undefined || valor === null ? '' : valor).trim();
const vazio = (valor) => texto(valor) === '';

// Um problema tem gravidade. "impede" quebra a estrutura — id repetido, fase
// sem método, senha em texto — e a gravação é recusada. "pendencia" é o
// registro incompleto: ele entra, fica marcado como pendente de conferência e
// aparece na lista de pendências do painel. Recusar estes travaria o próprio
// uso do aplicativo, em que o aluno é cadastrado antes de a ficha estar cheia.
const erro = (entidade, id, mensagem, gravidade = 'impede') =>
  ({ entidade, id: id === undefined ? null : id, mensagem, gravidade });

export const impedimentos = (problemas) => problemas.filter((p) => p.gravidade === 'impede');
export const pendencias = (problemas) => problemas.filter((p) => p.gravidade === 'pendencia');

function duplicados(linhas, campo) {
  const vistos = new Map();
  const repetidos = [];
  for (const linha of linhas) {
    const chave = texto(linha[campo]).toLowerCase();
    if (!chave) continue;
    if (vistos.has(chave)) repetidos.push({ linha, primeiro: vistos.get(chave), chave });
    else vistos.set(chave, linha);
  }
  return repetidos;
}

// Cada função devolve a lista de problemas encontrados. Nenhuma lança:
// quem chama decide se recusa a gravação ou só mostra o aviso.

export function validarInstrumentos(instrumentos) {
  const problemas = [];
  for (const i of instrumentos) {
    if (vazio(i.id)) problemas.push(erro('instrumentos', i.id, 'Instrumento sem identificador.'));
    if (vazio(i.nome)) problemas.push(erro('instrumentos', i.id, 'Instrumento sem nome.'));
  }
  for (const campo of ['id', 'nome']) {
    for (const d of duplicados(instrumentos, campo)) {
      problemas.push(erro('instrumentos', d.linha.id, `Duplicidade de instrumentos: já existe um com ${campo} "${texto(d.linha[campo])}".`));
    }
  }
  return problemas;
}

export function validarMetodos(metodos, instrumentos = []) {
  const problemas = [];
  const existentes = new Set(instrumentos.map((i) => i.id));
  for (const m of metodos) {
    if (vazio(m.id)) problemas.push(erro('metodos', m.id, 'Método sem identificador.'));
    if (vazio(m.nome)) problemas.push(erro('metodos', m.id, 'Método sem nome.'));
    const lista = Array.isArray(m.instrumentoIds) ? m.instrumentoIds : [];
    // "Método sem instrumento": todo método precisa dizer a quem serve —
    // uma lista de instrumentos ou a marca de que vale para todos.
    if (!m.universal && lista.length === 0) {
      problemas.push(erro('metodos', m.id, 'Método sem instrumento: informe os instrumentos atendidos ou marque-o como universal.'));
    }
    for (const id of lista) {
      if (!existentes.has(id)) problemas.push(erro('metodos', m.id, `Método aponta para o instrumento "${id}", que não está cadastrado.`));
    }
  }
  for (const campo of ['id', 'nome']) {
    for (const d of duplicados(metodos, campo)) {
      problemas.push(erro('metodos', d.linha.id, `Duplicidade de métodos: já existe um com ${campo} "${texto(d.linha[campo])}".`));
    }
  }
  return problemas;
}

export function validarFases(fases, metodos = []) {
  const problemas = [];
  const existentes = new Set(metodos.map((m) => m.id));
  for (const f of fases) {
    if (vazio(f.id)) problemas.push(erro('fases', f.id, 'Fase sem identificador.'));
    if (vazio(f.metodoId)) problemas.push(erro('fases', f.id, 'Fase sem método.'));
    else if (existentes.size && !existentes.has(f.metodoId)) {
      problemas.push(erro('fases', f.id, `Fase aponta para o método "${f.metodoId}", que não está cadastrado.`));
    }
    if (vazio(f.titulo)) problemas.push(erro('fases', f.id, 'Fase sem título.', 'pendencia'));
  }
  for (const d of duplicados(fases, 'id')) {
    problemas.push(erro('fases', d.linha.id, `Duplicidade de fases: já existe uma com id "${texto(d.linha.id)}".`));
  }
  // Duas fases não podem disputar a mesma posição dentro do mesmo método.
  const porMetodo = new Map();
  for (const f of fases) {
    const chave = `${f.metodoId}#${f.ordem}`;
    if (porMetodo.has(chave)) {
      problemas.push(erro('fases', f.id, `Duplicidade de fases: a ordem ${f.ordem} já é usada pela fase "${porMetodo.get(chave)}" no método "${f.metodoId}".`));
    } else porMetodo.set(chave, f.id);
  }
  return problemas;
}

const validarFilhos = (linhas, entidade, campoPai, pais, rotulo) => {
  const problemas = [];
  const existentes = new Set(pais.map((p) => p.id));
  for (const linha of linhas) {
    if (vazio(linha[campoPai])) problemas.push(erro(entidade, linha.id, rotulo));
    else if (existentes.size && !existentes.has(linha[campoPai])) {
      problemas.push(erro(entidade, linha.id, `${rotulo.replace(/:.*/, '')}: "${linha[campoPai]}" não está cadastrado.`));
    }
  }
  return problemas;
};

export const validarLicoes = (licoes, fases = []) => validarFilhos(licoes, 'licoes', 'faseId', fases, 'Lição sem fase.');
export const validarExercicios = (exercicios, licoes = []) => validarFilhos(exercicios, 'exercicios', 'licaoId', licoes, 'Exercício sem lição.');
export const validarJogos = (jogos, fases = []) => validarFilhos(jogos, 'jogos', 'faseId', fases, 'Jogo sem fase.');
export const validarAvaliacoes = (avaliacoes, fases = []) => validarFilhos(avaliacoes, 'avaliacoes', 'faseId', fases, 'Avaliação sem fase.');
export const validarQuestoes = (questoes, avaliacoes = []) => validarFilhos(questoes, 'questoes', 'avaliacaoId', avaliacoes, 'Questão sem avaliação.');

export function validarAlunos(alunos, instrumentos = []) {
  const problemas = [];
  const existentes = new Set(instrumentos.map((i) => i.id));
  for (const a of alunos) {
    if (vazio(a.nome)) problemas.push(erro('alunos', a.id, 'Aluno sem nome.'));
    // "Aluno sem instrumento": o instrumento define a trilha do método, então
    // é ele que não pode faltar. O aluno recém-criado, antes de preencher a
    // ficha, fica pendente — e é isso que esta validação aponta.
    if (vazio(a.instrumentoId) && vazio(a.instrumento)) {
      problemas.push(erro('alunos', a.id, 'Aluno sem instrumento.', 'pendencia'));
    } else if (!vazio(a.instrumentoId) && existentes.size && !existentes.has(a.instrumentoId)) {
      problemas.push(erro('alunos', a.id, `Aluno aponta para o instrumento "${a.instrumentoId}", que não está cadastrado.`, 'pendencia'));
    }
  }
  for (const d of duplicados(alunos, 'nome')) {
    problemas.push(erro('alunos', d.linha.id, `Já existe um aluno com o nome "${texto(d.linha.nome)}".`));
  }
  return problemas;
}

export function validarUsuarios(usuarios, alunos = []) {
  const problemas = [];
  const existentes = new Set(alunos.map((a) => a.id));
  for (const u of usuarios) {
    if (vazio(u.login)) problemas.push(erro('usuarios', u.id, 'Usuário sem login.'));
    if (!PAPEIS.includes(u.papel)) problemas.push(erro('usuarios', u.id, `Papel inválido: "${u.papel}".`));
    if (u.papel === 'ALUNO' && vazio(u.alunoId)) problemas.push(erro('usuarios', u.id, 'Acesso de aluno sem ficha de aluno vinculada.'));
    if (u.papel === 'ALUNO' && !vazio(u.alunoId) && existentes.size && !existentes.has(u.alunoId)) {
      problemas.push(erro('usuarios', u.id, `Acesso aponta para o aluno "${u.alunoId}", que não está cadastrado.`));
    }
    // A senha nunca é guardada em texto: só o resumo com sal.
    if (u.senha !== undefined) problemas.push(erro('usuarios', u.id, 'Senha em texto puro no cadastro de acesso.'));
    if (u.exigeSenha && vazio(u.senhaHash)) problemas.push(erro('usuarios', u.id, 'Acesso exige senha mas não tem resumo de senha guardado.'));
  }
  for (const d of duplicados(usuarios, 'login')) {
    problemas.push(erro('usuarios', d.linha.id, `Já existe um acesso com o login "${texto(d.linha.login)}".`));
  }
  return problemas;
}

// Passa o estado inteiro pelas validações e devolve tudo o que estiver errado.
export function validarEstado(estado) {
  const e = completarEstado(estado);
  return [
    ...validarInstrumentos(e.instrumentos),
    ...validarMetodos(e.metodos, e.instrumentos),
    ...validarFases(e.fases, e.metodos),
    ...validarLicoes(e.licoes, e.fases),
    ...validarExercicios(e.exercicios, e.licoes),
    ...validarJogos(e.jogos, e.fases),
    ...validarAvaliacoes(e.avaliacoes, e.fases),
    ...validarQuestoes(e.questoes, e.avaliacoes),
    ...validarAlunos(e.alunos, e.instrumentos),
    ...validarUsuarios(e.usuarios, e.alunos),
  ];
}
