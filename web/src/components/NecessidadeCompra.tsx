import { useMemo, useState } from 'react';
import { useApi } from '../lib/hooks';
import { query } from '../lib/api';
import { data, decimal, moeda, numero } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Campo, Indicador, Etiqueta } from '../components/ui';
import type { Necessidade as LinhaNecessidade } from '../tipos';

/**
 * MRP simples: explode a ficha técnica das ordens em aberto e desconta o saldo
 * do almoxarifado. É o ponto de partida das requisições de compra.
 */
export default function Necessidade() {
  const [ate, setAte] = useState('');
  const [busca, setBusca] = useState('');
  const [soComprar, setSoComprar] = useState(true);

  const caminho = `/materiais/estoque/necessidade${query({ ate })}`;
  const { dados, carregando, erro } = useApi<LinhaNecessidade[]>(caminho, [caminho]);

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (dados ?? [])
      .filter((l) => !soComprar || l.comprar > 0)
      .filter((l) => !termo
        || l.descricao.toLowerCase().includes(termo)
        || (l.codigo ?? '').toLowerCase().includes(termo)
        || (l.fornecedor ?? '').toLowerCase().includes(termo));
  }, [dados, soComprar, busca]);

  const total = linhas.reduce((s, l) => s + l.valor_compra, 0);
  const limpar = () => { setAte(''); setBusca(''); setSoComprar(true); };
  const ativos = (ate ? 1 : 0) + (busca ? 1 : 0) + (soComprar ? 0 : 1);

  return (
    <>
      <div className="grade c3">
        <Indicador rotulo="Materiais a comprar" valor={numero(linhas.filter((l) => l.comprar > 0).length)} />
        <Indicador rotulo="Investimento estimado" valor={moeda(total)} />
        <Indicador rotulo="Materiais analisados" valor={numero(dados?.length ?? 0)} />
      </div>

      <Cartao
        titulo="Necessidade de compra"
        acao={
          <button className="pequeno" onClick={() => exportarCsv(linhas)} disabled={linhas.length === 0}>
            Exportar CSV
          </button>
        }
      >
        <div className="barra-filtros">
          <div className="filtro-busca">
            <Campo rotulo="Material, código ou fornecedor">
              <input type="search" value={busca} placeholder="Material, código ou fornecedor"
                onChange={(e) => setBusca(e.target.value)} />
            </Campo>
          </div>
          <div className="filtro-campo">
            <Campo rotulo="Entregas até">
              <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            </Campo>
          </div>
          <label className="marcar filtro-marcar">
            <input type="checkbox" style={{ width: 'auto' }} checked={soComprar}
              onChange={(e) => setSoComprar(e.target.checked)} />
            só o que falta comprar
          </label>
          <button className="pequeno filtro-limpar" onClick={limpar} disabled={ativos === 0}>
            Limpar{ativos > 0 ? ` (${ativos})` : ''}
          </button>
        </div>

        {carregando && <Carregando />}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {!carregando && linhas.length === 0 && (
          <Vazio texto="Nada a comprar. Cadastre a ficha técnica dos produtos para que o cálculo apareça aqui." />
        )}
        {linhas.length > 0 && (
          <div className="tabela-rolagem" style={{ maxHeight: '58vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Material</th><th>Fornecedor</th>
                  <th className="num">Necessidade</th><th className="num">Saldo</th>
                  <th className="num">Comprar</th><th className="num">Custo unit.</th>
                  <th className="num">Investimento</th>
                  <th className="num">OPs</th><th>1ª entrega</th><th />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id}>
                    <td>{l.descricao}{l.codigo && <div className="sub">{l.codigo}</div>}</td>
                    <td>{l.fornecedor ?? '—'}</td>
                    <td className="num">{decimal(l.necessidade)} {l.unidade}</td>
                    <td className="num">{decimal(l.saldo)}</td>
                    <td className="num"><strong>{decimal(l.comprar)}</strong></td>
                    <td className="num">{moeda(l.custo_unitario)}</td>
                    <td className="num">{moeda(l.valor_compra)}</td>
                    <td className="num">{l.ordens}</td>
                    <td>{data(l.primeira_entrega)}</td>
                    <td>
                      {l.comprar > 0
                        ? <Etiqueta texto="Comprar" tom="vermelha" />
                        : <Etiqueta texto="Coberto" tom="verde" />}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6}><strong>Total</strong></td>
                  <td className="num"><strong>{moeda(total)}</strong></td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Cartao>
    </>
  );
}

function exportarCsv(linhas: LinhaNecessidade[]) {
  const csv = [
    ['Codigo', 'Material', 'Unidade', 'Fornecedor', 'Necessidade', 'Saldo', 'Comprar',
     'Custo unitario', 'Investimento', 'Primeira entrega'].join(';'),
    ...linhas.map((l) =>
      [
        l.codigo ?? '', l.descricao, l.unidade, l.fornecedor ?? '',
        String(l.necessidade).replace('.', ','), String(l.saldo).replace('.', ','),
        String(l.comprar).replace('.', ','), String(l.custo_unitario).replace('.', ','),
        String(l.valor_compra).replace('.', ','), l.primeira_entrega ?? '',
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')
    ),
  ].join('\n');

  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `necessidade-compra-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
