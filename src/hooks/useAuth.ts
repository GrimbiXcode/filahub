import { trpc } from "@/lib/trpc";
import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { LOGIN_PATH } from "@/const";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = LOGIN_PATH } =
    options ?? {};

  const navigate = useNavigate();

  const utils = trpc.useUtils();

  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = trpc.auth.me.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      // Erst zum Login navigieren, dann den Cache im Hintergrund
      // aktualisieren. Umgekehrt würde die Navigation auf Refetches der
      // geschützten Queries warten, die nach dem Logout mit 401
      // fehlschlagen und inkl. Retry-Backoffs mehrere Sekunden blockieren.
      navigate(redirectPath);
      void utils.invalidate();
    },
  });

  const logout = useCallback(() => logoutMutation.mutate(), [logoutMutation]);

  // Nach einem 401 (z. B. durch Logout oder abgelaufene Session) behält
  // TanStack Query die alten Daten – dann als abgemeldet behandeln.
  const isUnauthenticated = error?.data?.code === "UNAUTHORIZED";

  useEffect(() => {
    if (redirectOnUnauthenticated && !isLoading && (!user || isUnauthenticated)) {
      const currentPath = window.location.pathname;
      if (currentPath !== redirectPath) {
        navigate(redirectPath);
      }
    }
  }, [redirectOnUnauthenticated, isLoading, user, isUnauthenticated, navigate, redirectPath]);

  return useMemo(
    () => ({
      user: isUnauthenticated ? null : (user ?? null),
      isAuthenticated: !!user && !isUnauthenticated,
      isAdmin: !isUnauthenticated && user?.role === "admin",
      isLoading: isLoading || logoutMutation.isPending,
      error,
      logout,
      refresh: refetch,
    }),
    [user, isUnauthenticated, isLoading, logoutMutation.isPending, error, logout, refetch],
  );
}
