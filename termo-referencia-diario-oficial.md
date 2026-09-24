# TERMO DE REFERÊNCIA

## Módulo de Diário Oficial Eletrônico

---

## 1. OBJETO

Contratação de plataforma web completa para **publicação e gestão do Diário Oficial Eletrônico** de entes públicos (municípios, estados e autarquias), abrangendo:

- Portal público de consulta e pesquisa de edições e matérias publicadas;
- Painel administrativo com controle de acesso por perfis (RBAC) e fluxo editorial completo;
- Geração de PDFs de edições com templates configuráveis;
- Assinatura digital com certificado ICP-Brasil (padrão PAdES AD-RB);
- API pública para integração e consulta automatizada;
- Infraestrutura conteinerizada com deploy simplificado (Docker Compose);
- Arquitetura multi-tenant para atender múltiplos órgãos em uma única instância.

---

## 2. JUSTIFICATIVA

A publicação de atos oficiais é obrigação constitucional de todo ente público. O formato físico tradicional é caro, moroso e de difícil acesso à população. Soluções eletrônicas existentes no mercado apresentam limitações como:

- Ausência de assinatura digital compatível com a ICP-Brasil (DOC-ICP-15.03);
- Fluxo editorial simplificado (rascunho/publicado), sem estágios de revisão, aprovação e diagramação com papéis definidos;
- PDFs genéricos sem layout adaptado ao padrão visual de diários oficiais brasileiros;
- Ausência de sistema de verificação pública de autenticidade dos documentos;
- Sem suporte a importação de acervo histórico (legado físico/digital);
- Arquitetura monousuário que exige instâncias separadas por órgão.

A plataforma aqui especificada resolve esses gargalos com uma solução completa, segura e escalável, reduzindo o tempo médio de publicação e garantindo conformidade legal e técnica.

---

## 3. ESCOPO E FUNCIONALIDADES

### 3.1 Portal Público (Cidadão)

- Listagem cronológica de edições publicadas (normais, extras e suplementares);
- Navegação por ano e número da edição;
- Visualização do PDF da edição completa (com assinatura digital embutida);
- Detalhamento de cada matéria com anexos;
- **Busca textual completa** (full-text search) em português, com acentuação insensível, ranqueamento de relevância e snippets destacados;
- Filtros por data de publicação, unidade organizacional e tipo de ato;
- **Página de verificação de autenticidade** via código de verificação ou upload de PDF assinado;
- Acessibilidade (painel de contraste, redimensionamento de fonte);
- Sitemap e robots.txt para indexação em mecanismos de busca;
- Páginas institucionais (sobre, contato, política de privacidade, mapa do site).

### 3.2 Painel Administrativo

- **Gestão de matérias** com editor rich-text (TipTap), suporte a anexos, versionamento e extração de texto plano para indexação;
- **Gestão de edições** com ordenação de matérias, numeração automática sequencial e três tipos de edição (Normal, Extra, Suplementar);
- **Fluxo editorial completo** com 6 status para matérias e 8 status para edições:
  - Matéria: `Rascunho → Revisão → Aprovado → Publicado → Arquivado` (+ Rejeitado);
  - Edição: `Rascunho → Em Revisão → Agendado → Fechado → PDF Gerado → Assinado → Publicado → Cancelado`;
- **Controle de acesso baseado em papéis (RBAC)** com 7 perfis:
  - Administrador, Autor, Revisor, Diagramador, Assinador, Publicador, Auditor;
- Autenticação com JWT, autenticação de dois fatores (MFA obrigatória para Assinador e Admin) e política de bloqueio por tentativas;
- Sugestão automática de título sequencial (ex: "DECRETO – 042/2026");
- Tela Kanban para inclusão de matérias em edições;
- Dashboard de métricas operacionais;
- Trilha de auditoria completa (log de todas as operações e transições de status);
- Gerenciamento de usuários, unidades organizacionais, tipos de ato, credenciais de assinatura e configurações do sistema.

### 3.3 Assinatura Digital

