import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/hooks';
import { moeda, decimal, numero } from '../lib/formato';
import { Cartao, Carregando, Aviso, Campo, Indicador, Vazio, Etiqueta } from '../components/ui';
import TabelaCrud, { type Coluna, type CampoForm } from '../components/TabelaCrud';
import type { CampoFiltro } from '../components/Filtros';
import type { Departamento, Equipamento, CustoFixo, Jornada, CustoSetor, TaxaIndireta } from '../tipos';

const ABAS = ['Jornada e custos', 'Setores', 'Equipamentos', 'Custos fixos'] as const;

export default function Engenharia() {
  const [aba, setAba] = useState<(typeof ABAS)[number]>('Jornada e custos');

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Engenharia</h1>
          <p>A estrutura da fábrica que forma o custo: jornada, setores, máquinas e despesas fixas</p>
        </div>
      </header>

      <div className="abas">
        {ABAS.map((a) => (
          <button key={a} className={`aba${aba === a ? ' ativa' : ''}`} onClick={() => setAba(a)}>{a}</button>
        ))}
      </div>

      {aba === 'Jornada e custos' && <Parametros />}
      {aba === 'Setores' && <Setores />}
      {aba === 'Equipamentos' && <Equipamentos />}
      {aba === 'Custos fixos' && <CustosFixos />}
    </>
  );
}

