# GOVSOCIAL — Auditoria de prontidão para produção e plano para liderança nacional

**Data-base da análise:** 8 de agosto de 2026  
**Escopo:** módulo de Assistência Social (SUAS) da plataforma GovSistem  
**Entrada analisada:** inventário técnico e funcional fornecido pelo responsável do produto (`Texto colado(5).txt`)  
**Objetivo:** separar o que já representa uma boa fundação, o que impede produção real e o que diferencia um sistema municipal de excelência.

## 1. Parecer executivo

O GOVSOCIAL tem uma base funcional acima da média de um protótipo: domínio SUAS amplo, API extensa, multi-tenancy, trilha de auditoria, sigilo por lotação, rotinas de RMA, trabalho offline, fluxos de família, atendimento, benefício, grupos, agenda, encaminhamentos e administração. O inventário indica também uma quantidade relevante de testes históricos.

Ainda assim, **o sistema não deve receber um “go-live irrestrito” neste estado**. O impedimento não é a ausência de mais telas; é a impossibilidade atual de provar que o artefato implantado nasce do fonte correto, passa por uma cadeia de verificação reproduzível e protege os dados socioassistenciais com segredos de produção, isolamento de tenant e restauração testada. Os quatro bloqueadores mais graves são:

1. `package.json` incompleto, impedindo reconstrução e execução oficial de typecheck, lint, testes unitários e E2E;
2. divergência entre `outDir: dist-build` e o caminho copiado pelo Dockerfile, somada ao histórico de bundle corrompido e artefatos de duas gerações;
3. segredo JWT e chave interna iguais a defaults de desenvolvimento, permitindo forjar confiança entre SaaS e módulo se a pendência existir no ambiente publicado;
4. contrato OpenAPI desatualizado, impedindo demonstrar cobertura dos aproximadamente 363 endpoints e detectar quebras entre frontend e backend.

Portanto, os rótulos “100% funcional” do inventário devem ser tratados como **alegações históricas ainda não revalidadas**, e não como evidência atual de produção. Isso não desmerece o trabalho existente; define a ordem correta: primeiro recuperar a capacidade de provar, depois ampliar.

### Decisão de implantação

| Decisão | Condição objetiva |
|---|---|
| **NO-GO público/multimunicípio agora** | Enquanto houver segredo padrão, build não reproduzível, testes indisponíveis, artefato de origem ambígua ou restauração não ensaiada. |
| **Piloto controlado** | Somente após todos os gates P0 deste documento, base fictícia ou dados minimizados, tenant isolado e plano de retorno exercitado. |
| **Produção municipal** | P0 concluído, P1 essencial concluído, pentest independente sem achado crítico/alto aberto, RIPD e políticas aprovados, restore drill aprovado e operação assistida. |
| **Escala comercial nacional** | Além do anterior: observabilidade/SLO, suporte e incidentes, portabilidade/saída, adaptadores regulatórios versionados, acessibilidade manual e homologação por perfis reais de CRAS/CREAS/Centro POP/acolhimento/gestão. |

## 2. Limites e nível de confiança

Esta é uma **auditoria de arquitetura, produto, conformidade e prontidão baseada no inventário fornecido e em referências públicas**. O repositório, banco, imagens Docker, ambiente publicado, logs, migrations e pipelines não estavam anexados. Assim:

- foi possível analisar coerência, risco, cobertura de domínio e lacunas declaradas;
- não foi possível confirmar a contagem de endpoints/testes, executar o SPA, verificar migrations, validar isolamento de tenant, inspecionar segredos implantados ou reproduzir o build;
- toda afirmação sobre código existente deve ser transformada em evidência automatizada na primeira onda de trabalho;
- o bundle antigo pode ser usado apenas como evidência forense de comportamento e layout, nunca como fonte confiável a ser desminificada e reincorporada;
- “conforme LGPD”, “ICP-Brasil”, “integração oficial CadÚnico/Prontuário SUAS” e “100% funcional” não devem aparecer em material comercial até haver evidência específica e aprovação competente.

## 3. O que já é forte

### 3.1 Domínio e fluxo de trabalho

- A separação entre recepção e atendimento técnico evita contaminar RMA e prontuário com triagem administrativa.
- O sigilo por lotação, a visão de rede sem conteúdo, a revelação consciente e a auditoria de leitura sensível refletem necessidades reais do trabalho socioassistencial.
- O atendimento rápido, autosave, fila offline e idempotência respondem ao contexto de conexão instável e alta carga operacional.
- RMA com cálculo, ajuste justificado, fechamento, reabertura, espelho e drill-down está na direção correta; poucos produtos demonstram a origem de cada número.
- A noção de vigência em domínios e benefícios é uma base importante para leis municipais que mudam no tempo.
- O histórico de vínculos pessoa–família e o merge auditado são melhores do que sobrescrever cadastros silenciosamente.
- A arquitetura de backend é moderna e adequada ao porte: FastAPI assíncrono, PostgreSQL, Alembic, Redis/Celery e armazenamento de objetos.

### 3.2 Engenharia já prevista

- RFC 9457, idempotency keys, testes de tenant, auditoria append-only e mascaramento em listagens são bons fundamentos.
- O frontend documenta estados offline, acessibilidade, validação compartilhada e fluxos E2E.
- O onboarding por organização e seed idempotente favorece implantação multimunicípio.
- O uso de jobs para importação, PDF, notificações e LGPD evita bloquear requisições longas.

