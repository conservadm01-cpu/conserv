import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/hooks';
import { decimal, moeda } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Campo, Indicador, Etiqueta } from '../components/ui';
import FichaProduto from '../components/FichaProduto';
import type { ItemFicha, Produto, PosicaoEstoque, CustoProduto, Etapa, Equipamento } from '../tipos';

const ABAS = ['Custo e processo', 'Ficha impressa'] as const;

export default function ProdutoDetalhe() {
  const { id } = useParams();
  const [mensagem, setMensagem] = useState('');
  const [falha, setFalha] = useState('');
  const [aba, setAba] = useState<(typeof ABAS)[number]>('Custo e processo');

  const { dados: produto } = useApi<Produto>(`/produtos/${id}`);
  const { dados: ficha, carregando, recarregar: recarregarFicha } = useApi<ItemFicha[]>(`/produtos/${id}/ficha-tecnica`);
  const { dados: custo, recarregar: recarregarCusto } = useApi<CustoProduto>(`/produtos/${id}/custo`);
  const { dados: materiais } = useApi<PosicaoEstoque[]>('/materiais/estoque/posicao');
  const { dados: etapas } = useApi<Etapa[]>('/etapas');
  const { dados: maquinas } = useApi<Equipamento[]>('/engenharia/equipamentos?ativo=true');

  const [materialId, setMaterialId] = useState<number | ''>('');
  const [consumo, setConsumo] = useState('');
  const [perda, setPerda] = useState('0');
  const [tempos, setTempos] = useState<Record<number, string>>({});
  const [equipamentos, setEquipamentos] = useState<Record<number, string>>({});
  const [salvandoProcesso, setSalvandoProcesso] = useState(false);

  useEffect(() => {
    if (!custo || !etapas) return;
    const porEtapa = new Map(custo.detalhe_processo.map((p) => [p.etapa_id, p]));
    setTempos(Object.fromEntries(etapas.map((e) => [e.id, String(porEtapa.get(e.id)?.tempo_por_peca_min ?? 0)])));
    setEquipamentos(
      Object.fromEntries(etapas.map((e) => [e.id, String(porEtapa.get(e.id)?.equipamento_id ?? '')]))
    );
  }, [custo, etapas]);

  const atualizar = () => {
    recarregarFicha();
    recarregarCusto();
  };

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
      atualizar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível adicionar');
    }
  }

  async function removerMaterial(material: ItemFicha) {
    if (!confirm(`Remover "${material.material}" da ficha técnica?`)) return;
    await api.delete(`/produtos/${id}/ficha-tecnica/${material.material_id}`);
    atualizar();
  }

  async function salvarProcesso() {
    setSalvandoProcesso(true);
    setFalha('');
    try {
      await api.put(
        `/produtos/${id}/processo`,
        (etapas ?? []).map((e, i) => ({
          etapa_id: e.id,
          sequencia: e.ordem || i + 1,
          tempo_por_peca_min: Number(tempos[e.id]) || 0,
          equipamento_id: equipamentos[e.id] ? Number(equipamentos[e.id]) : null,
        }))
      );
      setMensagem('Processo salvo. Use “Recalcular” nas ordens abertas para aplicar o novo tempo.');
      recarregarCusto();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível salvar o processo');
    } finally {
      setSalvandoProcesso(false);
    }
  }

  if (carregando) return <Carregando />;

  const preco = produto?.preco_padrao ?? 0;
  const minutos = Object.values(tempos).reduce((s, v) => s + (Number(v) || 0), 0);

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>{produto?.descricao ?? 'Produto'}</h1>
          <p>{produto?.grupo ?? 'sem grupo'} · linha {produto?.linha} · preço padrão {moeda(preco)}</p>
        </div>
        <div className="acoes"><Link className="botao" to="/produtos">Voltar</Link></div>
      </header>

      <Aviso tipo="erro">{falha}</Aviso>
      <Aviso tipo="ok">{mensagem}</Aviso>
      {custo?.avisos.map((a, i) => <Aviso key={i} tipo="info">{a}</Aviso>)}

      <div className="abas">
        {ABAS.map((a) => (
          <button key={a} className={`aba${aba === a ? ' ativa' : ''}`} onClick={() => setAba(a)}>{a}</button>
        ))}
      </div>

      {aba === 'Ficha impressa' && <FichaProduto produtoId={Number(id)} />}

      {aba === 'Custo e processo' && (
      <>
      <div className="grade c4">
        <Indicador rotulo="Material / peça" valor={moeda(custo?.material ?? 0)} nota={`${ficha?.length ?? 0} materiais`} />
        <Indicador rotulo="Mão de obra / peça" valor={moeda(custo?.mao_de_obra ?? 0)}
          nota={`${decimal(custo?.minutos_por_peca ?? 0)} min de fábrica`} />
        <Indicador rotulo="Custo indireto / peça" valor={moeda(custo?.indireto ?? 0)}
          nota={`${moeda(custo?.detalhe_indireto.por_hora ?? 0)}/h de fábrica`} />
        <Indicador
          rotulo="Custo total / peça"
          valor={moeda(custo?.total ?? 0)}
          nota={`margem ${moeda(custo?.margem ?? 0)} (${decimal(custo?.margem_percentual ?? 0)}%)`}
          tom={(custo?.margem ?? 0) >= 0 ? 'sucesso' : 'perigo'}
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
          titulo="Processo produtivo"
          acao={
            <button className="primario pequeno" onClick={salvarProcesso} disabled={salvandoProcesso}>
              {salvandoProcesso ? 'Salvando…' : 'Salvar processo'}
            </button>
          }
        >
          <p style={{ marginTop: 0, color: 'var(--texto-fraco)', fontSize: 12.5 }}>
            O tempo de cada operação, em minutos por peça. O custo vem do setor dono da etapa —
            deixe zero para tirar a operação do roteiro.
          </p>
          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th>Etapa</th><th>Setor</th>
                  <th style={{ width: 92 }}>Min/pç</th>
                  <th style={{ minWidth: 130 }}>Equipamento</th>
                  <th className="num">Custo/pç</th>
                </tr>
              </thead>
              <tbody>
                {etapas?.map((e) => {
                  const linha = custo?.detalhe_processo.find((p) => p.etapa_id === e.id);
                  const tempo = Number(tempos[e.id]) || 0;
                  const custoMinuto = linha?.custo_minuto ?? 0;
                  return (
                    <tr key={e.id}>
                      <td>{e.nome}</td>
                      <td>{linha?.departamento ?? '—'}</td>
                      <td>
                        <input type="number" min="0" step="any" value={tempos[e.id] ?? ''}
                          onChange={(ev) => setTempos((t) => ({ ...t, [e.id]: ev.target.value }))} />
                      </td>
                      <td>
                        <select value={equipamentos[e.id] ?? ''}
                          onChange={(ev) => setEquipamentos((q) => ({ ...q, [e.id]: ev.target.value }))}>
                          <option value="">—</option>
                          {maquinas?.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                        </select>
                      </td>
                      <td className="num">
                        {custoMinuto > 0 ? moeda(tempo * custoMinuto) : <Etiqueta texto="setor sem folha" tom="amarela" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}><strong>Total por peça</strong></td>
                  <td><strong>{decimal(minutos)}</strong></td>
                  <td />
                  <td className="num"><strong>{moeda(custo?.mao_de_obra ?? 0)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Cartao>
      </div>
      </>
      )}
    </>
  );
}
