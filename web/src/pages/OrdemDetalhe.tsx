import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/hooks';
import { data, decimal, moeda, numero } from '../lib/formato';
import { Cartao, Carregando, Aviso, Etiqueta, Indicador, Vazio } from '../components/ui';
import type { Ordem, OrdemEtapa } from '../tipos';

const STATUS_ETAPA = [
  { valor: 'PENDENTE', rotulo: 'Pendente' },
  { valor: 'EM_ANDAMENTO', rotulo: 'Em andamento' },
  { valor: 'CONCLUIDA', rotulo: 'Concluída' },
  { valor: 'NAO_APLICAVEL', rotulo: 'Não se aplica' },
];

export default function OrdemDetalhe() {
  const { id } = useParams();
  const { dados: ordem, carregando, erro, recarregar, setDados } = useApi<Ordem>(`/ordens/${id}`);
  const [mensagem, setMensagem] = useState('');
  const [falha, setFalha] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function acao(fn: () => Promise<Ordem | void>, sucesso: string) {
    setOcupado(true);
    setFalha('');
    setMensagem('');
    try {
      const r = await fn();
      if (r) setDados(r);
      else recarregar();
      setMensagem(sucesso);
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Falha na operação');
    } finally {
      setOcupado(false);
    }
  }

  const mudarEtapa = (etapa: OrdemEtapa, campos: Partial<OrdemEtapa>) =>
    acao(
      () => api.put<Ordem>(`/ordens/${id}/etapas/${etapa.etapa_id}`, campos),
      `Etapa ${etapa.nome} atualizada.`
    );

  if (carregando) return <Carregando />;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!ordem) return null;

  const pendenteMaterial = ordem.materiais.some((m) => m.quantidade_prevista > m.quantidade_baixada);
  const custoTotal = ordem.custo_mo_total + ordem.custo_material_previsto;
  const margem = ordem.valor_item - custoTotal;

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>{ordem.numero} <Etiqueta status={ordem.status} /></h1>
          <p>
            {ordem.produto} · {ordem.cliente} · pedido{' '}
            <Link to={`/pedidos/${ordem.pedido_id}`}>{ordem.pedido_numero}</Link>
          </p>
        </div>
        <div className="acoes">
          <button disabled={ocupado} onClick={() => acao(() => api.post<Ordem>(`/ordens/${id}/recalcular`), 'Ficha técnica e custos recalculados.')}>
            Recalcular ficha e custos
          </button>
          <button
            className="primario"
            disabled={ocupado || !pendenteMaterial}
            title={pendenteMaterial ? 'Dá baixa no estoque do material previsto' : 'Nada pendente para baixar'}
            onClick={() => acao(async () => { await api.post(`/ordens/${id}/baixar-materiais`, {}); }, 'Material baixado do estoque.')}
          >
            Baixar material do estoque
          </button>
        </div>
      </header>

      <Aviso tipo="erro">{falha}</Aviso>
      <Aviso tipo="ok">{mensagem}</Aviso>

      <div className="grade c4">
        <Indicador rotulo="Quantidade" valor={`${numero(ordem.quantidade)} pç`} nota={ordem.grupo ?? ''} />
        <Indicador rotulo="Receita do item" valor={moeda(ordem.valor_item)} nota={`${moeda(ordem.preco_unitario)}/pç`} />
        <Indicador rotulo="Custo previsto" valor={moeda(custoTotal)}
          nota={`MO ${moeda(ordem.custo_mo_total)} + material ${moeda(ordem.custo_material_previsto)}`} />
        <Indicador rotulo="Margem prevista" valor={moeda(margem)} tom={margem >= 0 ? 'sucesso' : 'perigo'}
          nota={ordem.valor_item > 0 ? `${((margem / ordem.valor_item) * 100).toFixed(1)}% da receita` : ''} />
      </div>

      <div className="grade c2" style={{ marginTop: 16 }}>
        <Cartao titulo="Roteiro de produção" acao={<small>Prevista para {data(ordem.data_prevista)}</small>}>
          <div className="roteiro">
            {ordem.etapas.map((etapa) => (
              <div
                key={etapa.id}
                className={`roteiro-etapa${etapa.status === 'CONCLUIDA' ? ' concluida' : ''}${etapa.status === 'EM_ANDAMENTO' ? ' andamento' : ''}`}
              >
                <div className="passo">{etapa.status === 'CONCLUIDA' ? '✓' : etapa.sequencia}</div>
                <div className="info">
                  <b>{etapa.nome}</b>
                  <div>
                    {etapa.custo_mo > 0 && <>MO {moeda(etapa.custo_mo)} · </>}
                    {etapa.concluido_em ? `concluída em ${data(etapa.concluido_em)}` : 'sem data'}
                    {etapa.responsavel && ` · ${etapa.responsavel}`}
                  </div>
                </div>
                <div className="controles">
                  <select
                    value={etapa.status}
                    disabled={ocupado}
                    onChange={(e) => mudarEtapa(etapa, { status: e.target.value as OrdemEtapa['status'] })}
                  >
                    {STATUS_ETAPA.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </Cartao>

        <Cartao
          titulo="Materiais da ordem"
          acao={<small>da ficha técnica do produto</small>}
        >
          {ordem.materiais.length === 0 ? (
            <Vazio texto="Este produto ainda não tem ficha técnica. Cadastre em Produtos → Ficha técnica." />
          ) : (
            <div className="tabela-rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Material</th><th className="num">Previsto</th><th className="num">Baixado</th>
                    <th className="num">Pendente</th><th className="num">Saldo</th><th />
                  </tr>
                </thead>
                <tbody>
                  {ordem.materiais.map((m) => {
                    const pendente = Math.round((m.quantidade_prevista - m.quantidade_baixada) * 100) / 100;
                    const falta = pendente > m.saldo;
                    return (
                      <tr key={m.material_id}>
                        <td>{m.descricao}</td>
                        <td className="num">{decimal(m.quantidade_prevista)} {m.unidade}</td>
                        <td className="num">{decimal(m.quantidade_baixada)}</td>
                        <td className="num">{decimal(pendente)}</td>
                        <td className="num">{decimal(m.saldo)}</td>
                        <td>
                          {pendente <= 0
                            ? <Etiqueta texto="Baixado" tom="verde" />
                            : falta
                              ? <Etiqueta texto="Sem saldo" tom="vermelha" />
                              : <Etiqueta texto="Disponível" tom="azul" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>
      </div>
    </>
  );
}
