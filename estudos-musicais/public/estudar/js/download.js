// Entrega de arquivo ao aluno (certificado em PNG, cópia do progresso).
// Quando o app está rodando dentro de uma casca que controla os downloads,
// pede por ela; fora disso, usa o link de download do próprio navegador.

async function viaPlataforma(nomeArquivo, dados) {
  const casca = window.claude;
  if (!casca || typeof casca.use !== 'function') return false;
  const downloads = await casca.use('downloads');
  if (!downloads) return false;
  await downloads.save({ filename: nomeArquivo, data: dados });
  return true;
}

function viaNavegador(nomeArquivo, dados) {
  const url = URL.createObjectURL(dados);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function salvarArquivo(nomeArquivo, dados) {
  try {
    if (await viaPlataforma(nomeArquivo, dados)) return 'salvo';
  } catch (erro) {
    // O aluno recusou a gravação, ou a casca não deixou: não há o que fazer.
    if (erro && erro.code === 'declined') return 'recusado';
  }
  viaNavegador(nomeArquivo, dados);
  return 'salvo';
}
