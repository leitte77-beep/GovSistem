# Arquitetura do Sistema de Diário Oficial Eletrônico

## Visão Geral

Sistema web para criação, montagem, publicação e divulgação do Diário Oficial de
órgão público brasileiro. Suporta desde a importação de matérias em múltiplos
formatos até a assinatura digital e disponibilização em portal público com busca,
download e código de verificação.

## Princípios Arquiteturais

| Princípio | Descrição |
|---|---|
| **Imutabilidade** | Uma vez publicada, uma edição nunca é alterada. Qualquer correção gera nova edição. |
| **Plugabilidade de Assinatura** | Módulo de assinatura digital projetado com *Strategy Pattern* para suportar A1, A3, HSM, selo eletrônico ou certificado em nuvem sem alterar o núcleo do sistema. |
| **Separação Write / Read** | O fluxo de produção (editoria) é separado do consumo (portal público), permitindo escalá-los de forma independente. |
| **Armazenamento Imutável** | PDFs e artefatos publicados são armazenados em armazenamento imutável (S3/MinIO com versão de objeto ou WORM). |
| **Auditabilidade** | Todo evento relevante (criação, revisão, publicação, assinatura) é registrado em log de auditoria não-repudiável. |

## Stack Tecnológica

| Camada | Tecnologia | Justificativa |
|---|---|---|
| **Backend** | Python 3.12 + Django 5.x | Ecossistema maduro, excelente ORM, bibliotecas de PDF, amplamente usado no setor público brasileiro. |
| **API** | Django REST Framework | Para o portal público e integrações futuras. |
| **Database** | PostgreSQL 16 | ACID, JSONB para metadados flexíveis, full-text search nativo, extensão pg_crypto para hashes. |
| **PDF** | WeasyPrint | HTML/CSS → PDF de alta fidelidade, suporte nativo a tabelas contábeis complexas, open source. |
| **Assinatura Digital** | python-openssl + estratégia plugável | Certificado A1 no MVP; contratos para HSM, nuvem e selo eletrônico. |
| **Armazenamento** | MinIO (S3-compatible on-prem) | Imutável, versionado, baixo custo, sem dependência de nuvem. |
| **Fila** | Redis + Celery / Django Q2 | Processamento assíncrono de geração de PDF e assinatura. |
| **Frontend (produção)** | Django Templates + HTMX + Alpine.js | Server-side rendering, sem SPA, formulários complexos com interatividade progressiva. |
| **Frontend (portal)** | Django Templates + HTMX | Leve, acessível, indexável por buscadores. |
| **Container** | Docker + Docker Compose | Portabilidade, dev/prod parity. |
| **Proxy** | Nginx | Servir arquivos estáticos, proxy reverso, cache. |

## Diagrama de Contexto (C4 Nível 1)

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Editor     │────▶│  Sistema DOE      │◀────│  Cidadão     │
│ (servidor)   │     │  (Sistema Web)    │     │ (público)    │
└──────────────┘     └────────┬─────────┘     └──────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  PostgreSQL +      │
                    │  MinIO + Redis     │
                    └───────────────────┘
```

## Arquitetura em Camadas (C4 Nível 2)

```
┌─────────────────────────────────────────────────────────────┐
│                    CAMADA DE APRESENTAÇÃO                    │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  Painel de Edição     │  │  Portal Público              │ │
│  │  (Django Templates +  │  │  (Django Templates + HTMX)   │ │
│  │   HTMX + Alpine.js)   │  │                              │ │
│  └──────────┬───────────┘  └──────────────┬───────────────┘ │
├─────────────┼─────────────────────────────┼─────────────────┤
│             │        CAMADA DE API        │                 │
│             ▼                             ▼                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Django REST Framework                      ││
│  │  /api/editions  /api/articles  /api/search  /api/verify ││
│  └────────────────────────┬────────────────────────────────┘│
├───────────────────────────┼──────────────────────────────────┤
│         CAMADA DE DOMÍNIO │(Núcleo do Sistema)              │
│                           ▼                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Article  │ │ Edition  │ │ Category │ │ Signature     │  │
│  │ Service  │ │ Service  │ │ Service  │ │ Provider      │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ │ (Strategy)    │  │
│       │            │            │       └───────┬───────┘  │
│       ▼            ▼            ▼               │          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Ports (Interfaces)                      │   │
│  │  IArticleRepository  IStorage  ISignatureProvider    │   │
│  └──────────────────────┬───────────────────────────────┘   │
├─────────────────────────┼───────────────────────────────────┤
│      CAMADA DE INFRA    │                                   │
│                         ▼                                   │
│  ┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ PostgreSQL  │ │  MinIO   │ │  Redis   │ │  Fila     │    │
│  │             │ │  (S3)    │ │          │ │  Async    │    │
│  └─────────────┘ └──────────┘ └──────────┘ └──────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Modelo de Dados (Conceitual)

