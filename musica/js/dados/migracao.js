// Migração dos dados do V1 para o V2.
//
// Três compromissos, nesta ordem:
//
//   1. Nada é apagado. A chave antiga (msa.escola.v1) continua onde está,
//      intacta, depois da migração. O V2 escreve em uma chave nova.
//   2. Antes de converter, é feita uma cópia de segurança datada. Se algo der
//      errado, rollback() devolve os dados exatamente como estavam.
//   3. A migração roda uma única vez. O estado do V2 guarda a versão da
//      migração aplicada; enquanto ela for a versão atual, nada é refeito.

import { CHAVE_V1, CHAVE_V0, CHAVE_V2, PREFIXO_DE_BACKUP, depositoAtual } from './deposito.js';
import { completarEstado, estadoVazio } from './esquema.js';
import { normalizeAluno, normalizeCertificado, normalizeProgresso, normalizeResultado, normalizeUsuario } from './compatibilidade.js';
import { idDoAcesso, idDoCertificado, idDoProgresso, novoId } from './ids.js';
import { semear } from './semente.js';
import { guardarSenha, LOGIN_INICIAL, SENHA_INICIAL } from './permissoes.js';

export const VERSAO_DA_MIGRACAO = 2;
export const MAXIMO_DE_BACKUPS = 5;

const agora = () => new Date().toISOString();

// Todo cadastro precisa de um acesso de instrutor. Numa instalação nova ele
// nasce com o usuário e a senha de fábrica — e o aplicativo avisa, na primeira
// entrada, que essa senha precisa ser trocada.
export function garantirAdmin(estado) {
  const admin = estado.usuarios.find((u) => u.papel === 'ADMIN');
  // Cadastro antigo cujo acesso de instrutor ficou sem resumo de senha: sem
  // isto ninguém entraria mais no painel. Ele volta para a senha de fábrica —
  // e o aplicativo avisa, na entrada, que ela precisa ser trocada.
  if (admin && !admin.senhaHash) {
    Object.assign(admin, guardarSenha(SENHA_INICIAL, admin.sal || 'admin'), { exigeSenha: true });
    return estado;
  }
  if (admin) return estado;
  estado.usuarios.push({
    id: 'admin', login: LOGIN_INICIAL, papel: 'ADMIN',
    ...guardarSenha(SENHA_INICIAL, 'admin'),
    exigeSenha: true, alunoId: null, ativo: true, criadoEm: agora(),
  });
  return estado;
}

// ------------------------------------------------------------ cópia de segurança

export function criarBackupAutomatico(deposito = depositoAtual(), motivo = 'migracao') {
  const carimbo = agora().replace(/[:.]/g, '-');
  const nome = `${PREFIXO_DE_BACKUP}${carimbo}`;
  const conteudo = {
    criadoEm: agora(),
    motivo,
    chaves: {
      [CHAVE_V0]: deposito.lerChave ? deposito.lerChave(CHAVE_V0) : null,
      [CHAVE_V1]: deposito.lerChave ? deposito.lerChave(CHAVE_V1) : null,
      [CHAVE_V2]: deposito.ler(),
    },
  };
  const gravou = deposito.gravarChave ? deposito.gravarChave(nome, conteudo) : false;
  if (!gravou) return null;
  limparBackupsAntigos(deposito);
  return nome;
}

export function backups(deposito = depositoAtual()) {
  if (!deposito.chaves) return [];
  return deposito.chaves().filter((c) => c.startsWith(PREFIXO_DE_BACKUP)).sort();
}

function limparBackupsAntigos(deposito) {
  const lista = backups(deposito);
  if (lista.length <= MAXIMO_DE_BACKUPS || !deposito.removerChave) return;
  for (const velho of lista.slice(0, lista.length - MAXIMO_DE_BACKUPS)) deposito.removerChave(velho);
}

// Desfaz a migração: devolve as chaves ao estado guardado na cópia de
// segurança e remove o estado do V2. Na próxima abertura o aplicativo
// encontra os dados como estavam e migra de novo, do zero.
export function rollback(deposito = depositoAtual(), nome = null) {
  const alvo = nome || backups(deposito).pop();
  if (!alvo || !deposito.lerChave) return { restaurado: false, motivo: 'Nenhuma cópia de segurança encontrada.' };
  const copia = deposito.lerChave(alvo);
  if (!copia || !copia.chaves) return { restaurado: false, motivo: `A cópia "${alvo}" está ilegível.` };

  for (const [chave, valor] of Object.entries(copia.chaves)) {
    if (valor === null || valor === undefined) {
      if (deposito.removerChave) deposito.removerChave(chave);
    } else if (deposito.gravarChave) {
      deposito.gravarChave(chave, valor);
    }
  }
  return { restaurado: true, backup: alvo, criadoEm: copia.criadoEm };
}

