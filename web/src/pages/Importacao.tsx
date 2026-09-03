import { useState, type ChangeEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { Cartao, Aviso, Campo, Indicador } from '../components/ui';
import type { RelatorioImportacao } from '../tipos';

export default function Importacao() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [abas, setAbas] = useState('');
  const [abrirOrdens, setAbrirOrdens] = useState(true);
  const [simular, setSimular] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [relatorio, setRelatorio] = useState<RelatorioImportacao | null>(null);

  const escolher = (e: ChangeEvent<HTMLInputElement>) => {
    setArquivo(e.target.files?.[0] ?? null);
    setRelatorio(null);
    setErro('');
  };

  async function enviar() {
    if (!arquivo) return setErro('Selecione um arquivo .xlsx');
    setEnviando(true);
    setErro('');
    setRelatorio(null);
    try {
      const dados = new FormData();
      dados.append('arquivo', arquivo);
      dados.append('abrir_ordens', String(abrirOrdens));
      dados.append('simular', String(simular));
      if (abas.trim()) dados.append('abas', abas.trim());
      setRelatorio(await api.upload<RelatorioImportacao>('/importacao/planilha', dados));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao importar a planilha');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Importar planilha</h1>
          <p>Traz pedidos, clientes, produtos e o andamento das etapas de uma planilha de carteira/PCP</p>
        </div>
      </header>

      <Cartao titulo="Arquivo">
        <Aviso tipo="info">
          O importador reconhece as abas pelo cabeçalho (cliente, produto e quantidade são obrigatórios) e
          entende as colunas de acompanhamento — <strong>matéria-prima, corte, silk, costura, embalagem, NF e
          entrega</strong> — para reconstruir o roteiro de cada ordem. Registros repetidos entre abas são
          descartados automaticamente. Comece sempre com a <strong>simulação</strong>.
        </Aviso>
        <Aviso tipo="erro">{erro}</Aviso>

        <div className="linha-campos">
          <Campo rotulo="Planilha (.xlsx)">
            <input type="file" accept=".xlsx,.xlsm" onChange={escolher} />
          </Campo>
          <Campo rotulo="Abas específicas (opcional)">
            <input value={abas} onChange={(e) => setAbas(e.target.value)} placeholder="Ex.: PCP + MO, Planilha1" />
          </Campo>
        </div>

        <div style={{ display: 'flex', gap: 20, margin: '4px 0 16px', fontSize: 13 }}>
          <label style={{ display: 'flex', gap: 6, margin: 0, fontWeight: 400 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={simular}
              onChange={(e) => setSimular(e.target.checked)} />
            Simular (não grava nada)
          </label>
          <label style={{ display: 'flex', gap: 6, margin: 0, fontWeight: 400 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={abrirOrdens}
              onChange={(e) => setAbrirOrdens(e.target.checked)} />
            Abrir ordens de produção
          </label>
        </div>

        <button className="primario" onClick={enviar} disabled={enviando || !arquivo}>
          {enviando ? 'Processando…' : simular ? 'Simular importação' : 'Importar de verdade'}
        </button>
      </Cartao>

      {relatorio && (
        <>
          <Aviso tipo={relatorio.simulacao ? 'info' : 'ok'}>
            {relatorio.simulacao
              ? 'Simulação concluída — nada foi gravado. Desmarque “Simular” para efetivar.'
              : 'Importação concluída e gravada no banco.'}
          </Aviso>

          <div className="grade c4">
            <Indicador rotulo="Pedidos" valor={relatorio.totais.pedidos} />
            <Indicador rotulo="Itens" valor={relatorio.totais.itens} />
            <Indicador rotulo="Ordens abertas" valor={relatorio.totais.ordens} />
            <Indicador rotulo="Clientes novos" valor={relatorio.totais.clientes} />
            <Indicador rotulo="Produtos novos" valor={relatorio.totais.produtos} />
            <Indicador rotulo="Linhas duplicadas" valor={relatorio.totais.duplicadas} nota="já existiam em outra aba" />
            <Indicador rotulo="Linhas incompletas" valor={relatorio.totais.ignoradas} nota="sem cliente, produto ou quantidade" />
          </div>

          <Cartao titulo={`Abas de ${relatorio.arquivo}`}>
            <table>
              <thead>
                <tr>
                  <th>Aba</th><th className="num">Itens</th><th className="num">Pedidos</th>
                  <th className="num">Ordens</th><th className="num">Duplicadas</th>
                  <th className="num">Incompletas</th><th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.abas.map((a) => (
                  <tr key={a.aba}>
                    <td>{a.aba}</td>
                    <td className="num">{a.itens ?? '—'}</td>
                    <td className="num">{a.pedidos ?? '—'}</td>
                    <td className="num">{a.ordens ?? '—'}</td>
                    <td className="num">{a.duplicadas ?? '—'}</td>
                    <td className="num">{a.ignoradas ?? '—'}</td>
                    <td>
                      {a.importada
                        ? <span className="etiqueta verde">importada</span>
                        : <span className="etiqueta" title={a.motivo}>ignorada</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>

          {relatorio.avisos.length > 0 && (
            <Cartao titulo={`Avisos (${relatorio.avisos.length})`}>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--texto-fraco)', fontSize: 13 }}>
                {relatorio.avisos.slice(0, 30).map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </Cartao>
          )}
        </>
      )}
    </>
  );
}
