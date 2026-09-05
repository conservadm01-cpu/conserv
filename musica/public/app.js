/**
 * CLAVE — interface do acompanhamento de alunos.
 *
 * Uma página só, sem framework nem build: o servidor entrega estes três
 * arquivos e a escola abre no navegador. Todo texto vindo do banco entra por
 * textContent, então nome de aluno com "<" não vira HTML.
 */

const api = async (metodo, caminho, corpo) => {
  const resposta = await fetch(caminho, {
    method: metodo,
    headers: corpo ? { 'content-type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (resposta.status === 204) return null;
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || `Falha na requisição (${resposta.status}).`);
  return dados;
};

function el(tag, props = {}, ...filhos) {
  const no = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props ?? {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave === 'texto') no.textContent = valor;
    else if (chave === 'classe') no.className = valor;
    else if (chave.startsWith('on')) no.addEventListener(chave.slice(2), valor);
    else no.setAttribute(chave, valor);
  }
  for (const filho of filhos.flat()) {
    if (filho === null || filho === undefined || filho === false) continue;
    no.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return no;
}

let recadoTimer = null;
function recado(mensagem, erro = false) {
  const caixa = document.getElementById('recado');
  caixa.textContent = mensagem;
  caixa.className = erro ? 'erro' : '';
  caixa.hidden = false;
  clearTimeout(recadoTimer);
  recadoTimer = setTimeout(() => {
    caixa.hidden = true;
  }, erro ? 6000 : 3000);
}

/** Roda a ação, mostra o erro do servidor como recado e recarrega a tela. */
async function tentar(acao, mensagemOk) {
  try {
    const saida = await acao();
    if (mensagemOk) recado(mensagemOk);
    await desenhar();
    return saida;
  } catch (erro) {
    recado(erro.message, true);
    return null;
  }
}

const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const dataBr = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const classeBarra = (valor, minimo = 80) => (valor >= minimo ? 'barra ok' : valor >= minimo * 0.75 ? 'barra' : 'barra baixa');

function barra(valor, minimo) {
  return el('div', { classe: classeBarra(valor, minimo) }, el('span', { style: `width:${Math.max(0, Math.min(100, valor))}%` }));
}

function indicador(rotulo, valor, nota) {
  return el(
    'div',
    { classe: 'cartao indicador' },
    el('div', { classe: 'rotulo', texto: rotulo }),
    el('div', { classe: 'valor', texto: valor }),
    nota ? el('div', { classe: 'nota', texto: nota }) : null,
  );
}

function tabela(colunas, linhas) {
  return el(
    'table',
    {},
    el('thead', {}, el('tr', {}, colunas.map((c) => el('th', { classe: c.n ? 'n' : null, texto: c.rotulo })))),
    el('tbody', {}, linhas),
  );
}

let NIVEIS = [];

/* ------------------------------------------------------------------ painel */
async function telaPainel(main) {
  const d = await api('GET', '/api/indicadores');
  main.append(
    el('div', { classe: 'cabecalho-pagina' },
      el('div', {},
        el('h1', { texto: 'Painel' }),
        el('p', { classe: 'legenda', texto: 'Onde a turma está agora — e quem está esperando alguma decisão.' }))),
    el('div', { classe: 'grade quatro' },
      indicador('Alunos ativos', d.alunos_ativos),
      indicador('Trilhas em curso', d.matriculas_em_curso),
      indicador('Média das fases', pct(d.media_geral), 'média dos percentuais em curso'),
      indicador('Aulas em 30 dias', d.aulas_30_dias)),
  );

  main.append(
    el('section', { classe: 'cartao' },
      el('h3', { texto: 'Média por trilha' }),
      d.por_trilha.length
        ? tabela(
            [{ rotulo: 'Trilha' }, { rotulo: 'Alunos', n: true }, { rotulo: 'Média', n: true }, { rotulo: '' }],
            d.por_trilha.map((t) =>
              el('tr', {},
                el('td', { texto: t.trilha }),
                el('td', { classe: 'n', texto: t.alunos }),
                el('td', { classe: 'n', texto: pct(t.media) }),
                el('td', { style: 'width:40%' }, barra(t.media)))),
          )
        : el('p', { classe: 'vazio', texto: 'Nenhuma matrícula em curso.' })),
  );

  main.append(
    el('section', { classe: 'cartao' },
      el('h3', { texto: `Prontos para avançar de fase (${d.prontos_para_avancar.length})` }),
      d.prontos_para_avancar.length
        ? tabela(
            [{ rotulo: 'Aluno' }, { rotulo: 'Trilha' }, { rotulo: 'Fase', n: true }, { rotulo: 'Percentual', n: true }, { rotulo: '' }],
            d.prontos_para_avancar.map((p) =>
              el('tr', {},
                el('td', {}, el('a', { href: `#/aluno/${p.aluno_id}`, texto: p.aluno })),
                el('td', { texto: p.trilha }),
                el('td', { classe: 'n', texto: p.fase_numero }),
                el('td', { classe: 'n' }, el('span', { classe: 'selo ok', texto: pct(p.percentual) })),
                el('td', { classe: 'n' },
                  el('button', {
                    onclick: () => avancar(p.matricula_id, p.trilha, p.fase_numero, p.percentual, p.minimo_avanco),
                    texto: 'Avançar fase',
                  })))),
          )
        : el('p', { classe: 'vazio', texto: 'Ninguém atingiu o mínimo da trilha ainda.' })),
  );

  main.append(
    el('section', { classe: 'cartao' },
      el('h3', { texto: `Sem avaliação há mais de ${d.dias_parado} dias (${d.parados.length})` }),
      d.parados.length
        ? tabela(
            [{ rotulo: 'Aluno' }, { rotulo: 'Trilha' }, { rotulo: 'Última avaliação', n: true }],
            d.parados.map((p) =>
              el('tr', {},
                el('td', { texto: p.aluno }),
                el('td', { texto: p.trilha }),
                el('td', { classe: 'n' },
                  p.ultima_avaliacao
                    ? el('span', { classe: 'selo alerta', texto: `${dataBr(p.ultima_avaliacao)} · ${p.dias_sem_avaliacao} dias` })
                    : el('span', { classe: 'selo alerta', texto: 'nunca avaliada' })))),
          )
        : el('p', { classe: 'vazio', texto: 'Todas as trilhas foram avaliadas no último mês.' })),
  );
}

/* ------------------------------------------------------------------ alunos */
async function telaAlunos(main) {
  const busca = new URLSearchParams(location.hash.split('?')[1] ?? '').get('busca') ?? '';
  const alunos = await api('GET', `/api/alunos${busca ? `?busca=${encodeURIComponent(busca)}` : ''}`);

  const campoBusca = el('input', { placeholder: 'Buscar pelo nome', value: busca, style: 'max-width:260px' });
  campoBusca.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') location.hash = `#/alunos?busca=${encodeURIComponent(campoBusca.value)}`;
  });

  const formulario = el('form', { classe: 'cartao', hidden: 'hidden' },
    el('h3', { texto: 'Novo aluno' }),
    el('div', { classe: 'campos' },
      el('div', { classe: 'largo' }, el('label', { texto: 'Nome' }), el('input', { name: 'nome', required: 'required' })),
      el('div', {}, el('label', { texto: 'Nascimento' }), el('input', { name: 'nascimento', type: 'date' })),
      el('div', {}, el('label', { texto: 'Início dos estudos' }), el('input', { name: 'inicio', type: 'date' })),
      el('div', {}, el('label', { texto: 'Professor' }), el('input', { name: 'professor' })),
      el('div', {}, el('label', { texto: 'Responsável' }), el('input', { name: 'responsavel' })),
      el('div', {}, el('label', { texto: 'Contato' }), el('input', { name: 'contato' })),
      el('div', { classe: 'largo' }, el('label', { texto: 'Observação' }), el('textarea', { name: 'observacao' }))),
    el('div', { style: 'margin-top:12px' }, el('button', { classe: 'primario', type: 'submit', texto: 'Cadastrar' })));
  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = Object.fromEntries(new FormData(formulario));
    await tentar(() => api('POST', '/api/alunos', dados), 'Aluno cadastrado.');
  });

  main.append(
    el('div', { classe: 'cabecalho-pagina' },
      el('div', {}, el('h1', { texto: 'Alunos' }), el('p', { classe: 'legenda', texto: `${alunos.length} aluno(s) na lista.` })),
      el('div', { classe: 'acoes' },
        campoBusca,
        el('button', { classe: 'primario', onclick: () => { formulario.hidden = !formulario.hidden; }, texto: '+ Novo aluno' }))),
    formulario,
  );

  main.append(
    el('section', { classe: 'cartao' },
      alunos.length
        ? tabela(
            [{ rotulo: 'Aluno' }, { rotulo: 'Trilhas' }, { rotulo: 'Média', n: true }, { rotulo: 'Frequência', n: true }, { rotulo: '', n: true }],
            alunos.map((a) => {
              const linha = el('tr', { classe: 'clicavel' },
                el('td', {},
                  el('div', { texto: a.nome, style: 'font-weight:600' }),
                  el('div', { classe: 'nota', style: 'font-size:12px;color:var(--tinta-fraca)', texto: a.professor ?? 'sem professor definido' })),
                el('td', {}, a.resumo.length
                  ? a.resumo.map((r) => el('span', { classe: 'selo', style: 'margin-right:6px', texto: `${r.trilha} F${r.fase_numero} · ${r.percentual}%` }))
                  : el('span', { classe: 'vazio', texto: 'sem matrícula' })),
                el('td', { classe: 'n', texto: pct(a.media_geral) }),
                el('td', { classe: 'n', texto: pct(a.frequencia) }),
                el('td', { classe: 'n' }, a.pode_avancar ? el('span', { classe: 'selo ok', texto: `${a.pode_avancar} apta(s) a avançar` }) : null));
              linha.addEventListener('click', () => { location.hash = `#/aluno/${a.id}`; });
              return linha;
            }),
          )
        : el('p', { classe: 'vazio', texto: 'Nenhum aluno encontrado.' })),
  );
}

