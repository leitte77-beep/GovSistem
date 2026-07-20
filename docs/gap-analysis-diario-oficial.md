# Análise de Lacunas — Sistema de Diário Oficial Eletrônico

> Auditoria técnica do repositório `/home/ubuntu/sistemaweb` contra a especificação completa de 46 seções.
> Data-base: 17 de julho de 2026. Status: FATUAL, baseado em inspeção de código.

---

## RESUMO EXECUTIVO

O sistema atual possui aproximadamente **35% de cobertura** da especificação completa. Os pontos fortes incluem: stack bem definida (Python/FastAPI/WeasyPrint), motor de reconhecimento semântico determinístico funcional, provedor de assinatura A1 PAdES ICP-Brasil implementado, portal público Next.js funcional com busca e verificação, e estrutura multitenant básica via Organization model. As principais lacunas críticas estão em: carimbo do tempo (timestamp), agente A3 desktop, configuração legal do diário, Row-Level Security, painel de administração global, motor de autodiagramação completa (falta paginação real com WeasyPrint configurado para regras de órfãs/viúvas), numeração atômica de edições, e integrações externas (PNCP, transparência etc.).

---

## STACK REAL (vs Stack Sugerida)

| Camada | Stack Sugerida (seção 41) | Stack Real |
|---|---|---|
| Backend | NestJS + TypeScript | **FastAPI + Python 3.12** (apps/api) |
| Portal público | Next.js SSR/SSG | **Next.js 15 + TypeScript** (apps/web-public) |
| Painel admin | React/Next.js + TypeScript | **Next.js 14 + TypeScript** (apps/web-admin, modulo-diario/web-admin) |
| Banco | PostgreSQL | **PostgreSQL** (via SQLAlchemy async + Alembic) |
| Cache/Filas | Redis + BullMQ | **Redis** (tasks worker via apps/worker) |
| Busca | PostgreSQL FTS | **PostgreSQL FTS** + search_index model |
| Storage | S3 compatível / MinIO | **MinIO** (configurado, provider stub parcial) |
| PDF | HTML/CSS Paged Media | **WeasyPrint** (Jinja2 templates + CSS) |
| Assinatura | Serviço isolado com PAdES | **Serviço isolado (apps/signer)** com provedor A1 (747 LOC), PAdES AD-RB ICP-Brasil |
| Agente A3 | Desktop app com PKCS#11 | **AUSENTE** |
| Infra | Docker + Docker Compose | Docker Compose (infra/, apps/api/Dockerfile) |

**Divergência principal**: a stack sugerida no spec (seção 41) recomenda Next.js/NestJS, mas o sistema real usa **FastAPI para backend** e **pypdf + cryptography** para assinatura. A arquitetura de serviços isolados (API + Signer + Worker) é correta.

---

## ANÁLISE POR SEÇÃO DA ESPECIFICAÇÃO

### Legenda:
- ✅ **IMPLEMENTADO** — código funcional presente
- ⚠️ **PARCIAL** — existe mas incompleto
- ❌ **AUSENTE** — não encontrado no código

---

### SEÇÃO 1 — OBJETIVO PRINCIPAL

| Item | Status | Evidência / Observação |
|---|---|---|
| Recepção de matérias | ✅ | `apps/api/app/api/v1/matters.py`, `apps/api/app/api/v1/imports.py` |
| Classificação automática | ✅ | `services/gazette/rules.py` (183 LOC), `parser.py` (70 LOC), `state_machine.py` (395 LOC) |
| Diagramação automática | ⚠️ | `renderer.py` gera HTML semântico; templates HTML/CSS existem; mas o WeasyPrint opera com configuração básica — sem regras de órfãs/viúvas configuradas |
| Capa, cabeçalho, rodapé, sumário | ✅ | `services/edition_pdf.py` (261 LOC), `services/gazette/toc.py` (42 LOC) |
| Numeração automática | ⚠️ | UniqueConstraint no modelo Edition, mas sem tabela de sequências atômica (usa MAX+1 ou número manual) |
| Organização hierárquica | ⚠️ | OrgUnit existe mas sem relação hierárquica (pai/filho); categories como ActType simplificado |
| Edição normal/extraordinária/suplementar | ⚠️ | EditionType enum: NORMAL, EXTRA, SUPLEMENTAR — faltam: complementar, retificação, republicação como tipos de edição |
| Assinatura ICP-Brasil | ✅ | `signer/app/providers/a1.py` (747 LOC), PAdES AD-RB com OID `2.16.76.1.7.1.11.1.3` |
| Suporte A1 e A3 | ⚠️ | A1 implementado (747 LOC). A3 apenas como enum `SignatureProviderType.A3` — sem implementação |
| Carimbo do tempo | ❌ | **Não existe TimestampProvider** — nenhuma integração RFC 3161 |
| Imutabilidade | ⚠️ | Hash chain no modelo Edition (`immutability_hash`, `verification_code`), mas sem Object Lock/WORM configurado no MinIO |
| Disponibilização pública | ✅ | `apps/web-public` — Next.js funcional com páginas de edições, busca, verificação |
| Pesquisa textual | ✅ | `services/search_indexer.py`, `models/search_index.py`, PostgreSQL FTS |
| Verificação por código e QR Code | ⚠️ | `generate_verification_code()` existe no modelo Edition, `/verificar/[codigo]` no portal público, mas QR Code não está sendo gerado no PDF |
| SaaS multitenant | ⚠️ | Organization como tenant funciona, mas sem RLS, sem schema isolation, sem testes de isolamento |
| Instalação local | ✅ | Docker Compose, MinIO local, sem dependência de nuvem |
| Exportação de dados | ❌ | **Não há endpoint de exportação completa por tenant** |

---

### SEÇÃO 2 — PRINCÍPIOS OBRIGATÓRIOS

