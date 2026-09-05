// Certificado de conclusão de fase: desenhado em SVG (sem fonte externa nem
// biblioteca), com código de verificação, para imprimir, salvar em PDF pela
// impressora do celular ou baixar como imagem.

import { hash } from './aleatorio.js';
import { FASES } from './conteudo/fases.js';

const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function dataPorExtenso(iso) {
  const d = new Date(iso);
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export function montarCertificado({ nome, fase, nota, acertos, total, data = new Date().toISOString() }) {
  const info = FASES.find((f) => f.numero === fase);
  const codigo = `MSA-${String(fase).padStart(2, '0')}-${hash(`${nome}|${fase}|${data.slice(0, 10)}`)}`;
  return { nome, fase, titulo: info.titulo, subtitulo: info.subtitulo, paginas: info.paginas, cor: info.cor, nota, acertos, total, data, codigo };
}

export function svgDoCertificado(c) {
  const largura = 1123;
  const altura = 794;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" width="100%" class="certificado-svg" role="img"
    aria-label="Certificado da fase ${c.fase}">
    <rect width="${largura}" height="${altura}" fill="#ffffff"/>
    <rect x="18" y="18" width="${largura - 36}" height="${altura - 36}" fill="none" stroke="${c.cor}" stroke-width="6"/>
    <rect x="34" y="34" width="${largura - 68}" height="${altura - 68}" fill="none" stroke="${c.cor}" stroke-width="1.5" opacity="0.6"/>
    <g fill="${c.cor}" opacity="0.10">
      <circle cx="118" cy="118" r="54"/><circle cx="${largura - 118}" cy="${altura - 118}" r="54"/>
    </g>
    <text x="${largura / 2}" y="126" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="26" letter-spacing="6" fill="#555">CERTIFICADO DE CONCLUSÃO</text>
    <text x="${largura / 2}" y="196" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="52" font-weight="bold" fill="${c.cor}">Fase ${c.fase} — ${escapar(c.titulo)}</text>
    <text x="${largura / 2}" y="234" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#666">${escapar(c.subtitulo)}</text>
    <line x1="140" y1="266" x2="${largura - 140}" y2="266" stroke="${c.cor}" stroke-width="1.5" opacity="0.5"/>
    <text x="${largura / 2}" y="322" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#333">Certificamos que</text>
    <text x="${largura / 2}" y="394" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="46" font-weight="bold" fill="#1a1a1a">${escapar(c.nome)}</text>
    <line x1="240" y1="414" x2="${largura - 240}" y2="414" stroke="#999" stroke-width="1"/>
    <text x="${largura / 2}" y="470" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="21" fill="#333">concluiu a Fase ${c.fase} do estudo do</text>
    <text x="${largura / 2}" y="504" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="21" font-weight="bold" fill="#333">Método Simplificado de Aprendizagem Musical</text>
    <text x="${largura / 2}" y="540" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="19" fill="#555">assunto das páginas ${escapar(c.paginas)}, com aproveitamento de ${c.nota}% (${c.acertos} de ${c.total} questões).</text>
    <text x="${largura / 2}" y="612" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="19" fill="#555">${dataPorExtenso(c.data)}</text>
    <line x1="${largura / 2 - 190}" y1="686" x2="${largura / 2 + 190}" y2="686" stroke="#666" stroke-width="1.2"/>
    <text x="${largura / 2}" y="712" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#666">Estudo dirigido — aplicativo MSA</text>
    <text x="66" y="${altura - 52}" font-family="'Courier New', monospace" font-size="15" fill="#777">Código: ${c.codigo}</text>
    <text x="${largura - 66}" y="${altura - 52}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#999">Documento de estudo pessoal, sem validade eclesiástica ou escolar.</text>
  </svg>`;
}

// Impressão: joga o certificado numa área que só existe no papel e chama a
// impressora do aparelho (no celular, dá para salvar em PDF por ali mesmo).
export function imprimirCertificado(c) {
  const area = document.getElementById('area-impressao');
  area.innerHTML = svgDoCertificado(c);
  window.print();
}

export function baixarCertificado(c) {
  const svg = svgDoCertificado(c);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const imagem = new Image();
  imagem.onload = () => {
    const tela = document.createElement('canvas');
    tela.width = 2246;
    tela.height = 1588;
    const pincel = tela.getContext('2d');
    pincel.fillStyle = '#ffffff';
    pincel.fillRect(0, 0, tela.width, tela.height);
    pincel.drawImage(imagem, 0, 0, tela.width, tela.height);
    URL.revokeObjectURL(url);
    tela.toBlob((png) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(png);
      link.download = `certificado-fase-${c.fase}-${c.nome.replace(/\s+/g, '-').toLowerCase()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    }, 'image/png');
  };
  imagem.onerror = () => {
    URL.revokeObjectURL(url);
    imprimirCertificado(c);
  };
  imagem.src = url;
}
