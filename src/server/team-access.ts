import "server-only";
import { ApiError } from "./errors";

type Member = { email: string | null; isGuest: boolean } | null;

/** Optional private team hosting. An explicitly empty allowlist admits nobody. */
export function teamMode(): boolean {
  return process.env.HACKSFIELD_TEAM_EMAILS !== undefined;
}

function emails(): string[] {
  return (process.env.HACKSFIELD_TEAM_EMAILS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

export function teamEmailAllowed(email: string | null): boolean {
  return Boolean(email && emails().includes(email.trim().toLowerCase()));
}

export function assertTeamUser(user: Member): void {
  if (teamMode() && (!user || user.isGuest || !teamEmailAllowed(user.email))) {
    throw new ApiError(user ? 403 : 401, "unauthorized", "Sign in with an invited team account.");
  }
}

/** The first invited address manages shared provider credentials and the budget. */
export function teamSettingsAllowed(user: Member): boolean {
  return Boolean(teamMode() && user && !user.isGuest && user.email?.toLowerCase() === emails()[0]);
}

/** Loopback maintenance is never inferred from a Cloudflare-forwarded request. */
export function localMaintenanceRequest(headers: Headers): boolean {
  const host = headers.get("host") ?? "";
  const forwarded = headers.get("x-forwarded-host");
  return /^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host) &&
    !headers.has("cf-ray") && (!forwarded || forwarded === host);
}
