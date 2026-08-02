import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../api/router";

/**
 * tRPC-Hooks für die gesamte Anwendung.
 *
 * Bewusst eine eigene Datei ohne Komponenten: Läge das zusammen mit
 * `TRPCProvider`, würde Fast Refresh für diese Datei ausfallen
 * (react-refresh/only-export-components).
 */
export const trpc = createTRPCReact<AppRouter>();
