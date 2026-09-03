import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, query } from '../lib/api';
import { useApi, useDebounce } from '../lib/hooks';
import { Cartao, Carregando, Aviso, Vazio, Modal, Campo } from './ui';

export type CampoForm = {
  nome: string;
  rotulo: string;
  tipo?: 'texto' | 'numero' | 'select' | 'data';
  opcoes?: Array<{ valor: string | number; rotulo: string }>;
  obrigatorio?: boolean;
  padrao?: string | number;
  ajuda?: string;
};

export type Coluna<T> = {
  chave: string;
  rotulo: string;
  num?: boolean;
  render?: (linha: T) => ReactNode;
};

/**
 * Listagem + formulário para os cadastros simples (materiais, clientes, tabelas auxiliares).
 * Fala com os endpoints CRUD padrão do backend: GET/POST na raiz, PUT/DELETE por id.
 */
export default function TabelaCrud<T extends { id: number }>({
  titulo, descricao, recurso, colunas, campos, buscavel = true, aoMudar, acoesExtras, permiteExcluir = true,
}: {
  titulo: string;
  descricao?: string;
  recurso: string;
  colunas: Coluna<T>[];
  campos: CampoForm[];
  buscavel?: boolean;
  aoMudar?: () => void;
  acoesExtras?: (linha: T) => ReactNode;
  permiteExcluir?: boolean;
}) {
  const [busca, setBusca] = useState('');
  const buscaLenta = useDebounce(busca);
  const [editando, setEditando] = useState<Partial<T> | null>(null);
  const [falha, setFalha] = useState('');

  const caminho = `${recurso}${query({ busca: buscavel ? buscaLenta : '' })}`;
  const { dados, carregando, erro, recarregar } = useApi<T[]>(caminho, [caminho]);

  const atualizar = () => {
    recarregar();
    aoMudar?.();
  };

  async function excluir(linha: T) {
    if (!confirm('Remover este registro? Cadastros com histórico são apenas inativados.')) return;
    setFalha('');
    try {
      await api.delete(`${recurso}/${linha.id}`);
      atualizar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível remover');
    }
  }

  return (
    <>
      <Cartao
        titulo={
          <div>
            <h3>{titulo}</h3>
            {descricao && <small>{descricao}</small>}
          </div>
        }
        acao={
          <div className="acoes">
            {buscavel && (
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" style={{ width: 210 }} />
            )}
            <button className="primario" onClick={() => setEditando({})}>Novo</button>
          </div>
        }
      >
        <Aviso tipo="erro">{falha || erro}</Aviso>
        {carregando && <Carregando />}
        {dados && dados.length === 0 && <Vazio texto="Nenhum registro cadastrado." />}
        {dados && dados.length > 0 && (
          <div className="tabela-rolagem" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  {colunas.map((c) => <th key={c.chave} className={c.num ? 'num' : undefined}>{c.rotulo}</th>)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {dados.map((linha) => (
                  <tr key={linha.id}>
                    {colunas.map((c) => (
                      <td key={c.chave} className={c.num ? 'num' : undefined}>
                        {c.render ? c.render(linha) : String((linha as Record<string, unknown>)[c.chave] ?? '—')}
                      </td>
                    ))}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {acoesExtras?.(linha)}{' '}
                      <button className="pequeno" onClick={() => setEditando(linha)}>Editar</button>{' '}
                      {permiteExcluir && <button className="pequeno perigo" onClick={() => excluir(linha)}>Remover</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <FormularioCrud
        recurso={recurso}
        campos={campos}
        registro={editando}
        aoFechar={() => setEditando(null)}
        aoSalvar={() => { setEditando(null); atualizar(); }}
      />
    </>
  );
}

function FormularioCrud<T extends { id: number }>({ recurso, campos, registro, aoFechar, aoSalvar }: {
  recurso: string; campos: CampoForm[]; registro: Partial<T> | null;
  aoFechar: () => void; aoSalvar: () => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!registro) return;
    const iniciais: Record<string, string> = {};
    for (const campo of campos) {
      const bruto = (registro as Record<string, unknown>)[campo.nome];
      iniciais[campo.nome] = bruto === null || bruto === undefined ? String(campo.padrao ?? '') : String(bruto);
    }
    setValores(iniciais);
    setErro('');
  }, [registro, campos]);

  async function salvar() {
    if (!registro) return;
    const corpo: Record<string, unknown> = {};
    for (const campo of campos) {
      const bruto = (valores[campo.nome] ?? '').trim();
      if (campo.obrigatorio && !bruto) return setErro(`Preencha o campo "${campo.rotulo}".`);
      if (bruto === '') {
        corpo[campo.nome] = null;
      } else if (campo.tipo === 'numero' || (campo.tipo === 'select' && campo.nome.endsWith('_id'))) {
        corpo[campo.nome] = Number(bruto);
      } else {
        corpo[campo.nome] = bruto;
      }
    }
    setSalvando(true);
    setErro('');
    try {
      const id = (registro as { id?: number }).id;
      if (id) await api.put(`${recurso}/${id}`, corpo);
      else await api.post(recurso, corpo);
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  }

  const editando = Boolean((registro as { id?: number } | null)?.id);

  return (
    <Modal
      titulo={editando ? 'Editar registro' : 'Novo registro'}
      aberto={Boolean(registro)}
      aoFechar={aoFechar}
      rodape={
        <>
          <button onClick={aoFechar}>Cancelar</button>
          <button className="primario" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <Aviso tipo="erro">{erro}</Aviso>
      <div className="linha-campos">
        {campos.map((campo) => (
          <Campo key={campo.nome} rotulo={campo.rotulo + (campo.obrigatorio ? ' *' : '')}>
            {campo.tipo === 'select' ? (
              <select
                value={valores[campo.nome] ?? ''}
                onChange={(e) => setValores((v) => ({ ...v, [campo.nome]: e.target.value }))}
              >
                <option value="">—</option>
                {campo.opcoes?.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
            ) : (
              <input
                type={campo.tipo === 'numero' ? 'number' : campo.tipo === 'data' ? 'date' : 'text'}
                step={campo.tipo === 'numero' ? 'any' : undefined}
                value={valores[campo.nome] ?? ''}
                onChange={(e) => setValores((v) => ({ ...v, [campo.nome]: e.target.value }))}
              />
            )}
            {campo.ajuda && <small style={{ color: 'var(--texto-suave)' }}>{campo.ajuda}</small>}
          </Campo>
        ))}
      </div>
    </Modal>
  );
}