/* ----------------------------------------------------------------- boletim */
async function avancar(matriculaId, trilha, fase, percentual, minimo) {
  const abaixo = percentual < minimo;
  const pergunta = abaixo
    ? `${trilha}: a fase ${fase} está em ${percentual}% e o mínimo é ${minimo}%. Escreva a justificativa para avançar assim mesmo (ou cancele):`
    : `Encerrar a fase ${fase} de ${trilha} com ${percentual}%? O percentual fica congelado no histórico.`;
  let justificativa = null;
  if (abaixo) {
    justificativa = prompt(pergunta);
    if (!justificativa) return;
  } else if (!confirm(pergunta)) return;
  await tentar(
    () => api('POST', `/api/matriculas/${matriculaId}/avancar`, { forcar: abaixo, justificativa }),
    `Fase ${fase} encerrada com ${percentual}%.`,
  );
}

function blocoObjetivo(matriculaId, objetivo, professorPadrao) {
  const seletor = el('select', {},
    el('option', { value: '', texto: 'Não avaliado', disabled: 'disabled', selected: objetivo.nivel === null ? 'selected' : null }),
    NIVEIS.map((n) => el('option', { value: n.nivel, selected: objetivo.nivel === n.nivel ? 'selected' : null, texto: `${n.nivel} — ${n.rotulo}` })));
  seletor.addEventListener('change', () =>
    tentar(
      () => api('POST', `/api/matriculas/${matriculaId}/avaliacoes`, {
        objetivo_id: objetivo.id,
        nivel: Number(seletor.value),
        professor: professorPadrao,
      }),
      `"${objetivo.titulo}" avaliado.`,
    ));

  return el('div', { classe: 'objetivo' },
    el('div', {},
      el('div', { classe: 'titulo', texto: objetivo.titulo }),
      el('div', { classe: 'meta', texto: `peso ${objetivo.peso} · ${objetivo.avaliado_em ? `avaliado em ${dataBr(objetivo.avaliado_em)}${objetivo.professor ? ` por ${objetivo.professor}` : ''}` : 'ainda não avaliado'}` })),
    el('div', { classe: 'niveis' }, seletor));
}

