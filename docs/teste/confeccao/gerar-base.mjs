/**
 * Monta a base de teste do Confecção ERP.
 *
 *   node docs/teste/confeccao/gerar-base.mjs <confeccao-erp.html> [saida.json]
 *
 * A base é construída chamando o motor do próprio protótipo (ver motor.mjs):
 * cada entrada de estoque passa por `aplicarMovimento`, cada ordem por
 * `criarOrdem`, cada apontamento por `apontarProducao`. O que sai daqui é um
 * estado que o sistema aceitaria ter produzido sozinho — e não um JSON
 * montado à mão que quebra na primeira conferência de saldo.
 *
 * Senha de todos os usuários: `teste123`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { carregarMotor } from './motor.mjs';
import {
  COLABORADORES, EQUIPAMENTOS, FORNECEDORES, CLIENTES, MATERIAIS, PRODUTOS,
  ORDENS, CUSTOS_FIXOS, MANIFESTACOES, VAGAS, INDICACOES, OCORRENCIAS, CLIMA,
} from './dados.mjs';

const SENHA_PADRAO = 'teste123';

const htmlProtótipo = process.argv[2];
const saida = process.argv[3]
  || path.join(path.dirname(new URL(import.meta.url).pathname), 'base-teste.json');

if (!htmlProtótipo) {
  console.error('uso: node docs/teste/confeccao/gerar-base.mjs <confeccao-erp.html> [saida.json]');
  process.exit(1);
}

const api = carregarMotor(htmlProtótipo);
const { uid, num, normaliza } = api;

/* ------------------------------------------------------------- datas
   Tudo é relativo ao dia da geração: a base nasce sempre "de hoje",
   com ordem atrasada, ordem em dia e apontamento da semana passada. */

