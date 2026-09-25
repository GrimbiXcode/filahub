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
import { productRouter } from "./productRouter";
import { containerTypeRouter } from "./containerTypeRouter";
import { storageBoxRouter } from "./storageBoxRouter";
import { unblockRouter } from "./unblockRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  account: accountRouter,
  lager: lagerRouter,
  containerType: containerTypeRouter,
  storageBox: storageBoxRouter,
  material: materialRouter,
  /*
    Das Material als Produkt über den Gebinden (seit 4.0.0). `material` führt
    die Gebinde – die Namen sind älter als die Unterscheidung.
  */
  product: productRouter,
  appearance: appearanceRouter,
  friend: friendRouter,
  organization: organizationRouter,
  preset: presetRouter,
  admin: adminRouter,
  legal: legalRouter,
  /* Erreichbar aus einer Sperre heraus – siehe `blockedQuery`. */
  unblock: unblockRouter,
});

export type AppRouter = typeof appRouter;
