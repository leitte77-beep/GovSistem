# Prompt de Evolução — Chat Interno para Órgão Público
**Stack:** Python (Django ou FastAPI) · **Autenticação:** já implementada · **Base existente:** mensagens individuais + grupos básicos

> Use este prompt para evoluir o chat interno já existente. NÃO reimplemente autenticação, login, cadastro de usuários nem mensagens individuais/grupos básicos — esses módulos já estão prontos. Foque exclusivamente nas evoluções descritas abaixo, integrando-as ao sistema existente.

---

## CONTEXTO DO SISTEMA ATUAL

O sistema já possui:
- Autenticação completa (login, sessão, perfis de acesso)
- Mensagens individuais (1:1) funcionando
- Grupos básicos (criar grupo, adicionar membros, enviar mensagem)

O objetivo é evoluir o chat para uma plataforma completa de comunicação e produtividade interna para servidores de um órgão público, adicionando as seguintes camadas em ordem de prioridade:

1. Mensagens em tempo real com WebSocket (evoluir o existente)
2. Gestão de tarefas e Kanban
3. Compartilhamento e gerenciamento de arquivos
4. Videoconferência via Google Meet / Microsoft Teams

---

## PRIORIDADE 1 — MENSAGENS EM TEMPO REAL (WebSocket)

### Objetivo
Substituir ou complementar o sistema de mensagens atual com comunicação em tempo real via WebSocket, sem necessidade de recarregar a página.

### Implementação técnica

**Biblioteca recomendada:**
- Usar **Django Channels** (se Django) ou **WebSockets nativos com FastAPI** + **Starlette**
- Redis como message broker para o Channel Layer (Django Channels) ou pub/sub (FastAPI)
- Manter compatibilidade com o modelo de dados de mensagens existente

**Eventos WebSocket a implementar:**

```python
# Eventos que o servidor emite ao cliente
{
  "type": "message.new",          # nova mensagem recebida
  "type": "message.edited",       # mensagem editada
  "type": "message.deleted",      # mensagem excluída
  "type": "message.reaction",     # reação adicionada/removida
  "type": "user.typing",          # usuário digitando
  "type": "user.presence",        # mudança de status (online/ausente/offline)
  "type": "notification.new",     # nova notificação geral
  "type": "task.updated",         # tarefa atualizada (integração com módulo de tarefas)
  "type": "file.uploaded",        # arquivo disponível na conversa
}

# Eventos que o cliente envia ao servidor
{
  "type": "message.send",
  "type": "message.typing",       # usuário está digitando
  "type": "message.read",         # marcar mensagem como lida
  "type": "user.status",          # atualizar status de presença
}
```

**Presença e status do usuário:**
- Status: `online`, `ausente`, `não_perturbe`, `offline`
- Atualizar automaticamente para `ausente` após 10 minutos sem interação (configurável)
- Atualizar para `offline` ao fechar a aba/desconectar o WebSocket
- Exibir indicador visual de presença em avatares (bolinha colorida: verde/amarelo/cinza)
- Permitir que o usuário defina status manualmente com mensagem personalizada (ex: "Em reunião até 15h")

**Indicador de digitação:**
- Emitir evento `message.typing` enquanto o usuário digita
- Exibir "João está digitando..." na conversa
- Parar de exibir após 3 segundos sem nova tecla pressionada

**Confirmação de leitura:**
- Ao visualizar uma conversa, emitir `message.read` para todas as mensagens não lidas
- Exibir ticks: ✓ (enviado), ✓✓ (entregue), ✓✓ azul (lido)
- Contador de não lidas no menu lateral por conversa/grupo

**Reconexão automática:**
- Implementar lógica de reconnect com backoff exponencial no frontend
- Ao reconectar, buscar mensagens perdidas durante a desconexão via API REST
- Exibir banner "Reconectando..." durante instabilidade de rede

### Evolução dos grupos existentes

Manter a estrutura atual e adicionar:

**Tipos de grupo:**
- **Grupo padrão** — qualquer membro pode enviar mensagens (já existe)
- **Canal de anúncio** — apenas administradores do canal postam; membros só leem e reagem
- **Grupo privado** — acesso apenas por convite, não aparece nas buscas
- **Grupo público** — qualquer servidor pode encontrar e entrar

