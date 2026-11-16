/** Public installation settings. Changes require a rebuild; credentials never belong here. */
export const personalInstallation = process.env.NEXT_PUBLIC_PARALLAX_PERSONAL_MODE !== "0";
export const generationProvider = process.env.NEXT_PUBLIC_PARALLAX_PROVIDER === "treg" ? "treg" : "byteplus";

export function generationPrice(quote: { usdPerJob: number; jobs: number; metered: boolean }): string {
  const usd = quote.usdPerJob * quote.jobs;
  return `${quote.metered ? "≤ " : ""}$${usd.toFixed(usd < 0.001 ? 5 : usd < 0.1 ? 3 : 2)}`;
}
