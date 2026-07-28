import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { materialRouter } from "./materialRouter";
import { spoolTypeRouter } from "./spoolTypeRouter";
import { storageBoxRouter } from "./storageBoxRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  spoolType: spoolTypeRouter,
  storageBox: storageBoxRouter,
  material: materialRouter,
});

export type AppRouter = typeof appRouter;
