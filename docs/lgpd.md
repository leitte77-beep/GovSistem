# LGPD — Lei Geral de Proteção de Dados

## 1. Enquadramento Legal

O Sistema de Diário Oficial Eletrônico trata dados pessoais no exercício
regular de direito, nos termos do art. 7º, III da LGPD, para a
**publicação de atos oficiais** conforme obrigação legal do órgão público.

## 2. Base Legal para Tratamento

| Finalidade | Base Legal | Art. LGPD |
|---|---|---|
| Publicação de atos oficiais | Cumprimento de obrigação legal | Art. 7º, II |
| Gestão de usuários do sistema | Execução de contrato administrativo | Art. 7º, V |
| Autenticação e segurança | Legítimo interesse | Art. 7º, IX |
| Logs de auditoria | Obrigação legal / interesse público | Art. 7º, II e III |
| Armazenamento de documentos oficiais | Interesse público | Art. 7º, III |

## 3. Dados Tratados

### Dados de usuários do sistema (painel admin)
- Nome, email, hash de senha, roles, unidade organizacional
- Logs de acesso (IP, user-agent, timestamp)
- Armazenamento: durante vínculo + 5 anos (prazo legal)

### Dados de cidadãos (portal público)
- Nenhum dado pessoal é coletado no portal público
- Consultas não são rastreadas individualmente
- Logs de acesso anonimizados para estatísticas

### Dados em documentos oficiais
- Nomes de autoridades e servidores (publicação legal obrigatória)
- Não se aplica direito à exclusão (transparência pública)

## 4. Direitos dos Titulares

| Direito | Aplicabilidade |
|---|---|
| Confirmação da existência de tratamento | ✅ Sim (via portal) |
| Acesso aos dados | ✅ Sim (via portal) |
| Correção de dados incompletos | ✅ Sim (via admin) |
| Anonimização / bloqueio | ❌ Não (obrigação legal de publicação) |
| Eliminação | ❌ Não (documento oficial permanente) |
| Portabilidade | ❌ Não (dados públicos) |

## 5. Medidas de Segurança

- Criptografia de senhas (bcrypt)
- Criptografia de segredos (Fernet/AES-256)
- Logs sem dados sensíveis
- Controle de acesso RBAC
- Auditoria de todas as operações
- TLS em todas as comunicações

## 6. Política de Retenção

| Tipo de Dado | Retenção | Fundamento |
|---|---|---|
| Usuários ativos | Durante vínculo | Necessário para operação |
| Usuários inativos (soft delete) | 5 anos após desligamento | Prazo legal |
| Logs de auditoria | 365 dias | Política interna |
| Publicações | Permanentemente | Documento oficial |
| Matérias publicadas | Permanentemente | Documento oficial |

## 7. Encarregado (DPO)

Contato do encarregado de dados: [dpo@orgao.gov.br]

## 8. Registro de Operações

As operações de tratamento de dados pessoais são registradas na trilha de
auditoria do sistema, conforme art. 37 da LGPD.

## 9. Impacto à Privacidade

O sistema não realiza profiling, não compartilha dados com terceiros não
autorizados, e não transfere dados internacionalmente.
