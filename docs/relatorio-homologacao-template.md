# Relatório de Homologação

**Sistema:** Diário Oficial Eletrônico  
**Versão:** 0.1.0  
**Data:** \_\_\_/\_\_\_/\_\_\_\_\_\_  
**Responsável:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  
**Ambiente:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  

---

## 1. Resumo

| Item | Resultado |
|---|---|
| Testes executados | \_\_\_/\_\_\_ |
| Aprovados | \_\_\_ |
| Falhas | \_\_\_ |
| Ignorados | \_\_\_ |
| Status final | ✅ Aprovado / ❌ Reprovado |

---

## 2. Checklist de Homologação

### 2.1 Autenticação e Controle de Acesso

| # | Teste | Procedimento | Resultado esperado | Resultado |
|---|---|---|---|---|
| 1 | Login com credenciais válidas | `POST /auth/login` com `homolog@test.com` / `Homolog@2026` | 200 + token JWT | ✅ / ❌ |
| 2 | Login com senha inválida | `POST /auth/login` com senha errada | 401 | ✅ / ❌ |
| 3 | Acesso sem token | `GET /matters` sem Authorization header | 401 | ✅ / ❌ |
| 4 | Acesso público sem token | `GET /public/editions` sem token | 200 | ✅ / ❌ |
| 5 | MFA obrigatório para ASSINADOR | Login sem MFA configurado | 428 (Precondition Required) | ✅ / ❌ |

### 2.2 Matérias

| # | Teste | Procedimento | Resultado esperado | Resultado |
|---|---|---|---|---|
| 6 | Criar matéria | `POST /matters` com título, conteúdo HTML, tipo de ato | 201 + matéria em DRAFT | ✅ / ❌ |
| 7 | Listar matérias | `GET /matters` | 200 + lista não vazia | ✅ / ❌ |
| 8 | Editar matéria | `PATCH /matters/{id}` alterando título | 200 | ✅ / ❌ |
| 9 | Submeter para revisão | `POST /matters/{id}/submit-review` | Status → REVIEW | ✅ / ❌ |
| 10 | Aprovar matéria | `POST /matters/{id}/approve` | Status → APPROVED | ✅ / ❌ |
| 11 | Rejeitar matéria | `POST /matters/{id}/reject` | Status → REJECTED | ✅ / ❌ |
| 12 | XSS em conteúdo | `POST /matters` com `<script>alert(1)</script>` | Script removido | ✅ / ❌ |
| 13 | Upload DOCX com formatação | Importar DOCX com parágrafos, negrito, tabelas | HTML preservado | ✅ / ❌ |
| 14 | Upload XLSX tabela contábil | Importar XLSX com 30 linhas | Tabela HTML gerada | ✅ / ❌ |
| 15 | Upload CSV | Importar CSV com delimitador | Tabela HTML gerada | ✅ / ❌ |
| 16 | Upload PDF com texto | Importar PDF com texto extraível | `ocr_needed: false` | ✅ / ❌ |
| 17 | Upload PDF escaneado | Importar PDF sem texto | `ocr_needed: true` | ✅ / ❌ |
| 18 | Anexar PDF à matéria | `POST /matters/{id}/attachments` com PDF | 201 + attachment | ✅ / ❌ |

### 2.3 Edições

| # | Teste | Procedimento | Resultado esperado | Resultado |
|---|---|---|---|---|
| 19 | Criar edição normal | `POST /editions` com number, year, type=normal | 201 | ✅ / ❌ |
| 20 | Criar edição extra | `POST /editions` com type=extra | 201 | ✅ / ❌ |
| 21 | Adicionar matéria à edição | `POST /editions/{id}/items` com matter_id APPROVED | 201 | ✅ / ❌ |
| 22 | Reordenar itens | `PATCH /editions/{id}/items/reorder` | Itens reordenados | ✅ / ❌ |
| 23 | Remover item | `DELETE /editions/{id}/items/{item_id}` | 204 | ✅ / ❌ |
| 24 | Fechar edição | `POST /editions/{id}/close` | Status → CLOSED | ✅ / ❌ |
| 25 | Reabrir edição | `POST /editions/{id}/reopen` | Status → DRAFT | ✅ / ❌ |
| 26 | Matéria DRAFT não entra | Tentar adicionar matéria em DRAFT | 422 | ✅ / ❌ |
| 27 | Matéria duplicada rejeitada | Tentar adicionar mesma matéria duas vezes | 409 | ✅ / ❌ |

### 2.4 Geração de PDF

| # | Teste | Procedimento | Resultado esperado | Resultado |
|---|---|---|---|---|
| 28 | Gerar PDF | `POST /editions/{id}/generate-pdf` | PDF gerado + status PDF_GENERATED | ✅ / ❌ |
| 29 | PDF abre corretamente | Abrir PDF gerado em leitor | PDF exibe conteúdo | ✅ / ❌ |
| 30 | Numeração de páginas | Verificar rodapé do PDF | Números sequenciais | ✅ / ❌ |
| 31 | Acentos preservados | Verificar "administração", "público" no PDF | Caracteres corretos | ✅ / ❌ |
| 32 | Tabelas contábeis | Verificar tabela importada no PDF | Estrutura preservada | ✅ / ❌ |
| 33 | SHA-256 calculado | `edition.pdf_hash` | Hash de 64 caracteres hex | ✅ / ❌ |

### 2.5 Assinatura Digital

