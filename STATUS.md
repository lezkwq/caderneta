# STATUS — Caderneta

## Auditoria local (2026-11-21)
- `bun install --frozen-lockfile`: concluído com Bun 1.4.5 instalado localmente em `work/tools`.
- `bun run build`: passou; o Vite/TanStack gera o app Cloudflare. Há avisos de API `inputValidator` depreciada.
- `bun test`: passou, 23 testes em 3 arquivos.
- `git pull --ff-only`: sem alterações remotas antes da auditoria.

## Existe no código
- Login por e-mail e senha, recuperação de senha, onboarding, navegação e busca no Google Maps via Apify.
- Fila com reserva via RPC, processamento incremental, CNPJ por BrasilAPI e fallback cnpj.ws, telefones, score e resultados.
- CNPJá `/office`, `/credit` e `/zip`, cache permanente da consulta e limpeza/pontuação de candidatos estão implementados. O parser aceita a página de `OfficeDto` documentada (lista de registros) e a fixture cobre `taxId`, `address`, `phones`, `mainActivity`, `sideActivities` e `status`.
- Busca opcional por empresas sem site próprio já existe no servidor e na tela de nova busca.
- Leitura de até três páginas de site, com timeout e limite de 1 MB; endereços privados literais são bloqueados, mas ainda falta proteção por resolução DNS para evitar SSRF.
- `/manual` e `/historico` já têm interface e processamento; `/configuracoes` edita perfil/mensagem, CNAE por nicho e mostra o estado dos conectores sem revelar chaves.

## Problemas confirmados / pendências
- A confirmação exige nome compatível e telefone ou endereço correspondente; `/credit` falhando ou retornando saldo abaixo de 10 pausa novas pesquisas e evita consulta paga sem saldo conhecido.
- A tentativa de pesquisa por lead é reservada antes da chamada para evitar pesquisa paga duplicada. Erros de rede, resposta inválida e HTTP 429 encerram aquela tentativa sem repetição.
- A fixture segue o formato de resposta do contrato oficial; não foi possível validar a chamada ao vivo porque os Secrets do Lovable não estão disponíveis localmente.
- WhatsApp usa o melhor celular; o filtro “sem site / só rede social” e o rótulo “telefone da empresa” já estão na lista.
- As funções de inclusão manual de empresas, histórico, edição dos mapeamentos CNAE e status dos conectores estão disponíveis ao proprietário.
- O processamento da fila depende de uma chamada do navegador; para agendamento futuro será necessário configurar `pg_cron`/`pg_net` (ou cron externo) para chamar o endpoint protegido `processar-fila` periodicamente, com segredo mantido nos Secrets.

## Próximas fases
- Evoluir as melhorias da lista e da nova busca conforme validação no preview.
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

## Correção de candidatos e Fase E (2026-11-22)
- Causa do caso Mordent: matriz e filial eram tratadas como candidatos independentes; quando ambas batiam nome e sinal cadastral, a decisão mantinha “vários” sem desempatar pela raiz do CNPJ e pelo telefone/endereço.
- Candidatos repetidos pelo mesmo CNPJ são deduplicados; para matriz/filial da mesma raiz, o sinal único mais forte de telefone/endereço confirma a unidade. Empates e empresas de raízes diferentes continuam exigindo escolha.
- Ao abrir resultados, os casos antigos salvos como “vários” também são reavaliados uma vez com os sinais já registrados; se houver vencedor, entram na fila normal de validação sem nova consulta paga à CNPJá.
- O teste de resposta `OfficeDto` no formato da referência da CNPJá já existia e segue passando. Foi adicionado o caso matriz/filial com telefone e endereço em conflito.
- Detalhes mostram todos os sócios com qualificação; quando há mais de um, o campo do dono é rotulado como “Sócio-administrador”.
- Telefone principal fica separado do melhor celular: ligar usa o principal e WhatsApp usa o celular com melhor score. A confiança sem dono identificado diz “Alta/Média/Baixa · telefone da empresa”.
- `/new` oferece o filtro opcional de empresas sem site próprio e informa a coleta extra; Instagram, Facebook, Linktree e WhatsApp contam como sem site. A lista ganhou filtro “Sem site / só rede social”. O filtro do servidor continua aplicado antes de criar a fila CNPJá.
- Busca concluída, cancelada e com erro agora mostram mensagens finais próprias; “Etapa” continua alinhada junto do selo de status.
- Sem alteração de esquema, migration, RLS ou dependências. `bun run build`, `bun test` (33 testes) e `bun x tsc --noEmit` passaram.

