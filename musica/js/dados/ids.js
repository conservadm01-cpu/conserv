// Identificadores. Curtos, únicos o bastante para um aparelho e legíveis no
// arquivo de exportação. O prefixo diz de que entidade é o registro.
const sufixo = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36).padStart(3, '0')}`;

export const novoId = (prefixo = 'u') => `${prefixo}${sufixo()}`;

export const idDoProgresso = (alunoId, faseId) => `${alunoId}#${faseId}`;
export const idDoCertificado = (alunoId, faseId) => `${alunoId}#${faseId}`;
export const idDoAcesso = (alunoId) => `acesso-${alunoId}`;
