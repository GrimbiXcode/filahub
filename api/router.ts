import { accountRouter } from "./accountRouter";
import { adminRouter } from "./adminRouter";
import { authRouter } from "./auth-router";
import { friendRouter } from "./friendRouter";
import { legalRouter } from "./legalRouter";
import { createRouter, publicQuery } from "./middleware";
import { materialRouter } from "./materialRouter";
import { presetRouter } from "./presetRouter";
import { spoolTypeRouter } from "./spoolTypeRouter";
import { storageBoxRouter } from "./storageBoxRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  account: accountRouter,
  spoolType: spoolTypeRouter,
  storageBox: storageBoxRouter,
  material: materialRouter,
  friend: friendRouter,
  preset: presetRouter,
  admin: adminRouter,
  legal: legalRouter,
});

export type AppRouter = typeof appRouter;