| Princípio | Status | Detalhe |
|---|---|---|
| Segurança desde a concepção | ✅ | `security_headers.py` (CSP, HSTS), `html_sanitizer.py`, `file_validator.py`, `password_policy.py` |
| Privacidade | ⚠️ | Documento LGPD (`docs/lgpd.md`) existe; código não tem detector de dados excessivos |
| Separação entre clientes | ⚠️ | `tenant.py` middleware injeta org_id; mas sem RLS, sem testes automatizados de isolamento |
| Imutabilidade | ⚠️ | Hashes no modelo; sem bloqueio físico no storage |
| Rastreabilidade | ✅ | `audit.py` middleware + `AuditEvent` model (append-only por design) |
| Não alteração silenciosa | ✅ | `MatterStatus.can_edit()` bloqueia edição após publicação |
| Alta disponibilidade | ❌ | Single server Docker Compose; sem balanceamento, sem health checks configurados |
| Acessibilidade | ⚠️ | `AccessibilityPanel.tsx`, `AccessibilityProvider.tsx` no portal público; sem testes automatizados; sem VLibras |
| Transparência | ✅ | Portal público sem cadastro, edições públicas |
| Interoperabilidade | ⚠️ | API REST existe, mas sem OpenAPI spec, sem webhooks |
| Preservação arquivística | ❌ | Sem modelo e-ARQ, sem exportação RDC-Arq |
| Portabilidade | ❌ | Sem endpoint de exportação completa |
| Independência de fornecedor | ⚠️ | SignatureProvider Strategy Pattern; mas sem TimestampProvider genérico |
| Compatibilidade ICP-Brasil | ⚠️ | OIDs hard-coded no `a1.py`; sem mecanismo de atualização de políticas |
| Licenças comerciais | ⚠️ | `WeasyPrint` (BSD), `pypdf` (BSD), `FastAPI` (MIT), `fpdf2` (LGPL — requer verificação) |

---

### SEÇÃO 3 — BASE LEGAL (CONFIGURAÇÃO LEGAL DO DIÁRIO)

| Componente | Status | Observação |
|---|---|---|
| Modelo `tenant_legal_settings` | ❌ | **Não existe**. Não há tabela para lei instituidora, feriados locais, política de numeração, datas de vigência etc. |
| Módulo "Configuração Legal do Diário" | ❌ | **Totalmente ausente**. Nenhum modelo, API, ou UI. |
| Bloqueio de ativação sem config | ❌ | Não há mecanismo. |
| Alerta de config incompleta | ❌ | Não existe. |
| Regras por município (não hard-coded) | ✅ | O sistema é em grande parte configurável (templates, layouts, categorias). Mas falta o módulo de configuração legal. |

---

### SEÇÃO 4 — ARQUITETURA MULTITENANT

| Componente | Status | Detalhe |
|---|---|---|
| Estrutura hierárquica | ⚠️ | Organization → OrgUnit → ActType → Matter → Edition. Faltam: Powers, Departments, Entities separadas do tenant |
| Vários tenants por entidade | ⚠️ | 1 tenant = 1 Organization; não há modelo de "entidades publicadoras" dentro do tenant |
| `tenant_id` nas entidades | ✅ | `organization_id` em todas as tabelas |
| Row-Level Security (RLS) | ❌ | **Não implementado** — filtro depende apenas do middleware `tenant.py` (app-level) |
| Schema separado | ❌ | **Não implementado** |
| Banco exclusivo | ❌ | **Não implementado** |
| Isolamento de cache/filas/arquivos | ⚠️ | Files model tem `organization_id`; mas não há prefixo de tenant nos paths MinIO nem nas filas Redis |
| Testes de isolamento | ❌ | `test_authorization.py` existe mas não testa acesso cross-tenant |
| Instalação dedicada / local | ✅ | Docker Compose permite instalação dedicada |

---

### SEÇÃO 5 — ADMINISTRAÇÃO GLOBAL DA PLATAFORMA

| Componente | Status | Observação |
|---|---|---|
| Painel admin global | ❌ | **Não existe.** O `saas-platform` é um sistema financeiro/contábil separado, não um painel de administração do Diário. |
| Cadastro/suspensão de tenants | ❌ | Feito via banco ou seeding |
| Planos contratados | ⚠️ | Model `Plan` existe, `plan_id` em Organization; mas sem UI de gestão |
| Módulos habilitados | ❌ | Não existe feature flags por tenant |
| Acesso de suporte temporário | ❌ | Sem modelo `support_access_requests` |
| Exportação de tenant | ❌ | Não implementado |
| Desligamento seguro | ❌ | Não implementado |

---

### SEÇÃO 6 — PERFIS E CONTROLE DE ACESSO (RBAC/ABAC)

| Componente | Status | Detalhe |
|---|---|---|
| Perfis (roles) | ⚠️ | Model `Role` existe; `UserRole` vincula user/org/role; mas perfis mapeados são limitados |
| Permissões granulares | ❌ | Sem modelo `Permission` ou `RolePermission` |
| MFA obrigatório | ⚠️ | MFA implementado (`services/mfa.py`, `api/v1/mfa.py`), mas sem enforcement por perfil crítico |
| Usuário multi-tenant | ✅ | `UserRole` permite um usuário em várias orgs |
| ABAC | ❌ | Não implementado |

**Perfis da spec vs implementados:**
- Administrador global: ❌
- Administrador do tenant: ⚠️ (role "admin" existe)
- Gestor do Diário: ❌
- Diagramador: ❌
- Publicador: ⚠️ (role "publisher" pode existir)
- Revisor: ⚠️ (role "reviewer" pode existir)
- Aprovador: ❌
- Assinante: ❌
- Auditor: ❌
- Gestor da entidade: ❌
- Usuário de órgão publicador: ❌
- Suporte técnico temporário: ❌
- Somente leitura: ❌

---

### SEÇÃO 7 — ENTIDADES, ÓRGÃOS, UNIDADES

