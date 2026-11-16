import type { ModelDef } from "./types";
import { byteplusModels } from "./byteplus";

export const BYTEPLUS_IMAGE = "byteplus-seedream-5.5";
export const BYTEPLUS_VIDEO = "byteplus-seedance-2.5";
export const BYTEPLUS_MUSIC = "byteplus-seedance-2.5-music";
const imageBase = byteplusModels.find(m => m.id === "byteplus-seedream-4.5")!;
const videoBase = byteplusModels.find(m => m.id === "byteplus-seedance-2.0")!;
const musicBase = byteplusModels.find(m => m.id === "byteplus-seedance-music")!;
const aspects = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4", "21:9"];

function dimensions(resolution: unknown, aspect: unknown): string {
  const edge = resolution === "1K" ? 1024 : resolution === "1.5K" ? 1536 : 2048;
  const [w, h] = String(aspect).split(":").map(Number);
  const ratio = w > 0 && h > 0 ? w / h : 1;
  return `${Math.round(edge * Math.sqrt(ratio) / 16) * 16}x${Math.round(edge / Math.sqrt(ratio) / 16) * 16}`;
}

const latestImage: ModelDef = {
  ...imageBase, id: BYTEPLUS_IMAGE, name: "Seedream 5.5", featured: true,
  tagline: "Current BytePlus image generation and editing, including transparent PNG output. Usage is billed directly by BytePlus.",
  slots: [{ id: "refs", label: "Reference images", accept: ["image"], min: 0, max: 10 }],
  controls: [
    { id: "aspect", type: "select", label: "Aspect ratio", display: "aspect", default: "1:1", options: aspects.map(value => ({ value, label: value })) },
    { id: "resolution", type: "select", label: "Resolution", default: "2K", options: ["1K", "1.5K", "2K"].map(value => ({ value, label: value })) },
    { id: "background", type: "select", label: "Background", default: "auto", options: ["auto", "opaque", "transparent"].map(value => ({ value, label: value })) },
  ],
  build({ prompt, values, media }) {
    const image = media.refs?.map(ref => `data:${ref.mime};base64,${ref.data}`);
    return { endpoint: "byteplus.image.seedream-5-5", body: {
      prompt, size: dimensions(values.resolution, values.aspect), output_format: "png", background: values.background,
      response_format: "b64_json", watermark: true, ...(image?.length ? { image } : {}),
    } };
  },
};

const latestVideo: ModelDef = {
  ...videoBase, id: BYTEPLUS_VIDEO, name: "Seedance 2.5", featured: true,
  tagline: "Current BytePlus video with native sound, first/last frames and up to 30-second clips. Direct BytePlus billing.",
  slots: [
    { ...videoBase.slots[0], when: { "slot:refs": "empty", "slot:audio": "empty" } }, videoBase.slots[1],
    { id: "refs", label: "Reference images", accept: ["image"], min: 0, max: 4, when: { "slot:start": "empty" } },
    { id: "audio", label: "Reference audio (MP3 or WAV)", accept: ["audio"], min: 0, max: 1, when: { "slot:start": "empty" } },
  ],
  controls: videoBase.controls.map(c => c.id === "duration" && c.type === "slider" ? { ...c, max: 30 }
    : c.id === "aspect" && c.type === "select" ? { ...c, options: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"].map(value => ({ value, label: value })) }
    : c.id === "resolution" && c.type === "select" ? { ...c, options: ["480p", "720p", "1080p"].map(value => ({ value, label: value })) } : c),
  build(input) {
    const request = videoBase.build(input);
    if (input.media.refs?.length || input.media.audio?.length) {
      const content: Record<string, unknown>[] = [{ type: "text", text: input.prompt }];
      for (const ref of input.media.refs ?? []) content.push({ type: "image_url", image_url: { url: `data:${ref.mime};base64,${ref.data}` }, role: "reference_image" });
      for (const ref of input.media.audio ?? []) content.push({ type: "audio_url", audio_url: { url: `data:${ref.mime};base64,${ref.data}` }, role: "reference_audio" });
      request.body.content = content;
      request.body.omni_reference_task_type = "reference";
    }
    return { ...request, endpoint: "byteplus.video.seedance-2-5" };
  },
};

const videoTools: ModelDef[] = (["edit", "extend", "reference"] as const).map(task => ({
  ...latestVideo, id: `byteplus-seedance-2.5-${task}`, name: `Seedance 2.5 ${task}`, surfaces: [`video-${task}`], featured: false,
  slots: [
    { id: "source", label: "Source video (MP4/MOV, 4–30s)", accept: ["video"], min: 1, max: 1 },
    { id: "refs", label: "Image references", accept: ["image"], min: 0, max: 2 },
    { id: "audio", label: "Audio reference (MP3/WAV, 2–30s)", accept: ["audio"], min: 0, max: 1 },
  ],
  controls: latestVideo.controls.filter(c => c.id !== "aspect" || task === "reference").filter(c => c.id !== "duration" || task !== "edit").map(c => c.id === "duration" && c.type === "slider" ? { ...c, max: 15 } : c.id === "resolution" && c.type === "select" ? { ...c, default: "480p" } : c),
  batch: { max: 1, native: false },
  build({ prompt, values, media }) {
    const content: Record<string, unknown>[] = [{ type: "text", text: prompt }];
    for (const ref of media.source ?? []) content.push({ type: "video_url", video_url: { url: ref.url }, role: "reference_video" });
    for (const ref of media.refs ?? []) content.push({ type: "image_url", image_url: { url: `data:${ref.mime};base64,${ref.data}` }, role: "reference_image" });
    for (const ref of media.audio ?? []) content.push({ type: "audio_url", audio_url: { url: `data:${ref.mime};base64,${ref.data}` }, role: "reference_audio" });
    return { endpoint: "byteplus.video.seedance-2-5", body: {
      content, omni_reference_task_type: task, duration: task === "edit" ? -1 : values.duration,
      ratio: task === "reference" ? values.aspect : "adaptive", resolution: values.resolution,
      generate_audio: values.audio ?? true, watermark: true,
      // Internal pricing metadata is removed before transport; it is never a provider parameter.
      _parallax_reservation_seconds: task === "edit" ? (media.source?.[0]?.duration ?? 30) : values.duration,
    } };
  },
}));

export const latestByteplusModels: ModelDef[] = [latestImage, latestVideo, ...videoTools, {
  ...musicBase, id: BYTEPLUS_MUSIC, name: "Seedance 2.5 Soundtrack", featured: true,
  tagline: "Short music clips from Seedance 2.5. A video is generated and its audio is saved as MP3; BytePlus video rates apply.",
  build(input) { return { ...musicBase.build(input), endpoint: "byteplus.music.seedance-2-5" }; },
}, {
  ...latestImage, id: "byteplus-seedream-5.5-layers", name: "Seedream 5.5 Layers", featured: false, surfaces: ["layers"],
  tagline: "Native layer decomposition: a base image and transparent layer PNGs, up to eight images per request.",
  slots: [{ id: "refs", label: "Image to split", accept: ["image"], min: 1, max: 1 }],
  controls: [], batch: { max: 1, native: false },
  build({ prompt, media }) {
    return { endpoint: "byteplus.image.seedream-5-5-layers", body: {
      prompt, image: media.refs?.map(ref => `data:${ref.mime};base64,${ref.data}`), size: "2K", output_format: "png",
      layer_decomposition: true, layer_decomposition_options: { max_images: 8 }, response_format: "b64_json", watermark: true,
    } };
  },
}];
