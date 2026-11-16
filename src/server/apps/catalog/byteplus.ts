import { generationProvider } from "@/config/installation";
import { getModel, resolveValues } from "@/registry";
import { BYTEPLUS_IMAGE, BYTEPLUS_VIDEO, BYTEPLUS_MUSIC } from "@/registry/byteplus-latest";
import type { AppDef } from "../types";
import { input, text } from "./helpers";

function additionalTool(app: AppDef): AppDef {
  const base: AppDef = { ...app, status: "available", note: undefined, modelId: BYTEPLUS_IMAGE, values: { aspect: "1:1", resolution: "2K", background: "auto" }, open: ["aspect"], inputs: [input("photo", "Photo", "refs")], fields: [] };
  const video: AppDef = { ...base, result: "video", modelId: "byteplus-seedance-2.5-edit", values: { resolution: "480p" }, open: ["resolution"], inputs: [input("video", "Source clip (MP4/MOV, 4–30s)", "source", { hint: "Private BytePlus storage must be connected. Long or high-resolution edits can exceed the daily reservation budget." })] };
  switch (app.id) {
    case "upscale": return { ...base, name: "AI image enhancement", pitch: "Enhance detail and clarity at up to 2K. Generated fine details may change.", template: "Enhance the supplied photo: restore natural detail and clarity, reduce noise, preserve the scene, identity and composition. Produce a clean high-resolution image." };
    case "remove-background": return { ...base, pitch: "Remove the background and return a transparent PNG.", values: { ...base.values, background: "transparent" }, template: "Remove the background around the main subject. Preserve the subject, hair, fine edges and original appearance. Output the isolated subject on a transparent background." };
    case "face-swap": return { ...base, pitch: "Generate a face replacement using two image references. Other details can change.", inputs: [input("face", "Face reference", "refs"), input("photo", "Target photo", "refs")], template: "Replace the face of the person in image 2 with the identity from image 1. Preserve the pose, lighting, clothing and scene of image 2. Match the face naturally to the photograph." };
    case "inpaint": return { ...base, name: "Mask-guided edit", pitch: "Guide a generative edit with a mask image. Pixels outside the mask are not locked.", inputs: [input("photo", "Original image", "refs"), input("mask", "Mask (white marks the edit area)", "refs")], fields: [text("edit", "Describe the edit", { required: true, maxLength: 1000 })], template: "Image 1 is the original photo. Image 2 is a mask: white indicates the area to edit, black indicates what to preserve. Make this edit in the marked region: {{edit}}. Keep the rest of the image as close to the original as possible." };
    case "layers": return { ...base, modelId: "byteplus-seedream-5.5-layers", name: "Split into layers", pitch: "Native Seedream 5.5 decomposition into a base image and transparent PNG layers, up to eight files.", values: {}, open: [], template: "Decompose the image into useful, independently editable foreground, subject, lettering and background layers. Preserve the original appearance." };
    case "video-extend": return { ...video, modelId: "byteplus-seedance-2.5-extend", values: { ...video.values, duration: 5 }, open: ["duration", "resolution"], pitch: "Extend a clip with Seedance 2.5, preserving its framing.", fields: [text("direction", "What happens next?", { required: true, maxLength: 1000 })], template: "Extend the source video forward. Continue its action naturally: {{direction}}. Preserve the scene, characters and visual style." };
    case "video-face-swap": return { ...video, pitch: "Generate a face replacement through your clip. Other details may change.", inputs: [...video.inputs, input("face", "Face reference", "refs")], template: "Edit the source video: replace the main person's face with the identity in image 1. Preserve their movement, expression, lighting and the original scene. Keep the original audio." };
    case "lip-sync": return { ...video, pitch: "Generate speech and matching mouth movement from your clip and new audio.", inputs: [...video.inputs, input("voice", "New speech (MP3/WAV, 2–30s)", "audio")], template: "Edit the source video: replace its speech with reference audio 1, synchronizing the speaker's mouth and facial movement to the new words. Preserve the speaker's identity, framing and setting." };
    case "motion-transfer": return { ...video, modelId: "byteplus-seedance-2.5-reference", values: { ...video.values, duration: 5, aspect: "16:9" }, open: ["duration", "aspect", "resolution"], pitch: "Generate your character performing motion from a reference clip.", inputs: [...video.inputs, input("character", "Character image", "refs")], template: "Generate a new video. Use the character and appearance from image 1 and transfer the body movements and timing from video 1. Preserve the character's identity and coherent anatomy." };
    case "video-upscale": return { ...video, modelId: "local-video-upscale", name: "Resize and sharpen video", pitch: "Local Lanczos resizing and mild sharpening, up to 2160p. No AI detail reconstruction or provider charge.", values: { resolution: "1080" }, open: ["resolution"], inputs: [input("video", "Video (up to 30s)", "source")], template: "" };
    case "reframe": return { ...video, modelId: "local-video-reframe", pitch: "Crop a clip from its centre into a new aspect ratio locally. No provider charge.", values: { aspect: "9:16" }, open: ["aspect"], inputs: [input("video", "Video (up to 30s)", "source")], template: "" };
    case "fps-boost": return { ...video, modelId: "local-video-fps", pitch: "Interpolate motion locally at 30 or 60 fps. No provider charge.", values: { fps: "30" }, open: ["fps"], inputs: [input("video", "Video (up to 30s)", "source")], template: "" };
    case "video-background": return { ...app, note: "BytePlus Seedance returns standard video without transparency. Transparent video cutouts are unavailable; image background removal is connected." };
    default: return app;
  }
}

/** Preserve each tool's prompt and form while routing to the native model's legal controls. */
export function directByteplusApp(app: AppDef): AppDef {
  if (generationProvider !== "byteplus") return app;
  if (app.status !== "available") return additionalTool(app);
  const modelId = getModel(app.modelId)?.kind === "music" ? BYTEPLUS_MUSIC : app.result === "video" ? BYTEPLUS_VIDEO : app.result === "audio" ? "byteplus-seed-speech-2.0" : BYTEPLUS_IMAGE;
  const model = getModel(modelId)!;
  const open = app.open.filter(id => model.controls.some(control => control.id === id));
  const values = resolveValues(model, { ...app.values, resolution: app.result === "image" ? "2K" : "720p" }, {});
  const inputs = app.inputs.map(input => ({ ...input, slot: input.slot === "portrait" ? "refs" : input.slot === "voice" ? "audio" : input.slot }));
  const template = app.id === "talking-photo" ? "Animate the person in image 1 speaking directly to camera. Say exactly: {{script}}. If reference audio is supplied, use its speech and synchronize the mouth movements. Preserve the person's identity and original setting." : app.template;
  return { ...app, modelId, values, open, inputs, template };
}