**Recursos adicionais de grupo:**
- Foto/ícone do grupo (upload de imagem)
- Descrição do grupo (texto curto, exibido no cabeçalho)
- Múltiplos administradores por grupo
- Histórico de entradas e saídas de membros
- Opção de arquivar grupo (sai da lista principal, histórico preservado)
- Limite de membros configurável por perfil administrativo

**Recursos de mensagem a adicionar (sobre o existente):**
- **Resposta em thread:** clicar em "Responder" abre thread lateral sem sair da conversa principal; contador de respostas exibido na mensagem original
- **Reações com emoji:** menu de emoji rápido ao hover na mensagem; contagem de reações por emoji; quem reagiu ao clicar no contador
- **Menções:** digitar `@nome` autocompleta com membros do grupo; mencionado recebe notificação diferenciada; mensagem com menção fica destacada no histórico
- **Fixar mensagem:** administradores podem fixar até 3 mensagens por grupo; exibidas em banner no topo da conversa
- **Editar mensagem:** editar até 24h após envio; exibir "(editado)" ao lado da hora
- **Excluir mensagem:** excluir para todos; substituir conteúdo por "Mensagem excluída" (manter no log de auditoria)
- **Encaminhar mensagem:** selecionar conversa ou grupo destino; mensagem chega com indicação "Encaminhado de [grupo]"
- **Copiar link da mensagem:** gerar link direto para a mensagem específica no histórico

**Busca global:**
- Busca unificada em mensagens, grupos, arquivos e base de conhecimento
- Filtros: tipo (mensagem/arquivo/tarefa), remetente, grupo, intervalo de datas
- Resultados em tempo real (debounce 300ms)
- Destacar termo buscado no resultado
- Navegar diretamente para a mensagem no histórico ao clicar no resultado

**Notificações:**
- Notificações push no navegador (Web Push API) para mensagens quando a aba não está em foco
- Notificações in-app: sino no header com lista das últimas 50 não lidas
- Configuração por usuário: quais grupos/conversas geram notificação de som/push
- Modo "Não perturbe": silenciar todas por período definido (ex: 1h, até amanhã, indefinido)
- Resumo diário de pendências: mensagem automática no chat às 8h com links para tarefas com prazo hoje e menções não respondidas

---

## PRIORIDADE 2 — GESTÃO DE TAREFAS E KANBAN

### Objetivo
Permitir que equipes do órgão criem, atribuam e acompanhem tarefas diretamente integradas ao chat, sem precisar de ferramenta externa.

### Modelo de dados

```python
# Modelos Django/SQLAlchemy a criar

class Projeto(models.Model):
    nome = models.CharField(max_length=200)
    descricao = models.TextField(blank=True)
    setor = models.ForeignKey(Setor, on_delete=models.CASCADE)
    criado_por = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    cor = models.CharField(max_length=7)  # hex color
    ativo = models.BooleanField(default=True)
    grupo_chat = models.ForeignKey(Grupo, null=True, blank=True)  # grupo vinculado

class Coluna(models.Model):
    projeto = models.ForeignKey(Projeto, on_delete=models.CASCADE)
    nome = models.CharField(max_length=100)  # ex: "A fazer", "Em andamento"
    ordem = models.IntegerField()
    cor = models.CharField(max_length=7, blank=True)
    limite_wip = models.IntegerField(null=True)  # Work In Progress limit

class Tarefa(models.Model):
    PRIORIDADE = [('baixa','Baixa'),('media','Média'),('alta','Alta'),('urgente','Urgente')]
    titulo = models.CharField(max_length=300)
    descricao = models.TextField(blank=True)
    projeto = models.ForeignKey(Projeto, on_delete=models.CASCADE)
    coluna = models.ForeignKey(Coluna, on_delete=models.CASCADE)
    ordem_coluna = models.IntegerField()
    criada_por = models.ForeignKey(Usuario, related_name='tarefas_criadas')
    responsaveis = models.ManyToManyField(Usuario, related_name='tarefas_atribuidas', blank=True)
    prazo = models.DateTimeField(null=True, blank=True)
    prioridade = models.CharField(max_length=10, choices=PRIORIDADE, default='media')
    etiquetas = models.ManyToManyField(Etiqueta, blank=True)
    mensagem_origem = models.ForeignKey(Mensagem, null=True, blank=True)  # criada a partir de mensagem
    criada_em = models.DateTimeField(auto_now_add=True)
    concluida_em = models.DateTimeField(null=True, blank=True)

class ChecklistItem(models.Model):
    tarefa = models.ForeignKey(Tarefa, on_delete=models.CASCADE)
    texto = models.CharField(max_length=300)
    concluido = models.BooleanField(default=False)
    ordem = models.IntegerField()

class ComentarioTarefa(models.Model):
    tarefa = models.ForeignKey(Tarefa, on_delete=models.CASCADE)
    autor = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True)
    texto = models.TextField()
    criado_em = models.DateTimeField(auto_now_add=True)
    editado_em = models.DateTimeField(null=True)

class HistoricoTarefa(models.Model):
    tarefa = models.ForeignKey(Tarefa, on_delete=models.CASCADE)
    usuario = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True)
    campo_alterado = models.CharField(max_length=100)
    valor_anterior = models.TextField(blank=True)
    valor_novo = models.TextField(blank=True)
    alterado_em = models.DateTimeField(auto_now_add=True)
```

