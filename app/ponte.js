/*
 * Ponte entre o app e onde a base mora.
 *
 * O app foi escrito para guardar a base no navegador, e por isso pergunta
 * primeiro por `window.storage` antes de cair no localStorage. É essa porta que
 * usamos aqui: a ponte implementa `window.storage`, e o app continua sem saber
 * onde a base mora.
 *
 * Há dois lugares possíveis, escolhidos sozinhos ao abrir:
 *
 * - **Servidor da fábrica** (a instalação de verdade). A base é um documento só,
 *   guardado no SQLite com número de versão; a senha é conferida no servidor, e
 *   antes do login nada da empresa chega ao navegador.
 *
 * - **Página publicada** (o link de acesso, para conhecer e avaliar). Não há
 *   servidor: a base fica no banco da própria página, que todo mundo que abre o
 *   link enxerga. Lá a senha é conferida no navegador — é o desenho original do
 *   app — e por isso o link serve para avaliar, não para guardar o que a fábrica
 *   não pode perder.
 *
 * Nos dois casos vale a mesma regra de gravação concorrente: quem grava informa
 * a versão que leu, e a gravação que chegou velha é recusada em vez de apagar o
 * trabalho de quem gravou antes.
 */
(function () {
  const CHAVE_BASE = 'confeccao-erp-db-v1';
  const CHAVE_SESSAO = 'csvsist.sessao';

  /* Chaves que não são a base (o teste de escrita do app, por exemplo) ficam na
     memória desta aba: não têm dono lá fora nem valem uma gravação. */
  const locais = new Map();

  const estado = {
    onde: null, // 'servidor' | 'pagina'
    token: null,
    usuario: null,
    documento: null,
    versao: 0,
    instalacao: false,
  };

  /* ===================================================== servidor da fábrica */

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
      /* sem sessionStorage: a sessão vale enquanto a aba viver */
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
      throw erro;
    }
    return corpo;
  }

  const servidor = {
    async entrar(usuario, senha) {
      const r = await api('/sessao', { method: 'POST', body: JSON.stringify({ usuario, senha }) });
      estado.token = r.token;
      estado.usuario = r.usuario;
      estado.documento = r.documento;
      estado.versao = r.versao;
      estado.instalacao = false;
      gravarSessao({ token: r.token, usuario: r.usuario });
      return r;
    },

    async gravar(documento) {
      const r = await api('/estado', {
        method: 'PUT',
        body: JSON.stringify({ documento, versao: estado.versao }),
      });
      estado.versao = r.versao;
      estado.instalacao = false;
    },

    sair() {
      estado.token = null;
      estado.usuario = null;
      gravarSessao(null);
    },

    async abrir() {
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
          servidor.sair(); // token velho ou servidor reiniciado
        }
      }

      /* Fábrica recém-instalada não tem ninguém cadastrado, e ninguém consegue
         entrar para cadastrar o primeiro: o servidor abre a base vazia e o
         próprio app conduz o primeiro acesso. */
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
        /* já existe gente cadastrada: pede a senha */
      }
      await pedirEntrada();
    },
  };

  /* ======================================================= página publicada */

  /*
   * Cada documento do banco da página cabe em 256 KiB, e a base inteira não
   * cabe num só. Por isso ela é guardada coleção por coleção, e uma coleção
   * grande é partida em pedaços — o app continua vendo um documento único.
   */
  const LIMITE_PEDACO = 180 * 1024;
  const CAMINHO = 'base';

  let bancoPagina = null;

  /** Reparte uma lista em pedaços que caibam num documento. */
  function repartir(lista) {
    const pedacos = [];
    let atual = [];
    let tamanho = 0;
    for (const item of lista) {
      const peso = JSON.stringify(item).length + 1;
      if (atual.length > 0 && tamanho + peso > LIMITE_PEDACO) {
        pedacos.push(atual);
        atual = [];
        tamanho = 0;
      }
      atual.push(item);
      tamanho += peso;
    }
    if (atual.length > 0 || pedacos.length === 0) pedacos.push(atual);
    return pedacos;
  }

  const pagina = {
    /** Junta os pedaços guardados de volta num documento só. */
    async abrir() {
      const docs = (await bancoPagina.collection(CAMINHO).get()).docs ?? [];
      const documento = {};
      let versao = 0;

      const partes = new Map();
      for (const doc of docs) {
        const corpo = doc.data() ?? {};
        if (doc.id === '_meta') {
          versao = Number(corpo.versao) || 0;
          continue;
        }
        if (corpo.tipo === 'valor') {
          documento[corpo.colecao] = corpo.valor;
          continue;
        }
        const lista = partes.get(corpo.colecao) ?? [];
        lista.push(corpo);
        partes.set(corpo.colecao, lista);
      }
      for (const [colecao, lista] of partes) {
        lista.sort((a, b) => a.pedaco - b.pedaco);
        documento[colecao] = lista.flatMap((p) => p.itens ?? []);
      }

      estado.documento = Object.keys(documento).length > 0 ? documento : null;
      estado.versao = versao;
      estado.instalacao = !(estado.documento?.colaboradores ?? []).some(
        (c) => c && (c.senhaHash || c.senha)
      );
    },

    async gravar(documento) {
      const meta = await bancoPagina.doc(`${CAMINHO}/_meta`).get();
      const versaoAgora = Number(meta.exists ? meta.data().versao : 0) || 0;
      if (versaoAgora !== estado.versao) {
        const erro = new Error('conflito');
        erro.status = 409;
        throw erro;
      }

      /* Só o que mudou é gravado: a base inteira a cada clique gastaria o
         orçamento de escrita da página sem trazer nada. */
      const anterior = estado.documento ?? {};
      const escritas = [];
      for (const [colecao, valor] of Object.entries(documento)) {
        if (JSON.stringify(valor) === JSON.stringify(anterior[colecao])) continue;
        if (!Array.isArray(valor)) {
          escritas.push(
            bancoPagina.doc(`${CAMINHO}/${colecao}`).set({ colecao, tipo: 'valor', valor: valor ?? null })
          );
          continue;
        }
        const pedacos = repartir(valor);
        pedacos.forEach((itens, i) => {
          escritas.push(
            bancoPagina.doc(`${CAMINHO}/${colecao}__${i}`).set({ colecao, tipo: 'lista', pedaco: i, itens })
          );
        });
        /* pedaços que sobraram de uma base maior saem de cena */
        const antes = repartir(anterior[colecao] ?? []).length;
        for (let i = pedacos.length; i < antes; i++) {
          escritas.push(bancoPagina.doc(`${CAMINHO}/${colecao}__${i}`).delete());
        }
      }

      await Promise.all(escritas);
      const versao = versaoAgora + 1;
      await bancoPagina.doc(`${CAMINHO}/_meta`).set({ versao, em: new Date().toISOString() });
      estado.documento = documento;
      estado.versao = versao;
      estado.instalacao = false;
    },

    sair() {
      estado.usuario = null;
    },
  };

  /* A ponte carrega antes do corpo da página existir: esperar é mais barato
     que perder o aviso ou a tela de entrada. */
  const noCorpo = (elemento) =>
    new Promise((resolve) => {
      const por = () => {
        document.body.appendChild(elemento);
        resolve(elemento);
      };
      if (document.body) por();
      else document.addEventListener('DOMContentLoaded', por, { once: true });
    });

  /* ================================================== a porta da instalação */

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
      noCorpo(fundo);

      const form = fundo.querySelector('form');
      const erro = fundo.querySelector('.erro');
      const botao = fundo.querySelector('button');

      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        erro.hidden = true;
        botao.disabled = true;
        botao.textContent = 'Entrando…';
        try {
          const r = await servidor.entrar(form.usuario.value.trim(), form.senha.value);
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
    .ponte-aviso {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 9998;
      background: var(--warn-bg, #FBF0D6); color: var(--warn, #B5871C);
      border-top: 1px solid rgba(0,0,0,.08); padding: 7px 14px; font-size: 12px;
      font-family: var(--body, sans-serif); text-align: center;
    }
  `;

  /* ----------------------------------------- a porta que o app enxerga */

  const onde = () => (estado.onde === 'pagina' ? pagina : servidor);

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
      try {
        await onde().gravar(JSON.parse(valor));
      } catch (e) {
        if (e.status === 409) {
          /*
           * Alguém gravou entre a leitura e esta gravação. Salvar por cima
           * apagaria o trabalho dessa pessoa em silêncio — o certo é parar,
           * avisar e recarregar a partir da versão de quem chegou primeiro.
           */
          throw new Error(
            'Outra pessoa salvou esta base enquanto você trabalhava. ' +
              'Recarregue a página para continuar a partir da versão dela.'
          );
        }
        if (e.status === 401) {
          servidor.sair();
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
    get onde() {
      return estado.onde;
    },
    sair: () => onde().sair(),
    entrar: (u, s) => servidor.entrar(u, s),
  };

  /* ------------------------------------------------------------ partida */

  function avisarPagina() {
    const aviso = document.createElement('div');
    aviso.className = 'ponte-aviso';
    aviso.textContent =
      'Acesso pelo link: a base fica guardada nesta página e a senha é conferida no navegador. ' +
      'Para a fábrica usar de verdade, instale o servidor.';
    noCorpo(aviso);
  }

  async function abrir() {
    const estilo = document.createElement('style');
    estilo.textContent = ESTILO;
    document.head.appendChild(estilo);

    /* Página publicada tem banco próprio; instalação da fábrica tem servidor. */
    const banco = window.claude?.use ? await window.claude.use('db').catch(() => null) : null;
    if (banco) {
      bancoPagina = banco;
      estado.onde = 'pagina';
      await pagina.abrir();
      avisarPagina();
      return;
    }

    estado.onde = 'servidor';
    await servidor.abrir();
  }

  /* O app só monta depois que a base chegou. */
  window.PONTE_PRONTA = abrir().catch((e) => {
    console.error('Ponte: não foi possível abrir a base', e);
  });
})();
