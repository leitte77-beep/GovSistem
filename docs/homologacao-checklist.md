# Checklist de Homologação — GovSistem Financeiro

## 1. Provedor de Pagamento (Asaas)

- [ ] Conta Asaas criada em ambiente sandbox
- [ ] API Key configurada via variável de ambiente (`ASAAS_API_KEY`)
- [ ] Webhook token configurado (`ASAAS_WEBHOOK_TOKEN`)
- [ ] URL do webhook pública configurada e registrada no Asaas
- [ ] Ambiente sandbox confirmado (`ASAAS_ENV=sandbox`)
- [ ] Teste: criar cliente no Asaas via API
- [ ] Teste: criar cobrança PIX
- [ ] Teste: criar cobrança BOLETO
- [ ] Teste: criar cobrança CREDIT_CARD
- [ ] Teste: webhook PAYMENT_RECEIVED → baixa automática
- [ ] Teste: webhook PAYMENT_OVERDUE → atualização de status
- [ ] Teste: webhook REFUNDED → estorno
- [ ] Teste: webhook duplicado não gera duplicidade

## 2. Provedor Fiscal (NFS-e)

- [ ] Conta Focus NFe criada (ou sandbox)
- [ ] Login/Token configurados (`FOCUS_NFE_LOGIN`, `FOCUS_NFE_TOKEN`)
- [ ] Ambiente correto configurado (`FISCAL_PROVIDER`, `FISCAL_ENV`)
- [ ] Teste: emitir NFS-e em sandbox
- [ ] Teste: rejeição fiscal exibe motivo na tela
- [ ] Teste: download XML da NFS-e
- [ ] Teste: download PDF/DANFSe
- [ ] Teste: auto-emissão ao receber pagamento (webhook)
- [ ] Teste: cancelamento de NFS-e

## 3. Webhooks

- [ ] Endpoint POST /webhooks/payments/asaas acessível publicamente
- [ ] Validação de assinatura HMAC-SHA256
- [ ] Rate limit (20/min) configurado
- [ ] Idempotência: mesmo evento não processa duas vezes
- [ ] Logs sanitizados (sem API keys, sem CPF/CNPJ)
- [ ] correlation_id em todos os logs

## 4. Conciliação Bancária

- [ ] Upload de arquivo OFX funcional
- [ ] Upload de arquivo CSV funcional
- [ ] Importação de extrato via API Asaas
- [ ] Sugestões automáticas de match
- [ ] Match manual com seleção de recebível
- [ ] Aceitar sugestão
- [ ] Desfazer conciliação com auditoria
- [ ] Relatório de pendências

## 5. Contabilidade

- [ ] Plano de contas seed automático
- [ ] Criação de lançamento contábil balanceado (débito = crédito)
- [ ] Lançamento postado não pode ser editado
- [ ] Estorno gera lançamento inverso
- [ ] Período contábil: abrir/fechar/reabrir
- [ ] Período fechado bloqueia alterações
- [ ] Lançamento automático ao receber pagamento
- [ ] Taxa do gateway registrada contabilmente
- [ ] DRE funcional
- [ ] Balancete funcional

## 6. Segurança

- [ ] API keys em variáveis de ambiente (SecretStr)
- [ ] Nenhuma chave no frontend
- [ ] Logs sanitizados (CPF/CNPJ/API keys mascarados)
- [ ] Mascaramento CPF/CNPJ nas telas
- [ ] Rate limit em webhooks
- [ ] correlation_id em todos os endpoints
- [ ] CORS configurado
- [ ] HTTPS obrigatório em produção
- [ ] Auditoria em todas operações financeiras
- [ ] Isolamento multi-tenant (organization_id)

## 7. Testes

- [ ] Testes unitários de sanitização
- [ ] Testes unitários de validação CNPJ/CPF
- [ ] Testes unitários de reconciliação (hash)
- [ ] Testes de integração: criar cobrança → webhook → baixa
- [ ] Testes de integração: emitir NFS-e
- [ ] Testes de integração: conciliação
- [ ] Cobertura mínima de 70%

## 8. Documentação

- [ ] Documentação de configuração Asaas
- [ ] Documentação de configuração Focus NFe
- [ ] Plano de rollback documentado
- [ ] README atualizado

## 9. Produção

- [ ] Migrations aplicadas sem erro
- [ ] Variáveis de ambiente de produção configuradas
- [ ] Secrets gerenciados (não em .env do repositório)
- [ ] Backup automático de XML/PDF fiscal configurado
- [ ] Monitoramento (health check, logs)
- [ ] Rollback testado
