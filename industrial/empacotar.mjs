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
  'modelo.mjs', 'motores.mjs', 'cadastro.mjs', 'ordens.mjs', 'demonstracao.mjs',
  'interface.mjs', 'telas-produtos.mjs', 'telas-ordens.mjs',
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
  };
  window.GrupoIndustrial = GrupoIndustrial;
  window.GrupoProdutosIndustriais = GrupoProdutosIndustriais;
  window.GrupoOrdens = GrupoOrdens;
})();
</script>
`;
}