## Rodadas sem site e nome provável no Maps (2026-11-22)
- Buscas “sem site próprio” começam com o limite pedido; quando a rodada esgota esse limite sem completar a meta, a próxima aumenta em uma quantidade pedida, até 5×. Cada rodada deduplica e aplica o filtro antes de criar leads ou tarefas CNPJá.
- Ao parar abaixo da meta, a tela mostra “Coletadas X, mantidas Y de Z pedidas.”; a informação acompanha as métricas locais da busca.
- Nomes iniciados por Dr., Dra. ou Dr(a). exibem “Nome no Maps: ...” em cinza quando ainda não há dono validado. O valor é derivado do nome do Maps, não é gravado como dono e é removido dos termos de busca e pontuação CNPJá.
- A tela acumula os resultados das rodadas pelo ID do run, sem contar uma resposta repetida duas vezes; ao parar abaixo da meta, mostra “Coletadas X, mantidas Y de Z pedidas.”
- `bun run build`, `bun x tsc --noEmit` e `bun test` (36 testes) passaram nesta revisão.

## Fase F — telas manual e configurações (2026-11-22)
- `/manual` permite adicionar empresas com cidade, CNPJ opcional, Maps, site, Instagram, Facebook e Pessoa. Links sociais são guardados como fontes, sem raspagem; links do Maps usam o processamento por URL que já existia.
- Empresas manuais são agrupadas pela Pessoa nos resultados. Telefones repetidos em empresas com Pessoa/sócios em comum aumentam a confiança e não entram na penalidade de provável contador.
- CNPJ digitado manualmente segue para BrasilAPI/cnpj.ws, sem tarefa de busca por nome no CNPJá. A fila global do CNPJá continua reservando no máximo 10 chamadas por minuto e respeitando saldo mínimo de 10.
- `/configuracoes` edita nome, ocupação e modelo de WhatsApp com `{empresa}`, permite editar os mapeamentos globais nicho→CNAE existentes e consulta Apify/CNPJá e saldo via servidor, sem exibir chaves.
- Nenhuma alteração de esquema, migration, RLS ou dependências. `bun run build`, `bun test` (39 testes) e `bun x tsc --noEmit` passaram.
- Verificação visual em 375/768/1440 px não realizada: Computer Use foi excluído e Playwright não está instalado; nenhuma dependência foi adicionada.

## Login e segurança (2026-11-22)
- `/login` oferece e-mail, senha, Entrar e Esqueci a senha. O cadastro por interface e OAuth foram removidos; `/cadastro` ficou como rota mínima que redireciona para `/login`. Mensagens de login não revelam se o e-mail existe.
- Logout abre confirmação acessível, com foco inicial em Cancelar, Escape para cancelar e botões com altura mínima de 44 px.
- O servidor confere por `auth.getUser(token)` que a sessão tem e-mail verificado e compara sem diferenciar maiúsculas/minúsculas com o secret `OWNER_EMAIL`. Secret ausente bloqueia acesso privilegiado; o app mostra aviso de configuração pendente e só permite sair. Buscas, fila interativa, CNPJ, ações de histórico, CNAE e status dos conectores exigem o proprietário. RLS continua responsável por isolar leituras.
- `processarAgora` valida o dono da busca, reserva tarefas somente daquela busca e devolve apenas importações dela. A função de fila automática permanece escopada pelo segredo de cron e processa globalmente sem responder dados da fila ao navegador.
- A tabela `nicho_cnae` mantém leitura autenticada; gravação/remoção ocorre somente pelos handlers protegidos do proprietário.
- A leitura de sites resolve A e AAAA e bloqueia destinos privados, locais ou reservados antes de cada requisição e redirecionamento. O runtime Cloudflare configurado dá suporte a `node:dns`; resolução não fixa o endereço no transporte, então há a limitação inerente de uma janela TOCTOU entre DNS e conexão.
- Foi criada a migration `drizzle/migrations/0003_owner_queue_scope.sql` para reservar atomicamente tarefas de uma busca específica do usuário no worker interativo. Ela precisa ser aplicada no Lovable Cloud antes de `processarAgora` por busca funcionar; não foi aplicada automaticamente. Não houve mudança em tabelas, colunas ou políticas RLS.
- O cadastro público não pode ser desativado com segurança apenas pela interface; desative novos cadastros nas configurações de autenticação do Lovable Cloud, se houver essa opção.
- A busca no repositório encontrou a página antiga de cadastro com `signUp`, botão Google/OAuth, link de criação de conta e documentação de autenticação desatualizada. A página e o componente Google foram removidos, e a rota antiga agora redireciona; referências de “cadastro” que restam descrevem cadastro fiscal/manual, não criação de conta.
- Testes de autorização (dono, usuário diferente, secret ausente, e-mail sem distinção de caixa e propriedade da busca) e bloqueio de IP/URL foram adicionados. `vitest run` (67 testes), `tsc --noEmit` e build de produção passaram.
