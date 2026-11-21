# STATUS — Caderneta

## Pronto (não testado de ponta a ponta no navegador)
- Chaves: APIFY_TOKEN (Cloud → Secrets, testada), login Google gerenciado, cnpj.ws sem chave.
- Login/cadastro/esqueci/redefinir senha; /login em 2 colunas no desktop, 1 no celular.
- Primeiro acesso (nome + trabalho, uma vez) e navegação: barra lateral 240px (desktop) / barra inferior (celular).
- /new: 5 campos, estimativa de tempo, limite diário, inicia busca no Apify.
- Fila no servidor (src/lib/caderneta.server.ts): acompanha run do Apify, lê sites (seguro), CNPJ via BrasilAPI → cnpj.ws com intervalo, bloqueio em 429 e cache; dono (MEI sem CPF / sócio-administrador); telefones e score.
- Resultados (/busca/:id): tabela no desktop, cartões no celular, filtros, CSV, já contatei, excluir, CNPJ manual, WhatsApp só p/ celular.
- Testes de regras: src/test/regras.test.ts (CNPJ, telefone, MEI, WhatsApp, score).

## Falta
- Telas /manual, /historico, /configuracoes (hoje mostram "em construção"; o processamento manual já existe no servidor).
- Agendamento automático (hoje a fila anda com a página de resultados aberta).
- Conferência visual em 375/768/1440px.

## Em andamento
- Busca de CNPJ por nome via CNPJá, escolha de candidato, melhor celular, filtro "sem site".
