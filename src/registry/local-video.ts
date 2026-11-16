import type { ModelDef } from "./types";

export const localVideoModels: ModelDef[] = (["upscale", "reframe", "fps"] as const).map(tool => ({
  id: `local-video-${tool}`, kind: "video", output: "video", vendor: "This Mac", name: `Local video ${tool}`,
  tagline: "Runs locally with ffmpeg. No provider or membership charge.", status: "available", surfaces: [`local-${tool}`],
  prompt: null, slots: [{ id: "source", label: "Source clip (up to 30s)", accept: ["video"], min: 1, max: 1 }],
  controls: tool === "reframe" ? [{ id: "aspect", type: "select", label: "Crop to", default: "9:16", options: ["9:16", "16:9", "1:1", "4:5"].map(value => ({ value, label: value })) }]
    : tool === "fps" ? [{ id: "fps", type: "select", label: "Frame rate", default: "30", options: ["30", "60"].map(value => ({ value, label: `${value} fps` })) }]
    : [{ id: "resolution", type: "select", label: "Height", default: "1080", options: ["720", "1080", "2160"].map(value => ({ value, label: `${value}p` })) }],
  batch: { max: 1, native: false }, eta: 60,
  build({ media, values }) { return { endpoint: `local.video.${tool}`, body: { source: media.source?.[0]?.url, ...values } }; },
}));
