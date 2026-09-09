# Diário Oficial — Documentos oficiais com IA (guia de configuração e operação)

Guia consolidado do que foi entregue nos **Incrementos 1–5** do módulo
`modulo-diario` (backend FastAPI + frontend Next.js `web-admin`). Tudo em
português. Baseado em integração única com **DeepSeek V4 Flash**
(`deepseek-v4-flash`, base oficial `https://api.deepseek.com`).

> Documentos individuais de cada incremento:
> `RELATORIO_IA_FUNDACAO.md`, `RELATORIO_MODELOS_DOCUMENTAIS_INC2.md`,
> `RELATORIO_DOCUMENT_MODELS_INC3.md`, `RELATORIO_MATERIA_NUMERACAO_INC4.md`,
> `RELATORIO_FRONTEND_INC5.md`, `RELATORIO_LISTAGEM_TIPOS.md`,
> `RELATORIO_CRIAR_IA.md`.

## 1. O que foi implementado

| Incremento | Entrega |
|---|---|
| Inc1 | Configuração segura de IA **por organização** (chave criptografada, mascarada; testar/substituir/remover/desativar; auditado) e **serviço centralizado DeepSeek** (timeout, retries, concorrência, validação de resposta). |
| Inc2 | **Motor de modelos documentais**: config validada (campos + seções/textos fixos + condicionais) e **renderização determinística** para o `SemanticDocument` (editor semântico existente). |
| Inc3 | Endpoints `/document-models` (ciclo de vida: rascunho → em aprovação → ativo → arquivado) e **geração estruturada por IA** (extrai/valida campos). |
| Inc4 | **Matéria real** a partir da minuta + **numeração transacional** por série (org, tipo, ano) com row-lock, idempotente e sem reutilização. |
| Inc5 | Frontend: navegação, Visão geral, **Modelos documentais**, **Config IA** e **listagem por tipo** com estados; **"Criar documento com IA"** em etapas. |

## 2. Cadastrar a chave da API pela interface (recomendado)

1. Acesse **Configurações → Inteligência artificial** (menu lateral, admin).
2. Cole a chave DeepSeek no campo **“Chave da API DeepSeek”** (tipo senha) e clique
   **Salvar configuração**. Campo vazio **preserva** a chave atual.
3. Clique **Testar conexão** (pode testar uma chave nova **sem salvá-la**; o teste
   consome tokens). Confira o indicador: não testado / conectado / falha (com a
   causa em português: autenticação, indisponibilidade, timeout, quota).
4. Para trocar: preencha e clique **Substituir chave**. Para remover:
   **Remover chave** (confirmação). Para desligar tudo: **Desativar IA**.

A chave nunca é exibida de volta, não vai para o navegador/log/resposta, e fica
criptografada no backend (chave mestra fora do banco/repositório).

## 3. Ensinar e aprovar um modelo documental

Em **Documentos oficiais → Modelos documentais**:

1. **Novo modelo**: nome, slug e a **Config JSON** (exemplo pré-preenchido) com
   `purpose`, `scope_document_type`, `document_title`/`summary` (podem usar
   `{{campo}}`), `fields` (texto/data/inteiro/decimal/dinheiro/select/referência,
   obrigatório) e `sections` (textos fixos com marcadores e condicionais). O
   servidor valida (rejeita marcador de campo inexistente, bloco inválido etc.).
2. Na versão **v1 (rascunho)**: **Enviar p/ aprovação**.
3. Um usuário com papel de aprovação (REVISOR/ADMIN) clica **Aprovar / ativar**.
   A partir daí a versão é **imutável**; o modelo vira **padrão** do tipo se não
   houver outro ativo. Alterações criam uma **nova versão**.

> Importar a estrutura a partir de DOCX/PDF é evolução futura; hoje a Config é
> declarada/editada e validada. Modelos de demonstração não devem ser tratados
> como modelos oficiais da Prefeitura sem aprovação institucional.

## 4. Criar um documento com IA

Em **Documentos oficiais → Criar com IA** (ou pelo atalho de um menu de tipo):