```
┌─────────────────┐       ┌──────────────────┐
│     User        │       │    Category       │
│─────────────────│       │──────────────────│
│ id              │       │ id               │
│ name            │       │ name             │
│ email           │       │ slug             │
│ role(editor/    │       │ position         │
│   reviewer/     │       └────────┬─────────┘
│   publisher)    │                │
└────────┬────────┘                │
         │                         │
         │  ┌──────────────────────┘
         │  │
         ▼  ▼
┌──────────────────────┐
│      Article         │
│──────────────────────│
│ id (UUID)            │
│ title                │
│ content_html (rich)  │
│ summary              │
│ category_id (FK)     │
│ author_id (FK)       │
│ source_format        │
│ source_file (path)   │
│ hash (SHA-256)       │
│ version              │
│ created_at           │
│ updated_at           │
│ status (draft/       │
│   published)         │
└──────────┬───────────┘
           │
           │ M:N (via EditionArticle)
           │
┌──────────▼───────────┐
│       Edition        │
│──────────────────────│
│ id (UUID)            │
│ number               │
│ publication_date     │
│ status (draft/       │
│   reviewing/         │
│   published)         │
│ pdf_path             │
│ pdf_hash (SHA-256)   │
│ verification_code    │
│ signature_metadata   │
│ (JSONB)              │
│ published_at         │
│ published_by (FK)    │
│ immutability_hash    │
│ created_at           │
└──────────────────────┘

┌──────────────────────┐
│  EditionArticle      │  (tabela pivô ordenada)
│──────────────────────│
│ edition_id (FK)      │
│ article_id (FK)      │
│ position             │
│ section_title        │
└──────────────────────┘

┌──────────────────────┐
│  SignatureProvider   │  (config, não entidade)
│──────────────────────│
│ type: a1 | hsm |     │
│       cloud | seal   │
│ config (JSONB)       │
│ active: bool         │
└──────────────────────┘
```

## Fluxo de Publicação

```
[Editor]                    [Sistema]                     [Cidadão]
   │                          │                             │
   ├─ Cria/importa artigo ───▶│                             │
   │                          │                             │
   ├─ Monta edição ──────────▶│                             │
   │                          │                             │
   │                    ┌─────▼────────┐                    │
   │                    │ Gera PDF     │                    │
   │                    │ (WeasyPrint) │                    │
   │                    └─────┬────────┘                    │
   │                          │                             │
   │                    ┌─────▼──────────┐                   │
   │                    │ Assina PDF     │                   │
   │                    │ (Signature     │                   │
   │                    │  Provider)     │                   │
   │                    └─────┬──────────┘                   │
   │                          │                             │
   │                    ┌─────▼──────────────┐               │
   │                    │ Calcula hash +     │               │
   │                    │ gera código de     │               │
   │                    │ verificação        │               │
   │                    └─────┬──────────────┘               │
   │                          │                             │
   │                    ┌─────▼──────────┐                   │
   │                    │ Armazena em     │                   │
   │                    │ MinIO (WORM)    │                   │
   │                    └─────┬──────────┘                   │
   │                          │                             │
   │                    Marca edição                         │
   │                    como publicada                       │
   │                          │                             │
   │                          │    ┌────────────────────────┐│
   │                          ├───▶│ Portal: busca,         ││
   │                          │    │ download, verificação  ││
   │                          │    └────────────────────────┘│
```

## Estratégia de Imutabilidade

1. Cada edição publicada recebe um `immutability_hash` = SHA-256(
     edition.id + pdf_hash + ordered_article_hashes + timestamp
   )
2. O PDF assinado é armazenado em armazenamento imutável (bucket MinIO com
   Object Lock / WORM).
