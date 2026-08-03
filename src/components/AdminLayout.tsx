import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { PageHeader } from "@/components/PageHeader";
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
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          title={title}
          description={description}
          actions={isAdmin ? actions : undefined}
        />

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
