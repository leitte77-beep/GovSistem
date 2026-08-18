# Fila pessoal por atendente

## Origem e jornadas

Não houve arquivo de plano. As jornadas foram confirmadas pelo usuário:

- Com menos de cinco atendimentos ativos, o cidadão que pede uma pessoa específica é atribuído diretamente.
- Com cinco atendimentos ativos, o próximo cidadão entra na fila pessoal na posição 6.
- A posição só é enviada ao entrar ou quando diminui; pedidos apenas por setor não recebem posição.
- Ao encerrar um atendimento, a primeira pessoa da fila é atribuída automaticamente.
- O atendente recebe no canto da tela a quantidade de pessoas aguardando.

## Evidência RED/GREEN

- RED inicial: `node --test test/fila-atendente.test.js` falhou com `ERR_MODULE_NOT_FOUND`, pois o serviço ainda não existia.
- GREEN unitário: `node test/fila-atendente.test.js` — 10 testes aprovados.
- RED PostgreSQL: o primeiro teste isolado encontrou `No return data was expected` na consulta de bloqueio concorrente.
- GREEN PostgreSQL: `docker exec chatgov-dev-backend-1 node /app/test/fila-atendente.postgres.test.js` — o sexto cidadão foi enfileirado e promovido após a abertura de uma vaga.
- Suíte backend: `npm test` — 13 arquivos de teste aprovados.
- Frontend: `npm run build` — build Vite concluído.
- Cobertura: `filaAtendente.js` com 100% de linhas, 100% de funções e 80,36% de branches.

## Garantias

| # | Garantia | Teste | Tipo | Resultado |
|---|----------|-------|------|-----------|
| 1 | Limite fixo de cinco atendimentos e atribuição direta abaixo dele | `fila-atendente.test.js` | Unidade | PASS |
| 2 | Primeiro cidadão aguardando aparece na posição 6 | `fila-atendente.test.js` | Unidade | PASS |
| 3 | Posição inalterada não gera mensagem repetida | `fila-atendente.test.js` | Unidade | PASS |
| 4 | Uma vaga promove o primeiro e recalcula os restantes | `fila-atendente.test.js` | Unidade | PASS |
| 5 | Migração e consultas funcionam em PostgreSQL real isolado | `fila-atendente.postgres.test.js` | Integração | PASS |
| 6 | Pedido apenas por setor não gera mensagem de posição | `fila-atendente.test.js` | Unidade | PASS |

## Lacunas e merge

Não foi enviada mensagem E2E por WhatsApp para evitar contato real durante os testes. O envio usa o mesmo adaptador já utilizado pelo ChatGov e foi mantido atrás de tratamento de erro. Não foram criados commits de checkpoint porque a árvore de trabalho já continha alterações do usuário; as evidências RED/GREEN estão preservadas neste documento.
