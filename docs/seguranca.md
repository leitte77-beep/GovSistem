# Manual de Segurança

## 1. Controles de Acesso

### Autenticação
- Login com email + senha + MFA opcional (obrigatório para ASSINADOR e ADMIN)
- Senhas com política mínima: 8 caracteres, 1 maiúscula, 1 minúscula, 1 dígito
- Expiração de senha a cada 90 dias
- Bloqueio após 5 tentativas falhas por 30 minutos
- JWT access token expira em 30 minutos
- Refresh token expira em 7 dias (revogável)

### Autorização (RBAC)
| Papel | Permissões |
|---|---|
| AUTOR | Criar/editar rascunhos próprios |
| REVISOR | Revisar e aprovar matérias |
| DIAGRAMADOR | Montar edições |
| ASSINADOR | Assinar digitalmente (requer MFA) |
| PUBLICADOR | Publicar edições |
| AUDITOR | Consultar logs e auditoria |
| ADMIN | Gerenciar cadastros (requer MFA) |

## 2. Proteção de Dados

### Criptografia em repouso
- Senhas: bcrypt (salt automático)
- Segredos TOTP: Fernet (AES-256-GCM) derivado da SECRET_KEY
- PFX armazenado em memória, nunca persistido
- Backup: AES-256-CBC via openssl

### Criptografia em trânsito
- TLS obrigatório em produção
- Comunicação entre serviços (API → Signer) via HTTPS

## 3. Headers de Segurança

| Header | Valor |
|---|---|
| `Content-Security-Policy` | CSP restritivo (ver middleware) |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

## 4. Rate Limiting

| Endpoint | Limite |
|---|---|
| `POST /auth/login` | 10 requisições/minuto/IP |
| API pública (`/api/public/v1/*`) | 100 requisições/minuto/IP |

## 5. Upload de Arquivos

- Extensões permitidas: `.docx`, `.xlsx`, `.csv`, `.pdf`
- Tamanho máximo: 50MB
- MIME type validado
- Interface VirusScannerProvider (noop ou ClamAV)
- Arquivos temporários descartados após uso

## 6. Logs e Auditoria

### Dados NUNCA logados
- Senhas em texto claro
- Conteúdo de PFX
- Tokens de acesso completos
- Secrets de MFA

### Trilha de auditoria
- Toda ação relevante registrada em `audit_events`
- Exportável em CSV por AUDITOR/ADMIN
- Retenção: 365 dias
- Logs são append-only

## 7. Backup

- Backup criptografado diário do PostgreSQL
- Backup dos PDFs assinados (storage)
- Backup da SECRET_KEY em cofre separado
- Teste de restauração trimestral

## 8. Checklist de Deploy Seguro

- [ ] TLS configurado (certificado válido)
- [ ] SECRET_KEY forte gerada (`openssl rand -hex 32`)
- [ ] CORS_ORIGINS restrito aos domínios do portal
- [ ] ClamAV configurado para escaneamento de uploads
- [ ] MFA obrigatório para ASSINADOR e ADMIN
- [ ] Logs centralizados com retenção de 365 dias
- [ ] Backup automatizado e testado
- [ ] Container signer isolado sem acesso ao banco
- [ ] Rede interna (Docker network) sem exposição desnecessária
- [ ] PostgreSQL apenas na rede interna
- [ ] MinIO com Object Lock (WORM) habilitado
- [ ] Monitoramento de tentativas de acesso não autorizado
- [ ] Teste de penetração anual
- [ ] Política de senha ativa
- [ ] Expiração de sessão configurada
