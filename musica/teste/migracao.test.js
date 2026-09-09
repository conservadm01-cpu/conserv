// Testes da migração do V1 para o V2. O que está sendo garantido aqui é uma
// coisa só, dita de várias maneiras: quem já usava o aplicativo não perde nada
// e continua entrando com a mesma senha.
import test from 'node:test';
import assert from 'node:assert/strict';

const deposito = await import('../js/dados/deposito.js');
const migracao = await import('../js/dados/migracao.js');
const { criarHash } = await import('../js/senha.js');

const DADOS_V1 = () => ({
  versao: 2,
  admin: { usuario: 'RENATO', sal: 'admin', senhaHash: criarHash('trocada', 'admin'), senhaPadrao: false },
  usuarios: [
    {
      id: 'u1', nome: 'Ana Lima', comum: 'Centro', instrumento: 'violino',
      encarregadoLocal: 'Irmão P', encarregadoRegional: 'Irmão A', anciao: 'Irmão B',
      email: 'ana@exemplo.com', whatsapp: '(11) 91234-5678',
      exigeSenha: true, sal: 'u1', senhaHash: criarHash('4321', 'u1'),
      criadoEm: '2026-01-01T00:00:00.000Z',
    },
    { id: 'u2', nome: 'José Lima', instrumento: 'trompete', exigeSenha: false, sal: 'u2', senhaHash: null },
  ],
  progressos: {
    u1: {
      fases: {
        1: {
          licoesLidas: [0, 1, 2], jogos: { 'Grave ou agudo?': 40 },
          tentativas: [
            { data: '2026-02-01T00:00:00.000Z', acertos: 6, total: 10, nota: 60, aprovado: false },
            { data: '2026-02-02T00:00:00.000Z', acertos: 9, total: 10, nota: 90, aprovado: true },
          ],
          aprovadoEm: '2026-02-02T00:00:00.000Z', melhorNota: 90,
        },
        inst1: { licoesLidas: [0], jogos: {}, tentativas: [], aprovadoEm: null, melhorNota: 0 },
      },
      usadas: { 1: ['a#1', 'a#2', 'a#3'] },
      certificados: [{ faseId: '1', trilha: 'msa', data: '2026-02-02T00:00:00.000Z', nota: 90, numero: 'MSA-1' }],
      xp: 430,
    },
  },
  config: { autocadastro: false },
  sessao: { tipo: 'aluno', id: 'u1' },
});

const comV1 = () => {
  const dep = deposito.criarDepositoEmMemoria();
  dep.gravarChave(deposito.CHAVE_V1, DADOS_V1());
  return dep;
};

test('a conversão preserva ficha, progresso, tentativas e certificados', () => {
  const estado = migracao.converterV1(DADOS_V1());

  assert.equal(estado.alunos.length, 2);
  const ana = estado.alunos.find((a) => a.nome === 'Ana Lima');
  assert.equal(ana.comum, 'Centro');
  assert.equal(ana.instrumentoId, 'violino', 'o instrumento digitado reencontra o cadastro');
  assert.equal(ana.email, 'ana@exemplo.com');

  const doAna = estado.progressos.filter((p) => p.alunoId === 'u1');
  assert.equal(doAna.length, 2, 'as duas fases com progresso viram duas linhas');
  const fase1 = doAna.find((p) => p.faseId === '1');
  assert.deepEqual(fase1.licoesLidas, [0, 1, 2]);
  assert.deepEqual(fase1.usadas, ['a#1', 'a#2', 'a#3'], 'o histórico de perguntas vem junto');
  assert.equal(fase1.melhorNota, 90);
  assert.equal(fase1.aprovadoEm, '2026-02-02T00:00:00.000Z');
  assert.equal(fase1.jogos['Grave ou agudo?'], 40);

  assert.equal(estado.resultados.filter((r) => r.alunoId === 'u1').length, 2, 'as duas tentativas viram resultados');
  assert.equal(estado.certificados.length, 1);
  assert.equal(estado.certificados[0].faseId, '1');
  assert.equal(estado.certificados[0].alunoId, 'u1');
});

test('o total de pontos não muda depois da migração', () => {
  const estado = migracao.converterV1(DADOS_V1());
  const ana = estado.alunos.find((a) => a.id === 'u1');
  const somaDasFases = estado.progressos.filter((p) => p.alunoId === 'u1').reduce((s, p) => s + p.xp, 0);
  assert.equal(ana.xpHistorico + somaDasFases, 430);
});

