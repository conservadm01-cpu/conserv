/**
 * Monta o HTML de teste: o Confecção ERP com a base já dentro.
 *
 *   node docs/teste/confeccao/montar-html.mjs <confeccao-erp.html> [saida.html] [base.json]
 *
 * O arquivo gerado é o sistema inteiro num só HTML — abre com dois cliques,
 * sem servidor e sem instalar nada, já com almoxarifado, carteira de ordens e
 * apontamento lançados.
 *
 * A base é gravada no armazenamento do navegador na primeira abertura. Depois
 * disso o que vale é o que o testador fez: fechar e reabrir não desfaz nada.
 * Para recomeçar do zero, abra com `?base=nova` no fim do endereço (repõe a
 * base de teste) ou `?base=vazia` (apaga tudo e cai na tela de primeiro
 * acesso).
 */
import fs from 'node:fs';
import path from 'node:path';
import { empacotarIndustrial } from '../../../industrial/empacotar.mjs';

const pasta = path.dirname(new URL(import.meta.url).pathname);
const argumentos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const opcao = (nome) => {
  const achado = process.argv.slice(2).find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split('=').slice(1).join('=') : '';
};

const entrada = argumentos[0];
const saida = argumentos[1] || path.join(pasta, 'confeccao-erp-teste.html');
const arquivoBase = argumentos[2] || path.join(pasta, 'base-teste.json');
/* módulos que não vão para esta montagem, por id (ex.: produtos,producao) */
const semModulos = opcao('sem-modulos').split(',').map((x) => x.trim()).filter(Boolean);
/* o módulo industrial entra no HTML quando pedido (--com-industrial) */
const comIndustrial = process.argv.slice(2).includes('--com-industrial');

if (!entrada) {
  console.error('uso: node docs/teste/confeccao/montar-html.mjs <confeccao-erp.html> [saida.html] [base.json]'
    + ' [--sem-modulos=produtos,producao]');
  process.exit(1);
}

/**
 * Tira módulos da montagem.
 *
 * O sistema monta o menu a partir de `ABAS_SISTEMA` e decide o que desenhar
 * pela aba escolhida. Tirar o módulo da lista — e da lista de abas de cada
 * nível de acesso — é o que basta: sem entrada no menu, não há como chegar à
 * tela. O código do módulo continua no arquivo, intocado, para a montagem
 * seguinte poder trazê-lo de volta.
 */
function removerModulos(texto, ids) {
  if (ids.length === 0) return { html: texto, removidos: [] };
  const inicio = texto.indexOf('const ABAS_SISTEMA = [');
  if (inicio < 0) throw new Error('não achei ABAS_SISTEMA no HTML.');
  const fim = texto.indexOf('}];', inicio);
  if (fim < 0) throw new Error('ABAS_SISTEMA sem fim reconhecível.');

  let lista = texto.slice(inicio, fim + 3);
  const removidos = [];
  for (const id of ids) {
    const entrada = new RegExp(`\\{\\s*id: '${id}',\\s*label: '[^']*'\\s*\\}(,\\s*)?`);
    if (!entrada.test(lista)) throw new Error(`módulo "${id}" não existe em ABAS_SISTEMA.`);
    lista = lista.replace(entrada, '');
    removidos.push(id);
  }
  /* a lista pode ficar com vírgula sobrando quando o módulo era o último */
  lista = lista.replace(/,(\s*)\}\];$/, '$1}];');

  let saidaTexto = texto.slice(0, inicio) + lista + texto.slice(fim + 3);

  /* cada nível de acesso guarda as abas que enxerga */
  saidaTexto = saidaTexto.replace(/abas: \[([^\]]*)\]/g, (todo, dentro) => {
    const restantes = dentro
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => !ids.some((id) => x === `'${id}'`));
    return `abas: [${restantes.join(', ')}]`;
  });

  return { html: saidaTexto, removidos };
}

let html = fs.readFileSync(entrada, 'utf8');
const base = JSON.parse(fs.readFileSync(arquivoBase, 'utf8'));

if (html.includes('__BASE_DE_TESTE__')) {
  console.error('Este HTML já foi montado com uma base de teste. Use o original.');
  process.exit(1);
}

/* O JSON entra como texto dentro de uma tag <script type="application/json">:
   assim nenhum caractere do conteúdo é interpretado como código. Só o
   `</script>` precisa ser escapado, senão fecharia a tag no meio do dado. */
const dados = JSON.stringify(base).replace(/<\/script>/gi, '<\\/script>');

