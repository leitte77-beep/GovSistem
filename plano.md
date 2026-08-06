# GovAssist — Módulo de Assistência Social
## Plano de Desenvolvimento Completo (SaaS multi-tenant para prefeituras)

> Documento de planejamento. Versão 1.0 — julho/2026.
> Escopo: módulo de gestão do SUAS municipal (CRAS, CREAS, Centro POP, acolhimento, gestão e vigilância socioassistencial), vendável a múltiplas prefeituras sobre a plataforma multi-tenant existente do GovAssist.

---

## 1. Contexto normativo — o que o sistema É OBRIGADO a suportar

O módulo não é um CRM genérico: ele operacionaliza uma política pública regulada. As normas abaixo definem entidades, fluxos e relatórios do sistema.

| Norma | O que impõe ao sistema |
|---|---|
| LOAS — Lei 8.742/1993 (alterada pela Lei 12.435/2011) | Estrutura geral da assistência social, benefícios eventuais e BPC |
| PNAS/2004 e NOB-SUAS (Res. CNAS 33/2012) | Organização por proteções (básica/especial), territorialização, vigilância socioassistencial |
| Tipificação Nacional — Res. CNAS 109/2009 (e atualizações de 2014) | Catálogo padronizado de serviços que o sistema deve modelar (PAIF, PAEFI, SCFV, MSE, abordagem social, acolhimentos etc.) |
| Res. CIT 04/2011 e 20/2013 (+ Res. CIT 02/2017) | RMA — Registro Mensal de Atendimentos de CRAS, CREAS e Centro POP: campos, regras de contagem e prazo (mês subsequente) |
| Prontuário SUAS (manual MDS) | Estrutura do prontuário familiar: identificação, composição, condições de vida, histórico, plano de acompanhamento, encaminhamentos |
| NOB-RH/SUAS e Res. CNAS 9/2014 | Equipes de referência, funções e escolaridade — base dos perfis de acesso |
| Protocolo de Gestão Integrada (serviços × benefícios × transferência de renda) | Cruzamento entre acompanhamento familiar e beneficiários PBF/BPC/PETI |
| Lei do Governo Digital 14.129/2021, LGPD 13.709/2018, LAI 12.527/2011 | Once-only, interoperabilidade, proteção de dados sensíveis, transparência com anonimização |
| Marco municipal de benefícios eventuais (lei local de cada município) | Tipos, critérios e valores de benefícios são **configuráveis por tenant** |

**Consequência arquitetural nº 1:** grande parte do conteúdo (tipos de serviço, tipos de benefício, formas de acesso, motivos de encaminhamento) deve ser **tabela de domínio configurável por tenant com um seed nacional padrão**, nunca hard-code.

**Consequência arquitetural nº 2:** o sistema trata dados pessoais **sensíveis** (situações de violência, saúde, medidas socioeducativas, insegurança alimentar). LGPD não é fase final — é requisito de cada história de usuário.

---

## 2. Mapa funcional — o que os sistemas de mercado fazem e o GovAssist deve fazer

Síntese do benchmarking (GESUAS, IDS Social, Portabilis SAS e o Prontuário Eletrônico federal):

1. **Cadastro unificado de famílias e pessoas** — base única municipal compartilhada por todos os equipamentos, com importação da base do CadÚnico e cadastro direto quando a família ainda não está no CadÚnico.
2. **Prontuário eletrônico familiar** — versão digital do Prontuário SUAS: acolhida, histórico de atendimentos, evoluções, anexos, com sigilo por perfil.
3. **Atendimentos e acompanhamentos (PAIF/PAEFI)** — distinção formal entre *atendimento* pontual e *acompanhamento* sistemático (com data de início/fim), pois o RMA conta os dois separadamente.
4. **Plano de Acompanhamento Familiar e PIA** — diagnóstico, vulnerabilidades/potencialidades, objetivos, ações, avaliações periódicas; PIA para medidas socioeducativas e acolhimento.
5. **Benefícios eventuais** — concessão com parecer, comprovante de recebimento imprimível/assinável, controle de estoque/orçamento, histórico antiduplicidade em toda a rede.
6. **Ações coletivas e SCFV** — grupos, oficinas, inscrição, controle de frequência, relatórios de participação (subsídio ao SISC).
7. **Encaminhamentos (referência/contrarreferência)** — entre unidades e para a rede externa (saúde, educação, conselho tutelar, judiciário), com notificação ao técnico destino e devolutiva.
8. **Agenda e recepção** — agendamento por unidade/profissional, fila de recepção, visitas domiciliares (com modo offline no futuro app de campo).
9. **RMA automático** — Formulários 1 e 2 de CRAS, CREAS e Centro POP gerados a partir dos registros, com tela de conferência e exportação.
10. **Vigilância socioassistencial** — dashboards em tempo real, indicadores, georreferenciamento/mapa de calor das famílias e demandas por território.
11. **Gestão da rede** — cadastro de unidades (CRAS, CREAS, Centro POP, acolhimento, entidades privadas SAS), equipes e lotações.
12. **Relatórios de gestão e prestação de contas** — para o gestor, conselho municipal (CMAS), órgãos de controle e transparência (sempre anonimizados quando públicos).

