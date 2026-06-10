# Projeto: Módulo **GovOuve** — Avaliação & Ouvidoria

> Novo módulo do ecossistema de gestão municipal. Atende **todas as secretarias** da prefeitura, com **modelos de avaliação modulares** e **ouvidoria completa em conformidade com a Lei 13.460/2017, a LAI (Lei 12.527/2011) e a LGPD (Lei 13.709/2018)**.
> Acesso via navegador (tablet em cada secretaria) + **site público por subdomínio** (`saude.govsistem.com.br`, `educacao.govsistem.com.br`, …).
>
> *"GovOuve" é o codinome de trabalho, alinhado à família DOE / GovTask / ChatGov / SaaS. Ajuste livremente.*

---

## 1. Visão geral

O GovOuve é um módulo do sistema de gestão existente, construído sobre a mesma stack e infraestrutura compartilhada (PostgreSQL, Redis, MinIO). Ele entrega duas capacidades que se cruzam:

1. **Avaliação modular** — o gestor cria modelos de pesquisa (nota 0–10, "bom/regular/ruim", NPS, estrelas, etc.), publica como formulário público de uma secretaria, e coleta respostas pelo tablet em modo quiosque ou pela web.
2. **Ouvidoria completa** — recepção de manifestações (reclamação, denúncia, sugestão, elogio, solicitação) e pedidos de acesso à informação (LAI), com protocolo, tramitação, prazos legais automatizados, sigilo, anonimato e acompanhamento público.

O cidadão acessa o subdomínio da secretaria e escolhe: **Avaliar** ou **Ouvidoria**.

O **cadastro/autenticação SaaS e o multi-tenant são reaproveitados do `saas-platform`** — o GovOuve não reimplementa contas, billing ou resolução de tenant; ele consome esse contexto e adiciona o conceito de **Secretaria** como unidade dentro do tenant.

---

## 2. Objetivos e escopo

### 2.1 Em escopo
- Construtor de modelos de avaliação (perguntas tipadas, escalas configuráveis, versionamento).
- Publicação de formulários públicos por secretaria + QR Code + modo quiosque (tablet).
- Coleta de respostas anônimas ou identificadas; cálculo de indicadores (NPS, satisfação média).
- Ouvidoria com os 5 tipos de manifestação + pedido de acesso à informação.
- Geração de protocolo + comprovante de recebimento (exigência do art. 12 da Lei 13.460).
- Tramitação interna (triagem → análise → encaminhamento → resposta → conclusão).
- Prazos legais automatizados (30+30 dias; LAI 20+10) com alertas e relatório de SLA.
- Anonimato, sigilo de denúncia e proteção de dados (LGPD).
- Acompanhamento público da manifestação por protocolo + chave de acesso.
- Carta de Serviços ao Usuário por secretaria (art. 7).
- Painéis e relatórios por secretaria e consolidados (ouvidoria-geral).
- Site público responsivo por subdomínio.

### 2.2 Fora de escopo (nesta entrega)
- Autenticação/billing SaaS (vem do `saas-platform`).
- Gestão de processos administrativos completos (fica no GovTask).
- Assinatura digital de documentos (fica no DOE Signer).

---

## 3. Arquitetura

Mantém o padrão dos demais módulos: API FastAPI async + dois frontends Next.js (admin e público) + workers Celery, atrás do Nginx, sobre infra compartilhada.

```
                              Internet
                                 │
                    ┌────────────┴────────────┐
                    │   Nginx (80/443)         │
                    │  *.govsistem.com.br      │  ← wildcard TLS
                    └────────────┬─────────────┘
            ┌────────────────────┼────────────────────┐
            │                    │                     │
   admin.govsistem      saude/educacao/...      api.govsistem
   (Web Admin Next)     (Web Público Next)      (GovOuve API)
            │                    │                     │
            └────────────────────┴─────────┬───────────┘
                                            │
                              ┌─────────────┴──────────────┐
                              │      GovOuve API (FastAPI)  │
                              │   async + SQLAlchemy 2.0    │
                              └──────┬───────────┬──────────┘
                                     │           │
                          ┌──────────┘           └──────────┐
                          │                                 │
                    Celery Worker  ◄── Redis (broker) ──►  Celery Beat
                    (notificações,      (DB dedicada)      (varredura de
                     SLA, relatórios,                       prazos / SLA)
                     anonimização)
                          │
        ┌─────────────────┼─────────────────────────────────┐
        │                 │                                  │
  PostgreSQL 16      Redis 7 (cache +              MinIO (bucket dedicado
  (DB govouve)        broker, DB index             govouve, anexos LGPD)
                      dedicado)
```

