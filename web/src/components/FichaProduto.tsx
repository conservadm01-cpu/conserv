import { useEffect, useRef, useState } from 'react';
import { api, ApiError, pode } from '../lib/api';
import { useApi } from '../lib/hooks';
import { Cartao, Aviso, Vazio, Campo, Carregando } from './ui';
import type { Arte, CorTinta, FichaProduto as TipoFichaProduto, Setor, Via } from '../tipos';

const PERSONALIZACAO = [
  { valor: 'SILK', rotulo: 'Serigrafia / silk' },
  { valor: 'TRANSFER', rotulo: 'Transfer' },
  { valor: 'BORDADO', rotulo: 'Bordado' },
  { valor: 'SUBLIMACAO', rotulo: 'Sublimação' },
  { valor: 'SEM', rotulo: 'Sem personalização' },
];

/** Limite alinhado ao da API: acima disso a via impressa não fica melhor, só o banco maior. */
const LIMITE_IMAGEM = 2 * 1024 * 1024;

/**
 * Ficha impressa do produto: como a arte é aplicada, o que cada setor precisa
 * ler em destaque e as imagens que vão na via.
 *
 * É o cadastro que transforma a ordem de produção num documento que a fábrica
 * consegue executar sem perguntar nada a ninguém.
 */
export default function FichaProduto({ produtoId }: { produtoId: number }) {
  const { dados, carregando, recarregar } = useApi<TipoFichaProduto>(`/fichas/produtos/${produtoId}`, [produtoId]);
  const { dados: opcoes } = useApi<{ vias: Via[] }>('/fichas/opcoes');

  const [arte, setArte] = useState<Arte | null>(null);
  const [cores, setCores] = useState<CorTinta[]>([]);
  const [logo, setLogo] = useState({ descricao: '', posicao: '', largura_cm: '', altura_cm: '', cor: '' });
  const [instrucao, setInstrucao] = useState<{ setor: Setor; texto: string; destaque: boolean }>({
    setor: 'CORTE', texto: '', destaque: false,
  });
  const [imagemSetor, setImagemSetor] = useState<Setor>('PRODUCAO');
  const [mensagem, setMensagem] = useState('');
  const [falha, setFalha] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dados) {
      setArte(dados.arte);
      setCores(dados.arte.cores);
    }
  }, [dados]);

  const podeEditar = pode('produtos.processo');

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

  const salvarArte = () =>
    tentar(async () => {
      await api.put(`/fichas/produtos/${produtoId}/arte`, {
        personalizacao: arte?.personalizacao,
        origem_arte: arte?.origem_arte,
        base_tinta: arte?.base_tinta,
        tinta_pronta: Boolean(arte?.tinta_pronta),
        observacao: arte?.observacao,
      });
      recarregar();
    }, 'Personalização salva.');

  const salvarCores = () =>
    tentar(async () => {
      await api.put(`/fichas/produtos/${produtoId}/cores`, {
        cores: cores
          .filter((c) => c.nome.trim())
          .map((c, i) => ({ sequencia: i + 1, nome: c.nome, referencia: c.referencia, hex: c.hex })),
      });
      recarregar();
    }, 'Receita de tintas salva.');

  const adicionarLogo = () =>
    tentar(async () => {
      await api.post(`/fichas/produtos/${produtoId}/logos`, {
        descricao: logo.descricao,
        posicao: logo.posicao || null,
        largura_cm: Number(logo.largura_cm) || null,
        altura_cm: Number(logo.altura_cm) || null,
        cor: logo.cor || null,
      });
      setLogo({ descricao: '', posicao: '', largura_cm: '', altura_cm: '', cor: '' });
      recarregar();
    }, 'Logo adicionado.');

  const adicionarInstrucao = () =>
    tentar(async () => {
      await api.post(`/fichas/produtos/${produtoId}/instrucoes`, {
        setor: instrucao.setor,
        texto: instrucao.texto,
        destaque: instrucao.destaque,
      });
      setInstrucao({ ...instrucao, texto: '' });
      recarregar();
    }, 'Instrução adicionada à via do setor.');

  function enviarImagem(arquivoEscolhido: File) {
    if (arquivoEscolhido.size > LIMITE_IMAGEM) {
      setFalha('Imagem acima de 2 MB. Reduza antes de enviar — a via impressa não precisa de mais que isso.');
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () =>
      tentar(async () => {
        await api.post(`/fichas/produtos/${produtoId}/imagens`, {
          setor: imagemSetor,
          titulo: arquivoEscolhido.name.replace(/\.[^.]+$/, ''),
          arquivo: String(leitor.result),
        });
        if (arquivo.current) arquivo.current.value = '';
        recarregar();
      }, 'Imagem anexada à ficha.');
    leitor.readAsDataURL(arquivoEscolhido);
  }

  const remover = (caminho: string, pergunta: string) => {
    if (!confirm(pergunta)) return;
    tentar(async () => {
      await api.delete(caminho);
      recarregar();
    }, 'Removido.');
  };

  if (carregando) return <Carregando />;
  if (!dados || !arte || !opcoes) return null;

  const setores = opcoes.vias;

  return (
    <>
      <Aviso tipo="erro">{falha}</Aviso>
      <Aviso tipo="ok">{mensagem}</Aviso>

      <div className="grade c2" style={{ marginTop: 16 }}>
        <Cartao titulo="Personalização" acao={<small>o que a capa da ordem imprime</small>}>
          <div className="grade c2">
            <Campo rotulo="Aplicação">
              <select
                disabled={!podeEditar}
                value={arte.personalizacao}
                onChange={(e) => setArte({ ...arte, personalizacao: e.target.value as Arte['personalizacao'] })}
              >
                {PERSONALIZACAO.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Origem da arte">
              <select
                disabled={!podeEditar}
                value={arte.origem_arte}
                onChange={(e) => setArte({ ...arte, origem_arte: e.target.value as Arte['origem_arte'] })}
              >
                <option value="VETOR">Vetor</option>
                <option value="IMAGEM">Imagem</option>
              </select>
            </Campo>
            <Campo rotulo="Base da tinta">
              <select
                disabled={!podeEditar}
                value={arte.base_tinta ?? ''}
                onChange={(e) => setArte({ ...arte, base_tinta: (e.target.value || null) as Arte['base_tinta'] })}
              >
                <option value="">Não se aplica</option>
                <option value="AGUA">Base d'água</option>
                <option value="VINILICA">Base vinílica</option>
              </select>
            </Campo>
            <Campo rotulo="Tinta">
              <label className="marcador">
                <input
                  type="checkbox"
                  disabled={!podeEditar}
                  checked={Boolean(arte.tinta_pronta)}
                  onChange={(e) => setArte({ ...arte, tinta_pronta: e.target.checked ? 1 : 0 })}
                />
                Tinta já pronta
              </label>
            </Campo>
          </div>
          <Campo rotulo="Observação impressa">
            <textarea
              rows={2}
              disabled={!podeEditar}
              value={arte.observacao ?? ''}
              onChange={(e) => setArte({ ...arte, observacao: e.target.value })}
            />
          </Campo>
          {podeEditar && (
            <div className="linha-acoes">
              <button className="primario" disabled={ocupado} onClick={salvarArte}>Salvar personalização</button>
            </div>
          )}
        </Cartao>

        <Cartao titulo="Logos e medidas" acao={<small>o que o silk mede na tela</small>}>
          {arte.logos.length === 0 && <Vazio texto="Nenhum logo cadastrado." />}
          {arte.logos.length > 0 && (
            <div className="tabela-rolagem">
              <table>
                <thead>
                  <tr><th>Logo</th><th>Posição</th><th className="num">Medida</th><th>Cor</th><th /></tr>
                </thead>
                <tbody>
                  {arte.logos.map((l) => (
                    <tr key={l.id}>
                      <td>{l.descricao}</td>
                      <td>{l.posicao}</td>
                      <td className="num">{l.largura_cm} × {l.altura_cm} cm</td>
                      <td>{l.cor}</td>
                      <td>
                        {podeEditar && (
                          <button className="perigo" onClick={() => remover(`/fichas/logos/${l.id}`, `Remover "${l.descricao}"?`)}>
                            Remover
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {podeEditar && (
            <div className="formulario-linha">
              <input placeholder="Descrição (ex.: logo peito)" value={logo.descricao}
                     onChange={(e) => setLogo({ ...logo, descricao: e.target.value })} />
              <input placeholder="Posição" value={logo.posicao}
                     onChange={(e) => setLogo({ ...logo, posicao: e.target.value })} />
              <input type="number" step="0.1" placeholder="Larg. cm" value={logo.largura_cm}
                     onChange={(e) => setLogo({ ...logo, largura_cm: e.target.value })} />
              <input type="number" step="0.1" placeholder="Alt. cm" value={logo.altura_cm}
                     onChange={(e) => setLogo({ ...logo, altura_cm: e.target.value })} />
              <input placeholder="Cor" value={logo.cor}
                     onChange={(e) => setLogo({ ...logo, cor: e.target.value })} />
              <button disabled={ocupado || !logo.descricao.trim()} onClick={adicionarLogo}>Adicionar</button>
            </div>
          )}
        </Cartao>
      </div>

      <div className="grade c2" style={{ marginTop: 16 }}>
        <Cartao titulo="Receita das tintas" acao={<small>cor a cor, como o estampador procura no pote</small>}>
          {cores.map((c, i) => (
            <div key={i} className="formulario-linha">
              <span className="ordem-cor">Cor {i + 1}</span>
              <input placeholder="Nome" value={c.nome} disabled={!podeEditar}
                     onChange={(e) => setCores(cores.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
              <input placeholder="Referência" value={c.referencia ?? ''} disabled={!podeEditar}
                     onChange={(e) => setCores(cores.map((x, j) => (j === i ? { ...x, referencia: e.target.value } : x)))} />
              <input type="color" value={c.hex ?? '#000000'} disabled={!podeEditar}
                     onChange={(e) => setCores(cores.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} />
              {podeEditar && (
                <button className="perigo" onClick={() => setCores(cores.filter((_, j) => j !== i))}>×</button>
              )}
            </div>
          ))}
          {cores.length === 0 && <Vazio texto="Nenhuma cor na receita." />}
          {podeEditar && (
            <div className="linha-acoes">
              <button
                disabled={cores.length >= 12}
                onClick={() => setCores([...cores, { sequencia: cores.length + 1, nome: '', referencia: '', hex: '#000000' }])}
              >
                Adicionar cor
              </button>
              <button className="primario" disabled={ocupado} onClick={salvarCores}>Salvar receita</button>
            </div>
          )}
        </Cartao>

        <Cartao titulo="Instruções por setor" acao={<small>o recado que não pode passar batido</small>}>
          {setores.map((v) => {
            const lista = dados.instrucoes[v.id] ?? [];
            if (lista.length === 0) return null;
            return (
              <div key={v.id} className="bloco-setor">
                <h4>{v.titulo}</h4>
                <ul className="lista-instrucoes">
                  {lista.map((i) => (
                    <li key={i.id} className={i.destaque ? 'destaque' : ''}>
                      <span>{i.texto}</span>
                      {podeEditar && (
                        <button className="perigo" onClick={() => remover(`/fichas/instrucoes/${i.id}`, 'Remover a instrução?')}>
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {Object.values(dados.instrucoes).every((l) => l.length === 0) && (
            <Vazio texto="Nenhuma instrução cadastrada." />
          )}
          {podeEditar && (
            <div className="formulario-linha">
              <select value={instrucao.setor} onChange={(e) => setInstrucao({ ...instrucao, setor: e.target.value as Setor })}>
                {setores.map((v) => <option key={v.id} value={v.id}>{v.titulo}</option>)}
              </select>
              <input placeholder="Ex.: CORTAR 9000 ALÇAS COM 65CM" value={instrucao.texto}
                     onChange={(e) => setInstrucao({ ...instrucao, texto: e.target.value })} />
              <label className="marcador">
                <input type="checkbox" checked={instrucao.destaque}
                       onChange={(e) => setInstrucao({ ...instrucao, destaque: e.target.checked })} />
                Em destaque
              </label>
              <button disabled={ocupado || !instrucao.texto.trim()} onClick={adicionarInstrucao}>Adicionar</button>
            </div>
          )}
        </Cartao>
      </div>

      <Cartao titulo="Imagens da ficha" acao={<small>foto, molde e layout impressos na via</small>} >
        <div className="galeria-ficha">
          {setores.flatMap((v) =>
            (dados.imagens[v.id] ?? []).map((img) => (
              <figure key={img.id}>
                <img src={img.arquivo} alt={img.titulo ?? ''} />
                <figcaption>
                  <b>{v.titulo}</b>
                  <span>{img.titulo}</span>
                  {podeEditar && (
                    <button className="perigo" onClick={() => remover(`/fichas/imagens/${img.id}`, 'Remover a imagem?')}>
                      Remover
                    </button>
                  )}
                </figcaption>
              </figure>
            ))
          )}
        </div>
        {Object.values(dados.imagens).every((l) => l.length === 0) && (
          <Vazio texto="Nenhuma imagem anexada — a via sai só com as tabelas." />
        )}
        {podeEditar && (
          <div className="formulario-linha">
            <select value={imagemSetor} onChange={(e) => setImagemSetor(e.target.value as Setor)}>
              {setores.map((v) => <option key={v.id} value={v.id}>{v.titulo}</option>)}
            </select>
            <input
              ref={arquivo}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              onChange={(e) => e.target.files?.[0] && enviarImagem(e.target.files[0])}
            />
          </div>
        )}
      </Cartao>
    </>
  );
}