| Componente | Status | Detalhe |
|---|---|---|
| OrgUnit model | ✅ | `models/org_unit.py` — com parent_id, type, responsável, endereço |
| Powers (Poder) | ❌ | Não existe modelo separado |
| Tipo de entidade | ⚠️ | OrgUnit.type como string, sem enum/tabela de tipos |
| Campos da spec | ⚠️ | Faltam: assinante padrão, modelo visual, política de aprovação, política de numeração de atos |

---

### SEÇÃO 8 — CATEGORIAS E SUBCATEGORIAS

| Componente | Status | Detalhe |
|---|---|---|
| ActType model | ✅ | `models/act_type.py` — funciona como categoria simplificada |
| Hierarquia ilimitada | ❌ | Sem parent_id no ActType; único nível |
| Config por tenant | ✅ | `organization_id` no ActType |
| Regras de classificação | ✅ | `rules.py` tem regex + prioridades |
| Keywords, cores, modelos por categoria | ❌ | ActType não tem esses campos |

---

### SEÇÃO 9 — PUBLICAÇÕES (MATÉRIAS)

| Componente | Status | Detalhe |
|---|---|---|
| Modelo Matter | ✅ | `models/matter.py` — com title, summary, content_html, content_json, plain_text, status |
| Estados da matéria | ⚠️ | 6 estados (DRAFT → REVIEW → APPROVED → PUBLISHED → ARCHIVED, + REJECTED). Faltam: em preparação, devolvida, agendada, bloqueada, retificada, republicada |
| Versionamento | ⚠️ | Campo `version` + `previous_version_id` existem, mas sem tabela `publication_versions` |
| Hash do conteúdo | ❌ | Não há hash calculado para o conteúdo da matéria |
| Signatários | ❌ | Sem modelo `publication_signatories` |
| Anexos | ✅ | `MatterAttachment` com tipo (ANNEX, APPENDIX, REFERENCE, OTHER) |
| Retificação/errata | ⚠️ | `is_erratum` + `references_matter_id` existem, mas sem fluxo completo |
| Imutabilidade pós-publicação | ✅ | `MatterStatus.can_edit()` bloqueia edição em status PUBLISHED |

---

### SEÇÃO 10 — IMPORTAÇÃO DE CONTEÚDO

| Componente | Status | Detalhe |
|---|---|---|
| Copiar e colar / Editor | ✅ | TipTap editor no frontend (modulo-diario) |
| HTML | ✅ | `html_sanitizer.py` (104 LOC) com bleach-like sanitization |
| DOCX | ✅ | `services/importer.py` (339 LOC) com python-docx |
| ODT | ✅ | Suporte básico em `importer.py` |
| TXT | ✅ | `imports.py` API endpoint |
| PDF | ⚠️ | `pdf_content.py` service (pyPDF2), mas sem OCR |
| OCR para PDF escaneado | ❌ | Não implementado |
| Sanitização | ✅ | Remove scripts, tags perigosas, objetos |
| Antivírus | ⚠️ | `providers/antivirus.py` (69 LOC) — apenas stub/placeholder |
| Preservar tabelas/imagens/listas | ✅ | Importer preserva estrutura HTML |
| Hash do original | ❌ | Não calculado |
| Comparativo original vs normalizado vs diagramado | ❌ | Não há UI de diff |

---

### SEÇÃO 11 — RECONHECIMENTO SEMÂNTICO

| Componente | Status | Detalhe |
|---|---|---|
| Motor de regras determinísticas | ✅ | `rules.py` (183 LOC) com 43+ padrões regex para LEI, DECRETO, PORTARIA, EDITAL, etc. |
| Regex para estruturas jurídicas | ✅ | Artigos (`Art. 1º`), parágrafos (`§ 1º`), incisos (`I –`), alíneas (`a)`), CNPJ, CPF, valores monetários, datas |
| State machine | ✅ | `state_machine.py` (395 LOC) — classifica segmentos com contexto |
| Segmenter | ✅ | `segmenter.py` (230 LOC) — quebra texto em blocos |
| Classificação com confiança | ✅ | Cada Rule possui `confidence` campo; `detect_document_type()` retorna confiança |
| IA complementar | ⚠️ | `ai_classifier.py` (237 LOC) — integração com LLM externo, mas é opcional |
| Regras para 35+ estruturas | ⚠️ | ~25 estruturas cobertas; faltam: EXTRATO DO CONTRATO, AVISO DE DISPENSA, PREGÃO ELETRÔNICO, CONCORRÊNCIA, CHAMAMENTO PÚBLICO, PROCESSO SELETIVO, CONCURSO PÚBLICO, Gabinete do Prefeito |
| Registro de classificação | ❌ | Não persistido no banco |
| Limite de confiança configurável | ❌ | Não há configuração de threshold |
| IA não cria informação | ✅ | Classificador é determinístico; IA é apenas sugestão |

---

### SEÇÃO 12 — MOTOR DE AUTODIAGRAMAÇÃO

| Componente | Status | Detalhe |
|---|---|---|
| Templates versionados | ⚠️ | Layouts (classico, moderno, minimalista) em `templates/pdf/layouts/`; mas sem versionamento explícito de templates |
| Configurações de página | ⚠️ | CSS tem @page com size: A4, margens; mas sem UI para configurar por tenant |
| Uma/duas colunas | ❌ | CSS atual sempre single-column |
| Regras de órfãs/viúvas | ❌ | Não configuradas no CSS (@page não tem orphans/widows) |
| Keep-with-next | ❌ | Não implementado |
| Repetir cabeçalho de tabela | ❌ | CSS não tem `break-inside: avoid` para thead |
| Quebra antes de entidade/categoria | ❌ | Não implementado |
| Página paisagem | ❌ | Apenas detecção (`detect_landscape()`), sem geração |
| Determinismo | ⚠️ | Mesmo conteúdo gera mesmo output (template fixo), mas sem registro de versão |
| Não depende de Word | ✅ | WeasyPrint puro |
| Blocos estruturados | ✅ | `renderer.py` gera HTML semântico com classes gazette-* |

---