### 3.1 Componentes e tecnologias (idênticos à stack atual)
| Componente | Tecnologia |
|---|---|
| API | Python 3.12 + FastAPI (async) + SQLAlchemy 2.0 async (asyncpg) + Pydantic v2 |
| Migrações | Alembic |
| Workers / agendamento | Celery + Celery Beat (broker e backend no Redis) |
| Web Admin | TypeScript + Next.js 14 (App Router) + React 18 + Tailwind 3 |
| Web Público | TypeScript + Next.js 14 (App Router) + React 18 + Tailwind 3 (PWA p/ quiosque) |
| Banco | PostgreSQL 16 (database/schema dedicado, **não** misturar tabelas com outros módulos) |
| Cache/Broker | Redis 7 (índice de DB dedicado, ex.: `REDIS_DB=3`) |
| Storage | MinIO (bucket dedicado `govouve`) |
| Infra | Docker Compose + Nginx (proxy reverso, wildcard de subdomínio) |

---

## 4. Multi-tenancy e roteamento por subdomínio

### 4.1 Modelo de tenancy
- **Reaproveita o padrão do `saas-platform`**: o tenant (prefeitura/cliente) e o usuário autenticado já chegam resolvidos. O GovOuve apenas valida o token/contexto emitido pelo SaaS e mantém **isolamento por `tenant_id`** em todas as tabelas (mesma estratégia que o SaaS já usa).
- Adiciona a entidade **Secretaria**, sempre escopada a um `tenant_id`. Cada secretaria tem um **slug** (`saude`, `educacao`, `obras`…) que mapeia para o subdomínio.
- Toda query é filtrada por `tenant_id` (e por `secretaria_id` quando aplicável) via dependência/sessão que injeta o contexto — nunca confiar em parâmetro vindo do cliente para o escopo.

### 4.2 Resolução por subdomínio
- O **público** identifica a secretaria pelo **subdomínio**: `saude.govsistem.com.br` → resolve `secretaria.slug = "saude"` dentro do tenant correspondente ao domínio raiz.
- Nginx usa **certificado wildcard** (`*.govsistem.com.br`) e repassa o `Host` original. Um **middleware na API** extrai o subdomínio do header `Host`/`X-Forwarded-Host` e injeta `secretaria` no contexto da requisição pública.
- O **admin** fica em host fixo (`admin.govsistem.com.br`), com seleção de secretaria pela interface (respeitando as permissões do usuário).
- Subdomínios reservados que **não** são secretarias: `admin`, `api`, `www`, `static` (lista de bloqueio no resolver).

---

## 5. Módulo de Avaliação (modular)

### 5.1 Conceitos
- **Modelo de Avaliação** (*template*) — conjunto versionado de perguntas tipadas. Reutilizável entre secretarias ou exclusivo de uma.
- **Pergunta** — unidade tipada do modelo, com configuração própria (escala, rótulos, opções).
- **Formulário publicado** (*campanha*) — instância de um modelo publicada por uma secretaria, com URL/QR próprios, janela de vigência e canal (quiosque / web / QR).
- **Resposta** — submissão de um respondente; **anônima por padrão** (quiosque), com contato opcional.

### 5.2 Tipos de pergunta suportados (modulares)
| Tipo | Exemplo | Config |
|---|---|---|
| `escala_numerica` | Nota de 0 a 10 | min, max, passo, rótulos das pontas |
| `escala_qualitativa` | Ótimo / Bom / Regular / Ruim / Péssimo | lista ordenada de rótulos + peso |
| `nps` | 0–10 com cálculo de promotores/detratores | — |
| `estrelas` | 1–5 estrelas | quantidade de estrelas |
| `sim_nao` | Você foi bem atendido? | rótulos de sim/não |
| `multipla_escolha` | Qual serviço você usou? | opções, único/múltiplo |
| `texto_livre` | Comentários | limite de caracteres |
| `emoji` | 😡 😐 🙂 (rápido p/ quiosque) | mapa emoji→valor |