### Funcionalidades do Kanban

**Visão Kanban (interface principal):**
- Colunas configuráveis por projeto (criar, renomear, reordenar, excluir)
- Arrastar e soltar cards entre colunas (drag-and-drop com atualização via API)
- Limite de WIP por coluna: exibir aviso visual quando ultrapassado
- Contador de cards por coluna
- Filtros rápidos no topo: responsável, prioridade, etiqueta, prazo

**Card de tarefa:**
- Exibir no card: título, avatar dos responsáveis, prazo (vermelho se vencido), prioridade (badge colorido), progresso do checklist (ex: "3/5"), etiquetas
- Ao clicar: abrir painel lateral com todos os detalhes sem sair do Kanban
- Indicador visual de prioridade: borda esquerda colorida (cinza/amarelo/laranja/vermelho)

**Painel de detalhes da tarefa:**
- Editar título e descrição (rich text: negrito, lista, links, menções)
- Gerenciar responsáveis (adicionar/remover com busca por nome)
- Definir/alterar prazo com datepicker
- Alterar prioridade e coluna
- Checklist: adicionar, marcar, reordenar, excluir itens; barra de progresso automática
- Anexos: upload de arquivos diretamente na tarefa (integra com módulo de arquivos)
- Comentários: adicionar, editar, excluir; suporte a menções (@nome); notificação aos mencionados
- Histórico de alterações: linha do tempo com todas as mudanças e autoria
- Converter tarefa em outra tarefa vinculada (subtarefa / tarefa pai)

**Criar tarefa a partir de mensagem:**
- Botão "Criar tarefa" ao passar o mouse sobre qualquer mensagem no chat
- Pré-preencher título com o texto da mensagem
- Selecionar projeto e coluna destino
- Link de volta para a mensagem original dentro da tarefa

**Outras visões:**
- **Lista:** tabela com ordenação por qualquer coluna; paginação; seleção múltipla para ações em lote (mover, atribuir, excluir)
- **Calendário:** tarefas posicionadas por prazo; arrastar para reagendar; visualização mensal e semanal
- **Minha visão:** apenas tarefas atribuídas ao usuário logado, agrupadas por projeto

**Notificações de tarefas:**
- Atribuído a uma tarefa → notificação imediata no chat (mensagem do sistema) + push
- 24h antes do prazo → lembrete automático para cada responsável
- 1h antes do prazo → segundo lembrete
- Tarefa vencida → alerta diário para responsável e notificação ao gestor do setor
- Tarefa concluída → notificação ao criador da tarefa

