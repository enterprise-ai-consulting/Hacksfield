import type { ModelDef } from "./types";

const sizes: Record<string, string> = { "1:1": "2048x2048", "16:9": "2560x1440", "9:16": "1440x2560", "4:3": "2304x1728", "3:4": "1728x2304", "3:2": "2496x1664" };
const prompt = { required: true, maxLength: 4000 };

export const byteplusModels: ModelDef[] = [
  {
    id: "byteplus-seedream-4.5", kind: "image", name: "Seedream 4.5", vendor: "ByteDance",
    tagline: "Uses your remaining Seedream 4.5 free allowance first. Listed at $0.04 per image after free quota.", badges: ["BytePlus"], featured: true,
    status: "available", surfaces: ["image"], prompt,
    slots: [{ id: "refs", label: "References", accept: ["image"], min: 0, max: 14 }],
    controls: [{ id: "aspect", type: "select", label: "Aspect ratio", display: "aspect", default: "1:1", options: Object.keys(sizes).map((value) => ({ value, label: value })) }],
    batch: { max: 4, native: false }, output: "image", eta: 15,
    build({ prompt, values, media }) {
      const image = media.refs?.map((ref) => `data:${ref.mime};base64,${ref.data}`);
      return { endpoint: "byteplus.image.seedream-4-5", body: {
        prompt, size: sizes[String(values.aspect)] ?? sizes["1:1"], response_format: "b64_json", sequential_image_generation: "disabled", watermark: true,
        ...(image?.length ? { image } : {}),
      } };
    },
  },
  {
    id: "byteplus-seedance-2.0", kind: "video", name: "Seedance 2.0", vendor: "ByteDance",
    tagline: "Direct BytePlus video with sound. Provider usage is billed to your BytePlus account; the price shown is a budget reservation.", badges: ["BytePlus", "Sound"], featured: true,
    status: "available", surfaces: ["video"], prompt,
    slots: [
      { id: "start", label: "Start frame", accept: ["image"], min: 0, max: 1 },
      { id: "end", label: "End frame", accept: ["image"], min: 0, max: 1, when: { "slot:start": "filled" } },
    ],
    controls: [
      { id: "aspect", type: "select", label: "Aspect ratio", display: "aspect", default: "16:9", options: ["16:9", "9:16"].map((value) => ({ value, label: value })) },
      { id: "resolution", type: "select", label: "Resolution", default: "720p", options: ["480p", "720p"].map((value) => ({ value, label: value })) },
      { id: "duration", type: "slider", label: "Duration", min: 4, max: 15, step: 1, default: 5, unit: "s" },
    ],
    batch: { max: 4, native: false }, output: "video", eta: 120,
    build({ prompt, values, media }) {
      const content: Record<string, unknown>[] = [{ type: "text", text: prompt }];
      for (const [slot, role] of [["start", "first_frame"], ["end", "last_frame"]]) {
        const ref = media[slot]?.[0];
        if (ref) content.push({ type: "image_url", image_url: { url: `data:${ref.mime};base64,${ref.data}` }, role });
      }
      return { endpoint: "byteplus.video.seedance-2-0", body: {
        content, resolution: values.resolution, ratio: values.aspect, duration: Number(values.duration), generate_audio: true, watermark: true,
      } };
    },
  },
  {
    id: "byteplus-seed-speech-2.0", kind: "audio", name: "Seed Speech 2.0", vendor: "ByteDance",
    tagline: "Natural speech through your Seed Speech account. Listed at $30 per million characters before free quota.", badges: ["BytePlus"], featured: true,
    status: "available", surfaces: ["speech"], prompt: { required: true, maxLength: 3000, label: "Script" }, slots: [],
    controls: [
      { id: "voice", type: "select", label: "Voice", display: "menu", default: "en_female_skye_uranus_bigtts", options: [
        { value: "en_female_skye_uranus_bigtts", label: "Skye" },
        { value: "en_male_tim_uranus_bigtts", label: "Tim" },
        { value: "en_female_stokie_uranus_bigtts", label: "Stokie" },
        { value: "en_male_ronald_uranus_bigtts", label: "Ronald" },
        { value: "en_female_dacey_uranus_bigtts", label: "Dacey" },
        { value: "en_male_jamie_uranus_bigtts", label: "Jamie" },
      ] },
      { id: "speed", type: "slider", label: "Speed adjustment", min: -50, max: 100, step: 10, default: 0, unit: "%" },
      { id: "style", type: "text", label: "Delivery", maxLength: 200, default: "", placeholder: "Warm and cheerful, like a friendly introduction" },
    ],
    batch: { max: 1, native: false }, output: "audio", eta: 15,
    build({ prompt, values }) {
      return { endpoint: "byteplus.speech.seed-tts-2-0", body: { text: prompt, speaker: values.voice, speech_rate: Number(values.speed), style: String(values.style ?? "").trim() } };
    },
  },
  {
    id: "byteplus-seedance-music", kind: "music", name: "Seedance Soundtrack", vendor: "ByteDance",
    tagline: "4–15 second music clips extracted from Seedance 2.0 video. Billed directly to your BytePlus account at video rates.", badges: ["BytePlus", "Short clips"], featured: true,
    status: "available", surfaces: ["music"], prompt: { required: true, maxLength: 3000, label: "Describe the music clip" }, slots: [],
    controls: [
      { id: "duration", type: "slider", label: "Duration", min: 4, max: 15, step: 1, default: 5, unit: "s" },
      { id: "instrumental", type: "toggle", label: "Instrumental", default: true },
    ],
    batch: { max: 1, native: false }, output: "audio", eta: 120,
    build({ prompt, values }) {
      const text = `Create a music soundtrack. ${values.instrumental ? "Instrumental only, no speech or vocals." : "Vocals may be included as described."} Music direction: ${prompt}\nUse a simple abstract static visual. The music is the focus; avoid incidental sound effects and narration.`;
      return { endpoint: "byteplus.music.seedance-2-0", body: { content: [{ type: "text", text }], resolution: "480p", ratio: "16:9", duration: Number(values.duration), generate_audio: true, watermark: true } };
    },
  },
];

