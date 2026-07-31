# Evolução da Central de Atendimento — ambiente dev

## Escopo e isolamento

Todo o trabalho deste plano roda no projeto Compose `chatgov-dev`, portas
`127.0.0.1:13050/13051` e volumes `chatgov-dev_*`. O projeto de produção
`modulo-chatgov` não é reiniciado nem recebe migrations durante o
desenvolvimento.

## Inventário inicial

- Backend: Node.js 20, Express, Socket.IO, pg-promise e PostgreSQL 16.
- Frontend: React 18 com Vite, componentes funcionais e tema central em
  `frontend/src/theme.js`.
- Autenticação: token JWT emitido pelo SaaS; o dev valida a identidade no SaaS
  e provisiona apenas o banco dev.
- Mensageria WhatsApp: Baileys, sessões criptografadas no PostgreSQL, gateway
  Socket.IO e persistência antes da emissão ao frontend.
- Armazenamento: driver local ou S3, selecionado por variável de ambiente.
- Multi-tenant: `tenant_id`, contexto PostgreSQL e RLS nas entidades centrais.
- Recebimento: `WhatsAppManager` encaminha mensagens ao gateway, que resolve
  contato/conversa, deduplica por `wa_message_id` e persiste.
- Envio: eventos Socket.IO chamam o provedor e persistem status/mídia.
- Notificações: tabela `notificacoes`, serviço central, Socket.IO e hook de
  desktop. Ainda há consumidores que calculam contagem localmente.
- Métricas: endpoints de dashboard, relatórios, SLA e NPS no `index.js`;
  precisam migrar para um serviço único.
- Permissões: papéis `admin`, `supervisor` e `operador`, filtros por
  departamento/participante e RLS. O RBAC granular começou em
  `auth/permissions.js`.
- Exclusões físicas encontradas: contatos, secretarias, departamentos,
  templates, FAQ e palavras-chave. Serão substituídas gradualmente por
  arquivamento/soft delete.
- Exclusões já seguras: mensagens internas e mensagens de conversa utilizam
  marcação lógica em parte dos fluxos.
- Status legados: conversa (`fila`, `aberta`, `resolvida`, `arquivada`) e
  protocolo (`aberto`, `encerrado` e variações).

## Decisões arquiteturais

1. Migrações expansivas primeiro: campos novos convivem com campos legados
   durante a transição; nada é apagado.
2. `status_operacional` é a fonte canônica nova. O campo legado continua sendo
   atualizado temporariamente para compatibilidade.
3. Toda transição passa pelo serviço transacional e gera `eventos_status`.
4. Reabertura de protocolo é ação explícita e exige justificativa.
5. Telefone canônico usa E.164; dados legados duplicados são sinalizados antes
   de ativar unicidade.
6. Autorização é aplicada no backend via permissões nomeadas.
7. Métricas terão um único serviço e contratos compartilhados por cards,
   gráficos e exportações.
8. Nenhuma feature incompleta será promovida; recursos novos permanecem no dev
   até os testes de aceite passarem.

## Etapas

| Etapa | Conteúdo | Estado |
|---|---|---|
| 1 | Inventário, isolamento e login SaaS dev | concluída |
| 2 | Status, eventos, RBAC, E.164, soft delete e idempotência | concluída |
| 3 | Atendimento, compositor, detalhes e contatos | concluída no núcleo operacional |
| 4 | Protocolos, notificações e auditoria | concluída |
| 5 | Métricas, SLA, filas e roteamento | contratos e APIs concluídos |
| 6 | Canais, horários, bloqueios, equipe e configurações | contratos e APIs concluídos |
| 7 | Chatbot, Iris e templates | versionamento e persistência concluídos |
| 8 | Design system, acessibilidade e responsividade | concluída no fluxo principal |
| 9 | Testes de unidade, integração e E2E | concluída |

## Rollback da fundação

O arquivo `019_operacao_v2.down.sql` remove constraints e índices novos, mas
preserva colunas e eventos. Isso permite voltar o código sem destruir o
histórico produzido no dev. O volume dev pode ser recriado separadamente com
`./scripts/dev.sh reset-data`.

As migrations `020` e `021` possuem rollback conservador: o código anterior
pode ser restaurado sem apagar as novas tabelas/colunas. Isso é intencional para
preservar histórico.