**APIs de tarefas:**
```
GET    /api/projetos/                          → listar projetos do usuário
POST   /api/projetos/                          → criar projeto
GET    /api/projetos/{id}/kanban/              → dados completos do kanban (colunas + cards)
POST   /api/projetos/{id}/colunas/             → criar coluna
PATCH  /api/colunas/{id}/                      → renomear / reordenar coluna
GET    /api/tarefas/                           → listar com filtros (responsavel, projeto, status, prazo)
POST   /api/tarefas/                           → criar tarefa
GET    /api/tarefas/{id}/                      → detalhes completos
PATCH  /api/tarefas/{id}/                      → atualizar qualquer campo
POST   /api/tarefas/{id}/mover/                → mover entre colunas (atualiza ordem)
POST   /api/tarefas/{id}/checklist/            → adicionar item ao checklist
PATCH  /api/tarefas/{id}/checklist/{item_id}/  → marcar/desmarcar item
POST   /api/tarefas/{id}/comentarios/          → adicionar comentário
GET    /api/tarefas/{id}/historico/            → histórico de alterações
GET    /api/tarefas/minhas/                    → tarefas do usuário logado
GET    /api/relatorios/tarefas/                → métricas de produtividade
```

**Relatório de produtividade:**
- Tarefas concluídas por período por servidor e por setor
- Tempo médio de conclusão por tipo de tarefa
- Tarefas atrasadas: quantas, por quem, por quanto tempo
- Gráfico de burndown por projeto
- Exportar em PDF e Excel

---

## PRIORIDADE 3 — COMPARTILHAMENTO E GERENCIAMENTO DE ARQUIVOS

### Objetivo
Sistema robusto de compartilhamento de arquivos integrado ao chat, com organização, busca e controle de versão.

### Armazenamento

**Backend de armazenamento:**
- Suporte a armazenamento local (filesystem do servidor) e S3-compatible (MinIO autohospedado recomendado para órgão público)
- Configurar via variável de ambiente `STORAGE_BACKEND=local|minio|s3`
- Organização de pastas: `/arquivos/{ano}/{mes}/{uuid_arquivo}/`
- Nunca expor o caminho real — sempre servir via URL assinada com expiração

**Modelo de dados:**

```python
class Arquivo(models.Model):
    TIPO = [('documento','Documento'),('imagem','Imagem'),('video','Vídeo'),
            ('audio','Áudio'),('planilha','Planilha'),('outro','Outro')]
    nome_original = models.CharField(max_length=500)
    nome_storage = models.CharField(max_length(500))  # nome único no storage
    tamanho = models.BigIntegerField()  # bytes
    tipo_mime = models.CharField(max_length=200)
    tipo = models.CharField(max_length=20, choices=TIPO)
    enviado_por = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True)
    conversa = models.ForeignKey(Conversa, null=True, blank=True)
    tarefa = models.ForeignKey(Tarefa, null=True, blank=True)
    pasta = models.ForeignKey('Pasta', null=True, blank=True)
    versao_de = models.ForeignKey('self', null=True, blank=True)  # versionamento
    numero_versao = models.IntegerField(default=1)
    hash_md5 = models.CharField(max_length=32)  # detectar duplicatas
    enviado_em = models.DateTimeField(auto_now_add=True)
    excluido_em = models.DateTimeField(null=True)

class Pasta(models.Model):
    nome = models.CharField(max_length=200)
    setor = models.ForeignKey(Setor, null=True, blank=True)
    pasta_pai = models.ForeignKey('self', null=True, blank=True)  # hierarquia
    criada_por = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True)
    publica = models.BooleanField(default=False)
    criada_em = models.DateTimeField(auto_now_add=True)
```

### Funcionalidades

**Envio de arquivos no chat:**
- Upload por arrastar e soltar (drag-and-drop) na área de mensagem
- Múltiplos arquivos simultaneamente (até 10 por vez)
- Barra de progresso por arquivo durante upload
- Preview antes de enviar: miniatura para imagens, ícone para outros tipos
- Limite de tamanho configurável por tipo (padrão: imagens 10MB, documentos 50MB, vídeos 500MB)
- Formatos aceitos: configurável pelo administrador (padrão: todos os comuns)
- Cancelar upload em andamento

