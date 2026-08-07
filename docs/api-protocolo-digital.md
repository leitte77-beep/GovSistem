# Protocolo Digital — Documentação da API

## Base URL
- **Interna**: `https://chatgov.govsistem.com.br/api/v1/protocols`
- **Admin**: `https://chatgov.govsistem.com.br/api/v1/admin/protocols`
- **Pública**: `https://chatgov.govsistem.com.br/api/v1/public`

## Autenticação
- Rotas internas: `Authorization: Bearer {jwt_token}`
- Rotas públicas: `Authorization: Bearer {session_token}` (obtido via `/protocols/access`)

---

## APIs Internas

### `GET /api/v1/protocols/dashboard`
Dashboard com totais, por status, origem e setor.

### `GET /api/v1/protocols`
Listar protocolos com filtros.

| Query Param | Tipo | Descrição |
|---|---|---|
| `status` | string | Status (ABERTO, EM_ANDAMENTO, PENDENTE, CONCLUIDO, CANCELADO) |
| `busca` | string | Busca por número, cidadão, CPF |
| `origem` | string | whatsapp, portal, presencial, telefone, email, interno |
| `prioridade` | string | NORMAL, ALTA, URGENTE, BAIXA |
| `atrasados` | bool | Filtrar apenas atrasados |
| `limite` | int | Máximo 100 |
| `pagina` | int | Página |

### `POST /api/v1/protocols`
Criar protocolo.

```json
{
  "assunto": "string",
  "descricao": "string",
  "conversa_id": "uuid",
  "contato_id": "uuid",
  "departamento_id": "uuid",
  "servico_id": "uuid",
  "origem": "whatsapp",
  "prioridade": "NORMAL",
  "gerar_senha": true
}
```

### `GET /api/v1/protocols/:id`
Detalhes completos (movimentações, mensagens, anotações, documentos, pendências).

### `POST /api/v1/protocols/:id/messages`
Enviar mensagem pública ao cidadão. `{ "conteudo": "string" }`

### `POST /api/v1/protocols/:id/internal-notes`
Criar anotação interna. `{ "conteudo": "string", "tipo": "anotacao" }`

### `POST /api/v1/protocols/:id/forward`
Encaminhar para setor. `{ "setor_destino_id": "uuid", "observacao": "string" }`

### `POST /api/v1/protocols/:id/assign`
Atribuir responsável. `{ "responsavel_id": "uuid" }`

### `POST /api/v1/protocols/:id/pending-items`
Criar pendência. `{ "titulo": "string", "descricao": "string", "tipo": "documento", "prazo_dias": 5 }`

### `POST /api/v1/protocols/:id/documents/upload`
Upload de arquivo (multipart/form-data). Campo: `arquivo`

### `GET /api/v1/protocols/documents/:docId/download`
Download de documento.

---

## APIs Admin

### `GET/POST/PUT/DELETE /api/v1/admin/protocols/services`
CRUD de serviços do catálogo.

### `GET/POST/DELETE /api/v1/admin/protocols/categories`
CRUD de categorias.

### `GET/POST/PUT/DELETE /api/v1/admin/protocols/slas`
CRUD de regras de SLA.

### `GET/POST/DELETE /api/v1/admin/protocols/holidays`
CRUD de feriados.

---

## APIs Públicas (Portal do Cidadão)

### `POST /api/v1/public/protocols/access`
Acesso por número + senha. Retorna token de sessão.
```json
{ "numero": "2026-08-000001", "senha": "ABC123" }
```

### `POST /api/v1/public/protocols/recover-access`
Recuperar acesso. `{ "numero": "2026-08-000001" }`

### `GET /api/v1/public/protocols/:id`
Detalhes públicos do protocolo (requer sessão).

### `GET/POST /api/v1/public/protocols/:id/messages`
Listar/enviar mensagens.

### `GET /api/v1/public/protocols/:id/documents`
Listar documentos públicos.

### `GET /api/v1/public/protocols/:id/documents/:docId/download`
Download de documento (requer sessão).

### `POST /api/v1/public/protocols/:id/documents/upload`
Upload de documento pelo cidadão (multipart).

### `GET /api/v1/public/services`
Catálogo de serviços disponíveis.

### `POST /api/v1/public/protocols`
Nova solicitação pelo portal.
```json
{
  "nome": "Maria da Silva",
  "cpf": "12345678900",
  "telefone": "11988887777",
  "email": "maria@email.com",
  "servico_id": "uuid",
  "assunto": "Solicitação de certidão",
  "descricao": "...",
  "campos": [{"campo_id": "uuid", "valor": "..."}]
}
```

### `POST /api/v1/public/auth/login`
Login do cidadão. `{ "email": "...", "senha": "..." }`

### `GET /api/v1/public/my/protocols`
Protocolos do cidadão logado.

---

## Banco de Dados
31 tabelas no schema `public`, todas com RLS por `tenant_id`.
Migração: `024_protocolo_digital.sql`

## Permissões (RBAC)
12 papéis: admin, supervisor, gestor_departamento, operador, atendente, auditor, operador_ia, visualizador (+ 4 SaaS).
35+ permissões granulares em `auth/permissions.js`.

## Scripts
```bash
# Seed de dados demo
bash scripts/test-integracao-protocolos.sh
```
