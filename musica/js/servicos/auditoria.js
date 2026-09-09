// Auditoria.
//
// Registra o que foi feito, por quem, e o que mudou — para as ações que têm
// consequência para alguém: nota, aprovação, certificado, matrícula, método,
// conteúdo, entrada no painel, migração, rollback.
//
// Uma regra dura: senha nunca entra aqui. Nem em `dadosAntes`, nem em
// `dadosDepois`, nem por descuido de quem chama. Os campos de senha são
// retirados na entrada, pela camada de compatibilidade — porque um registro
// de auditoria é feito para ser lido depois por outra pessoa.

import * as R from '../dados/repositorios.js';

export const ACOES = {
  NOTA_ALTERADA: 'nota.alterar',
  APROVACAO: 'fase.aprovar',
  REPROVACAO: 'fase.reprovar',
  CERTIFICADO: 'certificado.emitir',
  MATRICULA_CRIADA: 'matricula.criar',
  MATRICULA_ALTERADA: 'matricula.alterar',
  METODO_ALTERADO: 'metodo.alterar',
  METODO_IMPORTADO: 'metodo.importar',
  VERSAO_PUBLICADA: 'versao.publicar',
  CONTEUDO_ALTERADO: 'conteudo.alterar',
  LOGIN_ADMIN: 'acesso.login',
  ROLLBACK: 'dados.rollback',
  MIGRACAO: 'dados.migracao',
  DADOS_APAGADOS: 'dados.apagar',
};

function quemEsta() {
  const sessao = R.sessaoAtual();
  if (!sessao) return { usuarioId: null, papel: null };
  return { usuarioId: sessao.usuarioId, papel: sessao.papel };
}

export function registrar({ acao, entidade, entidadeId = null, dadosAntes = null, dadosDepois = null, usuarioId = null, papel = null }) {
  const quem = quemEsta();
  return R.auditorias.criar({
    usuarioId: usuarioId || quem.usuarioId,
    papel: papel || quem.papel,
    acao, entidade, entidadeId, dadosAntes, dadosDepois,
    dataHora: new Date().toISOString(),
  });
}

export function listar({ limite = 100, acao = null, entidade = null } = {}) {
  return R.auditorias.listar()
    .filter((a) => (acao ? a.acao === acao : true))
    .filter((a) => (entidade ? a.entidade === entidade : true))
    .sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora)))
    .slice(0, limite);
}

export const doRegistro = (entidade, entidadeId) =>
  R.auditorias.listar((a) => a.entidade === entidade && a.entidadeId === entidadeId)
    .sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora)));