Esses pontos devem ser preservados por testes de caracterização antes de qualquer refatoração ampla.

## 4. A mudança estratégica mais importante em 2025–2026

O GOVSOCIAL não está entrando em um mercado parado. O MDS informa que o novo **Prontuário Eletrônico do SUAS foi lançado nacionalmente em 18 de dezembro de 2025**, com registros individualizados e coletivos, planos de acompanhamento, encaminhamentos e visitas domiciliares. A Resolução CIT nº 29/2025 reforça finalidade, ética, sigilo, custódia e proteção de dados. O novo Cadastro Único, implantado em 2025, passou a usar o CPF como chave central e ampliou integrações nacionais.

Isso muda o posicionamento ideal:

- o GOVSOCIAL não deve vender “um prontuário paralelo que substitui o federal”;
- deve ser a **camada municipal de operação, qualidade, integração, gestão e evidência**, com adaptador para o Prontuário SUAS quando houver contrato técnico oficial disponível;
- deve registrar proveniência, versão do leiaute, estado de sincronização e divergências, sem alegar integração por scraping ou endpoint não autorizado;
- deve continuar atendendo pessoas sem CPF, indocumentadas, migrantes e população em situação de rua com um identificador interno seguro; “CPF central no Cadastro Único” não pode virar barreira de acesso ao SUAS;
- deve distinguir o IVCAD oficial de qualquer IVS municipal próprio. Índices locais precisam de fórmula, versão, fontes, limitações, explicação e revisão humana.

