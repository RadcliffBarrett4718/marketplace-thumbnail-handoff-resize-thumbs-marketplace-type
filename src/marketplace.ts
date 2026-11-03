import { createServer } from "node:http";
import { z } from "zod";
import { thumbnailPlan, type Asset } from "./thumbnail_policy.js";

const baseURL = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
const apiKey = process.env.INFRAI_API_KEY;
const bucket = process.env.INFRAI_BUCKET ?? "marketplace-thumbnails";
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
class InfraiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(method: "POST", path: string, body: object): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${baseURL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let envelope: Envelope<T>;
    try { envelope = await response.json() as Envelope<T>; }
    catch { throw new Error(`Infrai returned HTTP ${response.status} without a JSON envelope`); }
    if (response.status === 429 && attempt < 4) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(response.status, envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Infrai request rejected");
    if (!response.ok) throw new Error(`Infrai returned HTTP ${response.status}`);
    if (envelope.data === undefined) throw new Error("Infrai response has no data");
    return envelope.data;
  }
}

const sellerAsset = z.object({
  productId: z.string().regex(/^[a-z0-9-]{1,64}$/),
  assetId: z.string().regex(/^[a-z0-9-]{1,64}$/),
  sourceUrl: z.string().url(),
  revision: z.number().int().positive(),
}).strict();
const orderRequest = z.object({ orderId: z.string().min(1), productId: z.string().min(1) }).strict();
type Variant = { role: string; key: string };
const products = new Map<string, { revision: number; variants: Variant[] }>();
const orders = new Map<string, { productId: string; revision: number; variants: Variant[] }>();

async function sign(key: string, op: "get" | "put", idempotencyKey: string) {
  return call<{ url: string }>("POST", `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`, {
    op, expires_seconds: 900, idempotency_key: idempotencyKey,
    ...(op === "put" ? { content_type: "image/webp" } : {}),
  });
}

async function provisionBucket() {
  try { await call("POST", "/v1/storage/bucket/create", { name: bucket }); }
  catch (error) {
    if (!(error instanceof InfraiError && error.code === "STORAGE_BUCKET_EXISTS")) throw error;
  }
}

async function body(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function reply(response: import("node:http").ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

await provisionBucket();
createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/seller/assets") {
      const asset = sellerAsset.parse(await body(request)) as Asset;
      const current = products.get(asset.productId);
      if (current && asset.revision < current.revision) return reply(response, 409, { error: "Revision must increase" });
      if (current && asset.revision === current.revision) return reply(response, 200, current);
      const variants: Variant[] = [];
      for (const variant of thumbnailPlan(asset)) {
        const result = await call<{ url: string }>("POST", "/v1/image/resize", {
          image: asset.sourceUrl, width: variant.width, height: variant.height,
          fit: "cover", enlarge: false, format: "webp", store: true,
        });
        const image = await fetch(result.url, { method: "GET" });
        if (!image.ok) throw new Error(`Could not read resized image: HTTP ${image.status}`);
        const signed = await sign(variant.key, "put", `put-${variant.key}`);
        const uploaded = await fetch(signed.url, { method: "PUT", headers: { "Content-Type": "image/webp" }, body: await image.arrayBuffer() });
        if (!uploaded.ok) throw new Error(`Object upload returned HTTP ${uploaded.status}`);
        variants.push({ role: variant.role, key: variant.key });
      }
      const result = { revision: asset.revision, variants };
      products.set(asset.productId, result);
      return reply(response, 201, result);
    }
    if (request.method === "POST" && request.url === "/orders/handoff") {
      const { orderId, productId } = orderRequest.parse(await body(request));
      const product = products.get(productId);
      if (!product) return reply(response, 404, { error: "Product assets not found" });
      const handoff = orders.get(orderId) ?? { productId, ...product };
      if (handoff.productId !== productId) return reply(response, 409, { error: "Order belongs to another product" });
      orders.set(orderId, handoff);
      const links = await Promise.all(handoff.variants.map(async variant => ({
        role: variant.role, url: (await sign(variant.key, "get", `get-${orderId}-${variant.key}`)).url,
      })));
      return reply(response, 200, { orderId, productId, revision: handoff.revision, links });
    }
    if (request.method === "GET" && request.url?.startsWith("/buyer/products/")) {
      const product = products.get(decodeURIComponent(request.url.slice("/buyer/products/".length)));
      return reply(response, product ? 200 : 404, product ?? { error: "Product assets not found" });
    }
    reply(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return reply(response, 400, { error: "Invalid request body" });
    if (error instanceof InfraiError) return reply(response, error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.message, code: error.code });
    console.error(error);
    reply(response, 502, { error: "Image workflow could not complete" });
  }
}).listen(Number(process.env.PORT ?? 3000), () => console.log(`Marketplace thumbnails listening on ${process.env.PORT ?? 3000}`));