**Visualização inline no chat:**
- Imagens: exibir miniatura diretamente na mensagem; clicar abre lightbox em tela cheia com navegação entre imagens do histórico
- PDF: botão "Visualizar" abre leitor de PDF integrado (PDF.js) sem sair do chat
- Vídeos: player inline com controles básicos
- Áudios: player compacto inline
- Outros: ícone do tipo de arquivo + nome + tamanho + botão download

**Galeria de mídia por conversa/grupo:**
- Aba separada na conversa: "Arquivos" / "Imagens" / "Links"
- Filtro por tipo, remetente e data
- Grid de miniaturas para imagens
- Lista para documentos com metadados
- Download individual ou seleção múltipla para download em ZIP

**Gerenciador de arquivos (área separada):**
- Visão de pastas por setor (estrutura hierárquica similar a um explorador de arquivos)
- Upload direto ao gerenciador sem precisar estar em uma conversa
- Criar, renomear, mover e excluir pastas
- Mover arquivos entre pastas
- Permissões por pasta: pública para todos / restrita a setores específicos / privada
- Busca por nome de arquivo em todo o repositório com filtros

**Controle de versão:**
- Ao enviar arquivo com mesmo nome numa pasta, perguntar: "Criar nova versão ou substituir?"
- Se nova versão: manter histórico de todas as versões com autor e data
- Visualizar e baixar versões anteriores
- Restaurar versão anterior como versão atual

**Detecção de duplicatas:**
- Calcular hash MD5 no upload; se já existir, alertar "Arquivo idêntico já enviado por [nome] em [data]. Deseja continuar?"

**APIs de arquivos:**
```
POST   /api/arquivos/upload/              → upload (multipart/form-data)
GET    /api/arquivos/{id}/download/       → download com URL assinada
GET    /api/arquivos/{id}/preview/        → URL de preview
DELETE /api/arquivos/{id}/                → exclusão lógica
GET    /api/conversas/{id}/arquivos/      → arquivos de uma conversa com filtros
GET    /api/pastas/                       → listar estrutura de pastas do setor
POST   /api/pastas/                       → criar pasta
GET    /api/pastas/{id}/arquivos/         → arquivos dentro da pasta
POST   /api/arquivos/{id}/nova-versao/    → enviar nova versão
GET    /api/arquivos/{id}/versoes/        → listar versões do arquivo
GET    /api/arquivos/buscar/?q=termo      → busca global de arquivos
```

---

## PRIORIDADE 4 — VIDEOCONFERÊNCIA (GOOGLE MEET / MICROSOFT TEAMS)

### Objetivo
Permitir iniciar reuniões via Google Meet ou Microsoft Teams diretamente do chat, com agendamento integrado ao Google Calendar / Outlook e notificações automáticas.

### Abordagem de integração

**Não implementar videoconferência nativa** — integrar via APIs oficiais do Google e Microsoft. O sistema gera e distribui os links de reunião; a reunião em si ocorre na plataforma escolhida.

O administrador configura qual plataforma usar (Google Meet ou Teams) no painel de administração. O sistema suporta ambas simultaneamente — usuário escolhe ao criar a reunião.

### Configuração OAuth2

**Google (Meet + Calendar):**
```python
# Configurar no painel admin
GOOGLE_CLIENT_ID = "..."
GOOGLE_CLIENT_SECRET = "..."
GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly"
]
# Cada usuário autoriza uma vez; tokens armazenados por usuário
```

**Microsoft (Teams + Outlook):**
```python
MICROSOFT_CLIENT_ID = "..."
MICROSOFT_TENANT_ID = "..."
MICROSOFT_CLIENT_SECRET = "..."
MICROSOFT_SCOPES = [
    "Calendars.ReadWrite",
    "OnlineMeetings.ReadWrite"
]
```

### Modelo de dados

