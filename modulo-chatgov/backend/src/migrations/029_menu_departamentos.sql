-- Menu numerado de departamentos para mídia sem destino.
--
-- O atendente resolve a conversa, o cidadão volta a precisar e manda uma foto,
-- um áudio ou um documento. Só texto aciona o bot, então a mídia ficava parada
-- sem ninguém saber para qual setor mandar. Agora o sistema devolve a lista
-- numerada e o próprio cidadão escolhe.

-- Número fixo de cada setor no menu. Fixo de propósito: se fosse calculado na
-- hora, desativar um departamento renumeraria todos os outros e quem já
-- conhecia o menu passaria a cair no setor errado.
ALTER TABLE departamentos ADD COLUMN IF NOT EXISTS menu_numero INTEGER;

-- Dois setores do mesmo órgão não podem disputar o mesmo número. Índice
-- parcial: quem está sem número (NULL) fica fora do menu sem conflitar.
CREATE UNIQUE INDEX IF NOT EXISTS departamentos_menu_numero_uk
    ON departamentos (tenant_id, menu_numero)
    WHERE menu_numero IS NOT NULL;

-- Numera quem ainda não tem número, em ordem alfabética, continuando a partir
-- do maior número já usado no órgão. Roda a cada boot (as migrations são
-- reexecutadas), por isso só toca em menu_numero IS NULL: departamento novo
-- entra no fim da lista e os números já publicados nunca mudam.
WITH proximo AS (
    SELECT tenant_id, COALESCE(MAX(menu_numero), 0) AS base
      FROM departamentos GROUP BY tenant_id
), sem_numero AS (
    SELECT d.id, d.tenant_id,
           row_number() OVER (PARTITION BY d.tenant_id ORDER BY d.nome) AS pos
      FROM departamentos d
     WHERE d.menu_numero IS NULL AND d.ativo = true
)
UPDATE departamentos d
   SET menu_numero = p.base + s.pos
  FROM sem_numero s
  JOIN proximo p ON p.tenant_id = s.tenant_id
 WHERE d.id = s.id;

-- Marca que o cidadão recebeu o menu e o sistema aguarda a escolha. Serve
-- também de trava contra rajada: dez fotos seguidas geram um menu só.
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS menu_enviado_em TIMESTAMPTZ;

-- Preferências por órgão.
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS menu_midia_ativo BOOLEAN NOT NULL DEFAULT true;
-- Vazio = usa CABECALHO_MENU_PADRAO (services/menu-departamentos.js).
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS menu_midia_cabecalho TEXT;
