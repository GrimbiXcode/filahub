import { httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import superjson from "superjson";
import type { ReactNode } from "react";
import { LANGUAGE_HEADER } from "@contracts/constants";
import { getCurrentLanguage } from "@/lib/currentLanguage";
import { trpc } from "@/lib/trpc";

const queryClient = new QueryClient();
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      // Nur nötig, solange die Spracheinstellung auf „automatisch“ steht –
      // dann kennt der Server die Browsersprache nicht (siehe api/context.ts).
      headers: () => ({ [LANGUAGE_HEADER]: getCurrentLanguage() }),
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

export function TRPCProvider({ children }: { children: ReactNode }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
