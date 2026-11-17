import { publicUser } from "@/server/auth";
import { changeEmail } from "@/server/account/profile";
import { rateLimit, readJson, route } from "@/server/http";
import { teamMode } from "@/server/team-access";
import { ApiError } from "@/server/errors";

/** POST /api/account/email  { email, password } */
export const POST = route(async ({ req, user }) => {
  if (teamMode()) throw new ApiError(403, "forbidden", "Team account addresses are managed by the studio owner.");
  rateLimit(`account-email:${user.id}`, 10, 3_600_000);
  const body = await readJson(req);
  return { user: publicUser(changeEmail(user, { email: body.email, password: body.password })) };
});
