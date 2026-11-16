import "server-only";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash, randomUUID } from "node:crypto";
import { ownedAsset, readAsset, type AssetRow } from "../assets";
import { storageClient, type StorageConnection } from "../byteplus-storage";
import { ApiError, badRequest } from "../errors";
import { requireStorage } from "../provider-settings";

const LIFETIME_SECONDS = 3600;
const EXTENSIONS: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/mp4": "m4a", "audio/ogg": "ogg",
};

interface Download {
  file: { id: string; kind: string; mime: string; bytes: number; name: string; url: string; expiresAt: string };
}
const copies = new Map<string, { until: number; work: Promise<Download> }>();

async function copyForDownload(row: AssetRow, connection: StorageConnection, extension: string): Promise<Download> {
  const client = storageClient(connection);
  const name = `parallax-${row.id}.${extension}`;
  const key = `parallax/downloads/${randomUUID()}.${extension}`;
  try {
    await client.send(new PutObjectCommand({
      Bucket: connection.tosBucket, Key: key, Body: await readAsset(row), ContentType: row.mime,
      ContentDisposition: `attachment; filename="${name}"`,
    }), { abortSignal: AbortSignal.timeout(90_000) });
    const expiresAt = new Date(Date.now() + LIFETIME_SECONDS * 1000).toISOString();
    const url = await getSignedUrl(client, new GetObjectCommand({
      Bucket: connection.tosBucket, Key: key, ResponseContentDisposition: `attachment; filename="${name}"`,
    }), { expiresIn: LIFETIME_SECONDS });
    return { file: { id: row.id, kind: row.kind, mime: row.mime, bytes: row.bytes, name, url, expiresAt } };
  } catch {
    throw new ApiError(503, "provider_configuration", "The private download could not be prepared. Check BytePlus storage in Generation settings, then retry this download. No new generation was submitted.");
  } finally { client.destroy(); }
}

/** An explicit export of one owned asset. Nothing makes the bucket or library public. */
export async function downloadFile(userId: string, id: string): Promise<Download> {
  const row = ownedAsset(userId, id); // Check ownership/deletion on every request, including cache hits.
  const extension = EXTENSIONS[row.mime];
  if (!extension) throw badRequest("This media format cannot be exported as a chat download.");
  const connection = requireStorage();
  const fingerprint = createHash("sha256").update(JSON.stringify(connection)).digest("hex");
  const cacheKey = `${userId}:${row.id}:${fingerprint}`;
  const now = Date.now();
  const cached = copies.get(cacheKey);
  if (cached && cached.until > now) return cached.work;
  const work = copyForDownload(row, connection, extension);
  copies.set(cacheKey, { until: now + (LIFETIME_SECONDS - 60) * 1000, work });
  while (copies.size > 128) copies.delete(copies.keys().next().value!);
  try { return await work; }
  catch (err) {
    if (copies.get(cacheKey)?.work === work) copies.delete(cacheKey);
    throw err;
  }
}
