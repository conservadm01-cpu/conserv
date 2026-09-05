import { boletim, NIVEIS } from './progresso.js';

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const dataBr = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

const ESTILO = `
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Georgia, serif; color: #111; margin: 0; font-size: 11pt; }
  header { display: flex; justify-content: space-between; align-items: flex-end;
           border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 12px; }
  h1 { font-size: 16pt; margin: 0; letter-spacing: .04em; }
  .sub { font-size: 9pt; text-transform: uppercase; letter-spacing: .12em; color: #555; }
  .dados { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 14px; margin-bottom: 14px; }
  .dados div { border-bottom: 1px dotted #999; padding-bottom: 2px; }
  .rot { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .1em; color: #666; }
  .trilha { border: 1px solid #111; margin-bottom: 10px; break-inside: avoid; }
  .trilha h2 { font-size: 12pt; margin: 0; padding: 5px 8px; background: #111; color: #fff;
               display: flex; justify-content: space-between; }
  .trilha h2 span { font-weight: normal; font-size: 9.5pt; }
  .faixa { padding: 6px 8px; }
  .barra { height: 12px; border: 1px solid #111; position: relative; background: #fff; }
  .barra i { position: absolute; inset: 0 auto 0 0; background: #111; display: block; }
  .barra b { position: absolute; right: 4px; top: -1px; font-size: 8pt; mix-blend-mode: difference; color: #fff; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th, td { border-top: 1px solid #ccc; padding: 3px 8px; text-align: left; vertical-align: top; }
  th { font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; color: #555; }
  td.n, th.n { text-align: right; white-space: nowrap; }
  .escala { font-size: 8pt; color: #444; margin: 10px 0 16px; }
  .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 26px; }
  .assinaturas div { border-top: 1px solid #111; padding-top: 4px; font-size: 9pt; text-align: center; }
  footer { margin-top: 12px; font-size: 8pt; color: #666; border-top: 1px solid #ccc; padding-top: 4px; }
  @media screen { body { max-width: 210mm; margin: 0 auto; padding: 16mm 12mm; background: #fff; } }
`;

/** Boletim em A4, pronto para a impressora ou para salvar em PDF pelo navegador. */
export function boletimHtml(alunoId) {
  const { aluno, trilhas, media_geral: media, frequencia: freq, ultimas_aulas: aulas } = boletim(alunoId);

  const blocos = trilhas
    .map((t) => {
      const linhas = t.objetivos
        .map(
          (o) => `<tr>
            <td>${esc(o.titulo)}</td>
            <td class="n">${o.peso}</td>
            <td>${esc(o.rotulo_nivel)}</td>
            <td class="n">${o.avaliado_em ? dataBr(o.avaliado_em) : '—'}</td>
          </tr>`,
        )
        .join('');
      const fechadas = t.fases_concluidas
        .map((f) => `Fase ${f.numero} (${f.percentual}% em ${dataBr(f.data)})`)
        .join(' · ');
      return `<section class="trilha">
        <h2>${esc(t.trilha)}<span>${esc(t.metodo ?? 'sem método definido')} — Fase ${t.fase_numero} de ${t.total_fases}: ${esc(t.fase_nome)}</span></h2>
        <div class="faixa">
          <div class="barra"><i style="width:${t.percentual}%"></i><b>${t.percentual}%</b></div>
          <p class="escala">Progresso na trilha: ${t.progresso_trilha}% · Mínimo para avançar de fase: ${t.minimo_avanco}% ·
          ${t.pode_avancar ? 'apto a avançar' : `faltam ${t.falta_para_avancar} pontos`}${fechadas ? ` · Concluído: ${esc(fechadas)}` : ''}</p>
          <table>
            <thead><tr><th>Objetivo da fase</th><th class="n">Peso</th><th>Avaliação</th><th class="n">Data</th></tr></thead>
            <tbody>${linhas || '<tr><td colspan="4">Fase sem objetivos cadastrados.</td></tr>'}</tbody>
          </table>
        </div>
      </section>`;
    })
    .join('');

  const historicoAulas = aulas
    .map(
      (a) => `<tr><td class="n">${dataBr(a.data)}</td><td>${esc(a.presenca)}</td>
              <td>${esc(a.conteudo ?? '')}</td><td>${esc(a.professor ?? '')}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Boletim — ${esc(aluno.nome)}</title>
<style>${ESTILO}</style></head>
<body>
  <header>
    <div><h1>CLAVE</h1><div class="sub">Boletim de progresso musical</div></div>
    <div class="sub">Emitido em ${dataBr(new Date().toISOString())}</div>
  </header>

  <div class="dados">
    <div><span class="rot">Aluno</span>${esc(aluno.nome)}</div>
    <div><span class="rot">Professor</span>${esc(aluno.professor ?? '—')}</div>
    <div><span class="rot">Início</span>${dataBr(aluno.inicio)}</div>
    <div><span class="rot">Média das trilhas</span>${media === null ? '—' : `${media}%`}</div>
    <div><span class="rot">Responsável</span>${esc(aluno.responsavel ?? '—')}</div>
    <div><span class="rot">Contato</span>${esc(aluno.contato ?? '—')}</div>
    <div><span class="rot">Aulas registradas</span>${freq.aulas}</div>
    <div><span class="rot">Frequência</span>${freq.percentual === null ? '—' : `${freq.percentual}%`}</div>
  </div>

  ${blocos || '<p>Aluno ainda sem matrícula em trilha.</p>'}

  <p class="escala"><strong>Escala:</strong> ${NIVEIS.map((n) => `${n.nivel} ${n.rotulo}`).join(' · ')}.
  O percentual de cada fase é a média dos níveis, ponderada pelo peso dos objetivos — não é nota digitada.</p>

  ${
    historicoAulas
      ? `<table><thead><tr><th class="n">Data</th><th>Presença</th><th>Conteúdo da aula</th><th>Professor</th></tr></thead>
         <tbody>${historicoAulas}</tbody></table>`
      : ''
  }

  <div class="assinaturas">
    <div>Professor</div>
    <div>Responsável / aluno</div>
  </div>
  <footer>CLAVE — acompanhamento de alunos de música. Documento gerado pelo sistema; percentuais derivados das avaliações lançadas.</footer>
</body></html>`;
}