### SEÇÃO 13 — CABEÇALHO, RODAPÉ, CAPA

| Componente | Status | Detalhe |
|---|---|---|
| Cabeçalho configurável | ✅ | Template HTML/CSS com brasão (brasao.png), nome, número, data |
| Rodapé configurável | ✅ | Número de página, total de páginas; sem QR Code, sem código de autenticidade |
| QR Code | ❌ | Não gerado |
| Código de autenticidade no PDF | ❌ | Só no banco; não aparece no PDF |
| Texto sobre assinatura digital | ❌ | Não incluído no rodapé |
| Capa opcional | ❌ | Sem suporte a modelos com/sem capa |
| Modelos de capa + sumário | ❌ | Só sumário básico |
| Identificação romana | ❌ | Ano aparece em decimal, sem opção romana |

---

### SEÇÃO 14 — SUMÁRIO AUTOMÁTICO

| Componente | Status | Detalhe |
|---|---|---|
| Sumário no PDF | ✅ | `services/gazette/toc.py` + `edition_pdf.py` (`_build_toc_html`) |
| Links internos | ❌ | Não implementados no PDF |
| Bookmarks | ❌ | Não implementados |
| Algoritmo de estabilização | ❌ | Sem iteração de paginação; sumário é calculado uma vez antes da paginação final |
| Hierarquia no sumário | ⚠️ | Básica (seções/títulos) |

---

### SEÇÃO 15 — ORDENAÇÃO AUTOMÁTICA

| Componente | Status | Detalhe |
|---|---|---|
| Ordenação configurável | ❌ | Ordem é manual (position no EditionItem) ou por inserção |
| Ordenação manual pré-fechamento | ✅ | EditionItem.position editável |
| Auditoria de alteração manual | ❌ | Não registrada |

---

### SEÇÃO 16 — EDIÇÕES E NUMERAÇÃO

| Componente | Status | Detalhe |
|---|---|---|
| Tipos de edição | ⚠️ | NORMAL, EXTRA, SUPLEMENTAR. Faltam: COMPLEMENTAR, RETIFICAÇÃO, REPUBLICAÇÃO |
| Estados da edição | ⚠️ | 8 estados (DRAFT → REVIEWING → SCHEDULED → CLOSED → PDF_GENERATED → SIGNED → PUBLISHED, + CANCELLED). Faltam: EM_GERACAO, ASSINANDO, AGUARDANDO_CARIMBO, VALIDANDO, FALHA_ASSINATURA, FALHA_CARIMBO, RETIFICADA, REPUBLICADA |
| Numeração atômica | ❌ | Sem tabela `edition_sequences`; usa `UniqueConstraint` apenas |
| MAX+1 (anti-pattern) | ⚠️ | Número provavelmente calculado via query; sem lock distribuído |
| Prefixo/sufixo | ❌ | Não implementado |
| Ano romano | ❌ | Não implementado |
| Importação legada | ⚠️ | `legacy_import.py` + `legacy_importer.py` (208 LOC) — importa edições existentes |
| Número não reutilizável | ❌ | Sem mecanismo; se cancelar, número pode ser reutilizado |

---

### SEÇÃO 17 — FECHAMENTO DA EDIÇÃO

| Componente | Status | Detalhe |
|---|---|---|
| Bloqueio de novas matérias | ✅ | `EditionStatus.can_add_items()` verifica |
| Snapshot | ❌ | Sem `edition_snapshots`; apenas referência às matérias atuais |
| Hashes no fechamento | ❌ | Apenas `pdf_hash` após geração; sem hash do snapshot |
| Validações de fechamento | ❌ | Sem validações automáticas (órgão, categoria, conteúdo, campos obrigatórios etc.) |
| Relatório de inconsistências | ❌ | Não implementado |

---

### SEÇÃO 18 — GERAÇÃO DO PDF

| Componente | Status | Detalhe |
|---|---|---|
| PDF preliminar | ✅ | `edition_pdf.py` gera PDF via WeasyPrint |
| PDF final assinado | ✅ | `signer/app` produz PDF assinado |
| Relatório técnico | ❌ | Não gerado |
| Manifesto JSON | ❌ | Não gerado |
| Texto pesquisável | ✅ | WeasyPrint gera PDF com texto real |
| Fontes incorporadas | ❌ | Fontes dependem de instalação do sistema; sem incorporação forçada |
| Sem scripts/anexos executáveis | ✅ | WeasyPrint HTML→PDF não inclui JS |
| Bookmarks | ❌ | Não gerados |
| PDF/A | ❌ | Sem suporte; WeasyPrint não gera PDF/A nativamente |
| Validação pré-assinatura | ❌ | Sem validação de PDF antes de enviar para assinatura |
| Metadados | ❌ | PDF não tem metadados (título, autor, assunto, palavras-chave) |
| Miniaturas | ❌ | Não geradas |

---

### SEÇÃO 19 — ASSINATURA DIGITAL ICP-BRASIL (SignatureProvider)

| Componente | Status | Detalhe |
|---|---|---|
| Strategy Pattern | ✅ | `signer/app/providers/base.py` — `SignatureProvider` ABC |
| PAdES ICP-Brasil | ✅ | `a1.py` implementa PAdES AD-RB com OID ICP-Brasil (`2.16.76.1.7.1.11.1.3`) |
| A1 | ✅ | `a1.py` (747 LOC) — PKCS#12/PFX, CMS, signed attributes, visual seal |
| A3 hardware | ❌ | **Apenas enum** — sem implementação PKCS#11 |
| A3 cloud/PSC | ❌ | **Apenas enum** — sem implementação |
| HSM | ❌ | **Apenas enum** — sem implementação |
| ICP-Brasil validator | ✅ | `icp_brasil.py` (194 LOC) — inspeção de certificado, validação de cadeia |
| Config params | ⚠️ | Alguns hard-coded (OID, algoritmos); sem UI de configuração |
| Lista de Políticas | ❌ | OID hard-coded no código; sem consulta à LPA vigente |
| Assinatura visual | ✅ | Selo rotacionado, logo ICP-Brasil, página de manifesto |
| Múltiplos signatários | ❌ | Apenas 1 assinatura por edição |

