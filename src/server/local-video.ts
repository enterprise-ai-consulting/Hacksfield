import "server-only";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Values } from "@/registry";
import { ApiError, badRequest } from "./errors";
import { hasFfmpeg } from "./media";

export function localVideoFilter(tool: string, values: Values): string {
  if (tool === "upscale") {
    const height = [720, 1080, 2160].includes(Number(values.resolution)) ? Number(values.resolution) : 1080;
    return `scale=-2:${height}:flags=lanczos,unsharp=5:5:0.4:3:3:0`;
  }
  if (tool === "fps") return `minterpolate=fps=${values.fps === "60" ? 60 : 30}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir`;
  if (tool === "reframe") {
    const ratios: Record<string, number> = { "9:16": 9 / 16, "16:9": 16 / 9, "1:1": 1, "4:5": 4 / 5 };
    const ratio = ratios[String(values.aspect)] ?? 9 / 16;
    return `crop=w='trunc(min(iw,ih*${ratio})/2)*2':h='trunc(min(ih,iw/${ratio})/2)*2',scale='min(1920,iw)':-2`;
  }
  throw badRequest("Unknown local video tool.");
}

export async function transformLocalVideo(bytes: Buffer, tool: string, values: Values): Promise<Buffer> {
  if (!(await hasFfmpeg())) throw new ApiError(503, "provider_configuration", "Install ffmpeg and ffprobe to use local video tools.");
  const filter = localVideoFilter(tool, values);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "parallax-video-"));
  try {
    const input = path.join(dir, "input"), output = path.join(dir, "output.mp4");
    await fs.writeFile(input, bytes, { mode: 0o600 });
    await new Promise<void>((resolve, reject) => execFile("ffmpeg", [
      "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe", "-i", input, "-t", "30", "-map", "0:v:0", "-map", "0:a?",
      "-vf", filter, "-threads", "2", "-filter_threads", "1", "-c:v", "libx264", "-preset", "fast", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", output,
    ], { timeout: 300_000, maxBuffer: 500_000 }, err => err ? reject(new ApiError(422, "invalid_request", "Local video processing failed. Use a standard video up to 30 seconds, or try a lower resolution.")) : resolve()));
    const info = await fs.stat(output);
    if (info.size > 400_000_000) throw badRequest("The processed video exceeds the 400 MB result limit.");
    return await fs.readFile(output);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
