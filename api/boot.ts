import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { startTelegramBot } from "./telegram/bot";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
// Health-Endpunkt für Docker-Healthchecks und Reverse Proxies
app.get("/health", (c) => c.json({ status: "ok" }));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  const { migrateDb } = await import("./queries/connection");
  serveStaticFiles(app);

  // Schema-Migrationen anwenden, bevor Bot und Server auf die DB zugreifen
  await migrateDb();
  console.log("Datenbank-Migrationen angewendet.");

  const port = parseInt(process.env.PORT || "3000");
  startTelegramBot();
  // Auf allen Interfaces lauschen, damit der Container von außen
  // (Reverse Proxy, Docker-Netzwerk) erreichbar ist
  serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
}
