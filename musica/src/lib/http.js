import fs from 'node:fs';
import path from 'node:path';
import { ErroApp } from './erros.js';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

/**
 * Roteador mínimo sobre o http do Node. O app não usa framework: são poucas
 * rotas, e assim ele sobe com `node src/index.js`, sem instalar nada.
 */
export function criarRoteador() {
  const rotas = [];

  const registrar = (metodo, padrao, handler) => {
    const nomes = [];
    const regex = new RegExp(
      '^' +
        padrao
          .split('/')
          .map((parte) => {
            if (!parte.startsWith(':')) return parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            nomes.push(parte.slice(1));
            return '([^/]+)';
          })
          .join('/') +
        '$',
    );
    rotas.push({ metodo, regex, nomes, handler });
  };

  const api = {
    get: (p, h) => registrar('GET', p, h),
    post: (p, h) => registrar('POST', p, h),
    put: (p, h) => registrar('PUT', p, h),
    patch: (p, h) => registrar('PATCH', p, h),
    delete: (p, h) => registrar('DELETE', p, h),
    achar(metodo, caminho) {
      for (const rota of rotas) {
        if (rota.metodo !== metodo) continue;
        const m = caminho.match(rota.regex);
        if (!m) continue;
        const params = {};
        rota.nomes.forEach((nome, i) => {
          params[nome] = decodeURIComponent(m[i + 1]);
        });
        return { handler: rota.handler, params };
      }
      return null;
    },
    caminhoExiste: (caminho) => rotas.some((r) => r.regex.test(caminho)),
  };
  return api;
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamanho = 0;
    req.on('data', (parte) => {
      tamanho += parte.length;
      if (tamanho > 1_000_000) {
        reject(new ErroApp('Corpo da requisição grande demais.', 413));
        req.destroy();
        return;
      }
      partes.push(parte);
    });
    req.on('end', () => {
      const bruto = Buffer.concat(partes).toString('utf8').trim();
      if (!bruto) return resolve({});
      try {
        resolve(JSON.parse(bruto));
      } catch {
        reject(new ErroApp('JSON inválido no corpo da requisição.'));
      }
    });
    req.on('error', reject);
  });
}

function responder(res, status, corpo, tipo = 'application/json; charset=utf-8') {
  const texto = tipo.startsWith('application/json') ? JSON.stringify(corpo) : corpo;
  res.writeHead(status, {
    'content-type': tipo,
    'content-length': Buffer.byteLength(texto ?? ''),
  });
  res.end(texto ?? '');
}

function servirEstatico(publicDir, caminho, res) {
  const alvo = caminho === '/' ? '/index.html' : caminho;
  const arquivo = path.join(publicDir, path.normalize(alvo).replace(/^(\.\.[/\\])+/, ''));
  if (!arquivo.startsWith(publicDir) || !fs.existsSync(arquivo) || !fs.statSync(arquivo).isFile()) {
    return false;
  }
  const tipo = TIPOS[path.extname(arquivo)] ?? 'application/octet-stream';
  const conteudo = fs.readFileSync(arquivo);
  res.writeHead(200, { 'content-type': tipo, 'content-length': conteudo.length });
  res.end(conteudo);
  return true;
}

/** Transforma o roteador num handler de `http.createServer`. */
export function criarHandler(roteador, { publicDir }) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const caminho = url.pathname.replace(/\/+$/, '') || '/';
    try {
      const achado = roteador.achar(req.method, caminho);
      if (achado) {
        const corpo = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await lerCorpo(req) : {};
        const ctx = { params: achado.params, corpo, query: Object.fromEntries(url.searchParams), req };
        const saida = await achado.handler(ctx);
        if (saida && saida.html !== undefined) {
          return responder(res, saida.status ?? 200, saida.html, 'text/html; charset=utf-8');
        }
        if (saida === undefined || saida === null) return responder(res, 204, '');
        return responder(res, saida.__status ?? 200, saida.__corpo ?? saida);
      }

      if (req.method === 'GET' && publicDir && servirEstatico(publicDir, caminho, res)) return;

      if (caminho.startsWith('/api/')) {
        return responder(res, 404, { erro: 'Rota não encontrada.' });
      }
      // A interface é uma página só: qualquer outro caminho abre o app.
      if (req.method === 'GET' && publicDir && servirEstatico(publicDir, '/index.html', res)) return;
      return responder(res, 404, { erro: 'Não encontrado.' });
    } catch (erro) {
      if (erro instanceof ErroApp) {
        return responder(res, erro.status, { erro: erro.message });
      }
      const mensagem = String(erro?.message ?? erro);
      // Restrições do SQLite viram mensagem legível em vez de 500.
      if (/UNIQUE constraint|CHECK constraint|FOREIGN KEY constraint/i.test(mensagem)) {
        return responder(res, 409, { erro: `O banco recusou a operação: ${mensagem}` });
      }
      console.error(erro);
      return responder(res, 500, { erro: 'Erro interno.', detalhe: mensagem });
    }
  };
}

/** Marca a resposta com outro status (201, por exemplo) sem perder o corpo. */
export const criado = (corpo) => ({ __status: 201, __corpo: corpo });
