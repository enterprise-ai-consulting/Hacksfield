import type { CatalogEndpoint } from "./quote";

/** https://docs.platform.decart.ai/getting-started/pricing */
export const decartEndpoints: Record<string, CatalogEndpoint> = {
  "decart.image.lucy-image-2": {
    provider: "decart", platform: null, name: "Lucy Image 2", method: "POST", path: "/v1/generate/lucy-image-2", params: [],
    cost: { table: [{ when: { resolution: "480p" }, value: 0.01 }, { when: { resolution: "720p" }, value: 0.02 }] }, async: null,
  },
};
for (const [model, rate] of [["lucy-2.6", 0.04], ["lucy-vton-3.6", 0.04], ["lucy-restyle-2", 0.01]] as const) {
  decartEndpoints[`decart.video.${model}`] = {
    provider: "decart", platform: null, name: model, method: "POST", path: `/v1/jobs/${model}`, params: [],
    cost: { estimated: true, table: [{ when: {}, value: rate, times: "_parallax_duration", timesMin: 1 }] },
    async: { interval: 5, statusPath: "status", success: ["completed"], failure: ["failed", "cancelled"] },
  };
}
