import { AccountError, createGuest, endSession, logIn, publicUser, signUp, startSession, type User } from "@/server/auth";
import { balance } from "@/server/credits";
import { badRequest, clientKey, notFound, publicRoute, rateLimit, readJson } from "@/server/http";
import { assertTeamUser, teamMode } from "@/server/team-access";
import { ApiError } from "@/server/errors";

const HOUR = 3_600_000;

/**
 * POST /api/auth/signup  { email, password, name? }   a guest who signs up keeps their work
 * POST /api/auth/login   { email, password }
 * POST /api/auth/guest                                 a throwaway account, so people can try first
 * POST /api/auth/logout
 */
export const POST = publicRoute<{ action: string }>(async ({ req, user, params }) => {
  const who = clientKey(req);
  let next: User | null;
  let body: Record<string, unknown>;
  try {
    switch (params.action) {
      case "signup":
        if (teamMode()) throw new ApiError(403, "forbidden", "This studio is invitation-only.");
        rateLimit(`signup:${who}`, 10, HOUR);
        body = await readJson(req);
        next = signUp({ email: body.email, password: body.password, name: body.name }, user);
        break;
      case "login":
        rateLimit(`login:${who}`, 20, HOUR / 4);
        body = await readJson(req);
        next = logIn({ email: body.email, password: body.password });
        assertTeamUser(next);
        break;
      case "guest":
        if (teamMode()) throw new ApiError(403, "forbidden", "Sign in with an invited team account.");
        if (!user) rateLimit(`guest:${who}`, 10, HOUR);
        next = user ?? createGuest();
        break;
      case "logout":
        await endSession();
        next = null;
        break;
      default:
        throw notFound();
    }
  } catch (err) {
    if (err instanceof AccountError) throw badRequest(err.message);
    throw err;
  }
  if (next && next.id !== user?.id) await startSession(next.id);
  return { user: next ? publicUser(next) : null, balance: next ? balance(next.id) : 0, teamMode: teamMode() };
});
