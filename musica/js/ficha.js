// A ficha do aluno: o que ele informa no primeiro acesso e o que o instrutor
// precisa ter à mão — comum-congregação, instrumento, encarregados, ancião e
// contato. Os dados ficam só no aparelho; servem para organizar a turma.

export const CAMPOS_DA_FICHA = [
  { id: 'nome', rotulo: 'Nome completo', artigo: 'o', tipo: 'text', obrigatorio: true, autocomplete: 'name',
    dica: 'como deve sair no certificado', maximo: 80 },
  { id: 'comum', rotulo: 'Comum-congregação', artigo: 'a', tipo: 'text', obrigatorio: true,
    dica: 'a comum onde você toca — bairro e cidade', maximo: 80 },
  { id: 'instrumento', rotulo: 'Instrumento', artigo: 'o', tipo: 'instrumento', obrigatorio: true,
    dica: 'define a trilha do método do instrumento' },
  { id: 'encarregadoLocal', rotulo: 'Encarregado local', artigo: 'o', tipo: 'text', obrigatorio: true, grupo: 'ministerio', maximo: 80 },
  { id: 'encarregadoRegional', rotulo: 'Encarregado regional', artigo: 'o', tipo: 'text', obrigatorio: true, grupo: 'ministerio', maximo: 80 },
  { id: 'anciao', rotulo: 'Ancião da localidade', artigo: 'o', tipo: 'text', obrigatorio: true, grupo: 'ministerio', maximo: 80 },
  { id: 'email', rotulo: 'E-mail', artigo: 'o', tipo: 'email', obrigatorio: true, autocomplete: 'email', maximo: 120 },
  { id: 'whatsapp', rotulo: 'WhatsApp', artigo: 'o', tipo: 'tel', obrigatorio: true, autocomplete: 'tel',
    dica: 'com DDD', maximo: 20 },
];

export const CAMPOS_DO_MINISTERIO = CAMPOS_DA_FICHA.filter((c) => c.grupo === 'ministerio').map((c) => c.id);

// Sem estes, o app não libera o estudo; os nomes do ministério podem ficar
// para depois, mas continuam cobrados na tela do aluno e no painel.
export const CAMPOS_ESSENCIAIS = CAMPOS_DA_FICHA.filter((c) => c.grupo !== 'ministerio').map((c) => c.id);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Guarda só os dígitos e mostra no formato (11) 91234-5678.
export function apenasDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

export function formatarWhatsapp(valor) {
  const d = apenasDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function validarFicha(dados, { ministerioPendente = false } = {}) {
  const erros = {};
  for (const campo of CAMPOS_DA_FICHA) {
    const valor = String(dados[campo.id] || '').trim();
    if (ministerioPendente && campo.grupo === 'ministerio') continue;
    if (campo.obrigatorio && !valor) {
      erros[campo.id] = `Informe ${campo.artigo} ${campo.rotulo.toLowerCase()}.`;
      continue;
    }
    if (campo.id === 'email' && valor && !EMAIL.test(valor)) erros.email = 'E-mail inválido.';
    if (campo.id === 'whatsapp' && valor) {
      const digitos = apenasDigitos(valor);
      if (digitos.length < 10 || digitos.length > 11) erros.whatsapp = 'Informe o WhatsApp com DDD, só números.';
    }
    if (campo.id === 'nome' && valor && !valor.includes(' ')) erros.nome = 'Informe o nome completo.';
  }
  return erros;
}

export const primeiroErro = (erros) => Object.values(erros)[0] || null;

// A ficha está completa quando todos os campos obrigatórios estão preenchidos.
export function camposFaltando(usuario) {
  if (!usuario) return CAMPOS_DA_FICHA.map((c) => c.id);
  return CAMPOS_DA_FICHA.filter((c) => c.obrigatorio && !String(usuario[c.id] || '').trim()).map((c) => c.id);
}

export const fichaCompleta = (usuario) => camposFaltando(usuario).length === 0;

export const fichaMinimaCompleta = (usuario) =>
  camposFaltando(usuario).every((campo) => !CAMPOS_ESSENCIAIS.includes(campo));

// Linha da ficha para a lista do instrutor e para a exportação em planilha.
export function linhaDaFicha(usuario, instrumentoNome) {
  return {
    nome: usuario.nome || '',
    comum: usuario.comum || '',
    instrumento: instrumentoNome || usuario.instrumento || '',
    encarregadoLocal: usuario.encarregadoLocal || '',
    encarregadoRegional: usuario.encarregadoRegional || '',
    anciao: usuario.anciao || '',
    email: usuario.email || '',
    whatsapp: usuario.whatsapp || '',
  };
}