---

### SEÇÃO 20 — CERTIFICADO A1

| Componente | Status | Detalhe |
|---|---|---|
| PKCS#12 / PFX | ✅ | `a1.py` aceita PKCS#12 |
| Senha protegida | ✅ | `encryption.py` criptografa config; senha nunca em log |
| Cofre de segredos | ❌ | Sem Vault/KMS; config criptografada no banco |
| Rotação | ❌ | Não implementado |
| MFA para importação | ❌ | Não exigido |
| Validação CNPJ/CPF titular | ✅ | `icp_brasil.py` extrai e valida do certificado |
| Validade / revogação | ⚠️ | Verifica datas de validade; sem OCSP/LCR |
| Download impedido | ⚠️ | Credencial criptografada; sem endpoint de download |
| Assinatura automática configurável | ❌ | Assinatura sempre manual via API call |

---

### SEÇÃO 21 — CERTIFICADO A3 (AGENTE)

| Componente | Status | Detalhe |
|---|---|---|
| Agente desktop | ❌ | **Totalmente ausente** |
| PKCS#11 / CSP | ❌ | Sem código de integração |
| Challenge/Nonce | ❌ | Não implementado |
| PIN nunca ao servidor | ❌ | Sem agente = sem garantia |
| TLS mútuo | ❌ | Não implementado |
| Assinatura local | ❌ | Não implementado |
| A3 cloud/PSC | ❌ | Sem implementação; enum `CLOUD` sem provider |

---

### SEÇÃO 22 — CARIMBO DO TEMPO (TimestampProvider)

| Componente | Status | Detalhe |
|---|---|---|
| TimestampProvider layer | ❌ | **Totalmente ausente** |
| RFC 3161 | ❌ | Não implementado |
| ACT credenciada ICP-Brasil | ❌ | Sem integração |
| Validação do token | ❌ | Não implementado |
| Fila de retry | ❌ | Não implementado |
| Bloqueio de publicação sem carimbo | ❌ | Não implementado |
| Config de ACT primária/secundária | ❌ | Não existe modelo |

---

### SEÇÃO 23 — ORDEM DAS OPERAÇÕES CRIPTOGRÁFICAS

| Etapa | Status |
|---|---|
| Fechar edição → snapshot → PDF → hash → validar → apresentar → assinar → carimbo → validar → hash final → armazenar → publicar → indexar → notificar → auditar | ⚠️ Parcial: o fluxo existe do snapshot ao publicar, mas:
- Sem carimbo do tempo (etapa crítica ausente)
- Sem validação pré-publicação
- Sem notificação
- Sem armazenamento imutável (Object Lock) |

---

### SEÇÃO 24 — VALIDAÇÃO DA ASSINATURA

| Componente | Status | Detalhe |
|---|---|---|
| Verificação de integridade | ✅ | `verify()` no `a1.py` |
| Validação de cadeia | ✅ | `icp_brasil.py` |
| LCR / OCSP | ❌ | Não implementado |
| Política / OID | ⚠️ | OID verificado no sign (hard-coded); sem validação completa pós-assinatura |
| Timestamp validation | ❌ | Sem timestamp, sem validação |
| Resultados (válida/inválida/indeterminada/pendente) | ❌ | Sem enum/model para resultado de validação |
| Suite de homologação VALIDAR ITI | ❌ | Não existe |
| Bloqueio de publicação inválida | ❌ | Sem verificação antes de publicar |

---

### SEÇÃO 25 — IMUTABILIDADE E PRESERVAÇÃO

| Componente | Status | Detalhe |
|---|---|---|
| Armazenamento imutável (WORM) | ❌ | MinIO configurado, mas sem Object Lock habilitado no código |
| Armazenamento de evidências | ❌ | Apenas PDF path no banco; sem LCR, OCSP, relatórios |
| Correção via nova edição | ✅ | `is_erratum` + `references_matter_id` |
| Edição original acessível | ✅ | Status ARCHIVED não remove acesso |
| Proteção contra sobrescrita | ⚠️ | `EditionStatus.PUBLISHED` não permite transição; mas sem proteção no storage |

---

### SEÇÃO 26 — PORTAL PÚBLICO

| Componente | Status | Detalhe |
|---|---|---|
| Next.js portal | ✅ | `apps/web-public` — SSR/SSG |
| Página inicial | ✅ | Última edição, edições recentes, busca, filtros |
| Sem cadastro | ✅ | Acesso público |
| Acervo de edições | ✅ | `/acervo` page |
| Download do PDF | ✅ | `/api/download/[...path]` |
| Página individual da edição | ✅ | `/edicoes/[ano]/[numero]` |
| Informações do Diário | ✅ | `/sobre` |
| Política de privacidade | ✅ | `/privacidade` |
| Termos de uso | ❌ | Página em branco (`/termos` no landing, não no portal) |
| Acessibilidade | ✅ | `/acessibilidade` page + `AccessibilityPanel` |
| Contato | ✅ | `/contato` |
| Domínio personalizado | ⚠️ | `tenant_domain_resolution` middleware existe; `TenantDomain` model existe |
| Status de assinatura no portal | ❌ | Não exibido |
| Status do carimbo | ❌ | Não exibido |
| QR Code na página | ❌ | Não gerado |

---

### SEÇÃO 27 — PESQUISA PÚBLICA

| Componente | Status | Detalhe |
|---|---|---|
| Full-text search | ✅ | PostgreSQL FTS + `search_index` model |
| Filtros por data, entidade, categoria | ⚠️ | Filtros básicos; sem entidade/órgão/categoria |
| Expressão exata | ❌ | Não suportado |
| Destaque do termo | ❌ | Não implementado |
| Link direto para página no PDF | ❌ | Sem page-level linking |
| Operadores booleanos | ❌ | Não suportado |
| API pública de busca | ✅ | `api/v1/public.py` (busca pública) |
| Pesquisa com/sem acentos | ⚠️ | Depende de configuração PostgreSQL `unaccent` |
| Exportação de resultados | ❌ | Não implementado |