function blocoTrilha(trilha, aluno) {
  const cartao = el('section', { classe: 'cartao' });
  cartao.append(
    el('div', { classe: 'trilha-cabecalho' },
      el('div', {},
        el('h2', { texto: trilha.trilha }),
        el('div', { classe: 'meta', style: 'font-size:12.5px;color:var(--tinta-fraca)', texto: `${trilha.metodo ?? 'sem método'} · Fase ${trilha.fase_numero} de ${trilha.total_fases}: ${trilha.fase_nome}` })),
      el('div', { classe: 'pct', texto: pct(trilha.percentual) })),
    barra(trilha.percentual, trilha.minimo_avanco),
    el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px' },
      el('span', { classe: 'selo', texto: `trilha ${trilha.progresso_trilha}%` }),
      el('span', { classe: 'selo', texto: `cobertura ${pct(trilha.cobertura)}` }),
      trilha.situacao !== 'Em curso'
        ? el('span', { classe: 'selo acento', texto: trilha.situacao })
        : trilha.pode_avancar
          ? el('span', { classe: 'selo ok', texto: `atingiu o mínimo de ${trilha.minimo_avanco}%` })
          : el('span', { classe: 'selo alerta', texto: `faltam ${trilha.falta_para_avancar} pontos para o mínimo de ${trilha.minimo_avanco}%` }),
      trilha.situacao === 'Em curso'
        ? el('button', {
            style: 'margin-left:auto',
            classe: trilha.pode_avancar ? 'primario' : '',
            onclick: () => avancar(trilha.matricula_id, trilha.trilha, trilha.fase_numero, trilha.percentual, trilha.minimo_avanco),
            texto: 'Encerrar fase',
          })
        : null),
  );

  cartao.append(el('div', { style: 'margin-top:12px' }, trilha.objetivos.length
    ? trilha.objetivos.map((o) => blocoObjetivo(trilha.matricula_id, o, aluno.professor))
    : el('p', { classe: 'vazio', texto: 'Fase sem objetivos cadastrados — veja a aba Currículo.' })));

  if (trilha.fases_concluidas.length) {
    cartao.append(el('p', { classe: 'meta', style: 'font-size:12.5px;color:var(--tinta-fraca);margin:10px 0 0',
      texto: `Concluído: ${trilha.fases_concluidas.map((f) => `fase ${f.numero} (${f.percentual}% em ${dataBr(f.data)})`).join(' · ')}` }));
  }

  const detalhes = el('details', { classe: 'historico' }, el('summary', { texto: 'Histórico de avaliações' }));
  detalhes.addEventListener('toggle', async () => {
    if (!detalhes.open || detalhes.dataset.carregado) return;
    detalhes.dataset.carregado = '1';
    try {
      const linhas = await api('GET', `/api/matriculas/${trilha.matricula_id}/historico`);
      detalhes.append(linhas.length
        ? tabela(
            [{ rotulo: 'Data', n: true }, { rotulo: 'Fase', n: true }, { rotulo: 'Objetivo' }, { rotulo: 'Nível' }, { rotulo: 'Professor' }],
            linhas.map((h) => el('tr', {},
              el('td', { classe: 'n', texto: dataBr(h.data) }),
              el('td', { classe: 'n', texto: h.fase_numero }),
              el('td', { texto: h.objetivo }),
              el('td', { texto: `${h.nivel} — ${NIVEIS[h.nivel]?.rotulo ?? ''}` }),
              el('td', { texto: h.professor ?? '—' }))),
          )
        : el('p', { classe: 'vazio', texto: 'Nada lançado ainda.' }));
    } catch (erro) {
      detalhes.append(el('p', { classe: 'aviso erro', texto: erro.message }));
    }
  });
  cartao.append(detalhes);
  return cartao;
}