// ----------------------------------------------------- de onde vêm os dados

// A versão mais antiga de todas guardava um único aluno sem cadastro. Ela é
// convertida para a forma do V1 e daí segue o mesmo caminho.
function v0ComoV1(antigo) {
  if (!antigo || !antigo.aluno || !antigo.aluno.nome) return null;
  const id = novoId('u');
  return {
    versao: 2,
    admin: null,
    usuarios: [{
      id, nome: antigo.aluno.nome, instrumento: '', exigeSenha: false, sal: id, senhaHash: null,
      criadoEm: antigo.aluno.criadoEm || agora(),
    }],
    progressos: {
      [id]: {
        fases: antigo.fases || {},
        usadas: antigo.usadas || {},
        certificados: antigo.certificados || [],
        xp: antigo.xp || 0,
      },
    },
    config: { autocadastro: true },
    sessao: null,
  };
}

export function origemDosDados(deposito = depositoAtual()) {
  if (!deposito.lerChave) return null;
  const v1 = deposito.lerChave(CHAVE_V1);
  if (v1 && typeof v1 === 'object') return { chave: CHAVE_V1, dados: v1 };
  const v0 = v0ComoV1(deposito.lerChave(CHAVE_V0));
  if (v0) return { chave: CHAVE_V0, dados: v0 };
  return null;
}

// ------------------------------------------------------- V1 -> V2 (conversão)

// Converte o conteúdo do V1 em registros das entidades do V2. Função pura:
// recebe os dados antigos, devolve o estado novo. Não toca no depósito, o que
// a torna fácil de testar e impossível de corromper dados por engano.
export function converterV1(dadosV1, { instrumentos = [] } = {}) {
  const estado = { ...estadoVazio(), ...semear() };
  const antigo = dadosV1 || {};
  const catalogo = instrumentos.length ? instrumentos : estado.instrumentos;

  // Acesso do instrutor. O resumo da senha vem inteiro do V1: quem já trocou
  // a senha continua entrando com a que trocou.
  if (antigo.admin && antigo.admin.usuario) {
    estado.usuarios.push(normalizeUsuario({
      id: 'admin',
      login: antigo.admin.usuario,
      papel: 'ADMIN',
      sal: antigo.admin.sal || 'admin',
      senhaHash: antigo.admin.senhaHash || null,
      exigeSenha: true,
      alunoId: null,
      ativo: true,
      criadoEm: antigo.admin.criadoEm || agora(),
    }));
  }

  const progressosAntigos = antigo.progressos && typeof antigo.progressos === 'object' ? antigo.progressos : {};

  for (const bruto of Array.isArray(antigo.usuarios) ? antigo.usuarios : []) {
    if (!bruto || !bruto.id) continue;
    const p = progressosAntigos[bruto.id] || {};

    // A ficha pedagógica.
    estado.alunos.push(normalizeAluno({
      ...bruto,
      // O total de pontos do V1 não é dividido por fase; ele é preservado
      // inteiro como histórico, e a partir daqui os pontos novos são
      // contados na fase em que forem ganhos. A soma não muda.
      xpHistorico: Number(p.xp) || 0,
    }, { instrumentos: catalogo }));

    // O acesso, separado da ficha.
    estado.usuarios.push(normalizeUsuario({
      id: idDoAcesso(bruto.id),
      login: bruto.nome,
      papel: 'ALUNO',
      sal: bruto.sal || bruto.id,
      senhaHash: bruto.senhaHash || null,
      exigeSenha: Boolean(bruto.exigeSenha && bruto.senhaHash),
      alunoId: bruto.id,
      ativo: true,
      criadoEm: bruto.criadoEm || agora(),
    }));

    const fases = p.fases && typeof p.fases === 'object' ? p.fases : {};
    const usadas = p.usadas && typeof p.usadas === 'object' ? p.usadas : {};
    const faseIds = new Set([...Object.keys(fases), ...Object.keys(usadas)]);

    for (const faseId of faseIds) {
      const f = fases[faseId] || {};
      estado.progressos.push(normalizeProgresso({
        id: idDoProgresso(bruto.id, faseId),
        alunoId: bruto.id,
        faseId,
        licoesLidas: f.licoesLidas,
        jogos: f.jogos,
        usadas: usadas[faseId] || [],
        melhorNota: f.melhorNota,
        aprovadoEm: f.aprovadoEm,
        xp: 0,
        atualizadoEm: f.aprovadoEm || null,
      }));

      for (const tentativa of Array.isArray(f.tentativas) ? f.tentativas : []) {
        estado.resultados.push(normalizeResultado({
          ...tentativa,
          id: novoId('r'),
          alunoId: bruto.id,
          faseId,
          avaliacaoId: `av-${faseId}`,
        }));
      }
    }

    for (const certificado of Array.isArray(p.certificados) ? p.certificados : []) {
      const faseId = String(certificado.faseId || certificado.fase || '');
      estado.certificados.push(normalizeCertificado({
        ...certificado,
        id: idDoCertificado(bruto.id, faseId),
        alunoId: bruto.id,
        faseId,
      }));
    }
  }

  // Configurações.
  const config = antigo.config && typeof antigo.config === 'object' ? antigo.config : {};
  estado.configuracoes = Object.entries({ autocadastro: config.autocadastro !== false, ...config })
    .map(([chave, valor]) => ({ chave, valor }));

  // Sessão aberta: quem estava dentro continua dentro.
  if (antigo.sessao && antigo.sessao.tipo === 'admin') {
    estado.sessao = { usuarioId: 'admin', papel: 'ADMIN', alunoId: null };
  } else if (antigo.sessao && antigo.sessao.tipo === 'aluno' && antigo.sessao.id) {
    estado.sessao = { usuarioId: idDoAcesso(antigo.sessao.id), papel: 'ALUNO', alunoId: antigo.sessao.id };
  }

  return estado;
}

