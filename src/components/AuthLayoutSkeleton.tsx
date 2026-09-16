import { Skeleton } from "./ui/skeleton";

export function AuthLayoutSkeleton() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Symbolleiste – auf dem Telefon liegt die Leiste als Overlay über der
          Seite und wird deshalb im Ladezustand gar nicht erst angedeutet. */}
      <div className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-sidebar-border bg-sidebar py-4 md:flex">
        <Skeleton className="mb-3 size-7 rounded-full" />
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="size-11 rounded-xl" />
        ))}
        <Skeleton className="mt-auto size-9 rounded-full" />
      </div>

      {/* Inhalt */}
      <div className="min-w-0 flex-1">
        {/* Kopfzeile ab dem Tablet */}
        <div className="hidden h-16 items-center gap-2 border-b border-border/60 px-4 md:flex lg:px-6">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-40 rounded-md" />
          <Skeleton className="h-10 w-72 rounded-md" />
          <Skeleton className="ml-auto h-10 w-28 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
        {/* Kopfzeile für schmale Geräte */}
        <div className="flex h-14 items-center gap-2 border-b px-3 md:hidden">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-12">
            <Skeleton className="col-span-2 h-36 rounded-xl md:col-span-5" />
            <Skeleton className="h-36 rounded-xl md:col-span-4" />
            <Skeleton className="h-36 rounded-xl md:col-span-3" />
          </div>
          <Skeleton className="h-9 w-48 rounded-lg" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