function blocoAulas(aluno, aulas) {
  const formulario = el('form', { classe: 'campos', style: 'margin-bottom:14px' },
    el('div', {}, el('label', { texto: 'Data' }), el('input', { name: 'data', type: 'date', value: new Date().toISOString().slice(0, 10) })),
    el('div', {}, el('label', { texto: 'Presença' }),
      el('select', { name: 'presenca' }, ['Presente', 'Falta', 'Falta justificada', 'Reposição'].map((p) => el('option', { value: p, texto: p })))),
    el('div', {}, el('label', { texto: 'Duração (min)' }), el('input', { name: 'duracao_min', type: 'number', value: '50', min: '5' })),
    el('div', { classe: 'largo' }, el('label', { texto: 'O que foi trabalhado' }), el('input', { name: 'conteudo' })),
    el('div', { classe: 'largo' }, el('button', { classe: 'primario', type: 'submit', texto: 'Registrar aula' })));
  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = Object.fromEntries(new FormData(formulario));
    dados.professor = aluno.professor ?? null;
    await tentar(() => api('POST', `/api/alunos/${aluno.id}/aulas`, dados), 'Aula registrada.');
  });

  return el('section', { classe: 'cartao' },
    el('h3', { texto: 'Aulas' }),
    formulario,
    aulas.length
      ? tabela(
          [{ rotulo: 'Data', n: true }, { rotulo: 'Presença' }, { rotulo: 'Conteúdo' }, { rotulo: '', n: true }],
          aulas.map((a) => el('tr', {},
            el('td', { classe: 'n', texto: dataBr(a.data) }),
            el('td', {}, el('span', { classe: a.presenca === 'Falta' ? 'selo alerta' : 'selo', texto: a.presenca })),
            el('td', { texto: a.conteudo ?? '—' }),
            el('td', { classe: 'n' }, el('button', {
              classe: 'discreto',
              onclick: () => tentar(() => api('DELETE', `/api/aulas/${a.id}`), 'Aula removida.'),
              texto: 'remover',
            })))),
        )
      : el('p', { classe: 'vazio', texto: 'Nenhuma aula registrada.' }));
}

