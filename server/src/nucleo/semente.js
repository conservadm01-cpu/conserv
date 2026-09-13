import bcrypt from 'bcryptjs';
import { getDb } from './db.js';
import { novoId, proximoCodigo } from './codigos.js';

/**
 * Estado inicial do núcleo: o que a fábrica precisa ter antes da primeira
 * importação. Idempotente — rodar de novo não duplica nem sobrescreve.
 */

/** Perfis do §36, com o alcance de cada um por módulo. */
const PERFIS = [
  ['ADMINISTRADOR', 'Administrador', 'Vê e altera tudo, inclusive permissões.'],
  ['DIRETOR', 'Diretor', 'Vê tudo; altera o que é de gestão.'],
  ['COMERCIAL', 'Comercial', 'Funil, orçamento e pedido.'],
  ['VENDEDOR', 'Vendedor', 'Os próprios clientes e pedidos.'],
  ['PCP', 'PCP', 'Planeja e libera a produção.'],
  ['CORTE', 'Corte', 'Aponta a produção do corte.'],
  ['SILK', 'Silk', 'Aponta a produção do silk.'],
  ['COSTURA', 'Costura', 'Aponta a produção da costura.'],
  ['EMBALAGEM', 'Embalagem', 'Aponta a produção da embalagem.'],
  ['ESTOQUE', 'Estoque', 'Movimenta o almoxarifado.'],
  ['COMPRAS', 'Compras', 'Requisita, cota e compra.'],
  ['FINANCEIRO', 'Financeiro', 'Contas a pagar e a receber.'],
  ['QUALIDADE', 'Qualidade', 'Inspeciona e registra defeito.'],
  ['EXPEDICAO', 'Expedição', 'Romaneio e entrega.'],
];

const MODULOS = [
  'DASHBOARD', 'COMERCIAL', 'CLIENTES', 'PRODUTOS', 'ENGENHARIA', 'MATERIAIS', 'ESTOQUE',
  'COMPRAS', 'PCP', 'PRODUCAO', 'QUALIDADE', 'EXPEDICAO', 'FINANCEIRO', 'RELATORIOS',
  'BI', 'CONFIGURACOES',
];

const TODOS = ['VISUALIZAR', 'CRIAR', 'EDITAR', 'EXCLUIR', 'APROVAR', 'EXPORTAR'];
const VER = ['VISUALIZAR'];
const OPERAR = ['VISUALIZAR', 'CRIAR', 'EDITAR'];

/** O que cada perfil alcança. O que não está aqui, não vê. */
const ALCANCE = {
  ADMINISTRADOR: Object.fromEntries(MODULOS.map((m) => [m, TODOS])),
  DIRETOR: Object.fromEntries(MODULOS.map((m) => [m, [...VER, 'APROVAR', 'EXPORTAR']])),
  COMERCIAL: { DASHBOARD: VER, COMERCIAL: TODOS, CLIENTES: OPERAR, PRODUTOS: VER,
               PCP: VER, PRODUCAO: VER, RELATORIOS: VER },
  VENDEDOR: { DASHBOARD: VER, COMERCIAL: OPERAR, CLIENTES: OPERAR, PRODUTOS: VER, PRODUCAO: VER },
  PCP: { DASHBOARD: VER, COMERCIAL: VER, PRODUTOS: VER, ENGENHARIA: VER, MATERIAIS: VER,
         ESTOQUE: VER, COMPRAS: OPERAR, PCP: TODOS, PRODUCAO: TODOS, QUALIDADE: VER,
         RELATORIOS: VER, BI: VER },
  CORTE: { PRODUCAO: OPERAR, PCP: VER },
  SILK: { PRODUCAO: OPERAR, PCP: VER },
  COSTURA: { PRODUCAO: OPERAR, PCP: VER },
  EMBALAGEM: { PRODUCAO: OPERAR, PCP: VER, EXPEDICAO: VER },
  ESTOQUE: { MATERIAIS: OPERAR, ESTOQUE: TODOS, COMPRAS: VER, PRODUCAO: VER },
  COMPRAS: { MATERIAIS: OPERAR, ESTOQUE: VER, COMPRAS: TODOS, PCP: VER, FINANCEIRO: VER },
  FINANCEIRO: { DASHBOARD: VER, FINANCEIRO: TODOS, COMERCIAL: VER, COMPRAS: VER, RELATORIOS: VER },
  QUALIDADE: { PRODUCAO: VER, QUALIDADE: TODOS, PCP: VER },
  EXPEDICAO: { EXPEDICAO: TODOS, PRODUCAO: VER, COMERCIAL: VER },
};

