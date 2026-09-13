/**
 * Acessos de teste — um usuário para cada nível, com senha conhecida.
 *
 * Serve para experimentar o sistema pelo lado de quem usa: entrar como PCP e
 * ver que o menu não tem financeiro, entrar como chão de fábrica e ver que só
 * o apontamento abre. Sem isso, todo teste acaba sendo feito como
 * administrador — que enxerga tudo e, por isso, não prova nada sobre permissão.
 *
 * A senha é a mesma para todos e aparece impressa na tela de propósito: é uma
 * conta descartável para avaliar o sistema, não credencial de pessoa. Por isso
 * o script se recusa a rodar em produção — lá, acesso se cria pela tela de
 * usuários, com senha provisória que a pessoa troca na primeira entrada.
 *
 *   npm run db:acessos-teste                    # cria (ou reativa) os acessos
 *   npm run db:acessos-teste -- --senha=outra   # escolhe a senha
 *   npm run db:acessos-teste -- --remover       # apaga todos eles
 */
import bcrypt from 'bcryptjs';
import { getDb, migrate } from '../db/index.js';
import { config } from '../config.js';
import { MINIMO_SENHA } from '../services/acessos.js';
import { NIVEIS, permissoesDe } from '../lib/permissoes.js';

const args = process.argv.slice(2);
const remover = args.includes('--remover');
const forcar = args.includes('--forcar');
const senha = (args.find((a) => a.startsWith('--senha=')) ?? '').slice(8) || 'teste123';

if (config.isProd && !forcar) {
  console.error(
    `\nNODE_ENV=production: o script não cria conta de senha conhecida aqui.\n\n` +
      `Em produção, crie o acesso em Usuários e permissões → Novo acesso: a senha sai\n` +
      `provisória e a pessoa troca ao entrar. Se este banco é mesmo de teste, repita com\n` +
      `--forcar.\n`
  );
  process.exit(1);
}

if (!remover && senha.length < MINIMO_SENHA) {
  console.error(`\nA senha precisa de ao menos ${MINIMO_SENHA} caracteres.\n`);
  process.exit(1);
}

/**
 * Um acesso por nível, com o perfil que combina com a função.
 *
 * O e-mail carrega o domínio `teste.local`, que não existe: conta de teste não
 * pode se confundir com a de alguém de verdade numa lista de usuários.
 */
const ACESSOS = [
  ['Teste — acesso total',    'total',           'ADMIN'],
  ['Teste — gerência',        'gerencial',       'GESTOR'],
  ['Teste — PCP',             'pcp',             'PCP'],
  ['Teste — comercial',       'comercial',       'VENDEDOR'],
  ['Teste — almoxarifado',    'almoxarifado',    'ALMOXARIFE'],
  ['Teste — financeiro',      'financeiro',      'GESTOR'],
  ['Teste — chão de fábrica', 'chao_de_fabrica', 'OPERADOR'],
  ['Teste — somente consulta','consulta',        'OPERADOR'],
].map(([nome, nivel, perfil]) => ({
  nome,
  nivel,
  perfil,
  email: `${nivel.replace(/_/g, '-')}@teste.local`,
}));

const db = migrate(getDb());

if (remover) {
  const apagar = db.prepare(`DELETE FROM usuarios WHERE email = ?`);
  const n = db.transaction(() => ACESSOS.reduce((s, a) => s + apagar.run(a.email).changes, 0))();
  console.log(`\n${n} acessos de teste removidos de ${config.dbPath}.\n`);
  process.exit(0);
}

const hash = bcrypt.hashSync(senha, 10);

const inserir = db.prepare(
  `INSERT INTO usuarios (nome, email, senha_hash, perfil, nivel_acesso, senha_provisoria, ativo)
   VALUES (@nome, @email, @senha_hash, @perfil, @nivel, 0, 1)`
);
// Rodar de novo devolve a conta ao estado combinado: mesma senha, mesmo nível,
// sem ajuste fino de permissão sobrando de um teste anterior e sem troca exigida.
const atualizar = db.prepare(
  `UPDATE usuarios SET nome = @nome, senha_hash = @senha_hash, perfil = @perfil,
     nivel_acesso = @nivel, permissoes = NULL, senha_provisoria = 0, ativo = 1
   WHERE email = @email`
);

const resultado = db.transaction(() =>
  ACESSOS.map((acesso) => {
    const valores = { ...acesso, senha_hash: hash };
    const existia = db.prepare(`SELECT id FROM usuarios WHERE email = ?`).get(acesso.email);
    if (existia) atualizar.run(valores);
    else inserir.run(valores);
    const usuario = db.prepare(`SELECT * FROM usuarios WHERE email = ?`).get(acesso.email);
    const areas = permissoesDe(usuario);
    return {
      ...acesso,
      novo: !existia,
      liberadas: Object.values(areas).filter(Boolean).length,
      total: Object.keys(areas).length,
    };
  })
)();

const descricao = (nivel) => NIVEIS.find((n) => n.id === nivel)?.descricao ?? '';
const coluna = (texto, largura) => String(texto).padEnd(largura);

console.log(`\n=== Acessos de teste em ${config.dbPath} ===\n`);
console.log(`${coluna('E-MAIL', 29)}${coluna('SENHA', 12)}${coluna('NÍVEL', 17)}ÁREAS`);
for (const a of resultado) {
  console.log(
    `${coluna(a.email, 29)}${coluna(senha, 12)}${coluna(a.nivel, 17)}` +
      `${a.liberadas}/${a.total}${a.novo ? '' : '  (atualizado)'}`
  );
}
console.log('\nO que cada um enxerga:');
for (const a of resultado) console.log(`  • ${coluna(a.nivel, 17)}${descricao(a.nivel)}`);
console.log(
  `\nSuba o sistema com "npm run build && npm start" e entre em http://localhost:${config.port}.\n` +
    `Para apagar depois: npm run db:acessos-teste -- --remover\n`
);