// --------------------------------------------------------- a migração em si

// Devolve o estado do V2 pronto para uso, migrando se for preciso.
// `migrado` diz se esta chamada converteu alguma coisa.
export function migrarDadosV1ParaV2(deposito = depositoAtual()) {
  const atual = deposito.ler();

  // Já migrado: nada a fazer. Este é o guarda que faz a migração rodar uma
  // única vez, por mais vezes que o aplicativo seja aberto.
  if (atual && atual.migracao && Number(atual.migracao.versao) >= VERSAO_DA_MIGRACAO) {
    return { estado: completarEstado(atual), migrado: false, backup: null };
  }

  const origem = origemDosDados(deposito);

  // Instalação nova, sem nada para migrar: começa com o catálogo semeado.
  if (!origem && !atual) {
    const estado = garantirAdmin({ ...estadoVazio(), ...semear() });
    estado.migracao = { versao: VERSAO_DA_MIGRACAO, migradoEm: agora(), origem: null, backup: null, registros: 0 };
    deposito.gravar(estado);
    return { estado, migrado: false, backup: null };
  }

  // Estado do V2 gravado por uma versão anterior do próprio V2: só carimba a
  // versão da migração, sem converter nada de novo.
  if (!origem && atual) {
    const estado = completarEstado(atual);
    estado.migracao = { ...(estado.migracao || {}), versao: VERSAO_DA_MIGRACAO, migradoEm: agora() };
    deposito.gravar(estado);
    return { estado, migrado: false, backup: null };
  }

  const backup = criarBackupAutomatico(deposito, 'migracao-v1-v2');
  const estado = garantirAdmin(converterV1(origem.dados));
  const registros = estado.alunos.length + estado.progressos.length + estado.resultados.length + estado.certificados.length;
  estado.migracao = {
    versao: VERSAO_DA_MIGRACAO,
    migradoEm: agora(),
    origem: origem.chave,
    backup,
    registros,
  };

  const gravou = deposito.gravar(estado);
  if (!gravou) {
    // Não conseguiu gravar (aparelho sem espaço, por exemplo): o V1 continua
    // intacto e o aplicativo roda esta sessão com o estado convertido em
    // memória, sem perder nada do que já estava guardado.
    console.warn('A migração foi feita em memória: não foi possível gravar no aparelho.');
  }
  return { estado, migrado: true, backup };
}

// A chave antiga NUNCA é apagada pela migração. Quem quiser liberar espaço
// depois de conferir que está tudo certo chama esta função de propósito.
export function descartarDadosAntigos(deposito = depositoAtual()) {
  if (!deposito.removerChave) return false;
  deposito.removerChave(CHAVE_V1);
  deposito.removerChave(CHAVE_V0);
  return true;
}
