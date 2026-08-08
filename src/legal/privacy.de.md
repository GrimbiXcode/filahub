# Datenschutzerklärung

Diese Erklärung gilt für **diese Instanz** von filahub. filahub ist freie
Software, die jeder selbst betreiben kann; jede Installation hat einen eigenen
Verantwortlichen – siehe [Impressum](/impressum).

## 1. Verantwortlicher

{{operator.postalAddress}}

E-Mail: {{operator.email}}

Für Auskunft, Berichtigung und Löschung genügt eine Nachricht an diese Adresse.
Auskunft und Löschung kannst du aber auch direkt in den Einstellungen selbst
auslösen – das geht schneller.

## 2. Welche Daten verarbeitet werden

| Daten                                                                                                                | Zweck                                 | Rechtsgrundlage                               | Aufbewahrung                                |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| Telegram-ID, Anzeigename, Telegram-Benutzername                                                                      | Konto und Anmeldung                   | Art. 6 Abs. 1 lit. b DSGVO (Vertrag)          | bis zur Löschung des Kontos                 |
| Zeitpunkt der letzten Anmeldung                                                                                      | Betrieb, Erkennung ungenutzter Konten | Art. 6 Abs. 1 lit. f (berechtigtes Interesse) | bis zur Löschung des Kontos                 |
| Bestand: Rollen, Wägungen, Rollentypen, Lagerboxen – samt Preisen, Kaufdaten, Kurz-Kennungen, Lagerorten und Notizen | Kernfunktion der Anwendung            | Art. 6 Abs. 1 lit. b                          | bis zur Löschung des Kontos                 |
| Einstellungen: Sprache, Währung, Zahlenformat, zuletzt gesehene Neuerungen                                           | Darstellung                           | Art. 6 Abs. 1 lit. b                          | bis zur Löschung des Kontos                 |
| Anmeldecodes: Telegram-ID, Telegram-Name, Code                                                                       | Anmeldung ohne Widget                 | Art. 6 Abs. 1 lit. b                          | **automatisch nach 24 Stunden gelöscht**    |
| Preset-Vorschläge: Inhalt, Begründung, Einreicher, Moderationsvermerk                                                | Pflege des gemeinsamen Katalogs       | Art. 6 Abs. 1 lit. b und lit. f               | siehe Abschnitt 8                           |
| Server-Protokolle beim Hoster, u. a. IP-Adresse                                                                      | Betrieb und Abwehr von Angriffen      | Art. 6 Abs. 1 lit. f                          | nach Vorgabe des Hosters, siehe Abschnitt 4 |

Freitextfelder wie Notizen oder Lagerort füllst du selbst. Was du dort
hineinschreibst, wird mitgespeichert – auch wenn es mit Filament nichts zu tun
hat.

Für Nutzerinnen und Nutzer in der Schweiz gelten dieselben Verarbeitungen; an
die Stelle der genannten Artikel treten die entsprechenden Bestimmungen des
revidierten Datenschutzgesetzes (revDSG).

## 3. Anmeldung über Telegram

Eine Anmeldung ist nur mit einem Telegram-Konto möglich. Es gibt zwei Wege.

**Anmeldebutton von Telegram.** Der Button wird von `telegram.org` nachgeladen.
Schon dieser Abruf teilt Telegram deine IP-Adresse und Angaben zu deinem Gerät
mit – unabhängig davon, ob du dich anschließend anmeldest. Deshalb wird das
Skript **erst nach einem ausdrücklichen Klick** geladen. Rechtsgrundlage ist
deine Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO.

**Sechsstelliger Code vom Bot.** Dieser Weg kommt ohne jedes Telegram-Skript im
Browser aus. Der Server fordert den Code über die Telegram-Bot-Schnittstelle an
und schickt ihn dir als Nachricht. Telegram erfährt dabei den Inhalt dieser
Nachricht und deine Telegram-ID – beides kennt Telegram als dein Messenger
ohnehin.

**Übermittlung außerhalb der EU und der Schweiz.** Telegram wird von der
Telegram FZ-LLC mit Sitz in den Vereinigten Arabischen Emiraten betrieben. Für
dieses Land besteht **kein Angemessenheitsbeschluss** der Europäischen
Kommission und keine Feststellung eines angemessenen Schutzes nach Anhang 1 der
Schweizer Datenschutzverordnung. Die Übermittlung stützt sich deshalb auf deine
ausdrückliche Einwilligung nach Art. 49 Abs. 1 lit. a DSGVO bzw. Art. 17 Abs. 1
lit. a revDSG. Ein Schutzniveau wie im europäischen Recht kann nicht
gewährleistet werden; insbesondere bestehen dort weitergehende Zugriffsrechte
staatlicher Stellen und keine vergleichbaren Rechtsbehelfe.

**Einwilligung widerrufen.** Die Entscheidung, das Skript zu laden, wird in
deinem Browser gespeichert (siehe Abschnitt 6) und lässt sich dort löschen. Der
Widerruf wirkt für die Zukunft. Für die Anmeldung selbst brauchst du das Widget
nicht – der Code-Weg bleibt offen.

Was Telegram seinerseits mit den Daten tut, richtet sich nach Telegrams eigener
Datenschutzerklärung. Darauf hat der Betreiber dieser Instanz keinen Einfluss.

## 4. Hosting

Diese Instanz läuft bei:

{{operator.hosting}}

