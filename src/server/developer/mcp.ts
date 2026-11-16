import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { ApiError } from "../errors";
import { sameOrigin } from "../origin";
import { isPersonalMode, providerSettings } from "../provider-settings";
import { errorResponse, logRequest, missingScope, openKey, rateHeaders, rateLimited, type RateState } from "./api";
import { downloadFile } from "./downloads";
import type { KeyAuth, Scope } from "./keys";
import { balanceOut, createGeneration, findModel, getGeneration, listFiles, listGenerations, listModels, modelDetail, quoteDraft } from "./service";

/**
 * The Model Context Protocol over Streamable HTTP, JSON-RPC 2.0, written by hand.
 *
 * Dual-era, as the 2026-07-28 revision allows:
 *  - modern clients send protocol version, method and tool name in `_meta` and in the
 *    `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers, with no handshake;
 *  - legacy clients (2025-03-26 to 2025-11-25) call `initialize` first.
 * The server is stateless either way: no sessions, no GET stream, one JSON answer per POST.
 */

export const MODERN_VERSIONS = ["2026-07-28"];
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const SUPPORTED = [...MODERN_VERSIONS, ...LEGACY_VERSIONS];
const SERVER_INFO = { name: "hacksfield", title: "Hacksfield", version: "0.1.0" };
const INSTRUCTIONS =
  "Hacksfield makes images, video and audio. Call list_models to find a model, get_model to see its controls and media slots, " +
  "quote to check the price, then generate. Generations run in the background: poll get_generation until the status is " +
  "succeeded or failed. Call get_download for each finished file to return an HTTPS download link; local file URLs cannot be opened by ChatGPT. " +
  "Downloads copy the selected file into private BytePlus storage for an hour-long link; storage/transfer charges are separate. " +
  "Prices are in millicredits (1000 = 1 credit).";
const instructions = () => isPersonalMode()
  ? INSTRUCTIONS + ` This personal installation has no Hacksfield membership or credit charges: credit labels are legacy. BytePlus and Decart media share the enforced US$${providerSettings().dailyBudgetUsd} rolling 24-hour budget. BytePlus defaults are byteplus-seedream-5.5 and byteplus-seedance-2.5. Decart editing models are decart-lucy-2.6, decart-lucy-vton-3.6, decart-lucy-restyle-2 and decart-lucy-image-2; they require uploaded source files. Use the provider the user requests.`
  : INSTRUCTIONS;

type Json = Record<string, unknown>;
type Id = string | number | null;

const rpcError = (id: Id, code: number, message: string, data?: unknown) => ({ jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } });

/* ---------------------------------- tools ---------------------------------- */

const s = (description: string): Json => ({ type: "string", description });
const draftSchema: Json = {
  type: "object",
  properties: {
    modelId: s("A model id from list_models."),
    prompt: s("What to make."),
    values: { type: "object", description: "Control values by control id, from get_model. Missing values use the defaults.", additionalProperties: true },
    inputs: { type: "object", description: "Media slots: { slotId: [fileId] }. File ids come from list_files.", additionalProperties: { type: "array", items: { type: "string" } } },
    count: { type: "integer", minimum: 1, description: "How many results." },
  },
  required: ["modelId"],
};
const page: Json = {
  limit: { type: "integer", minimum: 1, maximum: 50, description: "How many, newest first. Default 20." },
  before: { type: "integer", description: "The cursor of the last item already seen." },
};

interface Tool {
  name: string;
  title: string;
  description: string;
  scope: Scope;
  inputSchema: Json;
  outputSchema?: Json;
  readOnly: boolean;
  openWorld?: boolean;
  run(auth: KeyAuth, args: Json): { out: Json; credits?: number } | Promise<{ out: Json; credits?: number }>;
}

const num = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const optStr = (v: unknown) => (typeof v === "string" && v ? v : null);

