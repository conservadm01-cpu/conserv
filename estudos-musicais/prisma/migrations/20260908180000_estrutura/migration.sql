-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "StatusUsuario" AS ENUM ('PENDENTE', 'ATIVO', 'INATIVO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('SUPERADMIN', 'ADMIN_PEDAGOGICO', 'INSTRUTOR', 'ENCARREGADO_LOCAL', 'ENCARREGADO_REGIONAL', 'ANCIAO', 'ALUNO');

-- CreateEnum
CREATE TYPE "EscopoVinculo" AS ENUM ('GLOBAL', 'REGIAO', 'COMUM');

-- CreateEnum
CREATE TYPE "SituacaoAluno" AS ENUM ('AGUARDANDO_APROVACAO', 'APROVADO', 'RECUSADO', 'DESATIVADO');

-- CreateEnum
CREATE TYPE "TipoSolicitacao" AS ENUM ('TROCA_INSTRUMENTO', 'TRANSFERENCIA_COMUM', 'INCLUSAO_RESPONSAVEL', 'AVANCO_FASE', 'ACESSO');

-- CreateEnum
CREATE TYPE "StatusSolicitacao" AS ENUM ('ABERTA', 'DEFERIDA', 'INDEFERIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "Clave" AS ENUM ('SOL', 'DO', 'FA');

-- CreateEnum
CREATE TYPE "Situacao" AS ENUM ('ATIVO', 'INATIVO', 'RASCUNHO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "EscopoDoMetodo" AS ENUM ('INSTRUMENTO', 'TRANSVERSAL');

-- CreateEnum
CREATE TYPE "TipoDeDocumento" AS ENUM ('PDF', 'MSCZ', 'MUSICXML', 'MP3', 'WAV', 'PNG', 'JPG', 'MP4', 'TXT', 'DOCX', 'XLSX', 'CSV', 'OUTRO');

-- CreateEnum
CREATE TYPE "ChaveDeConfiguracao" AS ENUM ('NOTA_MINIMA', 'TENTATIVAS_MAXIMAS', 'QUESTOES_POR_AVALIACAO', 'PERCENTUAL_DE_APROVEITAMENTO', 'EXIGE_APROVACAO_INSTRUTOR', 'PRE_REQUISITO_DE_UNIDADES', 'PESOS_DE_COMPETENCIA', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusDoCurriculo" AS ENUM ('RASCUNHO', 'EM_REVISAO', 'PUBLICADO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "TipoDeUnidade" AS ENUM ('NIVEL', 'FASE', 'MODULO', 'AULA', 'TOPICO');

-- CreateEnum
CREATE TYPE "TipoLicao" AS ENUM ('LEITURA_METRICA', 'LEITURA_RITMICA', 'CONSTRUCAO_ESCALA', 'HINO', 'PREPARATORIO_RITMICO', 'ATIVIDADE_APOIO', 'TEORIA');

-- CreateEnum
CREATE TYPE "StatusConferencia" AS ENUM ('CONFERIDO', 'PENDENTE_CONFERENCIA', 'DIVERGENTE');

-- CreateEnum
CREATE TYPE "StatusPublicacao" AS ENUM ('RASCUNHO', 'PUBLICADO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "TipoAgrupamento" AS ENUM ('ESCALA', 'CLAVE', 'COMPASSO', 'TIPO_LEITURA', 'ASSUNTO');

-- CreateEnum
CREATE TYPE "TipoConteudo" AS ENUM ('TEXTO', 'PDF', 'IMAGEM', 'AUDIO', 'VIDEO', 'PARTITURA', 'EXERCICIO_INTERATIVO', 'QUESTIONARIO', 'TAREFA_PRATICA', 'SOLFEJO', 'EXECUCAO_INSTRUMENTAL');

-- CreateEnum
CREATE TYPE "TipoQuestao" AS ENUM ('MULTIPLA_ESCOLHA', 'VERDADEIRO_FALSO', 'ASSOCIACAO', 'ORDENACAO', 'RESPOSTA_CURTA', 'DISCURSIVA', 'IDENTIFICACAO_NOTAS', 'FIGURAS_E_PAUSAS', 'FORMULA_DE_COMPASSO', 'ARMADURA_E_ESCALA', 'LEITURA_RITMICA', 'AUDITIVA', 'PRATICA');

-- CreateEnum
CREATE TYPE "StatusRevisao" AS ENUM ('RASCUNHO', 'EM_REVISAO', 'APROVADA', 'ARQUIVADA');

-- CreateEnum
CREATE TYPE "OrigemQuestao" AS ENUM ('MANUAL', 'IMPORTADA', 'GERADA');

-- CreateEnum
CREATE TYPE "EscopoAvaliacao" AS ENUM ('LICAO', 'UNIDADE', 'METODO');

-- CreateEnum
CREATE TYPE "EstadoEnvio" AS ENUM ('NAO_INICIADA', 'EM_ANDAMENTO', 'ENVIADA', 'EM_AVALIACAO', 'CORRECAO_SOLICITADA', 'APROVADA', 'REPROVADA', 'DISPENSADA');

-- CreateEnum
CREATE TYPE "DecisaoAvaliacao" AS ENUM ('APROVADO', 'CORRECAO_SOLICITADA', 'REPROVADO', 'DISPENSADO');

-- CreateEnum
CREATE TYPE "TipoRegra" AS ENUM ('PRE_REQUISITO_FASES', 'PERCENTUAL_APROVEITAMENTO', 'APROVACAO_INSTRUTOR', 'CONCLUSAO_CURSO');

-- CreateEnum
CREATE TYPE "EstadoProgresso" AS ENUM ('NAO_INICIADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'APROVADO', 'REPROVADO');

-- CreateEnum
CREATE TYPE "SituacaoDaJornada" AS ENUM ('ATIVA', 'CONCLUIDA', 'INTERROMPIDA', 'AGUARDANDO_LIBERACAO');

-- CreateEnum
CREATE TYPE "StatusDaAnalise" AS ENUM ('SUGERIDA', 'EM_REVISAO', 'CONFIRMADA', 'EDITADA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "TipoImportacao" AS ENUM ('METODO_PLANILHA', 'METODO_PDF', 'METODO_DOCUMENTO', 'COMUNS_CSV', 'REGIOES_CSV', 'ALUNOS_CSV', 'QUESTOES_CSV');

-- CreateEnum
CREATE TYPE "StatusImportacao" AS ENUM ('PREVIA', 'APLICADA', 'CANCELADA', 'ERRO');

-- CreateEnum
CREATE TYPE "StatusLinha" AS ENUM ('NOVO', 'ATUALIZADO', 'DUPLICADO', 'ERRO', 'PENDENTE_CONFERENCIA');

-- CreateEnum
CREATE TYPE "EstadoTarefa" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'FALHOU');

-- CreateTable
CREATE TABLE "regioes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT,
    "cidadeUf" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regioes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comuns" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT,
    "regiaoId" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "estado" VARCHAR(2) NOT NULL,
    "endereco" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comuns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "nascimento" DATE,
    "senhaHash" TEXT NOT NULL,
    "status" "StatusUsuario" NOT NULL DEFAULT 'PENDENTE',
    "aceiteTermosEm" TIMESTAMP(3),
    "versaoPrivacidade" TEXT,
    "ultimoAcessoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vinculos" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "escopo" "EscopoVinculo" NOT NULL,
    "regiaoId" TEXT,
    "comumId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "concedidoPorId" TEXT,
    "concedidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revogadoEm" TIMESTAMP(3),
    "observacao" TEXT,

    CONSTRAINT "vinculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "encerradaEm" TIMESTAMP(3),
    "ipHash" TEXT,
    "navegador" TEXT,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfis_aluno" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "comumId" TEXT NOT NULL,
    "instrumentoId" TEXT,
    "instrutorId" TEXT,
    "encarregadoLocalNome" TEXT,
    "encarregadoRegionalNome" TEXT,
    "anciaoNome" TEXT,
    "situacao" "SituacaoAluno" NOT NULL DEFAULT 'AGUARDANDO_APROVACAO',
    "aprovadoPorId" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "responsavelNome" TEXT,
    "responsavelParentesco" TEXT,
    "responsavelTelefone" TEXT,
    "responsavelEmail" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfis_aluno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacoes" (
    "id" TEXT NOT NULL,
    "tipo" "TipoSolicitacao" NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "justificativa" TEXT,
    "status" "StatusSolicitacao" NOT NULL DEFAULT 'ABERTA',
    "decididoPorId" TEXT,
    "decididoEm" TIMESTAMP(3),
    "parecer" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditorias" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "antes" JSONB,
    "depois" JSONB,
    "ipHash" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_instrumento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "status" "Situacao" NOT NULL DEFAULT 'ATIVO',

    CONSTRAINT "categorias_instrumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instrumentos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT,
    "descricao" TEXT,
    "categoriaId" TEXT NOT NULL,
    "afinacao" TEXT NOT NULL DEFAULT 'Dó',
    "transposicaoGrau" INTEGER NOT NULL DEFAULT 0,
    "transposicaoSemitons" INTEGER NOT NULL DEFAULT 0,
    "transposicaoDescricao" TEXT,
    "clavePrincipal" "Clave",
    "clavesAlternativas" "Clave"[] DEFAULT ARRAY[]::"Clave"[],
    "extensaoEscrita" TEXT,
    "observacoesTecnicas" TEXT,
    "status" "Situacao" NOT NULL DEFAULT 'ATIVO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instrumentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metodos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "escopo" "EscopoDoMetodo" NOT NULL DEFAULT 'INSTRUMENTO',
    "instrumentoId" TEXT,
    "autor" TEXT,
    "organizacao" TEXT,
    "versao" TEXT,
    "descricao" TEXT,
    "nivel" TEXT,
    "totalFases" INTEGER,
    "conteudoCompartilhado" BOOLEAN NOT NULL DEFAULT false,
    "notaDireitos" TEXT,
    "status" "Situacao" NOT NULL DEFAULT 'RASCUNHO',
    "documentoOrigemId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metodos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metodos_instrumentos" (
    "metodoId" TEXT NOT NULL,
    "instrumentoId" TEXT NOT NULL,
    "autorizadoPorId" TEXT,
    "autorizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,

    CONSTRAINT "metodos_instrumentos_pkey" PRIMARY KEY ("metodoId","instrumentoId")
);

-- CreateTable
CREATE TABLE "documentos_metodo" (
    "id" TEXT NOT NULL,
    "metodoId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "tipoArquivo" "TipoDeDocumento" NOT NULL,
    "arquivoId" TEXT,
    "caminho" TEXT,
    "versao" TEXT,
    "descricao" TEXT,
    "fonte" TEXT,
    "enviadoPorId" TEXT,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "Situacao" NOT NULL DEFAULT 'ATIVO',

    CONSTRAINT "documentos_metodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competencias" (
    "id" TEXT NOT NULL,
    "metodoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "peso" INTEGER NOT NULL DEFAULT 1,
    "status" "Situacao" NOT NULL DEFAULT 'ATIVO',

    CONSTRAINT "competencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracoes_metodo" (
    "id" TEXT NOT NULL,
    "metodoId" TEXT NOT NULL,
    "chave" "ChaveDeConfiguracao" NOT NULL,
    "valor" JSONB NOT NULL,
    "descricao" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "vigenteDe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigenteAte" TIMESTAMP(3),

    CONSTRAINT "configuracoes_metodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculos" (
    "id" TEXT NOT NULL,
    "metodoId" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "descricao" TEXT,
    "status" "StatusDoCurriculo" NOT NULL DEFAULT 'RASCUNHO',
    "vigenteDe" TIMESTAMP(3),
    "vigenteAte" TIMESTAMP(3),
    "origemAnaliseId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidades_curriculares" (
    "id" TEXT NOT NULL,
    "curriculoId" TEXT NOT NULL,
    "paiId" TEXT,
    "tipo" "TipoDeUnidade" NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "profundidade" INTEGER NOT NULL DEFAULT 0,
    "caminho" TEXT NOT NULL DEFAULT '',
    "documentoOrigemId" TEXT,
    "paginaOrigemInicio" INTEGER,
    "paginaOrigemFim" INTEGER,
    "referenciaOrigem" TEXT,
    "statusConferencia" "StatusConferencia" NOT NULL DEFAULT 'PENDENTE_CONFERENCIA',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unidades_curriculares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licoes" (
    "id" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "metodoId" TEXT NOT NULL,
    "instrumentoId" TEXT,
    "numeroOriginal" TEXT NOT NULL,
    "variante" TEXT NOT NULL DEFAULT '',
    "titulo" TEXT NOT NULL,
    "tipo" "TipoLicao" NOT NULL,
    "ordemPedagogica" INTEGER NOT NULL DEFAULT 0,
    "objetivos" TEXT,
    "preRequisitos" TEXT,
    "compartilhado" BOOLEAN NOT NULL DEFAULT false,
    "documentoOrigemId" TEXT,
    "paginaOrigemInicio" INTEGER,
    "paginaOrigemFim" INTEGER,
    "referenciaOrigem" TEXT,
    "fonte" TEXT,
    "observacoes" TEXT,
    "statusConferencia" "StatusConferencia" NOT NULL DEFAULT 'PENDENTE_CONFERENCIA',
    "statusPublicacao" "StatusPublicacao" NOT NULL DEFAULT 'RASCUNHO',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versoes_licao" (
    "id" TEXT NOT NULL,
    "licaoId" TEXT NOT NULL,
    "clave" "Clave" NOT NULL,
    "criterioClave" TEXT,
    "paginaImpressaInicio" INTEGER,
    "paginaImpressaFim" INTEGER,
    "paginaArquivoInicio" INTEGER,
    "paginaArquivoFim" INTEGER,
    "armadura" TEXT,
    "escalaReferencia" TEXT,
    "compassos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tipoLeitura" TEXT,
    "observacoes" TEXT,
    "fonte" TEXT,
    "statusConferencia" "StatusConferencia" NOT NULL DEFAULT 'PENDENTE_CONFERENCIA',

    CONSTRAINT "versoes_licao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agrupamentos" (
    "id" TEXT NOT NULL,
    "tipo" "TipoAgrupamento" NOT NULL,
    "valor" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "agrupamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licoes_agrupamentos" (
    "licaoId" TEXT NOT NULL,
    "agrupamentoId" TEXT NOT NULL,

    CONSTRAINT "licoes_agrupamentos_pkey" PRIMARY KEY ("licaoId","agrupamentoId")
);

-- CreateTable
CREATE TABLE "conteudos" (
    "id" TEXT NOT NULL,
    "licaoId" TEXT NOT NULL,
    "tipo" "TipoConteudo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT,
    "arquivoId" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "publicado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "conteudos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivos" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "hashSha256" TEXT,
    "enviadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retencaoAte" TIMESTAMP(3),

    CONSTRAINT "arquivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questoes" (
    "id" TEXT NOT NULL,
    "metodoId" TEXT NOT NULL,
    "unidadeId" TEXT,
    "licaoId" TEXT,
    "instrumentoId" TEXT,
    "competenciaId" TEXT,
    "tipo" "TipoQuestao" NOT NULL,
    "enunciado" TEXT NOT NULL,
    "alternativas" JSONB,
    "resposta" JSONB NOT NULL,
    "explicacao" TEXT,
    "paginaReferencia" INTEGER,
    "dificuldade" INTEGER NOT NULL DEFAULT 1,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "statusRevisao" "StatusRevisao" NOT NULL DEFAULT 'RASCUNHO',
    "origem" "OrigemQuestao" NOT NULL DEFAULT 'MANUAL',
    "autorId" TEXT,
    "revisorId" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes" (
    "id" TEXT NOT NULL,
    "metodoId" TEXT NOT NULL,
    "escopo" "EscopoAvaliacao" NOT NULL,
    "referenciaId" TEXT,
    "nome" TEXT NOT NULL,
    "quantidadeQuestoes" INTEGER,
    "notaMinima" INTEGER,
    "tentativasMax" INTEGER,
    "regras" JSONB,
    "status" "Situacao" NOT NULL DEFAULT 'ATIVO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avaliacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criterios_avaliacao" (
    "id" TEXT NOT NULL,
    "avaliacaoId" TEXT NOT NULL,
    "competenciaId" TEXT NOT NULL,
    "peso" INTEGER NOT NULL DEFAULT 1,
    "descricao" TEXT,

    CONSTRAINT "criterios_avaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tentativas_avaliacao" (
    "id" TEXT NOT NULL,
    "avaliacaoId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEm" TIMESTAMP(3),
    "nota" INTEGER,
    "aprovado" BOOLEAN,
    "questoes" JSONB NOT NULL,
    "respostas" JSONB,
    "corrigidaPorId" TEXT,
    "observacao" TEXT,

    CONSTRAINT "tentativas_avaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questoes_recebidas" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "questaoId" TEXT,
    "assinatura" TEXT NOT NULL,
    "tentativaId" TEXT,
    "recebidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questoes_recebidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atividades" (
    "id" TEXT NOT NULL,
    "licaoId" TEXT NOT NULL,
    "tipo" "TipoConteudo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "instrucoes" TEXT,
    "criterios" JSONB,
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "peso" INTEGER NOT NULL DEFAULT 1,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "atividades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envios" (
    "id" TEXT NOT NULL,
    "atividadeId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "estado" "EstadoEnvio" NOT NULL DEFAULT 'NAO_INICIADA',
    "tentativa" INTEGER NOT NULL DEFAULT 1,
    "comentario" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "envios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envios_arquivos" (
    "envioId" TEXT NOT NULL,
    "arquivoId" TEXT NOT NULL,

    CONSTRAINT "envios_arquivos_pkey" PRIMARY KEY ("envioId","arquivoId")
);

-- CreateTable
CREATE TABLE "avaliacoes_envio" (
    "id" TEXT NOT NULL,
    "envioId" TEXT NOT NULL,
    "avaliadorId" TEXT NOT NULL,
    "decisao" "DecisaoAvaliacao" NOT NULL,
    "nota" INTEGER,
    "criterios" JSONB,
    "comentarios" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avaliacoes_envio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes_estudo" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fim" TIMESTAMP(3),
    "ipHash" TEXT,
    "dispositivo" TEXT,
    "segundosAtivos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sessoes_estudo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batimentos" (
    "id" TEXT NOT NULL,
    "sessaoEstudoId" TEXT NOT NULL,
    "licaoId" TEXT,
    "conteudoId" TEXT,
    "navegacaoId" TEXT NOT NULL,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "segundosValidos" INTEGER NOT NULL,
    "visivel" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "batimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visualizacoes_pagina" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "licaoId" TEXT NOT NULL,
    "versaoLicaoId" TEXT,
    "paginaImpressa" INTEGER,
    "navegacaoId" TEXT NOT NULL,
    "primeiraEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "segundos" INTEGER NOT NULL DEFAULT 0,
    "acessos" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "visualizacoes_pagina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tempos_diarios" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "segundosSessao" INTEGER NOT NULL DEFAULT 0,
    "segundosAtivos" INTEGER NOT NULL DEFAULT 0,
    "segundosDedicacao" INTEGER NOT NULL DEFAULT 0,
    "paginasDistintas" INTEGER NOT NULL DEFAULT 0,
    "licoesIniciadas" INTEGER NOT NULL DEFAULT 0,
    "licoesConcluidas" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tempos_diarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regras_progressao" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "tipo" "TipoRegra" NOT NULL,
    "descricao" TEXT NOT NULL,
    "parametros" JSONB NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "vigenteDe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigenteAte" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regras_progressao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progresso_licoes" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "licaoId" TEXT NOT NULL,
    "jornadaId" TEXT,
    "estado" "EstadoProgresso" NOT NULL DEFAULT 'NAO_INICIADO',
    "peso" INTEGER NOT NULL DEFAULT 1,
    "iniciadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "aprovadoEm" TIMESTAMP(3),
    "aprovadoPorId" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progresso_licoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progresso_unidades" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "jornadaId" TEXT,
    "estado" "EstadoProgresso" NOT NULL DEFAULT 'NAO_INICIADO',
    "percentual" INTEGER NOT NULL DEFAULT 0,
    "aprovadoEm" TIMESTAMP(3),
    "aprovadoPorId" TEXT,
    "regraCodigo" TEXT,
    "regraVersao" INTEGER,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progresso_unidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medalhas" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "metodoId" TEXT NOT NULL,
    "unidadeId" TEXT,
    "jornadaId" TEXT,
    "codigo" TEXT NOT NULL,
    "concedidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "instrutorId" TEXT,
    "regraCodigo" TEXT,
    "regraVersao" INTEGER,

    CONSTRAINT "medalhas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificados" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "metodoId" TEXT,
    "jornadaId" TEXT,
    "trilha" TEXT NOT NULL,
    "fases" JSONB NOT NULL,
    "emitidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cargaHorariaSegundos" INTEGER NOT NULL DEFAULT 0,
    "codigo" TEXT NOT NULL,
    "arquivoId" TEXT,
    "revogadoEm" TIMESTAMP(3),
    "revogadoMotivo" TEXT,

    CONSTRAINT "certificados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jornadas_do_aluno" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "instrumentoId" TEXT,
    "metodoId" TEXT NOT NULL,
    "curriculoId" TEXT NOT NULL,
    "unidadeAtualId" TEXT,
    "progresso" INTEGER NOT NULL DEFAULT 0,
    "status" "SituacaoDaJornada" NOT NULL DEFAULT 'ATIVA',
    "inicioEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conclusaoEm" TIMESTAMP(3),
    "observacao" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jornadas_do_aluno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turmas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "comumId" TEXT NOT NULL,
    "instrumentoId" TEXT,
    "metodoId" TEXT NOT NULL,
    "unidadeId" TEXT,
    "instrutorId" TEXT,
    "status" "Situacao" NOT NULL DEFAULT 'ATIVO',
    "inicioEm" TIMESTAMP(3),
    "encerradaEm" TIMESTAMP(3),
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "turmas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matriculas_em_turma" (
    "id" TEXT NOT NULL,
    "turmaId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "jornadaId" TEXT,
    "entradaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saidaEm" TIMESTAMP(3),

    CONSTRAINT "matriculas_em_turma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analises_de_metodo" (
    "id" TEXT NOT NULL,
    "metodoId" TEXT NOT NULL,
    "documentoId" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'importador',
    "estruturaSugerida" JSONB NOT NULL,
    "resumo" JSONB,
    "avisos" JSONB,
    "status" "StatusDaAnalise" NOT NULL DEFAULT 'SUGERIDA',
    "revisadoPorId" TEXT,
    "revisadoEm" TIMESTAMP(3),
    "parecer" TEXT,
    "curriculoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analises_de_metodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacoes" (
    "id" TEXT NOT NULL,
    "tipo" "TipoImportacao" NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "hashArquivo" TEXT,
    "executadaPorId" TEXT,
    "status" "StatusImportacao" NOT NULL DEFAULT 'PREVIA',
    "resumo" JSONB,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidaEm" TIMESTAMP(3),

    CONSTRAINT "importacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacoes_linhas" (
    "id" TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "numeroLinha" INTEGER NOT NULL,
    "dados" JSONB NOT NULL,
    "status" "StatusLinha" NOT NULL,
    "mensagem" TEXT,

    CONSTRAINT "importacoes_linhas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefas" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "carga" JSONB NOT NULL,
    "estado" "EstadoTarefa" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "rodarEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadaEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "erro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regioes_codigo_key" ON "regioes"("codigo");

-- CreateIndex
CREATE INDEX "regioes_ativo_idx" ON "regioes"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "comuns_codigo_key" ON "comuns"("codigo");

-- CreateIndex
CREATE INDEX "comuns_ativo_idx" ON "comuns"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "comuns_regiaoId_nome_key" ON "comuns"("regiaoId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_status_idx" ON "usuarios"("status");

-- CreateIndex
CREATE INDEX "vinculos_usuarioId_ativo_idx" ON "vinculos"("usuarioId", "ativo");

-- CreateIndex
CREATE INDEX "vinculos_papel_ativo_idx" ON "vinculos"("papel", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "vinculos_usuarioId_papel_escopo_regiaoId_comumId_key" ON "vinculos"("usuarioId", "papel", "escopo", "regiaoId", "comumId");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_tokenHash_key" ON "sessoes"("tokenHash");

-- CreateIndex
CREATE INDEX "sessoes_usuarioId_expiraEm_idx" ON "sessoes"("usuarioId", "expiraEm");

-- CreateIndex
CREATE UNIQUE INDEX "perfis_aluno_usuarioId_key" ON "perfis_aluno"("usuarioId");

-- CreateIndex
CREATE INDEX "perfis_aluno_comumId_situacao_idx" ON "perfis_aluno"("comumId", "situacao");

-- CreateIndex
CREATE INDEX "perfis_aluno_instrutorId_idx" ON "perfis_aluno"("instrutorId");

-- CreateIndex
CREATE INDEX "solicitacoes_status_tipo_idx" ON "solicitacoes"("status", "tipo");

-- CreateIndex
CREATE INDEX "auditorias_entidade_entidadeId_idx" ON "auditorias"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "auditorias_criadoEm_idx" ON "auditorias"("criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_instrumento_nome_key" ON "categorias_instrumento"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_instrumento_codigo_key" ON "categorias_instrumento"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "instrumentos_nome_key" ON "instrumentos"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "instrumentos_codigo_key" ON "instrumentos"("codigo");

-- CreateIndex
CREATE INDEX "instrumentos_status_idx" ON "instrumentos"("status");

-- CreateIndex
CREATE UNIQUE INDEX "metodos_codigo_key" ON "metodos"("codigo");

-- CreateIndex
CREATE INDEX "metodos_escopo_status_idx" ON "metodos"("escopo", "status");

-- CreateIndex
CREATE INDEX "documentos_metodo_metodoId_status_idx" ON "documentos_metodo"("metodoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "competencias_metodoId_codigo_key" ON "competencias"("metodoId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_metodo_metodoId_chave_versao_key" ON "configuracoes_metodo"("metodoId", "chave", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "curriculos_metodoId_versao_key" ON "curriculos"("metodoId", "versao");

-- CreateIndex
CREATE INDEX "unidades_curriculares_curriculoId_tipo_ordem_idx" ON "unidades_curriculares"("curriculoId", "tipo", "ordem");

-- CreateIndex
CREATE INDEX "unidades_curriculares_paiId_ordem_idx" ON "unidades_curriculares"("paiId", "ordem");

-- CreateIndex
CREATE INDEX "unidades_curriculares_caminho_idx" ON "unidades_curriculares"("caminho");

-- CreateIndex
CREATE UNIQUE INDEX "unidades_curriculares_curriculoId_codigo_key" ON "unidades_curriculares"("curriculoId", "codigo");

-- CreateIndex
CREATE INDEX "licoes_metodoId_statusPublicacao_idx" ON "licoes"("metodoId", "statusPublicacao");

-- CreateIndex
CREATE INDEX "licoes_tipo_statusPublicacao_idx" ON "licoes"("tipo", "statusPublicacao");

-- CreateIndex
CREATE UNIQUE INDEX "licoes_unidadeId_numeroOriginal_variante_key" ON "licoes"("unidadeId", "numeroOriginal", "variante");

-- CreateIndex
CREATE INDEX "versoes_licao_escalaReferencia_clave_idx" ON "versoes_licao"("escalaReferencia", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "versoes_licao_licaoId_clave_key" ON "versoes_licao"("licaoId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "agrupamentos_tipo_valor_key" ON "agrupamentos"("tipo", "valor");

-- CreateIndex
CREATE INDEX "conteudos_licaoId_ordem_idx" ON "conteudos"("licaoId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "arquivos_chave_key" ON "arquivos"("chave");

-- CreateIndex
CREATE INDEX "questoes_metodoId_statusRevisao_idx" ON "questoes"("metodoId", "statusRevisao");

-- CreateIndex
CREATE INDEX "questoes_instrumentoId_statusRevisao_idx" ON "questoes"("instrumentoId", "statusRevisao");

-- CreateIndex
CREATE UNIQUE INDEX "avaliacoes_metodoId_escopo_referenciaId_nome_key" ON "avaliacoes"("metodoId", "escopo", "referenciaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "criterios_avaliacao_avaliacaoId_competenciaId_key" ON "criterios_avaliacao"("avaliacaoId", "competenciaId");

-- CreateIndex
CREATE INDEX "tentativas_avaliacao_alunoId_avaliacaoId_idx" ON "tentativas_avaliacao"("alunoId", "avaliacaoId");

-- CreateIndex
CREATE INDEX "questoes_recebidas_alunoId_idx" ON "questoes_recebidas"("alunoId");

-- CreateIndex
CREATE UNIQUE INDEX "questoes_recebidas_alunoId_assinatura_key" ON "questoes_recebidas"("alunoId", "assinatura");

-- CreateIndex
CREATE INDEX "atividades_licaoId_idx" ON "atividades"("licaoId");

-- CreateIndex
CREATE INDEX "envios_estado_idx" ON "envios"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "envios_atividadeId_alunoId_tentativa_key" ON "envios"("atividadeId", "alunoId", "tentativa");

-- CreateIndex
CREATE INDEX "avaliacoes_envio_envioId_idx" ON "avaliacoes_envio"("envioId");

-- CreateIndex
CREATE INDEX "sessoes_estudo_usuarioId_inicio_idx" ON "sessoes_estudo"("usuarioId", "inicio");

-- CreateIndex
CREATE INDEX "batimentos_sessaoEstudoId_recebidoEm_idx" ON "batimentos"("sessaoEstudoId", "recebidoEm");

-- CreateIndex
CREATE INDEX "batimentos_navegacaoId_idx" ON "batimentos"("navegacaoId");

-- CreateIndex
CREATE INDEX "visualizacoes_pagina_usuarioId_licaoId_idx" ON "visualizacoes_pagina"("usuarioId", "licaoId");

-- CreateIndex
CREATE UNIQUE INDEX "visualizacoes_pagina_navegacaoId_key" ON "visualizacoes_pagina"("navegacaoId");

-- CreateIndex
CREATE INDEX "tempos_diarios_dia_idx" ON "tempos_diarios"("dia");

-- CreateIndex
CREATE UNIQUE INDEX "tempos_diarios_usuarioId_dia_key" ON "tempos_diarios"("usuarioId", "dia");

-- CreateIndex
CREATE UNIQUE INDEX "regras_progressao_codigo_versao_key" ON "regras_progressao"("codigo", "versao");

-- CreateIndex
CREATE INDEX "progresso_licoes_alunoId_estado_idx" ON "progresso_licoes"("alunoId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "progresso_licoes_alunoId_licaoId_key" ON "progresso_licoes"("alunoId", "licaoId");

-- CreateIndex
CREATE INDEX "progresso_unidades_jornadaId_idx" ON "progresso_unidades"("jornadaId");

-- CreateIndex
CREATE UNIQUE INDEX "progresso_unidades_alunoId_unidadeId_key" ON "progresso_unidades"("alunoId", "unidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "medalhas_codigo_key" ON "medalhas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "medalhas_alunoId_metodoId_unidadeId_key" ON "medalhas"("alunoId", "metodoId", "unidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "certificados_codigo_key" ON "certificados"("codigo");

-- CreateIndex
CREATE INDEX "certificados_alunoId_idx" ON "certificados"("alunoId");

-- CreateIndex
CREATE INDEX "jornadas_do_aluno_status_idx" ON "jornadas_do_aluno"("status");

-- CreateIndex
CREATE UNIQUE INDEX "jornadas_do_aluno_alunoId_metodoId_instrumentoId_key" ON "jornadas_do_aluno"("alunoId", "metodoId", "instrumentoId");

-- CreateIndex
CREATE INDEX "turmas_comumId_status_idx" ON "turmas"("comumId", "status");

-- CreateIndex
CREATE INDEX "turmas_instrutorId_idx" ON "turmas"("instrutorId");

-- CreateIndex
CREATE UNIQUE INDEX "matriculas_em_turma_turmaId_alunoId_key" ON "matriculas_em_turma"("turmaId", "alunoId");

-- CreateIndex
CREATE INDEX "analises_de_metodo_metodoId_status_idx" ON "analises_de_metodo"("metodoId", "status");

-- CreateIndex
CREATE INDEX "importacoes_linhas_importacaoId_status_idx" ON "importacoes_linhas"("importacaoId", "status");

-- CreateIndex
CREATE INDEX "tarefas_estado_rodarEm_idx" ON "tarefas"("estado", "rodarEm");

-- AddForeignKey
ALTER TABLE "comuns" ADD CONSTRAINT "comuns_regiaoId_fkey" FOREIGN KEY ("regiaoId") REFERENCES "regioes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos" ADD CONSTRAINT "vinculos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos" ADD CONSTRAINT "vinculos_concedidoPorId_fkey" FOREIGN KEY ("concedidoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos" ADD CONSTRAINT "vinculos_regiaoId_fkey" FOREIGN KEY ("regiaoId") REFERENCES "regioes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos" ADD CONSTRAINT "vinculos_comumId_fkey" FOREIGN KEY ("comumId") REFERENCES "comuns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfis_aluno" ADD CONSTRAINT "perfis_aluno_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfis_aluno" ADD CONSTRAINT "perfis_aluno_comumId_fkey" FOREIGN KEY ("comumId") REFERENCES "comuns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfis_aluno" ADD CONSTRAINT "perfis_aluno_instrumentoId_fkey" FOREIGN KEY ("instrumentoId") REFERENCES "instrumentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfis_aluno" ADD CONSTRAINT "perfis_aluno_instrutorId_fkey" FOREIGN KEY ("instrutorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_decididoPorId_fkey" FOREIGN KEY ("decididoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditorias" ADD CONSTRAINT "auditorias_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instrumentos" ADD CONSTRAINT "instrumentos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias_instrumento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metodos" ADD CONSTRAINT "metodos_instrumentoId_fkey" FOREIGN KEY ("instrumentoId") REFERENCES "instrumentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metodos_instrumentos" ADD CONSTRAINT "metodos_instrumentos_metodoId_fkey" FOREIGN KEY ("metodoId") REFERENCES "metodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metodos_instrumentos" ADD CONSTRAINT "metodos_instrumentos_instrumentoId_fkey" FOREIGN KEY ("instrumentoId") REFERENCES "instrumentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metodos_instrumentos" ADD CONSTRAINT "metodos_instrumentos_autorizadoPorId_fkey" FOREIGN KEY ("autorizadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_metodo" ADD CONSTRAINT "documentos_metodo_metodoId_fkey" FOREIGN KEY ("metodoId") REFERENCES "metodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_metodo" ADD CONSTRAINT "documentos_metodo_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "arquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_metodo" ADD CONSTRAINT "documentos_metodo_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competencias" ADD CONSTRAINT "competencias_metodoId_fkey" FOREIGN KEY ("metodoId") REFERENCES "metodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracoes_metodo" ADD CONSTRAINT "configuracoes_metodo_metodoId_fkey" FOREIGN KEY ("metodoId") REFERENCES "metodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculos" ADD CONSTRAINT "curriculos_metodoId_fkey" FOREIGN KEY ("metodoId") REFERENCES "metodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidades_curriculares" ADD CONSTRAINT "unidades_curriculares_curriculoId_fkey" FOREIGN KEY ("curriculoId") REFERENCES "curriculos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidades_curriculares" ADD CONSTRAINT "unidades_curriculares_paiId_fkey" FOREIGN KEY ("paiId") REFERENCES "unidades_curriculares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidades_curriculares" ADD CONSTRAINT "unidades_curriculares_documentoOrigemId_fkey" FOREIGN KEY ("documentoOrigemId") REFERENCES "documentos_metodo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licoes" ADD CONSTRAINT "licoes_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "unidades_curriculares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licoes" ADD CONSTRAINT "licoes_metodoId_fkey" FOREIGN KEY ("metodoId") REFERENCES "metodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licoes" ADD CONSTRAINT "licoes_instrumentoId_fkey" FOREIGN KEY ("instrumentoId") REFERENCES "instrumentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licoes" ADD CONSTRAINT "licoes_documentoOrigemId_fkey" FOREIGN KEY ("documentoOrigemId") REFERENCES "documentos_metodo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versoes_licao" ADD CONSTRAINT "versoes_licao_licaoId_fkey" FOREIGN KEY ("licaoId") REFERENCES "licoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licoes_agrupamentos" ADD CONSTRAINT "licoes_agrupamentos_licaoId_fkey" FOREIGN KEY ("licaoId") REFERENCES "licoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licoes_agrupamentos" ADD CONSTRAINT "licoes_agrupamentos_agrupamentoId_fkey" FOREIGN KEY ("agrupamentoId") REFERENCES "agrupamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteudos" ADD CONSTRAINT "conteudos_licaoId_fkey" FOREIGN KEY ("licaoId") REFERENCES "licoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteudos" ADD CONSTRAINT "conteudos_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "arquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questoes" ADD CONSTRAINT "questoes_metodoId_fkey" FOREIGN KEY ("metodoId") REFERENCES "metodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questoes" ADD CONSTRAINT "questoes_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "unidades_curriculares"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questoes" ADD CONSTRAINT "questoes_licaoId_fkey" FOREIGN KEY ("licaoId") REFERENCES "licoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questoes" ADD CONSTRAINT "questoes_instrumentoId_fkey" FOREIGN KEY ("instrumentoId") REFERENCES "instrumentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questoes" ADD CONSTRAINT "questoes_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questoes" ADD CONSTRAINT "questoes_revisorId_fkey" FOREIGN KEY ("revisorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_metodoId_fkey" FOREIGN KEY ("metodoId") REFERENCES "metodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criterios_avaliacao" ADD CONSTRAINT "criterios_avaliacao_avaliacaoId_fkey" FOREIGN KEY ("avaliacaoId") REFERENCES "avaliacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criterios_avaliacao" ADD CONSTRAINT "criterios_avaliacao_competenciaId_fkey" FOREIGN KEY ("competenciaId") REFERENCES "competencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tentativas_avaliacao" ADD CONSTRAINT "tentativas_avaliacao_avaliacaoId_fkey" FOREIGN KEY ("avaliacaoId") REFERENCES "avaliacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tentativas_avaliacao" ADD CONSTRAINT "tentativas_avaliacao_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tentativas_avaliacao" ADD CONSTRAINT "tentativas_avaliacao_corrigidaPorId_fkey" FOREIGN KEY ("corrigidaPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questoes_recebidas" ADD CONSTRAINT "questoes_recebidas_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questoes_recebidas" ADD CONSTRAINT "questoes_recebidas_questaoId_fkey" FOREIGN KEY ("questaoId") REFERENCES "questoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questoes_recebidas" ADD CONSTRAINT "questoes_recebidas_tentativaId_fkey" FOREIGN KEY ("tentativaId") REFERENCES "tentativas_avaliacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_licaoId_fkey" FOREIGN KEY ("licaoId") REFERENCES "licoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios" ADD CONSTRAINT "envios_atividadeId_fkey" FOREIGN KEY ("atividadeId") REFERENCES "atividades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios" ADD CONSTRAINT "envios_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_arquivos" ADD CONSTRAINT "envios_arquivos_envioId_fkey" FOREIGN KEY ("envioId") REFERENCES "envios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_arquivos" ADD CONSTRAINT "envios_arquivos_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "arquivos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_envio" ADD CONSTRAINT "avaliacoes_envio_envioId_fkey" FOREIGN KEY ("envioId") REFERENCES "envios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_envio" ADD CONSTRAINT "avaliacoes_envio_avaliadorId_fkey" FOREIGN KEY ("avaliadorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes_estudo" ADD CONSTRAINT "sessoes_estudo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batimentos" ADD CONSTRAINT "batimentos_sessaoEstudoId_fkey" FOREIGN KEY ("sessaoEstudoId") REFERENCES "sessoes_estudo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batimentos" ADD CONSTRAINT "batimentos_licaoId_fkey" FOREIGN KEY ("licaoId") REFERENCES "licoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batimentos" ADD CONSTRAINT "batimentos_conteudoId_fkey" FOREIGN KEY ("conteudoId") REFERENCES "conteudos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visualizacoes_pagina" ADD CONSTRAINT "visualizacoes_pagina_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visualizacoes_pagina" ADD CONSTRAINT "visualizacoes_pagina_licaoId_fkey" FOREIGN KEY ("licaoId") REFERENCES "licoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visualizacoes_pagina" ADD CONSTRAINT "visualizacoes_pagina_versaoLicaoId_fkey" FOREIGN KEY ("versaoLicaoId") REFERENCES "versoes_licao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tempos_diarios" ADD CONSTRAINT "tempos_diarios_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progresso_licoes" ADD CONSTRAINT "progresso_licoes_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progresso_licoes" ADD CONSTRAINT "progresso_licoes_licaoId_fkey" FOREIGN KEY ("licaoId") REFERENCES "licoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progresso_licoes" ADD CONSTRAINT "progresso_licoes_jornadaId_fkey" FOREIGN KEY ("jornadaId") REFERENCES "jornadas_do_aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progresso_unidades" ADD CONSTRAINT "progresso_unidades_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progresso_unidades" ADD CONSTRAINT "progresso_unidades_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "unidades_curriculares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progresso_unidades" ADD CONSTRAINT "progresso_unidades_jornadaId_fkey" FOREIGN KEY ("jornadaId") REFERENCES "jornadas_do_aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medalhas" ADD CONSTRAINT "medalhas_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medalhas" ADD CONSTRAINT "medalhas_metodoId_fkey" FOREIGN KEY ("metodoId") REFERENCES "metodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medalhas" ADD CONSTRAINT "medalhas_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "unidades_curriculares"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medalhas" ADD CONSTRAINT "medalhas_jornadaId_fkey" FOREIGN KEY ("jornadaId") REFERENCES "jornadas_do_aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medalhas" ADD CONSTRAINT "medalhas_instrutorId_fkey" FOREIGN KEY ("instrutorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_metodoId_fkey" FOREIGN KEY ("metodoId") REFERENCES "metodos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_jornadaId_fkey" FOREIGN KEY ("jornadaId") REFERENCES "jornadas_do_aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "arquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornadas_do_aluno" ADD CONSTRAINT "jornadas_do_aluno_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornadas_do_aluno" ADD CONSTRAINT "jornadas_do_aluno_instrumentoId_fkey" FOREIGN KEY ("instrumentoId") REFERENCES "instrumentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornadas_do_aluno" ADD CONSTRAINT "jornadas_do_aluno_metodoId_fkey" FOREIGN KEY ("metodoId") REFERENCES "metodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornadas_do_aluno" ADD CONSTRAINT "jornadas_do_aluno_curriculoId_fkey" FOREIGN KEY ("curriculoId") REFERENCES "curriculos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornadas_do_aluno" ADD CONSTRAINT "jornadas_do_aluno_unidadeAtualId_fkey" FOREIGN KEY ("unidadeAtualId") REFERENCES "unidades_curriculares"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_comumId_fkey" FOREIGN KEY ("comumId") REFERENCES "comuns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_instrumentoId_fkey" FOREIGN KEY ("instrumentoId") REFERENCES "instrumentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_metodoId_fkey" FOREIGN KEY ("metodoId") REFERENCES "metodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "unidades_curriculares"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_instrutorId_fkey" FOREIGN KEY ("instrutorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matriculas_em_turma" ADD CONSTRAINT "matriculas_em_turma_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "turmas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matriculas_em_turma" ADD CONSTRAINT "matriculas_em_turma_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matriculas_em_turma" ADD CONSTRAINT "matriculas_em_turma_jornadaId_fkey" FOREIGN KEY ("jornadaId") REFERENCES "jornadas_do_aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analises_de_metodo" ADD CONSTRAINT "analises_de_metodo_metodoId_fkey" FOREIGN KEY ("metodoId") REFERENCES "metodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analises_de_metodo" ADD CONSTRAINT "analises_de_metodo_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documentos_metodo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analises_de_metodo" ADD CONSTRAINT "analises_de_metodo_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_executadaPorId_fkey" FOREIGN KEY ("executadaPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacoes_linhas" ADD CONSTRAINT "importacoes_linhas_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "importacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