test('acesso e ficha ficam separados, e a senha trocada continua valendo', () => {
  const estado = migracao.converterV1(DADOS_V1());

  const admin = estado.usuarios.find((u) => u.papel === 'ADMIN');
  assert.equal(admin.login, 'RENATO');
  assert.equal(admin.senhaHash, criarHash('trocada', 'admin'), 'o resumo da senha atravessa a migração inteiro');
  assert.equal(admin.senhaPadrao, undefined, 'o campo senhaPadrao deixa de existir');
  assert.equal(admin.alunoId, null);

  const acessoDaAna = estado.usuarios.find((u) => u.alunoId === 'u1');
  assert.equal(acessoDaAna.papel, 'ALUNO');
  assert.equal(acessoDaAna.exigeSenha, true);
  assert.equal(acessoDaAna.senhaHash, criarHash('4321', 'u1'));
  // A ficha do aluno não guarda nada de senha.
  const ana = estado.alunos.find((a) => a.id === 'u1');
  assert.equal(ana.senhaHash, undefined);
  assert.equal(ana.exigeSenha, undefined);
});

test('quem estava dentro continua dentro, e as configurações vêm junto', () => {
  const estado = migracao.converterV1(DADOS_V1());
  assert.deepEqual(estado.sessao, { usuarioId: 'acesso-u1', papel: 'ALUNO', alunoId: 'u1' });
  assert.equal(estado.configuracoes.find((c) => c.chave === 'autocadastro').valor, false);
});

test('a migração roda uma vez só e não apaga os dados antigos', () => {
  const dep = comV1();
  const primeira = migracao.migrarDadosV1ParaV2(dep);
  assert.equal(primeira.migrado, true);
  assert.equal(primeira.estado.migracao.versao, migracao.VERSAO_DA_MIGRACAO);
  assert.equal(primeira.estado.migracao.origem, deposito.CHAVE_V1);

  const segunda = migracao.migrarDadosV1ParaV2(dep);
  assert.equal(segunda.migrado, false, 'abrir o app de novo não migra de novo');

  assert.ok(dep.lerChave(deposito.CHAVE_V1), 'a chave antiga continua no aparelho');
  assert.deepEqual(dep.lerChave(deposito.CHAVE_V1), DADOS_V1(), 'e continua intacta');
});

test('a cópia de segurança é feita antes de converter', () => {
  const dep = comV1();
  const { backup } = migracao.migrarDadosV1ParaV2(dep);
  assert.ok(backup, 'a migração cria uma cópia');
  assert.ok(backup.startsWith(deposito.PREFIXO_DE_BACKUP));

  const copia = dep.lerChave(backup);
  assert.equal(copia.motivo, 'migracao-v1-v2');
  assert.deepEqual(copia.chaves[deposito.CHAVE_V1], DADOS_V1(), 'a cópia guarda os dados como estavam');
});

test('o rollback devolve os dados ao estado anterior', () => {
  const dep = comV1();
  migracao.migrarDadosV1ParaV2(dep);
  assert.ok(dep.ler(), 'depois de migrar existe estado do V2');

  // Alguém estraga o estado novo.
  dep.gravar({ versao: 3, alunos: [], migracao: { versao: 2 } });
  assert.equal(dep.ler().alunos.length, 0);

  const resultado = migracao.rollback(dep);
  assert.equal(resultado.restaurado, true);
  assert.deepEqual(dep.lerChave(deposito.CHAVE_V1), DADOS_V1(), 'o V1 volta como estava');

  // E, relendo, o app migra de novo a partir dos dados restaurados.
  const denovo = migracao.migrarDadosV1ParaV2(dep);
  assert.equal(denovo.estado.alunos.length, 2);
});

test('rollback sem cópia de segurança avisa em vez de estragar', () => {
  const dep = deposito.criarDepositoEmMemoria();
  const resultado = migracao.rollback(dep);
  assert.equal(resultado.restaurado, false);
  assert.match(resultado.motivo, /Nenhuma cópia/);
});

test('cadastro antigo sem senha de instrutor não deixa o painel trancado', () => {
  const dep = deposito.criarDepositoEmMemoria();
  const antigo = DADOS_V1();
  antigo.admin.senhaHash = null;   // acesso do instrutor sem resumo de senha
  dep.gravarChave(deposito.CHAVE_V1, antigo);

  const { estado } = migracao.migrarDadosV1ParaV2(dep);
  const admin = estado.usuarios.find((u) => u.papel === 'ADMIN');
  assert.ok(admin.senhaHash, 'o acesso volta a ter senha');
  assert.equal(admin.senhaHash, criarHash('CCB123', admin.sal), 'a senha volta a ser a de fábrica');
  assert.equal(admin.exigeSenha, true);
});