const TOOLS: Tool[] = [
  {
    name: "list_models",
    title: "List models",
    description: "Lists the models Hacksfield can run. Filter by kind: image, video, audio or music.",
    scope: "read",
    readOnly: true,
    inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["image", "video", "audio", "music"] } } },
    run: (_a, args) => ({ out: { models: listModels({ kind: optStr(args.kind), available: true }) } }),
  },
  {
    name: "get_model",
    title: "Get model",
    description: "One model with its controls (and their allowed values) and media slots.",
    scope: "read",
    readOnly: true,
    inputSchema: { type: "object", properties: { modelId: s("The model id.") }, required: ["modelId"] },
    run: (_a, args) => ({ out: { model: modelDetail(findModel(args.modelId)) } }),
  },
  {
    name: "quote",
    title: "Price a generation",
    description: "Prices a generation without running it, and says whether the balance covers it.",
    scope: "read",
    readOnly: true,
    inputSchema: draftSchema,
    run: (a, args) => ({ out: quoteDraft(a.user, args) }),
  },
  {
    name: "generate",
    title: "Generate",
    description: "Starts a generation and spends credits. Returns at once with status queued; poll get_generation for the result.",
    scope: "generate",
    readOnly: false,
    inputSchema: draftSchema,
    run: (a, args) => {
      const r = createGeneration(a.user, a.key.id, args, { surface: "mcp" });
      return { out: { generations: r.generations }, credits: r.held };
    },
  },
  {
    name: "get_generation",
    title: "Get generation",
    description: "One generation: its status and, when it succeeded, links to its files.",
    scope: "read",
    readOnly: true,
    inputSchema: { type: "object", properties: { id: s("The generation id.") }, required: ["id"] },
    run: (a, args) => ({ out: { generation: getGeneration(a.user.id, String(args.id ?? "")) } }),
  },
  {
    name: "list_generations",
    title: "List generations",
    description: "Recent generations, newest first.",
    scope: "read",
    readOnly: true,
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ["active", "all"] }, kind: { type: "string", enum: ["image", "video", "audio", "music"] }, ...page } },
    run: (a, args) => ({
      out: { generations: listGenerations(a.user.id, { status: optStr(args.status), kind: optStr(args.kind), limit: num(args.limit, 20, 1, 50), before: num(args.before, 0, 0, Number.MAX_SAFE_INTEGER) || undefined }) },
    }),
  },
  {
    name: "list_files",
    title: "List files",
    description: "Uploaded and generated files, newest first. Use a file id in a generation's inputs.",
    scope: "read",
    readOnly: true,
    inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["image", "video", "audio"] }, source: { type: "string", enum: ["generated", "upload"] }, ...page } },
    run: (a, args) => ({
      out: { files: listFiles(a.user.id, { kind: optStr(args.kind), source: optStr(args.source), limit: num(args.limit, 20, 1, 50), before: num(args.before, 0, 0, Number.MAX_SAFE_INTEGER) || undefined }) },
    }),
  },
  {
    name: "get_download",
    title: "Prepare a private download",
    description: "Use after a generation succeeds to return its image, video or audio file in chat. Copies one owned file to private BytePlus storage and returns an HTTPS link valid for one hour. Storage/transfer charges apply outside the media budget. Does not generate anything or publish the library.",
    scope: "generate",
    readOnly: false,
    openWorld: true,
    inputSchema: { type: "object", properties: { id: s("An owned file id from get_generation or list_files.") }, required: ["id"] },
    outputSchema: {
      type: "object", required: ["file"], properties: { file: {
        type: "object", required: ["id", "kind", "mime", "bytes", "name", "url", "expiresAt"],
        properties: { id: s("Owned file id."), kind: s("Media kind."), mime: s("MIME type."), bytes: { type: "integer" }, name: s("Download filename."), url: s("Temporary HTTPS download URL."), expiresAt: s("Expiry in ISO 8601 UTC.") },
      } },
    },
    run: async (a, args) => ({ out: { ...await downloadFile(a.user.id, String(args.id ?? "")) } }),
  },
  {
    name: "get_balance",
    title: "Get balance",
    description: "The credit balance (in millicredits and formatted) and the plan.",
    scope: "read",
    readOnly: true,
    inputSchema: { type: "object", properties: {} },
    run: (a) => ({ out: { ...balanceOut(a.user), ...(isPersonalMode() ? { personalMode: true, mediaBudgetUsd: providerSettings().dailyBudgetUsd, note: "No Hacksfield membership or credit charge; BytePlus and Decart media share this budget. BytePlus storage charges are separate." } : {}) } }),
  },
];

export const toolList = () =>
  TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
    annotations: { readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: !!t.openWorld },
  }));

/* -------------------------------- transport -------------------------------- */

