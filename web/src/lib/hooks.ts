import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

/** Busca dados da API e reexecuta quando as dependências mudam. */
export function useApi<T>(caminho: string | null, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(Boolean(caminho));
  const [erro, setErro] = useState<string | null>(null);
  const [gatilho, setGatilho] = useState(0);

  const recarregar = useCallback(() => setGatilho((n) => n + 1), []);

  useEffect(() => {
    if (!caminho) {
      setDados(null);
      setCarregando(false);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    api
      .get<T>(caminho)
      .then((r) => !cancelado && (setDados(r), setErro(null)))
      .catch((e: ApiError) => !cancelado && setErro(e.message))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminho, gatilho, ...deps]);

  return { dados, carregando, erro, recarregar, setDados };
}

/** Atrasa a propagação do valor — usado nos campos de busca das listagens. */
export function useDebounce<T>(valor: T, ms = 350): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}
