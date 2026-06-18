---
name: backend-setor-publico-br
description: >-
  Especialista em desenvolvimento de backend para sistemas do setor público
  brasileiro (e-gov). Use SEMPRE que a tarefa envolver código de servidor para
  órgãos públicos, prefeituras, autarquias, tribunais, secretarias ou empresas
  públicas — mesmo que o usuário não diga explicitamente "setor público". Gatilhos
  incluem: validar ou gerar CPF, CNPJ (inclusive o novo CNPJ alfanumérico de 2026),
  PIS/PASEP, título de eleitor, CEP, RENAVAM; integrar com Login Único / "Entrar
  com gov.br", Conecta gov.br, assinatura digital gov.br, SERPRO, Dataprev, Receita;
  cumprir LGPD em código de backend; expor dados abertos / atender à Lei de Acesso
  à Informação; projetar APIs aderentes ao padrão ePING e ao Governo Digital
  (Lei 14.129/2021); trilhas de auditoria, retenção de dados, resiliência e alta
  disponibilidade de serviços públicos. Também serve para revisar código existente
  de sistemas públicos quanto a conformidade legal, segurança e interoperabilidade.
---

# Backend para sistemas do setor público brasileiro

Sistemas públicos não são "sistemas comuns com um logo do governo". Eles operam
sob obrigações legais explícitas (LGPD, LAI, Lei do Governo Digital), atendem
cidadãos que **não podem escolher outro fornecedor**, e frequentemente são
auditados por órgãos de controle (TCU, TCEs, CGU, MP). Isso muda as prioridades
de engenharia: correção legal, rastreabilidade, acessibilidade do dado,
disponibilidade e transparência vêm antes de "mover rápido".

Use este guia para qualquer tarefa de backend nesse contexto. Ele aponta para
arquivos de referência detalhados — **leia o arquivo relevante antes de escrever
código**, porque vários detalhes (algoritmos de dígito verificador, formato de
token gov.br, exigências da LGPD) são fáceis de errar de memória.

## Princípios que orientam toda decisão

1. **Conformidade legal é requisito, não enfeite.** LGPD (Lei 13.709/2018), LAI
   (Lei 12.527/2011) e Lei do Governo Digital (Lei 14.129/2021) impõem
   comportamentos concretos ao backend: minimização de dados, base legal para
   cada tratamento, trilha de auditoria, direito de acesso/eliminação, e o
   princípio "once-only" (não pedir ao cidadão dado que o governo já tem).

2. **Tudo precisa ser rastreável.** Toda operação que cria, altera ou expõe dado
   de cidadão deve registrar quem, quando, o quê e por quê. Auditoria não é log de
   debug — é prova para órgão de controle.

3. **O cidadão é usuário cativo.** Não há "churn". Indisponibilidade, perda de
   dado ou erro de cálculo têm impacto direto na vida das pessoas e geram
   responsabilização. Projete para resiliência e degradação graciosa.

4. **Dado público é aberto por padrão; dado pessoal é fechado por padrão.**
   Transparência ativa (dados abertos, LAI) e proteção de dados pessoais (LGPD)
   convivem. Saiba classificar antes de expor.

5. **Padrões abertos e interoperabilidade.** Prefira OpenAPI, JSON, formatos
   abertos e versionamento semântico (orientação da arquitetura ePING). Outros
   órgãos vão consumir sua API.

## Fluxo recomendado para uma tarefa

1. **Classifique o dado.** É dado pessoal? Sensível (saúde, biometria, origem
   racial, etc.)? Público? Isso define criptografia, retenção, logging e quem
   pode acessar. Veja `references/lgpd-e-seguranca.md`.

2. **Identifique a base legal.** Todo tratamento de dado pessoal precisa de uma
   das bases do art. 7º/11 da LGPD (no setor público, normalmente "execução de
   política pública" ou "cumprimento de obrigação legal", raramente
   consentimento). Documente-a no código/configuração.

3. **Escolha integrações oficiais antes de reinventar.** Precisa autenticar
   cidadão? Login Único gov.br. Precisa de dado que outro órgão já tem (CPF,
   CadÚnico, CEP...)? Conecta gov.br. Veja `references/integracoes-govbr.md`.

4. **Valide identificadores corretamente.** CPF, CNPJ e afins têm algoritmos de
   dígito verificador específicos — e o CNPJ está mudando para alfanumérico.
   Veja `references/validacoes-documentos-br.md`.

5. **Projete a API conforme o padrão.** REST, OpenAPI, versionamento, formato de
   erro padronizado, paginação, e endpoints de dados abertos quando cabível.
   Veja `references/design-api-e-interoperabilidade.md`.

6. **Garanta operação e auditoria.** Trilha de auditoria, idempotência,
   observabilidade, retenção e descarte de dados, alta disponibilidade.
   Veja `references/arquitetura-e-operacao.md`.

## Sobre linguagem e stack

Java/Spring Boot é o stack mais comum no governo federal e em muitos órgãos, mas
os princípios valem para .NET, Node, Python, PHP ou Go. Os exemplos de código nos
arquivos de referência usam Java ou pseudocódigo neutro; adapte ao stack do
usuário. **Não imponha um stack** — pergunte ou siga o que já existe no projeto.
Padrões proprietários só quando não houver alternativa aberta viável (orientação
ePING).

## Arquivos de referência

| Quando a tarefa envolve...                                   | Leia                                            |
|--------------------------------------------------------------|-------------------------------------------------|
| Validar/gerar CPF, CNPJ (num. e alfanumérico), PIS, etc.     | `references/validacoes-documentos-br.md`        |
| Login gov.br, Conecta, assinatura digital, SERPRO/Dataprev   | `references/integracoes-govbr.md`               |
| LGPD no código, segurança, auditoria, anonimização           | `references/lgpd-e-seguranca.md`                |
| Design de API, ePING, OpenAPI, dados abertos, LAI            | `references/design-api-e-interoperabilidade.md` |
| Arquitetura, resiliência, observabilidade, retenção          | `references/arquitetura-e-operacao.md`          |

## Erros comuns a evitar

- Validar CPF/CNPJ só pela máscara/regex sem conferir o dígito verificador.
- Assumir que CNPJ é sempre numérico (a partir de jul/2026 há o alfanumérico).
- Tratar log de auditoria como log de aplicação (níveis, retenção e imutabilidade
  são diferentes).
- Usar consentimento como base legal padrão no setor público (raramente é a
  correta).
- Expor dado pessoal em endpoint de "transparência" sem anonimizar.
- Guardar CPF como chave/identificador exposto em URL ou log.
- Reimplementar consulta de CEP/CPF/CNPJ por scraping quando há API oficial.
- Ignorar requisitos de acessibilidade do dado (a API alimenta sistemas que
  precisam ser acessíveis — eMAG/WCAG no front).