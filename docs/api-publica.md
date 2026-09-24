# API Pública v1

Endpoints versionados para consulta pública de edições e matérias do Diário
Oficial Eletrônico. Acesso livre, sem autenticação.

**Base URL:** `https://api.diariooficial.gov.br/api/public/v1`

**Formato:** JSON (`Content-Type: application/json`)

**Paginação:** parâmetros `page` (0-indexed) e `page_size` (1-100, default 20).
Resposta inclui metadados de paginação com links `next_url` e `prev_url`.

**Rate Limit:** 100 requisições/minuto por IP.

---

## `GET /editions`

Lista edições publicadas, ordenadas por ano/número decrescente.

### Parâmetros

| Nome | Tipo | Local | Obrigatório | Descrição |
|---|---|---|---|---|
| `year` | int | query | não | Filtrar por ano |
| `type` | string | query | não | Filtrar por tipo (`normal`, `extra`, `suplementar`) |
| `search` | string | query | não | Buscar em título e subtítulo |
| `page` | int | query | não | Página (0-indexed, default 0) |
| `page_size` | int | query | não | Itens por página (1-100, default 20) |

### Resposta

```json
{
  "data": [
    {
      "id": "uuid",
      "number": 42,
      "year": 2026,
      "type": "normal",
      "title": "Edição nº 42",
      "subtitle": null,
      "publication_date": "2026-05-15",
      "verification_code": "2026-0042-AB12CD34",
      "item_count": 15,
      "signature_count": 1,
      "pdf_url": "http://portal/api/download/edition_2026_42.pdf"
    }
  ],
  "pagination": {
    "page": 0,
    "page_size": 20,
    "total": 1,
    "total_pages": 1,
    "next_url": null,
    "prev_url": null
  }
}
```

---

## `GET /editions/{id}`

Detalhes completos de uma edição publicada.

### Parâmetros

| Nome | Tipo | Local | Obrigatório | Descrição |
|---|---|---|---|---|
| `id` | UUID | path | sim | UUID da edição |

### Resposta

```json
{
  "id": "uuid",
  "number": 42,
  "year": 2026,
  "type": "normal",
  "title": "Edição nº 42",
  "subtitle": null,
  "publication_date": "2026-05-15",
  "verification_code": "2026-0042-AB12CD34",
  "pdf_hash": "e3b0c44298fc1c149afbf4c8996fb924...",
  "immutability_hash": "d7a8fbb307d7809469ca9abcb0082e4f...",
  "published_at": "2026-05-15T10:00:00",
  "pdf_url": "http://portal/api/download/edition_2026_42.pdf",
  "items": [
    {
      "id": "uuid",
      "position": 1,
      "section_title": "Atos do Executivo",
      "matter_id": "uuid",
      "matter_title": "Decreto nº 123"
    }
  ],
  "signatures": [
    {
      "signed_at": "2026-05-15T10:30:00",
      "certificate_subject": "CN=Prefeito,O=Prefeitura...",
      "certificate_serial": "3E8",
      "certificate_thumbprint": "AB34CD56..."
    }
  ]
}
```

---

## `GET /matters`

Lista matérias publicadas com busca e filtros.

### Parâmetros

| Nome | Tipo | Local | Obrigatório | Descrição |
|---|---|---|---|---|
| `q` | string | query | não | Busca em título, resumo e texto |
| `act_type` | string | query | não | Filtrar por tipo de ato |
| `org_unit` | string | query | não | Filtrar por unidade |
| `year` | int | query | não | Filtrar por ano da edição |
| `page` | int | query | não | Página (0-indexed) |
| `page_size` | int | query | não | Itens por página |

### Resposta

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Decreto nº 123",
      "summary": "Dispõe sobre...",
      "act_type": "Decreto",
      "org_unit": "SEAD",
      "edition_number": null,
      "publication_date": "2026-05-15",
      "pdf_url": null
    }
  ],
  "pagination": { "...": "..." }
}
```

---

## `GET /matters/{id}`

Detalhes completos de uma matéria publicada.

### Parâmetros

| Nome | Tipo | Local | Obrigatório | Descrição |
|---|---|---|---|---|
| `id` | UUID | path | sim | UUID da matéria |

### Resposta

```json
{
  "id": "uuid",
  "title": "Decreto nº 123",
  "summary": "Dispõe sobre...",
  "content_html": "<p>Texto da matéria</p>",
  "act_type": "Decreto",
  "org_unit": "SEAD",
  "author": "João Silva",
  "published_at": "2026-05-15T10:00:00",
  "attachments": [
    {
      "id": "uuid",
      "title": "Anexo I",
      "type": "annex",
      "filename": "anexo.pdf",
      "mime_type": "application/pdf",
      "size_bytes": 102400,
      "download_url": "http://portal/api/download/..."
    }
  ]
}
```

---

## `GET /verify/{code}`

Verifica a autenticidade de um documento pelo código de verificação.

### Parâmetros

| Nome | Tipo | Local | Obrigatório | Descrição |
|---|---|---|---|---|
| `code` | string | path | sim | Código de verificação (ex: `2026-0042-AB12CD34`) |

### Resposta (válido)

```json
{
  "valid": true,
  "edition_id": "uuid",
  "edition_title": "Edição nº 42",
  "edition_number": 42,
  "edition_year": 2026,
  "publication_date": "2026-05-15",
  "pdf_hash": "e3b0c44298fc1c149afbf4c8996fb924...",
  "immutability_hash": "d7a8fbb307d7809469ca9abcb0082e4f...",
  "certificate_subject": "CN=Prefeito,O=Prefeitura...",
  "signed_at": "2026-05-15T10:30:00",
  "verification_url": "http://portal/verificar/2026-0042-AB12CD34",
  "message": "Document verified successfully"
}
```

### Resposta (inválido)

```json
{
  "valid": false,
  "edition_id": null,
  "edition_title": null,
  "edition_number": null,
  "edition_year": null,
  "publication_date": null,
  "pdf_hash": null,
  "immutability_hash": null,
  "certificate_subject": null,
  "signed_at": null,
  "verification_url": null,
  "message": "Verification code not found or document not published"
}
```

---

## Padrões

### Paginação

Todas as listas retornam:

```json
{
  "data": [...],
  "pagination": {
    "page": 0,
    "page_size": 20,
    "total": 150,
    "total_pages": 8,
    "next_url": "/api/public/v1/editions?page=1&page_size=20",
    "prev_url": null
  }
}
```

### Erros

| Código | Significado |
|---|---|
| 400 | Parâmetros inválidos |
| 404 | Recurso não encontrado |
| 429 | Rate limit excedido (100 req/min) |
| 500 | Erro interno do servidor |

### CORS

Qualquer origem permitida em ambiente de desenvolvimento.
Em produção, configurar `CORS_ORIGINS` para os domínios do portal.

---

## Segurança

- Apenas dados **PUBLISHED** são expostos.
- Nenhum dado de auditoria interna é retornado.
- Hash SHA-256 permite verificação de integridade.
- Recomenda-se validação externa via Verificador ITI.

## Documentação OpenAPI

A especificação OpenAPI completa está disponível em:

- Swagger UI: `https://api.diariooficial.gov.br/docs`
- ReDoc: `https://api.diariooficial.gov.br/redoc`
- JSON: `https://api.diariooficial.gov.br/openapi.json`
