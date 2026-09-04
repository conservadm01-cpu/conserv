/**
 * Montagem de filtros para as listagens.
 *
 * Todas as telas filtram do mesmo jeito — busca em texto, seleção por chave,
 * intervalo de datas e faixa numérica —, então a tradução de query string para
 * SQL fica num lugar só, em vez de repetida em cada rota.
 */
export function montarFiltros(query, mapa) {
  const where = [];
  const params = [];

  for (const [chave, regra] of Object.entries(mapa)) {
    const bruto = query[chave];
    if (bruto === undefined || bruto === '' || bruto === null) continue;

    switch (regra.tipo) {
      case 'busca': {
        // Uma palavra procurada em várias colunas de uma vez.
        where.push(`(${regra.colunas.map((c) => `${c} LIKE ?`).join(' OR ')})`);
        regra.colunas.forEach(() => params.push(`%${bruto}%`));
        break;
      }
      case 'igual': {
        where.push(`${regra.coluna} = ?`);
        params.push(regra.numero ? Number(bruto) : bruto);
        break;
      }
      case 'em': {
        const valores = String(bruto).split(',').map((v) => v.trim()).filter(Boolean);
        if (valores.length === 0) break;
        where.push(`${regra.coluna} IN (${valores.map(() => '?').join(',')})`);
        params.push(...(regra.numero ? valores.map(Number) : valores));
        break;
      }
      case 'de': {
        where.push(`${regra.coluna} >= ?`);
        params.push(bruto);
        break;
      }
      case 'ate': {
        where.push(`${regra.coluna} <= ?`);
        params.push(bruto);
        break;
      }
      case 'min': {
        where.push(`${regra.coluna} >= ?`);
        params.push(Number(bruto));
        break;
      }
      case 'max': {
        where.push(`${regra.coluna} <= ?`);
        params.push(Number(bruto));
        break;
      }
      case 'booleano': {
        // "true" liga a condição; "false" liga a negação, quando houver.
        const ligado = bruto === 'true' || bruto === '1';
        const condicao = ligado ? regra.quandoVerdadeiro : regra.quandoFalso;
        if (condicao) where.push(condicao);
        break;
      }
      default:
        break;
    }
  }

  return {
    where,
    params,
    sql: where.length ? ` WHERE ${where.join(' AND ')}` : '',
  };
}

/** Ordenação segura: só aceita colunas declaradas pela rota. */
export function montarOrdem(query, permitidas, padrao) {
  const campo = query.ordenar_por;
  if (!campo || !permitidas.includes(campo)) return padrao;
  const direcao = String(query.ordem ?? '').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  return `${campo} ${direcao}`;
}

export const limitar = (query, padrao = 300, teto = 3000) =>
  Math.min(Number(query.limite) || padrao, teto);
