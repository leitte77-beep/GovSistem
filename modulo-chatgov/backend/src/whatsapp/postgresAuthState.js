import {
  initAuthCreds,
  BufferJSON,
  proto,
} from '@whiskeysockets/baileys';
import db, { pgp } from '../db.js';
import { encrypt, decrypt } from '../services/encryption.js';

// ColumnSet para upserts em lote na tabela whatsapp_keys (uma linha por chave).
const keyColumns = new pgp.helpers.ColumnSet(
  ['tenant_id', 'key_type', 'key_id', { name: 'value', cast: 'jsonb' }],
  { table: 'whatsapp_keys' }
);

export async function createPostgresAuthState(db_unused, tenantId) {
  // Criptografa um valor de chave para a coluna jsonb.
  const encValue = (value) => ({ _enc: encrypt(JSON.stringify(value, BufferJSON.replacer)) });

  // Descriptografa um valor lido da coluna jsonb.
  const decValue = (raw) => {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    let jsonStr;
    if (obj?._enc) {
      jsonStr = decrypt(obj._enc);
      if (!jsonStr) throw new Error('Decryption failed');
    } else {
      jsonStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
    }
    return JSON.parse(jsonStr, BufferJSON.reviver);
  };

  // --- creds continuam num único registro (mudam raramente, sem concorrência) ---
  const readCreds = async () => {
    const row = await db.oneOrNone(
      'SELECT creds AS data FROM whatsapp_sessoes WHERE tenant_id = $1',
      [tenantId]
    );
    if (!row?.data) return null;
    return decValue(row.data);
  };

  const writeCreds = async (creds) => {
    try {
      await db.none(
        `INSERT INTO whatsapp_sessoes (tenant_id, creds)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (tenant_id) DO UPDATE SET creds = $2::jsonb, atualizado_em = now()`,
        [tenantId, JSON.stringify(encValue(creds))]
      );
    } catch (err) {
      console.error(`[AuthState] Write creds error for tenant ${tenantId}:`, err.message);
    }
  };

  let creds;
  try {
    creds = await readCreds();
    if (!creds) {
      creds = initAuthCreds();
      await writeCreds(creds);
    }
  } catch (err) {
    console.error(`[AuthState] Read creds error for tenant ${tenantId}:`, err.message);
    creds = initAuthCreds();
  }

  // --- key store: uma linha por (key_type, key_id) ---
  // Cache em memória para servir leituras rápidas (Baileys chama get com muita frequência).
  const cache = {};
  const addToCache = (type, id, value) => {
    cache[type] = cache[type] || {};
    cache[type][id] = value;
  };

  try {
    const rows = await db.manyOrNone(
      'SELECT key_type, key_id, value FROM whatsapp_keys WHERE tenant_id = $1',
      [tenantId]
    );
    for (const r of rows) {
      try {
        addToCache(r.key_type, r.key_id, decValue(r.value));
      } catch (e) {
        console.error(`[AuthState] decrypt key ${r.key_type}/${r.key_id} failed:`, e.message);
      }
    }

    // Migração one-time: se a tabela está vazia mas existe o blob antigo, importa-o.
    if (rows.length === 0) {
      const legacy = await db.oneOrNone(
        'SELECT keys AS data FROM whatsapp_sessoes WHERE tenant_id = $1',
        [tenantId]
      );
      let legacyStore = null;
      if (legacy?.data) {
        try { legacyStore = decValue(legacy.data); } catch { legacyStore = null; }
      }
      if (legacyStore && typeof legacyStore === 'object') {
        const migRows = [];
        for (const type of Object.keys(legacyStore)) {
          for (const id of Object.keys(legacyStore[type] || {})) {
            const value = legacyStore[type][id];
            addToCache(type, id, value);
            migRows.push({ tenant_id: tenantId, key_type: type, key_id: id, value: encValue(value) });
          }
        }
        if (migRows.length) {
          await db.none(
            pgp.helpers.insert(migRows, keyColumns) +
            ' ON CONFLICT (tenant_id, key_type, key_id) DO NOTHING'
          );
        }
        // Limpa o blob antigo para não ser reutilizado.
        await db.none('UPDATE whatsapp_sessoes SET keys = NULL WHERE tenant_id = $1', [tenantId]);
        console.log(`[AuthState] migrated ${migRows.length} keys from blob to whatsapp_keys for tenant ${tenantId}`);
      }
    }
  } catch (err) {
    console.error(`[AuthState] Read keys error for tenant ${tenantId}:`, err.message);
  }

  const keys = {
    get: async (type, ids) => {
      const result = {};
      const typeStore = cache[type] || {};
      for (const id of ids) {
        let value = typeStore[id];
        if (value && type === 'app-state-sync-key') {
          value = proto.Message.AppStateSyncKeyData.fromObject(value);
        }
        if (value !== undefined) {
          result[id] = value;
        }
      }
      return result;
    },
    set: async (data) => {
      const upserts = [];
      const deletes = [];
      for (const type of Object.keys(data)) {
        cache[type] = cache[type] || {};
        for (const id of Object.keys(data[type])) {
          const value = data[type][id];
          if (value === null || value === undefined) {
            delete cache[type][id];
            deletes.push({ key_type: type, key_id: id });
          } else {
            cache[type][id] = value;
            upserts.push({ tenant_id: tenantId, key_type: type, key_id: id, value: encValue(value) });
          }
        }
      }
      // Persiste por chave. Cada linha é independente: gravações concorrentes
      // (vários contatos ao mesmo tempo) não se sobrescrevem mais.
      try {
        await db.tx(async (t) => {
          if (upserts.length) {
            await t.none(
              pgp.helpers.insert(upserts, keyColumns) +
              ' ON CONFLICT (tenant_id, key_type, key_id) DO UPDATE SET value = EXCLUDED.value, atualizado_em = now()'
            );
          }
          for (const d of deletes) {
            await t.none(
              'DELETE FROM whatsapp_keys WHERE tenant_id = $1 AND key_type = $2 AND key_id = $3',
              [tenantId, d.key_type, d.key_id]
            );
          }
        });
      } catch (err) {
        console.error(`[AuthState] Write keys error for tenant ${tenantId}:`, err.message);
      }
    },
    clear: async () => {
      for (const k of Object.keys(cache)) delete cache[k];
      try {
        await db.none('DELETE FROM whatsapp_keys WHERE tenant_id = $1', [tenantId]);
      } catch (err) {
        console.error(`[AuthState] Clear keys error for tenant ${tenantId}:`, err.message);
      }
    },
  };

  return {
    state: { creds, keys },
    saveCreds: async () => {
      await writeCreds(creds);
    },
  };
}