- **Padrão PAdES AD-RB (DOC-ICP-15.03)** — assinatura em formato PDF long-term validation;
- Suporte a **certificados A1** (PFX/PKCS#12);
- **Validação completa da cadeia ICP-Brasil**: verificação de cadeia de certificação, CRL (Certificate Revocation List) e OCSP;
- Verificação de política de certificado A1 (OID `2.16.76.1.2.1.*`);
- **Assinatura visual** com selo lateral rotacionado em todas as páginas e logotipo ICP-Brasil;
- **Página de manifesto** com detalhes técnicos da assinatura e QR Code de verificação;
- Código de verificação e hash de imutabilidade (SHA-256) incorporados ao PDF;
- Credenciais armazenadas com criptografia AES.

### 3.4 Geração de PDF (Diagramação)

- **Três templates de layout de edição**:
  - **Clássico**: estilo tradicional de diário oficial brasileiro;
  - **Moderno**: visual limpo com tons de azul;
  - **Minimalista**: preto e branco, econômico para impressão;
- Renderização HTML→PDF via WeasyPrint com templates Jinja2;
- Contagem de páginas, hash SHA-256 do PDF gerado;
- Geração assíncrona via Celery (não bloqueia a interface).

### 3.5 Formatação Inteligente de Conteúdo

- **Integração com IA (Gemini 2.5 Flash)** para autoformatação de textos brutos em HTML estruturado;
- Preserva integralmente o conteúdo original, apenas aplica estrutura (títulos, parágrafos, listas, tabelas);
- Exige revisão humana obrigatória antes da publicação;
- Fallback para heurísticas locais quando a IA está indisponível;
- Algoritmo local de detecção de estrutura textual (títulos, listas, parágrafos, tabelas).

### 3.6 Importação de Documentos

- **Formatos suportados**: DOCX, XLSX, CSV, PDF;
- Importação de PDF como imagens incorporadas ao conteúdo da matéria;
- **Importação de acervo legado em lote** (CSV + arquivos PDF) para migração de edições históricas.

### 3.7 API Pública v1

- REST, versionada, documentada;
- Rate limiting (100 requisições/min/IP);
- Sem necessidade de autenticação;
- Endpoints:
  - Listagem paginada de edições;
  - Detalhamento de edição por ano/número ou UUID;
  - Listagem e busca de matérias;
  - Detalhamento de matéria com anexos;
  - Verificação de autenticidade por código ou upload de PDF.

### 3.8 Arquitetura Multi-Tenant

- Organizações isoladas por slug/domínio;
- Resolução de tenant por domínio customizado (CNAME);
- Temas, logotipos e cores customizáveis por organização;
- Planos de serviço com limites de uso (usuários, edições, armazenamento).

### 3.9 Segurança

- Criptografia de credenciais de assinatura (AES);
- Sanitização de conteúdo HTML (Bleach);
- Validação de uploads com hook de antivírus;
- Headers de segurança HTTP;
- Configuração CORS;
- Autenticação interna entre serviços via API key;
- Rate limiting por IP;
- Política de senhas fortes.

### 3.10 Infraestrutura e Deploy

- **Contêineres Docker Compose** com 6 serviços:
  - API (FastAPI/Python 3.12+)
  - Signer (serviço de assinatura dedicado)
  - Worker (Celery + Redis para tarefas assíncronas)
  - Web-Admin (Next.js/TypeScript)
  - Web-Public (Next.js/TypeScript)
  - Infraestrutura (PostgreSQL 16, Redis 7, MinIO)
- Health checks em todos os serviços;
- Métricas Prometheus;
- Integração com Sentry para rastreamento de erros;
- Backup agendado via Celery Beat.

---

## 4. DIFERENCIAIS DA PLATAFORMA

| Diferencial | Esta Plataforma | Soluções Típicas do Mercado |
|---|---|---|
| **Assinatura Digital** | PAdES AD-RB com validação completa ICP-Brasil (cadeia, CRL, OCSP, política A1) | PKI comercial genérica ou sem assinatura |
| **Assinatura Visual** | Selo lateral rotacionado + página de manifesto + QR Code | Assinatura invisível ou ausente |
| **Fluxo Editorial** | 6 status de matéria + 8 status de edição com 7 papéis (RBAC) | Rascunho/Publicado simplificado |
| **Diagramação** | 3 templates específicos para diário oficial brasileiro (clássico, moderno, minimalista) | PDF genérico, sem identidade visual de governo |
| **IA para Formatação** | Integração Gemini com regras rígidas + revisão humana obrigatória | Formatação manual apenas |
| **Verificação Pública** | Código de verificação + hash de imutabilidade + QR Code + upload de PDF | Ausente ou limitado |
| **Multi-Tenant Nativo** | Domínios customizados, temas por órgão, planos de uso | Instância única por cliente |
| **Importação de Legado** | Lote CSV/PDF para migração de acervo histórico | Raramente oferecido |
| **Busca em Português** | Full-text search com unaccent, stemming PT-BR, snippets com highlight | Busca LIKE simples ou FTS genérico |
| **Resiliência** | Geração assíncrona (Celery), health checks, métricas, backup automático | Síncrono, sem monitoramento |
| **MFA Obrigatório** | Segundo fator exigido para papéis críticos (Assinador, Admin) | Autenticação simples |
| **Empacotamento** | Docker Compose — 1 comando para subir toda a plataforma | Instalação complexa, múltiplas dependências manuais |

---

## 5. REQUISITOS TÉCNICOS MÍNIMOS

### 5.1 Infraestrutura para Deploy

| Recurso | Especificação Mínima |
|---|---|
| CPU | 4 vCPUs |
| RAM | 8 GB |
| Armazenamento | 80 GB SSD (expansível conforme volume de edições) |
| Sistema Operacional | Linux (Ubuntu 22.04+ recomendado) |
| Container Runtime | Docker 24+ e Docker Compose v2 |
| Domínio | Um domínio principal + capacidade de configurar subdomínios ou CNAMEs por tenant |

### 5.2 Dependências Externas

- Servidor SMTP para envio de e-mails transacionais;
- Conta Google AI Studio (Gemini) opcional — para funcionalidade de formatação por IA;
- Bucket S3-compatible externo opcional (como alternativa ao MinIO local).

---

## 6. ESCOPO DE ENTREGA E IMPLANTAÇÃO

### 6.1 Código-Fonte e Licenciamento

- Repositório Git completo com histórico;
- Licença de uso perpétuo para o ente contratante;
- Código documentado, com instruções de build e deploy.

### 6.2 Documentação Técnica

- Guia de deploy em produção (DNS, SSL, CORS, variáveis de ambiente);
- Documentação da API (OpenAPI/Swagger);
- Checklist de segurança e infraestrutura;
- Documentação da API pública.

### 6.3 Capacitação

- Treinamento para equipe técnica (deploy, manutenção, backup, recuperação);
- Treinamento para equipe editorial (fluxo de criação de matérias, edições, assinatura e publicação);
- Treinamento para administradores (gestão de usuários, papéis, configurações, tenants).

### 6.4 Suporte e Garantia

- 90 dias de garantia para correção de bugs;
- Suporte técnico por 12 meses (canais: e-mail e chamados), com SLA de resposta:
  - Incidentes críticos (indisponibilidade): 4 horas;
  - Bugs não-críticos: 24 horas;
  - Dúvidas: 48 horas.

---

## 7. OBRIGAÇÕES DA CONTRATADA

1. Entregar o código-fonte completo, funcional e documentado;
2. Realizar a implantação inicial no ambiente de homologação e produção;
3. Capacitar as equipes designadas pelo contratante;
4. Corrigir bugs e falhas durante o período de garantia;
5. Fornecer suporte técnico durante o período contratado;
6. Não manter cópia ou acesso não autorizado a credenciais de assinatura, conteúdos de matérias ou dados dos órgãos após a entrega.

---

## 8. OBRIGAÇÕES DO CONTRATANTE

1. Fornecer infraestrutura de servidores conforme requisitos técnicos (item 5);
2. Disponibilizar domínio(s) e certificados SSL;
3. Fornecer certificado digital A1 (ICP-Brasil) válido para assinatura das edições;
4. Designar equipe para receber capacitação;
5. Manter ambiente de rede compatível com os requisitos de deploy;
6. Arcar com custos de serviços externos opcionais (Google AI Studio, bucket S3 externo, SMTP).

---

## 9. CRITÉRIOS DE ACEITAÇÃO

| Etapa | Critério |
|---|---|
| Deploy Homologação | Todos os 6 serviços rodando com health checks verdes |
| Testes Funcionais | Criação de matéria → edição → PDF → assinatura → publicação → consulta pública → verificação |
| Segurança | MFA funcional, rate limiting ativo, headers de segurança presentes |
| Capacitação | Lista de presença e avaliação de aproveitamento dos treinandos |
| Deploy Produção | Portal público acessível via HTTPS, API pública respondendo |
| Aceite Final | 15 dias de operação assistida sem incidentes críticos |

---

## 10. MODELO DE CONTRATAÇÃO

Sugere-se contratação por **dispensa de licitação** (Art. 75, IV da Lei 14.133/2021) ou **inexigibilidade** (Art. 74, I) em razão da singularidade técnica da solução — notadamente a assinatura PAdES AD-RB com validação completa ICP-Brasil e o fluxo editorial multi-papel com IA integrada — características não encontradas em soluções prontas de mercado.

Alternativamente, pode-se adotar pregão eletrônico para solução de menor preço, desde que as especificações técnicas deste termo sejam exigidas como requisitos mínimos de habilitação técnica.

---

## 11. DISPOSIÇÕES FINAIS

- O código-fonte de toda a plataforma é composto por aproximadamente 25 modelos de dados, 22 módulos de API, 18 migrações de banco, 3 templates de PDF e 2 portais web completos (admin e público).
- A plataforma é modular: o serviço de assinatura (`signer`) é desacoplado e pode ser atualizado independentemente para futuros padrões (ex: PAdES AD-RT, certificados A3, assinatura em nuvem).
- A API pública v1 garante interoperabilidade com sistemas de terceiros e portais de transparência.
- A arquitetura multi-tenant permite economia de escala, pois um único deploy atende múltiplos órgãos com isolamento lógico.

---

*Documento elaborado em 25/06/2026.*
