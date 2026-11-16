import { readJson, route } from "@/server/http";
import { addMcp, listMcp } from "@/server/super/connectors";
import { text } from "@/server/super/util";

/** GET /api/super/connectors/mcp */
export const GET = route(({ user }) => ({ servers: listMcp(user.id) }));

/** POST /api/super/connectors/mcp  { name, url }  Stored only; Hacksfield does not call it yet. */
export const POST = route(async ({ req, user }) => {
  const body = await readJson(req);
  return { server: addMcp(user.id, text(body.name, "Name", 60, { required: true }), text(body.url, "Address", 500, { required: true })) };
});