O sistema é **extensível**: novos tipos de pergunta são registrados por um *enum* + *handler* de validação/cálculo, sem alterar o esquema das respostas (valor numérico / texto / opção armazenados de forma genérica).

### 5.3 Indicadores calculados
NPS, média de satisfação, distribuição por opção, taxa de resposta por canal, evolução temporal, comparativo entre secretarias (visão consolidada da ouvidoria-geral).

### 5.4 Quiosque (tablet)
- PWA em tela cheia, **auto-reset** após envio, **timeout de inatividade**, fonte/contraste ampliados.
- Acessibilidade obrigatória (setor público): conformidade **eMAG/WCAG 2.1 AA** e atenção à **Lei Brasileira de Inclusão (Lei 13.146/2015)**.
- Resiliência: fila local (IndexedDB) com reenvio quando a conexão voltar.

---

## 6. Módulo de Ouvidoria (Lei 13.460/2017 + LAI + LGPD)

### 6.1 Tipos de manifestação
Os **cinco tipos** previstos na Lei 13.460/2017 — **denúncia, reclamação, solicitação, elogio e sugestão** — mais **pedido de acesso à informação** (tratado pela LAI, com prazo distinto).

### 6.2 Prazos legais (automatizados)
| Tipo | Prazo base | Prorrogação | Base legal |
|---|---|---|---|
| Reclamação, denúncia, solicitação, elogio, sugestão | **30 dias** | + 30 dias, mediante justificativa | Lei 13.460/2017, art. 16 |
| Pedido de acesso à informação | **20 dias** | + 10 dias, mediante justificativa | Lei 12.527/2011, art. 11 |
| Solicitação de subsídio interno (ouvidoria → área técnica) | **20 dias** | + 20 dias, justificada | Lei 13.460/2017, art. 16, §  |

- A `data_limite` é **calculada automaticamente** na recepção, a partir do tipo. A prorrogação exige **justificativa registrada** e recalcula a data.
- O Celery Beat varre diariamente as manifestações e dispara alertas (ex.: D-5, D-2, vencida) para atendentes e gestores; gera o relatório de cumprimento de prazo (SLA).

### 6.3 Ciclo de vida (workflow)
```
recebida → em_triagem → em_analise → (encaminhada) → respondida → concluida
                 │                          │
                 └──► aguardando_complementacao (pede dados ao cidadão)
                 └──► arquivada / reaberta
```
Eventos de resolução efetiva exigidos pelo art. 12 da Lei 13.460: recepção, **emissão de comprovante de recebimento** (protocolo), análise/obtenção de informações, **decisão administrativa** e **ciência ao usuário**.

### 6.4 Protocolo e comprovante
- Protocolo único e rastreável (ex.: `SAUDE-2026-000123` ou padrão numérico sequencial por secretaria/ano).
- **Comprovante de recebimento** gerado no ato (PDF/tela), com protocolo + **chave de acesso** para acompanhamento público anônimo.

### 6.5 Anonimato e sigilo
- **Anônima**: nenhum dado identificável é exigido; acompanhamento só por protocolo + chave.
- **Identificada**: dados pessoais coletados com **base legal e consentimento** registrados (LGPD).
- **Denúncia sigilosa**: identidade do denunciante protegida; acesso restrito por papel; trilha de auditoria reforçada.

### 6.6 Anexos
Suporte a anexos (documento, imagem, planilha, PDF, áudio, vídeo) no MinIO. Adotar limites de referência da plataforma federal: **até 10 anexos por manifestação, soma ≤ 30 MB** (configurável por secretaria). Validação de tipo/MIME e varredura antivírus opcional.

### 6.7 Resposta e avaliação da resposta
- Resposta conclusiva publicada ao cidadão (e por e-mail, se identificado).
- O cidadão pode **avaliar a resposta da ouvidoria** — alimentando os indicadores de satisfação (ponte com o módulo de Avaliação).

### 6.8 Carta de Serviços ao Usuário
Cada secretaria mantém sua **Carta de Serviços** (art. 7): serviços oferecidos, requisitos, prazos, canais, taxas e compromissos — publicada no site público.

