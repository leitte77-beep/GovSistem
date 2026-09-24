# Entrega técnica — Central Municipal ChatGov (DEV)

Data da validação: 29/07/2026. Ambiente: `chatgov-dev`.

## 1. Resumo

A evolução foi implementada somente no ambiente isolado de desenvolvimento.
O ChatGov DEV usa login real do GovSistem, banco/uploads/rede próprios e portas
locais `13050/13051`. Produção permaneceu ligada e não recebeu build, restart
ou migration.

O núcleo entregue inclui estados canônicos e histórico, RBAC no backend,
telefone E.164, prevenção/mesclagem de contatos, protocolos transacionais,
notificações consistentes, soft delete, auditoria imutável, idempotência de
envio/recebimento, falhas recuperáveis, bloqueios auditáveis, contratos de
canal/horário/SLA/roteamento, versionamento de chatbot/Iris/templates, retenção,
responsividade e testes automatizados.

## 2. Arquivos principais

- `backend/src/domain/`: status, telefone, privacidade, métricas, SLA e política
  de mensagens.
- `backend/src/services/status-transitions.js`: transições transacionais.
- `backend/src/routes/operacao-v2.js`: status/eventos/reabertura.
- `backend/src/routes/administracao-v2.js`: canais e diagnóstico, horários,
  SLA, roteamento, retenção, versões Iris/chatbot, massa sintética, falhas e
  auditoria.
- `backend/src/realtime/gateway.js`: deduplicação, reserva idempotente, bloqueio,
  falha persistida e notificações de canal.
- `frontend/src/components/AdministracaoAvancada.jsx`: canais, regras
  operacionais, saúde de integrações, retenção e versionamento de IA/chatbot.
- `frontend/src/components/`: atendimento, agenda, notificações, filtros,
  atalhos e estados de falha.
- `frontend/e2e/chatgov-dev.spec.js`: cenários de navegador.
- `../.github/workflows/chatgov-quality.yml`: qualidade, build, auditoria e E2E
  multibrowser.
- `scripts/load-test-dev.mjs`: carga protegida para aceitar somente localhost.

A lista exata pode ser obtida com:

```bash
git diff --name-only -- modulo-chatgov
```

## 3. Migrations

- `019_operacao_v2.sql`: estados, eventos, E.164, idempotência, falhas, soft
  delete e auditoria.
- `020_operacao_confiavel.sql`: sequência de protocolo, Central de
  Notificações, mesclagem de contatos e imutabilidade da auditoria.
- `021_operacao_municipal.sql`: canais, horários/exceções, SLA, roteamento,
  bloqueios, versões de templates/chatbot/Iris, dead-letter e retenção.

Todas são aditivas/idempotentes. Duplicatas legadas de mensagem deixam de ser
apagadas: preservam a linha e movem o identificador repetido para
`provider_duplicate_of`.

## 4. Novas entidades e campos

- `eventos_status`, `protocolo_sequencias`;
- `contato_nomes_alternativos`, `contato_merge_eventos`;
- `canais_atendimento`, vínculos e `canal_eventos`;
- `horarios_atendimento`, `horario_excecoes`;
- `sla_configuracoes`, `sla_eventos`;
- `roteamento_configuracoes`, `roteamento_eventos`;
- `bloqueio_tentativas`;
- `template_versoes`, `chatbot_fluxos`, `chatbot_fluxo_versoes`;
- `iris_prompt_versoes`, `iris_execucoes`;
- `mensagens_dead_letter`, `politicas_retencao`.

Campos canônicos foram adicionados sem remover os legados, incluindo
`status_operacional`, `phone_e164`, `idempotency_key`, falha/tentativas,
prioridade, soft delete e dados de auditoria.

## 5. Rotas e APIs