function Parametros() {
  const { dados, carregando, recarregar } = useApi<Jornada>('/engenharia/parametros');
  const { dados: setores, recarregar: recarregarSetores } = useApi<CustoSetor[]>('/engenharia/custo-setores');
  const { dados: indireto, recarregar: recarregarIndireto } = useApi<TaxaIndireta>('/engenharia/custo-indireto');

  const [form, setForm] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!dados) return;
    setForm({
      jornada_inicio: dados.jornada_inicio,
      jornada_fim: dados.jornada_fim,
      intervalo_min: String(dados.intervalo_min),
      dias_uteis_mes: String(dados.dias_uteis_mes),
      encargos_percentual: String(dados.encargos_percentual),
      ocupacao_percentual: String(dados.ocupacao_percentual),
    });
  }, [dados]);

  async function salvar() {
    setSalvando(true);
    setErro('');
    setOk('');
    try {
      await api.put('/engenharia/parametros', {
        jornada_inicio: form.jornada_inicio,
        jornada_fim: form.jornada_fim,
        intervalo_min: Number(form.intervalo_min) || 0,
        dias_uteis_mes: Number(form.dias_uteis_mes) || 22,
        encargos_percentual: Number(form.encargos_percentual) || 0,
        ocupacao_percentual: Number(form.ocupacao_percentual) || 85,
      });
      setOk('Parâmetros salvos. Os custos foram recalculados com a nova jornada.');
      recarregar();
      recarregarSetores();
      recarregarIndireto();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  }

  if (carregando || !dados) return <Carregando />;

  return (
    <>
      <div className="grade c4">
        <Indicador rotulo="Jornada produtiva" valor={`${dados.minutos_produtivos} min`}
          nota={`${dados.horas_dia} h por dia, já sem os intervalos`} />
        <Indicador rotulo="Minutos por mês" valor={numero(dados.minutos_mes)}
          nota={`${dados.dias_uteis_mes} dias úteis`} />
        <Indicador rotulo="Custo indireto" valor={`${moeda(indireto?.por_hora ?? 0)}/h`}
          nota={`${moeda(indireto?.total ?? 0)} de custo fixo por mês`} />
        <Indicador rotulo="Capacidade da fábrica"
          valor={`${numero(indireto?.capacidade.horas_mes ?? 0)} h`}
          nota={`${indireto?.capacidade.pessoas ?? 0} pessoas produtivas · ocupação ${dados.ocupacao_percentual}%`} />
      </div>

      {indireto?.avisos.map((a, i) => <Aviso key={i} tipo="info">{a}</Aviso>)}

      <div className="grade c2" style={{ marginTop: 16 }}>
        <Cartao
          titulo="Jornada e encargos"
          acao={<button className="primario pequeno" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>}
        >
          <Aviso tipo="erro">{erro}</Aviso>
          <Aviso tipo="ok">{ok}</Aviso>
          <div className="linha-campos">
            <Campo rotulo="Início">
              <input type="time" value={form.jornada_inicio ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, jornada_inicio: e.target.value }))} />
            </Campo>
            <Campo rotulo="Fim">
              <input type="time" value={form.jornada_fim ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, jornada_fim: e.target.value }))} />
            </Campo>
            <Campo rotulo="Intervalos (min)">
              <input type="number" min="0" value={form.intervalo_min ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, intervalo_min: e.target.value }))} />
            </Campo>
          </div>
          <div className="linha-campos">
            <Campo rotulo="Dias úteis no mês">
              <input type="number" min="1" max="31" value={form.dias_uteis_mes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, dias_uteis_mes: e.target.value }))} />
            </Campo>
            <Campo rotulo="Encargos sobre a folha (%)">
              <input type="number" min="0" step="any" value={form.encargos_percentual ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, encargos_percentual: e.target.value }))} />
            </Campo>
            <Campo rotulo="Ocupação da fábrica (%)">
              <input type="number" min="1" max="100" step="any" value={form.ocupacao_percentual ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, ocupacao_percentual: e.target.value }))} />
            </Campo>
          </div>
          <p style={{ color: 'var(--texto-fraco)', fontSize: 12.5, margin: '4px 0 0' }}>
            A ocupação evita o custo otimista: supor 100% é supor que a fábrica nunca para,
            e o custo por peça sai menor do que o real.
          </p>
        </Cartao>

        <Cartao titulo="Custo do minuto por setor" acao={<small>folha com encargos ÷ minutos do mês</small>}>
          {!setores || setores.length === 0 ? <Vazio texto="Nenhum setor cadastrado." /> : (
            <div className="tabela-rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Setor</th><th className="num">Pessoas</th><th className="num">Salário médio</th>
                    <th className="num">Custo/hora</th><th className="num">Custo/min</th><th />
                  </tr>
                </thead>
                <tbody>
                  {setores.map((s) => (
                    <tr key={s.departamento_id}>
                      <td>{s.departamento}</td>
                      <td className="num">{s.pessoas}</td>
                      <td className="num">{moeda(s.salario_medio)}</td>
                      <td className="num">{moeda(s.custo_hora)}</td>
                      <td className="num">{s.custo_minuto.toFixed(4)}</td>
                      <td>
                        {s.sem_salario
                          ? <Etiqueta texto="sem salário" tom="vermelha" />
                          : s.incompleto
                            ? <Etiqueta texto="folha incompleta" tom="amarela" />
                            : <Etiqueta texto="ok" tom="verde" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>
      </div>

      {indireto && indireto.por_tipo.length > 0 && (
        <Cartao titulo="Composição do custo fixo">
          <table>
            <thead><tr><th>Tipo</th><th className="num">Valor mensal</th><th className="num">Participação</th></tr></thead>
            <tbody>
              {indireto.por_tipo.map((t) => (
                <tr key={t.tipo}>
                  <td>{t.tipo}</td>
                  <td className="num">{moeda(t.valor)}</td>
                  <td className="num">{decimal((t.valor / indireto.total) * 100)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td className="num"><strong>{moeda(indireto.total)}</strong></td>
                <td className="num"><strong>{moeda(indireto.por_minuto)}/min</strong></td>
              </tr>
            </tfoot>
          </table>
        </Cartao>
      )}
    </>
  );
}

const COLUNAS_SETOR: Coluna<Departamento>[] = [
  { chave: 'nome', rotulo: 'Setor' },
  { chave: 'responsavel', rotulo: 'Responsável' },
  { chave: 'pessoas', rotulo: 'Pessoas', num: true },
  { chave: 'equipamentos', rotulo: 'Máquinas', num: true },
  { chave: 'produtivo', rotulo: 'Produtivo', render: (d) => (d.produtivo ? 'Sim' : 'Não') },
];

const Setores = () => (
  <TabelaCrud<Departamento>
    titulo="Setores"
    descricao="Setores produtivos entram no rateio do custo fixo; administrativos, não"
    recurso="/engenharia/departamentos"
    colunas={COLUNAS_SETOR}
    campos={[
      { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
      { nome: 'responsavel', rotulo: 'Responsável' },
      { nome: 'produtivo', rotulo: 'Produtivo (1 ou 0)', tipo: 'numero', padrao: 1,
        ajuda: '1 para setores que produzem; 0 para administrativo' },
      { nome: 'observacao', rotulo: 'Observação' },
    ]}
    filtros={[
      { chave: 'produtivo', rotulo: 'Natureza', tipo: 'select',
        opcoes: [{ valor: '1', rotulo: 'Produtivo' }, { valor: '0', rotulo: 'Administrativo' }] },
      { chave: 'ativo', rotulo: 'só ativos', tipo: 'marcar' },
    ]}
    filtrosIniciais={{ ativo: 'true' }}
  />
);

function Equipamentos() {
  const { dados: setores } = useApi<Departamento[]>('/engenharia/departamentos');
  const campos: CampoForm[] = [
    { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
    { nome: 'tipo', rotulo: 'Tipo' },
    { nome: 'departamento_id', rotulo: 'Setor', tipo: 'select',
      opcoes: (setores ?? []).map((d) => ({ valor: d.id, rotulo: d.nome })) },
    { nome: 'quantidade', rotulo: 'Quantidade', tipo: 'numero', padrao: 1 },
    { nome: 'patrimonio', rotulo: 'Patrimônio' },
    { nome: 'status', rotulo: 'Situação', tipo: 'select', padrao: 'ATIVO',
      opcoes: ['ATIVO', 'MANUTENCAO', 'PARADO', 'BAIXADO'].map((s) => ({ valor: s, rotulo: s })) },
  ];
  const filtrosEquipamento: CampoFiltro[] = [
    { chave: 'departamento_id', rotulo: 'Setor', tipo: 'select',
      opcoes: (setores ?? []).map((d) => ({ valor: d.id, rotulo: d.nome })) },
    { chave: 'status', rotulo: 'Situação', tipo: 'select',
      opcoes: ['ATIVO', 'MANUTENCAO', 'PARADO', 'BAIXADO'].map((x) => ({ valor: x, rotulo: x })) },
    { chave: 'ativo', rotulo: 'só ativos', tipo: 'marcar' },
  ];

  return (
    <TabelaCrud<Equipamento>
      titulo="Equipamentos"
      recurso="/engenharia/equipamentos"
      colunas={[
        { chave: 'nome', rotulo: 'Equipamento' },
        { chave: 'tipo', rotulo: 'Tipo' },
        { chave: 'departamento', rotulo: 'Setor' },
        { chave: 'quantidade', rotulo: 'Qtd', num: true },
        { chave: 'status', rotulo: 'Situação', render: (e) => <Etiqueta texto={e.status} tom={e.status === 'ATIVO' ? 'verde' : 'amarela'} /> },
      ]}
      campos={campos}
      filtros={filtrosEquipamento}
      filtrosIniciais={{ ativo: 'true' }}
    />
  );
}

const CustosFixos = () => (
  <TabelaCrud<CustoFixo>
    titulo="Custos fixos mensais"
    descricao="Aluguel, energia e manutenção existem mesmo sem aparecer na conta do produto"
    recurso="/engenharia/custos-fixos"
    colunas={[
      { chave: 'descricao', rotulo: 'Despesa' },
      { chave: 'tipo', rotulo: 'Tipo' },
      { chave: 'valor_mensal', rotulo: 'Valor mensal', num: true, render: (c) => moeda(c.valor_mensal) },
      { chave: 'observacao', rotulo: 'Observação' },
    ]}
    campos={[
      { nome: 'descricao', rotulo: 'Descrição', obrigatorio: true },
      { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', padrao: 'OUTRO',
        opcoes: ['ALUGUEL', 'ENERGIA', 'AGUA', 'MANUTENCAO', 'ADMINISTRATIVO', 'IMPOSTO',
                 'SEGURO', 'DEPRECIACAO', 'SOFTWARE', 'OUTRO'].map((t) => ({ valor: t, rotulo: t })) },
      { nome: 'valor_mensal', rotulo: 'Valor mensal', tipo: 'numero', padrao: 0 },
      { nome: 'observacao', rotulo: 'Observação' },
    ]}
    filtros={[
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'select',
        opcoes: ['ALUGUEL', 'ENERGIA', 'AGUA', 'MANUTENCAO', 'ADMINISTRATIVO', 'IMPOSTO',
                 'SEGURO', 'DEPRECIACAO', 'SOFTWARE', 'OUTRO'].map((t) => ({ valor: t, rotulo: t })) },
      { chave: 'ativo', rotulo: 'só ativos', tipo: 'marcar' },
    ]}
    filtrosIniciais={{ ativo: 'true' }}
  />
);
