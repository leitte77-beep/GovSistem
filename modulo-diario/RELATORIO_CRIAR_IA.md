# Bloco — "Criar documento com IA" em etapas (fecha Inc5)

Frontend Next.js (`web-admin`), em português, consumindo os endpoints reais dos
Incrementos 1–4. Validado por `npx tsc --noEmit` → **exit 0**. Não toca arquivos
em andamento do cliente (`editions/*`, `types/edition.ts`).

## Rota nova `/documentos/criar`

Fluxo em etapas claras, sem botões mortos:

1. **Tipo e modelo** — escolha do tipo (Editais/Portarias/Leis/Ofícios/Decretos/
   Resoluções) e do **modelo aprovado** ativo (padrão ou único; lista real). Sem
   modelo aprovado, orienta a cadastrar/aprovar em “Modelos documentais”.
2. **Descreva o documento** — texto em linguagem natural + “Identificar campos
   com IA” (`POST /document-models/ai/extract`, modelo DeepSeek V4 Flash).
   Sem chave cadastrada, avisa e permite **preenchimento manual**.
3. **Dados do documento** — formulário dinâmico dos **campos da versão ativa**
   do modelo (texto/data/inteiro/decimal/select), com obrigatórios marcados;
   valores extraídos pela IA preenchem (extrato prevalece; não apaga digitado).
   Seleção do **tipo de ato (matéria)** com aviso se não houver compatível.
4. **Pré-visualizar minuta** (`previewVersion`) — mostra pendências ou o texto
   canônico; o botão “Gerar minuta” só habilita com `complete`.
5. **Gerar minuta (matéria)** (`material`) — cria a matéria rascunho sem número;
   **Emitir número** (`numbering/issue`) atribui número definitivo (se o usuário
   tiver permissão de aprovação; senão, aviso).

Cada etapa usa consultas reais; erros exibem mensagens acionáveis; nada fingido.

## Integração
- Visão geral `/documentos` e páginas por tipo `/documentos/tipos/[tipo]` têm o
  atalho “Criar com IA”.
- Matéria gerada fica listada no menu do tipo (estados derivados), pronta para o
  fluxo editorial/edição existente.

## Validação
`npx tsc --noEmit` no `web-admin` → **exit 0**. Backend intocado (571 passed).

## Limites reais (não fingidos)
- A **assinatura criptográfica individual do ato** e o vínculo do número ao
  ponto exato de “preparar assinatura” ainda seguem o fluxo de matérias/edições
  (a assinatura PAdES é da edição). “Emitir número” exige papel de aprovação.
- Sem chave real no ambiente, a etapa IA só foi validada no contrato (mock no
  backend); recomenda-se teste manual com chave cadastrada em `/settings/ai`.
- Frontend validado por tipos/compilação; recomenda-se `next build` + teste em
  navegador no ambiente.
