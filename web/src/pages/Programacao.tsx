import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, pode } from '../lib/api';
import { useApi } from '../lib/hooks';
import { data, numero, decimal, moeda, moedaCurta } from '../lib/formato';
import { Cartao, Indicador, Carregando, Aviso, Vazio, Etiqueta, Modal } from '../components/ui';
import type { Programacao as TProgramacao, CargaSetor, SemanaPlano, SemanaDetalhe } from '../tipos';

/** Acima de 85% a semana já está vendida; acima de 100% não cabe. */
const tomDaCarga = (c: CargaSetor) => {
  if (c.sem_capacidade) return 'sem-capacidade';
  const ocupacao = c.ocupacao_percentual ?? 0;
  if (ocupacao > 100) return 'excedida';
  if (ocupacao > 85) return 'apertada';
  return 'folgada';
};

export default function Programacao() {
  const [semanas, setSemanas] = useState(8);
  const [celula, setCelula] = useState<{ semana: SemanaPlano; setor: string } | null>(null);
  const { dados, carregando, erro, recarregar } = useApi<TProgramacao>(
    `/ordens/programacao?semanas=${semanas}`,
    [semanas]
  );

  if (carregando) return <Carregando />;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados) return null;

  const setores = dados.capacidade.map((c) => c.setor);
  const extras = dados.plano
    .flatMap((s) => s.setores.map((c) => c.setor))
    .filter((s) => !setores.includes(s));
  const linhas = [...setores, ...new Set(extras)];

  const atrasadas = dados.plano[0]?.atrasadas ?? 0;
  const pecas = dados.plano.reduce((s, p) => s + p.pecas, 0);
  const valor = dados.plano.reduce((s, p) => s + p.valor, 0);
  const gargalo = [...dados.fila].sort((a, b) => (b.semanas_fila ?? 0) - (a.semanas_fila ?? 0))[0];
  const semTempo = dados.alertas.filter((a) => a.tipo === 'SEM_TEMPO');
  const semEquipe = dados.alertas.filter((a) => a.tipo === 'SEM_EQUIPE');
  const excedidas = dados.alertas.filter((a) => a.tipo === 'EXCEDIDA');

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Programação semanal</h1>
          <p>
            Carga prometida × capacidade de cada setor, semana a semana — de {data(dados.de)} a{' '}
            {data(dados.ate)}. Jornada de {decimal(dados.jornada.minutos_dia / 60)}h em{' '}
            {dados.jornada.dias_uteis_semana} dias, com {dados.jornada.ocupacao_percentual}% de ocupação.
          </p>
        </div>
        <div className="acoes">
          <select value={semanas} onChange={(e) => setSemanas(Number(e.target.value))} style={{ width: 140 }}>
            {[4, 8, 12, 16, 26].map((n) => (
              <option key={n} value={n}>{n} semanas</option>
            ))}
          </select>
        </div>
      </header>

      <div className="grade c4">
        <Indicador
          rotulo="Ordens vencidas"
          valor={numero(atrasadas)}
          tom={atrasadas > 0 ? 'perigo' : 'sucesso'}
          nota="entram na primeira semana do plano"
        />
        <Indicador rotulo="Peças programadas" valor={numero(pecas)} nota={`${moedaCurta(valor)} em carteira`} />
        <Indicador
          rotulo="Gargalo"
          valor={gargalo?.setor ?? '—'}
          tom={(gargalo?.semanas_fila ?? 0) > 4 ? 'perigo' : undefined}
          nota={
            gargalo?.semanas_fila != null
              ? `${decimal(gargalo.semanas_fila)} semanas de fila (${numero(gargalo.horas)}h)`
              : 'sem capacidade cadastrada'
          }
        />
        <Indicador
          rotulo="Semanas estouradas"
          valor={numero(excedidas.length)}
          tom={excedidas.length > 0 ? 'perigo' : 'sucesso'}
          nota="setor × semana acima de 100%"
        />
      </div>

      {semEquipe.map((a) => (
        <Aviso key={`equipe-${a.setor}`} tipo="erro">{a.texto}</Aviso>
      ))}
      {semTempo.length > 0 && (
        <Aviso tipo="info">
          Sem tempo padrão cadastrado ({semTempo.map((a) => a.texto).join(', ')}): nesses setores a
          carga aparece menor do que é. Lance o tempo por peça no processo do produto —{' '}
          <Link to="/produtos">abrir os produtos</Link>.
        </Aviso>
      )}

      <Cartao
        titulo={<h3>Carga por setor</h3>}
        acao={<small>clique na célula para ver as ordens daquela semana</small>}
      >
        {dados.plano.every((s) => s.setores.length === 0) ? (
          <Vazio texto="Nenhuma ordem em aberto com entrega neste período." />
        ) : (
          <div className="plano">
            <table>
              <thead>
                <tr>
                  <th className="setor">Setor</th>
                  {dados.plano.map((s) => (
                    <th key={s.inicio} className={s.indice === 0 ? 'semana-atual' : undefined}>
                      {s.rotulo}
                      <small>{data(s.inicio).slice(0, 5)}</small>
                      <small>{s.ordens > 0 ? `${numero(s.pecas)} pç` : '—'}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((setor) => {
                  const capacidade = dados.capacidade.find((c) => c.setor === setor);
                  return (
                    <tr key={setor}>
                      <td className="setor">
                        {setor}
                        <div style={{ fontWeight: 400, fontSize: 11.5, color: 'var(--texto-suave)' }}>
                          {capacidade
                            ? `${capacidade.pessoas} pessoas · ${numero(capacidade.horas_semana)}h/sem`
                            : 'sem setor definido'}
                        </div>
                      </td>
                      {dados.plano.map((semana) => {
                        const carga = semana.setores.find((c) => c.setor === setor);
                        if (!carga) return <td key={semana.inicio} className="vazia">—</td>;
                        return (
                          <td key={semana.inicio}>
                            <button
                              className={`carga ${tomDaCarga(carga)}`}
                              onClick={() => setCelula({ semana, setor })}
                              title={
                                carga.sem_capacidade
                                  ? `${setor} sem capacidade cadastrada`
                                  : `${numero(carga.horas)}h de ${numero(carga.capacidade_horas)}h · ${carga.ordens} ordens`
                              }
                            >
                              <span className="horas">
                                <b>{carga.ocupacao_percentual != null ? `${carga.ocupacao_percentual}%` : '—'}</b>
                                <span>{numero(carga.horas)}h</span>
                              </span>
                              <span className="medidor">
                                <span style={{ width: `${Math.min(carga.ocupacao_percentual ?? 0, 100)}%` }} />
                              </span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="ajuda">
          A carga é o que ainda falta fazer das ordens em aberto (etapa concluída sai da conta), lançada
          na semana da entrega prometida. Ordem vencida não some: ela entra na primeira semana, porque
          disputa a mesma máquina de agora.
          {dados.fora_do_horizonte.ordens > 0 &&
            ` ${dados.fora_do_horizonte.ordens} ordens entregam depois de ${data(dados.ate)}.`}
          {dados.sem_data.ordens > 0 &&
            ` ${dados.sem_data.ordens} ordens estão sem data de entrega e ficaram fora da grade.`}
        </p>
      </Cartao>

      <Cartao titulo={<h3>Fila por setor</h3>} acao={<small>tudo que já está prometido, dentro e fora do horizonte</small>}>
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>Setor</th>
                <th className="num">Ordens</th>
                <th className="num">Horas na fila</th>
                <th className="num">Capacidade semanal</th>
                <th className="num">Semanas de fila</th>
              </tr>
            </thead>
            <tbody>
              {dados.fila.map((f) => (
                <tr key={f.setor}>
                  <td><b>{f.setor}</b></td>
                  <td className="num">{numero(f.ordens)}</td>
                  <td className="num">{numero(f.horas)}h</td>
                  <td className="num">{f.capacidade_horas > 0 ? `${numero(f.capacidade_horas)}h` : '—'}</td>
                  <td className="num">
                    {f.semanas_fila == null ? (
                      <Etiqueta tom="amarela" texto="sem equipe" />
                    ) : (
                      <b style={{ color: f.semanas_fila > 4 ? 'var(--perigo)' : undefined }}>
                        {decimal(f.semanas_fila)}
                      </b>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>

      {celula && (
        <DetalheSemana
          semana={celula.semana}
          setor={celula.setor}
          aoFechar={() => setCelula(null)}
          aoReprogramar={recarregar}
        />
      )}
    </>
  );
}

/** Ordens de uma célula da grade, com a opção de empurrar a entrega para outra semana. */
function DetalheSemana({ semana, setor, aoFechar, aoReprogramar }: {
  semana: SemanaPlano; setor: string; aoFechar: () => void; aoReprogramar: () => void;
}) {
  const [falha, setFalha] = useState('');
  const [salvando, setSalvando] = useState<number | null>(null);
  const caminho =
    `/ordens/programacao/semana?inicio=${semana.inicio}&setor=${encodeURIComponent(setor)}` +
    `${semana.indice === 0 ? '&atrasadas=true' : ''}`;
  const { dados, carregando, erro, recarregar } = useApi<SemanaDetalhe>(caminho, [caminho]);

  async function reprogramar(ordemId: number, novaData: string) {
    if (!novaData) return;
    setFalha('');
    setSalvando(ordemId);
    try {
      await api.put(`/ordens/${ordemId}`, { data_prevista: novaData });
      recarregar();
      aoReprogramar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível reprogramar a ordem');
    } finally {
      setSalvando(null);
    }
  }

  const carga = semana.setores.find((c) => c.setor === setor);

  return (
    <Modal
      titulo={`${setor} · semana ${semana.semana} (${data(semana.inicio)} a ${data(semana.fim)})`}
      aberto
      largo
      aoFechar={aoFechar}
    >
      {carga && (
        <div className="grade c3" style={{ marginBottom: 14 }}>
          <Indicador rotulo="Carga" valor={`${numero(carga.horas)}h`} nota={`${numero(carga.pecas)} peças`} />
          <Indicador
            rotulo="Capacidade"
            valor={carga.capacidade_horas > 0 ? `${numero(carga.capacidade_horas)}h` : '—'}
            nota={carga.sem_capacidade ? 'setor sem equipe cadastrada' : `${carga.ocupacao_percentual}% ocupado`}
          />
          <Indicador
            rotulo="Excedente"
            valor={`${numero(carga.excedente_horas)}h`}
            tom={carga.excedente_horas > 0 ? 'perigo' : 'sucesso'}
            nota={carga.excedente_horas > 0 ? 'precisa sair desta semana' : 'cabe na semana'}
          />
        </div>
      )}

      <Aviso tipo="erro">{falha}</Aviso>
      {carregando && <Carregando />}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {dados && (dados.ordens.length === 0 ? (
        <Vazio texto="Nenhuma ordem desta semana neste setor." />
      ) : (
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>Ordem</th>
                <th>Cliente e produto</th>
                <th className="num">Peças</th>
                <th className="num">Horas</th>
                <th>Entrega</th>
                {pode('producao.ordens') && <th>Reprogramar</th>}
              </tr>
            </thead>
            <tbody>
              {dados.ordens.map((o) => (
                <tr key={o.ordem_id}>
                  <td>
                    <Link to={`/producao/${o.ordem_id}`}>{o.numero}</Link>
                    <div className="nota-celula" style={{ fontSize: 11.5 }}>pedido {o.pedido_numero}</div>
                  </td>
                  <td>
                    <b>{o.cliente}</b>
                    <div className="nota-celula" style={{ fontSize: 12 }}>{o.produto}</div>
                  </td>
                  <td className="num">{numero(o.quantidade)}</td>
                  <td className="num">{numero(o.horas)}h</td>
                  <td>
                    {data(o.data_prevista)}
                    {o.atrasada && <div><Etiqueta tom="vermelha" texto="vencida" /></div>}
                  </td>
                  {pode('producao.ordens') && (
                    <td>
                      {/* Grava ao sair do campo: digitar dia a dia não pode disparar uma
                          reprogramação a cada tecla. */}
                      <input
                        type="date"
                        defaultValue={o.data_prevista}
                        disabled={salvando === o.ordem_id}
                        onBlur={(e) => {
                          if (e.target.value && e.target.value !== o.data_prevista) {
                            reprogramar(o.ordem_id, e.target.value);
                          }
                        }}
                        style={{ width: 150 }}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {dados && dados.ordens.length > 0 && (
        <p className="ajuda">
          Valor da carteira nesta célula: {moeda(dados.ordens.reduce((s, o) => s + (o.valor ?? 0), 0))}.
          Mudar a data de entrega tira a ordem desta semana e a lança na semana nova — o plano recalcula
          na hora.
        </p>
      )}
    </Modal>
  );
}
