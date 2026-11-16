/**
 * The model registry: every model the studio can run, as data.
 * To add a model, add one entry in `image.ts`, `video.ts` or `audio.ts`. The composer,
 * the live price, validation and the provider call all follow from that entry.
 */
import { musicModels, speechModels } from "./audio";
import { imageModels } from "./image";
import { videoModels } from "./video";
import { byteplusModels } from "./byteplus";
import { latestByteplusModels } from "./byteplus-latest";
import { localVideoModels } from "./local-video";
import { decartModels } from "./decart";
import { generationProvider } from "../config/installation";
import type { ModelDef } from "./types";

export const models: ModelDef[] = [...imageModels, ...videoModels, ...speechModels, ...musicModels, ...latestByteplusModels, ...byteplusModels, ...localVideoModels, ...decartModels];

const byId = new Map(models.map((m) => [m.id, m]));

export function getModel(id: string | null | undefined): ModelDef | undefined {
  return id ? byId.get(id) : undefined;
}

/** Models for one studio or tool, in display order. */
export function modelsFor(surface: string): ModelDef[] {
  const list = models.filter((m) => m.surfaces.includes(surface));
  if (generationProvider !== "byteplus") return list.filter((m) => !m.id.startsWith("byteplus-"));
  const direct = list.filter((m) => m.id.startsWith("byteplus-") || m.id.startsWith("decart-"));
  return direct.length ? direct : list.map((m) => ({ ...m, status: "offline", statusNote: "This model requires a Treg provider key. Use the native BytePlus models for this installation." }));
}

/** The model a surface opens on: the first featured one that can run. */
export function defaultModel(surface: string): ModelDef | undefined {
  const list = modelsFor(surface).filter((m) => m.status === "available");
  return list.find((m) => m.featured) ?? list[0];
}

export * from "./types";
export * from "./logic";
export { quoteUsd, catalogEndpoint } from "./quote";
