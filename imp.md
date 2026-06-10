# Prompt de Implementação — Sistema de Atendimento via WhatsApp + Chat Interno para Órgão Público

> Use este prompt completo com sua IA de desenvolvimento. Ele contém todos os requisitos funcionais, regras de negócio, estrutura de dados e orientações técnicas para implementar o sistema do zero ou evoluir o existente.

---

## CONTEXTO GERAL

Você irá implementar um sistema de atendimento digital para um órgão público composto por dois módulos integrados:

1. **Módulo WhatsApp** — Canal de atendimento ao cidadão via WhatsApp Business API (Meta), com chatbot, triagem automática, protocolos e painel de atendimento humano.
2. **Módulo Chat Interno** — Plataforma de comunicação interna entre servidores do órgão, com mensagens, grupos, tarefas, arquivos e videoconferência.
3. **Camada de Integração** — Os dois módulos compartilham dados, notificações e fluxo de atendimento de forma unificada.

O sistema deve ser pensado para uso em prefeituras, autarquias, secretarias ou qualquer órgão público municipal/estadual/federal brasileiro, respeitando a LGPD, normas de acessibilidade (WCAG 2.1) e boas práticas de segurança da informação.

---

## MÓDULO 1 — WHATSAPP (ATENDIMENTO AO CIDADÃO)

### 1.1 Chatbot e Automação

Implemente um chatbot baseado em fluxos configuráveis com as seguintes capacidades:

**Menu principal interativo:**
- Exibir menu numerado ou com botões (List Message / Quick Reply da API do WhatsApp)
- Exemplo de menu: `1 - Solicitar serviço | 2 - Consultar protocolo | 3 - Agendamento | 4 - Falar com atendente | 5 - Horário de funcionamento`
- O menu deve ser configurável pelo administrador via painel, sem necessidade de código

**Respostas automáticas por palavra-chave:**
- Cadastro de palavras-chave e respostas associadas (ex: "alvará" → resposta sobre alvarás)
- Suporte a múltiplas palavras-chave por resposta
- Prioridade configurável entre regras

**FAQ automatizado:**
- Banco de perguntas e respostas frequentes editável pelo administrador
- Motor de busca por similaridade para identificar a intenção do cidadão
- Fallback para atendente humano quando confiança < threshold configurável (ex: 70%)

**Integração com IA (LLM):**
- Conectar a uma API de LLM (OpenAI, Anthropic, etc.) para responder perguntas em linguagem natural sobre os serviços do órgão
- Prompt de sistema configurável pelo administrador com informações do órgão, serviços disponíveis, horários, endereços
- Histórico da conversa enviado como contexto para respostas coerentes
- Opção de desligar a IA e usar apenas fluxos determinísticos

**Transferência para humano:**
- Detectar pedidos como "falar com atendente", "humano", "atendimento", etc.
- Transferir para fila de atendimento humano preservando todo o histórico
- Notificar o atendente disponível via Chat Interno
- Mensagem automática ao cidadão informando posição na fila e tempo estimado

### 1.2 Protocolo e Triagem

**Geração de protocolo:**
- Ao iniciar atendimento, gerar número de protocolo único no formato: `ANO-MES-SEQUENCIAL` (ex: `2025-06-000123`)
- Protocolo enviado automaticamente ao cidadão via WhatsApp
- Armazenar: data/hora, assunto, setor destino, atendente, status, histórico de interações

**Triagem automática:**
- Identificar assunto pelo menu selecionado ou palavras-chave da mensagem
- Mapear assuntos → setores responsáveis (configurável em painel)
- Encaminhar automaticamente para a fila do setor correto
- Setor padrão para casos não identificados: "Atendimento Geral"

**Fila de atendimento:**
- Fila por setor com prioridade (normal, urgente, VIP)
- Exibir ao cidadão: `"Você é o 3º na fila. Tempo estimado: 12 minutos."`
- Redistribuição automática se atendente ficar inativo por X minutos (configurável)

