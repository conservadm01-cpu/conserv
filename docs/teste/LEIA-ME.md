# Versão teste da Fase 1

Página única, sem servidor, com a carteira real já migrada para o banco novo.

- `gerar.mjs` — exporta `data/nucleo.db` para o JSON colunar (`node docs/teste/gerar.mjs saida.json`)
- `molde.html` — moldura e CSS, com os marcadores `__DADOS__` e `__APP__`
- `app.js` — a aplicação

Para remontar depois de reimportar a planilha:

```sh
node docs/teste/gerar.mjs /tmp/dados.json
node -e "const f=require('fs');f.writeFileSync('/tmp/teste.html',
  f.readFileSync('docs/teste/molde.html','utf8')
   .replace('__DADOS__',()=>f.readFileSync('/tmp/dados.json','utf8'))
   .replace('__APP__',()=>f.readFileSync('docs/teste/app.js','utf8')))"
```

As contas da demonstração estão em `app.js`, na constante `CONTAS`. A senha é conferida no
navegador — é demonstração, não cofre. No sistema a senha vira hash bcrypt no servidor.