test('instalação nova começa com o catálogo, sem nada para migrar', () => {
  const dep = deposito.criarDepositoEmMemoria();
  const { estado, migrado } = migracao.migrarDadosV1ParaV2(dep);
  assert.equal(migrado, false);
  assert.equal(estado.alunos.length, 0);
  assert.equal(estado.fases.length, 14, 'o catálogo de fases já vem semeado');
  assert.equal(estado.migracao.origem, null);
});

test('só depois de conferir é que os dados antigos são descartados, e de propósito', () => {
  const dep = comV1();
  migracao.migrarDadosV1ParaV2(dep);
  assert.ok(dep.lerChave(deposito.CHAVE_V1));

  migracao.descartarDadosAntigos(dep);
  assert.equal(dep.lerChave(deposito.CHAVE_V1), null);
  assert.ok(dep.ler().alunos.length === 2, 'os dados migrados seguem no lugar');
});

// ------------------------------------------- o app depois da atualização

test('o aluno antigo entra com a senha de sempre e vê o progresso dele', async () => {
  const dep = comV1();
  const R = await import('../js/dados/repositorios.js');
  deposito.definirDeposito(dep);
  R.recarregar();
  const banco = await import('../js/armazenamento.js');
  banco.recarregar();

  const ana = banco.usuarios().find((u) => u.nome === 'Ana Lima');
  assert.ok(ana, 'o aluno migrado aparece no cadastro');
  assert.equal(ana.exigeSenha, true);

  assert.equal(banco.entrarComoAluno(ana.id, 'errada'), false);
  assert.equal(banco.entrarComoAluno(ana.id, '4321'), true, 'a senha de antes continua valendo');

  assert.equal(banco.faseAprovada('1'), true);
  assert.deepEqual(banco.usadasDaFase('1'), ['a#1', 'a#2', 'a#3']);
  assert.equal(banco.faseDoAluno('1').melhorNota, 90);
  assert.equal(banco.faseDoAluno('1').tentativas.length, 2);
  assert.equal(banco.progresso().xp, 430);
  assert.equal(banco.certificados()[0].faseId, '1');
  assert.equal(banco.resumoDoAluno(ana.id).aprovadas, 1);
  assert.equal(banco.resumoDoAluno(ana.id).licoes, 4);

  // O instrutor continua entrando com a senha que já tinha trocado.
  assert.equal(banco.entrarComoAdmin('RENATO', 'CCB123'), false);
  assert.equal(banco.entrarComoAdmin('RENATO', 'trocada'), true);
  assert.equal(banco.senhaDoAdminEhPadrao(), false);
});

test('depois da atualização o app continua cadastrando e estudando normalmente', async () => {
  const R = await import('../js/dados/repositorios.js');
  deposito.definirDeposito(comV1());
  R.recarregar();
  const banco = await import('../js/armazenamento.js');
  banco.recarregar();

  const novo = banco.criarUsuario({
    nome: 'Carlos Dias', comum: 'Vila Nova', instrumento: 'trompete',
    email: 'carlos@exemplo.com', whatsapp: '(11) 90000-0000',
    exigeSenha: true, senha: 'senha9',
  });
  assert.equal(banco.entrarComoAluno(novo.id, 'senha9'), true);

  banco.marcarLicaoLida('1', 0);
  banco.registrarUsadas('1', ['n#1']);
  const fase = banco.registrarTentativa('1', {
    data: '2026-03-01T00:00:00.000Z', acertos: 8, total: 10, nota: 80, aprovado: true,
  });
  assert.equal(fase.aprovadoEm, '2026-03-01T00:00:00.000Z');
  assert.equal(fase.melhorNota, 80);
  assert.equal(banco.faseAprovada('1'), true);
  assert.equal(banco.progresso().xp, 5 + 80 + 50, 'lição, acertos e aprovação somam pontos');

  // E o progresso do aluno antigo continua onde estava.
  const ana = banco.usuarios().find((u) => u.nome === 'Ana Lima');
  assert.equal(banco.resumoDoAluno(ana.id).xp, 430);
  assert.equal(banco.resumoDoAluno(novo.id).xp, 135);
});