---

## 7. Site público + acompanhamento

Por subdomínio da secretaria:
- **Home** com escolha **Avaliar | Ouvidoria**.
- Fluxo de **avaliação** (formulário publicado / QR / quiosque).
- Fluxo de **ouvidoria** (registro de manifestação, escolha de tipo, anonimato/identificação, anexos, consentimento LGPD).
- **Consulta de protocolo** (protocolo + chave de acesso) com linha do tempo da tramitação.
- **Carta de Serviços**.
- (Opcional) **Painel de transparência** com indicadores agregados públicos.

---

## 8. Modelo de dados (entidades principais — conceitual, sem DDL)

> Todas as tabelas carregam `tenant_id`; as de domínio carregam também `secretaria_id`. Timestamps `created_at`/`updated_at` e *soft delete* onde fizer sentido.

**Tenancy / organização**
- `secretaria` — `tenant_id`, `slug` (subdomínio), `nome`, `cnpj?`, `ativo`, `config` (json: branding, limites, prazos custom), `ouvidor_responsavel`.
- `assunto` — categorização hierárquica (`parent_id`) por secretaria, para classificar manifestações.

**Avaliação**
- `avaliacao_modelo` — `nome`, `descricao`, `versao`, `ativo`, escopo (global/secretaria).
- `avaliacao_pergunta` — `modelo_id`, `ordem`, `enunciado`, `tipo`, `obrigatoria`, `config` (json).
- `avaliacao_formulario` — `modelo_id`, `secretaria_id`, `slug`, `titulo_publico`, `canal`, `vigencia_inicio/fim`, `ativo`.
- `avaliacao_resposta` — `formulario_id`, `canal`, `anonimo`, `contato` (json opcional), `device_meta`, `ip_hash`.
- `avaliacao_resposta_item` — `resposta_id`, `pergunta_id`, `valor_numerico?`, `valor_texto?`, `valor_opcao?`.

**Ouvidoria**
- `manifestacao` — `protocolo`, `tipo`, `assunto_id`, `descricao`, `status`, `canal`, `anonimo`, `sigiloso`, `identificacao` (json pseudonimizável), `base_legal_lgpd`, `consentimento_id?`, `data_recebimento`, `data_limite`, `data_limite_prorrogada?`, `data_conclusao?`.
- `manifestacao_anexo` — `manifestacao_id`, `arquivo_key` (MinIO), `nome`, `tamanho`, `mime`.
- `manifestacao_tramitacao` — histórico: `de_status`, `para_status`, `ator_id`, `observacao`, `interno` (bool), `criado_em`.
- `manifestacao_encaminhamento` — `secretaria_destino_id`, `motivo`, `prazo_subsidio`.
- `manifestacao_resposta` — `texto`, `conclusiva` (bool), `ator_id`, `publicada_em`.
- `manifestacao_avaliacao_resposta` — `nota`, `comentario` (cidadão avalia o atendimento).
- `acesso_publico` — `protocolo`, `chave_hash` (acompanhamento anônimo).

**Conformidade / suporte**
- `carta_servico` — por secretaria.
- `consentimento_lgpd` — base legal, finalidade, data, versão do termo.
- `audit_log` — `ator_id`, `acao`, `entidade`, `entidade_id`, `ip_hash`, `dados` (json).
- `notificacao` — `canal` (email/…), `template`, `status`, `manifestacao_id?`.

---

## 9. Superfície de API (descritiva — rotas, não implementação)

**Públicas (sem login, escopo por subdomínio)**
| Método | Rota | Descrição |
|---|---|---|
| GET | `/public/secretaria` | Dados da secretaria do subdomínio (branding, opções) |
| GET | `/public/formularios/{slug}` | Formulário de avaliação publicado |
| POST | `/public/avaliacoes` | Submete resposta de avaliação |
| GET | `/public/ouvidoria/tipos` | Tipos de manifestação e prazos |
| POST | `/public/ouvidoria/manifestacoes` | Registra manifestação (retorna protocolo + chave) |
| GET | `/public/ouvidoria/acompanhar` | Consulta por protocolo + chave |
| POST | `/public/ouvidoria/{protocolo}/avaliar` | Avalia a resposta recebida |
| GET | `/public/carta-servicos` | Carta de Serviços da secretaria |

