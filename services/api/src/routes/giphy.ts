import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import {
  importGiphyGif,
  isGiphyConfigured,
  listTrendingGiphyGifs,
  searchGiphyGifs,
} from "../services/giphy";

type Env = { Variables: AuthVariables };

export const giphyRouter = new Hono<Env>();

giphyRouter.use("*", requireAuth);

giphyRouter.get("/status", async (c) => {
  return c.json({ enabled: await isGiphyConfigured() });
});

giphyRouter.get("/search", async (c) => {
  if (!(await isGiphyConfigured())) {
    return c.json({ error: "Giphy is not configured" }, 503);
  }

  const query = c.req.query("q") ?? "";
  const offset = Number(c.req.query("offset") ?? "0");

  try {
    const result = await searchGiphyGifs(query, Number.isFinite(offset) ? offset : 0);
    return c.json(result);
  } catch (err) {
    console.error("Giphy search failed:", err);
    return c.json({ error: "Giphy search failed" }, 502);
  }
});

giphyRouter.get("/trending", async (c) => {
  if (!(await isGiphyConfigured())) {
    return c.json({ error: "Giphy is not configured" }, 503);
  }

  const offset = Number(c.req.query("offset") ?? "0");

  try {
    const result = await listTrendingGiphyGifs(Number.isFinite(offset) ? offset : 0);
    return c.json(result);
  } catch (err) {
    console.error("Giphy trending failed:", err);
    return c.json({ error: "Giphy trending failed" }, 502);
  }
});

const ImportSchema = z.object({
  url: z.string().url(),
});

giphyRouter.post("/import", async (c) => {
  if (!(await isGiphyConfigured())) {
    return c.json({ error: "Giphy is not configured" }, 503);
  }

  const body = ImportSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.flatten() }, 400);
  }

  try {
    const result = await importGiphyGif(body.data.url);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "GIF import failed";
    const status = message === "Invalid GIF URL" ? 400 : 502;
    return c.json({ error: message }, status);
  }
});