---

### SEÇÃO 28 — CONSULTA DE AUTENTICIDADE

| Componente | Status | Detalhe |
|---|---|---|
| Página `/verificar/{codigo}` | ✅ | `apps/web-public/src/app/verificar/[codigo]/page.tsx` |
| Código de verificação | ✅ | `Edition.generate_verification_code()` |
| QR Code | ❌ | Não gerado no PDF nem na página |
| Informações exibidas | ⚠️ | Hash e dados básicos; sem dados de assinatura/certificado/ACT |
| PDF original sempre disponível | ✅ | Download do original via código |

---

### SEÇÃO 29 — ACESSIBILIDADE

| Componente | Status | Detalhe |
|---|---|---|
| AccessibilityPanel | ✅ | Permite ajustar fonte, contraste, espaçamento |
| AccessibilityProvider | ✅ | Context provider React |
| Navegação por teclado | ❌ | Não testado/verificado |
| Textos alternativos | ❌ | Não verificados no portal |
| ARIA labels | ❌ | Não implementados sistematicamente |
| Declaração de acessibilidade | ✅ | Página `/acessibilidade` |
| VLibras | ❌ | Não integrado |
| Design responsivo | ✅ | Tailwind CSS |
| Testes de acessibilidade | ❌ | Sem axe-core, pa11y ou similar |
| PDF acessível | ❌ | WeasyPrint não gera PDF tagged/UA |

---

### SEÇÃO 30 — LGPD

| Componente | Status | Detalhe |
|---|---|---|
| Documento LGPD | ✅ | `docs/lgpd.md` |
| Inventário de dados | ❌ | Não implementado |
| Detector de dados excessivos | ❌ | Não implementado |
| Canal de solicitações | ❌ | Não implementado |
| RIPD | ❌ | Não existe |
| Política de retenção | ❌ | Não configurável |
| Encarregado (DPO) | ❌ | Não configurável |

---

### SEÇÃO 31 — LEI DE ACESSO À INFORMAÇÃO (LAI)

| Componente | Status | Detalhe |
|---|---|---|
| Acesso gratuito | ✅ | Portal público sem login |
| Histórico disponível | ✅ | Acervo completo |
| API pública | ✅ | `public.py` endpoints |
| Exportação por tenant | ❌ | Sem endpoint de exportação completa |
| Formatos abertos | ⚠️ | Apenas PDF; sem HTML/XML/JSON das edições |

---

### SEÇÃO 32 — GESTÃO ARQUIVÍSTICA (e-ARQ)

| Componente | Status |
|---|---|
| e-ARQ Brasil | ❌ Totalmente ausente |
| Identificador persistente | ❌ |
| Cadeia de custódia | ❌ |
| Eventos de preservação | ❌ |
| Exportação arquivística (RDC-Arq) | ❌ |
| Proibição de exclusão | ⚠️ (soft delete existe) |

---

### SEÇÃO 33 — INTEGRAÇÕES

| Componente | Status | Detalhe |
|---|---|---|
| API REST versionada | ✅ | `/api/v1/` e `/api/public_v1/` |
| OpenAPI | ❌ | Sem spec gerada |
| OAuth2 / OIDC | ❌ | Apenas JWT interno |
| API keys | ❌ | Não implementado |
| Rate limit | ❌ | Não implementado |
| Webhooks | ❌ | Sem modelo, sem implementação |
| PNCP | ❌ | Não implementado |
| Portal da Transparência | ❌ | Não implementado |
| Idempotency-Key | ❌ | Não implementado |

---

### SEÇÃO 34 — NOTIFICAÇÕES

| Componente | Status |
|---|---|
| Sistema de notificações | ❌ | **Totalmente ausente.** Sem modelo, sem serviço, sem UI. |
| E-mail | ❌ |
| Webhook | ❌ |
| Interna | ❌ |

---

### SEÇÃO 35 — RELATÓRIOS

| Componente | Status |
|---|---|
| Relatórios gerenciais | ❌ | **Totalmente ausente.** `metrics.py` tem health check apenas. |
| Exportação PDF/CSV/XLSX/JSON | ❌ |

---

### SEÇÃO 36 — AUDITORIA

| Componente | Status | Detalhe |
|---|---|---|
| Log de auditoria | ✅ | `AuditEvent` model + middleware |
| Append-only | ⚠️ | Design append-only (sem update/delete operations), mas sem proteção física contra alteração |
| Eventos registrados | ⚠️ | 14 AuditAction enums; faltam: fechamento, carimbo, retificação, republicação, mudança de numeração, mudança de certificado, mudança de ACT, exportação, acesso de suporte |
| Valores anteriores/posteriores | ❌ | Sem diff nos eventos |
| Hash do evento | ❌ | Sem hash chain entre eventos |
| Sem segredos em log | ✅ | Design não captura senhas |

---

### SEÇÃO 37 — SEGURANÇA

| Componente | Status | Detalhe |
|---|---|---|
| TLS | ⚠️ | Configurado no nginx (infra/nginx) |
| HSTS | ✅ | `security_headers.py` |
| CSP | ✅ | `security_headers.py` |
| CSRF | ✅ | Middleware FastAPI |
| XSS | ✅ | Sanitização HTML |
| SQL Injection | ✅ | SQLAlchemy ORM (parameterized queries) |
| Upload seguro | ✅ | `file_validator.py` |
| Rate limiting | ❌ | Não implementado |
| MFA | ✅ | `services/mfa.py` |
| Cofre de segredos | ❌ | Apenas criptografia simétrica no banco |
| SAST / DAST | ❌ | Não configurado |
| SBOM | ❌ | Não gerado |
| Monitoramento | ⚠️ | Sentry configurado (`core/sentry.py`) |
| Criptografia em repouso | ✅ | `services/encryption.py` para credenciais |

