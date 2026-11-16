import { MILLI, TOPUP_PACKS } from "@/config/economy";
import { balance, grant } from "@/server/credits";
import { ApiError, badRequest, rateLimit, readJson, route } from "@/server/http";
import { isPersonalMode } from "@/server/provider-settings";

/**
 * POST /api/wallet/topup  { packId }
 * There is no payment processor yet, so this adds the credits for free and says so.
 * Real provider spend stays capped by TREG_DAILY_BUDGET_USD. Turn it off with
 * PARALLAX_DEMO_BILLING=off.
 */
export const POST = route(async ({ req, user }) => {
  if (isPersonalMode()) throw new ApiError(403, "billing_disabled", "Personal mode uses your provider account directly. Hacksfield credit top-ups are disabled.");
  if (process.env.PARALLAX_DEMO_BILLING === "off") throw new ApiError(403, "forbidden", "Top-ups are not open yet.");
  const { packId } = await readJson(req);
  const pack = TOPUP_PACKS.find((p) => p.id === packId);
  if (!pack) throw badRequest("Pick a credit pack.");
  rateLimit(`topup:${user.id}`, 20, 3_600_000);
  grant(user.id, "topup", pack.credits * MILLI, `${pack.credits} credits (demo top-up)`);
  return { balance: balance(user.id) };
});
