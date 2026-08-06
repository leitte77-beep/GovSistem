# GovInfra — decisões técnicas (ADRs resumidos)

## 1. Integração com o sistema existente

O GovInfra **não cria login, cadastro de usuários nem layout próprios**: o
usuário chega pela plataforma GovSistem (token `module_access` assinado com o
segredo compartilhado) e organização/usuário são provisionados just-in-time,
no mesmo padrão do GovDoc e do ChatGov. O frontend é uma SPA própria do módulo
(React + Vite), montada como item do portal, reutilizando o design system de
cores/componentes dos módulos irmãos.

## 2. Stack preservada

Backend em **FastAPI + SQLAlchemy async**, frontend em **React + TypeScript +
Vite**, banco **PostgreSQL 16** (SQLite na suíte de testes), armazenamento
local com abstração S3/MinIO. Nada da stack foi substituído — o módulo seguiu
as convenções já adotadas.

## 3. Portas

Faixa exclusiva 44000–44699, configurada no `.env.local` e resolvida por
`scripts/resolve-ports.mjs` (verificação real de ocupação, modo automático
com fallback, modo fixo com falha clara). Nenhum processo externo é
encerrado; portas de outros módulos não são tocadas.

## 4. PostGIS

Os modelos usam `latitude`/`longitude` com índice composto e pré-filtro por
caixa + Haversine (`core/geo.py`) — funcionam em qualquer PostgreSQL e no
SQLite dos testes. Por isso o compose usa `postgres:16-alpine` (disponível
para arm64) em vez de `postgis/postgis`, que não tem build para a arquitetura
da máquina de desenvolvimento. A troca por colunas `geometry` é possível no
futuro sem impacto nas regras de negócio.

## 5. Concorrência

- **Banco de horas**: linha do saldo travada (`SELECT … FOR UPDATE` no PG;
  no SQLite a serialização do arquivo cobre), movimentações append-only com
  `saldo_anterior`/`saldo_posterior` e `chave_idempotencia` única.
- **Reserva de recursos (agenda)**: verificações de conflito no backend com
  transação; o arranjo de caçamba/veículo no agendamento é revalidado.
- **Controle otimista**: `row_version` em registros editáveis; o cliente
  devolve a versão lida e a API responde 409 em conflito.
- **Abastecimento**: `chave_idempotencia` evita lançamento duplicado.

## 6. FKs `use_alter` — correção de migration

O autogenerate do Alembic renderiza `ForeignKeyConstraint(use_alter=True)`
dentro de `op.create_table`, mas o PostgreSQL **descarta** essas constraints
(100 FKs ficaram de fora da migration inicial). A migration `0002_fks_use_alter`
recria todas elas via `op.create_foreign_key`. Manter `alembic upgrade head`
em ambientes novos aplica as duas migrations em ordem.

## 7. Entrega da caçamba e máquina de estados

O mapa de transições (item 12.2) não liga "agendada" diretamente a "em uso".
A rota de entrega agora encadeia `agendada → em_transporte → em_uso` (mesmo
padrão já existente na retirada: `em_uso → aguardando_retirada → concluída`),
preservando histórico fiel do que aconteceu.

## 8. Regras configuráveis, nunca fixas

Limites de caçambas, pesos da recomendação, método de desconto de horas,
tolerâncias de combustível e textos de termos vivem na tabela
`govinfra_settings` (catálogo semeado por `configuracoes.py`) — nada de
constante mágica no código. Alterações são auditadas
(`govinfra.configuracoes.editar`).

## 9. Mascaramento no backend

CPF e RENAVAM são mascarados na **API** conforme permissão
(`govinfra.pessoas.ver_cpf`, `govinfra.veiculos.ver_renavam`); a interface
nunca recebe o dado completo sem direito. Logs de auditoria também sanitizam
documentos.

## 10. Mapas

Abstração de camada base: URL de tiles, atribuição e centro vêm da sessão
(`/auth/eu → mapa`) e do `.env` (`MAP_TILE_URL`, `MAP_DEFAULT_*`), permitindo
trocar o provedor (OpenStreetMap hoje, provedor pago depois) sem tocar no
código das páginas. A geocodificação é sempre auxiliar: o cadastro aceita
marcação manual quando o provedor está indisponível (`GEOCODE_PROVIDER=none`).

## 11. Testes

SQLite em arquivo temporário (mesmo engine da aplicação), `create_all` por
teste, usuários por perfil via token `type=access`. 54 testes cobrindo os
fluxos dos critérios de aceite, incluindo os casos de erro (duplicada,
bloqueio, saldo insuficiente, sem permissão, extensão bloqueada, conteúdo
suspeito).
