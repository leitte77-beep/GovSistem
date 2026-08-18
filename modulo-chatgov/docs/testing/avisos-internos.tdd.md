# Evidência TDD — Avisos internos

Data: 18/08/2026

## Escopo

- Administração de avisos em `Configurações > Avisos`.
- Destino para todos os atendentes ou setores selecionados.
- Prioridades informativa, importante e urgente, validade opcional e confirmação “Li e entendi”.
- Aviso compacto em tempo real, responsivo, com histórico e acompanhamento de leitura.
- Administradores não entram na audiência dos comunicados.

## RED

O primeiro teste foi executado antes da implementação e falhou com `ERR_MODULE_NOT_FOUND` para `src/services/avisos.js`, confirmando que as regras ainda não existiam.

## GREEN

- Suíte completa do backend: 16 arquivos, 16 aprovados.
- Regras do módulo e integração PostgreSQL: 7 testes aprovados.
- Cobertura de `src/services/avisos.js`: 96,83% linhas, 83,05% branches e 100% funções.
- E2E Playwright: criação administrativa e confirmação pelo atendente em desktop e celular; 4 cenários aprovados.
- Auditoria automatizada WCAG A/AA aplicada à tela administrativa e ao aviso flutuante: nenhuma violação.
- Build Vite de produção e verificações `node --check` e `git diff --check`: aprovados.

## Casos protegidos

- Atendente fora dos setores escolhidos não recebe o aviso e não pode forjar leitura.
- Fechar um aviso obrigatório não equivale a confirmar; ele volta no próximo acesso.
- Editar ou republicar reinicia as confirmações.
- Desativação e expiração removem o aviso das pendências.
- Atualizações são propagadas pelo canal em tempo real do tenant.

## Produção

- Backup pré-deploy: `backups/chatgov-promotions/chatgov-pre-avisos-internos-20260818.sql`.
- Imagens anteriores preservadas com a etiqueta `rollback-pre-avisos-20260818`.
- Migração `032_avisos_internos.sql` aplicada com sucesso.
- Backend, frontend público, PostgreSQL e duas sessões WhatsApp verificados após o deploy.
- Nenhum aviso real foi criado durante o smoke test para não notificar atendentes de produção.
