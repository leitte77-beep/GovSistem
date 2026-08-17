# GovPro — Security Checklist (OWASP ASVS 5.0, nível 2 orientativo)

> Verificação de segurança do módulo. Estado: conforme implementação atual
> (2026-08-13). "Parcial" = mitigação existe mas depende de item externo.

## Autenticação e Sessão (V2/V3)

- [x] Sem senha local para usuários internos — SSO delegado ao SaaS (token JWT).
- [x] Token validado contra lista de segredos; `type ∈ {access, module_access}`.
- [x] Perfil/situação recarregado do banco a cada request (revogação imediata).
- [x] Falha de login registrada na auditoria (`LOGIN_FALHA`).
- [ ] MFA para alto privilégio — **delegado ao SaaS** (verificar cobertura).
- [ ] Sessões revogáveis / lista de sessões — no SaaS.

## Autorização (V4)

- [x] RBAC por papel + escopo de unidade (`require_roles`, `get_tenant_id`).
- [x] Princípio do menor privilégio; auditor é leitura + trilha, sem edição.
- [x] Controle de acesso por processo/documento (nível de acesso + hipótese legal).
- [x] Need-to-know: credencial nominal revogável para conteúdo sigiloso.
- [x] Busca aplica permissão antes de retornar resultados.
- [x] Matriz de assinatura: perfis autorizados por tipo de ato.
- [x] Testes de permissão (matriz automatizada em `tests/`).

## Validação / Injeção (V5)

- [x] CPF/CNPJ com dígito verificador real (`br_validators`); CNPJ alfanumérico.
- [x] IDs UUID opacos; sem dado pessoal em URL/log/mensagem de erro.
- [x] Query parametrizada (SQLAlchemy); sem SQL dinâmico.
- [x] Schema Pydantic estrito em toda entrada; erros em Problem Details (RFC 9457).

## Uploads / Arquivos (V12)

- [x] Validação de tamanho, MIME e magic bytes (não confia na extensão).
- [x] Quarentena + antivírus obrigatório antes de liberar acesso.
- [x] Storage fora da webroot (MinIO, prefixo por tenant); sem bucket público.
- [x] Hash SHA-256/512 + deduplicação; URL temporária assinada quando necessário.
- [x] Nenhum arquivo enviado executado no servidor.

## Criptografia (V6/V9)

- [x] TLS em trânsito (borda nginx + storage).
- [x] Hash de senha local (bcrypt) apenas onde houver conta local (cidadão).
- [x] Segredos em env (nunca em código/versionado); `.env` gitignored.
- [x] Criptografia em repouso depende do storage (verificar política do ente).
- [ ] Rotação de chaves documentada — roadmap.

## Logs e Auditoria (V7/V8)

- [x] Trilha append-only com hash chain + trigger (imutável).
- [x] Eventos: login, criação, leitura de restrito, download, assinatura, tramitação,
  mudança de sigilo, concessão/revogação, exportação, eliminação, parametrização.
- [x] Sanitização de logs (filtro de dados sensíveis).
- [x] Correlation ID nos logs técnicos.
- [ ] Assinatura periódica de lotes / WORM externo — roadmap.

## Erros e Configuração (V1/V10/V11)

- [x] Mensagens de erro sem vazar internos; detalhe técnico só no log.
- [x] Security headers (middleware): nosniff, frame-ancestors, HSTS, etc.
- [x] CORS restrito por origem explícita.
- [x] Rate limiting na API (slowapi) para login e rotas sensíveis.

## Testes de segurança

- [x] Multi-tenant: isolamento testado.
- [x] Assinatura: alterar 1 byte → validação detecta (testes).
- [x] Auditoria: tentativa de forjar/alterar bloqueada (hash chain + trigger).
- [ ] Fuzz/DAST contínuo no pipeline — roadmap.

> Itens marcados "delegado ao SaaS" vivem na plataforma GovSistem (identidade
> única); não duplicar autenticação no módulo por decisão de arquitetura (ADR-GP2).