---

## 3. Modelo de domínio (entidades principais)

```
Tenant (Município)
 ├── Unidade (CRAS | CREAS | CentroPOP | CentroDia | Acolhimento | Sede/Gestão | EntidadeRede)
 │    ├── Território/Bairro de abrangência (geo)
 │    └── Profissional (vínculo, função NOB-RH, CPF, conselho de classe)
 ├── Família (código, NIS resp., endereço geocodificado, faixa de renda, marcações: PBF, BPC, insegurança alimentar…)
 │    ├── Pessoa/Membro (CPF, NIS, nome social, nascimento, parentesco, escolaridade, deficiência…)
 │    ├── ProntuarioUnidade (1 por unidade que acompanha — PAIF e PAEFI têm prontuários próprios)
 │    │    ├── Acolhida/TriagemInicial
 │    │    ├── Atendimento (data, tipo, serviço, profissional, evolução [sensível], sigilo)
 │    │    ├── Acompanhamento (PAIF | PAEFI | MSE, início/fim, situação)
 │    │    │    └── PlanoAcompanhamento/PIA (diagnóstico, objetivos, ações, avaliações)
 │    │    ├── Encaminhamento (origem, destino interno/externo, motivo, status, devolutiva)
 │    │    ├── VisitaDomiciliar
 │    │    └── Anexo/Documento
 │    └── ConcessaoBeneficio (tipo, qtd/valor, parecer, comprovante, status)
 ├── TipoBeneficioEventual (natalidade, funeral, alimentação, calamidade, passagem… — configurável)
 │    └── EstoqueUnidade / DotaçãoOrçamentária
 ├── AcaoColetiva/Grupo (SCFV, oficina, palestra; público, faixa etária)
 │    ├── Inscricao/Participante
 │    └── EncontroFrequencia
 ├── Agenda (unidade, profissional, cidadão, tipo, status)
 ├── ImportacaoCadUnico (arquivo, versão da base, log de conciliação)
 └── TrilhaAuditoria (append-only, por tenant)
```

Regras estruturais que os concorrentes acertam e o GovAssist deve reproduzir:

- **Família é a unidade de trabalho**, pessoa é membro. Atendimento referencia família E membro atendido.
- **NIS e CPF são atributos, nunca chave primária exposta** (LGPD). IDs internos opacos (UUID).
- **Evolução técnica é dado sensível de acesso restrito**: técnico de nível superior da unidade e do serviço; recepção não lê; gestor vê agregados, não o texto (parametrizável conforme política municipal).
- Um mesmo cidadão pode ter prontuário no CRAS (PAIF) e no CREAS (PAEFI) simultaneamente — prontuários distintos, histórico da rede visível conforme perfil.
- Toda contagem do RMA deriva de registros primários — nada de digitar quantitativo à mão (mas oferecer campo de ajuste manual com justificativa auditada, porque a realidade dos municípios exige).

---

## 4. Multi-tenancy — decisões para vender a várias prefeituras

| Tema | Decisão recomendada |
|---|---|
| Isolamento de dados | Banco único com `tenant_id` em todas as tabelas + **Row-Level Security no PostgreSQL** (política por sessão). Alternativa schema-per-tenant se a plataforma GovAssist já usa. O requisito inegociável: **nenhuma query sem filtro de tenant compila/passa em teste**. |
| Configuração por tenant | Tipos de benefício + critérios + valores; unidades e territórios; brasão/identidade; textos de comprovantes; feriados; parâmetros de sigilo; integrações habilitadas. |
| Usuários | Usuário pertence a 1 tenant; suporte da GovAssist acessa via perfil de suporte com consentimento registrado e trilha própria. |
| Dados entre tenants | **Nunca.** Nem em relatórios agregados sem anonimização formal. |
| Backups e retenção | Por tenant, com possibilidade de exportação completa (portabilidade — evita lock-in e é argumento de venda em licitação). |
| Contrato/licitação | Gerar documentação de segurança, LGPD (RIPD), acessibilidade (eMAG/WCAG) e portabilidade — prefeituras exigem isso em termo de referência. |

