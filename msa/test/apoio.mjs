// Apoio dos testes: sobe o app num servidor local e abre uma página de verdade.
//
// O app é uma página só, que roda inteiramente no navegador e guarda tudo no
// localStorage. Testá-lo fora de um navegador seria testar outra coisa — por
// isso aqui há um Chromium de verdade, com localStorage de verdade, clicando
// nos mesmos botões que o aluno clica.
//
// O servidor daqui serve a pasta `publico/` e devolve os MESMOS cabeçalhos que
// a Vercel devolve — inclusive a Content-Security-Policy do `vercel.json`. Um
// app que passa nos testes e quebra em produção porque a CSP barrou alguma
// coisa é um app que não foi testado.

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.join(AQUI, '..', 'publico');
const CONFIG_DA_VERCEL = path.join(AQUI, '..', '..', 'vercel.json');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

// Os cabeçalhos que valem para toda rota, lidos do próprio vercel.json — se
// alguém apertar a CSP lá, os testes sentem aqui.
function cabecalhosDaHospedagem() {
  const config = JSON.parse(fs.readFileSync(CONFIG_DA_VERCEL, 'utf8'));
  const regra = (config.headers || []).find((h) => h.source === '/(.*)');
  return Object.fromEntries((regra ? regra.headers : []).map((h) => [h.key, h.value]));
}

export const CABECALHOS = cabecalhosDaHospedagem();

// O navegador pode vir do Playwright ou de uma instalação já presente na
// máquina (é o caso das imagens de CI que trazem o Chromium pronto).
function ondeEstaOChromium() {
  if (process.env.MSA_CHROMIUM) return process.env.MSA_CHROMIUM;
  const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!raiz || !fs.existsSync(raiz)) return undefined;
  const pasta = fs.readdirSync(raiz).filter((n) => /^chromium-\d+$/.test(n)).sort().pop();
  if (!pasta) return undefined;
  const binario = path.join(raiz, pasta, 'chrome-linux', 'chrome');
  return fs.existsSync(binario) ? binario : undefined;
}

/** Sobe o app e devolve a página aberta na tela de acesso, já limpa. */
export async function abrirApp() {
  const pedidos = [];
  const servidor = await new Promise((pronto) => {
    const s = http.createServer((req, res) => {
      const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      pedidos.push(caminho);
      const arquivo = path.join(PUBLICO, caminho === '/' ? 'index.html' : caminho);
      // Fora da pasta pública ninguém entra, e o que não existe cai na página
      // — é a mesma regra do `rewrites` do vercel.json.
      const dentro = arquivo.startsWith(PUBLICO) && fs.existsSync(arquivo) && fs.statSync(arquivo).isFile();
      const alvo = dentro ? arquivo : path.join(PUBLICO, 'index.html');
      res.writeHead(dentro || caminho === '/' ? 200 : 404, {
        ...CABECALHOS,
        'content-type': TIPOS[path.extname(alvo)] || 'application/octet-stream',
      });
      res.end(fs.readFileSync(alvo));
    });
    s.listen(0, () => pronto(s));
  });
  const endereco = `http://localhost:${servidor.address().port}/`;

  const navegador = await chromium.launch({ executablePath: ondeEstaOChromium() });
  const pagina = await navegador.newPage();

  // Nenhum erro de JavaScript passa despercebido: qualquer teste que provoque
  // um deles falha, mesmo que a tela pareça certa.
  const erros = [];
  pagina.on('pageerror', (e) => erros.push(`erro de página: ${e.message}`));
  pagina.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text()}`); });
  pagina.on('dialog', (d) => d.accept());

  await pagina.goto(endereco);
  await pagina.waitForFunction(() => document.querySelector('#tela') && !/Carregando/.test(document.querySelector('#tela').textContent));

  const app = {
    pagina,
    erros,
    endereco,
    /** Os caminhos que o navegador pediu — para conferir o que a página busca. */
    pedidos,
    /** O texto visível da tela — é por ele que os testes conferem o que a pessoa lê. */
    texto: () => pagina.innerText('#tela'),
    /** Vai para uma rota e espera o desenho. */
    async ir(rota) {
      await pagina.evaluate((r) => { window.location.hash = r; }, rota);
      await pagina.waitForTimeout(120);
    },
    /** Entra pela portaria, como qualquer pessoa faria. */
    /** Entra como master, que é o que a maioria dos testes precisa. */
    entrarComoMaster: () => app.entrar(MASTER.usuario, MASTER.senha),
    async entrar(usuario, senha) {
      await app.ir('#/');
      await pagina.fill('#usuario', usuario);
      await pagina.fill('#senha', senha);
      await pagina.click('[data-acao="entrar"]');
      await pagina.waitForTimeout(200);
    },
    async sair() { await app.ir('#/sair'); },
    /** Zera o aparelho: sem dados guardados e de volta à tela de acesso. */
    async reiniciar() {
      await pagina.evaluate(() => {
        localStorage.clear();
        window.location.hash = '#/';
      });
      await pagina.reload();
      await pagina.waitForSelector('#usuario');
      erros.length = 0;
    },
    /** O que está na sessão agora. */
    sessao: () => pagina.evaluate(() => __modulos['armazenamento'].sessao()),
    rota: () => pagina.evaluate(() => window.location.hash),
    async fechar() {
      await navegador.close();
      await new Promise((pronto) => servidor.close(pronto));
    },
  };
  return app;
}

/** O acesso de fábrica: o master, o topo, o único que libera outros acessos. */
export const MASTER = { usuario: 'ADMIN', senha: 'CCB701040' };

/** A ficha completa que o cadastro exige, para não repetir isto em cada teste. */
export const FICHA = {
  nome: 'Ana Teste',
  comum: 'Central',
  email: 'ana@exemplo.com',
  whatsapp: '11912345678',
};

/** Cadastra um aluno pela tela de primeiro acesso e o deixa logado. */
export async function autocadastrar(app, { nome = FICHA.nome, senha = 'ana123' } = {}) {
  const { pagina } = app;
  await app.ir('#/cadastrar');
  await pagina.fill('#campo-nome', nome);
  await pagina.fill('#campo-comum', FICHA.comum);
  await pagina.selectOption('#campo-instrumento', 'viola');
  await pagina.check('#ministerio-pendente');
  await pagina.fill('#campo-email', FICHA.email);
  await pagina.fill('#campo-whatsapp', FICHA.whatsapp);
  await pagina.fill('#senha', senha);
  await pagina.fill('#senha2', senha);
  await pagina.click('[data-acao="criar-aluno"]');
  await pagina.waitForTimeout(250);
  return pagina.evaluate(() => __modulos['dados/repositorios'].alunos.listar()[0].id);
}
