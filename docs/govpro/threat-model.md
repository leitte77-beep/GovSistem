# GovPro — Modelo de Ameaças (Threat Model)

> Base: STRIDE. Sistema: módulo GovPro (SPE) do GovSistem. Confiança baixa em
> qualquer entrada originada no cidadão; confiança verificada em usuários internos
> (SSO). Atualização: 2026-08-13.

## Ativos

| Ativo | Impacto de comprometimento |
|---|---|
| Processos/documentos (conteúdo oficial) | Alto — integridade e autenticidade do ato administrativo |
| Dados pessoais (CPF/CNPJ, saúde, fiscal) | Alto — LGPD |
| Trilha de auditoria | Alto — prova e reconstrução da cadeia de eventos |
| Assinaturas (hash/artefato) | Alto — validade jurídica |
| Segredos (JWT, MinIO, ICP) | Crítico — comprometimento em cascata |
| NUP / sequências | Médio — duplicidade de protocolo |

## Atores

- Cidadão / usuário externo (não confiável)
- Servidor interno (confiança verificada, mas pode ser malicioso)
- Administrador do ente
- Administrador da plataforma (SaaS)
- Provedores externos (assinatura, WhatsApp, e-mail)
- Atacante anônimo (rede)

## Ameaças × Mitigações

| # | Ameaça (STRIDE) | Mitigação implementada | Residual |
|---|---|---|---|
| T1 | Upload malicioso (execução/AV bypass) | Pipeline: tamanho → MIME → magic bytes → quarentena → antivírus → hash → storage; conteúdo nunca servido como executável; storage fora da webroot | OCR de formatos oficiais segue desabilitado até revisão |
| T2 | Vazamento entre tenants | `tenant_id` em toda tabela de negócio; `get_tenant_id` fail-closed; prefixo por tenant no MinIO; queries sempre filtradas por tenant | Revisar views que juntem tabelas sem tenant (auditoria por job) |
| T3 | IDOR/BOLA (UUID conhecido) | UUID opaco; todo endpoint valida `tenant_id` + papel + política do processo/documento | Manter testes de permissão na matriz automatizada |
| T4 | Enumeração de protocolos/NUP | Validador público retorna só metadados não-sensíveis; CPF/CNPJ mascarados; busca aplica permissão ANTES de retornar | Consulta pública por NUP restrita a processos públicos |
| T5 | Roubo de sessão | Token JWT curto (30 min); refresh controlado no SaaS; logout remoto; recarga de perfil a cada request | MFA de alto privilégio no SaaS |
| T6 | Assinatura adulterada | Documento assinado imutável; hash SHA-256 congelado; assinatura ligada ao hash exato da versão; validador público com CRC | Assinatura qualificada depende de certificado do ente |
| T7 | Adulteração documental | Imutabilidade após assinatura; versionamento; hash encadeado; fixity check periódico | Trigger DB protege trilha; considerar WORM externo |
| T8 | Adulteração da auditoria | Append-only + hash chain (`audit_trail`/`audit_chain_state`) + trigger no banco | Exportar lotes assinados para storage externo (roadmap) |
| T9 | Prompt injection via documento (IA futura) | IA trata conteúdo documental como dados não confiáveis; instruções de sistema separadas; decisão final humana | Feature flag desligada por padrão |
| T10 | Webhook falso | Assinatura HMAC + segredo por tenant + retry idempotente + dead-letter (roadmap) | Ainda não implementado |
| T11 | Exfiltração em massa | Exportações exigem papel autorizado + auditoria; rate limit na API; alerta de volume anômalo (roadmap) | Observabilidade de download anormal pendente |
| T12 | Ransomware / perda de storage | Backup automático + criptografado + off-site; RPO/RTO documentados; teste de restauração | Ver DR no plano de operação |
| T13 | Conta interna comprometida | Reautenticação para operações críticas; recarga de perfil; bloqueio por falhas; credencial nominal revogável | MFA e sessões revogáveis |
| T14 | Abuso de API | Rate limit (slowapi); sanitização de logs; Problem Details sem vazar internos | Hardening ASVS contínuo |
| T15 | SSRF | Integrações de saída via adapters com allowlist de hosts; TSA/carimbo com timeout e circuit breaker | Revisar hosts externos futuros |

## Decisões pendentes (risco aceito)

- **gov.br / Tramita.GOV.BR**: apenas camada adaptadora; integração oficial futura (não simular).
- **IA**: opcional, governada, desligada por padrão.
- **MFA**: delegado ao SaaS (mesmo contrato de identidade); revisar se ente exigir local.
