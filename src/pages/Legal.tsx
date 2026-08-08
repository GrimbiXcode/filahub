import { Link } from "react-router";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Wordmark } from "@/components/Logo";
import { MarkdownContent } from "@/components/MarkdownContent";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LEGAL_DOCUMENTS, LEGAL_PATHS, type LegalDocument } from "@/const";
import { useI18n, useT } from "@/lib/i18nContext";
import { fillOperator, legalText } from "@/lib/legal";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/**
 * Rechtstexte: Datenschutzerklärung, Impressum, Nutzungsbedingungen.
 *
 * Bewusst ohne `AuthLayout` – das zeigt ohne Anmeldung eine Schranke, und
 * genau davor müssen diese Seiten erreichbar sein. Der Aufbau lehnt sich
 * deshalb an `Login.tsx` an: eigenständige Seite mit Farbschema-Umschalter.
 */
export default function Legal({ document }: { document: LegalDocument }) {
  const { language } = useI18n();
  const t = useT();
  const { data: operator } = trpc.legal.operator.useQuery(undefined, {
    staleTime: Infinity,
  });
  const text = legalText(document, language);
  const body =
    text && operator ? fillOperator(text.body, operator) : text?.body;

  return (
    <div className="flex min-h-screen justify-center p-4 sm:p-6">
      <div className="fixed right-3 top-3">
        <ThemeToggle />
      </div>

      <div className="flex w-full max-w-3xl flex-col gap-4">
        <Link
          to="/"
          className="flex items-center gap-2 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t.legal.backToApp}
        </Link>

        <Card>
          <CardContent className="pt-6">
            <Wordmark className="text-base [&_svg]:h-5 [&_svg]:w-5" />
            <Separator className="my-4" />

            {/*
              Ohne konfigurierten Betreiber blieben die Platzhalter im Text
              stehen. Der Hinweis richtet sich an den Betreiber der Instanz und
              sagt zugleich dem Leser ehrlich, dass hier eine Pflichtangabe
              fehlt – besser als ein Impressum mit Lücken.
            */}
            {operator && !operator.configured && (
              <div className="mb-4 flex gap-3 rounded-md border border-dashed border-destructive/50 p-3 text-sm text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span>{t.legal.operatorMissing}</span>
              </div>
            )}

            {text && body !== undefined ? (
              <MarkdownContent lang={text.language}>{body}</MarkdownContent>
            ) : (
              <p className="text-sm text-muted-foreground">{t.legal.missing}</p>
            )}
          </CardContent>
        </Card>

        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2 pb-4 text-sm">
          {LEGAL_DOCUMENTS.map(entry => (
            <Link
              key={entry}
              to={LEGAL_PATHS[entry]}
              className={cn(
                "underline-offset-4 hover:underline",
                entry === document
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              )}
              aria-current={entry === document ? "page" : undefined}
            >
              {t.legal[entry]}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
