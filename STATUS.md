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
- Estabilizar e fechar segurança/contratos da CNPJá; implementar estados de candidatos, melhorias de lista/nova busca e telas pendentes.
- Não aplicar alterações de banco automaticamente. Se uma alteração de esquema for indispensável, criar migration e registrar aqui exatamente o que precisa ser aplicado.
- Conferir visualmente o app em 375, 768 e 1440 px nas fases D, E e F. A busca real depende dos Secrets e do preview no Lovable.