const imageBase = byteplusModels[0];
const videoBase = byteplusModels[1];

const additionalImages: ModelDef[] = [
  { id: "byteplus-seedream-4.0", name: "Seedream 4.0", endpoint: "byteplus.image.seedream-4-0", price: "$0.03" },
  { id: "byteplus-seedream-5.0-lite", name: "Seedream 5.0 lite", endpoint: "byteplus.image.seedream-5-0-lite", price: "$0.035" },
].map(({ id, name, endpoint, price }) => ({
  ...imageBase, id, name, featured: false,
  tagline: `Uses this model's own free image allowance first. Listed at ${price} per image after free quota.`,
  build(input) { return { ...imageBase.build(input), endpoint }; },
}));

const allowanceVideos: ModelDef[] = [
  { id: "byteplus-seedance-1.0-pro-fast", name: "Seedance 1.0 Pro Fast", endpoint: "byteplus.video.seedance-1-0-pro-fast", firstLast: false },
  { id: "byteplus-seedance-1.0-pro", name: "Seedance 1.0 Pro", endpoint: "byteplus.video.seedance-1-0-pro", firstLast: true },
].map(({ id, name, endpoint, firstLast }) => ({
  ...videoBase, id, name, featured: false, badges: ["BytePlus", "Silent video"],
  tagline: "Uses this model's remaining free video tokens first. Silent clips, 2–12 seconds. Provider billing begins after free quota.",
  slots: videoBase.slots.filter((slot) => firstLast || slot.id !== "end"),
  controls: videoBase.controls.map((control) => control.id === "duration" && control.type === "slider" ? { ...control, min: 2, max: 12 } : control.id === "resolution" && control.type === "select" ? { ...control, default: "480p" } : control.id === "aspect" && control.type === "select" ? { ...control, options: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"].map((value) => ({ value, label: value })) } : control),
  build(input) {
    const request = videoBase.build(input);
    delete request.body.generate_audio;
    return { ...request, endpoint };
  },
}));

byteplusModels.splice(1, 0, ...additionalImages, ...allowanceVideos);

byteplusModels.push({
  id: "byteplus-seed-audio-1.0", kind: "music", name: "Seed Audio 1.0", vendor: "ByteDance",
  tagline: "Prompt music beds, ambience and sound effects using your Audio 1.0 free minutes first. Requested timing may vary; the budget reserves up to 120 seconds.",
  badges: ["BytePlus", "Audio"], featured: false, status: "available", surfaces: ["music"],
  prompt: { required: true, maxLength: 2700, label: "Describe the audio clip" }, slots: [],
  controls: [
    { id: "duration", type: "slider", label: "Requested duration", min: 4, max: 30, step: 1, default: 10, unit: "s" },
    { id: "instrumental", type: "toggle", label: "Instrumental", default: true },
  ],
  batch: { max: 1, native: false }, output: "audio", eta: 30,
  build({ prompt, values }) {
    return { endpoint: "byteplus.audio.seed-audio-1-0", body: {
      text_prompt: `Generate a ${Number(values.duration)}-second audio clip. ${values.instrumental ? "Instrumental music or ambience only; no speech or vocals." : "Use vocals or speech only if described."} Direction: ${prompt}`,
    } };
  },
});