```python
class Reuniao(models.Model):
    PLATAFORMA = [('google_meet','Google Meet'),('teams','Microsoft Teams')]
    STATUS = [('agendada','Agendada'),('em_andamento','Em andamento'),
              ('encerrada','Encerrada'),('cancelada','Cancelada')]
    titulo = models.CharField(max_length(300))
    pauta = models.TextField(blank=True)
    organizador = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True)
    participantes = models.ManyToManyField(Usuario, related_name='reunioes')
    conversa_origem = models.ForeignKey(Conversa, null=True, blank=True)
    plataforma = models.CharField(max_length=20, choices=PLATAFORMA)
    link_reuniao = models.URLField()
    id_evento_externo = models.CharField(max_length(500))  # ID no Google/Teams
    inicio = models.DateTimeField()
    fim = models.DateTimeField()
    status = models.CharField(max_length=20, choices=STATUS, default='agendada')
    gravacao_url = models.URLField(blank=True)  # se gravação disponível externamente
    criada_em = models.DateTimeField(auto_now_add=True)
```

### Funcionalidades

**Criar reunião imediata ("Reunião agora"):**
- Botão no chat individual ou grupo: "Iniciar reunião"
- Selecionar plataforma (Google Meet ou Teams)
- Sistema cria a reunião via API e obtém o link
- Envia mensagem no chat com o link e botão "Entrar na reunião"
- Todos os membros do grupo recebem notificação push

**Agendar reunião:**
- Formulário: título, pauta, data/hora início e fim, participantes (busca por nome), plataforma
- Criar evento no Google Calendar ou Outlook dos participantes via API
- Incluir link da videoconferência no evento do calendário
- Salvar no banco e exibir na conversa como card de reunião agendada

**Card de reunião no chat:**
- Exibir: título, data/hora, participantes (avatares), plataforma (ícone), link
- Status visual: "Agendada" (azul) / "Acontecendo agora" (verde pulsante) / "Encerrada" (cinza)
- Botão "Entrar" que abre o link da reunião
- Botão "Adicionar ao meu calendário" para quem não foi incluído originalmente

**Lembretes automáticos:**
- 24h antes: notificação no chat e push para todos os participantes
- 15 minutos antes: segundo lembrete
- No horário de início: alerta "Sua reunião está começando agora" com botão direto

**Calendário de reuniões:**
- Visão mensal/semanal com todas as reuniões do usuário
- Integração bidirecional: reuniões criadas no Google Calendar ou Outlook aparecem aqui também
- Clicar na reunião abre os detalhes e o link

**Cancelar/reagendar reunião:**
- Ao cancelar: atualizar evento no Google/Teams, notificar participantes no chat e por e-mail
- Ao reagendar: selecionar nova data, atualizar em todas as plataformas, notificar no chat

**APIs de reuniões:**
```
POST /api/reunioes/                        → criar reunião (imediata ou agendada)
GET  /api/reunioes/                        → listar reuniões do usuário (com filtros)
GET  /api/reunioes/{id}/                   → detalhes
PATCH /api/reunioes/{id}/                  → reagendar / editar
DELETE /api/reunioes/{id}/                 → cancelar (propaga ao Google/Teams)
POST /api/reunioes/{id}/participantes/     → adicionar participante
GET  /api/auth/google/callback/            → OAuth2 callback Google
GET  /api/auth/microsoft/callback/         → OAuth2 callback Microsoft
GET  /api/calendario/                      → eventos do usuário (chat + externos)
```

---

## FUNCIONALIDADES COMPLEMENTARES (implementar junto, sem prioridade específica)

### Calendário corporativo interno

- Calendário compartilhado por setor, independente do Google/Outlook
- Criar eventos: título, local, horário, participantes do sistema, descrição, recorrência (diária/semanal/mensal)
- Feriados nacionais e municipais pré-carregados (atualizar via arquivo iCal ou API IBGE)
- Prazos institucionais configuráveis pelo administrador: licitações, prestações de contas, orçamento
- Solicitação de ausência/férias: servidor submete → gestor aprova/nega → notificação de resultado no chat

### Base de conhecimento (Wiki interna)

- Editor rich text para criar artigos (TipTap ou Quill — escolher compatível com o frontend)
- Organização em categorias e subcategorias editáveis
- Controle de versão: histórico completo de edições com autor e diff visual
- Permissões por artigo: todos os servidores / apenas setores específicos
- Busca integrada à busca global do chat
- Templates de documentos oficiais: ofício, memorando, ata (pré-formatados e editáveis)
- Marcar artigos como "Leitura obrigatória" para novos servidores de um setor