/**
 * Operações que a Conserv já pratica, com o custo por peça que a planilha
 * revelou: corte e embalagem são fixos em toda peça; silk e costura variam
 * por produto e por isso ficam zerados aqui — quem define é o roteiro.
 */
const OPERACOES = [
  ['CORTE', 'Corte', 'CORTE', 0.25, 1],
  ['SILK', 'Silk', 'SILK', 0, 2],
  ['SUBLIMACAO', 'Sublimação', 'SILK', 0, 2],
  ['DTF', 'DTF', 'SILK', 0, 2],
  ['PREPARACAO', 'Preparação', 'COSTURA', 0, 3],
  ['COSTURA', 'Costura', 'COSTURA', 0, 4],
  ['ACABAMENTO', 'Acabamento', 'COSTURA', 0, 5],
  ['REVISAO', 'Revisão', 'QUALIDADE', 0, 6],
  ['EMBALAGEM', 'Embalagem', 'EMBALAGEM', 0.5, 7],
];

const CENTROS = [
  ['CORTE', 'Corte', 1],
  ['SILK', 'Silk e estamparia', 1],
  ['COSTURA', 'Costura', 1],
  ['QUALIDADE', 'Qualidade', 1],
  ['EMBALAGEM', 'Embalagem', 1],
  ['ALMOX', 'Almoxarifado', 0],
  ['ADM', 'Administrativo', 0],
];

const LOCAIS = [
  ['ALMOX', 'Almoxarifado', 'ALMOXARIFADO'],
  ['TECIDO', 'Tecidos', 'ALMOXARIFADO'],
  ['AVIAM', 'Aviamentos', 'ALMOXARIFADO'],
  ['PROC-CORTE', 'Em processo — corte', 'PROCESSO'],
  ['PROC-COST', 'Em processo — costura', 'PROCESSO'],
  ['EXPED', 'Expedição', 'EXPEDICAO'],
  ['REFUGO', 'Refugo', 'REFUGO'],
];

const GRUPOS_MATERIAL = [
  ['TEC', 'Tecido'], ['AVI', 'Aviamento'], ['INS', 'Insumo'], ['EMB', 'Embalagem'],
];

const LINHAS = [['LEVE', 'Leve'], ['PESADA', 'Pesada'], ['AMBAS', 'Ambas']];

const DEFEITOS = [
  ['COST-FALHA', 'Falha de costura', 'COSTURA', 'ALTA'],
  ['COST-PONTO', 'Ponto solto', 'COSTURA', 'MEDIA'],
  ['TEC-FURO', 'Furo no tecido', 'TECIDO', 'ALTA'],
  ['TEC-MANCHA', 'Mancha', 'TECIDO', 'MEDIA'],
  ['EST-DESAL', 'Estampa desalinhada', 'ESTAMPA', 'ALTA'],
  ['EST-FALHA', 'Falha na estampa', 'ESTAMPA', 'MEDIA'],
  ['MED-FORA', 'Medida fora do padrão', 'MEDIDA', 'ALTA'],
];

const CATEGORIAS = [
  ['VENDA', 'Venda de produção', 'RECEBER', 'Receita'],
  ['SERVICO', 'Prestação de serviço', 'RECEBER', 'Receita'],
  ['MATERIA', 'Matéria-prima', 'PAGAR', 'Custo variável'],
  ['ALUGUEL', 'Aluguel e condomínio', 'PAGAR', 'Estrutura'],
  ['ENERGIA', 'Energia, água e internet', 'PAGAR', 'Estrutura'],
  ['FOLHA', 'Folha de pagamento', 'PAGAR', 'Pessoal'],
  ['MANUT', 'Manutenção de máquinas', 'PAGAR', 'Estrutura'],
  ['IMPOSTO', 'Impostos', 'PAGAR', 'Tributos'],
  ['OUTRAS', 'Outras despesas', 'PAGAR', 'Estrutura'],
];

