// Guarda de senha do app. Importante saber o que isto é e o que não é:
// o app roda inteiro no aparelho, sem servidor, então esta é uma PORTARIA —
// separa o progresso de cada aluno e protege o painel do instrutor do uso
// casual. Não é segurança contra quem sabe abrir o código da página.
// Por isso a senha nunca é guardada em texto: fica só o resumo SHA-256 dela
// com um sal por usuário.

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const gira = (x, n) => (x >>> n) | (x << (32 - n));

// SHA-256 em JavaScript puro: funciona igual no https, no localhost e no
// arquivo aberto direto do celular (onde o crypto.subtle não existe).
export function sha256(texto) {
  const bytes = new TextEncoder().encode(texto);
  const tamanho = bytes.length;
  const comPadding = new Uint8Array((((tamanho + 8) >> 6) + 1) * 64);
  comPadding.set(bytes);
  comPadding[tamanho] = 0x80;
  new DataView(comPadding.buffer).setUint32(comPadding.length - 4, tamanho * 8, false);

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);
  const visao = new DataView(comPadding.buffer);

  for (let bloco = 0; bloco < comPadding.length; bloco += 64) {
    for (let i = 0; i < 16; i++) w[i] = visao.getUint32(bloco + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = gira(w[i - 15], 7) ^ gira(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = gira(w[i - 2], 17) ^ gira(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = gira(e, 6) ^ gira(e, 11) ^ gira(e, 25);
      const escolha = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + escolha + K[i] + w[i]) | 0;
      const S0 = gira(a, 2) ^ gira(a, 13) ^ gira(a, 22);
      const maioria = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maioria) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((valor, i) => { h[i] = (h[i] + valor) | 0; });
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

export const criarHash = (senha, sal) => sha256(`msa|${sal}|${String(senha)}`);

export const conferirSenha = (senha, sal, hash) => Boolean(hash) && criarHash(senha, sal) === hash;

// Regra mínima: nada de senha em branco, e pelo menos 4 caracteres.
export function validarSenha(senha) {
  const limpa = String(senha || '').trim();
  if (limpa.length < 4) return 'A senha precisa ter pelo menos 4 caracteres.';
  return null;
}
