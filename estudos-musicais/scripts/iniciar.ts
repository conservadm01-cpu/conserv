/**
 * Partida do sistema: cria o PRIMEIRO administrador.
 *
 * É o único cadastro que nasce sem responsável — todos os demais são criados
 * por alguém que já tem acesso, e ficam ligados a quem os criou. Por isso este
 * script tem uma trava: se já existir qualquer usuário, ele não faz nada.
 *
 * A senha inicial é de entrega: o administrador entra com ela uma vez e o
 * sistema exige que escolha a sua. Enquanto não trocar, nenhuma tela abre.
 *
 * Uso:
 *   node --experimental-strip-types scripts/iniciar.ts
 *
 * Variáveis (todas opcionais, com o padrão entre parênteses):
 *   ADMIN_INICIAL_NOME   ("Renato Monteiro")
 *   ADMIN_INICIAL_LOGIN  ("Renato Monteiro")
 *   ADMIN_INICIAL_EMAIL  ("renato.monteiro@estudosmusicais.local")
 *   ADMIN_INICIAL_SENHA  ("CCV123")
 */

import { clienteAdministrativo } from '../src/lib/banco.ts';
import { gerarHashDeSenha } from '../src/lib/senha.ts';
import { normalizarLogin } from '../src/lib/cadastro.ts';

const NOME = process.env.ADMIN_INICIAL_NOME ?? 'Renato Monteiro';
const LOGIN = normalizarLogin(process.env.ADMIN_INICIAL_LOGIN ?? NOME);
const EMAIL = (process.env.ADMIN_INICIAL_EMAIL ?? 'renato.monteiro@estudosmusicais.local').toLowerCase();
const SENHA = process.env.ADMIN_INICIAL_SENHA ?? 'CCV123';

export async function iniciar(prisma: ReturnType<typeof clienteAdministrativo>) {
  const quantos = await prisma.usuario.count();
  if (quantos > 0) {
    return { criado: false, motivo: `já existem ${quantos} usuário(s); a partida não se repete.` };
  }

  const senhaHash = await gerarHashDeSenha(SENHA);
  const administrador = await prisma.usuario.create({
    data: {
      nomeCompleto: NOME,
      email: EMAIL,
      login: LOGIN,
      senhaHash,
      status: 'ATIVO',
      // Vale uma vez. A troca é a primeira tela que ele vê.
      deveTrocarSenha: true,
      // Sem responsável: é o começo da corrente.
      criadoPorId: null,
      aceiteTermosEm: new Date(),
    },
  });

  await prisma.vinculo.create({
    data: { usuarioId: administrador.id, papel: 'SUPERADMIN', escopo: 'GLOBAL', ativo: true },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: administrador.id, acao: 'INICIAR_SISTEMA', entidade: 'usuarios',
      entidadeId: administrador.id,
      depois: { nomeCompleto: NOME, login: LOGIN, email: EMAIL, papel: 'SUPERADMIN', origem: 'partida' },
    },
  });

  return { criado: true, login: LOGIN, email: EMAIL, id: administrador.id };
}

// Só executa quando chamado direto, para os testes poderem importar `iniciar`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const prisma = clienteAdministrativo();
  try {
    const resultado = await iniciar(prisma);
    if (!resultado.criado) {
      console.log(`Nada a fazer: ${resultado.motivo}`);
    } else {
      console.log('Sistema iniciado.');
      console.log(`  administrador: ${NOME}`);
      console.log(`  entra com:     ${resultado.login}  (ou ${resultado.email})`);
      console.log(`  senha inicial: ${SENHA}`);
      console.log('  A troca de senha é exigida na primeira entrada.');
      console.log('\nA partir daqui, todo cadastro é feito por quem já tem acesso.');
    }
  } finally {
    await prisma.$disconnect();
  }
}
