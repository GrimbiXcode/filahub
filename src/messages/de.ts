/**
 * Deutsche Texte der Oberfläche – die Leitsprache.
 *
 * `en.ts` ist als `Messages` typisiert und damit ein Abbild dieser Datei:
 * Wer hier einen Eintrag ergänzt, umbenennt oder entfernt, bekommt dort einen
 * Typfehler, bis er nachgezogen ist. Kein Eintrag kann also stillschweigend
 * unübersetzt bleiben.
 *
 * Konventionen:
 * - Werte sind Zeichenketten; nur wo Werte eingesetzt werden oder Ein-/
 *   Mehrzahl unterschieden wird, steht eine Funktion.
 * - Gegliedert nach Bereich, nicht nach Datei – Texte, die an mehreren
 *   Stellen auftauchen, stehen unter `common`.
 * - Der Produktname „filahub“ ist ein Eigenname und steht in `src/const.ts`,
 *   nicht hier.
 * - Zahlen, Gewichte, Preise und Datumsangaben werden nicht hier formatiert,
 *   sondern über `useFormat()` – Sprache und Regionalformat sind getrennt.
 */
export const de = {
  common: {
    save: "Speichern",
    saving: "Speichern …",
    cancel: "Abbrechen",
    delete: "Löschen",
    edit: "Bearbeiten",
    close: "Schließen",
    back: "Zurück",
    loading: "Laden …",
    search: "Suchen …",
    actions: "Aktionen",
    name: "Name",
    notes: "Notizen",
    notesOptional: "Notiz (optional)",
    manufacturer: "Hersteller",
    color: "Farbe",
    price: "Preis",
    date: "Datum",
    weight: "Gewicht",
    tare: "Leergewicht",
    none: "–",
    optional: "optional",
    required: "Pflichtfeld",
    yes: "Ja",
    no: "Nein",
    all: "Alle",
    apply: "Übernehmen",
    create: "Anlegen",
    add: "Hinzufügen",
    nothingFound: "Nichts gefunden.",
    unknownError: "Unbekannter Fehler",
    nameRequired: "Bitte einen Namen angeben",
    invalidTare: "Bitte ein gültiges Leergewicht in Gramm angeben",
    nameRequiredLabel: "Name *",
  },

  nav: {
    overview: "Materialübersicht",
    import: "Import",
    spoolTypes: "Rollentypen",
    storageBoxes: "Lagerboxen",
    friends: "Freunde",
    friendsPending: (vars: { count: number }) =>
      `Freunde (${vars.count} offen)`,
    administration: "Verwaltung",
    presetCatalog: "Preset-Katalog",
    proposals: "Vorschläge",
    system: "System",
    releaseNotes: "Neuerungen",
    settings: "Einstellungen",
    material: "Material",
    weigh: "Wiegen",
    weighMaterial: "Material wiegen",
    searchWithShortcut: (vars: { shortcut: string }) =>
      `Suchen (${vars.shortcut})`,
    releaseNotesUnread: (vars: { count: number }) =>
      `Neuerungen (${vars.count} ungelesen)`,
    toggleSidebar: "Navigation ein-/ausklappen",
    signOut: "Abmelden",
  },

  theme: {
    label: "Farbschema",
    current: (vars: { theme: string }) => `Farbschema: ${vars.theme}`,
    light: "Hell",
    dark: "Dunkel",
    system: "System",
    active: "aktiv",
  },

  login: {
    intro:
      "Melde dich mit deinem Telegram-Konto an. Telegram bestätigt deine Identität – auf Wunsch auch per Telefonnummer.",
    notConfigured:
      "Telegram-Login ist noch nicht konfiguriert. Bitte hinterlege TELEGRAM_BOT_TOKEN und TELEGRAM_BOT_USERNAME auf dem Server.",
    widgetNotice:
      "Der Telegram-Anmeldebutton wird von telegram.org geladen. Telegram erfährt dabei deine IP-Adresse und Angaben zu deinem Gerät – auch dann, wenn du dich am Ende nicht anmeldest. Telegram sitzt in den Vereinigten Arabischen Emiraten, für die kein Angemessenheitsbeschluss vorliegt.",
    widgetLoad: "Telegram-Anmeldung laden",
    widgetAlternative:
      "Nicht nötig: Die Anmeldung per Code weiter unten kommt ohne Telegram-Skript aus.",
    orWithCode: "oder per Code",
    codeFromBot: "Code vom Bot",
    codeRequestHint: (vars: { command: string }) =>
      `(per ${vars.command} anfordern)`,
    codePlaceholder: "6-stelliger Code",
    signInWithCode: "Mit Code anmelden",
    signingIn: "Anmelden …",
    development: "Entwicklung",
    signInWithoutTelegram: "Ohne Telegram anmelden",
  },

  legal: {
    privacy: "Datenschutz",
    imprint: "Impressum",
    terms: "Nutzungsbedingungen",
    backToApp: "Zurück zur App",
    missing: "Dieser Text liegt noch nicht vor.",
    operatorMissing:
      "Für diese Instanz sind keine Betreiberangaben hinterlegt. Wer sie betreibt, ist datenschutzrechtlich verantwortlich und muss LEGAL_OPERATOR_NAME, LEGAL_OPERATOR_ADDRESS und LEGAL_OPERATOR_EMAIL setzen.",
  },

  authGate: {
    title: "Bitte anmelden",
    description:
      "Für den Zugriff auf dein Materiallager ist eine Anmeldung erforderlich.",
    action: "Anmelden",
  },

  adminGate: {
    title: "Kein Zugriff",
    description:
      "Dieser Bereich ist Administratorinnen und Administratoren vorbehalten.",
  },

  quick: {
    weighTitle: "Material wiegen",
    weighDescription: "Material auswählen, das gewogen werden soll",
    searchTitle: "Schnellsuche",
    searchDescription:
      "Materialien finden, Seiten öffnen und Aktionen ausführen",
    weighPlaceholder: "Kennung oder Bezeichnung des Materials …",
    searchPlaceholder: "Suchen: Kennung, Material, Seite oder Aktion …",
    groupWeigh: "Material zum Wiegen",
    groupActions: "Aktionen",
    groupJumpTo: "Springe zu",
    groupMaterials: "Materialien",
    newMaterial: "Neues Material anlegen",
    remaining: (vars: { amount: string }) => `${vars.amount} übrig`,
    /** Suchbegriffe, unter denen ein Eintrag gefunden werden soll */
    keywordsWeigh: "wiegen wägung waage material",
    keywordsNewMaterial: "neues material anlegen filament hinzufügen",
    keywordsGoTo: (vars: { label: string }) => `gehe zu ${vars.label}`,
    keywordsAdmin: (vars: { label: string }) => `verwaltung ${vars.label}`,
    keywordsThemeLight: "farbschema hell light",
    keywordsThemeDark: "farbschema dunkel dark nachtmodus",
    keywordsThemeSystem: "farbschema system automatisch",
  },

  settings: {
    title: "Einstellungen",
    description: "Sprache, Darstellung, Währung und Zahlenformate",
    saved: "Einstellung gespeichert",
    appearance: "Erscheinungsbild",
    appearanceHint:
      "„System“ folgt der Einstellung deines Geräts. Das Farbschema wird lokal gespeichert und gilt deshalb pro Gerät – am Telefon darf es dunkel sein, während der Rechner hell bleibt.",
    language: "Sprache",
    languageLabel: "Sprache der Oberfläche",
    languageHint:
      "Gilt für dein Konto, nicht für dieses Gerät – die Sprache folgt dir vom Telefon an den Rechner. Zahlen- und Datumsformat stellst du getrennt darunter ein.",
    currency: "Währung",
    currencyLabel: "Anzeigewährung",
    currencyHint:
      "Bestehende Preise werden nicht umgerechnet, sondern nur in der neuen Währung dargestellt.",
    regionalFormat: "Regionalformat",
    regionalFormatLabel: "Zahlen- und Datumsformat",
    automatic: (vars: { value: string }) =>
      `Automatisch (Browser: ${vars.value})`,
    install: "Schnellzugriff",
    installButton: "Zum Home-Bildschirm hinzufügen",
    installHint:
      "Legt filahub als eigenständige App auf den Home-Bildschirm oder ins Dock – mit eigenem Symbol und ohne Adressleiste. Es wird nichts heruntergeladen, es bleibt dieselbe Webseite.",
    installAlready: "filahub läuft bereits als installierte App.",
    installDialogDescription:
      "Der Weg dorthin gehört dem Browser, nicht der Seite – ein Knopf hier kann ihn nicht abkürzen. Für deinen Browser geht es so:",
    installHowIos:
      "Tippe unten in der Leiste auf „Teilen“ (Quadrat mit Pfeil nach oben), scrolle im Menü nach unten und wähle „Zum Home-Bildschirm“.",
    installHowAndroid:
      "Öffne das Browsermenü (drei Punkte oben rechts) und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.",
    installHowChromium:
      "Klicke rechts in der Adressleiste auf das Installationssymbol (Bildschirm mit Pfeil). Fehlt es, findest du den Punkt im Browsermenü (drei Punkte) unter „Streamen, Speichern und Teilen“.",
    installHowSafari:
      "Wähle in der Menüleiste „Ablage“ und darin „Zum Dock hinzufügen“. Das gibt es ab macOS Sonoma.",
    installHowFirefox:
      "Firefox am Rechner kann Webseiten nicht als App installieren. Setze filahub als Lesezeichen – oder öffne die Seite in Chrome, Edge oder Safari, wenn du ein eigenes Symbol möchtest.",
    installHowUnknown:
      "Suche im Menü deines Browsers nach „App installieren“, „Zum Home-Bildschirm“ oder „Zum Dock hinzufügen“. Wie der Punkt heißt, entscheidet der Browser.",
    dataAndAccount: "Daten und Konto",
    exportHint:
      "Lade alles herunter, was zu deinem Konto gespeichert ist: Profil, Rollen, Wägungen, Rollentypen, Lagerboxen, ausgeblendete Presets, eingereichte Vorschläge und offene Login-Codes. Das Format ist dasselbe, das der Import wieder einliest.",
    exportAction: "Daten herunterladen",
    exportPending: "Wird zusammengestellt …",
    exportDone: "Export heruntergeladen",
    logoutAllHint:
      "Beendet deine Sitzungen auf allen Geräten, auch auf diesem. Sinnvoll, wenn ein Gerät abhandengekommen ist oder du dich irgendwo fremd angemeldet hast.",
    logoutAllAction: "Auf allen Geräten abmelden",
    deleteHint:
      "Löscht dein Konto und deinen gesamten Bestand endgültig. Vorschläge, die in den gemeinsamen Katalog übernommen wurden, bleiben dort erhalten – ohne deinen Namen und ohne deine Begründung.",
    deleteAction: "Konto löschen",
    deleteTitle: "Konto endgültig löschen?",
    deleteDescription:
      "Das lässt sich nicht rückgängig machen. Lade dir vorher deine Daten herunter, wenn du sie behalten willst.",
    deleteConfirmLabel: (vars: { name: string }) =>
      `Tippe zur Bestätigung „${vars.name}“ ein`,
    deleteConfirmAction: "Endgültig löschen",
    deletePending: "Wird gelöscht …",
  },

  releaseNotes: {
    title: "Neuerungen",
    description: "Was sich in filahub geändert hat",
    unreadOne: "Ein Eintrag ist neu für dich",
    unreadMany: (vars: { count: number }) =>
      `${vars.count} Einträge sind neu für dich`,
    new: "Neu",
    empty: "Noch keine Einträge.",
    version: (vars: { version: string }) => `Du nutzt Version ${vars.version}.`,
    license: "filahub ist freie Software unter der",
    sourceIntro: "; der",
    source: "Quelltext",
    sourceOutro: "ist öffentlich.",
  },

  errorBoundary: {
    title: "Etwas ist schiefgelaufen",
    description:
      "Beim Anzeigen der Seite ist ein Fehler aufgetreten. Bitte lade die Seite neu – sollte das Problem bestehen bleiben, melde es mir.",
    action: "Zur Übersicht",
  },

  notFound: {
    description: "Diese Seite gibt es nicht (mehr).",
    action: "Zur Materialübersicht",
  },

  autocomplete: {
    showSuggestions: "Vorschläge anzeigen",
    newEntry: "Neuer Eintrag – erscheint beim nächsten Mal in der Auswahl",
  },

  home: {
    title: "Materialübersicht",
    description: "Dein 3D-Druck-Materiallager auf einen Blick",
    newMaterial: "Neues Material",
    lookupPlaceholder: "Kennung eingeben, z. B. F01",
    lookupAria: "Kennung für Schnellzugriff",
    lookupNotFound: (vars: { query: string }) =>
      `Kein Material zu „${vars.query}“ gefunden`,
    lookupAmbiguous: (vars: { query: string }) =>
      `Mehrere Treffer für „${vars.query}“ – bitte die genaue Kennung eingeben`,
    statMaterials: "Materialien",
    statMaterialsLow: (vars: { count: number }) =>
      `${vars.count} mit niedrigem Bestand`,
    statMaterialsOk: "alle ausreichend befüllt",
    statRemaining: "Restmenge",
    statRemainingHint: "effektiv verfügbar (ohne Tara)",
    statValue: "Restwert",
    statValueHint: "anteilig nach Restmenge",
    statInBox: "In Drybox",
    statInBoxHint: "Materialien mit Lagerbox",
    searchAria: "Materialien durchsuchen",
    clearSearch: "Suche leeren",
    filterSheetTitle: "Filter und Sortierung",
    reset: "Zurücksetzen",
    resetAll: "Alle zurücksetzen",
    showCount: (vars: { count: number }) => `${vars.count} anzeigen`,
    removeFilter: (vars: { label: string }) =>
      `Filter „${vars.label}“ entfernen`,
    filterSearch: (vars: { query: string }) => `Suche: „${vars.query}“`,
    filterLowStock: (vars: { percent: number }) =>
      `≤ ${vars.percent} % Restbestand`,
    materialType: "Materialart",
    allMaterialTypes: "Alle Materialarten",
    allManufacturers: "Alle Hersteller",
    storageBox: "Lagerbox",
    allBoxes: "Alle Boxen",
    noBox: "Ohne Box",
    sorting: "Sortierung",
    sortAsc: "Aufsteigend sortiert",
    sortDesc: "Absteigend sortiert",
    onlyLowStock: (vars: { percent: number }) =>
      `Nur niedriger Bestand (≤ ${vars.percent} %)`,
    sortIdentifier: "Kennung",
    sortName: "Bezeichnung",
    sortPercent: "Füllstand",
    sortRemaining: "Restmenge",
    sortPurchase: "Kaufdatum",
    emptyTitle: "Noch keine Materialien im Lager",
    emptyFiltered: "Keine Treffer für die aktuellen Filter",
    emptyHint: "Lege dein erstes Filament an – mit Rolle, Gewicht und Preis.",
    emptyFilteredHint: "Passe Suche oder Filter an.",
    colIdentifier: "Kennung",
    colMaterial: "Material",
    colType: "Art",
    colRemaining: "Restmenge",
    colSpoolBox: "Rolle / Box",
    colPurchase: "Kaufdatum",
    remaining: (vars: { amount: string }) => `${vars.amount} übrig`,
    sortBy: (vars: { label: string }) => `Nach ${vars.label} sortieren`,
  },

  materialDetail: {
    notFound: "Material nicht gefunden",
    toOverview: "Zur Übersicht",
    fillLevel: "Füllstand",
    ofNominal: (vars: { amount: string }) => `von ${vars.amount} Nennmenge`,
    consumed: "Verbraucht",
    tareTotal: "Tara gesamt",
    lastWeighing: "Letzte Wägung",
    lastWeighingGross: (vars: { amount: string }) => `${vars.amount} brutto`,
    noWeighingYet: "noch keine",
    remainingValue: "Restwert",
    masterData: "Stammdaten",
    identifier: "Kennung",
    materialType: "Materialart",
    purchaseDate: "Kaufdatum",
    spool: "Rolle / Verpackung",
    fromCatalog: "Katalog",
    storageBox: "Lagerbox / Drybox",
    tareSuffix: (vars: { amount: string }) => `(${vars.amount} Tara)`,
    history: "Wägungsverlauf",
    newWeighing: "Neue Wägung",
    colGross: "Brutto",
    colNet: "Netto",
    colNote: "Notiz",
    net: "netto",
    grossAt: (vars: { when: string; amount: string }) =>
      `${vars.when} · ${vars.amount} brutto`,
    noWeighings: "Noch keine Wägungen erfasst.",
    deleteMaterial: "Material löschen",
    deleteMaterialTitle: "Material löschen?",
    deleteMaterialDescription: (vars: { name: string }) =>
      `„${vars.name}“ und alle zugehörigen Wägungen werden endgültig gelöscht.`,
    materialDeleted: "Material gelöscht",
    deleteWeighing: "Wägung löschen",
    deleteWeighingTitle: "Wägung löschen?",
    deleteWeighingDescription:
      "Die Restmenge wird danach aus der nächstälteren Wägung berechnet.",
    weighingDeleted: "Wägung gelöscht",
  },

  storageBoxes: {
    title: "Lagerboxen",
    description:
      "Dryboxen und Aufbewahrungsboxen mit Leergewicht – beim Wiegen in der Box wird deren Tara automatisch abgezogen",
    newBox: "Neue Lagerbox",
    firstBox: "Erste Lagerbox anlegen",
    emptyTitle: "Noch keine Lagerboxen angelegt",
    emptyDescription:
      "Wiege deine leere Drybox, trage das Leergewicht ein und weise sie einem Material zu – die App rechnet die Box-Tara automatisch heraus.",
    tareSuffix: (vars: { amount: string }) => `${vars.amount} Tara`,
    assigned: (vars: { count: number }) =>
      vars.count === 1 ? "1 Material" : `${vars.count} Materialien`,
    free: "frei",
    location: "Standort",
    occupancy: "Belegung",
    editBox: "Lagerbox bearbeiten",
    deleteBox: "Lagerbox löschen",
    deleteTitle: "Lagerbox löschen?",
    deleteDescription: (vars: { name: string }) =>
      `„${vars.name}“ wird gelöscht. Sie darf aktuell keinem Material zugewiesen sein.`,
    namePlaceholder: "z. B. Drybox 1",
    locationPlaceholder: "z. B. Regal links, Werkstatt",
    tareLabel: "Leergewicht (g) *",
    tarePlaceholder: "z. B. 850",
    created: "Lagerbox angelegt",
    saved: "Lagerbox gespeichert",
    deleted: "Lagerbox gelöscht",
  },

  spoolTypes: {
    title: "Rollentypen",
    description: "Verpackungen und Spulen mit hinterlegtem Leergewicht (Tara)",
    newType: "Neuer Rollentyp",
    firstType: "Ersten Rollentyp anlegen",
    tabOwn: "Meine Rollentypen",
    tabCatalog: "Preset-Katalog",
    tabProposals: "Meine Vorschläge",
    emptyTitle: "Noch keine Rollentypen angelegt",
    emptyDescription:
      "Lege z. B. „Kunststoffspule 1 kg (140 g)“ oder „Pappspule (55 g)“ an – das Leergewicht wird bei jeder Wägung automatisch abgezogen. Fertige Rollen findest du im Preset-Katalog.",
    tareSuffix: (vars: { amount: string }) => `${vars.amount} Tara`,
    fromCatalog: "aus Katalog",
    proposeAsPreset: "Als Preset vorschlagen",
    deleteType: "Rollentyp löschen",
    editType: "Rollentyp bearbeiten",
    deleteTitle: "Rollentyp löschen?",
    deleteDescription: (vars: { name: string }) =>
      `„${vars.name}“ wird gelöscht. Materialien, die diesen Typ verwenden, müssen vorher umgehängt werden.`,
    namePlaceholder: "z. B. Kunststoffspule 1 kg",
    manufacturerPlaceholder: "z. B. eSun, Prusament",
    tareLabel: "Leergewicht (g) *",
    tarePlaceholder: "z. B. 140",
    calcTitle: "Leergewicht aus Wägung berechnen",
    calcDescription:
      "Neue (volle) Rolle auf die Waage legen, Gesamtgewicht und Nenn-Füllmenge eintragen – das Leergewicht wird automatisch berechnet und unten übernommen.",
    calcGross: "Gewicht neue Rolle (g)",
    calcGrossPlaceholder: "z. B. 1250",
    calcNominal: "Nenn-Füllmenge (g)",
    calcNominalPlaceholder: "z. B. 1000",
    calcResult: (vars: { amount: string }) => `Leergewicht: ${vars.amount}`,
    calcInvalid: "Das Gesamtgewicht muss größer als die Nenn-Füllmenge sein.",
    created: "Rollentyp angelegt",
    saved: "Rollentyp gespeichert",
    deleted: "Rollentyp gelöscht",
  },

  materialForm: {
    createTitle: "Neues Material",
    editTitle: "Material bearbeiten",
    createDescription:
      "Lege ein neues Filament an. Die Bezeichnung wird automatisch aus Hersteller, Typ und Farbe vorgeschlagen.",
    editDescription:
      "Eigenschaften des Materials anpassen. Die Restmenge wird aus den Wägungen berechnet.",
    materialTypeLabel: "Materialart *",
    identifier: "Kennung",
    nameLabel: "Bezeichnung *",
    namePlaceholder: "Wird automatisch aus Hersteller + Typ + Farbe befüllt",
    priceLabel: (vars: { symbol: string }) => `Preis (${vars.symbol})`,
    pricePlaceholder: (vars: { example: string }) => `z. B. ${vars.example}`,
    purchaseDate: "Kaufdatum",
    nominalLabel: "Nennmenge (g) *",
    nominalPlaceholder: "z. B. 1000",
    spool: "Rolle / Verpackung",
    storageBox: "Lagerbox / Drybox",
    chooseBox: "Lagerbox wählen",
    noBox: "Keine Box",
    noBoxesHint:
      "Noch keine Lagerboxen angelegt – unter „Lagerboxen“ hinzufügen.",
    initialLabel: (vars: { withBox: boolean }) =>
      `Erstwägung inkl. Rolle${vars.withBox ? " + Box" : ""} (g, optional)`,
    initialPlaceholder: "Gemessenes Gesamtgewicht beim Kauf",
    notesPlaceholder: "Drucktemperatur, Besonderheiten …",
    created: "Material angelegt",
    saved: "Material gespeichert",
    nameRequired:
      "Bitte eine Bezeichnung angeben (oder Hersteller/Typ/Farbe ausfüllen)",
    typeRequired: "Bitte eine Materialart angeben",
    nominalRequired: "Bitte eine gültige Nennmenge in Gramm angeben",
    initialInvalid: "Bitte ein gültiges Anfangsgewicht angeben",
  },

  spoolPicker: {
    choose: "Rolle wählen",
    searchPlaceholder: "Hersteller, Serie oder Gewicht suchen …",
    empty: "Keine passende Rolle gefunden.",
    none: "Keine / unbekannt",
    ownTypes: "Eigene Rollentypen",
    catalogMore: "Weitere Katalog-Rollen",
    catalog: "Katalog-Rollen",
    nothingYet:
      "Noch keine Rollentypen angelegt – unter „Rollentypen“ hinzufügen oder ein Preset aus dem Katalog wählen.",
  },

  presetCatalog: {
    emptyTitle: "Der Preset-Katalog ist noch leer",
    emptyDescription:
      "Sobald Hersteller und Spulen hinterlegt sind, kannst du sie hier auswählen – das Leergewicht wird dann automatisch übernommen.",
    intro:
      "Vorkonfigurierte Rollen. Was du hier ausblendest, verschwindet aus deiner Auswahl beim Material – bereits zugewiesene Rollen bleiben erhalten. Über „Übernehmen“ wird aus einem Preset ein eigener, frei bearbeitbarer Rollentyp.",
    show: "Wieder einblenden",
    hide: "Für mich ausblenden",
    hidden: "ausgeblendet",
    showAria: (vars: { label: string }) => `${vars.label} einblenden`,
    hideAria: (vars: { label: string }) => `${vars.label} ausblenden`,
    seriesCount: (vars: { count: number }) =>
      vars.count === 1 ? "1 Serie" : `${vars.count} Serien`,
    allMaterialTypes: "alle Materialarten",
    olderVersion: "ältere Ausführung",
    validFrom: (vars: { date: string }) => `ab ${vars.date}`,
    validTo: (vars: { date: string }) => `bis ${vars.date}`,
    nominalWeight: "Nenngewicht",
    dimensions: "Abmessungen (Ø × Breite × Bohrung)",
    adopt: "Als eigenen Rollentyp übernehmen",
    adopted: (vars: { name: string }) =>
      `„${vars.name}“ als eigener Rollentyp übernommen`,
  },

  proposePreset: {
    title: "Als Preset vorschlagen",
    description: (vars: { name: string; tare: string }) =>
      `„${vars.name}“ (${vars.tare} Tara)`,
    descriptionSuffix:
      "für alle vorschlagen. Ordne die Rolle einem Hersteller, einer Serie und einer Ausführung zu – Übersetzungen sind freiwillig.",
    seriesInLanguage: (vars: { language: string }) =>
      `Serie (${vars.language}, optional)`,
    versionInLanguage: (vars: { language: string }) =>
      `Ausführung (${vars.language}, optional)`,
    manufacturerLabel: "Hersteller *",
    seriesLabel: "Serie / Produktlinie *",
    versionLabel: "Ausführung *",
    spoolMaterialLabel: "Spulenmaterial",
    nominalLabel: "Nenngewicht (g) *",
    materialTypeLabel: "Materialart",
    commentLabel: "Anmerkung",
    commentPlaceholder: "Woher stammt das Leergewicht?",
    manufacturerRequired: "Bitte einen Hersteller angeben",
    seriesRequired: "Bitte eine Serie angeben",
    versionRequired: "Bitte eine Ausführung angeben",
    nominalInvalid: "Bitte ein gültiges Nenngewicht in Gramm angeben",
    tareTooLarge: "Das Leergewicht muss kleiner als das Nenngewicht sein",
  },

  import: {
    title: "Massenimport",
    description:
      "Bestellliste per LLM in JSON umwandeln und alle Positionen auf einmal ins Lager übernehmen.",
    step1: "1. Prompt kopieren",
    step1Description:
      "Diesen Prompt zusammen mit deiner Bestellliste (Rechnung, Bestellbestätigung …) an ein LLM deiner Wahl schicken.",
    copyPrompt: "Prompt kopieren",
    showPrompt: "Prompt anzeigen",
    hidePrompt: "Prompt verbergen",
    privacyWarning:
      "Bedenke, was in dem Dokument steht, das du mitschickst: Rechnungen enthalten meist Name, Anschrift und Zahlungsangaben. Diese Daten gehen an den Anbieter des Sprachmodells, nicht an filahub – schwärze, was er nicht braucht.",
    promptCopied: "Prompt in die Zwischenablage kopiert",
    copyFailed: "Kopieren fehlgeschlagen – bitte manuell markieren",
    step2: "2. JSON einfügen",
    step2Description:
      "Die Antwort des LLM hier einfügen oder als Datei (.json, .txt) hochladen.",
    check: "Überprüfen",
    uploadFile: "Datei hochladen",
    invalidJson:
      "Das ist kein gültiges JSON. Bitte die Ausgabe des LLM prüfen.",
    step3: "3. Prüfen und importieren",
    step3Description:
      "Angaben bei Bedarf korrigieren, fehlerhafte Positionen löschen. Pro Position und Stückzahl wird ein eigenes Material angelegt.",
    purchaseDateLabel: "Kaufdatum (optional)",
    noPositions: "Keine Positionen mehr vorhanden.",
    position: (vars: { index: number }) => `Position ${vars.index}`,
    deletePosition: (vars: { index: number }) =>
      `Position ${vars.index} löschen`,
    positionError: (vars: { index: number; errors: string }) =>
      `Position ${vars.index}: ${vars.errors}`,
    typeLabel: "Typ *",
    nominalLabel: "Nenngewicht (g)",
    priceLabel: (vars: { symbol: string }) => `Preis (${vars.symbol})`,
    pricePlaceholder: "z. B. 29,99",
    countLabel: "Anzahl",
    importing: "Importiere …",
    importCount: (vars: { count: number }) =>
      `${vars.count} Materialien importieren`,
    fixErrors: "Bitte zuerst die markierten Fehler beheben.",
    errTypeMissing: "Typ fehlt",
    errNominal: "Nenngewicht ungültig",
    errCount: "Anzahl ungültig",
    errPrice: "Preis ungültig",
  },

  catalogEditor: {
    createManufacturer: "Neuer Hersteller",
    editManufacturer: "Hersteller bearbeiten",
    createSeries: "Neue Serie",
    editSeries: "Serie bearbeiten",
    createVersion: "Neue Ausführung",
    editVersion: "Ausführung bearbeiten",
    createVariant: "Neue Größe",
    editVariant: "Größe bearbeiten",
    description:
      "Änderungen wirken sofort für alle Benutzer. Bearbeitete Einträge werden vom automatischen Startkatalog künftig nicht mehr überschrieben.",
    manufacturerPlaceholder: "z. B. Polymaker",
    seriesPlaceholder: "z. B. PolyTerra PLA",
    versionPlaceholder: "z. B. Kartonspule (ab 2023)",
    nameInLanguage: (vars: { language: string }) => `Name (${vars.language})`,
    translationHint: "Leer lassen = Grundname verwenden",
    sameAsBase: "Wie Grundname",
    sameAsBaseTitle:
      "Grundname übernehmen – für Eigennamen wie „PolyTerra PLA“, die in jeder Sprache gleich heißen",
    translationNote:
      "Ohne Übersetzung erscheint der Grundname. Hersteller werden nicht übersetzt – Eigennamen sind in jeder Sprache dieselben.",
    website: "Website",
    materialTypes: "Materialarten",
    materialTypesPlaceholder: "z. B. PLA, PETG – leer = gilt für alle",
    spoolMaterial: "Spulenmaterial",
    unknown: "Unbekannt",
    validFrom: "Gültig ab",
    validTo: "Gültig bis",
    validHint: "Ohne „Gültig bis“ gilt die Ausführung als aktuell im Handel.",
    nominalLabel: "Nenngewicht (g) *",
    tareLabel: "Leergewicht (g) *",
    tarePlaceholder: "z. B. 140",
    outerDiameter: "Außen-Ø (mm)",
    width: "Breite (mm)",
    bore: "Bohrung (mm)",
    active: "Aktiv (wählbar für alle Benutzer)",
    savedManufacturerNew: "Hersteller angelegt",
    savedManufacturer: "Hersteller gespeichert",
    savedSeriesNew: "Serie angelegt",
    savedSeries: "Serie gespeichert",
    savedVersionNew: "Ausführung angelegt",
    savedVersion: "Ausführung gespeichert",
    savedVariantNew: "Größe angelegt",
    savedVariant: "Größe gespeichert",
    validRangeInvalid: "„Gültig ab“ muss vor „Gültig bis“ liegen",
    nominalInvalid: "Bitte ein gültiges Nenngewicht in Gramm angeben",
    tareTooLarge: "Das Leergewicht muss kleiner als das Nenngewicht sein",
    dimensionsInvalid: "Bitte gültige Abmessungen in Millimetern angeben",
  },

  adminPresets: {
    title: "Preset-Katalog",
    description:
      "Hersteller, Serien, Ausführungen und Größen für alle Benutzer pflegen",
    newManufacturer: "Neuer Hersteller",
    newSeries: "Neue Serie",
    emptyTitle: "Noch keine Presets im Katalog",
    emptyDescription:
      "Lege einen Hersteller an, darunter eine Serie, eine Ausführung und schließlich die Größen mit ihrem Leergewicht.",
    nominalWeight: "Nenngewicht",
    dimensions: "Ø × Breite × Bohrung",
    origin: "Herkunft",
    disabled: "deaktiviert",
    discontinued: "ausgelaufen",
    addSize: "Größe",
    addVersion: "Ausführung",
    noVariants: "Noch keine Größe hinterlegt.",
    missingTranslation: (vars: { language: string }) =>
      `${vars.language} fehlt`,
    missingTranslationTitle: (vars: { language: string }) =>
      `Für ${vars.language} ist noch keine Übersetzung hinterlegt`,
    onlyMissing: "Nur ohne Übersetzung",
    allTranslated: "Alle Einträge sind übersetzt.",
    deleted: "Eintrag gelöscht",
    deleteTitle: "Eintrag löschen?",
    deleteDescription: (vars: { label: string }) =>
      `„${vars.label}“ wird endgültig entfernt. Einträge mit Untereinträgen oder mit Materialien, die sie verwenden, lassen sich nicht löschen – deaktiviere sie in dem Fall stattdessen.`,
  },

  adminProposals: {
    title: "Vorschläge",
    description: "Community-Vorschläge für den Preset-Katalog prüfen",
    allProposals: "Alle Vorschläge",
    emptyTitle: "Keine Vorschläge in dieser Ansicht",
    submitted: "Eingereicht",
    from: "Von",
    kind: "Art",
    reason: "Begründung",
    kindNew: "Neuer Eintrag",
    approve: "Übernehmen",
    approving: "Wird übernommen …",
    reject: "Ablehnen",
    rejecting: "Wird abgelehnt …",
    approved: "Vorschlag übernommen",
    rejected: "Vorschlag abgelehnt",
    detailNew: "Neuer Katalogeintrag",
    detailChange: "Änderungsvorschlag",
    submittedBy: (vars: { name: string }) => `Eingereicht von ${vars.name}`,
    unknownUser: "unbekannt",
    withComment: (vars: { comment: string }) => ` · „${vars.comment}“`,
    moderationNote: (vars: { note: string }) =>
      `Begründung der Moderation: ${vars.note}`,
    rejectTitle: "Vorschlag ablehnen",
    reasonLabel: "Begründung *",
    reasonPlaceholder: "z. B. „Leergewicht weicht von der Herstellerangabe ab“",
    reasonRequired: "Bitte eine Begründung für die Ablehnung angeben",
    rowManufacturer: "Hersteller",
    rowSeries: "Serie",
    rowMaterialTypes: "Materialarten",
    rowVersion: "Ausführung",
    rowSpoolMaterial: "Spulenmaterial",
  },

  adminSystem: {
    title: "System",
    description: "Datenbank, Migrationen und Startkatalog",
    database: "Datenbank",
    system: "System",
    databaseName: "Datenbank",
    connection: "Verbindung",
    poolConnections: "Verbindungen im Pool",
    migrations: "Schema-Migrationen",
    upToDate: "Aktuell",
    pendingCount: (vars: { count: number }) => `${vars.count} ausstehend`,
    applied: "angewendet",
    pending: "ausstehend",
    seedCatalog: "Preset-Startkatalog",
    seedRevision: (vars: { revision: number; rows: string }) =>
      `Revision ${vars.revision} · ${vars.rows} Einträge aus dem Startkatalog`,
    source: "Quelle",
    tables: "Tabellen",
    colTable: "Tabelle",
  },

  weighing: {
    title: "Material wiegen",
    description: (vars: { name: string; withBox: boolean }) =>
      `Wiege „${vars.name}“ komplett – inklusive Rolle${
        vars.withBox ? " und Lagerbox" : ""
      }. Das Leergewicht wird automatisch abgezogen.`,
    grossLabel: "Gemessenes Gesamtgewicht (g) *",
    grossPlaceholder: "z. B. 740",
    remaining: "Effektiv übrig",
    tareSpool: "Tara Rolle/Verpackung",
    tareBox: "Tara Lagerbox",
    tareBoxNamed: (vars: { name: string }) => `Tara Lagerbox (${vars.name})`,
    tareTotal: "Tara gesamt",
    notePlaceholder: "z. B. nach Druck von Teil X",
    submit: "Wägung speichern",
    saved: "Wägung gespeichert",
    invalidWeight: "Bitte ein gültiges Gewicht in Gramm angeben",
  },

  preset: {
    scope: {
      manufacturer: "Hersteller",
      series: "Serie",
      version: "Ausführung",
      variant: "Variante",
    },
    status: {
      pending: "Offen",
      approved: "Übernommen",
      rejected: "Abgelehnt",
      withdrawn: "Zurückgezogen",
    },
    spoolMaterial: {
      kunststoff: "Kunststoff",
      karton: "Karton",
      metall: "Metall",
      sonstiges: "Sonstiges",
    },
  },

  myProposals: {
    withdrawn: "Vorschlag zurückgezogen",
    emptyTitle: "Noch keine Vorschläge eingereicht",
    emptyDescription:
      "Über „Als Preset vorschlagen“ bei einem eigenen Rollentyp oder „Änderung vorschlagen“ im Katalog kannst du den gemeinsamen Katalog verbessern.",
    submitted: "Eingereicht",
    kind: "Art",
    content: "Inhalt",
    status: "Status",
    kindNew: "Neuer Eintrag",
    kindChange: (vars: { scope: string }) => `Änderung (${vars.scope})`,
    withdraw: "Zurückziehen",
  },

  proposeChange: {
    title: "Änderung vorschlagen",
    description: (vars: { spool: string; size: string }) =>
      `${vars.spool} · ${vars.size}. Deine Korrektur wird von einer Administratorin oder einem Administrator geprüft, bevor sie im Katalog landet.`,
    tareLabel: "Leergewicht (g)",
    outerDiameter: "Außen-Ø (mm)",
    width: "Breite (mm)",
    bore: "Bohrung (mm)",
    reason: "Begründung",
    reasonPlaceholder: "z. B. „Leere Spule dreimal gewogen, im Mittel 138 g“",
    submit: "Vorschlag einreichen",
    submitting: "Wird gesendet …",
    submitted: "Vorschlag eingereicht – er wird von der Moderation geprüft.",
    invalidTare: "Bitte ein gültiges Leergewicht in Gramm angeben",
    invalidDimensions: "Bitte gültige Abmessungen in Millimetern angeben",
    noChanges: "Der Vorschlag enthält keine Änderungen",
  },

  friends: {
    title: "Freunde",
    description:
      "Material mit Freunden teilen – du entscheidest für jeden einzeln, wie viel von deinem Lager er sieht. Geldbeträge nie.",

    // Eigener Code
    myCodeTitle: "Dein Freundescode",
    myCodeHint:
      "Gib den Code an jemanden weiter, mit dem du Material teilen willst. Nur wer ihn kennt, kann dir eine Anfrage schicken.",
    copyCode: "Code kopieren",
    codeCopied: "Freundescode kopiert",
    rotateCode: "Neuen Code erzeugen",
    rotateCodeTitle: "Neuen Freundescode erzeugen?",
    rotateCodeDescription:
      "Der alte Code funktioniert danach nicht mehr. Bestehende Freundschaften bleiben unberührt.",
    codeRotated: "Neuer Freundescode erzeugt",

    // Hinzufügen
    addTitle: "Freund hinzufügen",
    addHint:
      "Freundescode oder Telegram-Name. Der Code ist der zuverlässigere Weg – nicht jeder hat einen Telegram-Namen gesetzt.",
    codeLabel: "Freundescode",
    codePlaceholder: "FH-A2B3-C4D5",
    usernameLabel: "Telegram-Name",
    usernamePlaceholder: "@name",
    sendRequest: "Anfrage senden",
    requestSent: "Anfrage gesendet",
    requestSentUnreachable:
      "Anfrage gesendet. Über Telegram war die Person nicht erreichbar – sie sieht die Anfrage beim nächsten Besuch.",

    // Liste
    listTitle: "Deine Freunde",
    emptyTitle: "Noch keine Freunde",
    emptyDescription:
      "Tausche Freundescodes aus, dann findest du das freigegebene Material deiner Freunde in der Suche.",
    incomingTitle: "Offene Anfragen an dich",
    outgoingTitle: "Von dir gestellte Anfragen",
    pendingBadge: "Wartet",
    declinedBadge: "Abgelehnt",
    accept: "Annehmen",
    decline: "Ablehnen",
    accepted: "Anfrage angenommen",
    declined: "Anfrage abgelehnt",
    removeFriend: "Freundschaft auflösen",
    removeTitle: "Freundschaft auflösen?",
    removeDescription: (vars: { name: string }) =>
      `Du siehst danach kein Material von ${vars.name} mehr und ${vars.name} keines von dir. Laufende Ausleih-Anfragen verschwinden mit.`,
    removed: "Freundschaft aufgelöst",

    // Sichtbarkeit
    sharedByMe: "Du zeigst",
    sharedWithMe: "Du siehst",
    theirChoice: "Entscheidung deines Freundes",
    visibilityNone: "Nichts",
    visibilitySearch: "Nur in der Suche",
    visibilityFull: "Ganzes Lager",
    visibilityNoneHint: "Dein Lager bleibt vollständig verborgen.",
    visibilitySearchHint:
      "Treffer erscheinen nur, wenn nach etwas Bestimmtem gesucht wird. Kein Blättern durch dein Lager.",
    visibilityFullHint:
      "Das ganze Lager ist einsehbar – ohne Preise, Notizen, Kaufdaten, Lagerort und Wägungen.",
    visibilitySaved: "Sichtbarkeit gespeichert",
    openInventory: "Lager ansehen",

    // Lager eines Freundes
    inventoryTitle: (vars: { name: string }) => `Lager von ${vars.name}`,
    inventoryDescription:
      "Freigegebenes Material. Preise, Notizen, Kaufdaten, Lagerort und Wägungen sind nicht enthalten.",
    inventoryEmpty: "Dieses Lager ist leer.",
    inventoryDenied:
      "Dieses Lager ist für dich nicht einsehbar. Vielleicht hat sich die Freigabe geändert.",

    // Suche
    searchTitle: "Bei Freunden gefunden",
    searchHintShort: (vars: { count: number }) =>
      `Ab ${vars.count} Zeichen wird auch bei deinen Freunden gesucht.`,
    searchEmpty: "Bei deinen Freunden gibt es dazu nichts.",
    searchCount: (vars: { count: number }) =>
      vars.count === 1 ? "1 Treffer" : `${vars.count} Treffer`,
    ownerLabel: (vars: { name: string }) => `bei ${vars.name}`,
    ownerColumn: "Bei",
  },

  loan: {
    ask: "Anfragen",
    askTitle: "Material anfragen",
    askDescription: (vars: { material: string; name: string }) =>
      `${vars.name} bekommt eine Nachricht, dass du „${vars.material}“ ausleihen möchtest.`,
    messageLabel: "Nachricht (optional)",
    messagePlaceholder: "z. B. „Bräuchte etwa 200 g, gebe den Rest zurück.“",
    send: "Anfrage senden",
    sending: "Wird gesendet …",
    sent: "Anfrage gesendet",
    sentUnreachable:
      "Anfrage gesendet. Über Telegram war die Person nicht erreichbar – sie sieht die Anfrage beim nächsten Besuch.",

    incomingTitle: "Ausleih-Anfragen an dich",
    outgoingTitle: "Deine Ausleih-Anfragen",
    emptyIncoming: "Niemand fragt gerade nach deinem Material.",
    emptyOutgoing: "Du hast nichts angefragt.",
    fromLabel: (vars: { name: string }) => `von ${vars.name}`,
    toLabel: (vars: { name: string }) => `an ${vars.name}`,
    statusOpen: "Offen",
    statusAccepted: "Zugesagt",
    statusDeclined: "Abgelehnt",
    statusWithdrawn: "Zurückgezogen",
    accept: "Zusagen",
    decline: "Ablehnen",
    accepted: "Zugesagt",
    declined: "Abgelehnt",
    withdraw: "Zurückziehen",
    withdrawn: "Anfrage zurückgezogen",
  },
};

export type Messages = typeof de;
