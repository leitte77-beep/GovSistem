import multer from 'multer';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { createStorage } from '../storage/index.js';
import db from '../db.js';

const storage = createStorage();

export const MIMES_PERMITIDOS = Object.freeze([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
]);

export const TAMANHO_MAX_BYTES = 20 * 1024 * 1024;

// Rótulos amigáveis para a mensagem de erro mostrada ao usuário.
const EXTENSOES_ACEITAS = 'PDF, JPG, PNG, WEBP, DOC, DOCX, XLS, XLSX, ODT, ODS';

class UploadInvalido extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'UploadInvalido';
    this.statusCode = 400;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (MIMES_PERMITIDOS.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new UploadInvalido(
        `Tipo de arquivo não aceito. Envie um dos formatos: ${EXTENSOES_ACEITAS}.`
      ));
    }
  },
});

export { upload, UploadInvalido };

/**
 * Middleware de upload de um arquivo que responde erros de forma tratável.
 *
 * O multer entrega falhas de fileFilter/limite via next(err), que caíam no
 * handler genérico do Express e viravam 500 com corpo vazio — o usuário não
 * recebia explicação nenhuma. Aqui elas viram 400/413 com mensagem.
 */
export function uploadUnico(campo = 'arquivo') {
  const middleware = upload.single(campo);
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (!err) return next();

      if (err instanceof UploadInvalido) {
        return res.status(400).json({ erro: err.message });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          erro: `Arquivo maior que o limite de ${Math.round(TAMANHO_MAX_BYTES / 1024 / 1024)} MB.`,
        });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ erro: `Envie o arquivo no campo "${campo}".` });
      }
      console.error('[upload] Falha inesperada:', err.message);
      return res.status(400).json({ erro: 'Não foi possível processar o arquivo enviado.' });
    });
  };
}

/**
 * Confere a assinatura binária do arquivo contra o tipo declarado.
 * O mimetype do multipart vem do cliente e pode ser forjado; aqui olhamos
 * os primeiros bytes para confirmar que o conteúdo é o que diz ser.
 */
export function detectarTipoReal(buffer) {
  if (!buffer || buffer.length < 4) return null;
  const hex = buffer.subarray(0, 8).toString('hex').toLowerCase();
  const ascii = buffer.subarray(0, 8).toString('latin1');

  if (hex.startsWith('25504446')) return 'application/pdf';          // %PDF
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png';
  if (ascii.startsWith('RIFF') && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  // DOCX/XLSX/ODT/ODS são contêineres ZIP; DOC/XLS antigos usam OLE2.
  if (hex.startsWith('504b0304') || hex.startsWith('504b0506')) return 'zip';
  if (hex.startsWith('d0cf11e0a1b11ae1')) return 'ole2';
  return null;
}

const FAMILIA_ZIP = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
]);
const FAMILIA_OLE2 = new Set(['application/msword', 'application/vnd.ms-excel']);

export function validarConteudoArquivo(buffer, mimeDeclarado) {
  const real = detectarTipoReal(buffer);
  if (!real) {
    throw new UploadInvalido('Não foi possível reconhecer o conteúdo do arquivo enviado.');
  }
  const compativel = real === mimeDeclarado
    || (real === 'zip' && FAMILIA_ZIP.has(mimeDeclarado))
    || (real === 'ole2' && FAMILIA_OLE2.has(mimeDeclarado));

  if (!compativel) {
    throw new UploadInvalido(
      'O conteúdo do arquivo não corresponde à sua extensão. Envie o arquivo original.'
    );
  }
}

export async function salvarArquivoProtocolo(tenantId, protocoloId, file, enviadoPor, opcoes = {}) {
  const buffer = file.buffer;
  const mime = file.mimetype;
  const nomeOriginal = file.originalname || 'arquivo';

  // O tipo declarado pelo cliente já passou pelo fileFilter; aqui confirmamos
  // que o conteúdo corresponde de fato ao que foi declarado.
  validarConteudoArquivo(buffer, mime);

  const sha256 = await cryptoHash(buffer);

  // Nível de acesso e origem eram fixos: todo anexo nascia visível ao cidadão
  // e não havia como registrar um documento interno.
  const NIVEIS = ['publico', 'restrito_cidadao', 'restrito_setor', 'sigiloso'];
  const nivelAcesso = NIVEIS.includes(opcoes.nivelAcesso) ? opcoes.nivelAcesso : 'restrito_setor';
  const ORIGENS = ['interno', 'cidadao', 'sistema', 'whatsapp', 'email', 'api'];
  const origem = ORIGENS.includes(opcoes.origem) ? opcoes.origem : 'interno';

  // Mesmo arquivo já anexado a este protocolo: devolve o existente em vez de
  // duplicar o conteúdo no storage.
  const duplicado = await db.oneOrNone(
    `SELECT * FROM protocolo_documentos
     WHERE tenant_id = $1 AND protocolo_id = $2 AND sha256 = $3
     LIMIT 1`,
    [tenantId, protocoloId, sha256]
  );
  if (duplicado) return { ...duplicado, duplicado: true };

  const url = await storage.salvar(buffer, mime, tenantId);

  const doc = await db.one(
    `INSERT INTO protocolo_documentos
      (tenant_id, protocolo_id, nome_amigavel, nome_interno, mime_type,
       tamanho_bytes, sha256, status, origem, enviado_por, nivel_acesso,
       tipo_documental, pendencia_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'recebido',$8,$9,$10,$11,$12)
     RETURNING *`,
    [tenantId, protocoloId, nomeOriginal, url, mime,
     buffer.length, sha256, origem, enviadoPor || null, nivelAcesso,
     opcoes.tipoDocumental || null, opcoes.pendenciaId || null]
  );

  await db.none(
    `INSERT INTO protocolo_documento_versoes
      (tenant_id, documento_id, versao, nome_interno, tamanho_bytes, sha256, criado_por)
     VALUES ($1,$2,1,$3,$4,$5,$6)`,
    [tenantId, doc.id, url, buffer.length, sha256, enviadoPor || null]
  );

  const versao = await db.oneOrNone(
    `SELECT id FROM protocolo_documento_versoes WHERE documento_id = $1 AND versao = 1`, [doc.id]
  );
  if (versao) {
    await db.none(
      `UPDATE protocolo_documentos SET versao_atual_id = $1 WHERE id = $2`,
      [versao.id, doc.id]
    );
  }

  await db.none(`UPDATE protocolos SET atualizado_em = now() WHERE id = $1`, [protocoloId]);

  return doc;
}

export async function obterArquivoDocumento(tenantId, documentoId) {
  const doc = await db.oneOrNone(
    `SELECT d.*, dv.nome_interno AS versao_nome_interno
     FROM protocolo_documentos d
     LEFT JOIN protocolo_documento_versoes dv ON dv.id = d.versao_atual_id
     WHERE d.id = $1 AND d.tenant_id = $2`,
    [documentoId, tenantId]
  );
  if (!doc) return null;

  const nomeInterno = doc.versao_nome_interno || doc.nome_interno;
  const buffer = await storage.obter(nomeInterno, tenantId);

  return { buffer, doc };
}

async function cryptoHash(buffer) {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(buffer).digest('hex');
}
