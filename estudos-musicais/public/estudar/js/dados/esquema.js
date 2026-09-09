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
    campos: ['id', 'nome', 'familia', 'familiaNome', 'claves', 'afinacao', 'transposicao',
      'transpositor', 'tessitura', 'cordas', 'partes', 'arco', 'cuidado', 'descricao', 'ativo'],
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
    campos: ['id', 'metodoId', 'versaoId', 'ordem', 'titulo', 'subtitulo', 'resumo', 'icone', 'cor',
      'paginas', 'anteriorId', 'conteudoRef', 'notaMinima', 'ativo'],
    unicos: ['id'],
  },
  licoes: {
    nome: 'Lições',
    chavePrimaria: 'id',
    campos: ['id', 'faseId', 'ordem', 'titulo', 'pagina', 'conteudoRef', 'corpo'],
    unicos: ['id'],
  },
  exercicios: {
    nome: 'Exercícios',
    chavePrimaria: 'id',
    campos: ['id', 'licaoId', 'faseId', 'ordem', 'titulo', 'enunciado', 'tipo', 'conteudoRef', 'corpo'],
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
    campos: ['id', 'alunoId', 'matriculaId', 'faseId', 'licoesLidas', 'jogos', 'usadas', 'melhorNota',
      'aprovadoEm', 'iniciadoEm', 'xp', 'atualizadoEm'],
    unicos: ['id'],
  },
  resultados: {
    nome: 'Resultados de avaliação',
    chavePrimaria: 'id',
    campos: ['id', 'alunoId', 'matriculaId', 'faseId', 'avaliacaoId', 'data', 'nota', 'acertos', 'total',
      'aprovado', 'respostas', 'duracaoSegundos'],
    unicos: ['id'],
  },
  certificados: {
    nome: 'Certificados',
    chavePrimaria: 'id',
    campos: ['id', 'alunoId', 'matriculaId', 'faseId', 'data', 'nota', 'codigo', 'titulo', 'trilha',
      'aluno', 'numero', 'hash', 'retrato', 'responsavel'],
    unicos: ['id'],
  },
  versoes: {
    nome: 'Versões de método',
    chavePrimaria: 'id',
    campos: ['id', 'metodoId', 'rotulo', 'publicadaEm', 'situacao', 'notas', 'ordem'],
    unicos: ['id'],
  },
  matriculas: {
    nome: 'Matrículas',
    chavePrimaria: 'id',
    campos: ['id', 'alunoId', 'instrumentoId', 'metodoId', 'versaoId', 'dataInicio', 'dataFim',
      'situacao', 'faseAtualId', 'observacao'],
    unicos: ['id'],
  },
  eventos: {
    nome: 'Eventos do aluno',
    chavePrimaria: 'id',
    campos: ['id', 'alunoId', 'matriculaId', 'tipo', 'titulo', 'detalhe', 'faseId', 'valor', 'dataHora'],
    unicos: ['id'],
  },
  auditorias: {
    nome: 'Auditoria',
    chavePrimaria: 'id',
    campos: ['id', 'usuarioId', 'papel', 'acao', 'entidade', 'entidadeId', 'dadosAntes', 'dadosDepois', 'dataHora'],
    unicos: ['id'],
  },
  conquistas: {
    nome: 'Conquistas',
    chavePrimaria: 'id',
    campos: ['id', 'alunoId', 'chave', 'titulo', 'descricao', 'icone', 'conquistadaEm'],
    unicos: ['id'],
  },
  notificacoes: {
    nome: 'Avisos',
    chavePrimaria: 'id',
    campos: ['id', 'alunoId', 'tipo', 'titulo', 'texto', 'destino', 'lidaEm', 'criadaEm'],
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

// INSTRUTOR é o nome usado no aplicativo e na conversa com quem o usa.
// PROFESSOR continua aceito porque existem cadastros gravados com ele: a
// camada de compatibilidade traduz um no outro, e nenhum acesso se perde.
export const PAPEIS = ['ADMIN', 'INSTRUTOR', 'ALUNO'];
export const PAPEL_ANTIGO = { PROFESSOR: 'INSTRUTOR' };

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
  // Duas fases não podem disputar a mesma posição — dentro da MESMA VERSÃO.
  // Entre versões diferentes do mesmo método a repetição é esperada: a versão
  // 2.0 tem a sua fase 1 como a 1.0 tem a dela.
  const porVersao = new Map();
  for (const f of fases) {
    const escopo = f.versaoId || f.metodoId;
    const chave = `${escopo}#${f.ordem}`;
    if (porVersao.has(chave)) {
      problemas.push(erro('fases', f.id,
        `Duplicidade de fases: a ordem ${f.ordem} já é usada pela fase "${porVersao.get(chave)}" ${f.versaoId ? `na versão "${f.versaoId}"` : `no método "${f.metodoId}"`}.`));
    } else porVersao.set(chave, f.id);
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

export function validarVersoes(versoes, metodos = []) {
  const problemas = [];
  const existentes = new Set(metodos.map((m) => m.id));
  for (const v of versoes) {
    if (vazio(v.metodoId)) problemas.push(erro('versoes', v.id, 'Versão sem método.'));
    else if (existentes.size && !existentes.has(v.metodoId)) {
      problemas.push(erro('versoes', v.id, `Versão aponta para o método "${v.metodoId}", que não está cadastrado.`));
    }
    if (vazio(v.rotulo)) problemas.push(erro('versoes', v.id, 'Versão sem rótulo (por exemplo "1.0").', 'pendencia'));
  }
  for (const d of duplicados(versoes, 'id')) {
    problemas.push(erro('versoes', d.linha.id, `Duplicidade de versões: já existe uma com id "${texto(d.linha.id)}".`));
  }
  return problemas;
}

export function validarMatriculas(matriculas, { alunos = [], instrumentos = [], metodos = [], versoes = [] } = {}) {
  const problemas = [];
  const temAluno = new Set(alunos.map((a) => a.id));
  const temInstrumento = new Set(instrumentos.map((i) => i.id));
  const temMetodo = new Set(metodos.map((m) => m.id));
  const temVersao = new Set(versoes.map((v) => v.id));

  for (const m of matriculas) {
    if (vazio(m.alunoId)) problemas.push(erro('matriculas', m.id, 'Matrícula sem aluno.'));
    else if (temAluno.size && !temAluno.has(m.alunoId)) {
      problemas.push(erro('matriculas', m.id, `Matrícula aponta para o aluno "${m.alunoId}", que não está cadastrado.`));
    }
    if (vazio(m.metodoId)) problemas.push(erro('matriculas', m.id, 'Matrícula sem método.'));
    else if (temMetodo.size && !temMetodo.has(m.metodoId)) {
      problemas.push(erro('matriculas', m.id, `Matrícula aponta para o método "${m.metodoId}", que não está cadastrado.`));
    }
    // O instrumento é o que define a trilha; sem ele a matrícula fica pendente,
    // não recusada, porque o aluno pode ser cadastrado antes de escolher.
    if (vazio(m.instrumentoId)) problemas.push(erro('matriculas', m.id, 'Matrícula sem instrumento.', 'pendencia'));
    else if (temInstrumento.size && !temInstrumento.has(m.instrumentoId)) {
      problemas.push(erro('matriculas', m.id, `Matrícula aponta para o instrumento "${m.instrumentoId}", que não está cadastrado.`, 'pendencia'));
    }
    if (!vazio(m.versaoId) && temVersao.size && !temVersao.has(m.versaoId)) {
      problemas.push(erro('matriculas', m.id, `Matrícula aponta para a versão "${m.versaoId}", que não está cadastrada.`));
    }
  }
  // O mesmo aluno não se matricula duas vezes no mesmo método com o mesmo
  // instrumento enquanto a primeira matrícula estiver em curso.
  const vistas = new Map();
  for (const m of matriculas.filter((x) => x.situacao === 'em_curso')) {
    const chave = `${m.alunoId}#${m.metodoId}#${m.instrumentoId}`;
    if (vistas.has(chave)) {
      problemas.push(erro('matriculas', m.id, 'Já existe uma matrícula em curso deste aluno neste método e instrumento.'));
    } else vistas.set(chave, m.id);
  }
  return problemas;
}

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
    ...validarVersoes(e.versoes, e.metodos),
    ...validarMatriculas(e.matriculas, e),
  ];
}
