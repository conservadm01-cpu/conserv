import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/hooks';
import { decimal, moeda } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Campo, Indicador } from '../components/ui';
import type { ItemFicha, CustoProcesso, Produto, PosicaoEstoque } from '../tipos';

export default function ProdutoDetalhe() {
  const { id } = useParams();
  const [mensagem, setMensagem] = useState('');
  const [falha, setFalha] = useState('');

  const { dados: produto } = useApi<Produto>(`/produtos/${id}`);
  const { dados: ficha, carregando, recarregar } = useApi<ItemFicha[]>(`/produtos/${id}/ficha-tecnica`);
  const { dados: custos, recarregar: recarregarCustos } = useApi<CustoProcesso[]>(`/produtos/${id}/custos-processo`);
  const { dados: materiais } = useApi<PosicaoEstoque[]>('/materiais/estoque/posicao');

  const [materialId, setMaterialId] = useState<number | ''>('');
  const [consumo, setConsumo] = useState('');
  const [perda, setPerda] = useState('0');
  const [valoresMO, setValoresMO] = useState<Record<number, string>>({});
  const [salvandoMO, setSalvandoMO] = useState(false);

  useEffect(() => {
    if (custos) setValoresMO(Object.fromEntries(custos.map((c) => [c.etapa_id, String(c.custo_por_peca)])));
  }, [custos]);

  const custoMaterial = (ficha ?? []).reduce((s, f) => s + f.custo_por_peca, 0);
  const custoMO = Object.values(valoresMO).reduce((s, v) => s + (Number(v) || 0), 0);
  const custoTotal = custoMaterial + custoMO;
  const preco = produto?.preco_padrao ?? 0;

  async function adicionarMaterial() {
    if (!materialId || !(Number(consumo) > 0)) return setFalha('Escolha o material e informe o consumo por peça.');
    setFalha('');
    try {
      await api.post(`/produtos/${id}/ficha-tecnica`, {
        material_id: Number(materialId),
        consumo_por_peca: Number(consumo),
        perda_percentual: Number(perda) || 0,
      });
      setMaterialId(''); setConsumo(''); setPerda('0');
      setMensagem('Material adicionado à ficha técnica.');
      recarregar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível adicionar');
    }
  }

  async function removerMaterial(material: ItemFicha) {
    if (!confirm(`Remover "${material.material}" da ficha técnica?`)) return;
    await api.delete(`/produtos/${id}/ficha-tecnica/${material.material_id}`);
    recarregar();
  }

  async function salvarCustosMO() {
    setSalvandoMO(true);
    setFalha('');
    try {
      await api.put(
        `/produtos/${id}/custos-processo`,
        Object.entries(valoresMO).map(([etapaId, valor]) => ({
          etapa_id: Number(etapaId),
          custo_por_peca: Number(valor) || 0,
        }))
      );
      setMensagem('Custos de mão de obra salvos. Use “Recalcular” nas ordens abertas para aplicá-los.');
      recarregarCustos();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível salvar os custos');
    } finally {
      setSalvandoMO(false);
    }
  }

  if (carregando) return <Carregando />;

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>{produto?.descricao ?? 'Produto'}</h1>
          <p>
            {produto?.grupo ?? 'sem grupo'} · linha {produto?.linha} · preço padrão {moeda(preco)}
          </p>
        </div>
        <div className="acoes"><Link className="botao" to="/produtos">Voltar</Link></div>
      </header>

      <Aviso tipo="erro">{falha}</Aviso>
      <Aviso tipo="ok">{mensagem}</Aviso>

      <div className="grade c4">
        <Indicador rotulo="Custo de material / peça" valor={moeda(custoMaterial)} nota={`${ficha?.length ?? 0} materiais`} />
        <Indicador rotulo="Custo de MO / peça" valor={moeda(custoMO)} />
        <Indicador rotulo="Custo total / peça" valor={moeda(custoTotal)} />
        <Indicador
          rotulo="Margem por peça"
          valor={moeda(preco - custoTotal)}
          tom={preco - custoTotal >= 0 ? 'sucesso' : 'perigo'}
          nota={preco > 0 ? `${(((preco - custoTotal) / preco) * 100).toFixed(1)}% do preço` : 'sem preço padrão'}
        />
      </div>

      <div className="grade c2" style={{ marginTop: 16 }}>
        <Cartao titulo="Ficha técnica" acao={<small>consumo por peça produzida</small>}>
          {(!ficha || ficha.length === 0) && <Vazio texto="Nenhum material na ficha técnica ainda." />}
          {ficha && ficha.length > 0 && (
            <div className="tabela-rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Material</th><th className="num">Consumo/pç</th><th className="num">Perda</th>
                    <th className="num">Custo/pç</th><th />
                  </tr>
                </thead>
                <tbody>
                  {ficha.map((f) => (
                    <tr key={f.id}>
                      <td>{f.material}</td>
                      <td className="num">{decimal(f.consumo_por_peca)} {f.unidade}</td>
                      <td className="num">{decimal(f.perda_percentual)}%</td>
                      <td className="num">{moeda(f.custo_por_peca)}</td>
                      <td><button className="pequeno perigo" onClick={() => removerMaterial(f)}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="linha-campos" style={{ marginTop: 16, alignItems: 'end' }}>
            <Campo rotulo="Material">
              <select value={materialId} onChange={(e) => setMaterialId(Number(e.target.value) || '')}>
                <option value="">Selecione…</option>
                {materiais?.map((m) => <option key={m.id} value={m.id}>{m.descricao} ({m.unidade})</option>)}
              </select>
            </Campo>
            <Campo rotulo="Consumo por peça">
              <input type="number" min="0" step="any" value={consumo} onChange={(e) => setConsumo(e.target.value)} />
            </Campo>
            <Campo rotulo="Perda (%)">
              <input type="number" min="0" step="any" value={perda} onChange={(e) => setPerda(e.target.value)} />
            </Campo>
            <div className="campo">
              <button className="primario" style={{ width: '100%' }} onClick={adicionarMaterial}>Adicionar</button>
            </div>
          </div>
        </Cartao>

        <Cartao
          titulo="Custo de mão de obra por etapa"
          acao={
            <button className="primario pequeno" onClick={salvarCustosMO} disabled={salvandoMO}>
              {salvandoMO ? 'Salvando…' : 'Salvar custos'}
            </button>
          }
        >
          <table>
            <thead>
              <tr><th>Etapa</th><th style={{ width: 150 }}>Custo por peça (R$)</th></tr>
            </thead>
            <tbody>
              {custos?.map((c) => (
                <tr key={c.etapa_id}>
                  <td>{c.nome}</td>
                  <td>
                    <input
                      type="number" min="0" step="any"
                      value={valoresMO[c.etapa_id] ?? ''}
                      onChange={(e) => setValoresMO((v) => ({ ...v, [c.etapa_id]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total por peça</strong></td>
                <td className="num"><strong>{moeda(custoMO)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </Cartao>
      </div>
    </>
  );
}
