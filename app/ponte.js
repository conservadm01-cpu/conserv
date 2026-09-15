/*
 * Ponte entre o app e o servidor.
 *
 * O app foi escrito para guardar a base no navegador, e por isso pergunta
 * primeiro por `window.storage` antes de cair no localStorage. É essa porta
 * que usamos aqui: a ponte implementa `window.storage` falando com a API, e o
 * app continua sem saber onde a base mora.
 *
 * O que isso muda, e é o motivo de existir:
 *
 * - A base deixa de viver num navegador e passa a viver no servidor. A fábrica
 *   inteira vê o mesmo dado, e o backup é copiar um arquivo.
 * - A senha para de ser conferida na máquina de quem entra. Quem valida é o
 *   servidor, que só devolve a base depois disso — antes do login, o navegador
 *   não recebe nada da empresa.
 * - Duas pessoas salvando ao mesmo tempo não se atropelam em silêncio: cada
 *   gravação carrega a versão que leu, e o servidor recusa a que chegou velha.
 */
(function () {
  const CHAVE_BASE = 'confeccao-erp-db-v1';
  const CHAVE_SESSAO = 'csvsist.sessao';

  /* Chaves que não são a base (o teste de escrita do app, por exemplo) ficam
     na memória desta aba: não têm dono no servidor nem valem uma requisição. */
  const locais = new Map();

  const estado = {
    token: null,
    usuario: null,
    documento: null,
    versao: 0,
    instalacao: false,
  };

  const lerSessao = () => {
    try {
      return JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || 'null');
    } catch {
      return null;
    }
  };
  const gravarSessao = (s) => {
    try {
      if (s) sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(s));
      else sessionStorage.removeItem(CHAVE_SESSAO);
    } catch {
      /* navegador sem sessionStorage: a sessão vale só enquanto a aba viver */
    }
  };

  async function api(caminho, opcoes = {}) {
    const resposta = await fetch(`/api/app${caminho}`, {
      ...opcoes,
      headers: {
        'Content-Type': 'application/json',
        ...(estado.token ? { Authorization: `Bearer ${estado.token}` } : {}),
        ...opcoes.headers,
      },
    });
    const texto = await resposta.text();
    const corpo = texto ? JSON.parse(texto) : null;
    if (!resposta.ok) {
      const erro = new Error(corpo?.erro || 'Falha ao falar com o servidor');
      erro.status = resposta.status;
      erro.corpo = corpo;
      throw erro;
    }
    return corpo;
  }

  /* ------------------------------------------------------------- entrada */

  async function entrar(usuario, senha) {
    const r = await api('/sessao', { method: 'POST', body: JSON.stringify({ usuario, senha }) });
    estado.token = r.token;
    estado.usuario = r.usuario;
    estado.documento = r.documento;
    estado.versao = r.versao;
    estado.instalacao = Boolean(r.instalacao);
    gravarSessao({ token: r.token, usuario: r.usuario });
    return r;
  }

  function sair() {
    estado.token = null;
    estado.usuario = null;
    estado.documento = null;
    estado.versao = 0;
    gravarSessao(null);
  }

  /* ----------------------------------------------------------- a porta */

  /**
   * Tela de entrada, desenhada com o CSS do próprio app para não parecer
   * outro sistema. Fica antes de tudo: o app só é montado depois que o
   * servidor aceitou a senha e mandou a base.
   */
  function pedirEntrada() {
    return new Promise((resolve) => {
      const fundo = document.createElement('div');
      fundo.className = 'ponte-entrada';
      fundo.innerHTML = `
        <form class="caixa" autocomplete="on">
          <div class="marca">
            <span>ConServ Confecções</span>
            <h1>CSVSIST</h1>
          </div>
          <p class="explica">Entre para abrir a base da fábrica.</p>
          <label>Usuário<input name="usuario" autocomplete="username" autofocus /></label>
          <label>Senha<input name="senha" type="password" autocomplete="current-password" /></label>
          <p class="erro" hidden></p>
          <button type="submit">Entrar</button>
          <p class="nota">A base fica no servidor. Antes da senha, nada da empresa chega a este navegador.</p>
        </form>`;
      document.body.appendChild(fundo);

      const form = fundo.querySelector('form');
      const erro = fundo.querySelector('.erro');
      const botao = fundo.querySelector('button');

      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        erro.hidden = true;
        botao.disabled = true;
        botao.textContent = 'Entrando…';
        try {
          const r = await entrar(form.usuario.value.trim(), form.senha.value);
          fundo.remove();
          resolve(r);
        } catch (e) {
          erro.textContent = e.message;
          erro.hidden = false;
          botao.disabled = false;
          botao.textContent = 'Entrar';
          form.senha.value = '';
          form.senha.focus();
        }
      });
    });
  }

  const ESTILO = `
    .ponte-entrada {
      position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center;
      background: var(--canvas, #EDEAE4); padding: 20px;
    }
    .ponte-entrada .caixa {
      width: min(380px, 100%); background: var(--white, #fff); border: 1px solid var(--line, #D8D3C8);
      border-radius: var(--radius, 6px); padding: 26px; display: grid; gap: 12px;
      box-shadow: 0 12px 30px rgba(28, 35, 51, .12);
    }
    .ponte-entrada .marca span {
      font-family: var(--mono, monospace); font-size: 10px; letter-spacing: .16em;
      text-transform: uppercase; color: var(--thread, #D98B2B);
    }
    .ponte-entrada .marca h1 {
      font-family: var(--display, sans-serif); font-size: 26px; margin: 4px 0 0;
      letter-spacing: .02em; color: var(--ink, #1C2333);
    }
    .ponte-entrada .explica { margin: 0; font-size: 13px; color: var(--ink-soft, #333c52); }
    .ponte-entrada label {
      display: grid; gap: 5px; font-size: 12px; color: var(--ink-soft, #333c52);
      font-family: var(--body, sans-serif);
    }
    .ponte-entrada input {
      padding: 9px 11px; border: 1px solid var(--line, #D8D3C8); border-radius: var(--radius, 6px);
      font: inherit; font-size: 14px; background: var(--canvas-panel, #F7F5F1); color: var(--ink, #1C2333);
    }
    .ponte-entrada input:focus { outline: 2px solid var(--petrol, #2F6E68); outline-offset: 1px; }
    .ponte-entrada button {
      margin-top: 4px; padding: 10px; border: 0; border-radius: var(--radius, 6px);
      background: var(--petrol, #2F6E68); color: #fff; font: inherit; font-weight: 600; cursor: pointer;
    }
    .ponte-entrada button:disabled { opacity: .6; cursor: default; }
    .ponte-entrada .erro {
      margin: 0; padding: 8px 10px; border-radius: var(--radius, 6px);
      background: var(--bad-bg, #FBE4E1); color: var(--bad, #B23A2E); font-size: 12.5px;
    }
    .ponte-entrada .nota { margin: 0; font-size: 11.5px; color: #8a8577; }
  `;

  /* -------------------------------------------- a porta que o app enxerga */

  window.storage = {
    async get(chave) {
      if (chave !== CHAVE_BASE) return locais.has(chave) ? { value: locais.get(chave) } : null;
      if (!estado.documento) return null;
      return { value: JSON.stringify(estado.documento) };
    },

    async set(chave, valor) {
      if (chave !== CHAVE_BASE) {
        locais.set(chave, valor);
        return;
      }
      const documento = JSON.parse(valor);
      try {
        const r = await api('/estado', {
          method: 'PUT',
          body: JSON.stringify({ documento, versao: estado.versao }),
        });
        estado.documento = documento;
        estado.versao = r.versao;
        estado.instalacao = false;
      } catch (e) {
        if (e.status === 409) {
          /*
           * Outra pessoa gravou entre a leitura e esta gravação. Salvar por
           * cima apagaria o trabalho dela em silêncio — o certo é parar,
           * avisar e recarregar com a base de quem chegou primeiro.
           */
          throw new Error(
            'Outra pessoa salvou esta base enquanto você trabalhava. ' +
              'Recarregue a página para continuar a partir da versão dela.'
          );
        }
        if (e.status === 401) {
          sair();
          throw new Error('Sua sessão expirou. Recarregue a página e entre de novo.');
        }
        throw e;
      }
    },

    async delete(chave) {
      if (chave !== CHAVE_BASE) locais.delete(chave);
    },
  };

  window.PONTE = {
    get usuario() {
      return estado.usuario;
    },
    get instalacao() {
      return estado.instalacao;
    },
    sair,
    entrar,
  };

  /* ------------------------------------------------------------ partida */

  async function abrir() {
    const estilo = document.createElement('style');
    estilo.textContent = ESTILO;
    document.head.appendChild(estilo);

    const guardada = lerSessao();
    if (guardada?.token) {
      estado.token = guardada.token;
      estado.usuario = guardada.usuario;
      try {
        const r = await api('/estado');
        estado.documento = r.documento;
        estado.versao = r.versao;
        estado.instalacao = Boolean(r.instalacao);
        return;
      } catch {
        sair(); // token velho ou servidor reiniciado: pede a senha de novo
      }
    }

    /*
     * Fábrica recém-instalada não tem ninguém cadastrado, e ninguém consegue
     * entrar para cadastrar o primeiro. Nesse caso o servidor abre a base
     * vazia e o próprio app conduz o primeiro acesso.
     */
    try {
      const r = await api('/estado');
      if (r.instalacao) {
        estado.token = r.token;
        estado.documento = r.documento;
        estado.versao = r.versao;
        estado.instalacao = true;
        gravarSessao({ token: r.token, usuario: null });
        return;
      }
    } catch {
      /* base já tem gente: segue para o login */
    }

    await pedirEntrada();
  }

  /* O app só monta depois que a base chegou. */
  window.PONTE_PRONTA = abrir();
})();