---

### SEÇÃO 38 — DISPONIBILIDADE E BACKUP

| Componente | Status | Detalhe |
|---|---|---|
| App stateless | ✅ | FastAPI stateless |
| HA banco | ❌ | PostgreSQL single |
| Health checks | ⚠️ | `/api/health` endpoint |
| Graceful shutdown | ❌ | Sem signal handler explícito |
| Migrations reversíveis | ❌ | Alembic sem downgrade testado |
| Plano de recuperação | ✅ | `docs/backup-restore.md`, `docs/plano-rollback.md`, `docs/runbooks.md` |
| Backup worker | ✅ | `worker/app/tasks/backup_scheduler.py` |
| Backup criptografado | ❌ | Não implementado |
| Teste de restauração | ❌ | Não automatizado |
| Exportação completa por tenant | ❌ | Não implementado |

---

### SEÇÃO 39 — OPERAÇÃO (MODELO A vs B)

| Componente | Status |
|---|---|
| Modelo A (on-prem) | ✅ Docker Compose, MinIO local, sem dependências obrigatórias de nuvem |
| Modelo B (SaaS) | ⚠️ Infraestrutura multi-tenant parcial; sem inventário de fornecedores |
| Inventário de dependências | ❌ Não existe |

---

### SEÇÃO 40 — MODELO DE DADOS (55 entidades)

**Entidades EXISTENTES (com modelo no código):**

1. ✅ `tenants` → `organizations`
2. ✅ `tenant_domains` → `tenant_domains`
3. ❌ `tenant_settings`
4. ❌ `tenant_legal_settings`
5. ✅ `subscription_plans` → `plans`
6. ❌ `contracts`
7. ⚠️ `entities` → parcialmente via `org_units` (sem poderes/entidades separados)
8. ❌ `powers`
9. ✅ `departments` → `org_units`
10. ❌ `organizational_units` → `org_units` existe, mas sem hierarquia completa
11. ✅ `users`
12. ✅ `user_tenants` → `user_roles`
13. ✅ `roles`
14. ❌ `permissions`
15. ❌ `role_permissions`
16. ✅ `categories` → `act_types`
17. ❌ `subcategories`
18. ❌ `publication_types`
19. ✅ `publications` → `matters`
20. ❌ `publication_versions`
21. ❌ `publication_blocks`
22. ✅ `publication_files` → `matter_attachments`
23. ❌ `publication_signatories`
24. ⚠️ `publication_relationships` → self-referential FK em matters (parcial)
25. ❌ `workflow_definitions`
26. ❌ `workflow_steps`
27. ❌ `workflow_instances`
28. ❌ `approvals`
29. ✅ `editions`
30. ✅ `edition_items`
31. ❌ `edition_sequences`
32. ❌ `edition_snapshots`
33. ⚠️ `templates` → layouts HTML/CSS (sem modelo DB)
34. ❌ `template_versions`
35. ⚠️ `generated_files` → `files` model (parcial)
36. ✅ `certificates` → `signing_credentials`
37. ❌ `certificate_events`
38. ✅ `signatures` → `signatures`
39. ❌ `timestamps`
40. ❌ `validation_reports`
41. ✅ `authenticity_codes` → `editions.verification_code`
42. ❌ `external_obligations`
43. ❌ `external_integrations`
44. ❌ `integration_events`
45. ❌ `api_clients`
46. ❌ `webhooks`
47. ❌ `notifications`
48. ✅ `audit_logs` → `audit_events`
49. ❌ `support_access_requests`
50. ❌ `retention_policies`
51. ❌ `backup_records`
52. ❌ `incidents`
53. ✅ `search_index_records` → `search_index`
54. ❌ `legal_holidays`
55. ❌ `platforms`

**Resumo: 17/55 entidades implementadas (31%)**

---

### SEÇÃO 42 — TESTES

| Tipo de Teste | Status | Arquivos |
|---|---|---|
| Unitários (API) | ✅ | 28 arquivos de teste em `apps/api/tests/` |
| Unitários (Signer) | ✅ | 6 arquivos em `apps/signer/tests/` |
| E2E | ✅ | `modulo-diario/web-admin/e2e/matters.spec.ts` |
| Portal público | ✅ | `apps/web-public/__tests__/` (3 arquivos) |
| Isolamento multitenant | ❌ | Sem testes de cross-tenant access |
| Assinatura A1 | ✅ | `test_signing.py`, `test_providers.py` |
| Assinatura A3 | ❌ | Não implementado |
| Carimbo do tempo | ❌ | Não implementado |
| Numeração concorrente | ❌ | Sem teste |
| Paginação / sumário | ❌ | Sem teste |
| Acessibilidade | ❌ | Sem teste |
| Carga | ❌ | Sem teste |
| Backup / restore | ❌ | Sem teste automatizado |
| VALIDAR ITI | ❌ | Sem suíte |

---

### SEÇÃO 43 — CRITÉRIOS DE ACEITAÇÃO (30 critérios)

