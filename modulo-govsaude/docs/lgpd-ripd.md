# Insumos para o RIPD — GovSaúde (LGPD)

> Este documento é um **insumo técnico**. O Relatório de Impacto à Proteção de
> Dados Pessoais deve ser completado e assinado pelo encarregado (DPO) do
> município, com a realidade local.

## 1. Bases legais

- Execução de políticas públicas de saúde (LGPD art. 7º, III).
- Tutela da saúde, por profissionais de saúde, serviços de saúde ou autoridade
  sanitária (LGPD art. 7º, VIII e art. 11, II, “a”/“f”).
- Cumprimento de obrigação legal/regulatória (prontuário, vigilância,
  faturamento SUS, LGPD art. 7º, II).
- Consentimento apenas quando a base legal específica exigir; não é a base
  padrão para o prontuário.

## 2. Categorias de dados

| Categoria | Exemplos | Classe |
|---|---|---|
| Identificação | nome civil/social, CPF, CNS, CNS, data de nascimento, filiação, documentos | PESSOAL/SENSÍVEL_SAUDE |
| Contato e endereço | telefone, e-mail, CEP, logradouro, coordenadas | PESSOAL |
| Saúde | anamnese, evolução, diagnósticos, prescrições, exames, vacinas, alergias, saúde mental, HIV/IST, violência | SENSIVEL_SAUDE / SIGILOSO |
| Território | domicílio, família, microárea, visitas, trajetos GPS | PESSOAL/SENSÍVEL_SAUDE |
| Agenda e recepção | agendamento, fila, classificação de risco, chamadas, nome abreviado | PESSOAL/SENSÍVEL_SAUDE |
| Profissionais | nome, CBO, conselho, vínculos, escala | PESSOAL |
| Acesso e autenticação | login, IP, user-agent, MFA, sessões, permissões | PESSOAL |
| Auditoria | quem acessou o quê, quando, finalidade, diff mascarado | PESSOAL/SENSÍVEL |
| Denúncias | relato, identidade protegida | SIGILOSO/SIGILO_DENUNCIA |

## 3. Finalidades

Assistência à saúde, continuidade do cuidado, regulação, vigilância
epidemiológica e sanitária, faturamento SUS, gestão e cofinanciamento APS,
cumprimento de obrigações legais e exercício regular de direitos.

## 4. Minimização e controle de acesso

- DTOs específicos por tela; nunca serializar o ORM inteiro.
- Recepção não lê conteúdo clínico; gestor vê agregados salvo permissão
  explícita; faturista não lê texto clínico.
- Níveis de sigilo com registro velado e quebra justificada/auditada.
- Sigilo por estabelecimento/equipe/especialidade.
- CPF/CNS guardados com HMAC e ciphertext; mascarados em listagens.
- Logs de aplicação sem dados pessoais; `request_id` para correlação.

## 5. Retenção e eliminação

- Prontuário: guarda mínima de 20 anos, configurável e documentada; não há
  eliminação física de dado clínico por obrigação legal de guarda.
- Trajetos GPS de visitas: retenção curta configurável (padrão 90 dias).
- Anexos, jobs e idempotência: prazos próprios; expurgo auditado por tarefa.
- Direitos do titular: acesso/correção com protocolo; quando a eliminação não
  for aplicável, registrar a base legal da conservação.

## 6. Segurança técnica

- TLS na borda; HSTS em produção.
- bcrypt custo 12; MFA TOTP opcional/por política; bloqueio por tentativas.
- JWT HS256 com segredo compartilhado da plataforma; `token_version`.
- Criptografia de coluna Fernet com rotação por `key_id` lógico.
- Auditoria append-only com trigger no PostgreSQL e partição mensal.
- Bucket privado, URLs curtas, magic number, lista branca e ClamAV.
- Rate limit e cabeçalhos de segurança.
- Segredos só em variáveis de ambiente/volumes; nunca no repositório.

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Acesso indevido a prontuário | RBAC + escopo + sigilo + auditoria de leitura |
| Vazamento por log/URL | proibição de PII em log/URL; mascaramento; revisão de código |
| Acesso cross-tenant | filtro `tenant_id` obrigatório; teste de isolamento; 404 |
| Anexo malicioso | magic number + lista branca + ClamAV |
| Perda de rastreabilidade | auditoria append-only e diff mascarado |
| Exposição do nome em painel | painel usa nome abreviado e nunca CPF/CNS; texto de voz separado |
| Biometria sem base adequada | porta pendente; nenhum template armazenado; alternativas obrigatórias |
| Credencial comprometida | bcrypt, MFA, bloqueio, revogação de sessão |
| Retenção excessiva | prazos configuráveis + tarefa de expurgo |

## 8. Direitos do titular e governança

- `GET /auth/me` informa permissões e grupos do usuário.
- A rota de relatório de acessos do titular (`/lgpd/titulares/{id}/acessos`)
  será entregue junto ao domínio cidadão (Fase 2) e ao painel do DPO.
- Encarregado (`encarregado_dados`) tem acesso à auditoria e pode exportar.
- Incidentes: acionar o runbook, preservar evidências, comunicar ANPD/titulares
  conforme avaliação do DPO.
