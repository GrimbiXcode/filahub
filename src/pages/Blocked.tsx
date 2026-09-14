import { useState } from "react";
import { Ban, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import {
  UNBLOCK_REQUEST_MAX_LENGTH,
  type BlockReason,
} from "@contracts/limits";
import { AccountDataActions } from "@/components/AccountDataActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";

/**
 * Was ein gesperrter Benutzer statt der App sieht.
 *
 * Bewusst **ohne** `AuthLayout` und ohne eigene Route: Eingehängt ist die Seite
 * in `AuthLayout` selbst, an der einen Stelle, die über App-Oberfläche und
 * Anmeldeschranke entscheidet. Eine Route wäre ein zweiter Weg, und ein
 * zweiter Weg ist hier ein Loch – jede geschützte Seite rendert `AuthLayout`,
 * keine kommt daran vorbei. Aus demselben Grund verzichtet sie auf die
 * Seitenleiste: Von hier aus gibt es nichts zu navigieren.
 *
 * Der Ton ist nüchtern und ohne Vorwurf. Was der Benutzer noch **kann**, steht
 * vor dem, was er nicht kann: Auskunft und Löschung überleben die Sperre
 * (Art. 15 und 17 DSGVO, siehe `blockedQuery` in `api/middleware.ts`), und wer
 * das nicht erfährt, dem nützt das Recht wenig.
 */
export default function Blocked() {
  const t = useT();
  const { formatDateTime } = useFormat();
  const { logout } = useAuth();
  const utils = trpc.useUtils();
  const [message, setMessage] = useState("");

  const { data } = trpc.unblock.status.useQuery();

  const request = trpc.unblock.request.useMutation({
    onSuccess: () => {
      toast.success(t.blocked.requestSent);
      setMessage("");
      void utils.unblock.status.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const pending = data?.request?.status === "pending";
  const reason = data?.blockedReason as BlockReason | null | undefined;

  return (
    <div className="flex min-h-screen items-start justify-center p-4 sm:items-center sm:p-6">
      <div className="flex w-full max-w-xl flex-col gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <Ban className="mt-0.5 h-6 w-6 shrink-0 text-destructive" />
              <div className="flex flex-col gap-1">
                <CardTitle>{t.blocked.title}</CardTitle>
                <CardDescription>{t.blocked.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data?.blockedAt ? (
              <p className="text-sm text-muted-foreground">
                {t.blocked.since({ date: formatDateTime(data.blockedAt) })}
              </p>
            ) : null}
            {reason ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  {t.blocked.reasonLabel}
                </span>
                <Badge variant="secondary">{t.blocked.reasons[reason]}</Badge>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/*
          Die Betroffenenrechte stehen **vor** dem Antrag, nicht als Fußnote
          darunter: Sie gelten unabhängig davon, wie der Antrag ausgeht.

          Und sie stehen hier als Knöpfe und nicht als Verweis auf die
          Einstellungen: Die sind für ein gesperrtes Konto selbst verschlossen,
          ein „steht dort drüben“ ginge also ins Leere. Dieselben Knöpfe wie in
          `src/pages/Settings.tsx`, aus derselben Komponente – zwei Abschriften
          wären die nächste Stelle, an der ein Betroffenenrecht ausfällt.
        */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.blocked.rightsTitle}</CardTitle>
            <CardDescription>{t.blocked.rightsHint}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <AccountDataActions />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base">
                  {t.blocked.requestTitle}
                </CardTitle>
                <CardDescription>{t.blocked.requestHint}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data?.request ? (
              <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      data.request.status === "approved"
                        ? "default"
                        : data.request.status === "rejected"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {data.request.status === "approved"
                      ? t.blocked.requestApproved
                      : data.request.status === "rejected"
                        ? t.blocked.requestRejected
                        : t.blocked.requestPending}
                  </Badge>
                  <span className="text-muted-foreground">
                    {t.blocked.requestedAt({
                      date: formatDateTime(data.request.createdAt),
                    })}
                  </span>
                </div>
                {data.request.reviewNote ? (
                  <p>
                    <span className="text-muted-foreground">
                      {t.blocked.noteLabel}:{" "}
                    </span>
                    {data.request.reviewNote}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/*
              Solange ein Antrag offen ist, gibt es kein Formular: Die Datenbank
              lässt ohnehin nur einen zu (`unblock_requests_open_unique`), und
              ein Knopf, der verlässlich in eine Fehlermeldung läuft, ist keine
              Einladung, sondern eine Falle.
            */}
            {pending ? null : (
              <>
                <Textarea
                  value={message}
                  onChange={event => setMessage(event.target.value)}
                  placeholder={t.blocked.requestPlaceholder}
                  maxLength={UNBLOCK_REQUEST_MAX_LENGTH}
                  rows={5}
                />
                <Button
                  className="sm:w-fit"
                  disabled={message.trim() === "" || request.isPending}
                  onClick={() => request.mutate({ message: message.trim() })}
                >
                  {t.blocked.requestSubmit}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Button variant="ghost" onClick={logout} className="self-center">
          {t.blocked.signOut}
        </Button>
      </div>
    </div>
  );
}
