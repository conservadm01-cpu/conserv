/**
 * Semeia o catálogo de permissões e a concessão de fábrica.
 *
 * Roda a cada publicação, e é idempotente de propósito — mas com uma
 * distinção que importa: o CATÁLOGO é sincronizado (nome e descrição vêm do
 * código, sempre), enquanto a CONCESSÃO só é criada quando ainda não existe.
 *
 * Se a semente sobrescrevesse a concessão, toda publicação desfaria as
 * decisões que a administração tomou na tela — que é justamente o que esta
 * etapa veio permitir.
 */

import { clienteAdministrativo } from '../src/lib/banco.ts';
import { PADRAO_POR_PAPEL, PERMISSOES } from '../src/lib/permissoes.ts';
import type { Papel } from '../src/lib/autorizacao.ts';

const banco = clienteAdministrativo();

async function semear() {
  let catalogoNovo = 0;
  for (const permissao of PERMISSOES) {
    const antes = await banco.permissao.findUnique({ where: { chave: permissao.chave } });
    if (!antes) catalogoNovo += 1;
    await banco.permissao.upsert({
      where: { chave: permissao.chave },
      create: {
        chave: permissao.chave, grupo: permissao.grupo, nome: permissao.nome,
        descricao: permissao.descricao, soAdministracao: Boolean(permissao.soAdministracao),
      },
      update: {
        grupo: permissao.grupo, nome: permissao.nome,
        descricao: permissao.descricao, soAdministracao: Boolean(permissao.soAdministracao),
      },
    });
  }

  let concessoesNovas = 0;
  for (const [papel, chaves] of Object.entries(PADRAO_POR_PAPEL) as Array<[Papel, string[]]>) {
    for (const chave of chaves) {
      const jaExiste = await banco.permissaoDoPapel.findUnique({
        where: { papel_permissaoChave: { papel, permissaoChave: chave } },
      });
      if (jaExiste) continue;
      await banco.permissaoDoPapel.create({
        data: { papel, permissaoChave: chave, concedida: true, observacao: 'concessão de fábrica' },
      });
      concessoesNovas += 1;
    }
  }

  // Permissão que saiu do código mas ficou no banco: ninguém a verifica, e
  // ela apareceria na tela prometendo algo que não acontece.
  const conhecidas = PERMISSOES.map((p) => p.chave);
  const orfas = await banco.permissao.findMany({ where: { chave: { notIn: conhecidas } } });

  console.log(`Catálogo: ${PERMISSOES.length} permissões (${catalogoNovo} nova(s)).`);
  console.log(`Concessões de fábrica: ${concessoesNovas} criada(s); as existentes foram preservadas.`);
  if (orfas.length) {
    console.log(`Atenção: ${orfas.length} permissão(ões) no banco sem verificação no código: ${orfas.map((o) => o.chave).join(', ')}`);
  }
}

await semear();
await banco.$disconnect();