**Consulta de status:**
- Cidadão envia número do protocolo → sistema retorna status atual, setor, último andamento e data/hora
- Histórico completo da solicitação disponível para o atendente

### 1.3 Solicitações e Serviços

Implemente um sistema de formulários via WhatsApp para os seguintes tipos de serviço (cada um como um fluxo configurável):

**Requerimentos gerais:**
- Fluxo de coleta de dados: nome completo, CPF, endereço, assunto, descrição, anexos
- Validação de CPF em tempo real
- Confirmação dos dados antes de registrar
- Envio de comprovante com número de protocolo

**Agendamentos:**
- Listar serviços disponíveis para agendamento
- Exibir datas e horários disponíveis (integrar com agenda do setor)
- Confirmação por mensagem + lembrete automático 24h antes
- Opção de cancelamento/reagendamento pelo próprio WhatsApp

**Envio de documentos:**
- Aceitar imagens (JPEG, PNG) e arquivos (PDF, DOC) enviados pelo WhatsApp
- Associar automaticamente ao protocolo ativo do cidadão
- Notificar atendente sobre novo documento recebido
- Validar tamanho máximo (ex: 16MB por arquivo)

**Consultas específicas:**
- IPTU: informar débitos, gerar boleto (integração com sistema tributário)
- Alvará: status de licença pelo número do processo
- Certidões: solicitar emissão e receber link para download

**Segunda via de documentos:**
- Cidadão solicita → sistema verifica no banco → gera PDF → envia link seguro por WhatsApp
- Link com expiração em 24h para segurança

### 1.4 Acompanhamento e Notificações Proativas

**Atualização de status:**
- Sempre que houver andamento no processo, enviar mensagem automática ao cidadão
- Mensagem modelo: `"Olá, [Nome]. Seu protocolo [NÚMERO] foi atualizado: [STATUS]. [Descrição do andamento]."`
- Configurar quais eventos disparam notificação (configurável por setor)

**Notificações de prazo:**
- Vencimento de IPTU, taxas, licenças: avisar com 30, 15 e 5 dias de antecedência
- Consulta de agenda do cidadão: lembrete de agendamento

**Pesquisa de satisfação (NPS):**
- Ao encerrar atendimento, enviar automaticamente: `"Como você avalia nosso atendimento? Responda de 1 a 10."`
- Campo aberto para comentário opcional
- Armazenar resultado vinculado ao protocolo, setor e atendente
- Dashboard com NPS por setor, período e atendente

### 1.5 Painel do Atendente (Interface Web)

Construir interface web responsiva com as seguintes funcionalidades:

**Visão geral:**
- Lista de conversas ativas com filtros: minha fila / todas / por setor / por status
- Badge com contagem de mensagens não lidas
- Indicador de tempo de espera do cidadão
- Busca por nome, CPF ou número de protocolo

**Tela de conversa:**
- Histórico completo da conversa com o cidadão, incluindo mensagens do chatbot
- Informações do cidadão no painel lateral (nome, CPF, histórico de atendimentos anteriores)
- Campo de texto com envio de mensagem, emojis e anexos
- Botão de resposta rápida: selecionar templates pré-cadastrados
- Notas internas: registrar observações visíveis apenas para atendentes e gestores (não enviadas ao cidadão)
- Etiquetas: categorizar atendimento (ex: "resolvido", "aguardando documento", "reclamação", etc.)
- Botão de transferência: selecionar setor ou atendente destino + mensagem opcional
- Botão de encerrar atendimento + registro de resolução

**Status do atendente:**
- Definir status: Disponível, Pausado, Em reunião, Indisponível
- Capacidade máxima: número máximo de conversas simultâneas por atendente (configurável)

**Comunicados em massa:**
- Criar mensagem para envio em massa com segmentação (por bairro, tipo de serviço, data de cadastro)
- Usar templates aprovados pela Meta (obrigatório para mensagens ativas)
- Agendamento de envio com data e hora
- Relatório de entrega: enviadas, entregues, lidas, falhas

