-- Corrige a autoria das mensagens de saída que foram digitadas FORA do painel
-- (celular / WhatsApp Web) e ficaram gravadas com o primeiro admin do tenant
-- como autor — efeito do fallback removido em realtime/gateway.js.
--
-- Como as mensagens são identificadas:
--   * o sync do WhatsApp grava `criado_em` com o messageTimestamp do protocolo,
--     que só tem precisão de segundos; o envio pelo painel usa now() e sempre
--     carrega microssegundos;
--   * salvaguarda: mensagem com registro de auditoria `mensagem.enviada` foi
--     comprovadamente enviada pelo painel e nunca é tocada.
--
-- Requer a migration 019 (coluna `mensagens.origem`).
--
-- Conferência (não altera nada):
--   docker exec -i modulo-chatgov-postgres-1 psql -U chatgov -d chatgov \
--     -f - < scripts/corrigir-autoria-mensagens-whatsapp.sql
--
-- Aplicar de fato:
--   docker exec -i modulo-chatgov-postgres-1 psql -U chatgov -d chatgov -v apply=1 \
--     -f - < scripts/corrigir-autoria-mensagens-whatsapp.sql

CREATE TEMP VIEW mensagens_fora_do_painel AS
SELECT m.id, m.tenant_id, m.operador_id
FROM mensagens m
WHERE m.direcao = 'saida'
  AND m.operador_id IS NOT NULL
  AND date_trunc('second', m.criado_em) = m.criado_em
  AND NOT EXISTS (
    SELECT 1 FROM auditoria a
    WHERE a.acao = 'mensagem.enviada'
      AND a.detalhe ->> 'mensagemId' = m.id::text
  );

\if :{?apply}

UPDATE mensagens m
   SET operador_id = NULL,
       origem = 'whatsapp'
  FROM mensagens_fora_do_painel f
 WHERE m.id = f.id;

-- Respostas da Iris/chatbot gravadas antes de a origem ser preenchida: ficaram
-- com o default 'atendente'. Nunca tiveram operador e sempre saem com o prefixo.
UPDATE mensagens
   SET origem = 'bot'
 WHERE direcao = 'saida'
   AND operador_id IS NULL
   AND origem = 'atendente'
   AND conteudo LIKE '🤖%';

SELECT t.nome AS tenant, count(*) AS mensagens_sem_autoria_falsa
  FROM mensagens m
  JOIN tenants t ON t.id = m.tenant_id
 WHERE m.origem = 'whatsapp'
 GROUP BY 1 ORDER BY 2 DESC;

\else

SELECT t.nome AS tenant,
       o.nome AS autor_incorreto_hoje,
       count(*) AS mensagens_a_corrigir,
       min(m.criado_em) AS mais_antiga,
       max(m.criado_em) AS mais_recente
  FROM mensagens_fora_do_painel f
  JOIN mensagens m ON m.id = f.id
  JOIN tenants t ON t.id = f.tenant_id
  LEFT JOIN operadores o ON o.id = f.operador_id
 GROUP BY 1, 2
 ORDER BY 3 DESC;

\echo 'Conferência apenas. Rode com -v apply=1 para aplicar.'

\endif
