import { useState } from 'react';
import { api, ApiError, query } from '../lib/api';
import { useApi, useDebounce } from '../lib/hooks';
import { data, decimal, moeda } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Etiqueta, Campo, Modal, Indicador } from '../components/ui';
import type { PosicaoEstoque, Movimento, Fornecedor } from '../tipos';

const TIPOS = ['TECIDO', 'AVIAMENTO', 'EMBALAGEM', 'TINTA', 'ETIQUETA', 'SERVICO', 'OUTRO'];

export default function Estoque() {
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [soAbaixo, setSoAbaixo] = useState(false);
  const [movimentar, setMovimentar] = useState<PosicaoEstoque | null>(null);
  const [historico, setHistorico] = useState<PosicaoEstoque | null>(null);
  const buscaLenta = useDebounce(busca);

  const caminho = `/materiais/estoque/posicao${query({
    busca: buscaLenta, tipo, abaixo_minimo: soAbaixo ? 'true' : '',
  })}`;
  const { dados, carregando, erro, recarregar } = useApi<PosicaoEstoque[]>(caminho, [caminho]);

  const valorTotal = (dados ?? []).reduce((s, m) => s + m.valor_estoque, 0);
  const abaixo = (dados ?? []).filter((m) => m.abaixo_minimo).length;

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Estoque de materiais</h1>
          <p>Saldo do almoxarifado, entradas, saídas e ajustes</p>
        </div>
      </header>

      <div className="grade c3">
        <Indicador rotulo="Materiais" valor={dados?.length ?? 0} />
        <Indicador rotulo="Valor em estoque" valor={moeda(valorTotal)} />
        <Indicador rotulo="Abaixo do mínimo" valor={abaixo} tom={abaixo ? 'perigo' : 'sucesso'} />
      </div>

      <Cartao>
        <div className="filtros" style={{ marginBottom: 14 }}>
          <Campo rotulo="Buscar">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Descrição ou código" />
          </Campo>
          <Campo rotulo="Tipo">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>
              {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Filtro">
            <label style={{ display: 'flex', gap: 6, margin: 0, paddingTop: 7, fontWeight: 400 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={soAbaixo}
                onChange={(e) => setSoAbaixo(e.target.checked)} /> só abaixo do mínimo
            </label>
          </Campo>
        </div>

        {carregando && <Carregando />}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {dados && dados.length === 0 && <Vazio texto="Nenhum material cadastrado. Use o cadastro de materiais." />}
        {dados && dados.length > 0 && (
          <div className="tabela-rolagem" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Código</th><th>Material</th><th>Tipo</th><th>Fornecedor</th>
                  <th className="num">Saldo</th><th className="num">Mínimo</th>
                  <th className="num">Custo unit.</th><th className="num">Valor</th><th />
                </tr>
              </thead>
              <tbody>
                {dados.map((m) => (
                  <tr key={m.id}>
                    <td>{m.codigo ?? '—'}</td>
                    <td>{m.descricao}</td>
                    <td>{m.tipo}</td>
                    <td>{m.fornecedor ?? '—'}</td>
                    <td className="num">
                      {decimal(m.saldo)} {m.unidade}
                      {m.abaixo_minimo === 1 && <> <Etiqueta texto="mín." tom="amarela" /></>}
                    </td>
                    <td className="num">{decimal(m.estoque_min)}</td>
                    <td className="num">{moeda(m.custo_unitario)}</td>
                    <td className="num">{moeda(m.valor_estoque)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="pequeno" onClick={() => setMovimentar(m)}>Movimentar</button>{' '}
                      <button className="pequeno" onClick={() => setHistorico(m)}>Extrato</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <FormularioMovimento
        material={movimentar}
        aoFechar={() => setMovimentar(null)}
        aoSalvar={() => { setMovimentar(null); recarregar(); }}
      />
      <Extrato material={historico} aoFechar={() => setHistorico(null)} />
    </>
  );
}

function FormularioMovimento({ material, aoFechar, aoSalvar }: {
  material: PosicaoEstoque | null; aoFechar: () => void; aoSalvar: () => void;
}) {
  const [tipo, setTipo] = useState<'ENTRADA' | 'SAIDA' | 'AJUSTE'>('ENTRADA');
  const [quantidade, setQuantidade] = useState('');
  const [custo, setCusto] = useState('');
  const [documento, setDocumento] = useState('');
  const [fornecedorId, setFornecedorId] = useState<number | ''>('');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const { dados: fornecedores } = useApi<Fornecedor[]>(material ? '/fornecedores?ativo=true' : null);

  async function salvar() {
    if (!material) return;
    const qtd = Number(quantidade);
    if (!(qtd > 0)) return setErro('Informe uma quantidade maior que zero.');
    setSalvando(true);
    setErro('');
    try {
      await api.post('/materiais/estoque/movimentos', {
        material_id: material.id,
        tipo,
        quantidade: qtd,
        custo_unitario: custo === '' ? undefined : Number(custo),
        documento: documento.trim() || null,
        fornecedor_id: fornecedorId ? Number(fornecedorId) : null,
        observacao: observacao.trim() || null,
      });
      setQuantidade(''); setCusto(''); setDocumento(''); setObservacao('');
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível registrar o movimento');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={material ? `Movimentar — ${material.descricao}` : ''}
      aberto={Boolean(material)}
      aoFechar={aoFechar}
      rodape={
        <>
          <button onClick={aoFechar}>Cancelar</button>
          <button className="primario" onClick={salvar} disabled={salvando}>
            {salvando ? 'Registrando…' : 'Registrar movimento'}
          </button>
        </>
      }
    >
      <Aviso tipo="erro">{erro}</Aviso>
      {material && (
        <p style={{ marginTop: 0, color: 'var(--texto-fraco)' }}>
          Saldo atual: <strong>{decimal(material.saldo)} {material.unidade}</strong> · mínimo {decimal(material.estoque_min)}
        </p>
      )}
      <div className="linha-campos">
        <Campo rotulo="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="ENTRADA">Entrada (compra/devolução)</option>
            <option value="SAIDA">Saída (consumo/perda)</option>
            <option value="AJUSTE">Ajuste de inventário (soma)</option>
          </select>
        </Campo>
        <Campo rotulo={`Quantidade (${material?.unidade ?? ''})`}>
          <input type="number" min="0" step="any" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} autoFocus />
        </Campo>
        <Campo rotulo="Custo unitário (opcional)">
          <input type="number" min="0" step="any" value={custo} onChange={(e) => setCusto(e.target.value)}
            placeholder={String(material?.custo_unitario ?? '')} />
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Documento / NF">
          <input value={documento} onChange={(e) => setDocumento(e.target.value)} />
        </Campo>
        <Campo rotulo="Fornecedor">
          <select value={fornecedorId} onChange={(e) => setFornecedorId(Number(e.target.value) || '')}>
            <option value="">—</option>
            {fornecedores?.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </Campo>
      </div>
      <Campo rotulo="Observação">
        <input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </Campo>
    </Modal>
  );
}

function Extrato({ material, aoFechar }: { material: PosicaoEstoque | null; aoFechar: () => void }) {
  const { dados, carregando } = useApi<Movimento[]>(
    material ? `/materiais/estoque/movimentos?material_id=${material.id}&limite=200` : null
  );

  return (
    <Modal titulo={material ? `Extrato — ${material.descricao}` : ''} aberto={Boolean(material)} aoFechar={aoFechar} largo>
      {carregando && <Carregando />}
      {dados && dados.length === 0 && <Vazio texto="Nenhum movimento registrado." />}
      {dados && dados.length > 0 && (
        <div className="tabela-rolagem" style={{ maxHeight: '58vh', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Data</th><th>Tipo</th><th className="num">Qtd</th><th className="num">Custo</th>
                <th>Documento</th><th>Ordem</th><th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((m) => (
                <tr key={m.id}>
                  <td>{data(m.data)}</td>
                  <td>
                    <Etiqueta
                      texto={m.tipo === 'ENTRADA' ? 'Entrada' : m.tipo === 'SAIDA' ? 'Saída' : 'Ajuste'}
                      tom={m.tipo === 'ENTRADA' ? 'verde' : m.tipo === 'SAIDA' ? 'vermelha' : 'azul'}
                    />
                  </td>
                  <td className="num">{m.tipo === 'SAIDA' ? '−' : '+'}{decimal(m.quantidade)} {m.unidade}</td>
                  <td className="num">{moeda(m.custo_unitario)}</td>
                  <td>{m.documento ?? '—'}</td>
                  <td>{m.ordem ?? '—'}</td>
                  <td>{m.observacao ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