**Administrativas (autenticadas via SaaS, RBAC)**
| Área | Rotas (exemplos) |
|---|---|
| Modelos | `CRUD /admin/modelos`, `/admin/modelos/{id}/perguntas`, `/versoes` |
| Formulários | `CRUD /admin/formularios`, `publicar/despublicar`, `/qrcode` |
| Manifestações | `GET/list + filtros`, `/triagem`, `/encaminhar`, `/responder`, `/prorrogar`, `/concluir`, `/reabrir` |
| Indicadores | `/admin/dashboards/avaliacao`, `/admin/dashboards/ouvidoria`, `/admin/relatorios/sla` |
| Carta/Config | `CRUD /admin/carta-servicos`, `/admin/secretarias/{id}/config` |
| LGPD | `/admin/lgpd/solicitacoes`, `/admin/lgpd/anonimizar/{id}`, `/admin/auditoria` |

Todas as respostas paginadas, com filtros por período/tipo/status/secretaria; *rate limiting* nas rotas públicas.

---

## 10. Perfis e permissões (RBAC)
| Perfil | Capacidades |
|---|---|
| **Cidadão** (público) | Avaliar, registrar manifestação, acompanhar por protocolo |
| **Atendente** (secretaria) | Triar, analisar, responder manifestações da sua secretaria |
| **Gestor de Secretaria** | Tudo do atendente + criar modelos/formulários, ver indicadores da secretaria, prorrogar prazos |
| **Ouvidor-Geral** | Visão consolidada de todas as secretarias, redistribuição, relatórios globais |
| **Administrador** | Configuração de secretarias, papéis, integrações, LGPD/auditoria |

Papéis e identidade vêm do `saas-platform`; o GovOuve mapeia esses papéis para permissões internas e sempre filtra por `tenant_id`/`secretaria_id`.

---

## 11. Conformidade legal (resumo de requisitos)
- **Lei 13.460/2017** — 5 tipos de manifestação; comprovante de recebimento; prazo 30+30; Carta de Serviços; canais acessíveis; não recusar manifestação (art. 11).
- **LAI (Lei 12.527/2011)** — pedido de acesso à informação 20+10; proteção de informação pessoal.
- **LGPD (Lei 13.709/2018)** — base legal e finalidade explícitas; minimização; consentimento quando aplicável; direitos do titular (acesso, correção, eliminação, observada a retenção legal da ouvidoria); registro de tratamento; trilha de auditoria; pseudonimização/anonimização; contato do Encarregado (DPO).
- **eMAG/WCAG 2.1 AA + LBI (Lei 13.146/2015)** — acessibilidade do público e do quiosque.
- **Norma municipal** — a Lei 13.460 exige que o município edite Lei/Decreto definindo competências, escolha do ouvidor e estrutura; o sistema deve ser configurável para refletir essa norma (prazos custom, fluxo, papéis).

> *Observação:* este resumo orienta o desenho do sistema, não substitui validação jurídica. A configuração de prazos/fluxos deve poder ser ajustada pela norma local.

---

## 12. Jobs assíncronos (Celery)
- **Beat diário** — varredura de prazos: marca vencidas, dispara alertas D-5/D-2/vencida.
- **Notificações** — e-mail de recebimento, atualização de status e resposta conclusiva (fila).
- **Relatórios** — geração assíncrona de SLA e indicadores (PDF/CSV) com download via MinIO.
- **Anonimização** — rotina de pseudonimização/eliminação conforme retenção e pedidos LGPD.
- **Indexação/agregação** — pré-cálculo de indicadores para os dashboards.

---

## 13. Alocação de portas (sem colisão com o existente)

> Reaproveita a infra compartilhada (Postgres `15433`, Redis `6380`, MinIO `9100/9101`). Só precisa de **portas novas para API e frontends**. Container interno segue a convenção fixa (API `8000`, Next.js `3000`).

| Serviço (GovOuve) | Porta host (nova) | Porta container | Observação |
|---|---|---|---|
| GovOuve API (FastAPI) | **8201** | 8000 | Bloco `82xx` livre |
| GovOuve Web Admin (Next.js) | **7401** | 3000 | Bloco `74xx` livre |
| GovOuve Web Público (Next.js) | **7400** | 3000 | — |
| GovOuve Flower (monitor Celery, opcional) | **8202** | 5555 | — |
| GovOuve Worker / Beat | — | — | Sem porta exposta |

