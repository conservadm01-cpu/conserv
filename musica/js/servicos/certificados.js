// Certificados.
//
// Um certificado é a única coisa que sai do aplicativo e vai para a mão de
// outra pessoa. Por isso ele precisa de duas propriedades que o resto não
// precisa:
//
//   Não mudar. O que está escrito nele foi verdade no dia em que foi emitido.
//   Se o método for corrigido no ano seguinte — outra ordem de fases, outro
//   título — o certificado de quem já concluiu continua dizendo o que ele
//   concluiu. Por isso ele guarda um RETRATO: cópia dos dados do momento da
//   emissão, e não referências ao cadastro vivo.
//
//   Poder ser conferido. O código de verificação e o resumo (hash) permitem
//   dizer se o papel corresponde ao registro do aparelho.
//
// Do que este resumo protege, com honestidade: de alteração acidental e de
// adulteração casual do arquivo exportado. Ele NÃO é assinatura digital —
// quem sabe abrir o código pode recalculá-lo. Vale como conferência, não como
// prova contra falsificação decidida.

import * as R from '../dados/repositorios.js';
import { sha256 } from '../senha.js';
import { montarCertificado } from '../certificado.js';
import * as eventos from './eventos.js';
import * as auditoria from './auditoria.js';

// Os campos que entram no resumo, na ordem — mudar esta lista invalida os
// resumos já emitidos, então ela é parte do formato.
const CAMPOS_DO_RESUMO = ['codigo', 'aluno', 'faseId', 'metodoId', 'versaoRotulo', 'nota', 'data'];

export function calcularHash(certificado) {
  const partes = CAMPOS_DO_RESUMO.map((campo) => `${campo}=${certificado[campo] ?? ''}`);
  return sha256(partes.join('|')).slice(0, 32);
}

// Emite o certificado de uma fase aprovada. Idempotente por fase: reaprovar a
// mesma fase com nota melhor atualiza a nota, mas não cria um segundo
// certificado nem muda o número do primeiro.
export function emitir({ alunoId, fase, nota, acertos, total, responsavel = null, data = null }) {
  const aluno = R.alunos.buscar(alunoId);
  if (!aluno) throw new Error('Aluno não encontrado.');

  const matricula = R.matriculasDoAluno(alunoId).find((m) => m.metodoId === fase.metodoId) || null;
  const metodo = R.metodos.buscar(fase.metodoId);
  const versao = fase.versaoId ? R.versoes.buscar(fase.versaoId) : (metodo ? R.versaoVigente(metodo.id) : null);
  const instrumento = matricula && matricula.instrumentoId ? R.instrumentos.buscar(matricula.instrumentoId) : null;
  const quando = data || new Date().toISOString();

  const existente = R.certificados.buscar(`${alunoId}#${fase.id}`);
  const base = montarCertificado({ nome: aluno.nome, fase, nota, acertos, total, data: existente ? existente.data : quando });

  const certificado = {
    ...base,
    id: `${alunoId}#${fase.id}`,
    alunoId,
    matriculaId: matricula ? matricula.id : null,
    aluno: aluno.nome,
    // O número é sequencial e estável: uma vez dado, não muda.
    numero: existente ? existente.numero : proximoNumero(),
    codigo: existente ? existente.codigo : base.codigo,
    data: existente ? existente.data : quando,
    emitidoEm: existente ? existente.emitidoEm : quando,
    atualizadoEm: quando,
    responsavel: responsavel || nomeDoResponsavel(),
    metodoId: fase.metodoId,
    versaoId: versao ? versao.id : null,
    versaoRotulo: versao ? versao.rotulo : '',
    // O retrato: o que valia no dia. Nunca é relido do cadastro depois.
    retrato: {
      aluno: aluno.nome,
      comum: aluno.comum || '',
      instrumento: instrumento ? instrumento.nome : (aluno.instrumento || ''),
      metodo: metodo ? metodo.nome : '',
      versao: versao ? versao.rotulo : '',
      fase: { id: fase.id, numero: fase.numero, titulo: fase.titulo, subtitulo: fase.subtitulo || '' },
      notaMinima: fase.notaMinima || 0,
      emitidoEm: existente ? existente.emitidoEm : quando,
    },
  };
  certificado.hash = calcularHash(certificado);

  R.certificados.salvar(certificado);

  if (!existente) {
    eventos.registrar({
      alunoId, matriculaId: certificado.matriculaId, tipo: eventos.TIPOS.CERTIFICADO,
      titulo: `Certificado da Fase ${fase.numero}`, detalhe: `${nota}% · ${certificado.codigo}`,
      faseId: fase.id, valor: nota, dataHora: quando,
    });
    auditoria.registrar({
      acao: 'certificado.emitir', entidade: 'certificados', entidadeId: certificado.id,
      dadosDepois: { codigo: certificado.codigo, numero: certificado.numero, nota, faseId: fase.id, alunoId },
    });
  }
  return certificado;
}

function proximoNumero() {
  const maior = R.certificados.listar()
    .reduce((maximo, c) => Math.max(maximo, Number(c.numero) || 0), 0);
  return maior + 1;
}

function nomeDoResponsavel() {
  const sessao = R.sessaoAtual();
  if (sessao && sessao.papel !== 'ALUNO') {
    const acesso = R.usuarios.buscar(sessao.usuarioId);
    if (acesso) return acesso.login;
  }
  const admin = R.usuarios.umPorCampo('papel', 'ADMIN');
  return admin ? admin.login : '';
}

// ------------------------------------------------------------ verificação

export function verificar(codigo) {
  const certificado = R.certificados.listar().find((c) => c.codigo === String(codigo).trim());
  if (!certificado) {
    return { valido: false, motivo: 'Nenhum certificado com este código foi emitido neste aparelho.' };
  }
  if (!certificado.hash) {
    return {
      valido: false, certificado,
      motivo: 'Certificado emitido antes de existir o resumo de conferência: os dados estão aqui, mas não há como conferir se foram alterados.',
    };
  }
  const esperado = calcularHash(certificado);
  if (esperado !== certificado.hash) {
    return { valido: false, certificado, motivo: 'Os dados do certificado não correspondem ao resumo gravado.' };
  }
  return { valido: true, certificado };
}

export const doAluno = (alunoId) => R.certificadosDoAluno(alunoId)
  .slice().sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0));
