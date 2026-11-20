# STATUS — Caderneta

## Pronto
- Chaves: APIFY_TOKEN (Cloud → Secrets, testada), login Google gerenciado, cnpj.ws sem chave.
- Login/cadastro/esqueci/redefinir senha; /login em 2 colunas no desktop.
- Banco: perfis, buscas, leads, telefones, fila de tarefas, cache de CNPJ, configuração (actor do Apify editável).
- Regras testadas (src/test/regras.test.ts): CNPJ, telefone, MEI, WhatsApp, score.
- Processamento no servidor escrito (src/lib/caderneta.server.ts): Apify, site, CNPJ (BrasilAPI → cnpj.ws), dono, score.

## Falta (créditos acabaram)
- Primeiro acesso + barra lateral / barra inferior.
- Telas /new, resultados, /manual, /historico, /configuracoes.
- Funções do servidor que ligam as telas ao processamento + agendamento.
- Nada do processamento foi testado de ponta a ponta.
