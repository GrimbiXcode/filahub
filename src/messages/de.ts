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
    ctrlKey: "Strg",
    submitShortcut: (vars: { keys: string }) => `${vars.keys} speichert`,
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
    dateNotRecognized: (vars: { value: string }) =>
      `„${vars.value}“ ließ sich nicht als Datum lesen`,
  },

  nav: {
    overview: "Materialübersicht",
    import: "Import",
    containerTypes: "Gebindearten",
    storageBoxes: "Dryboxen",
    appearance: "Farben & Oberflächen",
    lager: "Lager",
    friends: "Freunde",
    friendsPending: (vars: { count: number }) =>
      `Freunde (${vars.count} offen)`,
    organizations: "Organisationen",
    organizationsPending: (vars: { count: number }) =>
      `Organisationen (${vars.count} Einladungen)`,
    administration: "Verwaltung",
    presetCatalog: "Preset-Katalog",
    proposals: "Vorschläge",
    system: "System",
    users: "Nutzer",
    abuse: "Missbrauch",
    releaseNotes: "Neuerungen",
    settings: "Einstellungen",
    material: "Material",
    weigh: "Wiegen",
    weighMaterial: "Gebinde wiegen",
    consume: "Verbrauch",
    consumeMaterial: "Verbrauch abbuchen",
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
    /* Nur für Screenreader: Beschriftung des Rahmens mit dem Telegram-Knopf. */
    widgetTitle: "Telegram-Anmeldung",
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
    weighTitle: "Gebinde wiegen",
    weighDescription: "Gebinde auswählen, das gewogen werden soll",
    consumeTitle: "Verbrauch abbuchen",
    consumeDescription: "Gebinde auswählen, von dem abgebucht werden soll",
    searchTitle: "Schnellsuche",
    searchDescription:
      "Materialien finden, Seiten öffnen und Aktionen ausführen",
    weighPlaceholder: "Kennung oder Name des Materials …",
    consumePlaceholder: "Kennung oder Name des Materials …",
    searchPlaceholder: "Suchen: Kennung, Material, Seite oder Aktion …",
    groupWeigh: "Gebinde zum Wiegen",
    groupConsume: "Gebinde zum Abbuchen",
    groupActions: "Aktionen",
    groupJumpTo: "Springe zu",
    groupMaterials: "Gebinde",
    newMaterial: "Neues Material anlegen",
    remaining: (vars: { amount: string }) => `${vars.amount} übrig`,
    /** Suchbegriffe, unter denen ein Eintrag gefunden werden soll */
    keywordsWeigh: "wiegen wägung waage material",
    keywordsConsume: "verbrauch abbuchen druck slicer gramm verbraucht",
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
      "Lade alles herunter, was zu deinem Konto gespeichert ist: Profil, Lager, Materialien, Gebinde, Wägungen, Gebindearten, Dryboxen, Freundschaften, Ausleih-Anfragen, ausgeblendete Presets, eingereichte Vorschläge, offene Login-Codes und das Sicherheitsprotokoll. Eine JSON-Datei zum Nachlesen und Aufbewahren – der Import auf der Importseite erwartet ein anderes, kürzeres Format.",
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

  update: {
    available:
      "Eine neue Version von filahub ist da – lade neu, sobald du hier fertig bist.",
    reload: "Neu laden",
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
      `Kein Gebinde zu „${vars.query}“ gefunden`,
    lookupUsedUp: (vars: { identifier: string }) =>
      `${vars.identifier} ist als aufgebraucht markiert – hier ist seine Seite.`,
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
    statInBoxHint: "Gebinde mit Drybox",
    searchAria: "Materialien durchsuchen",
    clearSearch: "Suche leeren",
    filters: "Filter",
    filterSheetTitle: "Filter und Sortierung",
    reset: "Zurücksetzen",
    resetAll: "Alle zurücksetzen",
    resetFilters: "Filter zurücksetzen",
    showCount: (vars: { count: number }) => `${vars.count} anzeigen`,
    removeFilter: (vars: { label: string }) =>
      `Filter „${vars.label}“ entfernen`,
    filterSearch: (vars: { query: string }) => `Suche: „${vars.query}“`,
    filterLowStock: "Knapper Bestand",
    materialType: "Materialart",
    allMaterialTypes: "Alle Materialarten",
    texture: "Oberfläche",
    allTextures: "Alle Oberflächen",
    allManufacturers: "Alle Hersteller",
    storageBox: "Drybox",
    allBoxes: "Alle Boxen",
    noBox: "Ohne Box",
    sorting: "Sortierung",
    sortAsc: "Aufsteigend sortiert",
    sortDesc: "Absteigend sortiert",
    onlyLowStock: "Nur Materialien mit knappem Bestand",
    sortIdentifier: "Kennung",
    sortName: "Bezeichnung",
    sortPercent: "Füllstand",
    sortRemaining: "Restmenge",
    sortPurchase: "Kaufdatum",
    emptyTitle: "Noch keine Materialien im Lager",
    emptyFiltered: "Keine Treffer für die aktuellen Filter",
    emptyHint: "Lege dein erstes Material an – mit Gebinde, Gewicht und Preis.",
    emptyFilteredHint: "Passe Suche oder Filter an.",
    emptyAction: "Erstes Material anlegen",
    countOf: (vars: { shown: number; total: number }) =>
      `${vars.shown} von ${vars.total} Gebinden`,
    colIdentifier: "Kennung",
    colAppearance: "Optik",
    colMaterial: "Material",
    colType: "Art",
    colManufacturer: "Hersteller",
    colRemaining: "Restmenge",
    colContainerBox: "Gebinde / Box",
    colPrice: "Preis",
    colPurchase: "Kaufdatum",
    colActions: "Aktionen",
    columns: "Spalten",
    columnsTitle: "Sichtbare Spalten",
    columnsHint: "Gilt auf allen deinen Geräten",
    columnsReset: "Standard wiederherstellen",
    remaining: (vars: { amount: string }) => `${vars.amount} übrig`,
    sortBy: (vars: { label: string }) => `Nach ${vars.label} sortieren`,
    // Seit 3.0: Regal, Kacheln und Detail daneben
    shelfView: "Regal",
    listView: "Liste",
    viewLabel: "Ansicht",
    summary: (vars: { count: number; remaining: string; low: number }) =>
      `${vars.count} Gebinde · ${vars.remaining} übrig · ${vars.low} knapp`,
    groupCount: (vars: { count: number }) => `${vars.count} Gebinde`,
    groupTare: (vars: { amount: string }) => `Tara ${vars.amount}`,
    outOfStock: (vars: { count: number }) =>
      vars.count === 1
        ? "Ausgegangen – alle Rollen aufgebraucht:"
        : `${vars.count} Materialien ausgegangen – alle Rollen aufgebraucht:`,
    mergeHint: (vars: { count: number }) =>
      vars.count === 1
        ? "Zwei Materialien sehen aus wie dasselbe. Zusammengeführt zählt ihr Bestand gemeinsam."
        : `${vars.count} Gruppen von Materialien sehen aus wie dasselbe. Zusammengeführt zählt ihr Bestand gemeinsam.`,
    mergeHintAction: "Ansehen",
    mergeHintDismiss: "Ausblenden",
    shelfGroupingLabel: "Regal gruppieren",
    shelfGroupByBox: "Nach Drybox",
    shelfGroupByProduct: "Nach Material",
    tileRemainingTitle: "Restmenge",
    tileLowTitle: "Knapp",
    tileLowSub: "unter der Warnschwelle",
    tileLowOf: (vars: { count: number; total: number }) =>
      `${vars.count} von ${vars.total}`,
    tileValueTitle: "Restwert",
    tileInBoxTitle: "In Drybox",
    moreMaterials: (vars: { count: number }) => `+ ${vars.count} weitere`,
    noSelection: "Eine Rolle im Regal antippen, um sie hier zu sehen.",
    details: "Details",
    weighNamed: (vars: { name: string }) => `${vars.name} wiegen`,
    selectNamed: (vars: { name: string }) => `${vars.name} auswählen`,
  },

  /**
   * Material (Produkt) über den Gebinden, seit 4.0.0. „Material“ meint hier
   * das Produkt, „Gebinde“/„Rolle“ das einzelne Stück.
   */
  product: {
    notFound: "Material nicht gefunden",
    editTitle: "Material bearbeiten",
    spoolsTitle: "Rollen",
    gebindeTitle: "Gebinde",
    otherSpools: (vars: { count: number }) =>
      vars.count === 1
        ? "1 Rolle von diesem Material"
        : `${vars.count} Rollen von diesem Material`,
    otherGebinde: (vars: { count: number }) =>
      vars.count === 1
        ? "1 Gebinde von diesem Material"
        : `${vars.count} Gebinde von diesem Material`,
    saved: "Material gespeichert",
    archivedToggle: (vars: { count: number }) =>
      vars.count === 1 ? "1 aufgebraucht" : `${vars.count} aufgebraucht`,
    toMaterial: "Zum Material",
    thisOne: "dieses",
    stockOk: "Bestand, ausreichend",
    stockLow: "Bestand, knapp",
    stockUsedUp: "ausgegangen – alle aufgebraucht",
    thresholdLager: (vars: { amount: string }) =>
      `Warnschwelle ${vars.amount} (Lager)`,
    thresholdDefault: (vars: { amount: string }) =>
      `Warnschwelle ${vars.amount} (Vorgabe)`,
    addSpool: "Weitere Rolle anlegen",
    addGebinde: "Weiteres Gebinde anlegen",
    densityDefault: "Vorgabe der Materialart",
    mergeTitle: "Zusammenführen",
    mergeHint:
      "Zwei Einträge, die dasselbe Material sind? Beim Zusammenführen wandern alle Gebinde des anderen hierher, und das andere verschwindet. Name, Farbe und die übrigen Angaben bleiben die von diesem hier – ebenso die Druckeinstellungen; hat dieses keine, werden die des anderen übernommen.",
    mergeSuggestions: "Sieht aus wie dasselbe Material",
    mergeOther: "Anderes Material",
    mergeChoose: "Material wählen",
    mergeHere: "Hierher zusammenführen",
    mergeConfirmTitle: "Materialien zusammenführen?",
    mergeConfirmDescription: (vars: {
      source: string;
      target: string;
      count: number;
    }) =>
      `${vars.count === 1 ? "Das Gebinde" : `Die ${vars.count} Gebinde`} von „${vars.source}“ ${vars.count === 1 ? "wandert" : "wandern"} zu „${vars.target}“; „${vars.source}“ wird danach gelöscht. Rückgängig machen lässt sich das nur von Hand.`,
    merged: (vars: { count: number }) =>
      vars.count === 1
        ? "1 Gebinde übernommen"
        : `${vars.count} Gebinde übernommen`,
  },
  /** Druckeinstellungen je Material (seit 4.1.0) */
  printSettings: {
    title: "Druckeinstellungen",
    add: "Hinterlegen",
    empty:
      "Noch nichts hinterlegt. Düse, Bett, Trocknen und Notizen gelten dann für alle Rollen dieses Materials.",
    editTitle: "Druckeinstellungen bearbeiten",
    editDescription:
      "Gilt für alle Gebinde dieses Materials. Leere Felder bleiben leer – nur eintragen, was du weißt.",
    saved: "Druckeinstellungen gespeichert",
    invalid: (vars: { field: string }) =>
      `„${vars.field}“ ist ungültig oder liegt außerhalb des üblichen Bereichs.`,
    rangeInvalid: (vars: { field: string }) =>
      `„${vars.field}“ liegt unter dem Wert „von“.`,
    hoursUnit: "h",
    enclosureRequired: "Braucht einen geschlossenen Bauraum",
    notesLabel: "Notizen (Markdown)",
    notesPlaceholder:
      "z. B. erste Schicht langsam, Klebestift auf Glas, im Slicer-Profil „PolyTerra“",
    short: {
      nozzle: "Düse",
      bed: "Bett",
      drying: "Trocknen",
      enclosure: "geschlossen",
      exposure: "Belichtung",
      bottom: "Boden",
      refresh: "Frisch",
    },
    fields: {
      nozzleMinC: "Düse von",
      nozzleMaxC: "Düse bis",
      bedMinC: "Bett von",
      bedMaxC: "Bett bis",
      chamberC: "Bauraum",
      fanPercent: "Lüfter",
      speedMaxMmS: "Höchstgeschwindigkeit",
      flowPercent: "Fluss",
      retractionHundredthsMm: "Rückzug",
      dryingC: "Trocknen bei",
      dryingMinutes: "Trocknen für",
      exposureMs: "Belichtung",
      bottomExposureMs: "Belichtung Bodenschichten",
      bottomLayers: "Bodenschichten",
      layerHeightUm: "Schichthöhe",
      postCureMinutes: "Nachhärten",
      refreshPercent: "Anteil frisches Pulver",
    },
    units: {
      nozzleMinC: "°C",
      nozzleMaxC: "°C",
      bedMinC: "°C",
      bedMaxC: "°C",
      chamberC: "°C",
      fanPercent: "%",
      speedMaxMmS: "mm/s",
      flowPercent: "%",
      retractionHundredthsMm: "mm",
      dryingC: "°C",
      dryingMinutes: "min",
      exposureMs: "s",
      bottomExposureMs: "s",
      bottomLayers: "Anzahl",
      layerHeightUm: "µm",
      postCureMinutes: "min",
      refreshPercent: "%",
    },
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
    texture: "Oberfläche",
    purchaseDate: "Kaufdatum",
    container: "Gebinde",
    fromCatalog: "Katalog",
    storageBox: "Drybox",
    tareSuffix: (vars: { amount: string }) => `(${vars.amount} Tara)`,
    consumedSince: (vars: { amount: string }) =>
      `seitdem ${vars.amount} abgebucht`,
    history: "Verlauf",
    newWeighing: "Neue Wägung",
    newConsumption: "Verbrauch abbuchen",
    colEntry: "Eintrag",
    colRemainingAfter: "Übrig danach",
    entryWeighing: "Wägung",
    entryConsumption: "Verbrauch",
    net: "netto",
    grossAt: (vars: { when: string; amount: string }) =>
      `${vars.when} · ${vars.amount} brutto`,
    remainingAfter: (vars: { amount: string }) => `${vars.amount} übrig danach`,
    noHistory: "Noch keine Wägungen oder Verbräuche erfasst.",
    // Seit 3.0: Verlaufskurve und Tendenz
    chartTitle: "Verlauf",
    trendPerWeek: (vars: { amount: string }) =>
      `Tendenz −${vars.amount} / Woche`,
    trendReach: (vars: { weeks: number }) =>
      `reicht so noch ≈ ${vars.weeks} Wochen`,
    trendLong: "reicht so noch über zwei Jahre",
    trendNone: "Tendenz: noch zu wenige Einträge",
    trendFlat: "Tendenz: kein Verbrauch im Zeitraum",
    purchasedOn: (vars: { date: string }) => `gekauft ${vars.date}`,
    fullHistory: "Ganzer Verlauf",
    deleteMaterial: "Gebinde löschen",
    deleteMaterialTitle: "Gebinde löschen?",
    deleteMaterialDescription: (vars: { name: string }) =>
      `Dieses Gebinde von „${vars.name}“ und alle zugehörigen Wägungen und Verbräuche werden endgültig gelöscht. War es das letzte Gebinde des Materials, verschwindet auch das Material.`,
    archive: "Aufgebraucht",
    unarchive: "Wieder in Gebrauch",
    archivedBadge: "Aufgebraucht",
    archivedDone: "Als aufgebraucht markiert",
    unarchivedDone: "Wieder in Gebrauch",
    archiveInstead: "Stattdessen als aufgebraucht markieren",
    deleteArchiveHint:
      "Ist die Rolle nur leer, markiere sie besser als aufgebraucht – dann bleiben Verlauf und Material erhalten.",
    materialDeleted: "Gebinde gelöscht",
    deleteWeighing: "Wägung löschen",
    deleteWeighingTitle: "Wägung löschen?",
    deleteWeighingDescription:
      "Die Restmenge wird danach aus der nächstälteren Wägung berechnet.",
    weighingDeleted: "Wägung gelöscht",
    deleteConsumption: "Verbrauch löschen",
    deleteConsumptionTitle: "Verbrauch löschen?",
    deleteConsumptionDescription:
      "Die Menge wird der Restmenge wieder gutgeschrieben.",
    consumptionDeleted: "Verbrauch gelöscht",
  },

  storageBoxes: {
    title: "Dryboxen",
    description:
      "Dryboxen und Aufbewahrungsboxen mit Leergewicht – beim Wiegen in der Box wird deren Tara automatisch abgezogen",
    newBox: "Neue Drybox",
    firstBox: "Erste Drybox anlegen",
    emptyTitle: "Noch keine Dryboxen angelegt",
    emptyDescription:
      "Wiege deine leere Drybox, trage das Leergewicht ein und weise sie einem Gebinde zu – die App rechnet die Box-Tara automatisch heraus.",
    tareSuffix: (vars: { amount: string }) => `${vars.amount} Tara`,
    assigned: (vars: { count: number }) =>
      vars.count === 1 ? "1 Gebinde" : `${vars.count} Gebinde`,
    free: "frei",
    location: "Standort",
    occupancy: "Belegung",
    editBox: "Drybox bearbeiten",
    deleteBox: "Drybox löschen",
    deleteTitle: "Drybox löschen?",
    deleteDescription: (vars: { name: string }) =>
      `„${vars.name}“ wird gelöscht. Sie darf aktuell keinem Gebinde zugewiesen sein.`,
    namePlaceholder: "z. B. Drybox 1",
    locationPlaceholder: "z. B. Regal links, Werkstatt",
    tareLabel: "Leergewicht (g) *",
    tarePlaceholder: "z. B. 850",
    created: "Drybox angelegt",
    saved: "Drybox gespeichert",
    deleted: "Drybox gelöscht",
  },

  containerTypes: {
    title: "Gebindearten",
    description:
      "Rollen, Beutel, Flaschen und Eimer mit hinterlegtem Leergewicht (Tara)",
    newType: "Neue Gebindeart",
    firstType: "Erste Gebindeart anlegen",
    tabOwn: "Meine Gebindearten",
    tabCatalog: "Preset-Katalog",
    tabProposals: "Meine Vorschläge",
    emptyTitle: "Noch keine Gebindeart angelegt",
    emptyDescription:
      "Lege z. B. „Kunststoffspule 1 kg (140 g)“, „Pappspule (55 g)“ oder „Harzflasche 250 g (60 g)“ an – das Leergewicht wird bei jeder Wägung automatisch abgezogen. Fertige Gebinde findest du im Preset-Katalog.",
    tareSuffix: (vars: { amount: string }) => `${vars.amount} Tara`,
    fromCatalog: "aus Katalog",
    proposeAsPreset: "Als Preset vorschlagen",
    deleteType: "Gebindeart löschen",
    editType: "Gebindeart bearbeiten",
    deleteTitle: "Gebindeart löschen?",
    deleteDescription: (vars: { name: string }) =>
      `„${vars.name}“ wird gelöscht. Gebinde dieser Art müssen vorher umgehängt werden.`,
    dialogDescription:
      "Name, Form und Leergewicht des leeren Gebindes. Das Leergewicht wird bei jeder Wägung abgezogen.",
    formLabel: "Form *",
    formHint:
      "Bestimmt nur, was im Materialformular zuerst vorgeschlagen wird – wählbar bleibt jedes Gebinde in jedem Lager.",
    namePlaceholder: "z. B. Kunststoffspule 1 kg",
    manufacturerPlaceholder: "z. B. eSun, Prusament",
    tareLabel: "Leergewicht (g) *",
    tarePlaceholder: "z. B. 140",
    calcTitle: "Leergewicht aus Wägung berechnen",
    calcDescription:
      "Neues (volles) Gebinde auf die Waage legen, Gesamtgewicht und Nenn-Füllmenge eintragen – das Leergewicht wird automatisch berechnet und unten übernommen.",
    calcGross: "Gewicht volles Gebinde (g)",
    calcGrossPlaceholder: "z. B. 1250",
    calcNominal: "Nenn-Füllmenge (g)",
    calcNominalPlaceholder: "z. B. 1000",
    calcResult: (vars: { amount: string }) => `Leergewicht: ${vars.amount}`,
    calcInvalid: "Das Gesamtgewicht muss größer als die Nenn-Füllmenge sein.",
    created: "Gebindeart angelegt",
    saved: "Gebindeart gespeichert",
    deleted: "Gebindeart gelöscht",
  },

  appearance: {
    title: "Farben & Oberflächen",
    description:
      "Wie Farbe und Oberfläche deiner Materialien in der Übersicht aussehen",
    hint: "Gängige Farben und Oberflächen kennt filahub bereits. Hier hinterlegst du, was in deinem Bestand darüber hinaus vorkommt – oder überschreibst, was mitgeliefert ist.",
    colorsTitle: "Eigene Farben",
    texturesTitle: "Eigene Oberflächen",
    newColor: "Neue Farbe",
    newTexture: "Neue Oberfläche",
    editColor: "Farbe bearbeiten",
    editTexture: "Oberfläche bearbeiten",
    deleteColor: "Farbe löschen",
    deleteTexture: "Oberfläche löschen",
    emptyColors: "Noch keine eigene Farbe hinterlegt",
    emptyTextures: "Noch keine eigene Oberfläche hinterlegt",
    nameLabel: "Name *",
    colorNamePlaceholder: "z. B. Signalrot",
    textureNamePlaceholder: "z. B. Sparkle",
    nameHint:
      "Genau so, wie die Farbe am Material steht – Groß- und Kleinschreibung sind egal.",
    hexLabel: "Farbcode *",
    kindLabel: "Muster *",
    kindHint: "Der Name ist frei, das Muster wird aus dieser Liste gezeichnet.",
    preview: "Vorschau",
    colorCreated: "Farbe hinterlegt",
    colorSaved: "Farbe gespeichert",
    colorDeleted: "Farbe gelöscht",
    textureCreated: "Oberfläche hinterlegt",
    textureSaved: "Oberfläche gespeichert",
    textureDeleted: "Oberfläche gelöscht",
    deleteColorTitle: "Farbe löschen?",
    deleteTextureTitle: "Oberfläche löschen?",
    deleteDescription: (vars: { name: string }) =>
      `„${vars.name}“ wird gelöscht. Deine Materialien behalten den Namen – nur die Darstellung fällt zurück.`,
    deleteUsage: (vars: { count: number }) =>
      vars.count === 1
        ? "1 Material trägt diesen Namen."
        : `${vars.count} Materialien tragen diesen Namen.`,
    nameRequired: "Bitte einen Namen angeben",
    invalidHex: "Bitte einen Farbcode wie #1a2b3c angeben",
    addColorFor: (vars: { name: string }) => `„${vars.name}“ hinterlegen`,
    unknownColor: "Für diese Farbe ist kein Farbcode hinterlegt",
    labelColor: (vars: { color: string }) => `Farbe ${vars.color}`,
    labelColorUnknown: "Keine Farbe angegeben",
    labelTexture: (vars: { texture: string }) => `Oberfläche ${vars.texture}`,
    labelNoColorCode: "kein Farbcode hinterlegt",
    kinds: {
      plain: "Ohne Muster",
      matte: "Matt",
      glossy: "Glänzend",
      silk: "Silk",
      metallic: "Metallic",
      carbon: "Carbon",
      transparent: "Transparent",
      glow: "Leuchtend",
      wood: "Holzoptik",
    },
  },

  materialForm: {
    createTitle: "Neues Material",
    editTitle: "Gebinde bearbeiten",
    createDescription:
      "Lege ein neues Material an. Die Bezeichnung wird automatisch aus Hersteller, Typ und Farbe vorgeschlagen.",
    editDescription:
      "Angaben zu diesem Gebinde und seinem Material anpassen. Die Restmenge wird aus den Wägungen berechnet.",
    materialTypeLabel: "Materialart *",
    materialTypePlaceholder: "z. B. PLA, PETG, ABS",
    manufacturerPlaceholder: "z. B. Prusament, eSun",
    colorPlaceholder: "z. B. Schwarz",
    textureLabel: "Oberfläche",
    texturePlaceholder: "z. B. Matt, Silk, Glänzend",
    identifier: "Kennung",
    identifierPlaceholder: "z. B. F01 – zum Beschriften & Suchen",
    identifierTaken: (vars: { identifier: string }) =>
      `„${vars.identifier}“ gibt es in diesem Lager schon – bitte eine andere Kennung wählen`,
    identifierTakenMeanwhile: (vars: { identifier: string }) =>
      `„${vars.identifier}“ wurde inzwischen vergeben – die nächste freie Kennung ist eingetragen. Bitte noch einmal speichern.`,
    identifierFromTemplate: (vars: { template: string }) =>
      `Nächste freie nach der Vorlage „${vars.template}“ – frei änderbar`,
    addGebindeTitle: "Weiteres Gebinde anlegen",
    addGebindeDescription:
      "Eine weitere Rolle, Flasche oder ein weiterer Beutel eines Materials, das du schon führst. Name, Materialart, Hersteller und Farbe kommen vom Material.",
    productLabel: "Material",
    productNew: "Neues Material anlegen",
    productGebindeCount: (vars: { count: number }) =>
      vars.count === 1 ? "1 Gebinde" : `${vars.count} Gebinde`,
    productSharedHint: (vars: { count: number }) =>
      `Name, Materialart, Hersteller, Farbe, Oberfläche und Dichte gehören dem Material – Änderungen gelten für alle ${vars.count} Gebinde.`,
    nameLabel: "Bezeichnung *",
    namePlaceholder: "Wird automatisch aus Hersteller + Typ + Farbe befüllt",
    priceLabel: (vars: { symbol: string }) => `Preis (${vars.symbol})`,
    pricePlaceholder: (vars: { example: string }) => `z. B. ${vars.example}`,
    purchaseDate: "Kaufdatum",
    nominalLabel: "Nennmenge (g) *",
    nominalPlaceholder: "z. B. 1000",
    lagerLabel: "Lager *",
    lagerHint: (vars: { kind: string; diameter: string | null }) =>
      vars.diameter ? `${vars.kind}, ${vars.diameter}` : vars.kind,
    lagerChangeHint:
      "Ein anderes Lager kann eine andere Stärke haben – die Umrechnung in Meter ändert sich dann mit.",
    container: "Gebinde",
    storageBox: "Drybox",
    chooseBox: "Drybox wählen",
    noBox: "Keine Box",
    noBoxesHint: "Noch keine Dryboxen angelegt – unter „Dryboxen“ hinzufügen.",
    initialLabel: (vars: { withBox: boolean }) =>
      `Erstwägung inkl. Gebinde${vars.withBox ? " + Box" : ""} (g, optional)`,
    initialPlaceholder: "Gemessenes Gesamtgewicht beim Kauf",
    tareBreakdown: (vars: {
      total: string;
      container: string;
      box: string | null;
    }) =>
      `Tara gesamt: ${vars.total} (Gebinde ${vars.container}${
        vars.box ? ` + Box ${vars.box}` : ""
      })`,
    notesPlaceholder: "Drucktemperatur, Besonderheiten …",
    created: "Material angelegt",
    gebindeCreated: "Gebinde angelegt",
    saved: "Gebinde gespeichert",
    nameRequired:
      "Bitte eine Bezeichnung angeben (oder Hersteller/Typ/Farbe ausfüllen)",
    typeRequired: "Bitte eine Materialart angeben",
    nominalRequired: "Bitte eine gültige Nennmenge in Gramm angeben",
    initialInvalid: "Bitte ein gültiges Anfangsgewicht angeben",
  },

  containerPicker: {
    choose: "Gebinde wählen",
    searchPlaceholder: "Hersteller, Serie oder Gewicht suchen …",
    searchAllPlaceholder: "Tippen, um im ganzen Katalog zu suchen …",
    manufacturerHint: (vars: { manufacturer: string }) =>
      `Gezeigt werden Gebinde von „${vars.manufacturer}“. Tippe, um im ganzen Katalog zu suchen.`,
    empty: "Kein passendes Gebinde gefunden.",
    none: "Keine / unbekannt",
    ownTypes: "Eigene Gebindearten",
    catalogMore: "Weitere aus dem Katalog",
    catalog: "Aus dem Katalog",
    nothingYet:
      "Noch keine Gebindeart angelegt – unter „Gebindearten“ hinzufügen oder ein Preset aus dem Katalog wählen.",
  },

  presetCatalog: {
    emptyTitle: "Der Preset-Katalog ist noch leer",
    emptyDescription:
      "Sobald Hersteller und Gebinde hinterlegt sind, kannst du sie hier auswählen – das Leergewicht wird dann automatisch übernommen.",
    intro:
      "Vorkonfigurierte Gebinde. Was du hier ausblendest, verschwindet aus deiner Auswahl beim Material – bereits zugewiesene Gebinde bleiben erhalten. Über „Übernehmen“ wird aus einem Preset eine eigene, frei bearbeitbare Gebindeart.",
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
    adopt: "Als eigene Gebindeart übernehmen",
    adopted: (vars: { name: string }) =>
      `„${vars.name}“ als eigene Gebindeart übernommen`,
    noVariants: "Für diese Ausführung ist noch keine Größe hinterlegt.",
  },

  proposePreset: {
    title: "Als Preset vorschlagen",
    description: (vars: { name: string; tare: string }) =>
      `„${vars.name}“ (${vars.tare} Tara)`,
    descriptionSuffix:
      "für alle vorschlagen. Ordne das Gebinde einem Hersteller, einer Serie und einer Ausführung zu – Übersetzungen sind freiwillig.",
    seriesInLanguage: (vars: { language: string }) =>
      `Serie (${vars.language}, optional)`,
    versionInLanguage: (vars: { language: string }) =>
      `Ausführung (${vars.language}, optional)`,
    manufacturerLabel: "Hersteller *",
    seriesLabel: "Serie / Produktlinie *",
    versionLabel: "Ausführung *",
    containerMaterialLabel: "Gebindematerial",
    nominalLabel: "Nenngewicht (g) *",
    materialTypeLabel: "Materialart",
    materialTypePlaceholder: "leer lassen, wenn die Serie für alle Arten gilt",
    commentLabel: "Anmerkung",
    commentPlaceholder: "Woher stammt das Leergewicht?",
    manufacturerRequired: "Bitte einen Hersteller angeben",
    seriesRequired: "Bitte eine Serie angeben",
    versionRequired: "Bitte eine Ausführung angeben",
    nominalInvalid: "Bitte ein gültiges Nenngewicht in Gramm angeben",
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
      "Angaben bei Bedarf korrigieren, fehlerhafte Positionen löschen. Pro Position und Stückzahl entsteht ein Gebinde; die Gebinde einer Position gehören zu einem Material.",
    targetLagerLabel: "Ziel-Lager",
    identifiersFromTemplate: (vars: { template: string; range: string }) =>
      `Kennungen nach der Vorlage „${vars.template}“: ${vars.range}`,
    targetLagerHint:
      "Alle Positionen landen in diesem Lager. Materialart und Filamentstärke kommen von dort.",
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
      `${vars.count} Gebinde importieren`,
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
    formLabel: "Gebindeform",
    containerMaterial: "Gebindematerial",
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
      `„${vars.label}“ wird endgültig entfernt. Einträge mit Untereinträgen oder mit Gebinden, die sie verwenden, lassen sich nicht löschen – deaktiviere sie in dem Fall stattdessen.`,
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
    rowContainerMaterial: "Gebindematerial",
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

  /*
    Sperre und Entsperr-Antrag. Der einzige Textbereich, den ausschließlich
    jemand liest, der gerade keinen Zugang hat – entsprechend nüchtern und ohne
    Vorwurf formuliert. Was er tun kann, steht vor dem, was er nicht kann.
  */
  blocked: {
    title: "Dein Konto ist gesperrt",
    description:
      "Ein Administrator dieser Instanz hat dein Konto gesperrt. Dein Bestand bleibt erhalten.",
    since: (vars: { date: string }) => `Gesperrt seit ${vars.date}`,
    reasonLabel: "Grund",
    reasons: {
      abuse: "Massenhaftes Anlegen von Daten",
      spam: "Unerwünschte Werbung oder Kontaktaufnahme",
      terms: "Verstoß gegen die Nutzungsbedingungen",
      automated: "Verdacht auf automatisierte Nutzung",
      other: "Sonstiger Grund",
    },
    rightsTitle: "Was dir weiterhin offensteht",
    rightsHint:
      "Deine Daten herunterladen und dein Konto löschen – eine Sperre ändert daran nichts.",
    requestTitle: "Aufhebung beantragen",
    requestHint:
      "Schildere kurz, worum es geht. Ein Administrator sieht deinen Antrag.",
    requestPlaceholder: "Worum geht es?",
    requestSubmit: "Antrag stellen",
    requestSent: "Antrag gestellt",
    requestPending: "Dein Antrag liegt zur Prüfung vor.",
    requestApproved: "Dein Antrag wurde angenommen. Bitte melde dich neu an.",
    requestRejected: "Dein Antrag wurde abgelehnt.",
    requestedAt: (vars: { date: string }) => `Gestellt am ${vars.date}`,
    noteLabel: "Begründung",
    signOut: "Abmelden",
  },

  adminUsers: {
    title: "Nutzer",
    description: "Konten dieser Instanz sperren und entsperren",
    searchPlaceholder: "Name oder Telegram-Benutzer",
    blockedCount: (vars: { count: number }) => `${vars.count} gesperrt`,
    empty: "Keine Konten gefunden",
    colName: "Name",
    colTelegram: "Telegram",
    colRole: "Rolle",
    colCreated: "Angelegt",
    colLastSignIn: "Zuletzt angemeldet",
    colState: "Zustand",
    stateActive: "Aktiv",
    stateBlocked: "Gesperrt",
    roleAdmin: "Administrator",
    roleUser: "Benutzer",
    block: "Sperren",
    unblock: "Entsperren",
    blockTitle: (vars: { name: string }) => `„${vars.name}“ sperren?`,
    blockDescription:
      "Das Konto erreicht danach nur noch seine Betroffenenrechte und den Entsperr-Antrag. Der Bestand bleibt erhalten, alle Sitzungen werden beendet.",
    blockReasonLabel: "Grund",
    blockConfirm: "Sperren",
    blocked: "Konto gesperrt",
    unblocked: "Sperre aufgehoben",
    requestsTitle: "Entsperr-Anträge",
    requestsEmpty: "Keine Anträge",
    requestStatus: {
      pending: "Offen",
      approved: "Angenommen",
      rejected: "Abgelehnt",
    },
    approve: "Annehmen",
    reject: "Ablehnen",
    rejectTitle: "Antrag ablehnen",
    rejectHint:
      "Die Begründung geht als Telegram-Nachricht an den Betroffenen.",
    rejectPlaceholder: "Begründung",
    reviewed: "Antrag bearbeitet",
    filterAll: "Alle",
  },

  adminAbuse: {
    title: "Missbrauch",
    description: "Abgewiesene Zugriffe, erreichte Grenzen und Sperren",
    alertsTitle: "Gerissene Schwellen",
    alertsNone: "Keine Schwelle gerissen",
    alertLine: (vars: {
      label: string;
      count: number;
      threshold: number;
      /** `null` bei einer Schwelle über den Bestand statt über einen Zeitraum */
      window: string | null;
    }) =>
      vars.window
        ? `${vars.label}: ${vars.count} in ${vars.window} (Schwelle ${vars.threshold})`
        : `${vars.label}: ${vars.count} (Schwelle ${vars.threshold})`,
    counts: {
      rateLimited: "Abgewiesene Zugriffe",
      quotaExceeded: "Erreichte Obergrenzen",
      registrationBlocked: "Abgewiesene Registrierungen",
      pendingUnblockRequests: "Offene Entsperr-Anträge",
    },
    bucketsTitle: "Zugriffsbegrenzung nach Prozedur (24 h)",
    quotasTitle: "Erreichte Obergrenzen (24 h)",
    registrationsTitle: "Neue Konten je Tag (14 Tage)",
    noisiestTitle: "Auffälligste Konten (7 Tage)",
    blockedUsers: "Gesperrte Konten",
    colBucket: "Prozedur",
    colQuota: "Obergrenze",
    colHits: "Treffer",
    colDay: "Tag",
    colCount: "Anzahl",
    colAccount: "Konto",
    empty: "Nichts aufgefallen",
    unknownAccount: "Unbekannt",
  },

  weighing: {
    title: "Gebinde wiegen",
    description: (vars: { name: string; withBox: boolean }) =>
      `Wiege „${vars.name}“ komplett – inklusive Gebinde${
        vars.withBox ? " und Drybox" : ""
      }. Das Leergewicht wird automatisch abgezogen.`,
    grossLabel: "Gemessenes Gesamtgewicht (g) *",
    grossPlaceholder: "z. B. 740",
    remaining: "Effektiv übrig",
    tareContainer: "Tara Gebinde",
    tareBox: "Tara Lagerbox",
    tareBoxNamed: (vars: { name: string }) => `Tara Lagerbox (${vars.name})`,
    tareTotal: "Tara gesamt",
    notePlaceholder: "z. B. nach Druck von Teil X",
    submit: "Wägung speichern",
    saved: "Wägung gespeichert",
    invalidWeight: "Bitte ein gültiges Gewicht in Gramm angeben",
  },

  consumption: {
    title: "Verbrauch abbuchen",
    description: (vars: { name: string }) =>
      `Trage ein, wie viel von „${vars.name}“ verbraucht wurde – zum Beispiel die Angabe des Slicers. Die Restmenge sinkt sofort, ohne Waage.`,
    weightLabel: "Verbrauchte Menge (g) *",
    weightPlaceholder: "z. B. 42",
    before: "Bisher übrig",
    after: "Danach übrig",
    exceeds:
      "Das ist mehr, als laut App noch übrig ist – die Restmenge wird auf 0 g gesetzt. Eine Wägung bringt Gewissheit.",
    notePlaceholder: "z. B. Gehäuse v2, laut Slicer",
    submit: "Verbrauch abbuchen",
    saved: "Verbrauch abgebucht",
    invalidWeight: "Bitte eine gültige Menge in Gramm angeben",
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
    containerMaterial: {
      kunststoff: "Kunststoff",
      karton: "Karton",
      metall: "Metall",
      sonstiges: "Sonstiges",
      glas: "Glas",
      folie: "Folie",
    },
    /* Gebindeformen. Reihenfolge wie in CONTAINER_FORMS. */
    containerForm: {
      rolle: "Rolle",
      beutel: "Beutel",
      flasche: "Flasche",
      eimer: "Eimer",
      kartusche: "Kartusche",
      sonstiges: "Sonstiges",
    },
    /** Überschrift der passenden Gruppe in der Gebindeauswahl */
    formFits: (vars: { kind: string }) => `Passend zu ${vars.kind}`,
    tareSuffix: (vars: { amount: string }) => `${vars.amount} Tara`,
    olderVersion: "ältere Ausführung",
    catalogBadge: "Katalog",
  },

  myProposals: {
    withdrawn: "Vorschlag zurückgezogen",
    emptyTitle: "Noch keine Vorschläge eingereicht",
    emptyDescription:
      "Über „Als Preset vorschlagen“ bei einer eigenen Gebindeart oder „Änderung vorschlagen“ im Katalog kannst du den gemeinsamen Katalog verbessern.",
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
    description: (vars: { container: string; size: string }) =>
      `${vars.container} · ${vars.size}. Deine Korrektur wird von einer Administratorin oder einem Administrator geprüft, bevor sie im Katalog landet.`,
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

  lager: {
    title: "Lager",
    description:
      "Trenne deinen Bestand nach Materialart – Filament, Pulver oder Harz. Je Lager gilt eine Art; beim Filament zusätzlich eine Stärke.",
    switchLabel: "Lager",
    switchAria: "Lager wechseln",
    newLager: "Neues Lager",
    firstLager: "Erstes Lager anlegen",
    emptyTitle: "Noch kein Lager angelegt",
    emptyDescription:
      "Ein Lager fasst zusammen, was zusammengehört. Lege eines für Filament an – Pulver und Harz bekommen ihre eigenen.",

    nameLabel: "Name *",
    namePlaceholder: "z. B. Filament 1,75 mm",
    kindLabel: "Materialart *",
    kindHint:
      "Bestimmt, welche Felder ein Material hat und wie gerechnet wird.",
    diameterLabel: "Filamentstärke *",
    diameterHint:
      "Gilt für alles in diesem Lager. Wer beide Stärken führt, legt zwei Lager an.",
    lowStockLabel: "Warnen unter (g, optional)",
    lowStockPlaceholder: (vars: { percent: number }) =>
      `leer = ${vars.percent} % der größten Rolle`,
    lowStockHint:
      "Ein Material gilt als knapp, wenn alle seine Gebinde zusammen – auch die in anderen Lagern – höchstens so viel enthalten. Liegt es in mehreren Lagern, gilt die höchste Schwelle.",
    lowStockBadge: (vars: { amount: string }) => `Warnen < ${vars.amount}`,
    lowStockInvalid: "Die Warnschwelle ist eine ganze Zahl in Gramm ab 0.",
    identifierTemplateLabel: "Kennungsvorlage (optional)",
    identifierTemplatePlaceholder: "z. B. ID: {n} oder F{nn}",
    identifierTemplateHint:
      "{n} wird zur nächsten freien Nummer, {nn} füllt auf zwei Stellen auf (F01). Neue Gebinde bekommen die Kennung vorab eingetragen.",
    identifierTemplateExample: (vars: { first: string; second: string }) =>
      `Wird zu ${vars.first}, ${vars.second} …`,
    identifierTemplateInvalid: "Genau einen Platzhalter {n} verwenden",

    kindFilament: "Filament",
    kindPowder: "Pulver",
    kindResin: "Harz",
    kindFilamentHint: "Rollen und Spulen; Restmenge zusätzlich in Metern.",
    kindPowderHint: "Sinter-Pulver in Beuteln oder Eimern; nur Gramm.",
    kindResinHint: "Flüssiges Kunstharz; Restmenge zusätzlich in Litern.",

    editLager: "Lager bearbeiten",
    deleteLager: "Lager löschen",
    deleteTitle: "Lager löschen?",
    deleteDescription: (vars: { name: string }) =>
      `„${vars.name}“ wird gelöscht. Es darf kein Gebinde mehr enthalten.`,
    created: "Lager angelegt",
    saved: "Lager gespeichert",
    deleted: "Lager gelöscht",

    materialCount: (vars: { count: number }) =>
      vars.count === 1 ? "1 Gebinde" : `${vars.count} Gebinde`,
    /*
      Nur die Anzahl, kein Name: Wer wem etwas freigibt, steht auf der
      Freundesseite. Hier zählt die Frage „geht dieses Lager überhaupt
      hinaus?“ – und die beantwortet eine Zahl.
    */
    sharedWith: (vars: { count: number }) =>
      vars.count === 1
        ? "mit 1 Freund geteilt"
        : `mit ${vars.count} Freunden geteilt`,
    limitReached: (vars: { max: number }) =>
      `Mehr als ${vars.max} Lager sind derzeit nicht möglich.`,
    noLagerTitle: "Kein Lager vorhanden",
    noLagerDescription:
      "Material braucht ein Lager. Lege zuerst eines an, dann kannst du einlagern.",

    // Zweitanzeige
    secondaryHint: (vars: { density: string }) =>
      `Gerechnet mit ${vars.density}. Trage am Material eine eigene Dichte ein, wenn du es genauer brauchst.`,
    densityLabel: "Dichte (g/l)",
    densityHint:
      "Nur für die Umrechnung in Meter bzw. Liter. Leer lassen übernimmt den Wert der Materialart.",
    approx: (vars: { value: string }) => `ca. ${vars.value}`,
  },

  friends: {
    title: "Freunde",
    description:
      "Material mit Freunden teilen – du entscheidest je Lager und je Freund, wie viel davon sichtbar ist. Voreingestellt ist nichts, und Geldbeträge gehen nie hinaus.",

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
    accept: "Annehmen",
    decline: "Ablehnen",
    accepted: "Anfrage angenommen",
    declined: "Anfrage abgelehnt",
    removeFriend: "Freundschaft auflösen",
    removeTitle: "Freundschaft auflösen?",
    removeDescription: (vars: { name: string }) =>
      `Du siehst danach kein Material von ${vars.name} mehr und ${vars.name} keines von dir. Laufende Ausleih-Anfragen verschwinden mit.`,
    removed: "Freundschaft aufgelöst",

    // Freigabe je Lager
    sharedByMe: "Du zeigst – je Lager",
    sharedWithMe: "Du siehst",
    theirChoice: "Entscheidung deines Freundes, über alle seine Lager",
    visibilityNone: "Nichts",
    visibilitySearch: "Nur in der Suche",
    visibilityFull: "Ganzes Lager",
    visibilitySearchHint:
      "Treffer erscheinen nur, wenn nach etwas Bestimmtem gesucht wird. Kein Blättern.",
    visibilityFullHint:
      "Das ganze Lager ist einsehbar – ohne Preise, Notizen, Kaufdaten, Lagerort und Wägungen.",
    visibilitySaved: "Freigabe gespeichert",
    sharesNothingHint:
      "Du gibst noch kein Lager frei – dieser Freund sieht nichts von dir. Wähle oben je Lager, was er sehen darf.",
    noLagerYet: "Du hast noch kein Lager, das du freigeben könntest.",
    toLager: "Lager anlegen",
    openInventory: "Lager ansehen",

    // Lager eines Freundes
    inventoryTitle: (vars: { name: string }) => `Lager von ${vars.name}`,
    inventoryDescription:
      "Material aus den Lagern, die dieser Freund dir ganz freigegeben hat. Preise, Notizen, Kaufdaten, Lagerort und Wägungen sind nicht enthalten.",
    inventoryEmpty: "Dieses Lager ist leer.",
    inventoryDenied:
      "Dieses Lager ist für dich nicht einsehbar. Vielleicht hat sich die Freigabe geändert.",

    // Suche
    searchTitle: "Bei Freunden gefunden",
    searchCount: (vars: { count: number }) =>
      vars.count === 1 ? "1 Treffer" : `${vars.count} Treffer`,
    ownerLabel: (vars: { name: string }) => `bei ${vars.name}`,
    ownerColumn: "Bei",
  },

  /**
   * Organisationen – gemeinsamer Bestand mehrerer Personen.
   *
   * Die Stufen heißen in der Oberfläche nach dem, was sie dürfen, nicht nach
   * ihrem technischen Namen: `viewer` ist „Ansehen“, `weigher` „Wiegen“. Wer
   * die Rolle vergibt, soll nicht überlegen müssen, was „viewer“ bedeutet.
   */
  organizations: {
    title: "Organisationen",
    description:
      "Gemeinsamer Bestand für Firmen, Hochschul-Hubs und Werkstätten. Wer dazugehört, arbeitet am selben Lager – abgestuft nach dem, was er darf.",

    // Umschalter
    scopeLabel: "Bereich",
    scopeAria: "Bereich wechseln",
    personal: "Privat",

    // Rollen
    roleViewer: "Ansehen",
    roleWeigher: "Wiegen",
    roleEditor: "Erfassen",
    roleAdmin: "Verwalten",
    roleViewerHint: "Bestand nachschlagen und suchen.",
    roleWeigherHint: "Zusätzlich wiegen, also Material abbuchen.",
    roleEditorHint:
      "Zusätzlich Material, Gebindearten und Dryboxen anlegen und ändern.",
    roleAdminHint:
      "Zusätzlich Lager anlegen, Mitglieder verwalten und Rollen vergeben.",

    // Liste
    emptyTitle: "Noch keine Organisation",
    emptyDescription:
      "Lege eine an, um Bestand mit anderen zu teilen – oder tritt einer mit einem Beitrittscode bei.",
    newOrganization: "Organisation anlegen",
    nameLabel: "Name *",
    namePlaceholder: "z. B. Makerspace der Hochschule",
    created: "Organisation angelegt",
    saved: "Gespeichert",
    deleted: "Organisation gelöscht",
    memberCount: (vars: { count: number }) =>
      vars.count === 1 ? "1 Mitglied" : `${vars.count} Mitglieder`,

    // Beitreten
    joinTitle: "Mit Code beitreten",
    joinHint:
      "Den Beitrittscode bekommst du von jemandem, der die Organisation verwaltet.",
    joinCodeLabel: "Beitrittscode",
    joinCodePlaceholder: "ORG-A2B3-C4D5",
    join: "Beitreten",
    joined: (vars: { name: string }) => `Du bist jetzt bei ${vars.name} dabei.`,

    // Einladungen
    invitationsTitle: "Einladungen",
    invitationFrom: (vars: { name: string; role: string }) =>
      `${vars.name} lädt dich als „${vars.role}“ ein.`,
    accept: "Annehmen",
    decline: "Ablehnen",
    invitationAccepted: "Einladung angenommen",
    invitationDeclined: "Einladung abgelehnt",

    // Mitglieder
    membersTitle: "Mitglieder",
    inviteTitle: "Person einladen",
    inviteHint:
      "Freundescode oder Telegram-Name. Wirksam wird die Einladung erst, wenn sie angenommen wird.",
    inviteRoleLabel: "Rolle",
    invite: "Einladen",
    invited: (vars: { name: string }) => `${vars.name} wurde eingeladen.`,
    inviteNotNotified:
      "Eingeladen – der Hinweis über Telegram kam allerdings nicht an.",

    // Offene Einladungen
    pendingInvitationsTitle: "Offene Einladungen",
    pendingInvitationsHint:
      "Noch nicht beantwortet. Eine Einladung gilt nur, solange die einladende Person die Organisation verwaltet.",
    revokeInvitation: "Einladung zurückziehen",
    invitationRevoked: "Einladung zurückgezogen",

    roleChanged: "Rolle geändert",
    removeMember: "Entfernen",
    removeMemberTitle: "Mitglied entfernen?",
    removeMemberDescription: (vars: { name: string }) =>
      `${vars.name} verliert damit sofort jeden Zugriff auf den Bestand dieser Organisation. Was ${vars.name} erfasst hat, bleibt.`,
    memberRemoved: "Mitglied entfernt",

    // Beitrittscode verwalten
    joinCodeTitle: "Offener Beitritt",
    joinCodeHint:
      "Wer den Code hat, tritt ohne weitere Bestätigung bei. Er lässt sich jederzeit abschalten oder neu erzeugen.",
    joinCodeOff: "Offener Beitritt ist aus.",
    joinRoleLabel: "Stufe beim Beitritt",
    joinRoleHint:
      "Die Verwaltungsstufe lässt sich so nicht vergeben – ein Code, der sie mitbrächte, wäre eine Übernahme.",
    enableJoinCode: "Code erzeugen",
    rotateJoinCode: "Neuen Code erzeugen",
    disableJoinCode: "Offenen Beitritt abschalten",
    copyJoinCode: "Code kopieren",
    joinCodeCopied: "Beitrittscode kopiert",

    // Verlassen und Löschen
    leave: "Organisation verlassen",
    leaveTitle: "Organisation verlassen?",
    leaveDescription:
      "Du verlierst damit den Zugriff auf ihren Bestand. Was du erfasst hast, bleibt bei der Organisation.",
    left: "Organisation verlassen",
    deleteOrganization: "Organisation löschen",
    deleteTitle: "Organisation löschen?",
    deleteDescription:
      "Das lässt sich nicht rückgängig machen. Möglich ist es nur, solange kein Lager mehr daran hängt.",

    // Stufen-Hinweise
    needEditor:
      "Dafür brauchst du in dieser Organisation mindestens die Stufe „Erfassen“.",
    needAdmin:
      "Dafür brauchst du in dieser Organisation die Stufe „Verwalten“.",
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