| # | Teste | Procedimento | Resultado esperado | Resultado |
|---|---|---|---|---|
| 34 | Assinar PDF | `POST /editions/{id}/sign` com certificado A1 | Status → SIGNED | ✅ / ❌ |
| 35 | PDF assinado abre | Abrir PDF assinado no Adobe Reader | Exibe assinatura | ✅ / ❌ |
| 36 | Validar assinatura | `POST /editions/{id}/validate-signature` | `valid: true` | ✅ / ❌ |
| 37 | Verification code gerado | `edition.verification_code` | Código no formato `AAAA-NNNN-HHHHHHHH` | ✅ / ❌ |
| 38 | Assinatura sem permissão | Usuário sem role ASSINADOR tenta assinar | 403 | ✅ / ❌ |
| 39 | Senha PFX não vaza | Verificar logs | Senha não aparece | ✅ / ❌ |

### 2.6 Publicação

| # | Teste | Procedimento | Resultado esperado | Resultado |
|---|---|---|---|---|
| 40 | Publicar edição | `POST /editions/{id}/publish` (role PUBLICADOR) | Status → PUBLISHED | ✅ / ❌ |
| 41 | Edição publicada imutável | Tentar alterar edição PUBLISHED | 422 | ✅ / ❌ |
| 42 | published_at registrado | `edition.published_at` | Timestamp preenchido | ✅ / ❌ |
| 43 | Publicar sem assinatura | Tentar publicar edição não assinada | 422 | ✅ / ❌ |

### 2.7 Portal Público

| # | Teste | Procedimento | Resultado esperado | Resultado |
|---|---|---|---|---|
| 44 | Listar edições | `GET /public/editions` | Apenas PUBLISHED | ✅ / ❌ |
| 45 | Detalhar edição | `GET /public/editions/{id}` | Itens + assinatura | ✅ / ❌ |
| 46 | Ver matérias | `GET /public/matters/{id}` | HTML renderizado | ✅ / ❌ |
| 47 | Busca por termo | `GET /public/search?q=Decreto` | Resultados com highlight | ✅ / ❌ |
| 48 | Busca com acento | `GET /public/search?q=administração` | Encontra "administracao" | ✅ / ❌ |
| 49 | Verificar código | `GET /public/verify/{code}` | Documento válido | ✅ / ❌ |
| 50 | QR Code | Verificar página de verificação | QR Code visível | ✅ / ❌ |

### 2.8 API Pública Versionada

| # | Teste | Procedimento | Resultado esperado | Resultado |
|---|---|---|---|---|
| 51 | Listar v1 | `GET /api/public/v1/editions` | Paginação | ✅ / ❌ |
| 52 | Rate limit | 101 requisições em 1 minuto | 429 | ✅ / ❌ |
| 53 | Paginação | `?page=0&page_size=5` | `next_url` e `prev_url` | ✅ / ❌ |

### 2.9 Segurança

| # | Teste | Procedimento | Resultado esperado | Resultado |
|---|---|---|---|---|
| 54 | CSP headers | Verificar response headers | Content-Security-Policy presente | ✅ / ❌ |
| 55 | XSS sanitizado | Postar `<script>` no conteúdo | Script removido | ✅ / ❌ |
| 56 | Upload rejeita .exe | `POST /imports/docx` com `file.exe` | 400 | ✅ / ❌ |
| 57 | Upload > 50MB rejeitado | Upload de arquivo grande | 413 | ✅ / ❌ |
| 58 | Bloqueio conta | 5 logins falhos consecutivos | 423 (Locked) | ✅ / ❌ |
| 59 | Auditoria exportável | `GET /security/audit/export` | CSV com logs | ✅ / ❌ |

### 2.10 Operações

| # | Teste | Procedimento | Resultado esperado | Resultado |
|---|---|---|---|---|
| 60 | Healthcheck | `GET /operations/health` | `database: ok` | ✅ / ❌ |
| 61 | Métricas Prometheus | `GET /metrics` | Formato texto | ✅ / ❌ |
| 62 | Dashboard adm | `GET /operations/dashboard` | Contagens | ✅ / ❌ |
| 63 | Backup | Executar `scripts/backup.sh` | Arquivo .enc gerado | ✅ / ❌ |
| 64 | Integridade | Executar `scripts/verify_integrity.py` | 0 erros | ✅ / ❌ |

---

## 3. Observações

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## 4. Validação Externa (ITI)

| Item | Procedimento | Resultado |
|---|---|---|
| Abrir no Verificador ITI | https://verificador.iti.gov.br | ✅ / ❌ |
| Upload do PDF assinado | Seguir instruções do ITI | ✅ / ❌ |
| Validação da cadeia de certificados | Verificar ICP-Brasil | ✅ / ❌ |
| Carimbo de tempo | Verificar se presente | ✅ / ❌ |

---

## 5. Aprovação

| Papel | Nome | Data | Assinatura |
|---|---|---|---|
| Homologador | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ | \_\_\_/\_\_\_/\_\_\_\_\_\_ | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |
| Cliente | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ | \_\_\_/\_\_\_/\_\_\_\_\_\_ | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |
| DPO | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ | \_\_\_/\_\_\_/\_\_\_\_\_\_ | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |

---

*Documento gerado em \_\_\_/\_\_\_/\_\_\_\_\_\_ pelo Sistema de Diário Oficial Eletrônico v0.1.0*
