import { Skeleton } from "./ui/skeleton";

export function AuthLayoutSkeleton() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Seitenleiste – auf dem Telefon liegt sie als Overlay über der Seite
          und wird deshalb im Ladezustand gar nicht erst angedeutet. */}
      <div className="hidden w-[280px] shrink-0 flex-col gap-6 border-r border-border p-4 md:flex">
        <div className="flex items-center gap-3 px-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-4 w-32" />
        </div>

        <div className="space-y-2 px-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>

        <div className="mt-auto flex items-center gap-3 px-1">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-2 w-28" />
          </div>
        </div>
      </div>

      {/* Inhalt */}
      <div className="min-w-0 flex-1">
        {/* Kopfzeile für schmale Geräte */}
        <div className="flex h-14 items-center gap-2 border-b px-3 md:hidden">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          <Skeleton className="h-9 w-48 rounded-lg" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