- `GET /api/v2/status`
- `GET /api/v2/status/:entidade/:id/eventos`
- `PATCH /api/v2/conversas/:id/status`
- `POST /api/v2/protocolos/:id/reabrir`
- `/api/v2/admin/canais`, `/horarios`, `/sla`, `/roteamento`, `/retencao`,
  `/iris/prompts`, `/iris/simular`, `/chatbot/fluxos`, `/diagnosticos`,
  `/massa-sintetica`, `/mensagens/falhas`, `/auditoria` e `/permissoes`
- `POST /api/contatos`, `POST /api/contatos/:id/mesclar`
- Central de notificações com pesquisa, abas, paginação, leitura e arquivo
- `POST /api/relatorios/exportacoes`

## 6. Permissões

Perfis: administrador, supervisor, gestor de departamento, atendente,
auditor/consulta e operador de IA. Permissões nomeadas abrangem conversas,
protocolos, dados sensíveis, exportação, relatórios, templates, Iris, chatbot,
usuários, departamentos, canais e auditoria.

O backend recarrega papel e situação do operador no banco em cada request.
Assim, alteração de permissão ou desativação tem efeito imediato. A
visibilidade de conversa continua limitada por tenant, participação e
departamentos atribuídos.

## 7. Testes e evidências

```bash
cd backend && npm test
cd backend && npm run test:integration:dev
cd backend && npm run test:load:dev
cd ../frontend && npm run build
cd ../frontend && npm run test:e2e
```

Resultados validados:

- 5 arquivos de teste Node, incluindo os 20 contratos obrigatórios: passando;
- build Vite: passando;
- 40 execuções Playwright: Chromium/Edge compatível desktop, Chromium mobile,
  Firefox desktop e WebKit/iPhone; 38 passaram e 2 controles exclusivos de
  desktop foram ignorados intencionalmente nos projetos mobile;
- auditoria automatizada Axe/WCAG 2.1 AA sem violações na tela principal e no
  Dashboard operacional;
- carga local: 300 requisições, concorrência 25, 0 erros, p95 de 378,2 ms;
- integração administrativa: 8 prompts e 6 versões de fluxo concorrentes sem
  colisão, simulador sem envio externo e UUID inválido respondendo HTTP 400;
- `npm audit` backend/frontend: 0 vulnerabilidades conhecidas;
- backend e frontend: HTTP 200;
- migrations 019/020/021: aplicadas no banco DEV;
- tabelas de sequência, canais, DLQ e versões Iris: presentes;
- nenhum `status_operacional` nulo;
- sem estouro horizontal nos viewports desktop e mobile;
- APIs de massa sintética, diagnóstico, prompt Iris e fluxo chatbot validadas
  contra o PostgreSQL DEV.

Capturas ficam em `frontend/test-results/**/central-atendimento.png` e
`frontend/test-results/**/governanca.png`.

## 8. Implantação

Desenvolvimento:

```bash
cd /home/ubuntu/sistemaweb/modulo-chatgov
./scripts/dev.sh up
```

Produção somente após homologação visual e funcional pelo responsável:

```bash
./scripts/promote-production.sh <commit-validado>
```

O script exige checkout limpo, commit exato, build, backup e a confirmação
literal `PROMOVER`.

## 9. Variáveis

Ver `.env.dev.example`. As principais são portas DEV, PostgreSQL,
`ENABLE_DEV_SAAS_AUTH`, origem CORS e configuração de storage. O segredo de
validação do SaaS é lido em tempo de execução e não é versionado.

`ENABLE_DEV_E2E_AUTH` habilita uma sessão técnica somente quando
`NODE_ENV=development`; a rota não aceita identidade fornecida pelo cliente e
não existe no compose de produção.

## 10. Rollback

1. Voltar o código ao commit anterior.
2. Recriar apenas backend/frontend.
3. Manter tabelas/colunas novas inertes para não perder histórico.
4. Em produção, o script de promoção guarda dump e imagens anteriores e faz
   rollback automático se o healthcheck falhar.

