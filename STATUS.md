# STATUS — Caderneta

## Auditoria local (2026-11-21)
- `bun install --frozen-lockfile`: concluído com Bun 1.4.5 instalado localmente em `work/tools`.
- `bun run build`: passou; o Vite/TanStack gera o app Cloudflare. Há avisos de API `inputValidator` depreciada.
- `bun test`: passou, 23 testes em 3 arquivos.
- `git pull --ff-only`: sem alterações remotas antes da auditoria.

## Existe no código
- Login, cadastro, recuperação de senha, onboarding, navegação e busca no Google Maps via Apify.
- Fila com reserva via RPC, processamento incremental, CNPJ por BrasilAPI e fallback cnpj.ws, telefones, score e resultados.
- CNPJá `/office`, `/credit` e `/zip`, cache permanente da consulta e limpeza/pontuação de candidatos estão implementados. O parser aceita a página de `OfficeDto` documentada (lista de registros) e a fixture cobre `taxId`, `address`, `phones`, `mainActivity`, `sideActivities` e `status`.
- Busca opcional por empresas sem site próprio já existe no servidor, mas falta o controle na tela de nova busca.
- Leitura de até três páginas de site, com timeout e limite de 1 MB; endereços privados literais são bloqueados, mas ainda falta proteção por resolução DNS para evitar SSRF.
- Suporte de campos para `manual`, `historico` e `configuracoes` existe no banco/servidor, mas as três telas ainda são placeholders.

## Problemas confirmados / pendências
- A confirmação exige nome compatível e telefone ou endereço correspondente; `/credit` falhando ou retornando saldo abaixo de 10 pausa novas pesquisas e evita consulta paga sem saldo conhecido.
- A tentativa de pesquisa por lead é reservada antes da chamada para evitar pesquisa paga duplicada. Erros de rede, resposta inválida e HTTP 429 encerram aquela tentativa sem repetição.
- A fixture segue o formato de resposta do contrato oficial; não foi possível validar a chamada ao vivo porque os Secrets do Lovable não estão disponíveis localmente.
- WhatsApp considera apenas o telefone principal, não o melhor celular; falta o filtro “sem site / só rede social” e o rótulo “telefone da empresa” antes da identificação do dono.
- /manual precisa formulário e submissão da lista; /historico precisa listar e reabrir buscas; /configuracoes precisa editar perfil e mensagem e exibir status dos conectores sem segredos.
- O processamento da fila depende de uma chamada do navegador; para agendamento futuro será necessário configurar `pg_cron`/`pg_net` (ou cron externo) para chamar o endpoint protegido `processar-fila` periodicamente, com segredo mantido nos Secrets.

## Próximas fases
- Implementar melhorias da lista/nova busca e concluir as telas pendentes.
- Não aplicar alterações de banco automaticamente. Se uma alteração de esquema for indispensável, criar migration e registrar aqui exatamente o que precisa ser aplicado.
- Nas fases E e F, conferir visualmente o app em 375, 768 e 1440 px. A busca real depende dos Secrets e do preview no Lovable.

## Fase D — estados e escolha de CNPJ (2026-11-21)
- Lista e detalhes exibem os estados de CNPJ; candidatos prováveis e múltiplos mostram comparação do endereço e telefone do Maps/site com os dados cadastrais e ação “É este”.
- A escolha valida no servidor que o lead pertence ao usuário e que o CNPJ consta entre os candidatos salvos; depois segue a fila normal de validação e identificação de sócios/dono.
- Campo para informar CNPJ manualmente disponível quando ainda não há CNPJ validado ou em processamento.
- `bun run build`: passou. `bun test`: 26 testes passaram.
- Playwright não está instalado no projeto; por solicitação, nenhuma dependência foi adicionada e não foram geradas capturas. Verificação visual em 375/768/1440 px foi pulada conforme orientação do usuário.
- Nenhuma alteração de banco/migration nesta fase. Busca real continua dependendo do preview do Lovable e dos Secrets configurados lá.

## Correção de duplicatas e processamento (2026-11-21)
- Causa observada: cada execução podia importar até 20 resultados enquanto a busca permanecia em `buscando`; chamadas concorrentes liam a mesma execução concluída e inseriam o mesmo conjunto outra vez.
- Além disso, a deduplicação local só comparava placeId e endereço+telefone, deixando passar repetições sem placeId e com telefone igual em endereços escritos de modos diferentes.
- A importação agora reserva a busca com transição atômica de status, deduplica por placeId ou nome normalizado+telefone e reaproveita resultados CNPJá já consultados para o mesmo placeId.
- Limita a coleta ao pedido quando não há filtro; com “sem site” coleta no máximo 3× a quantidade pedida, deduplica, filtra e limita antes de criar tarefas pagas. A tela exibe coletadas/únicas/mantidas.
- Adiciona pausa/retomada, status por lead e estimativa de tempo; tarefas de buscas pausadas ficam na fila e podem ser retomadas sem apagar registros.
- Todas as requisições CNPJá (`/credit`, `/zip` e `/office`) usam reserva atômica global com intervalo de 6,1 s (máximo de 10 por minuto). Saldo abaixo de 10 bloqueia e avisa; respostas 429 voltam à fila com espera, no máximo três tentativas.
- Sem mudança de esquema, migration ou RLS. `bun run build`, `bun test` (28 testes) e `bun x tsc --noEmit` passaram; busca real não foi executada localmente porque depende dos Secrets do Lovable.

## Histórico e controle da fila (2026-11-22)
- Histórico lista buscas próprias, data, status, quantidade de empresas e tarefas de fila; consumo de créditos CNPJá aparece como “sem registro”, pois o sistema não grava o uso por busca.
- Ações de pausar/retomar, cancelar fila e excluir busca usam autenticação e verificam a propriedade da busca. Cancelar preserva resultados; excluir para o worker, remove tarefas antes dos leads e deixa a exclusão em cascata como proteção adicional.
- O worker cancela tarefas órfãs e de buscas canceladas antes de processá-las; a previsão exclui tarefas órfãs, canceladas e pausadas.
- A tela de resultados separa itens CNPJá desta busca e de outras buscas do usuário, com link para o histórico. A estimativa usa a fila CNPJá global e até três chamadas de API por tarefa no limite de 10 por minuto.
- Sem alteração de esquema, migration ou RLS. `bun run build`, `bun test` (31 testes) e `bun x tsc --noEmit` passaram.
