import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, pode } from '../lib/api';
import { useApi } from '../lib/hooks';
import { Cartao, Aviso, Vazio, Carregando } from './ui';
import type { Grade, OperacaoOrdem, Setor, Via } from '../tipos';

/**
 * Ficha de produção da ordem: a grade de tamanhos, as vias que vão ser
 * impressas e a sequência operacional que cada setor preenche.
 *
 * A impressão sai do servidor pronta — o botão abre o dossiê numa aba nova, já
 * paginado em A4, para mandar direto para a impressora ou salvar em PDF.
 */
export default function FichaProducao({ ordemId, itemId }: { ordemId: number; itemId: number }) {
  const { dados: opcoes } = useApi<{ vias: Via[]; setores: Setor[]; tamanhos: string[] }>('/fichas/opcoes');
  const { dados: grade, recarregar: recarregarGrade } = useApi<Grade>(`/fichas/itens/${itemId}/grade`, [itemId]);
  const { dados: operacoes, recarregar: recarregarOperacoes } =
    useApi<OperacaoOrdem[]>(`/fichas/ordens/${ordemId}/operacoes`, [ordemId]);

  const [selecionadas, setSelecionadas] = useState<Setor[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [mensagem, setMensagem] = useState('');
  const [falha, setFalha] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (opcoes && selecionadas.length === 0) setSelecionadas(opcoes.vias.map((v) => v.id));
  }, [opcoes, selecionadas.length]);

  useEffect(() => {
    if (grade) {
      setValores(
        Object.fromEntries(grade.grade.map((l) => [l.tamanho, l.quantidade ? String(l.quantidade) : '']))
      );
    }
  }, [grade]);

  const totalDigitado = useMemo(
    () => Object.values(valores).reduce((s, v) => s + (Number(v) || 0), 0),
    [valores]
  );

  const porSetor = useMemo(() => {
    const mapa = new Map<Setor, OperacaoOrdem[]>();
    for (const o of operacoes ?? []) mapa.set(o.setor, [...(mapa.get(o.setor) ?? []), o]);
    return mapa;
  }, [operacoes]);

  const podeEditarGrade = pode('pedidos.editar');
  const podeApontar = pode('producao.ordens');

  async function tentar(fn: () => Promise<void>, sucesso: string) {
    setOcupado(true);
    setFalha('');
    setMensagem('');
    try {
      await fn();
      setMensagem(sucesso);
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Falha na operação');
    } finally {
      setOcupado(false);
    }
  }

  const salvarGrade = () =>
    tentar(async () => {
      await api.put(`/fichas/itens/${itemId}/grade`, {
        linhas: Object.entries(valores)
          .map(([tamanho, q]) => ({ tamanho, quantidade: Number(q) || 0 }))
          .filter((l) => l.quantidade > 0),
      });
      recarregarGrade();
    }, 'Grade de tamanhos salva.');

  const imprimir = () =>
    tentar(
      () => api.abrirDocumento(`/fichas/ordens/${ordemId}/impressao?vias=${selecionadas.join(',')}`),
      'Ficha aberta em outra aba — use “Imprimir / salvar em PDF”.'
    );

  const apontar = (operacao: OperacaoOrdem, campo: keyof OperacaoOrdem, valor: string) =>
    tentar(async () => {
      await api.patch(`/fichas/operacoes/${operacao.id}`, { [campo]: valor || null });
      recarregarOperacoes();
    }, `${operacao.nome}: ${campo} registrado.`);

  if (!opcoes) return <Carregando />;

  return (
    <>
      <Aviso tipo="erro">{falha}</Aviso>
      <Aviso tipo="ok">{mensagem}</Aviso>

      <div className="grade c2" style={{ marginTop: 16 }}>
        <Cartao
          titulo="Grade de tamanhos"
          acao={<small>{grade?.lancada ? 'lançada' : 'sem grade: sai como tamanho único'}</small>}
        >
          <div className="grade-tamanhos">
            {opcoes.tamanhos.map((t) => (
              <label key={t}>
                <span>{t}</span>
                <input
                  type="number"
                  min={0}
                  disabled={!podeEditarGrade || ocupado}
                  value={valores[t] ?? ''}
                  onChange={(e) => setValores((v) => ({ ...v, [t]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="linha-acoes">
            <b>Total digitado: {totalDigitado.toLocaleString('pt-BR')}</b>
            {podeEditarGrade && (
              <button className="primario" disabled={ocupado} onClick={salvarGrade}>
                Salvar grade
              </button>
            )}
          </div>
          <p className="ajuda">
            A grade tem de fechar com a quantidade da ordem. Deixe tudo em branco para imprimir a peça
            como tamanho único.
          </p>
        </Cartao>

        <Cartao titulo="Imprimir a ficha" acao={<small>uma via por setor</small>}>
          <div className="vias">
            {opcoes.vias.map((v) => (
              <label key={v.id} className="via-opcao">
                <input
                  type="checkbox"
                  checked={selecionadas.includes(v.id)}
                  onChange={(e) =>
                    setSelecionadas((atual) =>
                      e.target.checked ? [...atual, v.id] : atual.filter((s) => s !== v.id)
                    )
                  }
                />
                {v.titulo}
              </label>
            ))}
          </div>
          <div className="linha-acoes">
            <button onClick={() => setSelecionadas(opcoes.vias.map((v) => v.id))}>Todas</button>
            <button
              className="primario"
              disabled={ocupado || selecionadas.length === 0}
              onClick={imprimir}
            >
              Abrir ficha para impressão
            </button>
          </div>
          <p className="ajuda">
            O documento abre numa aba nova, paginado em A4. Cada via mostra só o material do seu setor.
          </p>
        </Cartao>
      </div>

      <Cartao
        titulo="Sequência operacional"
        acao={<small>preenchida no chão de fábrica</small>}
      >
        {porSetor.size === 0 ? (
          <Vazio texto="Nenhuma operação padrão cadastrada para os setores." />
        ) : (
          [...porSetor.entries()].map(([setor, lista]) => (
            <div key={setor} className="bloco-setor">
              <h4>{opcoes.vias.find((v) => v.id === setor)?.titulo ?? setor}</h4>
              <div className="tabela-rolagem">
                <table>
                  <thead>
                    <tr>
                      <th>Operação</th><th>Máquina</th><th>Início</th><th>Término</th><th>Operador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((o) => (
                      <tr key={o.id}>
                        <td>{o.sequencia}. {o.nome}</td>
                        <td>{o.maquina}</td>
                        <td>
                          <input
                            type="datetime-local"
                            disabled={!podeApontar || ocupado}
                            defaultValue={o.inicio ?? ''}
                            onBlur={(e) => e.target.value !== (o.inicio ?? '') && apontar(o, 'inicio', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="datetime-local"
                            disabled={!podeApontar || ocupado}
                            defaultValue={o.termino ?? ''}
                            onBlur={(e) => e.target.value !== (o.termino ?? '') && apontar(o, 'termino', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            disabled={!podeApontar || ocupado}
                            defaultValue={o.operador ?? ''}
                            placeholder="quem executou"
                            onBlur={(e) => e.target.value !== (o.operador ?? '') && apontar(o, 'operador', e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </Cartao>
    </>
  );
}
