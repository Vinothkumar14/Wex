import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DbConfigError,
  DbUnavailableError,
  closeDriver,
  isConfigured,
  verifyConnectivity,
  withSession,
  wrapDbError,
} from "./db.js";
import * as q from "./queries.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(express.json({ limit: "32kb" }));

app.use((_req, res, next) => {
  res.setHeader("X-App", "mise");
  next();
});

function sendError(res: express.Response, err: unknown) {
  try {
    wrapDbError(err);
  } catch (wrapped) {
    err = wrapped;
  }
  if (err instanceof DbConfigError) {
    return res.status(503).json({
      error: err.message,
      code: err.code,
    });
  }
  if (err instanceof DbUnavailableError) {
    return res.status(503).json({
      error: err.message,
      code: err.code,
    });
  }
  console.error(err);
  return res.status(500).json({
    error: err instanceof Error ? err.message : "Unexpected server error",
    code: "INTERNAL",
  });
}

async function db<T>(res: express.Response, work: Parameters<typeof withSession<T>>[0]) {
  try {
    const data = await withSession(work);
    return res.json(data);
  } catch (err) {
    return sendError(res, err);
  }
}

app.get("/api/health", async (_req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      ok: false,
      code: "DB_CONFIG",
      error: "Missing NEO4J_URI or NEO4J_PASSWORD.",
    });
  }
  try {
    await verifyConnectivity();
    const stats = await withSession((s) => q.graphStats(s));
    const nodeCount = stats.nodes.reduce((n, x) => n + x.count, 0);
    return res.json({ ok: true, database: "connected", stats, empty: nodeCount === 0 });
  } catch (err) {
    return sendError(res, err);
  }
});

app.get("/api/allergens", (_req, res) => db(res, (s) => q.listAllergens(s)));
app.get("/api/menu", (_req, res) => db(res, (s) => q.listMenu(s)));
app.get("/api/lots", (_req, res) => db(res, (s) => q.listLots(s)));
app.get("/api/suppliers", (_req, res) => db(res, (s) => q.listSuppliers(s)));
app.get("/api/graph", (_req, res) => db(res, (s) => q.graphPayload(s)));
app.get("/api/hotspots", (_req, res) => db(res, (s) => q.hotspotEquipment(s)));

app.get("/api/dishes/:id", (req, res) =>
  db(res, async (s) => {
    const dish = await q.getDish(s, req.params.id);
    if (!dish) {
      res.status(404);
      return { error: "Dish not found", code: "NOT_FOUND" };
    }
    return dish;
  })
);

app.post("/api/guest-check", (req, res) => {
  const allergenIds = Array.isArray(req.body?.allergenIds)
    ? (req.body.allergenIds as unknown[]).filter((x) => typeof x === "string")
    : [];
  return db(res, (s) => q.guestCheck(s, allergenIds));
});

app.get("/api/path", (req, res) => {
  const dishId = String(req.query.dishId ?? "");
  const allergenId = String(req.query.allergenId ?? "");
  if (!dishId || !allergenId) {
    return res.status(400).json({ error: "dishId and allergenId are required", code: "BAD_REQUEST" });
  }
  return db(res, (s) => q.contaminationPath(s, dishId, allergenId));
});

app.get("/api/recall", (req, res) => {
  const lotId = req.query.lotId ? String(req.query.lotId) : undefined;
  const supplierId = req.query.supplierId ? String(req.query.supplierId) : undefined;
  if (!lotId && !supplierId) {
    return res.status(400).json({ error: "lotId or supplierId is required", code: "BAD_REQUEST" });
  }
  return db(res, (s) => q.recallBlast(s, { lotId, supplierId }));
});

if (process.env.NODE_ENV === "production") {
  const clientDir = path.resolve(__dirname, "../client");
  app.use(express.static(clientDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDir, "index.html"), (err) => {
      if (err) res.status(404).end();
    });
  });
}

const server = app.listen(PORT, () => {
  console.log(`mise api → http://localhost:${PORT}`);
});

async function shutdown() {
  server.close();
  await closeDriver();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