---

## 5. Perfis de acesso (RBAC alinhado à NOB-RH)

| Perfil | Vê/Faz |
|---|---|
| Recepção/Cadastrador | Cadastro de pessoa/família, agenda, fila; **não lê** evoluções nem histórico sensível |
| Técnico de nível médio (educador, orientador) | Frequência de grupos, atividades coletivas, visitas conforme delegação |
| Técnico de referência (nível superior: assistente social, psicólogo) | Prontuário completo da sua unidade, atendimentos, evoluções, planos, encaminhamentos, concessão com parecer |
| Coordenador de unidade | Tudo da unidade + validação do RMA da unidade + gestão da agenda/equipe |
| Gestor municipal / Vigilância | Indicadores, mapas, RMA consolidado, benefícios/orçamento, configurações do tenant; acesso a texto sensível apenas se a política municipal do tenant permitir (auditado) |
| Conselho (CMAS) — opcional | Relatórios agregados e anonimizados |
| Suporte GovAssist | Operação assistida com registro de consentimento + trilha reforçada |

Autenticação: a da plataforma GovAssist (login por CPF + senha + MFA para gestores). Prever integração futura com Login Único gov.br para um eventual portal do cidadão (requer credenciamento do município).

---

## 6. Plano de desenvolvimento — fases, passo a passo

Estimativas para 1 squad (4–6 devs + 1 PO + 1 designer). Ajuste conforme sua equipe. Cada fase termina com incremento demonstrável a uma prefeitura piloto.

### Fase 0 — Descoberta e fundação de conformidade (2–3 semanas)
1. Ler na íntegra: Tipificação 109/2009, manuais do RMA (CRAS 2017 e CREAS 2018), Manual do Prontuário SUAS. Extrair deles o dicionário de dados oficial (campos, códigos de encaminhamento, blocos do RMA).
2. Entrevistar 2–3 secretarias de assistência social (idealmente uma cliente-piloto na sua região) — mapear fluxo real: acolhida → atendimento → acompanhamento → benefício → RMA.
3. Elaborar o **Registro de Impacto à Proteção de Dados (RIPD/DPIA)**: inventário de dados, classificação (pessoal/sensível), base legal por tratamento (regra geral: execução de política pública, art. 7º III e art. 11 II da LGPD), prazos de retenção.
4. Definir matriz RBAC definitiva com a piloto (o que gestor pode ler é decisão política local → parametrizar).
5. ADRs: estratégia multi-tenant, estratégia de auditoria, estratégia de importação CadÚnico.

**Entregáveis:** dicionário de dados, RIPD, matriz RBAC, backlog priorizado, protótipos navegáveis das 5 telas críticas (busca de família, prontuário, atendimento, concessão de benefício, painel RMA).

### Fase 1 — Fundação técnica multi-tenant (2–3 semanas)
1. Esqueleto do módulo dentro da plataforma GovAssist: contexto/módulo `assistencia-social`, migrações, RLS/filtro de tenant, seeds de domínio nacional (tipos de serviço da Tipificação, formas de acesso, tabela de códigos de encaminhamento do Prontuário SUAS).
2. Trilha de auditoria append-only (tabela separada, sem UPDATE/DELETE, hash encadeado opcional) + middleware que registra leitura de dado sensível.
3. Biblioteca de validações BR (CPF, NIS com DV, CEP) — reaproveitar a da plataforma.
4. Pipeline CI/CD com teste automático de isolamento de tenant (teste que tenta vazar dado entre tenants e deve falhar).

### Fase 2 — Rede, equipes e cadastro-base (3 semanas)
1. CRUD de Unidades (tipos SUAS + entidades da rede privada), territórios/bairros com polígono ou lista de bairros.
2. Profissionais: vínculo, função (lista NOB-RH), lotação com histórico, número de conselho de classe.
3. Cadastro de Famílias e Pessoas: composição familiar, responsável familiar, nome social, endereço com geocodificação (fila assíncrona), marcações (PBF, BPC, CadÚnico atualizado?, insegurança alimentar), busca unificada por nome/CPF/NIS/endereço com deduplicação assistida (aviso de possível duplicata).
4. LGPD desde já: DTOs mínimos por tela, mascaramento de CPF em listagens, auditoria de leitura de ficha.

