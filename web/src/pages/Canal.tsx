import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/hooks';
import { BarraFiltros, useFiltros, type CampoFiltro } from '../components/Filtros';
import { data } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Campo, Indicador, Etiqueta, Modal } from '../components/ui';
import type { Manifestacao } from '../tipos';

const TIPOS = [
  { valor: 'SUGESTAO', rotulo: 'Sugestão' },
  { valor: 'PROBLEMA', rotulo: 'Problema' },
  { valor: 'RISCO', rotulo: 'Risco' },
  { valor: 'RELATO', rotulo: 'Relato' },
  { valor: 'ELOGIO', rotulo: 'Elogio' },
];

const TOM: Record<string, string> = {
  SUGESTAO: 'azul', PROBLEMA: 'amarela', RISCO: 'vermelha', RELATO: '', ELOGIO: 'verde',
};

export default function Canal() {
  const [novo, setNovo] = useState(false);
  const [tratando, setTratando] = useState<Manifestacao | null>(null);

  const filtros = useFiltros('/canal/manifestacoes', {});
  const { dados, carregando, erro, recarregar } = useApi<Manifestacao[]>(filtros.caminho, [filtros.caminho]);

  const campos: CampoFiltro[] = [
    { chave: 'busca', rotulo: 'Assunto, mensagem ou tratativa', tipo: 'busca' },
    { chave: 'status', rotulo: 'Situação', tipo: 'select', opcoes: [
      { valor: 'ABERTA', rotulo: 'Aberta' },
      { valor: 'EM_ANALISE', rotulo: 'Em análise' },
      { valor: 'RESOLVIDA', rotulo: 'Resolvida' },
      { valor: 'ARQUIVADA', rotulo: 'Arquivada' },
    ] },
    { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: TIPOS.map((t) => ({ valor: t.valor, rotulo: t.rotulo })) },
    { chave: 'de', rotulo: 'De', tipo: 'data' },
    { chave: 'ate', rotulo: 'até', tipo: 'data' },
    { chave: 'anonimas', rotulo: 'só anônimas', tipo: 'marcar' },
  ];

  const abertas = (dados ?? []).filter((m) => m.status === 'ABERTA').length;
  const riscos = (dados ?? []).filter((m) => m.tipo === 'RISCO' && m.status !== 'RESOLVIDA').length;

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Conversa aberta</h1>
          <p>Sugestões, problemas e riscos trazidos por quem está na operação</p>
        </div>
        <div className="acoes">
          <button className="primario" onClick={() => setNovo(true)}>Registrar manifestação</button>
        </div>
      </header>

      <div className="grade c3">
        <Indicador rotulo="Em aberto" valor={abertas} tom={abertas ? 'perigo' : 'sucesso'} />
        <Indicador rotulo="Riscos não resolvidos" valor={riscos} tom={riscos ? 'perigo' : 'sucesso'} />
        <Indicador rotulo="Total registrado" valor={dados?.length ?? 0} />
      </div>

      <Cartao>
        <BarraFiltros campos={campos} valores={filtros.valores} aoMudar={filtros.definir}
          aoLimpar={filtros.limpar} ativos={filtros.ativos} />

        {carregando && <Carregando />}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {dados && dados.length === 0 && <Vazio texto="Nada registrado ainda." />}
        {dados && dados.length > 0 && (
          <div className="tabela-rolagem" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Data</th><th>Tipo</th><th>Assunto</th><th>Mensagem</th>
                  <th>Autor</th><th>Situação</th><th />
                </tr>
              </thead>
              <tbody>
                {dados.map((m) => (
                  <tr key={m.id}>
                    <td>{data(m.criado_em.slice(0, 10))}</td>
                    <td><Etiqueta texto={TIPOS.find((t) => t.valor === m.tipo)?.rotulo ?? m.tipo} tom={TOM[m.tipo]} /></td>
                    <td>{m.assunto ?? '—'}</td>
                    <td title={m.mensagem}>{m.mensagem.slice(0, 70)}{m.mensagem.length > 70 ? '…' : ''}</td>
                    <td>{m.anonima ? <span style={{ color: 'var(--texto-suave)' }}>anônima</span> : m.autor}</td>
                    <td><Etiqueta texto={m.status.replace('_', ' ').toLowerCase()}
                      tom={m.status === 'RESOLVIDA' ? 'verde' : m.status === 'ABERTA' ? 'amarela' : 'azul'} /></td>
                    <td><button className="pequeno" onClick={() => setTratando(m)}>Tratar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <FormularioManifestacao aberto={novo} aoFechar={() => setNovo(false)}
        aoSalvar={() => { setNovo(false); recarregar(); }} />
      <Tratativa manifestacao={tratando} aoFechar={() => setTratando(null)}
        aoSalvar={() => { setTratando(null); recarregar(); }} />
    </>
  );
}

function FormularioManifestacao({ aberto, aoFechar, aoSalvar }: {
  aberto: boolean; aoFechar: () => void; aoSalvar: () => void;
}) {
  const [tipo, setTipo] = useState('SUGESTAO');
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [autor, setAutor] = useState('');
  const [setor, setSetor] = useState('');
  const [anonima, setAnonima] = useState(true);
  const [erro, setErro] = useState('');

  async function salvar() {
    if (mensagem.trim().length < 3) return setErro('Escreva a mensagem.');
    setErro('');
    try {
      await api.post('/canal/manifestacoes', {
        tipo, assunto: assunto.trim() || null, mensagem: mensagem.trim(),
        autor: autor.trim() || null, setor: setor.trim() || null, anonima,
      });
      setAssunto(''); setMensagem(''); setAutor('');
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível registrar');
    }
  }

  return (
    <Modal
      titulo="Registrar manifestação"
      aberto={aberto}
      aoFechar={aoFechar}
      rodape={
        <>
          <button onClick={aoFechar}>Cancelar</button>
          <button className="primario" onClick={salvar}>Registrar</button>
        </>
      }
    >
      <Aviso tipo="erro">{erro}</Aviso>
      <div className="linha-campos">
        <Campo rotulo="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Assunto"><input value={assunto} onChange={(e) => setAssunto(e.target.value)} /></Campo>
        <Campo rotulo="Setor"><input value={setor} onChange={(e) => setSetor(e.target.value)} /></Campo>
      </div>
      <Campo rotulo="Mensagem">
        <textarea rows={5} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
      </Campo>
      <label style={{ display: 'flex', gap: 6, fontWeight: 400, marginBottom: 10 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={anonima}
          onChange={(e) => setAnonima(e.target.checked)} /> registrar anonimamente
      </label>
      {!anonima && (
        <Campo rotulo="Seu nome"><input value={autor} onChange={(e) => setAutor(e.target.value)} /></Campo>
      )}
    </Modal>
  );
}

function Tratativa({ manifestacao, aoFechar, aoSalvar }: {
  manifestacao: Manifestacao | null; aoFechar: () => void; aoSalvar: () => void;
}) {
  const [status, setStatus] = useState('');
  const [tratativa, setTratativa] = useState('');
  const [erro, setErro] = useState('');

  async function salvar() {
    if (!manifestacao) return;
    setErro('');
    try {
      await api.put(`/canal/manifestacoes/${manifestacao.id}`, {
        status: status || manifestacao.status,
        tratativa: tratativa || manifestacao.tratativa,
      });
      setStatus(''); setTratativa('');
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar');
    }
  }

  return (
    <Modal
      titulo="Tratar manifestação"
      aberto={Boolean(manifestacao)}
      aoFechar={aoFechar}
      rodape={
        <>
          <button onClick={aoFechar}>Fechar</button>
          <button className="primario" onClick={salvar}>Salvar</button>
        </>
      }
    >
      <Aviso tipo="erro">{erro}</Aviso>
      {manifestacao && (
        <>
          <p style={{ background: 'var(--superficie-2)', padding: 12, borderRadius: 8, marginTop: 0 }}>
            {manifestacao.mensagem}
          </p>
          <div className="linha-campos">
            <Campo rotulo="Situação">
              <select value={status || manifestacao.status} onChange={(e) => setStatus(e.target.value)}>
                <option value="ABERTA">Aberta</option>
                <option value="EM_ANALISE">Em análise</option>
                <option value="RESOLVIDA">Resolvida</option>
                <option value="ARQUIVADA">Arquivada</option>
              </select>
            </Campo>
          </div>
          <Campo rotulo="Tratativa">
            <textarea rows={4} value={tratativa || manifestacao.tratativa || ''}
              onChange={(e) => setTratativa(e.target.value)} />
          </Campo>
        </>
      )}
    </Modal>
  );
}
