/**
 * Empacota o módulo industrial num script clássico, para caber dentro do HTML
 * do sistema.
 *
 * Os arquivos são módulos ES aqui (para o Node testar); no navegador eles
 * viram um único `<script>` sem `import`/`export`, embrulhado num IIFE para
 * não atropelar os nomes do sistema — o módulo tem o seu `num`, o sistema tem
 * o dele. O que sai para fora é só o que a aplicação precisa enxergar:
 * `window.Industrial` e o componente `GrupoIndustrial`.
 */
import fs from 'node:fs';
import path from 'node:path';

const pasta = path.dirname(new URL(import.meta.url).pathname);

/* a ordem importa: quem define vem antes de quem usa */
const ARQUIVOS = [
  'modelo.mjs', 'reservas.mjs', 'compras.mjs', 'integracao.mjs', 'motores.mjs',
  'cadastro.mjs', 'engenharia.mjs', 'ordens.mjs', 'auditoria.mjs', 'demonstracao.mjs',
  'testes-v2.mjs', 'testes-v3.mjs',
  'ordens-sistema.mjs',
  'interface.mjs', 'telas-produtos.mjs', 'telas-compras.mjs',
  'telas-integracao.mjs', 'telas-ordens-sistema.mjs',
];

/** Tira `import ... from '...';` e o prefixo `export` das declarações. */
function paraScriptClassico(codigo) {
  return codigo
    .replace(/^import\s[\s\S]*?from\s+'[^']*';\s*$/gm, '')
    .replace(/^export\s+(function|const|let|class)\s/gm, '$1 ')
    .replace(/^export\s*\{[^}]*\};\s*$/gm, '');
}

/**
 * Os quatro arquivos viram um escopo só. Nome declarado duas vezes derruba o
 * script inteiro — e sem o script o sistema nem abre. Conferir aqui é o que
 * transforma esse erro numa mensagem em vez de numa tela branca.
 */
function conferirNomes(codigos) {
  const padrao = /^(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
  const vistos = new Map();
  const repetidos = [];
  for (const [arquivo, codigo] of codigos) {
    for (const achado of codigo.matchAll(padrao)) {
      const nome = achado[1];
      if (vistos.has(nome)) repetidos.push(`${nome} (${vistos.get(nome)} e ${arquivo})`);
      else vistos.set(nome, arquivo);
    }
  }
  if (repetidos.length) {
    throw new Error(`o módulo industrial declara o mesmo nome duas vezes: ${repetidos.join(', ')}`);
  }
}

export function empacotarIndustrial() {
  const codigos = ARQUIVOS.map((arquivo) =>
    [arquivo, paraScriptClassico(fs.readFileSync(path.join(pasta, arquivo), 'utf8'))]);
  conferirNomes(codigos);
  const partes = codigos.map(([arquivo, codigo]) =>
    `/* ---------------------------------------------- ${arquivo} */\n${codigo}`);

  return `<script>
/* ==========================================================
   MÓDULO INDUSTRIAL — budget, MRP e PCP por carteira
   Gerado por industrial/empacotar.mjs — não editar aqui.
========================================================== */
(function () {
${partes.join('\n')}

  /* o que o sistema enxerga do módulo */
  window.Industrial = {
    preparar: prepararIndustrial,
    /* a carga do sistema chama isto: prepara as coleções e migra para a V2,
       devolvendo a própria base para a cadeia de semeadura continuar */
    carregar: (base) => { prepararIndustrial(base); migrarIndustrialV3(base); return base; },
    montarDemonstracao,
    consolidarCarteira, explodirBOM, calcularMRP, calcularCapacidade, calcularBudget,
    planoDeProducao, executarTransformacao, liberarParaCostura, wipDaCarteira,
    realizadoVersusBudget, custoAcumulado, rastrear, simular,
    recalcularEstoquesProcesso,
    /* cadastro de produto */
    salvarItem, salvarEstrutura, salvarTransformacao, inativarItem, inativarTransformacao,
    conferirEngenharia, custoPadrao, arvoreDoProduto, clonarProduto,
    /* ordens de produção */
    abrirOrdem, resumoDaOrdem, ordensDeProducao, cancelarOrdem, encerrarOrdem,
    conferirComponentes, materiaisDaOrdem, capacidadeDaOrdem,
    /* V2: reserva, compras, custo, auditoria e testes */
    migrarIndustrialV2,
    reservarMaterial, cancelarReserva, consumoDaReserva, saldoReservado,
    disponivelParaOrdem, reservasDaOrdem, liberarReservasDaOrdem,
    gerarRequisicoes, aprovarRequisicao, cancelarRequisicao, criarPedidoCompra,
    receberPedido, cancelarPedido, painelCompras, entradaDeMaterial, dataLimiteDeCompra,
    budgetsDaCarteira, custoHoraEquipamento, custoMinutoColaborador, rastrearParaFrente,
    auditarIndustrial, reconciliarEstoqueIndustrial, testarIndustrialV2,
    /* V3: a cadeia material → engenharia → industrial como uma coisa só */
    migrarIndustrialV3,
    resolverMaterialIndustrial, custoVigenteDoMaterial, converterUnidadeMaterial,
    auditarIntegracaoMateriaisEngenhariaIndustrial, indicadoresDeIntegracao,
    mapaDaCadeia, itensDaArvore, lotesDeCompraDisponiveis,
    testarFluxoCompletoERPIndustrial,
    /* a ponte com a Engenharia: o produto do sistema é a origem */
    produtosDaEngenharia, derivarProdutoDaEngenharia, lerFichaDoProduto,
    divergenciasDaFicha, transformacoesDoProduto,
    /* a ordem nasce no módulo Produção; aqui ela ganha plano, reserva e MRP */
    ordensDoSistema, planejarOrdemDoSistema, planejarOrdensPendentes, planoDaOrdemDoSistema,
    abrirOrdemDeProducao, versaoVigenteDoProduto, tarefasDaOrdem, situacaoDaOrdem,
  };
  window.GrupoIndustrial = GrupoIndustrial;
  window.GrupoProdutosIndustriais = GrupoProdutosIndustriais;
})();
</script>
`;
}