### Fase 3 — Prontuário, atendimentos e acolhida (4 semanas)
1. Acolhida/triagem: forma de acesso (demanda espontânea, busca ativa, encaminhamento — códigos do RMA), motivo, prioridade.
2. Atendimento: data, serviço tipificado, profissional(is), membro(s) atendido(s), tipo (individual, familiar, coletivo, visita domiciliar), evolução em editor rico com marcação de sigilo, anexos.
3. Linha do tempo do prontuário por unidade + visão de rede (o que outras unidades registraram, respeitando sigilo — mostrar "houve atendimento no CREAS em 03/2026" sem expor o conteúdo, conforme parametrização).
4. Impressão de ficha/prontuário em PDF no padrão do Prontuário SUAS físico (municípios ainda exigem papel).

### Fase 4 — Acompanhamento familiar, planos e MSE (3–4 semanas)
1. Abertura/encerramento de acompanhamento (PAIF, PAEFI, MSE-LA, MSE-PSC) com data início/fim e motivo de desligamento — isso alimenta diretamente o RMA.
2. Plano de Acompanhamento Familiar: diagnóstico, vulnerabilidades/potencialidades, objetivos, ações com responsável e prazo, avaliações periódicas com lembrete.
3. PIA para medidas socioeducativas: dados do processo judicial, medida, prazo, frequência de cumprimento, relatórios ao judiciário (modelo de documento gerado).
4. Alertas: acompanhamento sem evolução há X dias, plano sem avaliação, medida vencendo.

### Fase 5 — Benefícios eventuais (3 semanas)
1. Configurador por tenant: tipos (auxílio natalidade, funeral, alimentação/cesta, calamidade, passagem, documentação…), critérios, valor/quantidade, exigência de parecer, periodicidade máxima.
2. Fluxo de concessão: solicitação → análise/parecer técnico → aprovação (alçada configurável) → entrega com **comprovante imprimível e assinatura** (papel ou assinatura na tela) → baixa em estoque/dotação.
3. Antiduplicidade: histórico de concessões da família em toda a rede com alerta na tela de nova concessão.
4. Estoque por unidade e/ou dotação orçamentária por período; relatório de consumo para prestação de contas ao CMAS.

### Fase 6 — Ações coletivas e SCFV (2–3 semanas)
1. Grupos/turmas SCFV por faixa etária e serviço; oficinas e palestras avulsas.
2. Inscrição de participantes (vinculada ao cadastro), lista de espera, chamada de frequência (interface rápida, mobile-friendly, uso em campo).
3. Relatórios de participação e assiduidade; exportação para subsidiar o SISC; contadores para o Bloco de atendimentos coletivos do RMA.

### Fase 7 — Encaminhamentos e rede (2 semanas)
1. Encaminhamento interno (CRAS ↔ CREAS ↔ Centro POP) com notificação in-app para a unidade destino, aceite e devolutiva (contrarreferência).
2. Encaminhamento externo (saúde, educação, conselho tutelar, INSS/BPC, CadÚnico — tabela de códigos oficial) com geração de ofício/guia em PDF numerado.
3. Painel de encaminhamentos pendentes por unidade.

### Fase 8 — Agenda, recepção e comunicação (2 semanas)
1. Agenda por unidade/profissional/tipo; fila do dia na recepção com senha simples opcional.
2. Lembretes por WhatsApp/SMS (provedor plugável, opt-in registrado — cuidado LGPD: mensagem nunca revela motivo sensível, só "você tem atendimento agendado").
3. Registro de visita domiciliar com data planejada × realizada.

### Fase 9 — RMA e relatórios oficiais (3–4 semanas) ⭐ diferencial de venda
1. Motor de apuração do RMA: implementar campo a campo os Formulários 1 (CRAS, CREAS, Centro POP) e o Formulário 2 (registro por família/NIS), com as regras de contagem dos manuais (ex.: recepção/triagem não conta como atendimento; famílias contadas 1× no mês; blocos C e D do CRAS).
2. Tela de conferência mensal: número calculado + detalhamento clicável (drill-down até os registros) + ajuste manual com justificativa auditada.
3. Fechamento do mês com trava de edição retroativa (reabertura só por coordenador, auditada).
4. Exportações: PDF espelho do formulário oficial (para digitação no sistema do MDS), CSV/XLSX.
5. Relatórios gerais parametrizáveis: atendimentos por período/serviço/território, benefícios concedidos, famílias em acompanhamento, produtividade por profissional (cuidado com uso gerencial — expor como apoio, não ranking).