1. Escolha o **tipo** e o **modelo aprovado**.
2. Descreva o documento em linguagem natural e clique **Identificar campos com
   IA** (usa DeepSeek V4 Flash). Se não houver chave, preencha manualmente.
3. Confira os **dados** (formulário dinâmico dos campos do modelo; obrigatórios
   marcados) e o **tipo de ato (matéria)**.
4. **Pré-visualizar minuta** → se houver pendência, corrija (o botão de gerar só
   habilita quando completo).
5. **Gerar minuta (matéria)** → cria rascunho **sem número**.
6. **Emitir número** → atribui número definitivo por série (org, tipo, ano);
   exige papel de aprovação. O documento passa a constar na listagem do tipo.

## 5. Listagens por tipo e estados

`/documentos/tipos/[tipo]` mostra abas (Todos, Rascunhos, Em revisão, Aprovados,
**Aguardando assinatura**, **Assinados**, **Publicados**). Os estados editorial,
de assinatura e de publicação vêm do **fluxo real**: o editorial é o estado da
matéria; assinatura/publicação derivam do vínculo a **edições** (a assinatura
PAdES é da edição, não do ato isolado — isso é exibido com clareza, sem sugerir
assinatura criptográfica individual inexistente).

## 6. Aplicação ao ambiente (deploy das migrações)

As mudanças são **aditivas**; o banco **não foi migrado** no ambiente compartilhado
vivo (para não desalinhar o contêiner com código antigo). Para aplicar, na ordem:

```bash
# 1. Reconstruir os serviços com o novo código (api; web-admin depois)
# 2. Rodar as migrações alembic (encadeadas):
cd modulo-diario/api
alembic upgrade head
#   d4e5f6a7b8c9  ai_configs + ai_executions
#   f1a2b3c4d5e6  document_models + document_model_versions
#   g2a3b4c5d6e7  act_number_series
#   h5i6j7k8l9m0  matters.document_type
# 3. Reiniciar a API (verificação fail-closed confere a nova cabeça h5i6j7k8l9m0)
```

Rollback é seguro (apenas as tabelas/colunas novas; nunca apaga documentos,
numeração ou publicações): `alembic downgrade h5i6j7k8l9m0` é o último passo de
desfazer (e cada migração tem `downgrade()`).

## 7. Testes

- Backend: suíte completa **571 passed**; as 7 falhas são **pré-existentes e
  ambientais** (geração de PDF/weasyprint, assinador, imports CSV, segurança/
  pública) — confirmadas no mesmo commit sem as mudanças (0 regressões). Ruff limpo.
- Frontend (`web-admin`): `npx tsc --noEmit` → **exit 0**.
- O contrato real do DeepSeek foi conferido na documentação oficial
  (`https://api-docs.deepseek.com`); `deepseek-v4-flash` e o endpoint
  `/chat/completions` existem. O teste de integração real fica para quando houver
  chave no ambiente (as operações de rede usam transporte mock nos testes).

## 8. Segurança

- Chave de IA nunca sai do backend; leitura mascarada; nenhum endpoint devolve o
  segredo; ações de configuração auditadas.
- Motores rejeitam chaves inesperadas e valores inválidos; nada executa código/
  SQL de IA ou de arquivos; instruções do usuário não têm autoridade.
- Permissões granulares: `ai.manage`, `document_model.manage/approve/use`;
  aprovar modelo ≠ assinar; emitir número exige papel de aprovação.
- Isolamento por organização em todos os endpoints novos.

## 9. Limitações reais (não fingidas)

- **Assinatura PAdES** continua sendo da **edição**; não há assinatura
  criptográfica individual do ato nem vínculo automático do número no ponto exato
  de “preparar assinatura” (integração posterior, quando os arquivos `matters`/
  `editions` em andamento forem consolidados).
- Importar estrutura de DOCX/PDF e “aprender” vários exemplos ainda não
  implementados (extensão futura do motor).
- Frontend validado por tipo/compilação; `next build` e teste em navegador ficam
  para o ambiente.
- Concorrência real da numeração na mesma série depende de postgres (row-lock);
  os testes usam SQLite (invariantes, não corrida).