### Notificações e configurações do usuário

**Central de notificações:**
- Sino no header com todas as notificações agrupadas por tipo
- Marcar como lida individualmente ou "marcar todas como lidas"
- Filtrar por tipo: mensagens, tarefas, reuniões, arquivos, sistema
- Histórico das últimas 200 notificações

**Configurações de notificação por usuário:**
- Por conversa/grupo: ativar tudo / só menções / silenciar
- Notificações push: ativar/desativar por tipo
- Horário de silêncio: não perturbar de X às Y (diariamente)
- Som de notificação: escolher entre opções ou desativar
- Resumo por e-mail: diário / semanal / nunca

---

## PAINEL ADMINISTRATIVO (EVOLUÇÕES)

Adicionar ao painel já existente:

**Gestão de projetos e tarefas:**
- Criar/arquivar projetos vinculados a setores
- Visualizar produtividade de todos os servidores
- Relatório de tarefas atrasadas por setor

**Gestão de armazenamento:**
- Espaço total usado vs. disponível
- Top arquivos maiores
- Configurar limites de upload por perfil de usuário
- Limpeza: listar arquivos sem referência / excluídos há mais de X dias

**Integração Google/Microsoft:**
- Status da integração (autenticada / expirada / não configurada)
- Configurar Client ID e Secret
- Ver quais usuários autorizaram a integração
- Revogar tokens de usuário específico

**Relatórios gerenciais:**
- Mensagens enviadas por setor e período (volume de comunicação)
- Usuários mais e menos ativos
- Arquivos mais compartilhados
- Reuniões por setor: quantidade, duração média, participação
- Exportar todos os relatórios em PDF e Excel

---

## REQUISITOS TÉCNICOS ESPECÍFICOS (Python/Django-FastAPI)

### Django Channels (WebSocket)

```python
# settings.py
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [("redis", 6379)]}
    }
}

# consumers.py — estrutura base do consumer de chat
class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        # Adicionar ao group pessoal (notificações) e às conversas ativas
        await self.channel_layer.group_add(f"user_{self.user.id}", self.channel_name)
        await self.accept()
        await self.send_presence_update("online")

    async def disconnect(self, code):
        await self.send_presence_update("offline")

    async def receive_json(self, content):
        event_type = content.get("type")
        handlers = {
            "message.send": self.handle_send,
            "message.typing": self.handle_typing,
            "message.read": self.handle_read,
            "user.status": self.handle_status,
        }
        handler = handlers.get(event_type)
        if handler:
            await handler(content)
```

### Celery (tarefas assíncronas)

```python
# tasks.py — tarefas que rodam em background

@shared_task
def enviar_lembretes_reuniao():
    # Rodar a cada 5 minutos via Celery Beat
    # Verificar reuniões que começam em 15 min ou 24h
    pass

@shared_task
def enviar_alertas_tarefas_vencidas():
    # Rodar diariamente às 8h
    # Verificar tarefas com prazo vencido e notificar responsáveis
    pass

@shared_task
def processar_upload_arquivo(arquivo_id):
    # Processar em background: gerar thumbnail, extrair metadados, calcular hash
    pass

@shared_task
def enviar_resumo_diario():
    # Rodar às 8h para cada usuário ativo
    # Compilar: tarefas com prazo hoje, menções não respondidas, reuniões do dia
    pass
```

### Dependências a adicionar ao projeto

```
# requirements.txt — adicionar às existentes
channels==4.0.0
channels-redis==4.1.0
celery==5.3.0
django-celery-beat==2.5.0
redis==5.0.0
boto3==1.34.0          # para MinIO/S3
Pillow==10.0.0         # processamento de imagens / thumbnails
python-magic==0.4.27   # detecção de tipo de arquivo
google-auth==2.23.0    # OAuth2 Google
google-api-python-client==2.100.0
msal==1.24.0           # OAuth2 Microsoft (MSAL)
cryptography==41.0.0   # URLs assinadas para arquivos
django-storages==1.14  # abstração de storage (local/S3/MinIO)
```

### Variáveis de ambiente necessárias