Der Hoster verarbeitet die Daten ausschließlich weisungsgebunden als
Auftragsverarbeiter (Art. 28 DSGVO). Technisch bedingt fallen dabei
Server-Protokolle mit IP-Adressen an.

## 5. Was nicht stattfindet

- **Keine Analyse, kein Tracking, keine Werbung.** Die Anwendung bindet keine
  Analysedienste, keine Zählpixel und keine Werbenetzwerke ein.
- **Keine externen Schriften, keine Content Delivery Networks.** Alle Dateien
  kommen vom Server dieser Instanz. Einzige Ausnahme ist der Telegram-Button
  aus Abschnitt 3, und der nur nach deiner Einwilligung.
- **Keine Weitergabe zu Werbezwecken**, kein Verkauf, keine Profilbildung.
- **Keine automatisierte Entscheidung im Einzelfall** und kein Profiling im
  Sinne von Art. 22 DSGVO.
- **Kein Profilbild von Telegram.** Es wird weder gespeichert noch angezeigt;
  stattdessen erscheinen die Anfangsbuchstaben deines Namens.

## 6. Was auf deinem Gerät gespeichert wird

| Name                      | Art                | Zweck                                   | Dauer              |
| ------------------------- | ------------------ | --------------------------------------- | ------------------ |
| `filament_sid`            | Cookie, `httpOnly` | hält deine Anmeldung                    | 1 Jahr             |
| `sidebar_state`           | Cookie             | gewünschte Breite der Navigationsleiste | 7 Tage             |
| `theme`                   | lokaler Speicher   | gewähltes Farbschema                    | bis du ihn löschst |
| `sidebar-width`           | lokaler Speicher   | gewählte Breite der Navigationsleiste   | bis du ihn löschst |
| `telegram-widget-consent` | lokaler Speicher   | deine Entscheidung aus Abschnitt 3      | bis du ihn löschst |

Alle diese Einträge sind entweder technisch notwendig oder halten eine
Einstellung fest, die du selbst getroffen hast. Es gibt deshalb keinen
Einwilligungsbanner – und nichts davon dient der Analyse deines Verhaltens.

## 7. Import mit Hilfe eines Sprachmodells

Die Importseite erzeugt einen Textbaustein, den du zusammen mit einer Rechnung
oder Bestellbestätigung in ein Sprachmodell deiner Wahl geben kannst, um daraus
eine Liste zu machen.

**filahub übermittelt dabei selbst nichts.** Wenn du diesen Weg gehst, gibst du
das Dokument aber an einen Anbieter außerhalb dieser Anwendung. Rechnungen
enthalten typischerweise deinen Namen, deine Anschrift und Zahlungsangaben.
Prüfe vorher, was in dem Dokument steht, und schwärze, was das Sprachmodell
nicht braucht. Die hochgeladene Datei selbst verlässt deinen Browser nicht – nur
die daraus entstandene Liste wird an den Server gesendet.

## 8. Deine Rechte

Dir stehen zu:

- **Auskunft** (Art. 15 DSGVO, Art. 25 revDSG) – in den Einstellungen unter
  „Daten und Konto" jederzeit selbst abrufbar
- **Berichtigung** (Art. 16 DSGVO, Art. 32 revDSG) – alle Einträge sind in der
  Anwendung bearbeitbar
- **Löschung** (Art. 17 DSGVO, Art. 32 revDSG) – ebenfalls in den Einstellungen
- **Einschränkung der Verarbeitung** (Art. 18 DSGVO)
- **Datenübertragbarkeit** (Art. 20 DSGVO, Art. 28 revDSG) – der Export ist
  maschinenlesbares JSON und lässt sich über die Importseite wieder einlesen
- **Widerspruch** gegen Verarbeitungen auf Grundlage berechtigter Interessen
  (Art. 21 DSGVO)
- **Widerruf erteilter Einwilligungen** mit Wirkung für die Zukunft
  (Art. 7 Abs. 3 DSGVO)

**Was bei der Löschung geschieht.** Dein Konto und dein gesamter Bestand werden
endgültig entfernt, ebenso offene, abgelehnte und zurückgezogene Vorschläge.
Vorschläge, die in den **gemeinsamen Katalog** übernommen wurden, bleiben
bestehen – ohne deinen Namen und ohne deine Begründung. Der Grund: Andere
Konten verweisen auf diese Katalogeinträge, ein Mitlöschen würde deren Bestand
beschädigen. Der Eintrag selbst lässt danach keinen Rückschluss mehr auf dich
zu. Hast du als Administrator Vorschläge moderiert, bleibt die Entscheidung
nachvollziehbar, dein Name wird auch dort entfernt.

**Beschwerderecht.** Du kannst dich bei einer Aufsichtsbehörde beschweren – in
der Schweiz beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten
(EDÖB), in der Europäischen Union bei der Behörde deines Wohnsitzstaats oder
deines Arbeitsplatzes.

## 9. Pflicht zur Bereitstellung

Es besteht keine gesetzliche oder vertragliche Pflicht, Daten bereitzustellen.
Ohne Telegram-Konto ist eine Anmeldung technisch nicht möglich, und ohne
Angaben zu deinem Bestand hat die Anwendung nichts zu rechnen.

## 10. Änderungen

Diese Erklärung wird angepasst, wenn sich die Verarbeitung ändert. Maßgeblich
ist die hier abrufbare Fassung.