| # | Critério | Status |
|---|---|---|
| 1 | Cadastrar órgãos independentes | ✅ |
| 2 | Isolar dados | ⚠️ Sem RLS |
| 3 | Identidade visual própria | ✅ theme_config, layouts |
| 4 | Importar texto e DOCX | ✅ |
| 5 | Reconhecer estrutura jurídica | ✅ rules.py |
| 6 | Diagramar automaticamente | ⚠️ Parcial |
| 7 | Cabeçalho e rodapé | ✅ |
| 8 | Sumário correto | ⚠️ Sem estabilização |
| 9 | Numeração atômica | ❌ |
| 10 | PDF pesquisável | ✅ |
| 11 | Assinar A1 | ✅ |
| 12 | Assinar A3 | ❌ |
| 13 | Carimbo ACT | ❌ |
| 14 | Validar assinatura e carimbo | ❌ |
| 15 | VALIDAR ITI | ❌ |
| 16 | Portal público | ✅ |
| 17 | Pesquisar conteúdo | ✅ |
| 18 | Verificar autenticidade | ✅ |
| 19 | Imutabilidade | ⚠️ Parcial |
| 20 | Retificação sem apagar original | ✅ |
| 21 | Auditoria | ✅ |
| 22 | Exportar dados do tenant | ❌ |
| 23 | Restaurar backup | ⚠️ |
| 24 | Testes de acessibilidade | ❌ |
| 25 | Documentação completa | ⚠️ Parcial (alguns docs em /docs) |
| 26 | Sem segredos no código | ✅ .env.example |
| 27 | Sem dependências ocultas | ⚠️ Sem inventário |
| 28 | Inventário de componentes | ❌ |
| 29 | Plano de atualização ICP-Brasil | ❌ |
| 30 | Aprovação técnica e jurídica | ❌ |

---

### SEÇÃO 44 — DOCUMENTAÇÃO (30 documentos)

| # | Documento | Status |
|---|---|---|
| 1 | Arquitetura | ✅ `docs/arquitetura.md` |
| 2 | C4 | ✅ (nível 1 e 2 em arquitetura.md) |
| 3 | Implantação | ❌ |
| 4 | Banco de dados | ❌ (sem ERD) |
| 5 | Modelo de ameaças | ❌ |
| 6 | Matriz de riscos | ❌ |
| 7-19 | Manuais | ❌ (apenas docs de operação/deploy existentes) |
| 20 | Política de segurança | ✅ `docs/seguranca.md` |
| 21 | Política de privacidade | ❌ (modelo ausente) |
| 22 | Termos de uso | ❌ (modelo ausente) |
| 23 | Inventário de dados pessoais | ❌ |
| 24 | Inventário de fornecedores | ❌ |
| 25 | SBOM | ❌ |
| 26 | Licenças | ❌ |
| 27 | Continuidade | ❌ |
| 28 | Portabilidade | ❌ |
| 29 | Homologação ICP-Brasil | ❌ |
| 30 | Homologação jurídica | ❌ |

---

## PROVA DE CONCEITO DA AUTODIAGRAMAÇÃO — DOCUMENTOS DE TESTE

Os seguintes tipos de documentos NÃO estão disponíveis no diretório `modelos/` nem em `uploads/` para a prova de conceito de autodiagramação:

O diretório `modelos/` contém apenas 9 PDFs já publicados (edições completas do Diário Eletrônico, nº 2350 a 2363). Estes são documentos **finais diagramados**, não matérias individuais para teste de importação e autodiagramação.

### Documentos FALTANTES para a PoC:

| Tipo | Status | Observação |
|---|---|---|
| a) Uma lei | ❌ AUSENTE | Texto bruto de lei municipal para teste de reconhecimento estrutural |
| b) Um decreto | ❌ AUSENTE | Decreto do Executivo em formato bruto |
| c) Uma portaria | ❌ AUSENTE | Portaria de Secretaria Municipal |
| d) Um edital | ❌ AUSENTE | Edital de licitação ou convocação |
| e) Um extrato de contrato | ❌ AUSENTE | Extrato com campos chave-valor (contratante, contratada, objeto...) |
| f) Uma tabela extensa | ❌ AUSENTE | Tabela contábil ou de RH que ocupe mais de uma página |
| g) Um documento com anexos | ❌ AUSENTE | Documento principal com referência a anexos |

---

## RESUMO DAS 10 PRINCIPAIS LACUNAS (em ordem de criticidade)

| # | Lacuna | Impacto | Esforço estimado |
|---|---|---|---|
| 1 | **Carimbo do tempo (TimestampProvider)** | Bloqueia conformidade ICP-Brasil completa | 3-4 semanas |
| 2 | **Agente A3 desktop** | Bloqueia uso de certificado A3 (obrigatório na maioria dos órgãos) | 6-8 semanas |
| 3 | **Configuração Legal do Diário** | Bloqueia conformidade jurídica municipal; cada tenant precisa | 2-3 semanas |
| 4 | **Row-Level Security (RLS)** | Isolamento entre tenants é apenas app-level; risco de vazamento | 1-2 semanas |
| 5 | **Numeração atômica de edições** | Risco de duplicidade em condições de concorrência | 1 semana |
| 6 | **Painel de administração global** | Sem gestão de tenants, planos, suporte | 4-6 semanas |
| 7 | **Validação de assinatura completa** | Sem OCSP/LCR/validação pré-publicação; risco de documento inválido | 2-3 semanas |
| 8 | **Integração PNCP** | Obrigação legal para publicações de licitações/contratos | 3-4 semanas |
| 9 | **Exportação completa de tenant** | Bloqueia portabilidade; requisito legal | 1-2 semanas |
| 10 | **Conversão explícita da stack** | Divergência entre spec (NestJS/TS) e realidade (FastAPI/Python); é decisão arquitetural | Decisão estratégica |

---

## PRÓXIMOS PASSOS RECOMENDADOS

1. **Criar os 7 documentos de teste** (lei, decreto, portaria, edital, extrato de contrato, tabela extensa, documento com anexos) como arquivos `.txt` ou `.docx` em `modelos/testes/` para validar a PoC de autodiagramação.

2. **Decidir sobre a stack**: manter FastAPI/Python (que funciona bem) ou migrar para NestJS/TS (conforme spec seção 41). A stack atual é produtiva, mas a documentação de arquitetura deve ser atualizada para refletir a realidade.

3. **Priorizar as 4 lacunas críticas de segurança**: carimbo do tempo, RLS, numeração atômica, validação de assinatura.

4. **Executar em fases conforme seção 45**, começando pela Fase 1 (descoberta e arquitetura) com este documento como baseline.

---

*Documento gerado por auditoria técnica de código em 17/07/2026.*
*Repositório: /home/ubuntu/sistemaweb*