Fonte principal: [Relatório de Gestão 2025 do MDS](https://www.gov.br/mds/pt-br/acesso-a-informacao/auditorias/RELATORIO_GESTAO_2025_defeso.pdf/%40%40download/file), [legislação do Cadastro Único](https://www.gov.br/mds/pt-br/acoes-e-programas/cadastro-unico/legislacao), [IVCAD](https://www.gov.br/mds/pt-br/orgaos/SAGICAD/dados-e-ferramentas-informacionais/ivcad) e [índice de resoluções da CIT/Rede SUAS](https://blog.mds.gov.br/redesuas/cit/).

## 5. Referencial que deve orientar o produto

| Eixo | Referência | Consequência para o GOVSOCIAL |
|---|---|---|
| Organização do SUAS | [PNAS/2004](https://www.mds.gov.br/webarquivos/publicacao/assistencia_social/normativas/pnas2004.pdf), [NOB/SUAS 2012](https://www.mds.gov.br/webarquivos/public/NOBSUAS_2012.pdf), [Tipificação — Resolução CNAS 109/2009](https://www.mds.gov.br/webarquivos/public/resolucao_CNAS_N109_%202009.pdf) | Serviços, unidades, públicos, seguranças afiançadas, níveis de proteção e resultados devem ter códigos e vigências rastreáveis. |
| Trabalho social | [Orientações PAIF](https://www.mds.gov.br/webarquivos/publicacao/assistencia_social/Cadernos/Orientacoes_PAIF_2.pdf) e [orientações do Prontuário SUAS](https://www.justica.pr.gov.br/sites/default/arquivos_restritos/files/documento/2020-09/orientacao_tecnica_03_prontuario_suas.pdf) | Atendimento pontual não é acompanhamento; PAF/PIA, objetivos, compromissos, evolução, encerramento e avaliação precisam ser entidades próprias. |
| Benefícios eventuais | [Orientações técnicas do MDS](https://www.mds.gov.br/webarquivos/publicacao/assistencia_social/Cadernos/PB022-0519_SNAS_Benefi%CC%81cios%20Eventuais.pdf) | Critérios locais versionados, concessão ágil, quatro contingências e vedação de contrapartida. Não confundir itens de saúde/educação com benefício eventual do SUAS. |
| Cadastro Único | [Portaria 810 consolidada](https://www.gov.br/mds/pt-br/acesso-a-informacao/legislacao/portaria/Portaria_N_810_texto_consolidado_dezembro_2025.pdf) e [Informe 66/2025](https://www.gov.br/mds/pt-br/acoes-e-programas/cadastro-unico/original/informes/2025/informe_cadastro_unico_n_66) | CPF como chave nacional quando disponível; importação versionada, finalidade e cessão controladas; divergência nunca deve sobrescrever dado local sem reconciliação. |
| RMA/Censo | [Manual RMA CREAS XML](https://aplicacoes.mds.gov.br/sagi/atendimento/doc/Manual%20de%20uso%20XML_CREAS.pdf) e relatório do MDS | Regras por competência e versão; linhagem de cada célula; reconciliação; prontidão para Censo SUAS e indicadores de unidades. |
| Proteção de dados | [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709compilado.htm), [guia ANPD para Poder Público](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_tratamento_de_dados_pessoais_pelo_poder_publico), [RIPD](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/relatorio-de-impacto-a-protecao-de-dados-pessoais-ripd) | Finalidade e base legal por tratamento, minimização, retenção, direitos do titular, RIPD para alto risco e governança do encarregado. “Excluir” exige decisão de retenção, não `DELETE` cego. |
| Incidentes | [ANPD — comunicação de incidente](https://www.gov.br/anpd/pt-br/assuntos/comunicacao-de-incidentes-de-seguranca-cis) | Fluxo de classificação e comunicação, relógio regulatório, preservação de evidência e modelos de comunicação. O prazo geral informado pela ANPD para incidente relevante é de três dias úteis após conhecimento pelo controlador. |
| Sigilo profissional | [Código de Ética do CFESS](https://www.cfess.org.br/arquivos/CEP_CFESS-SITE.pdf) e [Resolução CFESS 1.098/2025](https://www.cfess.org.br/uploads/legislacao/5138/1098-2025.pdf) | Acesso por necessidade, custódia e guarda documental; compartilhamento mínimo e justificado; registros técnicos não podem ser expostos ao gestor apenas por hierarquia administrativa. |
| Segurança | [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/), [OWASP API Security Top 10](https://owasp.org/www-project-api-security/), [NIST SSDF 1.1](https://csrc.nist.gov/pubs/sp/800/218/final) | ASVS nível 2 como piso e controles selecionados do nível 3 para evolução, PIA, violência, crianças, biometria e documentos. SDLC, inventário de API e supply chain verificáveis. |
| Acessibilidade | [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [eMAG 3.1](https://www.gov.br/governodigital/pt-br/acessibilidade-e-usuario/acessibilidade-digital/modelo-de-acessibilidade) e [Lei Brasileira de Inclusão](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm) | Meta WCAG 2.2 AA + eMAG, com testes automáticos e manuais; axe sozinho não comprova acessibilidade. |
| Interoperabilidade | [ePING](https://www.gov.br/governodigital/pt-br/estrategias-e-governanca-digital/sisp/guia-do-gestor/links/padroes-de-interoperabilidade-de-governo-eletronico-eping) e [Design System gov.br](https://www.gov.br/governodigital/pt-br/estrategias-e-governanca-digital/sisp/guia-do-gestor/guia-orientativo-de-padroes-e-fluxos-das-tecnologias-de-transformacao-digital/padrao-de-governo-digital-design-system) | Contratos abertos, formatos documentados, identidade visual e padrões de interação públicos, exportação e plano de saída. |
| Assinatura | [Lei 14.063/2020](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm), [Decreto 10.278/2020](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/decreto/D10278.htm) e [documentos PAdES da ICP-Brasil](https://www.gov.br/iti/pt-br/central-de-conteudo/resolucao-109-pdf) | Definir nível de assinatura por tipo documental; canvas e hash são evidências, mas não equivalem automaticamente a assinatura qualificada. Validar cadeia, revogação, tempo e integridade. |

## 6. Comparação com editais e mercado

O [Termo de Referência de Joinville/SC de 2025](https://www.joinville.sc.gov.br/public/edital/anexo/fa2732456811031128b010c4a93ff985.pdf) é a referência comparativa mais útil encontrada: exige prova de conceito, migração, implantação, estabilização assistida, treinamento, homologação, integrações e requisitos detalhados de prontuário, relatórios técnicos, demanda reprimida, encaminhamentos, RMA, benefícios, acolhimento, agenda e gestão. O [TR de Cajamar/SP](https://cajamar.sp.gov.br/fazenda/wp-content/uploads/sites/15/2022/12/consulta-publica-n-264-2022-contratacao-de-sistema-de-gestao-para-o-suas.pdf) acrescenta CECAD/SICON/SIBEC, PAF/PIA, proteção especial, acolhimento, pagamentos, georreferenciamento e operação móvel. Requisitos antigos de biometria ou expiração arbitrária de senha não devem ser copiados sem análise atual de risco.

Soluções como [GESUAS](https://www.gesuas.com.br/), [SociÁgil](https://www.sociagil.com.br/), [Inovadora](https://www.inovadora.com.br/solucao/assistencia-social/) e [SalutarWeb](https://www.abase.com.br/10481/tecnologia/salutarweb-plataforma-para-a-gestao-da-assistencia-social/) mostram que prontuário, RMA automático, territorialização, financeiro, mobilidade, implantação e capacitação já são requisitos de entrada. O diferencial sustentável do GOVSOCIAL não será ter mais um mapa ou uma câmera; será provar:

- sigilo e isolamento multimunicípio melhores;
- origem auditável dos números de RMA e indicadores;
- regras municipais versionadas e explicáveis;
- operação offline de campo com reconciliação segura;
- migração e portabilidade sem aprisionamento;
- acessibilidade real;
- implantação observável, restauração testada e atualizações regulatórias controladas;
- inteligência assistiva sem decisão automatizada sobre direitos.

## 7. Matriz de prontidão atual

Os estados abaixo são diagnósticos a confirmar no repositório; não são certificação.

| Área | Estado | Evidência favorável | Lacuna que impede excelência/produção |
|---|---|---|---|
| Fluxos centrais Fases 1–9 | **Amarelo** | Páginas, APIs e testes históricos documentados | Testes não executáveis pelo manifesto atual; dist de origem ambígua. |
| Backend e domínio | **Amarelo** | Cobertura funcional ampla e 208 testes declarados | OpenAPI antigo; vários módulos podem ser stub; não há auditoria direta de rotas, migrations e N+1. |
| Build/deploy | **Vermelho** | Docker e Vite existentes | `dist` x `dist-build`, artefatos antigos, histórico de fonte perdido, package incompleto. |
| Identidade/SSO | **Vermelho** | RBAC e sincronização declarados | Segredo padrão crítico; JWT em query; sessão em `sessionStorage`; ausência de prova de issuer/audience/JWKS/rotação/revogação. |
| Multi-tenancy | **Amarelo alto risco** | `tenant_id` e fail-closed declarados | Filtragem apenas na aplicação não é defesa suficiente; verificar jobs, Redis, MinIO, WebSocket, relatórios e SQL bruto. |
| Sigilo/auditoria | **Amarelo** | Escopo por lotação e trigger append-only | Superusuário ainda pode alterar DB; falta exportação imutável, verificador de integridade, política de retenção e acesso emergencial. |
| Criptografia | **Vermelho operacional** | Fernet em campos sensíveis | Rotação destrutiva declarada; falta keyring/versionamento/envelope encryption e backup seguro das chaves. |
| LGPD | **Amarelo/vermelho** | Exportação, consentimento, exclusão e auditoria | Consentimento não é base universal no Poder Público; exclusão precisa retenção/legal hold; faltam ROPA, RIPD, DSAR, incidente e classificação. |
| RMA | **Amarelo forte** | Cálculo, ajuste, fechamento, export e drill-down | Falta provar regra oficial por competência, linhagem célula→eventos, reconciliação e adaptação às mudanças. |
| Importações | **Amarelo** | Jobs e conciliação no backend | UI e governança de leiaute/arquivo/erros/rollback/proveniência insuficientes. |
| Assinatura | **Vermelho sem qualificação** | SHA, PDF/A e estratégias declaradas | Hash/canvas não provam assinatura ICP-Brasil; validar PAdES, cadeia, revogação, timestamp e política documental. |
| Acessibilidade | **Amarelo** | Axe e componentes acessíveis declarados | Sem execução e sem avaliação manual com teclado/leitor/zoom/reflow/contraste. |
| Observabilidade/SRE | **Vermelho** | Redis/Celery e health presumidos | Sem SLO, tracing, alertas, runbooks, métricas de fila, restore drill, RTO/RPO comprovados. |
| Módulos recuperados/perdidos | **Vermelho funcional** | APIs e bundle antigo | Sem fonte, rota, testes ou UX atual; não são funcionalidade de produção. |
| IA/biometria/pânico | **Vermelho alto risco** | Rotas/stubs declarados | Necessidade, proporcionalidade, RIPD, operação humana, vieses, fallback e responsabilidade não demonstrados. |

## 8. P0 — bloqueadores absolutos de produção

### P0.1 Recuperar a fonte da verdade e tornar o build reproduzível

1. Inventariar branch atual, `master`, tags, arquivos não rastreados, composes, imagens e dist, preservando mudanças do usuário.
2. Restaurar `package.json` a partir do `package-lock.json`, histórico Git e imports reais; não preencher versões “no chute”. Usar `npm ci`, não `npm install`, no CI.
3. Restaurar scripts `typecheck`, `lint`, `test`, `test:coverage`, `e2e`, `e2e:a11y` e `build` com versões fixadas.
4. Unificar o diretório de saída em uma constante (`dist` ou `dist-build`) e fazer Dockerfile, Vite, nginx e CI usarem o mesmo caminho.
5. Construir em checkout limpo e imagem sem cache; falhar se existirem chunks não referenciados, assets de geração antiga, sourcemaps públicos não autorizados ou arquivos fora do manifesto.
6. Usar assets com hash de conteúdo e cache `immutable`; servir `index.html`/manifesto com `no-cache` ou `no-store`. Remover o versionamento manual `/assets/v2/` como mecanismo de correção.
7. Incluir `build-info.json` sem segredo, contendo commit, árvore limpa/suja, versão, horário UTC, hash do OpenAPI e hash do lockfile. Expor a versão no rodapé/admin e endpoint de saúde.
8. Proibir implantação de `dist` versionado como fonte. Se artefatos de release permanecerem no Git, isolá-los e provar que o deploy usa exatamente o artefato assinado do pipeline.
9. Reproduzir especificamente a FichaFamilia em build limpo e criar E2E que abra todas as abas, revele conteúdo conforme papel, recarregue com cache e valide ausência de exceção JS.

**Aceite:** um clone limpo, sem `node_modules` e sem dist prévio, executa todos os gates e gera uma imagem cujo hash é o implantado; o pipeline reprova qualquer divergência.

### P0.2 Corrigir identidade, sessão e segredos

1. Rotacionar imediatamente os dois segredos conhecidos e investigar logs desde sua primeira exposição; invalidar tokens/chaves antigos.
2. Substituir segredo JWT compartilhado por assinatura assimétrica com `kid` e JWKS, ou por troca de código de uso único no backend. Validar `iss`, `aud`, `exp`, `nbf`, `iat`, `jti`, organização, módulo e nonce.
3. Parar de transportar um JWT reutilizável em `?token=`. Preferência: SaaS entrega código curto de uso único; backend troca por sessão `HttpOnly`, `Secure`, `SameSite` adequada, com proteção CSRF. Se houver transição, limpar URL antes de recursos externos, definir `Referrer-Policy: no-referrer`, impedir logging do query string e limitar TTL a minutos.
4. Criar rotação com sobreposição de chaves, revogação por `jti`/sessão, logout global, reautenticação para operações críticas e política de sessão ociosa/absoluta configurável.
5. Guardar segredos em secret manager/Vault/KMS ou mecanismo equivalente do ambiente, nunca no compose, imagem, `.env` versionado, logs ou frontend.
6. Tornar a chave interna específica por ambiente e por consumidor; preferir mTLS/OAuth client credentials a uma chave global. Aplicar escopo, rate limit e rotação.
7. Executar secret scanning em todo histórico e artefatos; documentar resposta se um segredo real já foi commitado.

**Aceite:** token forjado com segredo antigo, issuer errado, audience errada, tenant adulterado, `kid` desconhecido, token repetido de código one-time ou token revogado falha sem revelar detalhe; nenhum token aparece em URL, analytics, access log ou `Referer`.

### P0.3 Provar isolamento de tenant e sigilo

1. Mapear todas as tabelas, buckets, chaves Redis, filas Celery, WebSockets, relatórios, exports, caches e índices de busca que carregam `tenant_id`.
2. Adotar PostgreSQL Row-Level Security em tabelas de negócio, com `ENABLE` + `FORCE ROW LEVEL SECURITY`, `USING` e `WITH CHECK`, usuário da aplicação sem `BYPASSRLS` e contexto de tenant local à transação.
3. Manter os filtros da aplicação como primeira defesa; RLS é defesa em profundidade.
4. Impedir cache sem prefixo de tenant e usuário/escopo quando o conteúdo depender de sigilo; invalidar cache ao mudar lotação/papel.
5. Separar objeto por tenant ou prefixo inescapável; URLs assinadas curtas devem ser geradas só após autorização e registrar download.
6. Revalidar autorização no handshake e durante a vida do WebSocket; revogar conexão ao encerrar sessão/lotação.
7. Criar suíte sistemática A×B para cada endpoint, método, papel, estado, objeto e caminho indireto, inclusive export, PDF, erro, busca, merge, jobs e IDs previsíveis.
8. Tratar acesso cross-tenant uniformemente sem permitir enumeração; registrar tentativa com dados mínimos.

**Aceite:** nenhum teste consegue ler, inferir, alterar, anexar, exportar, enfileirar ou receber evento de outro tenant; o teste também falha se a camada de serviço esquecer o filtro, demonstrando que a RLS funciona.

### P0.4 Restaurar contrato e gates de qualidade

1. Gerar OpenAPI 3.1 diretamente do app inicializado com todos os routers; proibir manutenção manual.
2. Comparar o inventário real com o contrato: rota, método, tags, autenticação, capacidade, request/response, RFC 9457 e exemplos.
3. Validar o documento com linter; executar diff de quebra; gerar tipos/clientes ou validar schemas no frontend.
4. Criar teste que falhe quando um router não estiver incluído ou uma resposta real divergir do schema.
5. Classificar cada um dos ~363 endpoints como `production`, `beta`, `stub`, `internal`, `deprecated` ou `dead`; esconder/desabilitar stub em produção.
6. Corrigir `/relatorios/novo` como rota estática antes de `/:id` e validar o identificador por tipo (por exemplo UUID), impedindo que palavras reservadas sejam aceitas como ID.
7. Zerar `any` não justificado no código de produto, `alert()`/`confirm()` e exceções de lint; usar fronteiras tipadas e componentes de feedback acessíveis.

**Aceite:** API, frontend, mocks e documentação partem do mesmo contrato; CI detecta quebra; todas as rotas são alcançáveis e têm proprietário/status.

### P0.5 Backup, criptografia e recuperação

1. Definir, aprovar e medir RPO/RTO. Meta inicial recomendada, a validar com a infraestrutura: dados críticos RPO ≤ 15 minutos e RTO ≤ 4 horas; metas mais agressivas só após exercício.
2. Implantar base backup + arquivamento contínuo de WAL/PITR no PostgreSQL, versões/replicação de objetos MinIO, backup de Redis apenas para o que não puder ser reconstruído e backup cifrado do material de chaves.
3. Adotar cópias 3-2-1, uma imutável/offline, contas de backup separadas e alertas de falha.
4. Restaurar trimestralmente em ambiente isolado, verificar hashes, migrations, contagem e amostra funcional; medir RPO/RTO real. Backup sem restore drill não é evidência.
5. Substituir a chave Fernet única por envelope encryption/keyring versionado: cada ciphertext identifica versão do DEK; KEK protegida por KMS/HSM/secret manager; rotação recriptografa em lotes idempotentes e retomáveis; chaves antigas ficam disponíveis até concluir e validar.
6. Criar ferramenta de verificação de cifrados e relatório de registros não decriptáveis antes/depois de rotação.
7. Não executar migration destrutiva ou rotação sem backup validado, dry-run, lotes, métricas e rollback.

**Aceite:** um cenário de perda total é restaurado dentro da meta, incluindo anexos e capacidade de decriptar dados históricos; relatório assinado do exercício fica arquivado.

### P0.6 Operabilidade e segurança mínima

- Healthchecks separados: liveness, readiness e startup; readiness inclui dependências críticas sem causar efeito cascata.
- OpenTelemetry para traces, métricas e logs correlacionados por request/job, sem CPF, NIS, nome, evolução, token ou conteúdo de documento.
- Métricas de erro, latência, saturação, conexão DB, fila, idade do job, retry/DLQ, WebSocket, storage e integração.
- SLO e alertas acionáveis; runbooks de indisponibilidade, fila presa, importação, vazamento, chave, tenant, restore e rollback.
- CI com SAST, SCA, secret scan, scan de imagem/IaC, SBOM CycloneDX/SPDX, licença e assinatura/proveniência de imagem. DAST e pentest antes do go-live.
- Upload em quarentena, detecção por magic bytes, limite, nome aleatório, antivírus, bloqueio/sanitização de formatos ativos e política de retenção.
- Migrations com expand/contract, lock timeout, teste N-1→N, observação pós-deploy e rollback compatível; não depender de `alembic upgrade head` simultâneo em múltiplas réplicas.

Referências técnicas: [RLS do PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [PITR](https://www.postgresql.org/docs/current/continuous-archiving.html), [OpenTelemetry](https://opentelemetry.io/docs/what-is-opentelemetry/) e [guias de privacidade e segurança do Governo Digital](https://www.gov.br/governodigital/pt-br/privacidade-e-seguranca/guias-e-modelos/pagina_guias_e_modelos).

## 9. P1 — produto municipal completo e juridicamente operável

### 9.1 Registros técnicos, PAF/PIA e demanda

- Separar atendimento, acompanhamento e concessão de benefício.
- Criar PAF/PIA com participantes, diagnóstico sintético, objetivos, ações, responsável, prazo, indicador de resultado, revisões, adesão/ciência, encerramento e motivo.
- Evolução e relatório técnico publicados são imutáveis; correção ocorre por errata/averbação ligada ao original, preservando autor, horário e razão.
- Implementar demanda reprimida/lista de espera por serviço, gravidade/urgência transparente, data, tentativas de contato, critérios, capacidade, caseload e reavaliação. Nunca criar “pontuação secreta”.
- Ofícios, relatórios e encaminhamentos devem ter prazo, versão, protocolo, envio, recebimento, devolutiva e anexos.

### 9.2 Domicílio, identidade e histórico

- Transformar domicílio em entidade temporal: endereço, características, geocódigo, território e moradores/famílias com vigência.
- Preservar histórico de endereço, composição familiar, documentos, nome social e vínculos; nunca reescrever o passado.
- Suportar pessoa sem CPF/NIS/endereço, nome ignorado, data aproximada, situação de rua, migrante/refugiado e identidade em apuração. Usar identificador interno e fila de reconciliação.
- Deduplicação deve apresentar sinais e diferenças; merge requer capacidade, justificativa, preview, transação, mapa de IDs e reversão administrativa controlada.

### 9.3 Benefícios eventuais

- Motor de critérios por tenant, tipo, lei/resolução local, vigência e território; salvar o snapshot da regra usada em cada decisão.
- Estados mínimos: rascunho, solicitado, triagem, avaliação, parecer, aprovado/indeferido, reservado, entregue/pago, cancelado e estornado, com transições por papel.
- Urgência não pode ficar presa a workflow burocrático; prever concessão emergencial justificada e revisão posterior.
- Não condicionar concessão à participação em grupo, palestra, PAIF/PAEFI ou outra contrapartida.
- Registrar ciência, recurso/revisão, motivo estruturado + texto, forma de provisão, valor/quantidade, fonte, estoque ou pagamento, entrega, recebedor/representante e evidência proporcional.
- Alerta de duplicidade deve informar regra e histórico, mas não bloquear automaticamente quando há justificativa/urgência prevista.

### 9.4 Importações e qualidade de dados

- Pipeline único para CadÚnico/CECAD/SICON/SIBEC/folhas: upload→quarentena→antivírus→checksum→detecção de leiaute/encoding→dry-run→validação→conciliação→aprovação→aplicação→relatório→retenção/descarte.
- Job idempotente e retomável; tamanho/linhas, progresso, velocidade, ETA, etapa, retries e cancelamento seguro.
- Tela separa novos, atualizáveis, idênticos, conflitantes, rejeitados e ignorados. Cada erro tem código, coluna, valor mascarado, regra, sugestão e CSV de correção.
- Mostrar comparação campo a campo e fonte/data; nunca sobrescrever evolução técnica ou dado mais confiável automaticamente.
- Versionar cada leiaute e manter fixtures anonimizadas. Teste de regressão para encoding, separador, datas, zeros à esquerda, CPF/NIS, duplicatas e arquivos gigantes.
- Registrar linhagem: arquivo/hash, operador, origem, competência, parser, versão, linha e registro resultante.

### 9.5 RMA, Censo SUAS e vigilância

- Rules-as-code versionadas por tipo de unidade, competência e norma.
- Cada célula do RMA precisa de consulta de proveniência reproduzível: eventos incluídos/excluídos, regra e data de cálculo.
- Snapshot ao fechar; ajustes em ledger separado; reabertura preserva versões e diferença.
- Conciliação apresenta total operacional × total RMA × ajustes e alertas de qualidade antes do fechamento.
- Adaptadores de exportação são versionados; mudanças federais não alteram meses fechados.
- Criar painel de prontidão do Censo SUAS: completude de unidades/equipes/serviços/estrutura, pendências, responsável e evidência; calcular indicadores apenas com fórmula e versão oficiais identificadas.
- Mapas internos usam agregação por área e permissão; portal público aplica limiar mínimo/supressão, arredondamento e análise de reidentificação. Endereço de família vulnerável nunca vira pino público.

### 9.6 Acolhimento e proteção especial

- Unidade, vagas/capacidade, ocupação, perfil e restrições; ingresso, origem, medida/documento, responsável e motivo.
- PIA individual, irmãos/família, visitas, contatos, saúde/educação apenas no mínimo necessário, audiências/prazos, reavaliações, transferências, evasão, reintegração/desligamento e motivo.
- Sigilo reforçado por caso e informação, barreira contra acesso por mera hierarquia, break-glass excepcional com motivo e revisão.
- Alertas de prazo devem ser configuráveis e juridicamente validados, nunca inventados pela IA.

### 9.7 Estoque avançado e financeiro

- Estoque por depósito/unidade, item, unidade de medida, lote, validade, fonte, custo, entrada, reserva, saída, transferência, devolução, perda e inventário.
- FEFO, alerta de validade/estoque mínimo, bloqueio de saldo negativo, razão de ajuste, dupla aprovação acima de limite e trilha até benefício/recebedor.
- Financeiro com fundo/bloco/programa/fonte, repasse, conta, empenho, liquidação, pagamento, estorno, rendimento, conciliação, documentos e prestação de contas.
- Segregação entre lançar, aprovar e conciliar; fechamento por competência; export contábil por adaptador, não acoplamento.

### 9.8 Configuração municipal e 44 cadastros

- Catalogar os 44 domínios citados no edital em matriz: código estável, rótulo, escopo nacional/local, vigência, fonte normativa, dependências, impacto e responsável.
- Não usar enum hard-coded para regra local mutável. Também não transformar toda constante técnica em tabela editável.
- Publicação de uma versão exige preview de impacto e data futura; registros históricos mantêm a versão usada.
- Configurações críticas (sigilo, critério, aprovação, integração) exigem maker-checker, auditoria e rollback.

### 9.9 Frontends perdidos e páginas rústicas

Reconstruir pelo contrato atual e pelo design system, nunca colando JavaScript do bundle. Para cada tela: rota/menu/capacidade, tipos OpenAPI, carregamento, vazio, erro, sem permissão, offline quando aplicável, formulário validado, confirmação acessível, auditoria, teste unitário, E2E e acessibilidade.

Ordem recomendada:

1. renda, habitação, importação/exportação e questionários existentes, eliminando `any` e `alert()`;
2. PAF/PIA, demanda reprimida, acolhimento, estoque e financeiro;
3. vigilância avançada, relatórios configuráveis e rede de proteção;
4. portal do cidadão e transparência em fronteiras de segurança separadas;
5. chat e teleatendimento;
6. busca ativa móvel;
7. pânico/biometria apenas após gates de alto risco.

## 10. Privacidade e governança que faltam

### 10.1 Catálogo de tratamento

Para cada conjunto de dados e fluxo, registrar: finalidade, política pública/competência legal, categorias, titulares, fonte, compartilhamentos, operadores, localização, perfis, retenção, descarte, risco, salvaguardas e responsável. Consentimento deve ser usado somente quando apropriado; no Poder Público, muitas operações dependem de finalidade pública e atribuição legal.

### 10.2 Solicitações do titular

Transformar `/lgpd/delete` em processo:

1. receber e verificar identidade/representação sem coletar excesso;
2. localizar dados e exportar com segurança;
3. avaliar retenção legal, guarda documental, processo ativo e legal hold;
4. decidir acesso, correção, informação, portabilidade, anonimização, bloqueio ou eliminação conforme aplicável;
5. executar em DB, objetos, busca, cache e processadores;
6. registrar fundamento, aprovação, escopo e resposta, sem manter o próprio dado apagado em log;
7. propagar a operadores e comprovar.

### 10.3 Temporalidade e descarte

Política versionada por classe documental, evento inicial, prazo, destinação, suspensão/legal hold e autoridade. Um job só marca candidatos; descarte material exige aprovação, lote, relatório, prova e possibilidade de suspender. Backups seguem expiração própria e restauração deve reaplicar tombstones.

### 10.4 Incidentes

Criar registro de incidente com descoberta, confirmação, escopo, categorias/titulares, gravidade, contenção, avaliação de comunicação, relógio de prazo, ANPD/titulares, decisões, evidências e lições aprendidas. Executar tabletop semestral de vazamento cross-tenant/ransomware.

## 11. Assinatura e documentos

Criar matriz por tipo documental e risco:

| Nível | Uso possível | Requisitos |
|---|---|---|
| Ciência/evidência simples | recibo operacional de baixo risco | identidade contextual, intenção, horário confiável, hash, IP/dispositivo minimizado, trilha e cópia; canvas opcional não deve ser chamado de ICP-Brasil. |
| Assinatura avançada | documentos autorizados pela política do ente | provedor/método aceito pelo município, vínculo unívoco, controle do signatário, detecção de alteração, validação e evidências. |
| Assinatura qualificada | quando lei/política exigir ICP-Brasil | PAdES, certificado ICP-Brasil, cadeia e política, OCSP/CRL, carimbo de tempo quando necessário, validação/LTV e verificador. |

Documentos publicados são imutáveis, têm versão do template/dados, hash, signatários, política, validações e manifesto de evidências. O sistema deve verificar assinatura recebida e exibir resultado compreensível, não apenas “válida/inválida”.

## 12. Módulos de alto risco

### Reconhecimento facial

Deve permanecer **desabilitado por padrão e fora da promessa de produção** até existir finalidade estrita, base jurídica, necessidade/proporcionalidade, RIPD, aprovação do controlador/encarregado, avaliação de vieses e falso match por grupo, liveness, revisão humana, recurso, retenção mínima, isolamento de templates e plano de incidente. Não usar para negar benefício, classificar vulnerabilidade ou identificar população em espaço público de forma massiva.

### Botão do pânico

Código sem operação 24×7 cria falsa sensação de segurança. Exigir órgão receptor formal, escala, SLA de reconhecimento, escalonamento, geolocalização consentida, teste periódico, fallback por telefone, modo offline, prevenção de acionamento abusivo, evidência de entrega e protocolo com a rede. Sem isso, rotular como piloto desabilitado.

### IA

Proibir decisão automática de elegibilidade, risco, prioridade ou direito. IA pode resumir/rascunhar somente com aprovação humana. Requisitos: provedor aprovado, contrato de não treinamento/retenção, minimização/redação de PII, controle de prompt injection, base autorizada, citações, incerteza, versionamento de modelo/prompt, avaliação de alucinação/vazamento/viés, logs sem conteúdo sensível e desligamento por tenant. Credencial de IA nunca é “login/senha por órgão” armazenado de forma reversível.

### Teleatendimento

Tratar como teleatendimento socioassistencial, não telemedicina: identidade proporcional, sala de espera, consentimento/ciência, criptografia em trânsito, gravação desligada por padrão, acessibilidade, baixa largura de banda, reconexão, privacidade do ambiente e registro mínimo de metadados. Conteúdo técnico entra no prontuário pelo profissional, não por gravação automática.

## 13. Metas mensuráveis de excelência

Estas são metas de produto sugeridas, não exigências legais nem afirmações atuais:

| Dimensão | Meta de aceite |
|---|---|
| Disponibilidade | SLO inicial ≥ 99,9% mensal para fluxos internos críticos, excluindo manutenção anunciada; medir por jornada, não só `/health`. |
| Recuperação | RPO ≤ 15 min; RTO ≤ 4 h; restore drill trimestral. |
| API | p95 leitura ≤ 500 ms, escrita ≤ 800 ms e busca ≤ 1 s sob carga representativa; exceções documentadas para jobs. |
| Frontend | p75 real: LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1, inclusive rotas long-lived da SPA. Referência: [Core Web Vitals](https://web.dev/articles/vitals). |
| Erros | < 1% de respostas 5xx por janela e zero perda silenciosa de mutação offline. |
| Importação | 100% das linhas com resultado/proveniência; retomar após falha sem duplicar; arquivo inválido não altera base. |
| Tenant | zero vazamento em suíte cruzada, pentest e produção; alerta imediato para tentativa anômala. |
| Acessibilidade | WCAG 2.2 AA + eMAG nas jornadas críticas, com teclado, leitor de tela, 200%/400%, reflow, contraste e mensagens. |
| Qualidade | typecheck/lint zero erro; contrato íntegro; cobertura de ramos críticos 100% para autorização, tenant, regras RMA, benefício e criptografia; cobertura global não substitui testes significativos. |
| Operação | 100% dos alertas com proprietário/runbook; jobs críticos com idempotência, retry limitado e DLQ. |

## 14. Roadmap por gates, não por datas artificiais

| Onda | Entrega | Saída obrigatória |
|---|---|---|
| **0 — Contenção** | Rotação de segredos, freeze de alto risco, inventário Git/artefatos, backup antes de mudança | Nenhuma credencial padrão ativa; fonte preservada. |
| **1 — Reprodutibilidade** | package, build/Docker, OpenAPI, rota, CI, build limpo, caracterização Fases 1–9 | Imagem reproduzível e todos os testes executáveis. |
| **2 — Segurança/SRE** | SSO, RLS, storage/cache/jobs, keyring, PITR, restore, OTel, runbooks, scans | Pentest interno sem crítico/alto; restore dentro da meta. |
| **3 — Conformidade operacional** | catálogo LGPD, retenção/DSAR/incidente, assinatura por política, acessibilidade manual | RIPD/políticas aprovados; evidência de homologação. |
| **4 — Núcleo SUAS completo** | PAF/PIA, demanda, temporalidade, importações, RMA/Censo, acolhimento, estoque/financeiro | Cenários reais homologados por perfis de todas as unidades. |
| **5 — Reconstrução e integração** | telas perdidas prioritárias, adaptadores federais oficiais, portal/cidadão/transparência | Contratos oficiais, sincronização observável, fronteiras separadas. |
| **6 — Diferenciais** | rules engine, qualidade/linhagem, campo offline, indicadores explicáveis, portabilidade | KPIs de adoção/qualidade e rollout gradual por tenant. |
| **7 — Alto risco opcional** | IA, pânico, biometria | Gate próprio legal, ético, técnico e operacional; default off. |

Não iniciar uma onda posterior para “mostrar novidade” se o gate anterior não estiver comprovado.

## 15. Definição de pronto para produção

Um item só está pronto quando possui, conforme aplicável:

- regra de negócio e referência normativa/local versionadas;
- modelo/migration segura e compatível;
- API tipada, autorização e contrato OpenAPI;
- frontend completo com estados e acessibilidade;
- testes unitários, integração, contrato, E2E, tenant e concorrência;
- auditoria e observabilidade sem PII;
- política de retenção e classificação;
- migração/backfill, dry-run, métricas e rollback;
- documentação de usuário, administrador e runbook;
- feature flag/rollout e telemetria de adoção;
- homologação por profissional do papel afetado;
- nenhuma alegação comercial além da evidência.

## 16. Conclusão

O GOVSOCIAL já tem um núcleo promissor, mas “ser um dos melhores” exige mudar o centro de gravidade: de quantidade de endpoints e telas para **confiabilidade demonstrável, aderência temporal às normas, proteção do prontuário, rastreabilidade dos números e experiência de campo**. A prioridade correta é tornar o sistema reconstruível e seguro; depois completar PAF/PIA, demanda, importações, RMA/Censo, acolhimento, estoque/financeiro e os frontends; por último, módulos de alto risco.

O prompt mestre complementar converte este parecer em instruções executáveis para uma IA trabalhar no repositório sem apagar o que já existe, sem inventar integrações e sem declarar sucesso antes de provar cada gate.