const semente = `
<script type="application/json" id="__BASE_DE_TESTE__">${dados}</script>
<script>
/* Base de teste — gravada no navegador antes de a aplicação subir.
   ?base=nova  repõe a base de teste por cima do que estiver gravado
   ?base=vazia apaga tudo e começa do primeiro acesso */
(function () {
  var CHAVE = 'confeccao-erp-db-v1';
  try {
    var pedido = (location.search.match(/[?&]base=([a-z]+)/i) || [])[1];
    if (pedido === 'vazia') { localStorage.removeItem(CHAVE); return; }
    if (pedido !== 'nova' && localStorage.getItem(CHAVE)) return;
    var texto = document.getElementById('__BASE_DE_TESTE__').textContent;
    localStorage.setItem(CHAVE, texto);
  } catch (e) {
    /* navegador sem armazenamento: a aplicação avisa e segue em memória */
  }
})();
</script>
`;

const corte = removerModulos(html, semModulos);
html = corte.html;

/**
 * Costura o módulo industrial no sistema.
 *
 * São cinco pontos de encaixe, todos no código que o sistema já tem: a base
 * precisa conhecer a coleção nova para não descartá-la ao recarregar, a carga
 * precisa preparar as coleções, o menu precisa da aba, os níveis de acesso
 * precisam liberá-la e a tela precisa ser desenhada quando a aba está ativa.
 */
function encaixarIndustrial(texto) {
  let saida = texto;
  const encaixe = (de, para, onde) => {
    if (!saida.includes(de)) throw new Error(`não achei onde encaixar o módulo industrial: ${onde}`);
    saida = saida.replace(de, para);
  };

  /* 1. a coleção entra em emptyDb — sem isso o loadDb descarta o que não
        conhece, e a base industrial sumiria a cada recarregada */
  encaixe(`  configCanal: null,`, `  /* módulo industrial: carteira, budget, MRP, transformações */\n  industrial: null,\n  configCanal: null,`,
    'emptyDb');

  /* 2. a carga prepara as coleções do módulo */
  for (const alvo of ['base', 'emptyDb()']) {
    const de = `return migrarJornada(semearEngenharia(migrarGruposCortaveis(semearProduto(semearMateriais(garantirAdminPadrao(${alvo}))))));`;
    const para = `return window.Industrial.preparar(migrarJornada(semearEngenharia(migrarGruposCortaveis(semearProduto(semearMateriais(garantirAdminPadrao(${alvo})))))));`;
    encaixe(de, para, `loadDb (${alvo})`);
  }

  /* 3. a aba no menu */
  encaixe(`{\n  id: 'canal',\n  label: 'Conversa aberta'\n}`,
    `{\n  id: 'industrial',\n  label: 'Industrial'\n}, {\n  id: 'canal',\n  label: 'Conversa aberta'\n}`,
    'ABAS_SISTEMA');

  /* 4. quem já enxerga engenharia passa a enxergar industrial */
  saida = saida.replace(/abas: \[([^\]]*)\]/g, (todo, dentro) => {
    if (!dentro.includes(`'engenharia'`) || dentro.includes(`'industrial'`)) return todo;
    return todo.replace(`'engenharia'`, `'engenharia', 'industrial'`);
  });

  /* 5. a tela, desenhada quando a aba está ativa */
  encaixe(`}), tabAtual === 'canal' && /*#__PURE__*/React.createElement(GrupoCanal, {`,
    `}), tabAtual === 'industrial' && /*#__PURE__*/React.createElement(GrupoIndustrial, {\n`
    + `    db: db,\n    update: update,\n    usuario: usuarioAtual,\n    perm: perm\n`
    + `  }), tabAtual === 'canal' && /*#__PURE__*/React.createElement(GrupoCanal, {`,
    'render da aba');

  return saida;
}

if (comIndustrial) html = encaixarIndustrial(html);

/* antes do script da aplicação: a base no armazenamento e, quando pedido, o
   módulo industrial — que define GrupoIndustrial antes de a aplicação subir */
const marca = html.indexOf('<script>');
if (marca < 0) throw new Error('não achei o script da aplicação no HTML.');
const modulo = comIndustrial ? empacotarIndustrial() : '';
const montado = html.slice(0, marca) + semente + modulo + html.slice(marca);

fs.writeFileSync(saida, montado);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`\nHTML de teste: ${saida}`);
console.log(`  ${kb(montado.length)} (aplicação ${kb(html.length)} + base ${kb(dados.length)})`);
if (corte.removidos.length) console.log(`  módulos fora desta montagem: ${corte.removidos.join(', ')}`);
if (comIndustrial) console.log(`  módulo industrial embutido (${(modulo.length / 1024).toFixed(0)} KB)`);
console.log('  abra no navegador e entre com qualquer usuário da lista · senha teste123\n');
