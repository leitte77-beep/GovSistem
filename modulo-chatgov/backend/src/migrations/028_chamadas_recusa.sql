-- Recusa automática de chamadas de voz/vídeo no WhatsApp.
--
-- O número do órgão atende somente por mensagens, mas o cidadão liga assim
-- mesmo e o aparelho conectado por QR Code toca junto. Aqui ficam as
-- preferências por órgão: a ligação é encerrada assim que chega e o cidadão
-- recebe um aviso com o telefone para atendimento por voz.

-- Padrão ligado: órgão que nunca abriu as configurações é justamente onde o
-- telefone toca à toa.
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS chamadas_recusar_ativo BOOLEAN NOT NULL DEFAULT true;

-- Nome e telefone vazios são derivados em tempo de execução (nome do órgão em
-- `tenants` e número da sessão em `whatsapp_sessoes`), para que uma secretaria
-- que conecte o QR Code amanhã já responda certo sem ninguém configurar nada.
-- Preenchidos, mandam: `tenants.nome` está em caixa alta e o WhatsApp guarda
-- celulares antigos sem o nono dígito.
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS chamadas_nome_exibicao TEXT;
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS chamadas_telefone TEXT;

-- Vazio = usa MENSAGEM_CHAMADA_PADRAO (services/chamadas.js).
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS chamadas_mensagem TEXT;
