import { useEffect, type ReactNode } from 'react';
import { ROTULO_STATUS } from '../lib/formato';

export function Cartao({ titulo, acao, children, rodape }: {
  titulo?: ReactNode; acao?: ReactNode; children: ReactNode; rodape?: ReactNode;
}) {
  return (
    <section className="cartao">
      {(titulo || acao) && (
        <div className="cartao-cabeca">
          {typeof titulo === 'string' ? <h3>{titulo}</h3> : titulo}
          {acao}
        </div>
      )}
      <div className="cartao-corpo">{children}</div>
      {rodape}
    </section>
  );
}

export function Indicador({ rotulo, valor, nota, tom }: {
  rotulo: string; valor: ReactNode; nota?: ReactNode; tom?: 'perigo' | 'sucesso';
}) {
  return (
    <div className={`indicador${tom ? ` destaque-${tom}` : ''}`}>
      <div className="rotulo">{rotulo}</div>
      <div className="valor">{valor}</div>
      {nota && <div className="nota">{nota}</div>}
    </div>
  );
}

const TONS: Record<string, string> = {
  ABERTA: '', ABERTO: '', PENDENTE: '',
  EM_PRODUCAO: 'azul', EM_ANDAMENTO: 'amarela', FATURADO: 'azul',
  CONCLUIDA: 'verde', ENTREGUE: 'verde',
  CANCELADA: 'vermelha', CANCELADO: 'vermelha',
  NAO_APLICAVEL: '',
};

export const Etiqueta = ({ status, tom, texto }: { status?: string; tom?: string; texto?: string }) => (
  <span className={`etiqueta ${tom ?? (status ? TONS[status] : '') ?? ''}`}>
    {texto ?? (status ? ROTULO_STATUS[status] ?? status : '')}
  </span>
);

export function Modal({ titulo, aberto, aoFechar, largo, rodape, children }: {
  titulo: string; aberto: boolean; aoFechar: () => void;
  largo?: boolean; rodape?: ReactNode; children: ReactNode;
}) {
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [aberto, aoFechar]);

  if (!aberto) return null;
  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className={`modal${largo ? ' largo' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-cabeca">
          <h3>{titulo}</h3>
          <button className="fechar" onClick={aoFechar} aria-label="Fechar">×</button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

export const Aviso = ({ tipo = 'info', children }: { tipo?: 'erro' | 'ok' | 'info'; children: ReactNode }) =>
  children ? <div className={`aviso ${tipo}`}>{children}</div> : null;

export const Carregando = ({ texto = 'Carregando…' }: { texto?: string }) => (
  <div className="carregando">{texto}</div>
);

export const Vazio = ({ texto }: { texto: string }) => <div className="vazio">{texto}</div>;

export const Barra = ({ valor, total }: { valor: number; total: number }) => {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div title={`${valor} de ${total} (${pct}%)`} className="barra">
      <span style={{ width: `${pct}%` }} />
    </div>
  );
};

export function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="campo">
      <label>{rotulo}</label>
      {children}
    </div>
  );
}
