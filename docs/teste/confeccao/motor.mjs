/**
 * Carrega o motor do protótipo "Confecção ERP" (o HTML de página única) dentro
 * do Node, sem navegador.
 *
 * A base de teste não é escrita à mão: ela é construída chamando as mesmas
 * funções que o sistema usa em produção — `aplicarMovimento`, `criarOrdem`,
 * `apontarProducao`… Assim o arquivo gerado obedece às regras do próprio
 * sistema (saldo que nasce de movimentação, etapa que só produz o que a
 * anterior entregou, ordem que se fecha sozinha) em vez de fingir obedecer.
 *
 * O React é substituído por um esqueleto: as telas nunca são renderizadas,
 * só o modelo de dados é executado.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

/* Os nomes do protótipo que a geração usa. Ficam numa lista explícita
   porque o script do HTML é um escopo fechado: nada dele vaza sozinho. */
const EXPORTADOS = [
  'emptyDb', 'uid', 'todayISO', 'agoraISO', 'num', 'normaliza', 'proximoCodigo',
  'garantirAdminPadrao', 'semearMateriais', 'semearProduto', 'semearEngenharia',
  'migrarGruposCortaveis', 'migrarJornada', 'definirSenha', 'registrarLog',
  'aplicarMovimento', 'recalcularSaldos', 'reservar',
  'criarOrdem', 'apontarProducao', 'avancoDaOrdem', 'tarefasDoProduto',
  'congelarVersao', 'mudarStatusProduto', 'checklistEngenharia', 'statusDoProduto',
  'custearProduto', 'resumoProcesso', 'montarNomeProduto',
  'salvarCustoFixo', 'taxaCustoIndireto', 'capacidadeProdutivaMes',
  'custoMinutoDepartamento', 'mediaGeralFabrica', 'jornadaDe',
  'registrarOcorrencia', 'encerrarOcorrencia',
  'registrarManifestacao', 'moverManifestacao', 'responderManifestacao',
  'registrarPesquisaClima', 'salvarVaga', 'registrarIndicacao', 'moverIndicacao',
  'painelProducao', 'indicadoresCanal',
  'UNIDADES_PADRAO', 'GRUPOS_PADRAO', 'CENTROS_CUSTO_PADRAO', 'TIPOS_MOV',
  'DEPARTAMENTOS_PADRAO', 'ETAPAS_PADRAO', 'GRUPOS_PRODUTO_PADRAO',
  'TIPOS_PRODUTO_PADRAO', 'STATUS_PRODUTO', 'CATEGORIAS_CANAL', 'VERSAO_APP',
  'STORAGE_KEY', 'LIMITE_BASE_BYTES',
];

/** O maior bloco entre <script> e </script> é a aplicação. */
export function extrairScript(html) {
  const partes = html.split(/<script[^>]*>|<\/script>/);
  return partes.reduce((maior, p) => (p.length > maior.length ? p : maior), '');
}

/** Gerador pseudoaleatório com semente: ids estáveis entre execuções. */
function aleatorioComSemente(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function carregarMotor(caminhoHtml, opcoes = {}) {
  const html = fs.readFileSync(caminhoHtml, 'utf8');
  const codigo = extrairScript(html);
  if (!/const emptyDb/.test(codigo)) {
    throw new Error(`${caminhoHtml} não parece ser o HTML do Confecção ERP.`);
  }

  const React = {
    createElement: () => null,
    Fragment: 'Fragment',
    useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
    useEffect: () => {},
    useMemo: (f) => f(),
    useRef: () => ({ current: null }),
    useCallback: (f) => f,
  };
  const elemento = () => ({ style: {}, appendChild() {}, removeChild() {}, click() {}, addEventListener() {} });
  const janela = {
    crypto: webcrypto,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: 'file:///confeccao-erp.html', search: '' },
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    print() {}, open: () => null,
  };
  const documento = {
    getElementById: () => elemento(),
    createElement: elemento,
    body: elemento(),
    addEventListener() {}, removeEventListener() {},
  };

  const ctx = vm.createContext({
    React,
    ReactDOM: { createRoot: () => ({ render() {} }) },
    window: janela, document: documento, navigator: { userAgent: 'node' },
    crypto: webcrypto, console, Intl, URL, TextEncoder, TextDecoder,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Blob: class {}, FileReader: class {}, alert() {}, confirm: () => true,
    __semente: aleatorioComSemente(opcoes.semente ?? 20260904),
  });
  ctx.globalThis = ctx;

  vm.runInContext('Math.random = __semente;', ctx);
  vm.runInContext(`${codigo}\nglobalThis.__api = { ${EXPORTADOS.join(', ')} };`, ctx, {
    filename: 'confeccao-erp.js',
  });
  return ctx.__api;
}
