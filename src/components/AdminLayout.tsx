import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { useAuth } from "@/hooks/useAuth";

/**
 * Rahmen für Verwaltungsseiten. Der Hinweis hier ist reine Bequemlichkeit –
 * abgesichert wird serverseitig über `adminQuery`.
 */
export function AdminLayout({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { isAdmin, isLoading } = useAuth();

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {isAdmin && actions}
        </div>

        {!isLoading && !isAdmin ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground/50" />
            <p className="font-medium">Kein Zugriff</p>
            <p className="text-sm text-muted-foreground">
              Dieser Bereich ist Administratorinnen und Administratoren
              vorbehalten.
            </p>
          </div>
        ) : (
          children
        )}
      </div>
    </AuthLayout>
  );
}
