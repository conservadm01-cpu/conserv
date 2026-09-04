import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { query } from '../lib/api';
import { useDebounce } from '../lib/hooks';
import { Campo } from './ui';

export type CampoFiltro =
  | { chave: string; rotulo: string; tipo: 'busca'; espaco?: string }
  | { chave: string; rotulo: string; tipo: 'select'; opcoes: Array<{ valor: string | number; rotulo: string }> }
  | { chave: string; rotulo: string; tipo: 'data' }
  | { chave: string; rotulo: string; tipo: 'numero' }
  | { chave: string; rotulo: string; tipo: 'marcar' };

export type Valores = Record<string, string>;

/**
 * Estado dos filtros de uma tela.
 *
 * A busca é atrasada para não disparar uma consulta por tecla; os demais
 * campos valem na hora. O caminho já sai montado com a query string, então a
 * tela só passa isso para `useApi`.
 */
export function useFiltros(recurso: string, iniciais: Valores = {}) {
  const [valores, setValores] = useState<Valores>(iniciais);
  const buscaLenta = useDebounce(valores.busca ?? '', 350);

  const definir = useCallback((chave: string, valor: string) => {
    setValores((atual) => ({ ...atual, [chave]: valor }));
  }, []);

  const limpar = useCallback(() => setValores(iniciais), [iniciais]);

  const caminho = useMemo(
    () => `${recurso}${query({ ...valores, busca: buscaLenta })}`,
    [recurso, valores, buscaLenta]
  );

  // Só conta como filtro ativo o que difere do estado inicial da tela.
  const ativos = useMemo(
    () => Object.entries(valores).filter(([k, v]) => v !== '' && v !== (iniciais[k] ?? '')).length,
    [valores, iniciais]
  );

  return { valores, definir, limpar, caminho, ativos };
}

/** Barra de filtros: mesma forma e mesmo comportamento em todas as telas. */
export function BarraFiltros({ campos, valores, aoMudar, aoLimpar, ativos, extra }: {
  campos: CampoFiltro[];
  valores: Valores;
  aoMudar: (chave: string, valor: string) => void;
  aoLimpar: () => void;
  ativos: number;
  extra?: ReactNode;
}) {
  return (
    <div className="barra-filtros">
      {campos.map((campo) => {
        if (campo.tipo === 'marcar') {
          return (
            <label key={campo.chave} className="marcar filtro-marcar">
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={valores[campo.chave] === 'true'}
                onChange={(e) => aoMudar(campo.chave, e.target.checked ? 'true' : '')}
              />
              {campo.rotulo}
            </label>
          );
        }
        return (
          <div key={campo.chave} className={campo.tipo === 'busca' ? 'filtro-busca' : 'filtro-campo'}>
            <Campo rotulo={campo.rotulo}>
              {campo.tipo === 'select' ? (
                <select value={valores[campo.chave] ?? ''} onChange={(e) => aoMudar(campo.chave, e.target.value)}>
                  <option value="">Todos</option>
                  {campo.opcoes.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.rotulo}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={campo.tipo === 'data' ? 'date' : campo.tipo === 'numero' ? 'number' : 'search'}
                  value={valores[campo.chave] ?? ''}
                  placeholder={campo.tipo === 'busca' ? campo.rotulo : undefined}
                  onChange={(e) => aoMudar(campo.chave, e.target.value)}
                />
              )}
            </Campo>
          </div>
        );
      })}
      {extra}
      <button className="pequeno filtro-limpar" onClick={aoLimpar} disabled={ativos === 0}>
        Limpar{ativos > 0 ? ` (${ativos})` : ''}
      </button>
    </div>
  );
}
