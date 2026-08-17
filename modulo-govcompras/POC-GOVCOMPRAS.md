# POC — GovCompras

## Objetivo

Demonstrar que é possível trocar o acompanhamento fragmentado de compras públicas — planilhas paralelas, e-mails soltos, "cadê o processo?" perguntado no corredor — por um sistema único que sempre responde quatro perguntas para qualquer processo: **o que está acontecendo, quem precisa agir, o que precisa ser feito, e até quando.**

## O problema que motivou o desenho

Hoje, em muitas prefeituras, uma contratação passa por Secretaria → Compras → Contabilidade → Jurídico → Licitação → Contrato → Fiscalização sem que nenhum sistema enxergue essa cadeia como uma coisa só. O resultado mais caro não é a falta de dado — é descobrir tarde: "o contrato vence essa semana e ninguém tinha percebido." O GovCompras foi desenhado para nunca deixar isso acontecer: todo contrato tem um alerta de vencimento e uma decisão explícita (nova contratação / prorrogação / encerramento) antes do prazo apertar, e a nova contratação já nasce vinculada ao contrato que ela substitui.

## Fluxo implementado

```
Necessidade → Solicitação → Planejamento (DFD/ETP/TR/Riscos) → Pesquisa de Preços
→ Dotação → Autorização → Parecer Jurídico → Edital → Publicação → Sessão
→ Julgamento → Adjudicação → Homologação → Contrato → Execução e Fiscalização
→ (alerta de vencimento) → decisão → processo sucessor
```

Esse é o fluxo do **Pregão** — o mais completo, com 17 etapas. Dispensa, Inexigibilidade, Credenciamento, Adesão a Ata e Contratação Emergencial têm fluxos próprios e mais curtos, todos configuráveis via `WorkflowTemplate` (nenhum é hardcoded no código do motor de workflow).

## Personas demonstradas

7 personas fictícias (ver README para credenciais), uma por perfil de RBAC: Administrador, Secretaria Solicitante (Saúde), Compras, Licitação, Contabilidade, Jurídico e Fiscal. O menu "Modo de demonstração" no cabeçalho troca de persona em um clique, sem precisar deslogar — pensado para quem for apresentar a POC alternar de papel durante a demonstração (seção 138 da especificação original).

## Funcionalidades demonstradas (o que é real, não maquete)

- **Autenticação**: SSO satélite da plataforma GovSistem (`module_access`) + ponte de login de demonstração; RBAC com 8 perfis e 40+ permissões granulares, sempre checadas no backend.
- **Motor de workflow**: abrir processo, avançar etapa (bloqueado por pendências reais — DFD/ETP/TR aprovados, dotação confirmada, etc.), devolver com justificativa obrigatória e notificação, cancelar, reabrir. Histórico imutável (append-only).
- **Solicitações**: criação em etapa única com itens, envio que abre o processo já na primeira etapa do workflow escolhido.
- **Planejamento**: DFD, ETP (com roteiro padrão de tópicos), Termo de Referência (versionado), Matriz de Riscos — tudo editável e aprovável dentro do processo.
- **Compras**: catálogo municipal de itens com histórico de preços, cadastro de fornecedores, pesquisa de preços com múltiplos fornecedores e mapa comparativo (menor/média/mediana/maior, com alerta de valor 30%+ fora da mediana — nunca decide sozinho, só avisa).
- **Dotação e Autorização**: encaminhamento à Contabilidade, confirmação/indisponibilidade, decisão da autoridade competente.
- **Licitação**: edital (com templates e variáveis `{{numero_processo}}` etc.), publicações, sessão, propostas, adjudicação, homologação.
- **Contratos**: geração a partir da homologação (o processo continua vivo, avança para "Execução e Fiscalização" em vez de morrer), barra de vigência, saldo financeiro, aditivos, apostilamentos, ocorrências de fiscalização.
- **Central de Vencimentos**: contratos por janela de dias, com decisão pré-vencimento que **cria automaticamente o processo sucessor** já vinculado ao contrato de origem (`processo_origem_id`/`origem_contrato_id`), sem copiar documentos como se já estivessem prontos.
- **Atas de Registro de Preços**: saldo por item (registrado/reservado/utilizado) com barra de consumo.
- **Dashboard**: indicadores em tempo real, alertas "Atenção necessária", relatório de gargalos (tempo médio e maior atraso por etapa).
- **Minhas Pendências**: visão pessoal por setor/usuário responsável.
- **Busca global**: por número de processo/contrato, objeto, fornecedor, CNPJ; painel "quem está com o processo" (seção 134).
- **Auditoria**: toda ação crítica (criar, avançar, devolver, cancelar, reabrir) gravada em log imutável.
- **Notificações**: geradas automaticamente em cada mudança de responsável.

## Cenário de dados semeado (`api/scripts/seed.py`, idempotente)