async function telaAluno(main, id) {
  const [dados, trilhas] = await Promise.all([api('GET', `/api/alunos/${id}`), api('GET', '/api/trilhas')]);
  const { aluno, trilhas: matriculas, media_geral: media, frequencia: freq, ultimas_aulas: aulas } = dados;
  const disponiveis = trilhas.filter((t) => !matriculas.some((m) => m.trilha_id === t.id));

  const seletorTrilha = el('select', { style: 'width:auto' },
    el('option', { value: '', texto: 'Matricular em…' }),
    disponiveis.map((t) => el('option', { value: t.id, texto: t.nome })));
  seletorTrilha.addEventListener('change', () => {
    if (!seletorTrilha.value) return;
    tentar(() => api('POST', `/api/alunos/${id}/matriculas`, { trilha_id: Number(seletorTrilha.value) }), 'Aluno matriculado.');
  });

  main.append(
    el('div', { classe: 'cabecalho-pagina' },
      el('div', {},
        el('a', { href: '#/alunos', style: 'font-size:13px', texto: '← alunos' }),
        el('h1', { texto: aluno.nome }),
        el('p', { classe: 'legenda', texto: `${aluno.professor ?? 'sem professor definido'} · estuda desde ${dataBr(aluno.inicio)}${aluno.responsavel ? ` · responsável: ${aluno.responsavel}` : ''}` })),
      el('div', { classe: 'acoes' },
        disponiveis.length ? seletorTrilha : null,
        el('a', { href: `/boletim/${id}`, target: '_blank', rel: 'noopener' },
          el('button', { texto: 'Imprimir boletim' })))),
    el('div', { classe: 'grade quatro' },
      indicador('Média das trilhas', pct(media), 'não é digitada: sai das avaliações'),
      indicador('Frequência', pct(freq.percentual), `${freq.presencas} de ${freq.aulas} aulas`),
      indicador('Trilhas em curso', matriculas.filter((m) => m.situacao === 'Em curso').length),
      indicador('Prontas para avançar', matriculas.filter((m) => m.pode_avancar).length)),
  );

  if (aluno.observacao) {
    main.append(el('p', { classe: 'aviso info', texto: aluno.observacao }));
  }

  if (matriculas.length) {
    matriculas.forEach((t) => main.append(blocoTrilha(t, aluno)));
  } else {
    main.append(el('section', { classe: 'cartao' }, el('p', { classe: 'vazio', texto: 'Aluno ainda sem trilha. Use "Matricular em…" acima.' })));
  }

  main.append(blocoAulas(aluno, aulas));
}