### Fase 10 — Vigilância socioassistencial e dashboards (3 semanas)
1. Dashboard do gestor: atendimentos do mês, acompanhamentos ativos, benefícios/orçamento, encaminhamentos pendentes, séries históricas.
2. Mapa: famílias e demandas geocodificadas, camadas por serviço/vulnerabilidade, mapa de calor por bairro/território (agregado — nunca pino identificado para perfil sem permissão).
3. Indicadores derivados do CadÚnico importado (perfil socioeconômico por território) para diagnóstico e Plano Municipal de Assistência Social.

### Fase 11 — Importação CadÚnico e integrações (3 semanas)
1. Importador da base do CadÚnico (arquivos extraídos pelo gestor municipal via CECAD/desiderata local): upload, parsing, conciliação com cadastro existente (match por NIS/CPF/nome+nascimento), tela de revisão de conflitos, log completo.
2. Atualização recorrente: nova importação atualiza famílias e marca desatualizações (>24 meses → alerta de atualização cadastral, que também é campo do RMA).
3. Preparar adaptadores (interfaces isoladas) para futuras integrações: Prontuário Eletrônico do SUAS/CadÚnico em tempo real quando houver API disponível ao município, ViaCEP, provedor de mensageria.
4. Importador genérico de sistemas concorrentes (CSV mapeável) — **crítico para migração de clientes na venda**.

### Fase 12 — Endurecimento LGPD/segurança e acessibilidade (2–3 semanas)
1. Revisão do RIPD × implementado; rotinas de retenção/anonimização; atendimento a direitos do titular (extrato de dados, correção, eliminação com salvaguarda de obrigações legais).
2. Pentest básico, revisão OWASP, rate limiting, criptografia em repouso dos campos sensíveis (evoluções, motivos de violação de direitos).
3. Acessibilidade eMAG/WCAG 2.1 AA no front (prefeituras cobram): navegação por teclado, contraste, leitores de tela — auditar as 10 telas principais.
4. Teste de carga simulando fechamento de RMA no fim do mês (pico previsível).

### Fase 13 — Piloto, migração e treinamento (3–4 semanas)
1. Implantação na prefeitura piloto: carga do CadÚnico, cadastro da rede, treinamento por perfil (recepção 2h, técnicos 4h, gestor 4h), material EAD/vídeos curtos.
2. Operação assistida por 1 ciclo mensal completo até o primeiro RMA fechado no sistema.
3. Ajustes de usabilidade colhidos em campo (a recepção do CRAS é o teste de fogo da UX).

### Fase 14 — Produto e go-to-market multi-prefeitura (contínuo)
1. Onboarding self-service parametrizado (novo tenant em < 1 dia: wizard de unidades, territórios, tipos de benefício, importação CadÚnico).
2. Documentação para licitação: requisitos atendidos × Tipificação/RMA/LGPD/eMAG, política de portabilidade de dados, SLA.
3. Precificação sugerida: por faixa populacional do município (padrão do setor) com implantação + mensalidade.
4. Roadmap pós-lançamento: app mobile offline para visitas (diferencial IDS), índice de vulnerabilidade assistido por IA, portal do cidadão com Login Único gov.br, módulo de acolhimento institucional/família acolhedora completo, Cartão/vale benefício.

---

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Vazamento de dado sensível (dano reputacional fatal no setor) | RLS + testes de isolamento no CI, criptografia de campos sensíveis, auditoria de leitura, pentest antes do piloto |
| RMA divergente do manual do MDS | Implementar a partir dos manuais oficiais campo a campo, validar com a piloto comparando 1 mês preenchido manualmente × gerado |
| Resistência das equipes técnicas (mudança de prontuário papel → digital) | UX simples, impressão em PDF idêntica ao físico, treinamento por perfil, operação assistida |
| Municípios sem internet estável nos equipamentos | Front tolerante a queda (autosave), roadmap de modo offline no app de campo |
| Mudança normativa (novo prontuário eletrônico federal, novos campos RMA) | Tabelas de domínio versionadas por vigência; acompanhar blog Rede SUAS/MDS |
| Base do CadÚnico suja/duplicada | Conciliação assistida com revisão humana, nunca merge automático destrutivo |

## 8. Métricas de sucesso do módulo

- 1º RMA mensal fechado 100% pelo sistema na piloto (zero planilha paralela).
- Tempo médio de registro de um atendimento < 2 min.
- Zero incidentes de acesso indevido a evolução sigilosa.
- Onboarding de novo tenant em ≤ 1 dia útil.
- NPS das equipes técnicas ≥ 8 após 60 dias.