1. **Cenário piloto completo**: Secretaria de Saúde solicita 20 computadores → percorre DFD, ETP, TR, matriz de risco, pesquisa de preços com 3 fornecedores reais (com mapa comparativo), dotação, autorização, parecer jurídico, edital, publicação, sessão, 3 propostas, adjudicação, homologação, contrato (vencendo em 30 dias, para gerar alerta), fiscalização com ocorrência registrada, e um **processo sucessor já aberto** vinculado ao contrato.
2. Contrato de sistema de gestão vencendo em 45 dias.
3. Contrato de fornecimento de medicamentos vencendo em 180 dias.
4. Ata de materiais de expediente 82% consumida.
5. Pregão travado na etapa "Parecer Jurídico" além do SLA (status crítico).
6. Pesquisa de preços parada há 14 dias (status crítico).
7. Processo devolvido à secretaria solicitante com justificativa registrada.

Todas as datas são calculadas em relação ao momento em que o seed roda — nunca fixas — para o cenário continuar coerente não importa quando for demonstrado.

## Limitações desta POC (deliberadas, não esquecimento)

Sinalizadas na própria interface como "funcionalidade prevista para próxima fase" em vez de simuladas (seção 126 da especificação):

- **PCA (Plano de Contratações Anual)** — modelo de dados não implementado.
- **Relatórios avançados** (economia, itens mais comprados, exportação XLSX/PDF) — só o relatório de gargalos é real hoje.
- **Assistente de IA** — não implementado; a especificação exige revisão humana obrigatória em qualquer conteúdo gerado por IA, o que tornaria o recurso mais caro que o valor demonstrável em uma POC.
- **Upload real de arquivos** — o modelo `Documento` existe e tem API, mas o upload de binário (drag-and-drop, antivírus, assinatura) não foi construído; hoje é só metadado.
- **Assinatura digital ICP-Brasil** — fora do escopo desta fase.
- **Integrações reais** (PNCP, Portal da Transparência, Diário Oficial, e-mail, WhatsApp) — a camada de adapter existe (`app/services/integracoes/`) e cada tentativa é registrada em `IntegracaoLog`, mas nenhuma chamada de rede real é feita, para não fingir uma integração que não existe.
- **Command Palette (Ctrl+K)** — a busca global existe via barra de busca; o atalho dedicado não foi implementado.
- **Agenda e Prazos consolidados** — cada prazo já existe nos seus respectivos módulos (sessões, vencimentos); a visão de calendário único não foi construída.
- **Edição de workflow pela interface** — os 6 templates são reais e consultáveis (`Administração > Workflows`), mas criar/editar etapas hoje é só via API; a tela de edição fica para a próxima fase.
- **Certidões de fornecedor** — modelo e API existem; tela de upload/alerta de vencimento não foi construída.

## Próximos passos sugeridos

1. Upload de documentos com storage real (S3/MinIO), seguindo o padrão já usado em `modulo-govdoc`.
2. PCA e integração "transformar item do PCA em solicitação".
3. Editor de workflow pela interface (hoje só leitura).
4. Integração real com PNCP quando a API oficial e as credenciais estiverem disponíveis.
5. Assistente de IA assistivo (nunca autônomo) para rascunhos de DFD/ETP/TR.
6. Publicação do módulo atrás do nginx de borda (passos documentados no README, não executados nesta entrega).

## Checklist do que foi efetivamente testado

- [x] `pytest` — 29 testes (autenticação SSO + demo, workflow completo incluindo bloqueio por pendência, devolução, cancelamento, cálculo de SLA nas 4 faixas, geração de contrato a partir de homologação, decisão de vencimento com processo sucessor, RBAC negando ações fora do perfil, seed idempotente) — verde tanto localmente (SQLite) quanto dentro do contêiner Docker.
- [x] `ruff check` — sem erros.
- [x] Migrations Alembic aplicadas do zero contra PostgreSQL real (`alembic upgrade head`) e verificadas sem drift (`alembic check` limpo).
- [x] `docker compose up -d --build` — sobe Postgres + API + Web, roda migration e seed automaticamente, idempotente em reinício.
- [x] `npm run build` (TypeScript estrito + Vite) e `npm run lint` (oxlint) — sem erros.
- [x] Percurso end-to-end via navegador real (Playwright) contra o build Docker completo: login por persona, dashboard, lista e detalhe de processo com linha do tempo/pendências/avançar, abas de Planejamento e Licitação, lista de contratos, Central de Vencimentos, filtro de atrasados, troca de persona e "Minhas Pendências" — **zero erros de console**.
- [x] Checklist funcional da seção 146 da especificação: entrar como Secretaria → criar solicitação → enviar para Compras → pesquisa de preços → Contabilidade confirma dotação → Licitação cria processo, edital, resultado, contrato → Fiscal registra execução → contrato próximo do vencimento → processo sucessor criado automaticamente → timeline completa desde a solicitação original visível no processo — tudo demonstrável com os dados semeados, sem precisar criar nada manualmente.