### 1.6 Segurança e Compliance

**Autenticação do cidadão:**
- Solicitar CPF e data de nascimento na primeira interação para serviços que exigem identificação
- Verificar dados contra base cadastral do órgão
- Sessão autenticada válida por X horas (configurável)

**LGPD:**
- Exibir termo de consentimento na primeira interação
- Registrar aceite com data/hora e número de celular
- Opção do cidadão solicitar exclusão de dados pessoais
- Anonimização de dados após período de retenção configurável

**Logs e auditoria:**
- Registrar todas as interações: mensagem, remetente, data/hora, IP do atendente
- Log de ações administrativas (quem criou fluxo, alterou configuração, etc.)
- Relatório de auditoria exportável em PDF/Excel

**Controle de acesso:**
- Perfis: Administrador, Gestor de Setor, Atendente, Supervisor, Somente Leitura
- Permissões por perfil configuráveis no painel de administração
- Autenticação com senha forte + opção de 2FA (TOTP)

---

## MÓDULO 2 — CHAT INTERNO (COMUNICAÇÃO ENTRE SERVIDORES)

### 2.1 Mensagens

**Conversas individuais:**
- Chat 1:1 entre quaisquer servidores do órgão
- Indicador de leitura (entregue / lido)
- Status de presença: Online, Ausente, Não perturbe, Offline
- Histórico de mensagens com busca por texto

**Grupos:**
- Criação de grupos por setor, projeto ou tema
- Adicionar/remover membros (apenas administradores do grupo)
- Definir administradores do grupo
- Grupos privados (por convite) e públicos (qualquer servidor pode entrar)
- Canais de anúncio: apenas administradores postam, todos recebem
- Limite de membros configurável

**Recursos de mensagem:**
- Texto formatado (negrito, itálico, código)
- Resposta em thread (encadear discussão sem poluir o grupo)
- Reações com emoji
- Menção de usuário com @nome (notificação diferenciada)
- Menção de grupo com #grupo
- Fixar mensagens importantes no topo do grupo/conversa
- Encaminhar mensagem para outro chat ou grupo
- Editar/excluir mensagens enviadas (com log de edição)

### 2.2 Compartilhamento de Arquivos

- Enviar arquivos de até 100MB diretamente no chat
- Suporte a todos os formatos comuns: PDF, DOCX, XLSX, imagens, vídeos, ZIP
- Visualizador de PDF e imagens integrado (sem precisar baixar)
- Galeria de mídia por conversa/grupo (aba separada)
- Integração com armazenamento externo: Google Drive, OneDrive, Dropbox
- Controle de versão: ao enviar arquivo com mesmo nome, perguntar se deseja criar nova versão
- Busca por nome de arquivo em todo o histórico

### 2.3 Reuniões e Videoconferência

- Chamada de voz 1:1 diretamente do chat
- Videochamada 1:1 e em grupo (até N participantes, configurável)
- Integração com Jitsi Meet (autohospedado) ou Google Meet / Teams
- Agendamento de reunião: criar evento com link, horário, participantes e pauta
- Sincronizar com Google Calendar ou Outlook
- Notificação de início de reunião 5 minutos antes
- Gravação de reuniões (salvar no servidor ou Drive)
- Compartilhamento de tela durante chamada

### 2.4 Gestão de Tarefas

**Criação de tarefas:**
- Criar tarefa diretamente de uma mensagem (botão "Criar tarefa desta mensagem")
- Campos: título, descrição, responsável(eis), prazo, prioridade (baixa/média/alta/urgente), etiquetas
- Associar tarefa a um projeto ou setor

**Acompanhamento:**
- Visão Kanban: colunas configuráveis (ex: A fazer / Em andamento / Em revisão / Concluído)
- Visão Lista com filtros por responsável, prazo, prioridade, status
- Visão Calendário com tarefas distribuídas por data de vencimento
- Comentários e anexos dentro da tarefa
- Histórico de alterações da tarefa (quem mudou o quê e quando)