const inserir = (db, tabela, dados) => {
  const campos = Object.keys(dados);
  db.prepare(
    `INSERT INTO ${tabela} (${campos.join(', ')}) VALUES (${campos.map((c) => `@${c}`).join(', ')})`
  ).run(dados);
};

const existe = (db, tabela, campo, valor) =>
  db.prepare(`SELECT id FROM ${tabela} WHERE ${campo} = ?`).get(valor);

export function semear(db = getDb(), { senhaAdmin = 'conserv123' } = {}) {
  const feito = { perfis: 0, permissoes: 0, centros: 0, operacoes: 0, locais: 0, outros: 0 };

  db.transaction(() => {
    if (!db.prepare(`SELECT id FROM parametros LIMIT 1`).get()) {
      inserir(db, 'parametros', { id: novoId() });
    }

    for (const [codigo, nome, descricao] of PERFIS) {
      if (existe(db, 'perfis', 'codigo', codigo)) continue;
      const id = novoId();
      inserir(db, 'perfis', { id, codigo, nome, descricao, sistema: 1 });
      feito.perfis += 1;
      for (const [modulo, verbos] of Object.entries(ALCANCE[codigo] ?? {})) {
        for (const verbo of verbos) {
          inserir(db, 'permissoes', { id: novoId(), perfil_id: id, modulo, verbo });
          feito.permissoes += 1;
        }
      }
    }

    for (const [codigo, nome, produtivo] of CENTROS) {
      if (existe(db, 'centros_trabalho', 'codigo', codigo)) continue;
      inserir(db, 'centros_trabalho', { id: novoId(), codigo, nome, produtivo });
      feito.centros += 1;
    }

    for (const [codigo, nome, centro, custoPeca, ordem] of OPERACOES) {
      if (existe(db, 'operacoes', 'codigo', codigo)) continue;
      const c = db.prepare(`SELECT id FROM centros_trabalho WHERE codigo = ?`).get(centro);
      inserir(db, 'operacoes', {
        id: novoId(), codigo, nome, centro_id: c?.id ?? null,
        custo_por_peca: custoPeca, ordem_padrao: ordem,
      });
      feito.operacoes += 1;
    }

    for (const [codigo, nome, tipo] of LOCAIS) {
      if (existe(db, 'locais_estoque', 'codigo', codigo)) continue;
      inserir(db, 'locais_estoque', { id: novoId(), codigo, nome, tipo });
      feito.locais += 1;
    }

    for (const [tabela, linhas, colunas] of [
      ['grupos_material', GRUPOS_MATERIAL, (l) => ({ codigo: l[0], nome: l[1] })],
      ['linhas_produto', LINHAS, (l) => ({ codigo: l[0], nome: l[1] })],
      ['tipos_defeito', DEFEITOS, (l) => ({ codigo: l[0], nome: l[1], categoria: l[2], gravidade: l[3] })],
      ['categorias_financeiras', CATEGORIAS, (l) => ({ codigo: l[0], nome: l[1], tipo: l[2], grupo: l[3] })],
    ]) {
      for (const linha of linhas) {
        if (existe(db, tabela, 'codigo', linha[0])) continue;
        inserir(db, tabela, { id: novoId(), ...colunas(linha) });
        feito.outros += 1;
      }
    }

    if (!db.prepare(`SELECT id FROM usuarios LIMIT 1`).get()) {
      const perfil = db.prepare(`SELECT id FROM perfis WHERE codigo = 'ADMINISTRADOR'`).get();
      inserir(db, 'usuarios', {
        id: novoId(),
        codigo: proximoCodigo('usuario', { db }),
        nome: 'Administrador',
        email: 'admin@conserv.com.br',
        senha_hash: bcrypt.hashSync(senhaAdmin, 10),
        perfil_id: perfil.id,
      });
      feito.outros += 1;
    }
  })();

  return feito;
}
