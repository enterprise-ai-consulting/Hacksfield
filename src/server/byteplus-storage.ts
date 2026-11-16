import "server-only";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import path from "node:path";
import { readAsset, type AssetRow } from "./assets";
import { dataDir } from "./db";
import { ApiError, badRequest } from "./errors";
import { requireStorage } from "./provider-settings";

export const STORAGE_REGION = "ap-southeast-1";
export const STORAGE_ENDPOINT = "https://tos-s3-ap-southeast-1.bytepluses.com";
const SIX_HOURS = 6 * 3600;
export interface StorageConnection { tosAccessKeyId: string; tosSecretAccessKey: string; tosBucket: string }

/** The AWS SDK implements BytePlus's documented S3-compatible API; no AWS service is used. */
export function storageClient(connection: StorageConnection): S3Client {
  return new S3Client({
    region: STORAGE_REGION, endpoint: STORAGE_ENDPOINT,
    credentials: { accessKeyId: connection.tosAccessKeyId, secretAccessKey: connection.tosSecretAccessKey },
    maxAttempts: 1, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export function signedVideoUrl(client: S3Client, bucket: string, key: string): Promise<string> {
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: SIX_HOURS });
}

export function validateVideoReference(row: Pick<AssetRow, "kind" | "mime" | "bytes" | "duration" | "width" | "height">) {
  if (row.kind !== "video" || !["video/mp4", "video/quicktime"].includes(row.mime)) throw badRequest("Seedance video references must be MP4 or MOV (H.264/H.265).");
  if (row.bytes > 30_000_000) throw badRequest("Use a video reference under 30 MB.");
  if (row.duration == null || !Number.isFinite(row.duration)) throw badRequest("The video duration could not be read. Export a standard MP4 or MOV first.");
  if (row.duration < 4 || row.duration > 30) throw badRequest("Use a video reference between 4 and 30 seconds.");
  const w = row.width ?? 0, h = row.height ?? 0;
  if (w < 300 || h < 300 || w > 6000 || h > 6000 || w * h < 407696 || w * h > 8295044 || w / h < 0.4 || w / h > 2.5) throw badRequest("The video reference must be 300–6000 pixels per side, 0.4–2.5 aspect ratio and roughly 0.4–8.3 megapixels.");
}

export function validateSeedanceAudio(row: Pick<AssetRow, "mime" | "bytes" | "duration">) {
  if (!["audio/mpeg", "audio/wav"].includes(row.mime) || row.bytes > 15_000_000 || row.duration == null || row.duration < 2 || row.duration > 30) throw badRequest("Seedance reference audio must be MP3 or WAV, 2–30 seconds and under 15 MB.");
}

async function validateEncoding(row: AssetRow) {
  const result = await new Promise<string>((resolve, reject) => {
    execFile("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-select_streams", "v:0", "-show_entries", "stream=codec_name,avg_frame_rate", "-of", "json", path.join(dataDir(), row.path)], { timeout: 20_000, maxBuffer: 100_000 }, (err, out) => err ? reject(new Error("encoding")) : resolve(out));
  }).catch(() => { throw badRequest("The video encoding could not be checked. Ensure ffprobe is installed and export a standard MP4 first."); });
  const stream = JSON.parse(result).streams?.[0];
  const [n, d] = String(stream?.avg_frame_rate).split("/").map(Number);
  const fps = n / d;
  if (!["h264", "hevc"].includes(stream?.codec_name) || !Number.isFinite(fps) || fps < 23.9 || fps > 60.1) throw badRequest("Seedance references need H.264/H.265 video at 24–60 fps. Export a compatible MP4 first.");
}

/** Only a selected, owned file reaches here. The bucket stays private; URLs never reach the browser. */
export async function uploadByteplusVideo(row: AssetRow): Promise<string> {
  validateVideoReference(row);
  await validateEncoding(row);
  const connection = requireStorage();
  const client = storageClient(connection);
  try {
    const key = `parallax/${randomUUID()}.${row.mime === "video/quicktime" ? "mov" : "mp4"}`;
    await client.send(new PutObjectCommand({ Bucket: connection.tosBucket, Key: key, Body: await readAsset(row), ContentType: row.mime }), { abortSignal: AbortSignal.timeout(90_000) });
    return await signedVideoUrl(client, connection.tosBucket, key);
  } catch {
    throw new ApiError(503, "provider_configuration", "BytePlus private video storage is unavailable. Check the bucket and restricted storage key in Generation settings. No video generation was submitted.");
  } finally { client.destroy(); }
}
