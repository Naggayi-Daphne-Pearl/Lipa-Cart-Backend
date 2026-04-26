/**
 * Shared multipart + upload helpers used by every admin "bulk import" flow
 * (products today, categories next, recipes after that). Keeping them in one
 * place avoids drift between content types.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

function shouldRetryUpload(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('etimedout') ||
    message.includes('econnreset') ||
    message.includes('eai_again') ||
    message.includes('socket hang up')
  );
}

function maxUploadAttempts(): number {
  const parsed = parseInt(process.env.BULK_IMPORT_UPLOAD_ATTEMPTS ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 2;
  return Math.min(parsed, 5);
}

export async function readFile(file: any): Promise<Buffer> {
  // Strapi v5 multipart files come through as either Buffer-bearing or
  // path-bearing structs depending on the body parser config. Normalise.
  if (file?.buffer && Buffer.isBuffer(file.buffer)) return file.buffer;
  if (file?.filepath) return fs.promises.readFile(file.filepath);
  if (file?.path) return fs.promises.readFile(file.path);
  throw new Error('Could not read uploaded file');
}

export async function uploadBufferToCloudinary(
  strapi: any,
  buffer: Buffer,
  filename: string,
  mime: string,
): Promise<number | null> {
  const fileService = strapi.plugin('upload').service('upload');
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bulk-import-upload-'));
  const safeName = path.basename(filename || 'upload.bin');
  const filePath = path.join(tmpDir, safeName);
  const attempts = maxUploadAttempts();

  try {
    await fs.promises.writeFile(filePath, buffer);

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const uploaded = await fileService.upload({
          data: {},
          files: {
            filepath: filePath,
            originalFilename: safeName,
            mimetype: mime,
            size: buffer.length,
          },
        });

        const created = Array.isArray(uploaded) ? uploaded[0] : uploaded;
        return created?.id ?? null;
      } catch (err) {
        lastError = err;
        if (attempt >= attempts || !shouldRetryUpload(err)) {
          throw err;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('image upload failed');
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function fetchRemoteImageBuffer(
  url: string,
  maxBytes: number,
): Promise<{ buffer: Buffer; mime: string; filename: string } | null> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') return null;

  const https = await import('https');
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        reject(new Error(`Upstream ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      res.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          req.destroy(new Error('image exceeds size limit'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('image fetch timeout')));
  });

  const filename = decodeURIComponent(path.basename(parsed.pathname)) || 'asset.jpg';
  const ext = path.extname(filename).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return { buffer, mime, filename };
}

export async function requireAdmin(ctx: any, strapi: any) {
  const authUser = ctx.state.user;
  if (!authUser) {
    ctx.unauthorized('Authentication required');
    return null;
  }
  const requester: any = await strapi.db.query('api::user.user').findOne({
    where: { phone: authUser.username },
  });
  if (!requester || requester.user_type !== 'admin') {
    ctx.forbidden('Admin only');
    return null;
  }
  return requester;
}

export function parseDryRun(ctx: any): boolean {
  return (
    String(ctx.request.body?.dry_run ?? '').toLowerCase() === 'true' ||
    String(ctx.query?.dry_run ?? '').toLowerCase() === 'true'
  );
}

export function maxImageBytes(): number {
  return parseInt(process.env.UPLOAD_MAX_BYTES ?? '', 10) || 10 * 1024 * 1024;
}
