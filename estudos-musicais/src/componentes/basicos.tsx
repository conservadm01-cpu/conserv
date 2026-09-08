import Link from 'next/link';

export function Cabecalho({ titulo, subtitulo, voltar }: { titulo: string; subtitulo?: string; voltar?: string }) {
  return (
    <header className="mb-6 flex items-start gap-3">
      {voltar && (
        <Link href={voltar} aria-label="Voltar"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-black/10 text-xl">‹</Link>
      )}
      <div>
        <h1 className="font-titulo text-2xl leading-tight">{titulo}</h1>
        {subtitulo && <p className="text-sm text-tinta-fraca">{subtitulo}</p>}
      </div>
    </header>
  );
}

const CORES_DE_SITUACAO: Record<string, string> = {
  CONFERIDO: 'bg-metodo-claro text-metodo-escuro',
  PENDENTE_CONFERENCIA: 'bg-pendente-claro text-pendente',
  DIVERGENTE: 'bg-alerta-claro text-alerta',
};

const TEXTO_DE_SITUACAO: Record<string, string> = {
  CONFERIDO: 'conferido',
  PENDENTE_CONFERENCIA: 'pendente de conferência',
  DIVERGENTE: 'divergente das fontes',
};

/** A situação de conferência é informação de primeira classe, não rodapé. */
export function SeloDeConferencia({ situacao }: { situacao: string }) {
  return (
    <span className={`etiqueta ${CORES_DE_SITUACAO[situacao] ?? 'bg-black/5'}`}>
      {TEXTO_DE_SITUACAO[situacao] ?? situacao}
    </span>
  );
}

export function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string | number; detalhe?: string }) {
  return (
    <div className="cartao">
      <p className="rotulo">{rotulo}</p>
      <p className="mt-1 font-titulo text-2xl tabular-nums">{valor}</p>
      {detalhe && <p className="text-xs text-tinta-fraca">{detalhe}</p>}
    </div>
  );
}

export function Aviso({ tom = 'neutro', children }: { tom?: 'neutro' | 'pendente' | 'alerta'; children: React.ReactNode }) {
  const cores = {
    neutro: 'border-black/10 bg-black/[0.03]',
    pendente: 'border-pendente/30 bg-pendente-claro',
    alerta: 'border-alerta/30 bg-alerta-claro',
  }[tom];
  return <p className={`rounded-lg border p-3 text-sm ${cores}`}>{children}</p>;
}

export const formatarTempo = (segundos: number) => {
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.round((segundos % 3600) / 60);
  return horas ? `${horas} h ${String(minutos).padStart(2, '0')} min` : `${minutos} min`;
};
