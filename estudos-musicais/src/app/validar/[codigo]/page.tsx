import Link from 'next/link';
import { semUsuario } from '@/lib/banco.ts';
import { Cabecalho, Aviso } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

/**
 * Conferência pública de certificado.
 *
 * Esta é a única tela do sistema que abre SEM conta, e abre de propósito: um
 * certificado existe para ser mostrado a terceiros, e quem confere é
 * justamente quem está de fora. Uma conferência que exigisse login não
 * serviria para nada.
 *
 * O que ela mostra é só o que o próprio papel impresso já mostra. Não há como
 * listar certificados nem descobrir quem estuda onde: a consulta passa por
 * uma função de banco de escopo estreito, que recebe o código e devolve
 * apenas aquele registro.
 */

interface CertificadoPublico {
  codigo: string;
  aluno: string;
  metodo: string | null;
  trilha: string;
  emitido_em: Date;
  revogado_em: Date | null;
  revogado_motivo: string | null;
  retrato: Record<string, unknown> | null;
  responsavel: string | null;
}

export default async function Validar({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const limpo = decodeURIComponent(codigo).trim().toUpperCase();

  const linhas = await semUsuario((banco) =>
    banco.$queryRaw<CertificadoPublico[]>`SELECT * FROM app.certificado_publico(${limpo})`);
  const certificado = linhas[0] ?? null;

  return (
    <main className="mx-auto max-w-xl p-6 pb-16">
      <Cabecalho titulo="Conferência de certificado" subtitulo={`Código ${limpo}`} />

      {!certificado ? (
        <>
          <Aviso tom="alerta">
            <b>Nenhum certificado com este código.</b> Confira se o código foi digitado exatamente como
            está no documento — inclusive os hifens.
          </Aviso>
          <p className="mt-4 text-sm text-tinta-fraca">
            Um código que não confere não significa, por si só, que o documento seja falso: pode ter sido
            emitido por outra instituição, ou digitado com engano. Em caso de dúvida, procure a secretaria.
          </p>
        </>
      ) : certificado.revogado_em ? (
        <>
          <Aviso tom="alerta">
            <b>Este certificado foi cancelado.</b> Ele existiu, foi emitido em{' '}
            {new Date(certificado.emitido_em).toLocaleDateString('pt-BR')} e foi cancelado em{' '}
            {new Date(certificado.revogado_em).toLocaleDateString('pt-BR')}.
          </Aviso>
          {certificado.revogado_motivo && (
            <p className="mt-3 text-sm"><b>Motivo:</b> {certificado.revogado_motivo}</p>
          )}
        </>
      ) : (
        <>
          <div className="mb-4">
            <Aviso>
              <b>Certificado conferido.</b> Este código corresponde a um certificado emitido por esta
              plataforma e não cancelado.
            </Aviso>
          </div>
          <dl className="cartao grid gap-3 text-sm">
            <div>
              <dt className="rotulo">Aluno</dt>
              <dd className="font-semibold">{certificado.aluno}</dd>
            </div>
            <div>
              <dt className="rotulo">Método</dt>
              <dd>{certificado.metodo ?? certificado.trilha}</dd>
            </div>
            {typeof certificado.retrato?.instrumento === 'string' && (
              <div>
                <dt className="rotulo">Instrumento</dt>
                <dd>{certificado.retrato.instrumento as string}</dd>
              </div>
            )}
            {typeof certificado.retrato?.versao === 'string' && (
              <div>
                <dt className="rotulo">Versão do método</dt>
                <dd>{certificado.retrato.versao as string}</dd>
              </div>
            )}
            <div>
              <dt className="rotulo">Emitido em</dt>
              <dd>{new Date(certificado.emitido_em).toLocaleDateString('pt-BR')}</dd>
            </div>
            {certificado.responsavel && (
              <div>
                <dt className="rotulo">Responsável pela emissão</dt>
                <dd>{certificado.responsavel}</dd>
              </div>
            )}
          </dl>
          <p className="mt-4 text-xs text-tinta-fraca">
            Os dados acima são os do dia da emissão, copiados no momento em que o certificado foi gerado.
            Se o método for alterado depois, este certificado continua dizendo o que foi concluído.
          </p>
        </>
      )}

      <Link href="/validar" className="botao-secundario mt-8">Conferir outro código</Link>
    </main>
  );
}
