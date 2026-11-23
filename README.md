# caderneta

Você vai construir a CADERNETA, uma ferramenta web (PC e celular) para um profissional que vende sites e precisa achar o contato direto do dono de empresas locais. A Caderneta NÃO cria sites. Interface toda em português do Brasil.

══ SEGREDOS ══
`APIFY_TOKEN`, `CNPJA_API_KEY` e `OWNER_EMAIL` são configurados somente nos Secrets do Lovable Cloud e usados apenas pelo servidor. Nunca coloque secrets no front-end, código, `.env` versionado, logs ou respostas de API. `OWNER_EMAIL` deve conter o e-mail verificado da conta proprietária. Novos cadastros devem ser desativados nas configurações de autenticação do Lovable Cloud, se essa opção estiver disponível.

══ DESIGN: como usar o arquivo anexo ══
O .md anexo (Design_System_ZIXO_Auditoria.md) é referência visual de OUTRO produto (um banco). Extraia somente: estrutura de navegação lateral com item ativo escuro, cards claros com sombra suave, botões e badges em formato pílula, ícones outline monocromáticos, barra inferior no celular, cartões de métrica. IGNORE: o nome ZIXO, todo o texto e números de exemplo, renders 3D, fotos, cartões bancários, personas, a fonte Roobert, a fonte serifada e a grade desktop com margem de 120px.

Tokens (os 4 primeiros hex são exatos do arquivo; os demais são estimados ou derivados por mim para contraste):
- Texto: #414140 | Títulos e botão primário: #111111 | Fundo: #F4F4F4 | Card: #FFFFFF | Campos e painéis: #E7E8EA
- Link e anel de foco: #1765F5
- Sucesso #38BC37 e erro #F44336 e atenção #F36B3F: só para ícones, bordas, barras e fundos tingidos. Para TEXTO use #1E7B1E (sucesso), #C62828 (erro), #A3441F (atenção). Nunca comunique estado só por cor: sempre ícone + texto.
- Fonte: DM Sans (Google Fonts), pesos 400, 500 e 600, com fallback system-ui. Escala: 48px só no título do /login em desktop; 24px título de página (20px no celular); 16px corpo; 14px secundário.
- Raios: botões e badges em pílula; cards 16px; campos 12px. Sombra: 0 1px 2px rgba(17,17,17,.06), 0 4px 12px rgba(17,17,17,.06).
- Alvos de toque de no mínimo 44px de altura. Celular: base 375px, 6 colunas, margens e gutters 16px. Desktop: barra lateral fixa de 240px + conteúdo fluido (máx. 1280px), gutters 24px.
- Estados obrigatórios em todos os componentes: hover, foco (anel 2px azul), desabilitado, carregando (skeleton ou spinner) e erro (borda + mensagem em texto).
- Ícones: biblioteca outline (Lucide).

══ AUTENTICAÇÃO ══
Login somente com e-mail e senha. Telas: /login (apresentação curta da Caderneta: "acha o telefone certo do dono de empresas locais"), esqueci a senha e redefinir senha. A rota antiga /cadastro redireciona para /login. Toda rota do app exige sessão; recursos privilegiados também validam no servidor o proprietário em OWNER_EMAIL.

══ TELAS ══
Primeiro acesso: pergunte "Qual seu nome?" e "Com o que você trabalha?", salve no perfil e nunca pergunte de novo (editável em Configurações).

/new — Nova busca. Cinco campos: Cidade, Estado (padrão SC), País (padrão Brasil), Nicho e Quantidade de empresas (padrão 20, máximo 100). Estado e país são editáveis. Mostre o tempo estimado antes de iniciar (a consulta de CNPJ é limitada, veja abaixo).

/manual — Empresas que eu já conheço. Eu informo uma lista de empresas e, para cada uma: nome, cidade (opcional), CNPJ (opcional), links (Google Maps, site, Instagram ou outros) e um campo opcional "Pessoa" para agrupar empresas do mesmo dono. O processamento é o mesmo da busca, mas pula a busca no Maps e usa os links dados. Link de Instagram/Facebook: apenas guardar como fonte, não raspar. Resultados agrupados por Pessoa.

/historico — buscas anteriores, reabrir resultados. /configuracoes — perfil, mensagem padrão de WhatsApp (modelo com o nome da empresa), status dos conectores ("Apify: conectado / não conectado", sem exibir chave) e botão para trocar chave.

Resultados: cards no celular e tabela no desktop. Cada lead mostra: empresa, dono, telefone principal com badge de confiança (Alta/Média/Baixa, com ícone e texto), botão WhatsApp, botão Ligar, status do processamento. Ao expandir: os outros telefones (cada um com score e links das fontes), dados do CNPJ e checkbox "Já contatei". Filtros: com dono, com celular, contatados. Exportar CSV. Excluir lead.