**Notificações:**
- Notificar responsável ao ser atribuído a uma tarefa
- Lembrete automático: 24h e 1h antes do prazo
- Alerta de tarefa vencida para responsável e gestor
- Notificação ao atribuidor quando tarefa for concluída

**Relatórios:**
- Tarefas por responsável: concluídas, em andamento, atrasadas
- Produtividade por equipe/setor no período
- Exportar relatório em PDF ou Excel

### 2.5 Calendário e Agenda Corporativa

- Calendário compartilhado por setor visível a todos do setor
- Calendário pessoal (visível apenas ao próprio servidor e gestores autorizados)
- Eventos: título, local, horário, participantes, descrição, anexos, recorrência
- Feriados nacionais e municipais pré-carregados e atualizáveis
- Prazos institucionais: licitações, orçamento, prestação de contas (configuráveis pelo administrador)
- Solicitação de ausência/férias: fluxo de aprovação pelo gestor com notificação
- Integração bidirecional com Google Calendar e Outlook

### 2.6 Base de Conhecimento (Wiki Interna)

- Criar e editar artigos com editor rich-text (formatação, imagens, tabelas, links)
- Organização em categorias e subcategorias (ex: RH > Benefícios > Vale-transporte)
- Controle de versão: histórico de edições com autoria
- Permissões por artigo: público para todos / restrito a setores específicos
- Busca global: pesquisar em artigos, mensagens e arquivos de forma unificada
- Templates de documentos oficiais: ofícios, memorandos, atas (editáveis e versionados)
- Fixar artigos no topo da categoria como "leitura obrigatória"

### 2.7 Administração e Segurança

**Autenticação:**
- Login com e-mail institucional e senha
- Integração com Active Directory / LDAP (login único com credenciais do órgão)
- SSO (Single Sign-On) via SAML 2.0 ou OAuth2
- Autenticação de dois fatores (2FA) obrigatória para perfis de gestão
- Sessão com timeout configurável por perfil

**Gestão de usuários:**
- Cadastro, edição e desativação de servidores
- Associação a setores, cargos e perfis de acesso
- Importação em massa via CSV
- Desativação automática após X dias sem acesso (configurável)

**Auditoria:**
- Log de todas as ações: login, mensagem enviada, arquivo compartilhado, tarefa criada/alterada
- Gestores podem auditar conversas de subordinados (com registro no log que o acesso foi feito)
- Exportação de logs em formato CSV para análise externa

**Retenção e backup:**
- Política de retenção configurável por tipo de conteúdo (mensagens, arquivos, tarefas)
- Backup automático diário com retenção de 90 dias
- Apagamento automático de conta ao desligar servidor + exportação dos dados do servidor

---

## MÓDULO 3 — INTEGRAÇÃO ENTRE OS SISTEMAS

### 3.1 Fluxo de Atendimento Unificado

- Quando chega mensagem no WhatsApp e não há atendente disponível: criar alerta automático no chat interno no grupo do setor responsável
- Atendente pode responder ao cidadão diretamente do painel web sem sair da interface de chat interno (visão unificada)
- Ao transferir atendimento entre setores no WhatsApp, notificar o setor destino via chat interno com resumo do histórico
- Ao encerrar atendimento no WhatsApp, registrar no histórico do cidadão e criar tarefa de follow-up se necessário

### 3.2 Integração com Sistemas Externos do Órgão

Preparar integrações via API REST com:

- **Sistemas de gestão de processos:** SEI, e-Proc, SIGPROC (consultar status de processo por número)
- **Sistema tributário:** consultar débitos, gerar boleto, confirmar pagamento (IPTU, alvará, taxas)
- **Sistema de emissão de documentos:** certidão negativa de débitos, comprovante de inscrição, etc.
- **Portal de Licitações:** notificar publicação de novos editais para grupos de interesse
- **Portal de Transparência:** responder dúvidas sobre dados públicos automaticamente
- **Sistema de RH:** sincronizar lista de servidores ativos, cargos e setores com o Chat Interno

