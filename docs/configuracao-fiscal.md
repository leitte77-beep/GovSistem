# Configuração — NFS-e / Provedor Fiscal

## Pré-requisitos

- Conta no [Focus NFe](https://focusnfe.com.br/) ou provedor fiscal compatível
- Certificado digital A1 (para produção) ou ambiente sandbox

## Variáveis de Ambiente

```bash
# Provedor fiscal: sandbox | focus_nfe
FISCAL_PROVIDER=sandbox

# Ambiente: sandbox | production
FISCAL_ENV=sandbox

# Focus NFe - Login (email ou usuário)
FOCUS_NFE_LOGIN=seu_login_aqui

# Focus NFe - Token de API
FOCUS_NFE_TOKEN=seu_token_aqui

# URLs base (já configuradas, não alterar sem necessidade)
# FOCUS_BASE_URL_SANDBOX=https://homologacao.focusnfe.com.br
# FOCUS_BASE_URL_PRODUCTION=https://api.focusnfe.com.br
```

## Configuração Empresarial

Para emitir NFS-e, a empresa precisa ter cadastrado no sistema:

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| Razão Social | Sim | Nome completo da empresa |
| CNPJ | Sim | Válido, 14 dígitos |
| Inscrição Municipal | Sim | Número fornecido pela prefeitura |
| Município | Sim | Código IBGE |
| Regime Tributário | Sim | MEI, Simples Nacional, Lucro Presumido, Lucro Real |
| CNAE | Sim | Classificação Nacional de Atividades Econômicas |
| Código de Serviço | Sim | Código LC 116 |
| Alíquota ISS | Sim | Percentual (ex: 0.05 para 5%) |

## Modos de Operação

### Sandbox (Desenvolvimento)
- `FISCAL_PROVIDER=sandbox` — usa provedor mock que simula autorização
- Nenhuma nota fiscal real é emitida
- Ideal para testes de integração

### Focus NFe (Produção)
- `FISCAL_PROVIDER=focus_nfe` — provedor real
- Certificado digital A1 obrigatório
- Notas fiscais são emitidas com validade jurídica

## Testando a Emissão

```bash
# Ambiente sandbox
curl http://localhost:9009/api/v1/nfse

# Criar uma NFS-e via API
curl -X POST http://localhost:9009/api/v1/nfse/issue \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"invoice_id": "...", "service_description": "Teste"}'
```

## Política de Emissão

A emissão automática de NFS-e pode ser configurada por empresa:

- **Ao confirmar pagamento** — emite quando o webhook PAYMENT_CONFIRMED chega
- **Ao receber pagamento** — emite quando PAYMENT_RECEIVED chega
- **Manual** — apenas por ação do usuário na tela

## Resolução de Problemas

| Problema | Causa Provável | Solução |
|----------|---------------|---------|
| NFS-e rejeitada | Dados do cliente incompletos | Preencher CPF/CNPJ, endereço |
| NFS-e rejeitada | CNAE não cadastrado | Verificar código CNAE |
| NFS-e rejeitada | Alíquota ISS incorreta | Verificar alíquota do município |
| Erro 401 Focus | Token inválido | Regenerar token no painel Focus |
| XML não encontrado | Storage não configurado | Verificar MinIO/LocalStorage |