Os arquivos `019_operacao_v2.down.sql`, `020_operacao_confiavel.down.sql` e
`021_operacao_municipal.down.sql` documentam o rollback conservador.

## 11. Riscos e limitações externas

- Conexão WhatsApp Cloud API depende de credenciais/webhook reais.
- Antivírus de upload depende de serviço externo (o bloqueio de extensões,
  MIME e tamanho está ativo).
- Transcrição de áudio depende de provedor/modelo a ser contratado.
- 2FA possui persistência e revogação imediata preparadas; ativação completa
  exige o provedor de identidade do SaaS.
- Relatórios agendados dependem de worker/e-mail.
- Respostas reais da Iris dependem de chave/modelo e base autorizada.

O painel de Governança identifica cada dependência como configurada, pendente
de credencial ou responsabilidade do SaaS. O diagnóstico de canal e a
simulação da Iris não enviam mensagens ao cidadão. Essas integrações não foram
simuladas como se fossem produção.

## 12. Preservação dos dados

- Nenhuma migration remove tabela ou coluna legada.
- Contatos, conversas e templates usam arquivo/soft delete.
- A limpeza automática somente arquiva.
- Mensagens duplicadas legadas são preservadas.
- Auditoria é protegida contra UPDATE/DELETE.
- Rollbacks não removem tabelas que possam conter histórico.

## 13. Descrição das telas

- Atendimento mantém três áreas no desktop e navegação por painéis no mobile.
- A lista de conversas usa 460 px no desktop, pode ser redimensionada entre
  380–560 px por mouse ou teclado, e o menu principal pode ser recolhido.
- Filtros canônicos incluem minhas, não lidas, fila, aguardando cidadão/setor,
  resolvidas e arquivadas; os principais possuem contadores e os adicionais
  ficam agrupados sem corte ou rolagem horizontal.
- Central de Notificações possui Todas/Não lidas/Arquivadas, pesquisa, leitura
  e arquivo; o badge usa a mesma fonte.
- Agenda inicia em lista, alterna para cartões e arquiva sem apagar histórico.
- Falha de mensagem aparece na bolha com detalhe e tentativa controlada.
- Atalhos: Ctrl/Cmd+K, R, N, T, `/` e Esc, inativos durante digitação.
- Configurações inclui canais múltiplos, diagnóstico não invasivo, horário,
  SLA, roteamento por setor, retenção por arquivamento, saúde de dependências,
  auditoria e fila de falhas.
- Dashboard é uma área independente das Configurações, com filtros globais de
  período, departamento e canal, indicadores comparativos, evolução temporal,
  distribuição por status, demanda por setor e horário, equipe e assuntos.
- Configurações utiliza navegação secundária agrupada por integrações,
  atendimento, inteligência, estrutura organizacional e sistema.
- Iris e chatbot possuem criação/publicação de versões; a simulação Iris é
  explicitamente interna e nunca envia mensagem.

## 14. Changelog

- `2.0.0-dev`: ambiente isolado e login SaaS real;
- `2.1.0-dev`: estados, RBAC, E.164, soft delete e auditoria;
- `2.2.0-dev`: notificações, protocolo concorrente e contatos;
- `2.3.0-dev`: idempotência, falhas, bloqueios e contratos municipais;
- `2.4.0-dev`: responsividade, atalhos e testes E2E.
- `2.4.1-dev`: dependências corrigidas e exportador XLSX mínimo sem biblioteca
  vulnerável.
- `2.5.0-dev`: administração avançada completa, massa sintética sem dados
  pessoais, diagnóstico de integrações, carga local, CI e E2E multibrowser.
- `2.6.0-dev`: hierarquia visual da Central revisada, painel redimensionável,
  navegação recolhível, filtros responsivos e conformidade WCAG AA automatizada.
- `2.7.0-dev`: Dashboard operacional independente, filtros e visualizações
  responsivas, além da reorganização das Configurações por categorias.