Cada integração deve ter:
- Configuração de URL e credenciais no painel administrativo
- Teste de conexão com feedback de sucesso/erro
- Log de todas as chamadas de integração com status de resposta
- Tratamento de erros com mensagem amigável ao cidadão em caso de falha

### 3.3 Omnichannel

- Unificar atendimentos de múltiplos canais (WhatsApp, chat do site, e-mail) em um único painel
- Histórico único por CPF: independente do canal, atendente vê todo o histórico do cidadão
- Responder por qualquer canal sem perder o contexto da conversa
- Dashboard consolidado com métricas de todos os canais

### 3.4 Automações Cruzadas

Implementar motor de automação baseado em regras (gatilho → condição → ação):

**Exemplos de automações:**
- `SE` nova mensagem urgente no WhatsApp `E` nenhum atendente disponível `ENTÃO` enviar alerta no grupo do setor no chat interno
- `SE` protocolo sem movimentação há 48h `E` status = "aguardando retorno do setor" `ENTÃO` notificar gestor do setor no chat interno
- `SE` SLA do atendimento vencer `ENTÃO` escalar para supervisor + enviar mensagem ao cidadão informando o atraso
- `SE` pesquisa NPS < 6 `ENTÃO` criar tarefa de revisão de atendimento e notificar gestor
- `SE` novo servidor cadastrado no AD `ENTÃO` criar conta no Chat Interno e enviar mensagem de boas-vindas
- `SE` agendamento confirmado `ENTÃO` criar evento no calendário do setor responsável

---

## REQUISITOS TÉCNICOS

### Stack Recomendada

**Backend:**
- Node.js com NestJS (ou Python com FastAPI) para a API principal
- PostgreSQL como banco de dados principal (dados transacionais)
- Redis para cache, sessões e filas de mensagens em tempo real
- BullMQ ou Celery para processamento de filas (notificações, envios em massa)
- WebSocket (Socket.io) para comunicação em tempo real no chat interno
- MinIO ou AWS S3 para armazenamento de arquivos e mídias

**Frontend:**
- React com TypeScript (ou Next.js para SSR)
- Zustand ou Redux Toolkit para gerenciamento de estado
- TailwindCSS para estilização
- ShadcnUI ou Radix UI para componentes acessíveis
- React Query para cache e sincronização de dados com a API

**WhatsApp:**
- Integração via WhatsApp Business API (Meta Cloud API ou BSP parceiro)
- Webhook para receber mensagens em tempo real
- Fila de processamento para envios em massa (respeitar limites da API)

**Infraestrutura:**
- Docker + Docker Compose para containerização
- Nginx como reverse proxy
- Suporte a deploy em servidor próprio (on-premise) obrigatório — dados não podem sair da infraestrutura do órgão
- HTTPS obrigatório com certificado SSL válido
- Backup automático configurável

### Banco de Dados — Estrutura Principal

```
CIDADAOS (id, cpf, nome, celular, email, data_nascimento, bairro, criado_em, lgpd_aceite_em)

PROTOCOLOS (id, numero, cidadao_id, setor_id, assunto, status, prioridade, atendente_id, aberto_em, fechado_em, nps_nota, nps_comentario)

MENSAGENS_WHATSAPP (id, protocolo_id, remetente_tipo [cidadao|bot|atendente], conteudo, tipo_midia, url_midia, enviada_em, entregue_em, lida_em)

SETORES (id, nome, responsavel_id, sla_horas, horario_atendimento, ativo)

ATENDENTES (id, usuario_id, setor_id, capacidade_maxima, status)

SERVIDORES (id, nome, email, cargo, setor_id, perfil, ativo, ultimo_acesso)

MENSAGENS_CHAT (id, conversa_id, remetente_id, conteudo, tipo, thread_pai_id, enviada_em, editada_em, excluida_em)

CONVERSAS_CHAT (id, tipo [individual|grupo|canal], nome, criada_por, criada_em)

TAREFAS (id, titulo, descricao, criada_por, responsavel_id, projeto_id, prazo, prioridade, status, criada_em, concluida_em)

ARQUIVOS (id, nome, tamanho, tipo_mime, url_storage, enviado_por, conversa_id, protocolo_id, enviado_em)

AUTOMACOES (id, nome, gatilho, condicoes_json, acoes_json, ativo)

LOGS_AUDITORIA (id, usuario_id, acao, entidade, entidade_id, dados_anteriores, dados_novos, ip, criado_em)
```