Infra compartilhada (sem novas portas): **PostgreSQL** `15433` (database `govouve` dedicada), **Redis** `6380` (índice de DB dedicado, ex.: `REDIS_DB=3`), **MinIO** `9100/9101` (bucket `govouve`).

**Mapa de portas conferido contra o existente** — nenhuma das novas (`7400`, `7401`, `8201`, `8202`) colide com: 8001, 7201, 7200, 8110, 8101, 7301, 9009, 9002, 3050, 3051, 5173, 15433, 6380, 9100, 9101, 80, 443.

---

## 14. Integração com os sistemas existentes
- **saas-platform** (`9009`/`9002`) — fonte de verdade de autenticação, tenant e papéis. GovOuve valida o token e consome o contexto.
- **modulo-chatgov** (`3050`/`3051`, socket.io) — canal opcional para notificar atendentes em tempo real e/ou abrir atendimento via chat a partir de uma manifestação.
- **modulo-govtask** (`8101`/`7301`) — encaminhar uma manifestação como tarefa/processo quando exigir tramitação operacional.
- **DOE** (`8001`/`7200`/`7201`/`8110`) — publicar atos/relatórios de ouvidoria, se necessário (Signer para assinatura).

Integrações via API REST + eventos (webhook/Redis pub-sub). Nenhuma depende de acoplamento de banco — cada módulo mantém seu schema.

---

## 15. Segurança
- Autenticação delegada ao SaaS (JWT/sessão); rotas públicas sem credencial, mas com *rate limiting* e *captcha* anti-spam.
- Escopo rígido por `tenant_id`/`secretaria_id` em toda consulta.
- Hash de IP e dados sensíveis; sigilo de denúncia com controle de acesso por papel.
- Validação de upload (MIME/tamanho), URLs assinadas do MinIO, antivírus opcional.
- Trilha de auditoria imutável para ações sobre manifestações.
- Headers de segurança no Nginx (HSTS, CSP), TLS wildcard.

---

## 16. Observabilidade
- Logs estruturados (JSON) por requisição com `request_id`, `tenant_id`, `secretaria`.
- Métricas (Prometheus) e *healthchecks* (`/health`, `/ready`).
- Flower para monitorar Celery; alertas de prazo de SLA.

---

## 17. Roadmap por fases
| Fase | Entregas |
|---|---|
| **0 — Fundação** | Bootstrap do serviço, integração de auth/tenant com SaaS, entidade Secretaria, resolução por subdomínio, Docker Compose + Nginx |
| **1 — Avaliação** | Construtor de modelos, formulários públicos, quiosque PWA, coleta + indicadores básicos |
| **2 — Ouvidoria núcleo** | Registro de manifestação, protocolo + comprovante, anonimato/sigilo, anexos, acompanhamento público |
| **3 — Tramitação & prazos** | Workflow completo, prazos automatizados (Celery Beat), encaminhamento, resposta, avaliação da resposta |
| **4 — Conformidade & relatórios** | LGPD (consentimento, anonimização, auditoria), Carta de Serviços, dashboards e relatórios de SLA |
| **5 — Integrações & polimento** | ChatGov/GovTask/DOE, transparência pública, acessibilidade WCAG, hardening |

---

## 18. Critérios de aceite (amostra)
- [ ] Subdomínio resolve a secretaria correta e isola os dados por tenant.
- [ ] Modelo de avaliação com ≥ 6 tipos de pergunta, publicável e respondível no quiosque.
- [ ] Manifestação gera protocolo + comprovante + chave de acompanhamento.
- [ ] `data_limite` calculada por tipo; prorrogação exige justificativa e recalcula.
- [ ] Celery Beat dispara alertas D-5/D-2/vencida e relatório de SLA.
- [ ] Denúncia sigilosa oculta identidade conforme papel.
- [ ] Consentimento LGPD registrado; anonimização executável; auditoria gravada.
- [ ] Site público acessível (WCAG 2.1 AA) e responsivo em tablet.
- [ ] Nenhuma colisão de portas com módulos existentes.
