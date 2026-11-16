import type { ModelDef } from "./types";

/** Pin versions so model behaviour and published prices cannot change through an alias. */
export const decartModels: ModelDef[] = [{
  id: "decart-lucy-image-2", kind: "image", name: "Lucy Image 2", vendor: "Decart",
  tagline: "Edit an uploaded image with text and an optional visual reference. Direct Decart billing.",
  status: "available", surfaces: ["image"], prompt: { required: true, maxLength: 4000 },
  slots: [
    { id: "source", label: "Image to edit", accept: ["image"], min: 1, max: 1 },
    { id: "reference", label: "Visual reference", accept: ["image"], min: 0, max: 1 },
  ],
  controls: [{ id: "resolution", type: "select", label: "Resolution", default: "720p", options: ["480p", "720p"].map(value => ({ value, label: value })) }],
  batch: { max: 1, native: false }, output: "image", eta: 15,
  build({ prompt, values, media }) {
    const source = media.source?.[0];
    const reference = media.reference?.[0];
    return { endpoint: "decart.image.lucy-image-2", body: {
      prompt, resolution: values.resolution, data: source ? `data:${source.mime};base64,${source.data}` : "",
      ...(reference ? { reference_image: `data:${reference.mime};base64,${reference.data}` } : {}),
    } };
  },
}, ...([
  ["lucy-2.6", "Lucy 2.6", "Edit objects, characters and backgrounds in an uploaded video."],
  ["lucy-vton-3.6", "Lucy VTON 3.6", "Change outfits in an uploaded video using text and an optional garment image."],
  ["lucy-restyle-2", "Lucy Restyle 2", "Apply a new visual style across an uploaded video."],
] as const).map(([version, name, tagline]): ModelDef => ({
  id: `decart-${version}`, kind: "video", name, vendor: "Decart",
  tagline: `${tagline} 720p; direct Decart billing.`, status: "available", surfaces: ["video", "video-edit"],
  prompt: { required: true, maxLength: 4000 },
  slots: [
    { id: "source", label: "Source video (MP4, up to 30s / 30 MB)", accept: ["video"], min: 1, max: 1 },
    ...(version === "lucy-restyle-2" ? [] : [{ id: "reference", label: version.includes("vton") ? "Garment reference" : "Visual reference", accept: ["image"] as ["image"], min: 0, max: 1 }]),
  ],
  controls: [], batch: { max: 1, native: false }, output: "video", eta: 90,
  build({ prompt, media }) {
    const source = media.source?.[0];
    const reference = media.reference?.[0];
    return { endpoint: `decart.video.${version}`, body: {
      prompt, resolution: "720p", data: source ? `data:${source.mime};base64,${source.data}` : "",
      ...(reference ? { reference_image: `data:${reference.mime};base64,${reference.data}` } : {}),
      // Quote whole seconds conservatively. The server checks the real uploaded duration.
      _parallax_duration: Math.ceil(source?.duration ?? 30),
    } };
  },
}))];
