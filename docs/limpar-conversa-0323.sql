-- Apaga todo o registro de conversa do WhatsApp de um contato (final 0323) no banco de producao.
-- Rode no SQL Editor do Neon. NAO apaga pedidos (tabela "Order"), so o historico, o rascunho e o contato do bot.
--
-- Passo 1: rode SO este bloco para conferir o que sera apagado.
-- Passo 2: se for a conversa certa, rode o bloco do passo 2 inteiro (BEGIN ... COMMIT).

-- ======================= PASSO 1: conferir =======================
WITH alvo AS (
  SELECT DISTINCT "remoteJid" AS jid FROM "WhatsappOrderDraft" WHERE phone LIKE '%0323'
  UNION SELECT DISTINCT "remoteJid" FROM "BotLead" WHERE "remoteJid" LIKE '%0323@%' OR "phoneNumber" LIKE '%0323'
  UNION SELECT '129433151254627@lid'   -- conversa de teste vista nos logs do bot (contato "LID")
)
SELECT 'wa_message_log' AS tabela, count(*) AS linhas FROM wa_message_log WHERE remote_jid IN (SELECT jid FROM alvo)
UNION ALL SELECT 'wa_conversation', count(*) FROM wa_conversation WHERE remote_jid IN (SELECT jid FROM alvo)
UNION ALL SELECT 'WhatsappOrderDraft', count(*) FROM "WhatsappOrderDraft" WHERE "remoteJid" IN (SELECT jid FROM alvo)
UNION ALL SELECT 'BotLead', count(*) FROM "BotLead" WHERE "remoteJid" IN (SELECT jid FROM alvo)
UNION ALL SELECT 'pedidos ligados ao rascunho (NAO serao apagados)', count(*) FROM "WhatsappOrderDraft" WHERE "remoteJid" IN (SELECT jid FROM alvo) AND "orderId" IS NOT NULL;

-- ======================= PASSO 2: apagar =======================
BEGIN;

CREATE TEMP TABLE alvo ON COMMIT DROP AS
  SELECT DISTINCT "remoteJid" AS jid FROM "WhatsappOrderDraft" WHERE phone LIKE '%0323'
  UNION SELECT DISTINCT "remoteJid" FROM "BotLead" WHERE "remoteJid" LIKE '%0323@%' OR "phoneNumber" LIKE '%0323'
  UNION SELECT '129433151254627@lid';

DELETE FROM wa_message_log WHERE remote_jid IN (SELECT jid FROM alvo);
DELETE FROM wa_conversation WHERE remote_jid IN (SELECT jid FROM alvo);   -- inclui a pausa do bot nessa conversa
DELETE FROM "WhatsappOrderDraft" WHERE "remoteJid" IN (SELECT jid FROM alvo);
DELETE FROM "BotLead" WHERE "remoteJid" IN (SELECT jid FROM alvo);

COMMIT;