### APIs Principais a Implementar

```
# WhatsApp
POST /webhook/whatsapp                  → receber mensagens do WhatsApp
POST /api/whatsapp/enviar               → enviar mensagem para cidadão
POST /api/whatsapp/envio-massa          → criar campanha de envio em massa
GET  /api/whatsapp/conversas            → listar conversas ativas
GET  /api/whatsapp/conversas/:id        → detalhes e histórico da conversa
POST /api/whatsapp/conversas/:id/transferir
POST /api/whatsapp/conversas/:id/encerrar
POST /api/whatsapp/conversas/:id/notas  → adicionar nota interna

# Protocolos
POST /api/protocolos                    → abrir novo protocolo
GET  /api/protocolos/:numero            → consultar status
GET  /api/protocolos                    → listar com filtros
PATCH /api/protocolos/:id/status        → atualizar status

# Chat Interno
GET  /api/conversas                     → listar conversas e grupos
POST /api/conversas                     → criar conversa ou grupo
GET  /api/conversas/:id/mensagens       → carregar histórico paginado
POST /api/conversas/:id/mensagens       → enviar mensagem
POST /api/conversas/:id/mensagens/:msgId/reacoes
POST /api/conversas/:id/mensagens/:msgId/thread

# Tarefas
GET  /api/tarefas                       → listar com filtros
POST /api/tarefas                       → criar tarefa
PATCH /api/tarefas/:id                  → atualizar
GET  /api/tarefas/kanban/:projeto_id    → visão kanban

# Administração
GET  /api/admin/servidores              → listar servidores
POST /api/admin/servidores              → cadastrar servidor
GET  /api/admin/relatorios/atendimento  → métricas do WhatsApp
GET  /api/admin/relatorios/chat         → métricas do chat interno
GET  /api/admin/logs                    → logs de auditoria
POST /api/admin/automacoes              → criar automação
```

---

## REQUISITOS DE UX E ACESSIBILIDADE

- Interface completamente em **português do Brasil**
- Responsiva: funcionar em desktop, tablet e smartphone (mobile-first para o painel do atendente)
- Acessibilidade WCAG 2.1 nível AA: leitores de tela, contraste adequado, navegação por teclado
- Tempo de carregamento inicial < 3 segundos em conexões 4G
- Modo escuro obrigatório (toggle manual + respeitar preferência do sistema)
- Notificações do navegador (Push Notifications) para novas mensagens e alertas
- Funcionar offline parcialmente: visualizar histórico de mensagens sem internet

---

## REQUISITOS DE SEGURANÇA

- Todas as senhas com hash bcrypt (fator 12+)
- Tokens JWT com expiração curta (15min) + refresh token (7 dias) com rotação
- Rate limiting em todas as rotas públicas (especialmente webhook do WhatsApp)
- Sanitização de inputs para prevenção de XSS e SQL Injection
- Headers de segurança HTTP: CSP, HSTS, X-Frame-Options, etc.
- Criptografia em repouso para dados sensíveis (CPF, dados pessoais do cidadão)
- Validação de webhook do WhatsApp via assinatura HMAC-SHA256
- Auditoria completa: qualquer dado acessado ou modificado é registrado com autoria

---

## PAINEL ADMINISTRATIVO

Construir painel de administração separado com:

**Dashboard principal:**
- Total de atendimentos hoje / semana / mês
- Atendimentos por status (aguardando, em andamento, encerrados)
- NPS médio do período com gráfico de tendência
- Tempo médio de atendimento por setor
- Top 5 assuntos mais demandados
- Atendentes online agora com carga atual

**Configurações do chatbot:**
- Editor visual de fluxos (drag-and-drop de blocos: mensagem, condição, ação, menu, integração)
- Cadastro e edição de FAQ
- Palavras-chave e respostas automáticas
- Horário de atendimento por setor (dias da semana e horários)
- Mensagem de fora do horário personalizável

**Gestão de templates:**
- Cadastrar templates para aprovação na Meta
- Gerenciar templates aprovados
- Criar templates de respostas rápidas para atendentes

**Gestão de setores e atendentes:**
- Criar/editar setores com responsável, SLA e horário
- Definir capacidade e perfil dos atendentes
- Relatório de performance individual

**Configurações de integrações:**
- Cadastrar e testar conexões com sistemas externos
- Configurar automações com editor visual de regras
- Configurar canais adicionais (chat do site, e-mail)

---

## ORDEM DE IMPLEMENTAÇÃO SUGERIDA

Implemente nesta ordem para ter valor de negócio o mais rápido possível:

**Fase 1 — Fundação (Semanas 1–3):**
1. Autenticação de servidores (login, perfis, JWT)
2. Estrutura de banco de dados e migrações
3. Webhook WhatsApp: receber mensagens e armazenar
4. Menu básico do chatbot (fluxo determinístico)
5. Geração de protocolo automático
6. Painel do atendente: visualizar conversas e responder

**Fase 2 — WhatsApp completo (Semanas 4–6):**
7. Triagem automática e encaminhamento a setores
8. Fila de atendimento com posição e tempo estimado
9. Notas internas, etiquetas, transferência entre atendentes
10. Notificações proativas de status ao cidadão
11. Pesquisa NPS pós-atendimento
12. Relatórios básicos (volume, TMA, TME)

**Fase 3 — Chat Interno (Semanas 7–10):**
13. Mensagens individuais em tempo real (WebSocket)
14. Grupos e canais por setor
15. Envio e visualização de arquivos
16. Notificações no navegador
17. Gestão de tarefas (criar, atribuir, acompanhar)
18. Base de conhecimento (wiki)

**Fase 4 — Integração e Automação (Semanas 11–14):**
19. Fluxo unificado: WhatsApp ↔ Chat Interno
20. Integrações com sistemas externos (SEI, tributário)
21. Motor de automações com regras configuráveis
22. Painel administrativo completo com editor de fluxos
23. Omnichannel (e-mail, chat do site)
24. Relatórios avançados e exportação

**Fase 5 — Qualidade e Produção (Semana 15–16):**
25. Testes de carga e performance
26. Auditoria de segurança
27. Ajustes de acessibilidade (WCAG 2.1)
28. Documentação de APIs e manual do usuário
29. Deploy em ambiente de produção do órgão

---

## NOTAS FINAIS PARA A IA IMPLEMENTADORA

- Sempre priorize a experiência do atendente: ele usa o sistema o dia inteiro, então a interface deve ser rápida, intuitiva e sem fricção
- O chatbot deve falhar de forma elegante: quando não souber responder, encaminhar ao humano é SEMPRE melhor que responder errado
- Respeite os limites da API do WhatsApp: máximo de 80 mensagens por segundo, templates obrigatórios para mensagens ativas iniciadas pelo órgão
- Todos os dados do cidadão são sensíveis — implementar LGPD desde o início, não como adição posterior
- O sistema deve funcionar com internet instável: filas persistentes, retry automático, feedback visual de status de envio
- Logs de auditoria são obrigatórios por lei para órgãos públicos — não são opcionais
- Ao finalizar cada fase, gerar documentação automática das APIs implementadas (Swagger/OpenAPI)