/* ---------------------------------------------------------------- currículo */
function blocoFase(trilha, fase) {
  const novoObjetivo = el('form', { classe: 'campos', style: 'margin:10px 0 4px' },
    el('div', { classe: 'largo' }, el('input', { name: 'titulo', placeholder: 'Novo objetivo desta fase', required: 'required' })),
    el('div', {}, el('input', { name: 'peso', type: 'number', step: '0.5', min: '0.5', value: '3', placeholder: 'peso', title: 'Peso do objetivo dentro da fase' })),
    el('div', {}, el('button', { type: 'submit', texto: 'Adicionar objetivo' })));
  novoObjetivo.addEventListener('submit', async (e) => {
    e.preventDefault();
    await tentar(() => api('POST', `/api/fases/${fase.id}/objetivos`, Object.fromEntries(new FormData(novoObjetivo))), 'Objetivo criado.');
  });

  const peso = fase.objetivos.reduce((s, o) => s + o.peso, 0);
  return el('div', { style: 'border-top:1px solid var(--linha);padding:12px 0' },
    el('div', { style: 'display:flex;gap:10px;align-items:baseline' },
      el('strong', { texto: `Fase ${fase.numero} — ${fase.nome}` }),
      el('span', { classe: 'selo', texto: `${fase.objetivos.length} objetivo(s) · peso ${Math.round(peso * 100) / 100}` }),
      el('button', {
        classe: 'discreto',
        style: 'margin-left:auto',
        onclick: () => confirm(`Excluir a fase ${fase.numero} de ${trilha.nome}?`)
          && tentar(() => api('DELETE', `/api/fases/${fase.id}`), 'Fase excluída.'),
        texto: 'excluir fase',
      })),
    fase.objetivos.length
      ? tabela(
          [{ rotulo: 'Objetivo' }, { rotulo: 'Peso', n: true }, { rotulo: '', n: true }],
          fase.objetivos.map((o) => el('tr', {},
            el('td', { texto: o.titulo }),
            el('td', { classe: 'n', texto: o.peso }),
            el('td', { classe: 'n' }, el('button', {
              classe: 'discreto',
              onclick: () => tentar(() => api('DELETE', `/api/objetivos/${o.id}`), 'Objetivo retirado da fase.'),
              texto: 'remover',
            })))),
        )
      : el('p', { classe: 'vazio', texto: 'Fase sem objetivos: quem estiver nela fica em 0%.' }),
    novoObjetivo);
}

