# GovPro — Matriz LGPD (Lei 13.709/2018)

> Mapeamento de mecanismos técnicos e administrativos da aplicação. "✓" =
> implementado; "~" = parcial/pendente de item externo. Não substitui o programa
> de governança do ente (controlador) nem o RIPD.

## 1. Princípios (art. 6º)

| Princípio | Mecanismo |
|---|---|
| Finalidade / Adequação / Necessidade | Coleta mínima por serviço; `interessados` só com campos necessários; DTOs minimizados |
| Livre acesso / Transparência | Consulta pública do processo; validador público; aviso de privacidade (roadmap por serviço) |
| Qualidade / Exatidão | CPF/CNPJ com DV; cadastro com aprovação do órgão |
| Segurança / Prevenção | Criptografia, TLS, storage seguro, auditoria, MFA (SaaS) |
| Não discriminação | Sem tratamento automatizado decisório (IA não decide) |
| Responsabilização | Trilha auditável; `ProcessingActivity`/RIPD (roadmap) |

## 2. Bases legais (art. 7º, 11, 23)

- [x] **Execução de políticas públicas / obrigação legal** é a base padrão do poder
  público — o sistema NÃO depende de consentimento para tratar dados funcionais.
- [x] Consentimento usado apenas quando cabível, com termo versionado
  (`termo_aceite` no cadastro externo) e revogação prevista.

## 3. Direitos do titular (art. 18)

| Direito | Estado |
|---|---|
| Acesso aos dados | ~ Consulta "Meus processos" / peticionamento; exportação de titular pendente |
| Correção | ~ Cadastro editável pelo titular (validação do órgão) |
| Eliminação | ✓ via TTD (eliminação documental com rito); não por botão arbitrário |
| Revogação de consentimento | ✓ registrada |
| Portabilidade | ~ exportação de acervo em formato aberto (escopo do órgão) |

## 4. Segurança e incidentes (art. 46–48)

- [x] Medidas técnicas: hash, criptografia, controle de acesso, minimização.
- [x] Trilha de auditoria imutável (prova).
- [x] Sanitização de logs (sem dado pessoal desnecessário).
- [ ] **Inventário de tratamento (RIPD)** — modelo `ProcessingActivity` em roadmap.
- [ ] **Módulo de incidentes** com alerta de prazo ANPD configurável — roadmap.
- [ ] **Painel do Encarregado (DPO)** — perfil `DPO` existe; painel agregado em roadmap.

## 5. Minimização e mascaramento

- [x] CPF/CNPJ mascarados por padrão em respostas (DTO `InteressadoOut`).
- [x] Nenhum dado pessoal em URL, log ou mensagem de erro.
- [x] Validador público revela apenas metadados não sensíveis.
- [x] Pesquisa pública nunca retorna CPF/telefone/e-mail/endereço completos.

## 6. Transferência internacional / operadores (art. 33, 39)

- [x] Provedores externos (assinatura, e-mail, WhatsApp) integrados via adapters,
  com dados mínimos; base contratual é responsabilidade do controlador.

## Lacunas priorizadas

1. **RIPD / inventário de tratamento** por serviço (modelo + tela).
2. **Registro de incidentes** com prazo configurável (ANPD).
3. **Aviso de privacidade por serviço** (versão vigente registrada na solicitação).
4. **Painel do Encarregado** (atividades, incidentes, solicitações de titular).