```env
# Redis
REDIS_URL=redis://localhost:6379/0

# Storage
STORAGE_BACKEND=minio  # local | minio | s3
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET=chat-arquivos

# Google
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://sistema.orgao.gov.br/api/auth/google/callback/

# Microsoft
MICROSOFT_CLIENT_ID=...
MICROSOFT_TENANT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_REDIRECT_URI=https://sistema.orgao.gov.br/api/auth/microsoft/callback/

# Celery
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2

# Limites de upload
MAX_UPLOAD_SIZE_MB=50
MAX_IMAGE_SIZE_MB=10
MAX_VIDEO_SIZE_MB=500
```

---

## ORDEM DE IMPLEMENTAÇÃO

Siga esta sequência para não quebrar o que já existe e entregar valor a cada etapa:

**Etapa 1 — WebSocket e presença (base para tudo):**
1. Configurar Django Channels + Redis
2. Implementar ChatConsumer com autenticação via token
3. Adicionar eventos: `message.new`, `user.presence`, `message.typing`, `message.read`
4. Evoluir grupos: tipos (canal/privado/público), múltiplos admins, arquivar
5. Recursos de mensagem: thread, reações, menções, fixar, editar, excluir, encaminhar
6. Busca global com filtros
7. Notificações push (Web Push API) e in-app

**Etapa 2 — Arquivos:**
8. Configurar storage (MinIO ou local)
9. Endpoint de upload com progresso
10. Visualização inline (imagens, PDF.js, vídeo/áudio)
11. Galeria de mídia por conversa
12. Gerenciador de arquivos com pastas e permissões
13. Controle de versão e detecção de duplicatas

**Etapa 3 — Tarefas e Kanban:**
14. Modelos: Projeto, Coluna, Tarefa, Checklist, Comentário, Histórico
15. APIs REST completas de tarefas
16. Interface Kanban com drag-and-drop
17. Visões: Lista, Calendário, Minha visão
18. "Criar tarefa desta mensagem" no chat
19. Notificações automáticas de tarefas via Celery

**Etapa 4 — Reuniões:**
20. OAuth2 Google e Microsoft (fluxo de autorização por usuário)
21. Criar reunião imediata (Google Meet e Teams)
22. Criar reunião agendada com evento no calendário
23. Card de reunião no chat com status em tempo real
24. Lembretes automáticos via Celery Beat
25. Cancelamento/reagendamento com propagação às plataformas externas

**Etapa 5 — Complementares:**
26. Base de conhecimento (wiki) com editor rich text
27. Calendário corporativo interno
28. Configurações de notificação por usuário
29. Evoluções do painel administrativo
30. Relatórios gerenciais e exportação

---

## NOTAS FINAIS PARA A IA IMPLEMENTADORA

- **Não reimplemente o que já existe:** autenticação, login, cadastro de usuários, mensagens individuais básicas e grupos básicos estão prontos — integre as evoluções sobre essa base
- **WebSocket é a fundação:** implemente o Django Channels antes de tudo; as notificações de tarefas e reuniões também usarão esse canal
- **Arquivos em background:** nunca processar upload de forma síncrona na requisição; sempre usar Celery para thumbnails, hash e metadados
- **OAuth2 por usuário:** cada servidor do órgão precisa autorizar individualmente o acesso ao Google/Teams; nunca usar credencial global de serviço para criar eventos em nome dos usuários
- **Permissões no storage:** nunca expor URL direta dos arquivos; sempre gerar URL assinada com expiração de no máximo 1 hora
- **Dados no servidor:** o órgão público não pode ter dados em nuvem externa sem contrato específico — MinIO autohospedado é obrigatório para arquivos; Google/Teams são usados apenas para o link da videochamada
- **Auditoria:** qualquer ação relevante (envio de arquivo, criação/conclusão de tarefa, início de reunião, edição/exclusão de mensagem) deve gerar registro no log de auditoria existente
- **Progressividade:** cada etapa deve entregar funcionalidade completa e testável — não deixar APIs pela metade ou frontend sem backend
- Ao finalizar cada etapa, atualizar a documentação da API (Swagger/OpenAPI) com os novos endpoints