══ PROCESSAMENTO (tudo em edge functions) ══
1. Busca: chame no Apify um actor de Google Maps (padrão compass/crawler-google-places), limitando ao número pedido, idioma pt-BR. O ID do actor fica em uma tabela de configuração para eu trocar sem mexer no código. Rode de forma assíncrona e acompanhe o status. Defina teto de gasto por execução (maxTotalChargeUsd) se a API permitir. Limite de buscas por usuário por dia.
2. Descobrir o CNPJ de cada empresa (o Maps não fornece): (a) buscar no site da empresa (home, /contato, rodapé) com regex e validar os dígitos verificadores; (b) opcional, DESLIGADO por padrão: busca "nome + cidade + CNPJ" via actor de busca do Apify; (c) se nada, status "CNPJ não encontrado" com campo para eu digitar o CNPJ manualmente.
3. Validar: consultar https://publica.cnpj.ws/cnpj/{cnpj} e comparar município, UF e logradouro com os dados do Maps. Divergiu: marcar "CNPJ divergente" em vez de aceitar.
4. Limite do cnpj.ws: 3 consultas por minuto por IP; excesso de erros 429 gera bloqueio de 1 hora. Use uma fila no banco com um worker, uma consulta por vez com intervalo, backoff ao receber 429 (respeitando o tempo informado, sem repetir em loop) e cache permanente por CNPJ (nunca consultar o mesmo duas vezes). A tela mostra progresso em tempo real.
5. Dono: se for MEI/empresário individual, o responsável é o nome da razão social. Caso contrário, o sócio-administrador do quadro societário, listando os demais sócios. Se não houver, mostrar "Dono: não disponível". Nunca invente nome.
6. Telefones: coletar do Maps, do site (links tel: e wa.me, texto) e do cnpj.ws; normalizar para +55 com DDD, deduplicar, classificar celular (9 dígitos após o DDD) ou fixo; guardar cada fonte com link.
7. Score de confiança (0–100), sempre explicável na tela: + número em 2 ou mais fontes independentes; + celular; + aparece como link wa.me no site; + aparece junto ao nome do dono. O telefone do cadastro da Receita só pontua bem se bater com outra fonte. − penalidade se o mesmo número aparece em 3 ou mais CNPJs de empresas SEM sócio em comum no meu banco (provável contador); se as empresas compartilham sócio (mesma Pessoa), isso é positivo. O telefone de maior score é o principal; os demais aparecem abaixo.
8. WhatsApp: rotule sempre "WhatsApp provável" (não dá para confirmar). O botão abre https://wa.me/55DDDNUMERO?text=... com minha mensagem padrão, editável antes de enviar. O app NUNCA envia mensagens sozinho nem em massa.

══ SEGURANÇA E DADOS ══
Row Level Security em todas as tabelas: cada usuário vê somente os próprios dados. Valide todas as entradas no backend. Não registre segredos nem dados pessoais em logs. Guarde o link da fonte de cada dado coletado.

══ ORDEM DE CONSTRUÇÃO ══
Etapa 0 (chaves) → autenticação + perfil → /new + busca Apify → fila de CNPJ → telefones, score e lista de resultados → /manual → histórico e configurações. Ao fim de cada etapa, diga o que devo testar. Ao final, repita a lista de chaves e onde estão, e confirme que nenhuma aparece no front-end ou no código.

══ ADENDO: CORREÇÕES DE ROBUSTEZ ══

- Limites de tempo: edge functions têm teto de 150 s (grátis) e 2 s de CPU por requisição. Nenhuma função pode esperar o Apify terminar nem processar a fila inteira. Cada chamada processa poucos itens e retorna. O run do Apify é iniciado numa chamada e consultado em outra (webhook ou polling). A função "processar-fila" é idempotente: reserva cada item (status "em_processamento" com horário) antes de processar, para duas chamadas simultâneas nunca pegarem o mesmo. Ela é chamada por agendamento (pg_cron) E pelo front-end a cada ~20 s enquanto a página estiver aberta.

- Fonte do CNPJ: use primeiro https://brasilapi.com.br/api/cnpj/v1/{cnpj}; se der 429 ou falha, use https://publica.cnpj.ws/cnpj/{cnpj} (3 consultas/min por IP). 429 NÃO é erro: o item volta para a fila com nova tentativa depois, sem loop. Antes de construir o resto, teste um CNPJ real e mapeie os campos reais da resposta (razão social, situação, endereço, sócios, telefone, e-mail).

- Lead sem CNPJ continua na lista com telefone do Maps/site e botão de WhatsApp. Só mostra "Dono: não disponível" e o campo para digitar o CNPJ. "CNPJ não encontrado" é um estado normal, não erro.

- MEI: a razão social vem com o CPF no final (nome + 11 dígitos). Remova a sequência numérica antes de exibir como dono e nunca guarde nem mostre o CPF.

- Busca em sites (backend): só http/https, bloquear localhost e IPs privados/reservados, timeout de 8 s, máximo de 1 MB por página, no máximo 3 páginas por site. Falha de site = ignorar em silêncio e seguir.

- Botão WhatsApp só para celular. Telefone fixo ou número de 8 dígitos sem o 9 recebe apenas "Ligar".

- Maps: descartar empresas "permanentemente fechadas" e duplicadas (mesmo placeId ou mesmo telefone + endereço).

- Se o e-mail de confirmação falhar por limite de envio, me avise e proponha configurar SMTP próprio.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/54f9c05a-b9fd-47fb-a9fb-3d7927fb62f2).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
