import { accountRouter } from "./accountRouter";
import { adminRouter } from "./adminRouter";
import { appearanceRouter } from "./appearanceRouter";
import { authRouter } from "./auth-router";
import { friendRouter } from "./friendRouter";
import { lagerRouter } from "./lagerRouter";
import { legalRouter } from "./legalRouter";
import { createRouter, publicQuery } from "./middleware";
import { materialRouter } from "./materialRouter";
import { organizationRouter } from "./organizationRouter";
import { presetRouter } from "./presetRouter";
import { containerTypeRouter } from "./containerTypeRouter";
import { storageBoxRouter } from "./storageBoxRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  account: accountRouter,
  lager: lagerRouter,
  containerType: containerTypeRouter,
  storageBox: storageBoxRouter,
  material: materialRouter,
  appearance: appearanceRouter,
  friend: friendRouter,
  organization: organizationRouter,
  preset: presetRouter,
  admin: adminRouter,
  legal: legalRouter,
});

export type AppRouter = typeof appRouter;
