// Apoio dos testes: sobe o app num servidor local e abre uma página de verdade.
//
// O app é uma página só, que roda inteiramente no navegador e guarda tudo no
// localStorage. Testá-lo fora de um navegador seria testar outra coisa — por
// isso aqui há um Chromium de verdade, com localStorage de verdade, clicando
// nos mesmos botões que o aluno clica.

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PAGINA = path.join(AQUI, '..', 'index.html');

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
  const html = fs.readFileSync(PAGINA);
  const servidor = await new Promise((pronto) => {
    const s = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
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
    /** O texto visível da tela — é por ele que os testes conferem o que a pessoa lê. */
    texto: () => pagina.innerText('#tela'),
    /** Vai para uma rota e espera o desenho. */
    async ir(rota) {
      await pagina.evaluate((r) => { window.location.hash = r; }, rota);
      await pagina.waitForTimeout(120);
    },
    /** Entra pela portaria, como qualquer pessoa faria. */
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
