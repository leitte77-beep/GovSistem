-- Trigger: cria notificação no sistema quando chega nova mensagem de cidadão
-- Roda direto no PostgreSQL, independente do gateway.js

CREATE OR REPLACE FUNCTION notificar_nova_mensagem_entrada()
RETURNS TRIGGER AS $$
DECLARE
  v_contato_nome TEXT;
  v_contato_telefone TEXT;
  v_conversa_id UUID;
  v_tenant_id UUID;
  v_trecho TEXT;
  v_depto_id UUID;
  v_conv_operador_id UUID;
BEGIN
  -- Só para mensagens de entrada do tipo texto
  IF NEW.direcao <> 'entrada' OR NEW.tipo <> 'texto' OR NEW.operador_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Buscar dados da conversa e contato
  SELECT c.tenant_id, c.id, c.operador_id, c.departamento_id,
         co.nome, co.telefone
    INTO v_tenant_id, v_conversa_id, v_conv_operador_id, v_depto_id,
         v_contato_nome, v_contato_telefone
  FROM conversas c
  JOIN contatos co ON co.id = c.contato_id
  WHERE c.id = NEW.conversa_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_trecho := left(COALESCE(NEW.conteudo, ''), 80);
  IF length(COALESCE(NEW.conteudo, '')) > 80 THEN
    v_trecho := v_trecho || '...';
  END IF;

  -- 1. Notificar operador dono da conversa (se existir e não for o remetente)
  IF v_conv_operador_id IS NOT NULL THEN
    INSERT INTO notificacoes (tenant_id, operador_id, tipo, titulo, mensagem, link)
    VALUES (v_tenant_id, v_conv_operador_id, 'mensagem',
            COALESCE(v_contato_nome, v_contato_telefone, 'Novo contato'),
            v_trecho,
            '/atendimento?conversa=' || v_conversa_id);
  END IF;

  -- 2. Notificar operadores do departamento (exceto dono)
  IF v_depto_id IS NOT NULL THEN
    INSERT INTO notificacoes (tenant_id, operador_id, tipo, titulo, mensagem, link)
    SELECT DISTINCT v_tenant_id, od.operador_id, 'mensagem',
           COALESCE(v_contato_nome, v_contato_telefone, 'Novo contato'),
           v_trecho,
           '/atendimento?conversa=' || v_conversa_id
    FROM operador_departamentos od
    WHERE od.departamento_id = v_depto_id
      AND od.operador_id IS DISTINCT FROM v_conv_operador_id;
  ELSE
    -- Sem departamento: notificar recepção
    INSERT INTO notificacoes (tenant_id, operador_id, tipo, titulo, mensagem, link)
    SELECT DISTINCT v_tenant_id, od.operador_id, 'mensagem',
           COALESCE(v_contato_nome, v_contato_telefone, 'Novo contato'),
           v_trecho,
           '/atendimento?conversa=' || v_conversa_id
    FROM operador_departamentos od
    JOIN departamentos d ON d.id = od.departamento_id
    WHERE d.tenant_id = v_tenant_id
      AND LOWER(d.nome) = 'recepcao'
      AND d.ativo = true
      AND od.operador_id IS DISTINCT FROM v_conv_operador_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notificar_mensagem ON mensagens;

CREATE TRIGGER trigger_notificar_mensagem
AFTER INSERT ON mensagens
FOR EACH ROW
EXECUTE FUNCTION notificar_nova_mensagem_entrada();
