# Proposta para diagramação automática do Diário Oficial

## Objetivo

Permitir que o usuário cole o texto bruto no sistema e o próprio sistema transforme esse conteúdo em uma edição com aparência de diário oficial, seguindo um padrão visual consistente com os modelos `01.pdf` e `02.pdf`.

## Situação atual

Hoje o TipTap funciona como editor rico, mas ele depende muito da formatação manual.
Isso faz com que o conteúdo final fique:

- pouco padronizado;
- sem diagramação automática suficiente;
- com estrutura visual inferior ao modelo feito no Word;
- dependente do operador para acertar títulos, blocos, tabelas, espaçamento e hierarquia.

## O que os PDFs mostram

O `01.pdf` representa uma saída mais “crua”, próxima de texto colado e renderizado com pouca inteligência de composição.

O `02.pdf` já mostra uma edição diagramada, com:

- hierarquia clara;
- títulos e subtítulos bem separados;
- blocos com melhor leitura;
- uso coerente de margens, páginas e seções;
- visual mais próximo de um documento oficial.

## Recomendação técnica

A melhor solução não é usar IA sozinha, nem depender só do TipTap.
O ideal é um fluxo híbrido:

1. o usuário cola o conteúdo bruto;
2. o sistema interpreta a estrutura do texto;
3. uma camada de IA classifica e sugere a diagramação;
4. regras determinísticas aplicam o padrão final;
5. o operador revisa e aprova antes de publicar.

## Arquitetura sugerida

### 1. Editor de entrada

O TipTap continua sendo o campo de edição, mas passa a atuar mais como:

- área de entrada;
- pré-visualização;
- refinamento manual;
- correção final.

### 2. Motor de normalização

Antes de renderizar a edição, o sistema deve converter o conteúdo colado em uma estrutura interna, por exemplo:

- título;
- ementa;
- órgão;
- seção;
- itens numerados;
- parágrafos corridos;
- tabelas;
- listas;
- assinaturas;
- rodapés.

### 3. IA de interpretação

A IA pode receber:

- texto bruto;
- modelo de referência;
- regras de formatação;
- exemplos de edições boas.

Ela deve devolver uma saída estruturada, não só texto reescrito.

Exemplo do que a IA deve produzir:

- blocos com tipo;
- ordem lógica;
- título principal;
- subtítulos;
- marcação de tabela;
- indicação de quebra de página;
- destaque de campos oficiais.

### 4. Regras fixas de diagramação

Depois da IA, o sistema deve aplicar regras rígidas para não “inventar” layout.

Essas regras podem definir:

- fonte;
- tamanho;
- margens;
- espaçamento entre blocos;
- alinhamento;
- recuos;
- padrão de títulos;
- padrão de tabelas;
- separação de cabeçalho e rodapé.

### 5. Renderização final

A edição final deve ser gerada a partir de um template oficial, e não apenas do HTML livre do editor.

O ideal é:

- armazenar o conteúdo estruturado;
- converter para HTML padronizado;
- renderizar o PDF com template controlado;
- manter assinatura digital depois da geração.

## O que fazer na prática

### Curto prazo

- Criar um botão de “Autoformatar”.
- Permitir colar texto bruto e rodar uma normalização automática.
- Extrair títulos, listas e blocos com heurísticas simples.
- Usar TipTap só como camada visual final.

### Médio prazo

- Criar um serviço de IA para classificar conteúdo por tipo.
- Treinar prompts com exemplos reais de edições do município.
- Criar um schema de saída estruturado.
- Fazer preview antes de publicar.

### Longo prazo

- Criar um modelo interno de diagramação por tipo de publicação.
- Aprender com edições aprovadas anteriormente.
- Permitir autoformatação específica por secretaria, órgão ou tipo de ato.

## Melhor caminho

Minha recomendação é esta:

1. não substituir o TipTap;
2. criar uma camada de IA + regras;
3. gerar estrutura antes do HTML;
4. manter revisão humana obrigatória;
5. só então publicar e assinar.

Isso evita que a IA “enfeite demais” ou quebre o padrão oficial.

## Qual IA usar

Para esse caso, eu começaria com **Gemini** como modelo principal.

Motivo:

- costuma ir muito bem em interpretação de documentos e estrutura textual;
- é uma boa escolha para classificar blocos, detectar títulos, listas e seções;
- combina bem com um fluxo de saída estruturada em JSON.

Eu deixaria a **DeepSeek** como fallback ou segunda etapa:

- útil para revisão de texto;
- boa para custo menor em tarefas de classificação e normalização;
- pode ajudar em lote, quando a precisão não exigir o modelo principal.

Resumo prático:

- **Gemini 2.5 Flash** para entender o documento;
- **regras do sistema** para diagramar;
- **DeepSeek** como apoio ou alternativa econômica.

## Risco principal

Se a IA for usada sem regras fixas, ela pode:

- alterar conteúdo jurídico;
- mudar ordem de informações;
- perder fidelidade ao original;
- criar layout bonito, mas juridicamente ruim.

## Conclusão

O sistema precisa sair do modelo “editor manual com TipTap” para um modelo “entrada bruta + interpretação + diagramação automática + revisão final”.

Esse é o caminho mais seguro para chegar perto da diagramação feita no Word sem perder controle editorial.