/** Decodes the `=?base64?...?=` header form. */
function headerValue(v: string | null): string | null {
  if (v == null) return null;
  const m = /^=\?base64\?(.*)\?=$/.exec(v);
  return m ? Buffer.from(m[1], "base64").toString("utf8") : v;
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function handleMcp(req: NextRequest, authorization: string | null): Promise<Response> {
  if (!sameOrigin(req)) return json(rpcError(null, -32000, "Cross-site request refused."), 403);

  let auth: KeyAuth;
  let rate: RateState;
  try {
    ({ auth, rate } = openKey(authorization));
  } catch (err) {
    const res = errorResponse(err);
    res.headers.set("WWW-Authenticate", 'Bearer realm="hacksfield"');
    return res;
  }
  if (!rate.allowed) {
    const res = errorResponse(rateLimited());
    rateHeaders(res, rate);
    return res;
  }

  let label = "/mcp";
  let credits = 0;
  const res = await (async (): Promise<Response> => {
    let msg: unknown;
    try {
      msg = JSON.parse(await req.text());
    } catch {
      return json(rpcError(null, -32700, "Parse error"), 400);
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return json(rpcError(null, -32600, "Send one JSON-RPC message per request."), 400);
    const m = msg as Json;
    if (m.jsonrpc !== "2.0") return json(rpcError(null, -32600, "Invalid Request"), 400);
    const hasId = "id" in m && (typeof m.id === "string" || typeof m.id === "number");
    if (typeof m.method !== "string") return hasId || "result" in m || "error" in m ? new Response(null, { status: 202 }) : json(rpcError(null, -32600, "Invalid Request"), 400);
    if (!hasId) return new Response(null, { status: 202 }); // a notification: nothing to answer
    const id = m.id as Id;
    const method = m.method;
    const params = (m.params && typeof m.params === "object" && !Array.isArray(m.params) ? m.params : {}) as Json;
    label = `/mcp ${method}`;

    if (method === "initialize") {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const version = LEGACY_VERSIONS.includes(asked) ? asked : LEGACY_VERSIONS[0];
      return json({ jsonrpc: "2.0", id, result: { protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: instructions() } });
    }

    // Which era is this request from?
    const meta = (params._meta && typeof params._meta === "object" ? params._meta : {}) as Json;
    const metaVersion = typeof meta["io.modelcontextprotocol/protocolVersion"] === "string" ? (meta["io.modelcontextprotocol/protocolVersion"] as string) : null;
    const headerVersion = req.headers.get("mcp-protocol-version");
    const modern = metaVersion !== null;
    if (modern) {
      if (!SUPPORTED.includes(metaVersion) || !MODERN_VERSIONS.includes(metaVersion)) {
        return json(rpcError(id, -32022, "Unsupported protocol version", { supported: SUPPORTED, requested: metaVersion }), 400);
      }
      if (headerVersion !== metaVersion) return json(rpcError(id, -32020, "Header mismatch: MCP-Protocol-Version must match the request's protocol version."), 400);
      if (req.headers.get("mcp-method") !== method) return json(rpcError(id, -32020, "Header mismatch: Mcp-Method must match the request's method."), 400);
      if (method === "tools/call" && headerValue(req.headers.get("mcp-name")) !== params.name) {
        return json(rpcError(id, -32020, "Header mismatch: Mcp-Name must match the tool name."), 400);
      }
    } else if (headerVersion && !LEGACY_VERSIONS.includes(headerVersion)) {
      return json(rpcError(id, -32022, "Unsupported protocol version", { supported: SUPPORTED, requested: headerVersion }), 400);
    }
    const ok = (result: Json) => json({ jsonrpc: "2.0", id, result: modern ? { resultType: "complete", ...result } : result });

    switch (method) {
      case "ping":
        return ok({});
      case "server/discover":
        return ok({
          supportedVersions: SUPPORTED,
          capabilities: { tools: { listChanged: false } },
          _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
          instructions: instructions(),
        });
      case "tools/list":
        return ok({ tools: toolList() });
      case "tools/call": {
        const tool = TOOLS.find((t) => t.name === params.name);
        if (!tool) return json(rpcError(id, -32602, `Unknown tool: ${String(params.name).slice(0, 80)}`));
        label = `/mcp tools/call ${tool.name}`;
        const args = (params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments : {}) as Json;
        try {
          if (!auth.key.scopes.includes(tool.scope)) throw missingScope(tool.scope);
          const r = await tool.run(auth, args);
          credits = r.credits ?? 0;
          return ok({ content: [{ type: "text", text: JSON.stringify(r.out) }], structuredContent: r.out, isError: false });
        } catch (err) {
          if (!(err instanceof ApiError)) {
            console.error("[mcp] tool failed:", err instanceof Error ? (err.stack ?? err.message) : err);
          }
          // Tool failures go back to the model as a result it can read and act on.
          const e = err instanceof ApiError ? { code: err.code, message: err.message } : { code: "server_error", message: "Something went wrong on our side." };
          return ok({ content: [{ type: "text", text: e.message }], structuredContent: { error: e }, isError: true });
        }
      }
      default:
        return json(rpcError(id, -32601, "Method not found"), modern ? 404 : 200);
    }
  })();
  rateHeaders(res, rate);
  logRequest(auth, "POST", label.slice(0, 120), res.status, credits);
  return res;
}