3. O código de verificação (ex: `2026-05-15-X7K9M2`) permite ao cidadão
   confirmar a integridade do PDF baixado → o sistema recalcula o hash e
   compara com o armazenado.
4. Erratas são novas edições que referenciam a edição original.

## Estratégia de Assinatura Digital (Strategy Pattern)

```python
class SignatureProvider(ABC):
    @abstractmethod
    def sign(self, pdf_bytes: bytes) -> SignedPdfResult: ...

    @abstractmethod
    def verify(self, pdf_bytes: bytes) -> bool: ...

class A1SignatureProvider(SignatureProvider):
    """Certificado A1 (arquivo .pfx/.p12 + senha)."""

class HSMSignatureProvider(SignatureProvider):
    """HSM (Hardware Security Module) - PKCS#11."""

class CloudSignatureProvider(SignatureProvider):
    """API de certificado em nuvem (ex: Certisign, Soluti)."""

class ElectronicSealProvider(SignatureProvider):
    """Selo eletrônico (ICP-Brasil selo)."""
```

A seleção do provedor é feita por configuração (`settings.SIGNATURE_PROVIDER`),
sem impacto no restante do sistema.

## Considerações de Segurança

- TLS obrigatório em todas as camadas
- Autenticação 2FA para usuários do painel de edição
- Logs de auditoria imutáveis (append-only table)
- Rate limiting na API pública
- CSP headers no portal público
- Assinatura digital no padrão ICP-Brasil (CAdES ou PAdES)

## Infraestrutura (MVP)

```
                    Internet
                       │
                  ┌────▼────┐
                  │  Nginx  │
                  │ (proxy) │
                  └────┬────┘
                       │
              ┌────────▼────────┐
              │   Django App    │
              │  (gunicorn)     │
              └──┬──────┬───────┘
                 │      │
        ┌────────▼┐  ┌──▼───────┐
        │PostgreSQL│  │  MinIO   │
        └─────────┘  └──────────┘
```

Tudo em Docker Compose, single server no MVP.

## Decisões Arquiteturais (ADRs)

### ADR-001: Python + Django
**Contexto**: Escolha do framework principal.
**Decisão**: Django 5.x com Python 3.12.
**Consequências**: ORM maduro, admin automático, excelente suporte a PDF via
WeasyPrint. Ecossistema conhecido no setor público brasileiro.

### ADR-002: WeasyPrint para PDF
**Contexto**: Geração de PDF com tabelas contábeis complexas.
**Decisão**: WeasyPrint (HTML/CSS → PDF).
**Consequências**: Suporte nativo a tabelas, CSS multi-page, headers/footers.
Requer fontes ICP-Brasil (serifadas) instaladas no sistema.

### ADR-003: Strategy Pattern para Assinatura
**Contexto**: Necessidade de trocar provedor de assinatura sem alterar core.
**Decisão**: Interface `SignatureProvider` com implementações plugáveis.
**Consequências**: A1 é implementação inicial; HSM, nuvem e selo são adicionados
sem modificar o fluxo de publicação.

### ADR-004: Armazenamento Imutável em MinIO
**Contexto**: PDFs publicados não podem ser alterados.
**Decisão**: MinIO com Object Lock (WORM) habilitado.
**Consequências**: Garantia de imutabilidade em nível de armazenamento. Custo
baixo, on-prem, S3-compatible.

### ADR-005: PostgreSQL Full-Text Search (MVP)
**Contexto**: Busca no portal público.
**Decisão**: Usar FTS nativo do PostgreSQL no MVP.
**Consequências**: Sem dependência adicional de infraestrutura. Se a carga
crescer, migra-se para Elasticsearch.

### ADR-006: Django Templates + HTMX (sem SPA)
**Contexto**: Interface de edição e portal público.
**Decisão**: Server-side rendering com HTMX para interatividade.
**Consequências**: Menor complexidade, melhor SEO no portal, acessibilidade,
sem necessidade de bundler JS. Interatividade suficiente para drag-and-drop
de matérias na montagem da edição.

### ADR-007: Imutabilidade via Hash Chain
**Contexto**: Garantir que edição publicada não seja alterada.
**Decisão**: SHA-256 hash do conteúdo completo + ordered article hashes.
**Consequências**: Qualquer alteração é detectável. Código de verificação
derivado do hash permite ao cidadão validar o PDF baixado.