async function telaTrilhas(main) {
  const trilhas = await api('GET', '/api/trilhas');

  const nova = el('form', { classe: 'cartao', hidden: 'hidden' },
    el('h3', { texto: 'Nova trilha' }),
    el('div', { classe: 'campos' },
      el('div', {}, el('label', { texto: 'Nome' }), el('input', { name: 'nome', required: 'required' })),
      el('div', {}, el('label', { texto: 'Método' }), el('input', { name: 'metodo' })),
      el('div', {}, el('label', { texto: 'Mínimo para avançar (%)' }), el('input', { name: 'minimo_avanco', type: 'number', value: '80', min: '0', max: '100' })),
      el('div', { classe: 'largo' }, el('label', { texto: 'Descrição' }), el('input', { name: 'descricao' }))),
    el('div', { style: 'margin-top:12px' }, el('button', { classe: 'primario', type: 'submit', texto: 'Criar trilha' })));
  nova.addEventListener('submit', async (e) => {
    e.preventDefault();
    await tentar(() => api('POST', '/api/trilhas', Object.fromEntries(new FormData(nova))), 'Trilha criada.');
  });

  main.append(
    el('div', { classe: 'cabecalho-pagina' },
      el('div', {},
        el('h1', { texto: 'Currículo' }),
        el('p', { classe: 'legenda', texto: 'Trilha, fases e objetivos. O peso do objetivo é o que ele vale no percentual da fase.' })),
      el('div', { classe: 'acoes' },
        el('button', { classe: 'primario', onclick: () => { nova.hidden = !nova.hidden; }, texto: '+ Nova trilha' }))),
    nova,
  );

  for (const trilha of trilhas) {
    const minimo = el('input', { type: 'number', value: trilha.minimo_avanco, min: '0', max: '100', style: 'width:80px' });
    minimo.addEventListener('change', () =>
      tentar(() => api('PUT', `/api/trilhas/${trilha.id}`, { minimo_avanco: Number(minimo.value) }), 'Mínimo atualizado.'));

    const novaFase = el('form', { classe: 'campos', style: 'margin-top:12px' },
      el('div', { classe: 'largo' }, el('input', { name: 'nome', placeholder: 'Nome da próxima fase', required: 'required' })),
      el('div', {}, el('button', { type: 'submit', texto: 'Adicionar fase' })));
    novaFase.addEventListener('submit', async (e) => {
      e.preventDefault();
      await tentar(() => api('POST', `/api/trilhas/${trilha.id}/fases`, Object.fromEntries(new FormData(novaFase))), 'Fase criada.');
    });

    main.append(el('section', { classe: 'cartao' },
      el('div', { style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap' },
        el('div', {},
          el('h2', { texto: trilha.nome }),
          el('div', { style: 'font-size:12.5px;color:var(--tinta-fraca)', texto: `${trilha.metodo ?? 'sem método'} · ${trilha.fases.length} fase(s) · ${trilha.alunos} aluno(s)` })),
        el('div', { style: 'margin-left:auto;display:flex;gap:8px;align-items:center' },
          el('label', { texto: 'mínimo para avançar (%)', style: 'margin:0' }),
          minimo)),
      trilha.descricao ? el('p', { classe: 'legenda', style: 'margin:8px 0 0', texto: trilha.descricao }) : null,
      trilha.fases.map((f) => blocoFase(trilha, f)),
      novaFase));
  }
}

/* ------------------------------------------------------------------ rotear */
async function desenhar() {
  const main = document.querySelector('main');
  const hash = location.hash || '#/';
  const caminho = hash.split('?')[0];
  main.replaceChildren(el('p', { classe: 'vazio', texto: 'Carregando…' }));

  document.querySelectorAll('nav a').forEach((a) => {
    const alvo = a.getAttribute('href');
    a.classList.toggle('ativo', alvo === caminho || (alvo === '#/alunos' && caminho.startsWith('#/aluno')));
  });

  try {
    if (!NIVEIS.length) NIVEIS = await api('GET', '/api/niveis');
    const conteudo = document.createDocumentFragment();
    const alvo = { append: (...n) => conteudo.append(...n) };
    if (caminho.startsWith('#/aluno/')) await telaAluno(alvo, caminho.split('/')[2]);
    else if (caminho.startsWith('#/alunos')) await telaAlunos(alvo);
    else if (caminho.startsWith('#/trilhas')) await telaTrilhas(alvo);
    else await telaPainel(alvo);
    main.replaceChildren(conteudo);
  } catch (erro) {
    main.replaceChildren(el('div', { classe: 'aviso erro', texto: erro.message }));
  }
}

window.addEventListener('hashchange', desenhar);
desenhar();