const HOJE = new Date(`${api.todayISO()}T00:00:00`);
const dia = (offset) => {
  const d = new Date(HOJE);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
/* dia útil mais próximo, andando para trás: fábrica não aponta no domingo */
const diaUtil = (offset) => {
  const d = new Date(`${dia(offset)}T00:00:00`);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};
const instante = (offset, hora = 8, minuto = 0) =>
  `${dia(offset)}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00`;

const erroSe = (r, contexto) => {
  if (r && r.erro) throw new Error(`${contexto}: ${r.erro}`);
  return r;
};

/* ---------------------------------------------------------- a base */

let db = api.migrarJornada(api.semearEngenharia(api.migrarGruposCortaveis(
  api.semearProduto(api.semearMateriais(api.emptyDb())))));

/* o administrador padrão (sem senha) sai: a base de teste traz os seus */
db.colaboradores = [];

const dep = (nome) => (db.departamentos || []).find((x) => normaliza(x.nome) === normaliza(nome));
const etapaDe = (nomeDep, nomeEtapa) => {
  const d = dep(nomeDep);
  const e = (db.etapas || []).find((x) => x.departamentoId === d.id && normaliza(x.nome) === normaliza(nomeEtapa));
  if (!e) throw new Error(`Etapa "${nomeEtapa}" não existe em ${nomeDep}.`);
  return e;
};
const material = (nome) => {
  const m = (db.materiais || []).find((x) => x.nome === nome);
  if (!m) throw new Error(`Material "${nome}" não cadastrado.`);
  return m;
};
const estoquePadrao = db.estoques[0];
const centroCusto = (nome) => (db.centrosCusto || []).find((c) => normaliza(c.nome) === normaliza(nome));

/* ------------------------------------------------------- 1. pessoas */

for (const eq of EQUIPAMENTOS) {
  const d = eq.departamento ? dep(eq.departamento) : null;
  db.equipamentos.push({
    id: uid(),
    codigo: api.proximoCodigo(db.equipamentos, 'EQP'),
    nome: eq.nome,
    tipo: eq.tipo,
    departamentoId: d ? d.id : '',
    marca: eq.marca || '',
    modelo: '',
    serie: '',
    patrimonio: eq.patrimonio || '',
    situacao: 'operando',
    aquisicao: '',
    fornecedorId: '',
    localizacao: d ? d.nome : '',
    observacao: '',
    ativo: true,
    criadoEm: api.agoraISO(),
  });
}
const equipamento = (nome) => {
  const e = (db.equipamentos || []).find((x) => x.nome === nome);
  if (!e) throw new Error(`Equipamento "${nome}" não cadastrado.`);
  return e;
};

for (const c of COLABORADORES) {
  const d = c.departamento ? dep(c.departamento) : null;
  const base = {
    id: uid(),
    nome: c.nome,
    cpf: '', rg: '', dataNascimento: '',
    telefone: '', celular: '', email: '',
    cargo: '',
    funcoes: c.funcoes,
    departamentoId: d ? d.id : '',
    dataAdmissao: dia(c.admissao || -365),
    salario: c.salario,
    status: 'Ativo',
    perfil: c.perfil || 'Colaborador',
    produtivo: c.produtivo !== false,
    /* vale-transporte entra no custo do minuto */
    usaConducao: c.produtivo !== false,
    conducoesDia: 2,
    valorConducao: 5.2,
    diasConducao: 22,
    equipamentos: (c.maquinas || []).map((m) => equipamento(m).id),
    cep: '', endereco: '', numero: '', complemento: '', bairro: '',
    cidade: 'Piracicaba', uf: 'SP',
    observacoes: '',
    tentativasFalhas: 0,
    bloqueadoAte: null,
  };
  db.colaboradores.push(await api.definirSenha(base, SENHA_PADRAO));
}
const colaborador = (nome) => {
  const c = (db.colaboradores || []).find((x) => x.nome === nome);
  if (!c) throw new Error(`Colaborador "${nome}" não cadastrado.`);
  return c;
};
const admin = colaborador('Ana Paula Ribeiro');
const supervisor = colaborador('Marcos Andrade');
const pcp = colaborador('Helena Vasques');
const usuario = (c) => ({ nome: c.nome, perfil: c.perfil });

/* quem trabalha em cada setor, para distribuir o apontamento */
const equipeDe = (departamentoId) =>
  (db.colaboradores || []).filter((c) => c.departamentoId === departamentoId && c.status !== 'Inativo');

/* ------------------------------------------- 2. cadastros comerciais */

for (const f of FORNECEDORES) {
  db.fornecedores.push({
    id: uid(),
    codigo: api.proximoCodigo(db.fornecedores, 'FOR'),
    nome: f.nome,
    nomeFantasia: f.fantasia || '',
    documento: f.documento || '',
    ie: '', telefone: f.telefone || '', celular: '',
    contato: f.contato || '', email: '',
    categoria: f.categoria || '',
    condicaoPagamento: f.condicaoPagamento || '',
    tipoFornecimento: f.tipoFornecimento || 'Material',
    servicos: f.servicos || [],
    valorPecaPadrao: f.valorPecaPadrao || 0,
    cep: '', endereco: '', numero: '', complemento: '', bairro: '',
    cidade: f.cidade || '', uf: f.uf || '',
    observacoes: '',
    ativo: true,
  });
}
const fornecedor = (fantasia) => {
  const f = (db.fornecedores || []).find((x) => x.nomeFantasia === fantasia);
  if (!f) throw new Error(`Fornecedor "${fantasia}" não cadastrado.`);
  return f;
};

for (const c of CLIENTES) {
  db.clientes.push({
    id: uid(),
    codigo: api.proximoCodigo(db.clientes, 'CLI'),
    tipo: 'PJ',
    nome: c.nome,
    nomeFantasia: c.fantasia || '',
    documento: c.documento || '',
    ie: '', indicadorIE: 'Contribuinte',
    telefone: c.telefone || '', celular: '',
    responsavel: c.responsavel || '',
    email: c.email || '',
    cep: '', endereco: '', numero: '', complemento: '', bairro: '',
    cidade: c.cidade || '', uf: c.uf || '',
    observacoes: '',
    ativo: true,
  });
}
const cliente = (fantasia) => {
  const c = (db.clientes || []).find((x) => x.nomeFantasia === fantasia);
  if (!c) throw new Error(`Cliente "${fantasia}" não cadastrado.`);
  return c;
};

/* ----------------------------------------- 3. parâmetros e custo fixo */

db.parametrosMaoDeObra = { encargos: 80, diasUteis: 22 };
db.parametrosCustoIndireto = { diasUteis: 22, ocupacao: 78 };
db.parametrosFila = { horasEntreSetores: 4 };

for (const cf of CUSTOS_FIXOS) erroSe(api.salvarCustoFixo(db, cf, usuario(admin)), `custo fixo ${cf.nome}`);

/* --------------------------------- 4. materiais e carga do estoque */

for (const m of MATERIAIS) {
  const [nomeGrupo, nomeSub] = m.grupo.split('>').map((x) => x.trim());
  const pai = db.gruposMaterial.find((g) => !g.paiId && normaliza(g.nome) === normaliza(nomeGrupo));
  const sub = db.gruposMaterial.find((g) => g.paiId === (pai || {}).id && normaliza(g.nome) === normaliza(nomeSub));
  if (!sub) throw new Error(`Grupo "${m.grupo}" não existe no cadastro padrão.`);
  db.materiais.push({
    id: uid(),
    codigo: api.proximoCodigo(db.materiais, 'MAT', 5),
    nome: m.nome,
    descricao: '', sku: '', codigoBarras: '',
    grupoId: sub.id,
    marca: '', modelo: '',
    cor: m.cor || '', pantone: '', tamanho: '',
    composicao: m.composicao || '',
    gramatura: m.gramatura || '',
    largura: m.largura || '',
    espessura: '', rendimento: '', tipoTecido: '', tubular: '',
    unidadeEstoque: m.unidade,
    unidadeCompra: m.unidade,
    unidadeConsumo: m.unidade,
    estoqueMinimo: m.minimo,
    estoqueMaximo: Math.max(m.minimo * 6, Math.round(m.entrada * 1.15)),
    pontoReposicao: Math.round(m.minimo * 1.3),
    leadTimeDias: 10,
    custoMedio: m.custo,
    ultimoCusto: m.custo,
    precoCompra: m.custo,
    fornecedorPadraoId: fornecedor(m.fornecedor).id,
    precoValidade: dia(60),
    controlaLote: false,
    controlaValidade: false,
    localizacao: m.localizacao || '',
    observacoes: '',
    ativo: true,
    criadoEm: api.agoraISO(),
  });
}

/* a nota de compra que encheu o almoxarifado, há um mês */
for (const m of MATERIAIS) {
  const mat = material(m.nome);
  erroSe(api.aplicarMovimento(db, {
    materialId: mat.id,
    estoqueId: estoquePadrao.id,
    tipo: 'entrada_compra',
    quantidade: m.entrada,
    custoUnitario: m.custo,
    fornecedorId: fornecedor(m.fornecedor).id,
    origemTipo: 'recebimento',
    documento: `NF ${10000 + MATERIAIS.indexOf(m)}`,
    observacao: 'Carga inicial da base de teste.',
  }, usuario(colaborador('Roberto Antunes'))), `entrada de ${m.nome}`);
}

/* ------------------------------------------------------ 5. produtos */

for (const p of PRODUTOS) {
  const grupo = db.gruposProduto.find((g) => normaliza(g.nome) === normaliza(p.grupo));
  const tipo = db.tiposProduto.find((t) => normaliza(t.nome) === normaliza(p.tipo));
  const tecidos = p.tecidos.map(([nome, consumo]) => ({
    id: uid(),
    materialId: material(nome).id,
    quantidade: consumo,
    riscoId: '',
    observacao: '',
  }));
  const porMaterial = (nome) => {
    const mat = material(nome);
    const t = tecidos.find((x) => x.materialId === mat.id);
    return t ? t.id : null;
  };
  const processo = p.processo.map(([nomeDep, nomeEtapa, tempo, modo, pessoas, materiais], i) => {
    const d = dep(nomeDep);
    const e = etapaDe(nomeDep, nomeEtapa);
    return {
      id: uid(),
      ordem: i + 1,
      departamentoId: d.id,
      etapaId: e.id,
      modo,
      pessoas,
      tempo,
      unidadeTempo: 'min',
      equipamentos: [],
      materiais: (materiais || []).map(porMaterial).filter(Boolean),
      subprodutos: [],
      anexos: [],
      origemTempo: 'estimado',
    };
  });
  const produto = {
    id: uid(),
    codigo: api.proximoCodigo(db.produtos, 'PRD'),
    grupoId: grupo ? grupo.id : '',
    tipoId: tipo ? tipo.id : '',
    complemento: p.complemento || '',
    medida: p.medida,
    tecidos,
    processo,
    preco: p.preco,
    ficha: { observacao: p.observacao || '' },
    status: 'rascunho',
    ativo: true,
    criadoEm: api.agoraISO(),
  };
  produto.nome = api.montarNomeProduto(produto, db);
  db.produtos.push(produto);

  /* o caminho que o produto faz de verdade: rascunho → desenvolvimento →
     (validação → liberado), com a engenharia congelada no fim */
  erroSe(api.mudarStatusProduto(db, produto.id, 'desenvolvimento', '', usuario(pcp)), `status de ${produto.nome}`);
  if (p.status === 'liberado') {
    erroSe(api.mudarStatusProduto(db, produto.id, 'validacao', '', usuario(pcp)), `status de ${produto.nome}`);
    erroSe(api.mudarStatusProduto(db, produto.id, 'liberado', '', usuario(supervisor)), `liberação de ${produto.nome}`);
  }
  erroSe(api.congelarVersao(db, produto.id, { motivo: '' }, usuario(pcp)), `versão de ${produto.nome}`);
}
const produtoPorIndice = (i) => db.produtos[i];

/* ------------------------------------- 6. ordens, material e chão de fábrica */

/* a máquina certa para a etapa: a primeira do setor que alguém saiba operar */
function maquinaDoSetor(departamentoId) {
  const lista = (db.equipamentos || []).filter((e) => e.departamentoId === departamentoId && e.tipo === 'maquina');
  return lista.length ? lista[0] : null;
}

for (const o of ORDENS) {
  const produto = produtoPorIndice(o.produto);
  const r = erroSe(api.criarOrdem(db, {
    produtoId: produto.id,
    quantidade: o.quantidade,
    clienteId: cliente(o.cliente).id,
    entrega: dia(o.entrega),
    prioridade: o.prioridade,
    observacao: o.observacao || '',
    amostra: !!o.amostra,
  }, usuario(pcp)), `ordem de ${produto.nome}`);
  const ordem = r.ordem;
  ordem.criadoEm = instante(o.abertura, 7, 30);

  /* quem vai fazer e em que máquina — designação que o PCP faria */
  for (const t of ordem.tarefas) {
    const equipe = equipeDe(t.departamentoId);
    if (equipe.length) t.colaboradorIds = [equipe[ORDENS.indexOf(o) % equipe.length].id];
    const maq = maquinaDoSetor(t.departamentoId);
    if (maq && !t.equipamentoId) t.equipamentoId = maq.id;
  }

  /* material sai do almoxarifado quando o corte começa */
  const iniciou = (o.avanco || []).some((x) => x > 0);
  if (iniciou) {
    const fracao = o.avanco[0];
    for (const t of produto.tecidos) {
      const mat = (db.materiais || []).find((x) => x.id === t.materialId);
      const qtd = Number((num(t.quantidade) * o.quantidade * fracao).toFixed(3));
      if (!(qtd > 0)) continue;
      erroSe(api.aplicarMovimento(db, {
        materialId: mat.id,
        estoqueId: estoquePadrao.id,
        tipo: 'saida_producao',
        quantidade: qtd,
        origemTipo: 'op',
        origemId: ordem.id,
        documento: ordem.codigo,
        centroCustoId: (centroCusto('Corte') || {}).id || '',
        observacao: `Baixa de material da ${ordem.codigo}`,
      }, usuario(colaborador('Roberto Antunes'))), `baixa de ${mat.nome} na ${ordem.codigo}`);
    }
  }

  /* o apontamento, etapa por etapa, sem passar do que a anterior entregou:
     peça refugada na costura não aparece do nada na embalagem */
  const ordemCompleta = (o.avanco || []).every((x) => x >= 1);
  let entregueAntes = o.quantidade;
  let ultimoDaOrdem = null;
  ordem.tarefas.forEach((t, i) => {
    const fracao = (o.avanco || [])[i] || 0;
    if (!(fracao > 0)) return;
    const total = Math.min(Math.round(o.quantidade * fracao), entregueAntes);
    if (!(total > 0)) return;
    let boasNaEtapa = 0;
    const equipe = equipeDe(t.departamentoId);
    const quem = equipe.length ? equipe[(i + ORDENS.indexOf(o)) % equipe.length] : supervisor;

    /* o lote é apontado em uma ou duas levas, como acontece na fábrica */
    const levas = total > 200 ? 2 : 1;
    let restante = total;
    for (let k = 0; k < levas; k++) {
      const qtd = k === levas - 1 ? restante : Math.round(total * 0.6);
      restante -= qtd;
      /* a etapa é apontada ao longo da vida da ordem, nunca no futuro:
         o corte na primeira semana, a embalagem perto do fim */
      const vida = Math.max(1, -o.abertura);
      const posicao = (i + (k + 1) / levas) / (ordem.tarefas.length + 1);
      const quando = diaUtil(Math.min(-1, Math.round(o.abertura + posicao * vida)));
      const previsto = Number((num(t.minutosPorPeca) * qtd).toFixed(2));
      /* ninguém bate o tempo padrão exato: a base tem etapa mais rápida e
         etapa mais lenta, que é o que faz a eficiência ter o que mostrar */
      const fator = 0.88 + ((i + ORDENS.indexOf(o)) % 5) * 0.09;
      /* ordem que já fechou saiu inteira: refugo aqui deixaria a última
         etapa sem como entregar a quantidade combinada */
      const defeito = !ordemCompleta && (i + ORDENS.indexOf(o)) % 7 === 0
        ? Math.max(1, Math.round(qtd * 0.006)) : 0;
      const boas = Math.max(qtd - defeito, 0);
      boasNaEtapa += boas;
      const atrasou = fator > 1.15;
      const lancado = erroSe(api.apontarProducao(db, {
        ordemId: ordem.id,
        tarefaId: t.id,
        colaboradorId: quem.id,
        equipamentoId: t.equipamentoId || '',
        data: quando,
        minutosPrevistos: previsto,
        minutosGastos: Math.max(Number((previsto * fator).toFixed(2)), 1),
        pecasBoas: boas,
        pecasDefeito: defeito,
        defeitos: defeito ? [{ tipo: 'Ponto falhado', quantidade: defeito }] : [],
        paradas: atrasou ? [{ motivo: 'Falta de material', minutos: 25 }] : [],
        motivoAtraso: atrasou ? 'Falta de material' : '',
        observacao: '',
      }, usuario(quem)), `apontamento da ${ordem.codigo} · etapa ${i + 1}`);
      ultimoDaOrdem = lancado.apontamento;
    }
    entregueAntes = boasNaEtapa;
  });

  /* algumas ordens tiveram produção hoje — senão o quadro "Hoje" do chão de
     fábrica abre vazio, que é justamente a tela que se quer ver funcionando */
  if (ultimoDaOrdem && ORDENS.indexOf(o) % 3 === 1) ultimoDaOrdem.data = api.todayISO();
}

/* --------------------------------------------------- 7. ocorrências */

for (const oc of OCORRENCIAS) {
  const r = erroSe(api.registrarOcorrencia(db, {
    tipo: oc.tipo,
    data: dia(oc.dias),
    descricao: oc.descricao,
    equipamentoId: oc.maquina ? equipamento(oc.maquina).id : '',
    colaboradorId: oc.colaborador ? colaborador(oc.colaborador).id : '',
    departamentoId: oc.departamento ? dep(oc.departamento).id : '',
    minutosParado: oc.minutos,
  }, usuario(supervisor)), `ocorrência ${oc.tipo}`);
  if (oc.encerrar) erroSe(api.encerrarOcorrencia(db, r.ocorrencia.id, usuario(supervisor)), 'encerrar ocorrência');
}

/* ------------------------------------------- 8. canal do colaborador */

for (const m of MANIFESTACOES) {
  const autor = m.colaborador ? colaborador(m.colaborador) : null;
  const r = erroSe(api.registrarManifestacao(db, {
    categoria: m.categoria,
    departamentoId: m.departamento ? dep(m.departamento).id : '',
    descricao: m.descricao,
    dataOcorrencia: dia(m.dias),
    anonima: !!m.anonima,
    colaboradorId: autor ? autor.id : '',
    nome: autor ? autor.nome : '',
    querRetorno: !m.anonima,
    via: 'sistema',
  }, autor ? usuario(autor) : null), `manifestação ${m.categoria}`);
  const reg = r.manifestacao;
  reg.criadaEm = instante(m.dias, 16, 20);
  if (m.status) {
    erroSe(api.moverManifestacao(db, reg.id, m.status, usuario(supervisor),
      'Recebido pelo RH e encaminhado ao setor responsável.'), 'mover manifestação');
  }
}

for (const [dias, nota, departamento, comentario] of CLIMA) {
  const r = erroSe(api.registrarPesquisaClima(db, {
    nota,
    comentario,
    departamentoId: departamento ? dep(departamento).id : '',
    via: 'canal',
  }), 'pesquisa de clima');
  r.pesquisa.data = dia(dias);
  r.pesquisa.quando = instante(dias, 12, 5);
}

const vagasCriadas = [];
for (const v of VAGAS) {
  const r = erroSe(api.salvarVaga(db, {
    titulo: v.titulo,
    departamentoId: dep(v.departamento).id,
    tipo: v.tipo,
    turno: v.turno,
    vagas: v.vagas,
    descricao: v.descricao,
    requisitos: v.requisitos,
    experiencia: v.experiencia,
    status: 'aberta',
  }, usuario(admin)), `vaga ${v.titulo}`);
  vagasCriadas.push(r.vaga);
}

for (const ind of INDICACOES) {
  const quem = colaborador(ind.indicador);
  erroSe(api.registrarIndicacao(db, {
    vagaId: vagasCriadas[ind.vaga].id,
    nomeCandidato: ind.candidato,
    contato: ind.contato,
    nomeIndicador: quem.nome,
    colaboradorId: quem.id,
    relacao: ind.relacao,
    observacao: ind.observacao,
    avisou: true,
  }, usuario(quem)), `indicação de ${ind.candidato}`);
}

/* ------------------------------------------------- 9. conferências */

const problemas = [];

const divergencias = api.recalcularSaldos(db);
if (divergencias.length) problemas.push(`${divergencias.length} saldo(s) divergente(s) do extrato de movimentações`);

for (const s of db.saldos) {
  if (num(s.fisico) < 0) {
    const m = db.materiais.find((x) => x.id === s.materialId);
    problemas.push(`saldo negativo em ${m ? m.nome : s.materialId}`);
  }
}

for (const o of db.ordens) {
  for (const t of o.tarefas) {
    if (!db.etapas.some((e) => e.id === t.etapaId)) problemas.push(`${o.codigo}: etapa inexistente`);
  }
}
for (const a of db.apontamentos) {
  if (!db.ordens.some((o) => o.id === a.ordemId)) problemas.push('apontamento sem ordem');
  if (!db.colaboradores.some((c) => c.id === a.colaboradorId)) problemas.push('apontamento sem colaborador');
}
for (const c of db.colaboradores) {
  if (!c.senhaHash || !c.senhaSalt) problemas.push(`${c.nome} está sem senha definida`);
}
if (!db.colaboradores.some((c) => c.perfil === 'Administrador' && c.status !== 'Inativo')) {
  problemas.push('a base ficou sem administrador');
}

const json = JSON.stringify(db);
if (json.length > api.LIMITE_BASE_BYTES) {
  problemas.push(`a base tem ${(json.length / 1024 / 1024).toFixed(2)} MB e o sistema recusa acima de `
    + `${(api.LIMITE_BASE_BYTES / 1024 / 1024).toFixed(1)} MB`);
}

if (problemas.length) {
  console.error('\nA base NÃO foi gravada — o motor recusou o resultado:');
  problemas.forEach((p) => console.error(`  • ${p}`));
  process.exit(1);
}

fs.writeFileSync(saida, JSON.stringify(db, null, 1));

/* ---------------------------------------------------------- resumo */

const painel = api.painelProducao(db, {});
const indireto = api.taxaCustoIndireto(db);
const fabrica = api.mediaGeralFabrica(db);
const contar = (k) => (db[k] || []).length;

console.log(`\nBase de teste gravada em ${saida}`);
console.log(`  ${(json.length / 1024).toFixed(0)} KB · app ${api.VERSAO_APP} · chave ${api.STORAGE_KEY}`);
console.log(`  colaboradores ${contar('colaboradores')} · equipamentos ${contar('equipamentos')} · `
  + `clientes ${contar('clientes')} · fornecedores ${contar('fornecedores')}`);
console.log(`  materiais ${contar('materiais')} · movimentações ${contar('movimentacoes')} · `
  + `saldos ${contar('saldos')} · produtos ${contar('produtos')}`);
console.log(`  ordens ${contar('ordens')} · apontamentos ${contar('apontamentos')} · `
  + `ocorrências ${contar('ocorrencias')} · versões ${contar('versoesProduto')}`);
console.log(`  canal ${contar('manifestacoes')} manifestação(ões) · clima ${contar('pesquisasClima')} nota(s) · `
  + `vagas ${contar('vagas')} · indicações ${contar('indicacoes')}`);
console.log(`  produção: ${painel.abertas} ordem(ns) aberta(s), ${painel.emAndamento} em andamento, `
  + `${painel.atrasadas} atrasada(s), ${painel.concluidas} concluída(s)`);
console.log(`  custo do minuto de fábrica: R$ ${fabrica.custoMinuto} (mão de obra) + `
  + `R$ ${indireto.taxaMinuto ?? indireto.porMinuto ?? '—'} (indireto)`);
console.log(`  usuários entram com a senha ${SENHA_PADRAO}\n`);
