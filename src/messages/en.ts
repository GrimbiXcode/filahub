import type { Messages } from "./de";

/**
 * English interface texts.
 *
 * Typed as `Messages`, so this file is a mirror of `de.ts`: a missing,
 * renamed or extra entry is a compile error rather than a blank label at
 * runtime. Keep the two files in the same order so they diff cleanly.
 */
export const en: Messages = {
  common: {
    save: "Save",
    saving: "Saving …",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    close: "Close",
    back: "Back",
    loading: "Loading …",
    search: "Search …",
    ctrlKey: "Ctrl",
    actions: "Actions",
    name: "Name",
    notes: "Notes",
    notesOptional: "Note (optional)",
    manufacturer: "Manufacturer",
    color: "Colour",
    price: "Price",
    date: "Date",
    weight: "Weight",
    tare: "Empty weight",
    none: "–",
    optional: "optional",
    required: "required",
    yes: "Yes",
    no: "No",
    all: "All",
    apply: "Use this",
    create: "Create",
    add: "Add",
    nothingFound: "Nothing found.",
    unknownError: "Unknown error",
    nameRequired: "Please enter a name",
    invalidTare: "Please enter a valid empty weight in grams",
    nameRequiredLabel: "Name *",
    dateNotRecognized: (vars: { value: string }) =>
      `Could not read “${vars.value}” as a date`,
  },

  nav: {
    overview: "Materials",
    import: "Import",
    containerTypes: "Container types",
    storageBoxes: "Dryboxes",
    appearance: "Colours & finishes",
    lager: "Stores",
    friends: "Friends",
    friendsPending: (vars: { count: number }) =>
      `Friends (${vars.count} pending)`,
    organizations: "Organizations",
    organizationsPending: (vars: { count: number }) =>
      `Organizations (${vars.count} invitations)`,
    administration: "Administration",
    presetCatalog: "Preset catalogue",
    proposals: "Suggestions",
    system: "System",
    releaseNotes: "What's new",
    settings: "Settings",
    material: "Material",
    weigh: "Weigh",
    weighMaterial: "Weigh material",
    searchWithShortcut: (vars: { shortcut: string }) =>
      `Search (${vars.shortcut})`,
    releaseNotesUnread: (vars: { count: number }) =>
      `What's new (${vars.count} unread)`,
    toggleSidebar: "Show or hide the navigation",
    signOut: "Sign out",
  },

  theme: {
    label: "Colour scheme",
    current: (vars: { theme: string }) => `Colour scheme: ${vars.theme}`,
    light: "Light",
    dark: "Dark",
    system: "System",
    active: "active",
  },

  login: {
    intro:
      "Sign in with your Telegram account. Telegram confirms your identity – by phone number too, if you want.",
    notConfigured:
      "The Telegram login is not configured yet. Please set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME on the server.",
    widgetNotice:
      "The Telegram sign-in button is loaded from telegram.org. Telegram learns your IP address and details about your device in the process – even if you never sign in. Telegram is based in the United Arab Emirates, for which no adequacy decision exists.",
    widgetLoad: "Load Telegram sign-in",
    widgetAlternative:
      "Not required: the code sign-in below works without any Telegram script.",
    orWithCode: "or use a code",
    codeFromBot: "Code from the bot",
    codeRequestHint: (vars: { command: string }) =>
      `(request it with ${vars.command})`,
    codePlaceholder: "6-digit code",
    signInWithCode: "Sign in with code",
    signingIn: "Signing in …",
    development: "Development",
    signInWithoutTelegram: "Sign in without Telegram",
  },

  legal: {
    privacy: "Privacy",
    imprint: "Imprint",
    terms: "Terms of use",
    backToApp: "Back to the app",
    missing: "This text is not available yet.",
    operatorMissing:
      "No operator details are configured for this instance. Whoever runs it is the data controller and needs to set LEGAL_OPERATOR_NAME, LEGAL_OPERATOR_ADDRESS and LEGAL_OPERATOR_EMAIL.",
  },

  authGate: {
    title: "Please sign in",
    description: "You need to sign in to reach your inventory.",
    action: "Sign in",
  },

  adminGate: {
    title: "No access",
    description: "This area is reserved for administrators.",
  },

  quick: {
    weighTitle: "Weigh material",
    weighDescription: "Pick the material you want to weigh",
    searchTitle: "Quick search",
    searchDescription: "Find materials, open pages and run actions",
    weighPlaceholder: "Identifier or name of the material …",
    searchPlaceholder: "Search: identifier, material, page or action …",
    groupWeigh: "Material to weigh",
    groupActions: "Actions",
    groupJumpTo: "Jump to",
    groupMaterials: "Materials",
    newMaterial: "Add a material",
    remaining: (vars: { amount: string }) => `${vars.amount} left`,
    keywordsWeigh: "weigh weighing scale material",
    keywordsNewMaterial: "new material add filament create",
    keywordsGoTo: (vars: { label: string }) => `go to ${vars.label}`,
    keywordsAdmin: (vars: { label: string }) => `administration ${vars.label}`,
    keywordsThemeLight: "colour scheme light",
    keywordsThemeDark: "colour scheme dark night mode",
    keywordsThemeSystem: "colour scheme system automatic",
  },

  settings: {
    title: "Settings",
    description: "Language, appearance, currency and number formats",
    saved: "Setting saved",
    appearance: "Appearance",
    appearanceHint:
      "“System” follows your device. The colour scheme is stored locally and therefore applies per device – your phone can stay dark while your desktop stays light.",
    language: "Language",
    languageLabel: "Interface language",
    languageHint:
      "Belongs to your account rather than this device, so it follows you from your phone to your desktop. Number and date formats are a separate setting below.",
    currency: "Currency",
    currencyLabel: "Display currency",
    currencyHint:
      "Existing prices are not converted – only the currency they are shown in changes.",
    regionalFormat: "Regional format",
    regionalFormatLabel: "Number and date format",
    automatic: (vars: { value: string }) =>
      `Automatic (browser: ${vars.value})`,
    install: "Quick access",
    installButton: "Add to home screen",
    installHint:
      "Puts filahub on your home screen or in the dock as an app of its own – with its own icon and no address bar. Nothing is downloaded; it stays the same website.",
    installAlready: "filahub is already running as an installed app.",
    installDialogDescription:
      "Getting there is the browser's job, not the page's – a button here cannot shortcut it. For your browser:",
    installHowIos:
      "Tap “Share” in the bar at the bottom (the square with an arrow), scroll down the menu and pick “Add to Home Screen”.",
    installHowAndroid:
      "Open the browser menu (three dots, top right) and pick “Install app” or “Add to home screen”.",
    installHowChromium:
      "Click the install icon at the right of the address bar (a screen with an arrow). If it is not there, look in the browser menu (three dots) under “Cast, save and share”.",
    installHowSafari:
      "Choose “File” in the menu bar, then “Add to Dock”. This needs macOS Sonoma or later.",
    installHowFirefox:
      "Firefox on the desktop cannot install websites as apps. Bookmark filahub instead – or open it in Chrome, Edge or Safari if you want an icon of its own.",
    installHowUnknown:
      "Look for “Install app”, “Add to home screen” or “Add to dock” in your browser's menu. What the entry is called is up to the browser.",
    dataAndAccount: "Data and account",
    exportHint:
      "Download everything stored for your account: profile, stores, materials, weigh-ins, container types, dryboxes, friendships, loan requests, hidden presets, submitted suggestions, pending login codes and the security log. A JSON file to read and keep — the importer on the import page expects a different, shorter format.",
    exportAction: "Download my data",
    exportPending: "Collecting …",
    exportDone: "Export downloaded",
    logoutAllHint:
      "Ends your sessions on every device, including this one. Useful if a device went missing or you signed in somewhere you should not have.",
    logoutAllAction: "Sign out everywhere",
    deleteHint:
      "Permanently deletes your account and your entire stock. Proposals that made it into the shared catalogue stay there – without your name and without your reasoning.",
    deleteAction: "Delete account",
    deleteTitle: "Delete your account for good?",
    deleteDescription:
      "This cannot be undone. Download your data first if you want to keep it.",
    deleteConfirmLabel: (vars: { name: string }) =>
      `Type “${vars.name}” to confirm`,
    deleteConfirmAction: "Delete permanently",
    deletePending: "Deleting …",
  },

  releaseNotes: {
    title: "What's new",
    description: "What has changed in filahub",
    unreadOne: "One entry is new to you",
    unreadMany: (vars: { count: number }) =>
      `${vars.count} entries are new to you`,
    new: "New",
    empty: "No entries yet.",
    version: (vars: { version: string }) =>
      `You are running version ${vars.version}.`,
    license: "filahub is free software under the",
    sourceIntro: "; the",
    source: "source code",
    sourceOutro: "is public.",
  },

  errorBoundary: {
    title: "Something went wrong",
    description:
      "An error occurred while rendering this page. Please reload it – and let me know if the problem sticks around.",
    action: "Back to the overview",
  },

  notFound: {
    description: "This page does not exist (any more).",
    action: "Back to the materials",
  },

  autocomplete: {
    showSuggestions: "Show suggestions",
    newEntry: "New entry – it will show up in the list next time",
  },

  home: {
    title: "Materials",
    description: "Your 3D-printing material inventory at a glance",
    newMaterial: "New material",
    lookupPlaceholder: "Enter an identifier, e.g. F01",
    lookupAria: "Identifier for quick access",
    lookupNotFound: (vars: { query: string }) =>
      `No material found for “${vars.query}”`,
    lookupAmbiguous: (vars: { query: string }) =>
      `Several matches for “${vars.query}” – please enter the exact identifier`,
    statMaterials: "Materials",
    statMaterialsLow: (vars: { count: number }) => `${vars.count} running low`,
    statMaterialsOk: "all sufficiently filled",
    statRemaining: "Remaining",
    statRemainingHint: "actually available (tare excluded)",
    statValue: "Remaining value",
    statValueHint: "pro rata by remaining quantity",
    statInBox: "In a drybox",
    statInBoxHint: "materials in a drybox",
    searchAria: "Search materials",
    clearSearch: "Clear the search",
    filters: "Filters",
    filterSheetTitle: "Filters and sorting",
    reset: "Reset",
    resetAll: "Reset all",
    resetFilters: "Reset filters",
    showCount: (vars: { count: number }) => `Show ${vars.count}`,
    removeFilter: (vars: { label: string }) =>
      `Remove the “${vars.label}” filter`,
    filterSearch: (vars: { query: string }) => `Search: “${vars.query}”`,
    filterLowStock: (vars: { percent: number }) => `≤ ${vars.percent} % left`,
    materialType: "Material type",
    allMaterialTypes: "All material types",
    texture: "Finish",
    allTextures: "All finishes",
    allManufacturers: "All manufacturers",
    storageBox: "Drybox",
    allBoxes: "All boxes",
    noBox: "No box",
    sorting: "Sort by",
    sortAsc: "Sorted ascending",
    sortDesc: "Sorted descending",
    onlyLowStock: (vars: { percent: number }) =>
      `Running low only (≤ ${vars.percent} %)`,
    sortIdentifier: "Identifier",
    sortName: "Name",
    sortPercent: "Fill level",
    sortRemaining: "Remaining",
    sortPurchase: "Purchase date",
    emptyTitle: "No materials in the inventory yet",
    emptyFiltered: "Nothing matches the current filters",
    emptyHint:
      "Add your first material – with its container, weight and price.",
    emptyFilteredHint: "Adjust the search or the filters.",
    emptyAction: "Add your first material",
    countOf: (vars: { shown: number; total: number }) =>
      `${vars.shown} of ${vars.total} materials`,
    colIdentifier: "Identifier",
    colAppearance: "Look",
    colMaterial: "Material",
    colType: "Type",
    colManufacturer: "Manufacturer",
    colRemaining: "Remaining",
    colContainerBox: "Container / box",
    colPrice: "Price",
    colPurchase: "Purchased",
    colActions: "Actions",
    columns: "Columns",
    columnsTitle: "Visible columns",
    columnsHint: "Applies on all your devices",
    columnsReset: "Restore defaults",
    remaining: (vars: { amount: string }) => `${vars.amount} left`,
    sortBy: (vars: { label: string }) => `Sort by ${vars.label}`,
  },

  materialDetail: {
    notFound: "Material not found",
    toOverview: "Back to the overview",
    fillLevel: "Fill level",
    ofNominal: (vars: { amount: string }) => `of ${vars.amount} nominal`,
    consumed: "Consumed",
    tareTotal: "Total tare",
    lastWeighing: "Last weigh-in",
    lastWeighingGross: (vars: { amount: string }) => `${vars.amount} gross`,
    noWeighingYet: "none yet",
    remainingValue: "Remaining value",
    masterData: "Details",
    identifier: "Identifier",
    materialType: "Material type",
    texture: "Finish",
    purchaseDate: "Purchased",
    container: "Container",
    fromCatalog: "Catalogue",
    storageBox: "Drybox",
    tareSuffix: (vars: { amount: string }) => `(${vars.amount} tare)`,
    history: "Weighing history",
    newWeighing: "New weigh-in",
    colGross: "Gross",
    colNet: "Net",
    colNote: "Note",
    net: "net",
    grossAt: (vars: { when: string; amount: string }) =>
      `${vars.when} · ${vars.amount} gross`,
    noWeighings: "No weigh-ins recorded yet.",
    deleteMaterial: "Delete material",
    deleteMaterialTitle: "Delete this material?",
    deleteMaterialDescription: (vars: { name: string }) =>
      `“${vars.name}” and every weigh-in that belongs to it will be deleted for good.`,
    materialDeleted: "Material deleted",
    deleteWeighing: "Delete weigh-in",
    deleteWeighingTitle: "Delete this weigh-in?",
    deleteWeighingDescription:
      "The remaining quantity will then be derived from the next older weigh-in.",
    weighingDeleted: "Weigh-in deleted",
  },

  storageBoxes: {
    title: "Dryboxes",
    description:
      "Dryboxes and storage boxes with their empty weight – weighing a container inside one subtracts its tare automatically",
    newBox: "New drybox",
    firstBox: "Add your first drybox",
    emptyTitle: "No dryboxes yet",
    emptyDescription:
      "Weigh your empty drybox, enter the empty weight and assign it to a material – filahub takes the box tare out of the result for you.",
    tareSuffix: (vars: { amount: string }) => `${vars.amount} tare`,
    assigned: (vars: { count: number }) =>
      vars.count === 1 ? "1 material" : `${vars.count} materials`,
    free: "free",
    location: "Location",
    occupancy: "In use",
    editBox: "Edit drybox",
    deleteBox: "Delete drybox",
    deleteTitle: "Delete this drybox?",
    deleteDescription: (vars: { name: string }) =>
      `“${vars.name}” will be deleted. It must not be assigned to any material.`,
    namePlaceholder: "e.g. Drybox 1",
    locationPlaceholder: "e.g. left shelf, workshop",
    tareLabel: "Empty weight (g) *",
    tarePlaceholder: "e.g. 850",
    created: "Drybox created",
    saved: "Drybox saved",
    deleted: "Drybox deleted",
  },

  containerTypes: {
    title: "Container types",
    description:
      "Spools, bags, bottles and pails with a stored empty weight (tare)",
    newType: "New container type",
    firstType: "Add your first container type",
    tabOwn: "My container types",
    tabCatalog: "Preset catalogue",
    tabProposals: "My suggestions",
    emptyTitle: "No container types yet",
    emptyDescription:
      "Add something like “plastic spool 1 kg (140 g)”, “cardboard spool (55 g)” or “resin bottle 250 g (60 g)” – the empty weight is subtracted from every weigh-in. Ready-made containers are in the preset catalogue.",
    tareSuffix: (vars: { amount: string }) => `${vars.amount} tare`,
    fromCatalog: "from the catalogue",
    proposeAsPreset: "Suggest as a preset",
    deleteType: "Delete container type",
    editType: "Edit container type",
    deleteTitle: "Delete this container type?",
    deleteDescription: (vars: { name: string }) =>
      `“${vars.name}” will be deleted. Materials using it have to be moved to another type first.`,
    dialogDescription:
      "Name, form and empty weight of the container. The empty weight is subtracted from every weigh-in.",
    formLabel: "Form *",
    formHint:
      "Only decides what gets suggested first in the material form – every container stays selectable in every store.",
    namePlaceholder: "e.g. plastic spool 1 kg",
    manufacturerPlaceholder: "e.g. eSun, Prusament",
    tareLabel: "Empty weight (g) *",
    tarePlaceholder: "e.g. 140",
    calcTitle: "Work out the empty weight from a weigh-in",
    calcDescription:
      "Put a full container on the scale, enter the total weight and the nominal fill – the empty weight is calculated and filled in below.",
    calcGross: "Weight of the full container (g)",
    calcGrossPlaceholder: "e.g. 1250",
    calcNominal: "Nominal fill (g)",
    calcNominalPlaceholder: "e.g. 1000",
    calcResult: (vars: { amount: string }) => `Empty weight: ${vars.amount}`,
    calcInvalid: "The total weight has to be larger than the nominal fill.",
    created: "Container type created",
    saved: "Container type saved",
    deleted: "Container type deleted",
  },

  appearance: {
    title: "Colours & finishes",
    description:
      "How the colour and finish of your materials look in the overview",
    hint: "filahub already knows the common colours and finishes. Add whatever else turns up in your stock here \u2013 or override what ships with the app.",
    colorsTitle: "Your colours",
    texturesTitle: "Your finishes",
    newColor: "New colour",
    newTexture: "New finish",
    editColor: "Edit colour",
    editTexture: "Edit finish",
    deleteColor: "Delete colour",
    deleteTexture: "Delete finish",
    emptyColors: "No colour of your own yet",
    emptyTextures: "No finish of your own yet",
    nameLabel: "Name *",
    colorNamePlaceholder: "e.g. signal red",
    textureNamePlaceholder: "e.g. sparkle",
    nameHint:
      "Exactly as the colour reads on the material \u2013 upper and lower case do not matter.",
    hexLabel: "Colour code *",
    kindLabel: "Pattern *",
    kindHint: "The name is yours, the pattern is drawn from this list.",
    preview: "Preview",
    colorCreated: "Colour added",
    colorSaved: "Colour saved",
    colorDeleted: "Colour deleted",
    textureCreated: "Finish added",
    textureSaved: "Finish saved",
    textureDeleted: "Finish deleted",
    deleteColorTitle: "Delete colour?",
    deleteTextureTitle: "Delete finish?",
    deleteDescription: (vars: { name: string }) =>
      `\u201c${vars.name}\u201d will be deleted. Your materials keep the name \u2013 only the rendering falls back.`,
    deleteUsage: (vars: { count: number }) =>
      vars.count === 1
        ? "1 material carries this name."
        : `${vars.count} materials carry this name.`,
    nameRequired: "Please enter a name",
    invalidHex: "Please enter a colour code such as #1a2b3c",
    addColorFor: (vars: { name: string }) => `Add \u201c${vars.name}\u201d`,
    unknownColor: "No colour code stored for this colour",
    labelColor: (vars: { color: string }) => `Colour ${vars.color}`,
    labelColorUnknown: "No colour given",
    labelTexture: (vars: { texture: string }) => `Finish ${vars.texture}`,
    labelNoColorCode: "no colour code stored",
    kinds: {
      plain: "No pattern",
      matte: "Matte",
      glossy: "Glossy",
      silk: "Silk",
      metallic: "Metallic",
      carbon: "Carbon",
      transparent: "Transparent",
      glow: "Glow in the dark",
      wood: "Wood look",
    },
  },

  materialForm: {
    createTitle: "New material",
    editTitle: "Edit material",
    createDescription:
      "Add a new material. The name is suggested from manufacturer, type and colour.",
    editDescription:
      "Adjust the material's properties. The remaining quantity comes from the weigh-ins.",
    materialTypeLabel: "Material type *",
    textureLabel: "Finish",
    texturePlaceholder: "e.g. matte, silk, glossy",
    identifier: "Identifier",
    nameLabel: "Name *",
    namePlaceholder: "Filled in from manufacturer + type + colour",
    priceLabel: (vars: { symbol: string }) => `Price (${vars.symbol})`,
    pricePlaceholder: (vars: { example: string }) => `e.g. ${vars.example}`,
    purchaseDate: "Purchase date",
    nominalLabel: "Nominal quantity (g) *",
    nominalPlaceholder: "e.g. 1000",
    lagerLabel: "Store *",
    lagerHint: (vars: { kind: string; diameter: string | null }) =>
      vars.diameter ? `${vars.kind}, ${vars.diameter}` : vars.kind,
    lagerChangeHint:
      "A different store may use a different diameter – the conversion to metres changes with it.",
    container: "Container",
    storageBox: "Drybox",
    chooseBox: "Pick a drybox",
    noBox: "No box",
    noBoxesHint: "No dryboxes yet – add one under “Dryboxes”.",
    initialLabel: (vars: { withBox: boolean }) =>
      `First weigh-in incl. container${vars.withBox ? " + box" : ""} (g, optional)`,
    initialPlaceholder: "Total weight measured at purchase",
    tareBreakdown: (vars: {
      total: string;
      container: string;
      box: string | null;
    }) =>
      `Total tare: ${vars.total} (container ${vars.container}${
        vars.box ? ` + box ${vars.box}` : ""
      })`,
    notesPlaceholder: "Printing temperature, quirks …",
    created: "Material created",
    saved: "Material saved",
    nameRequired:
      "Please enter a name (or fill in manufacturer / type / colour)",
    typeRequired: "Please enter a material type",
    nominalRequired: "Please enter a valid nominal quantity in grams",
    initialInvalid: "Please enter a valid initial weight",
  },

  containerPicker: {
    choose: "Pick a container",
    searchPlaceholder: "Search manufacturer, series or weight …",
    searchAllPlaceholder: "Type to search the whole catalogue …",
    manufacturerHint: (vars: { manufacturer: string }) =>
      `Showing containers from “${vars.manufacturer}”. Type to search the whole catalogue.`,
    empty: "No matching container found.",
    none: "None / unknown",
    ownTypes: "My container types",
    catalogMore: "More from the catalogue",
    catalog: "From the catalogue",
    nothingYet:
      "No container types yet – add one under “Container types” or pick a preset from the catalogue.",
  },

  presetCatalog: {
    emptyTitle: "The preset catalogue is still empty",
    emptyDescription:
      "Once manufacturers and containers are in it, you can pick them here – the empty weight then comes across automatically.",
    intro:
      "Ready-made containers. Whatever you hide here disappears from your picker – containers already assigned to a material stay valid. “Use this” turns a preset into your own, freely editable container type.",
    show: "Show again",
    hide: "Hide for me",
    hidden: "hidden",
    showAria: (vars: { label: string }) => `Show ${vars.label}`,
    hideAria: (vars: { label: string }) => `Hide ${vars.label}`,
    seriesCount: (vars: { count: number }) =>
      vars.count === 1 ? "1 series" : `${vars.count} series`,
    allMaterialTypes: "all material types",
    olderVersion: "older version",
    validFrom: (vars: { date: string }) => `from ${vars.date}`,
    validTo: (vars: { date: string }) => `until ${vars.date}`,
    nominalWeight: "Nominal weight",
    dimensions: "Dimensions (Ø × width × bore)",
    adopt: "Copy into my container types",
    adopted: (vars: { name: string }) =>
      `“${vars.name}” copied into your own container types`,
    noVariants: "No size added for this version yet.",
  },

  proposePreset: {
    title: "Suggest as a preset",
    description: (vars: { name: string; tare: string }) =>
      `“${vars.name}” (${vars.tare} tare)`,
    descriptionSuffix:
      "suggested for everyone. Place the container under a manufacturer, a series and a version – translations are optional.",
    seriesInLanguage: (vars: { language: string }) =>
      `Series (${vars.language}, optional)`,
    versionInLanguage: (vars: { language: string }) =>
      `Version (${vars.language}, optional)`,
    manufacturerLabel: "Manufacturer *",
    seriesLabel: "Series / product line *",
    versionLabel: "Version *",
    containerMaterialLabel: "Container material",
    nominalLabel: "Nominal weight (g) *",
    materialTypeLabel: "Material type",
    materialTypePlaceholder: "leave empty if the series covers every type",
    commentLabel: "Note",
    commentPlaceholder: "Where does the empty weight come from?",
    manufacturerRequired: "Please enter a manufacturer",
    seriesRequired: "Please enter a series",
    versionRequired: "Please enter a version",
    nominalInvalid: "Please enter a valid nominal weight in grams",
  },

  import: {
    title: "Bulk import",
    description:
      "Turn an order list into JSON with an LLM and add every line to the inventory at once.",
    step1: "1. Copy the prompt",
    step1Description:
      "Send this prompt to an LLM of your choice, together with your order list (invoice, order confirmation …).",
    copyPrompt: "Copy the prompt",
    showPrompt: "Show the prompt",
    hidePrompt: "Hide the prompt",
    privacyWarning:
      "Think about what the document you send along contains: invoices usually carry your name, address and payment details. That data goes to the language model's provider, not to filahub – redact whatever it does not need.",
    promptCopied: "Prompt copied to the clipboard",
    copyFailed: "Copying failed – please select it manually",
    step2: "2. Paste the JSON",
    step2Description:
      "Paste the LLM's answer here, or upload it as a file (.json, .txt).",
    check: "Check it",
    uploadFile: "Upload a file",
    invalidJson: "That is not valid JSON. Please check the LLM's output.",
    step3: "3. Review and import",
    step3Description:
      "Correct anything that is off and delete broken lines. One material is created per line and per unit.",
    targetLagerLabel: "Target store",
    targetLagerHint:
      "Every position lands in this store. Material kind and filament diameter come from it.",
    purchaseDateLabel: "Purchase date (optional)",
    noPositions: "No lines left.",
    position: (vars: { index: number }) => `Line ${vars.index}`,
    deletePosition: (vars: { index: number }) => `Delete line ${vars.index}`,
    positionError: (vars: { index: number; errors: string }) =>
      `Line ${vars.index}: ${vars.errors}`,
    typeLabel: "Type *",
    nominalLabel: "Nominal weight (g)",
    priceLabel: (vars: { symbol: string }) => `Price (${vars.symbol})`,
    pricePlaceholder: "e.g. 29.99",
    countLabel: "Quantity",
    importing: "Importing …",
    importCount: (vars: { count: number }) => `Import ${vars.count} materials`,
    fixErrors: "Please fix the highlighted errors first.",
    errTypeMissing: "type missing",
    errNominal: "invalid nominal weight",
    errCount: "invalid quantity",
    errPrice: "invalid price",
  },

  catalogEditor: {
    createManufacturer: "New manufacturer",
    editManufacturer: "Edit manufacturer",
    createSeries: "New series",
    editSeries: "Edit series",
    createVersion: "New version",
    editVersion: "Edit version",
    createVariant: "New size",
    editVariant: "Edit size",
    description:
      "Changes take effect for everyone straight away. Edited entries are no longer overwritten by the automatic starter catalogue.",
    manufacturerPlaceholder: "e.g. Polymaker",
    seriesPlaceholder: "e.g. PolyTerra PLA",
    versionPlaceholder: "e.g. cardboard container (from 2023)",
    nameInLanguage: (vars: { language: string }) => `Name (${vars.language})`,
    translationHint: "Leave empty to use the base name",
    sameAsBase: "Same as base",
    sameAsBaseTitle:
      "Copy the base name – for proper nouns like “PolyTerra PLA” that read the same in every language",
    translationNote:
      "Without a translation the base name is shown. Manufacturers are not translated – a brand reads the same in every language.",
    website: "Website",
    materialTypes: "Material types",
    materialTypesPlaceholder: "e.g. PLA, PETG – empty = applies to all",
    formLabel: "Container form",
    containerMaterial: "Container material",
    unknown: "Unknown",
    validFrom: "Valid from",
    validTo: "Valid until",
    validHint: "Without a “valid until” the version counts as currently sold.",
    nominalLabel: "Nominal weight (g) *",
    tareLabel: "Empty weight (g) *",
    tarePlaceholder: "e.g. 140",
    outerDiameter: "Outer Ø (mm)",
    width: "Width (mm)",
    bore: "Bore (mm)",
    active: "Active (selectable for everyone)",
    savedManufacturerNew: "Manufacturer created",
    savedManufacturer: "Manufacturer saved",
    savedSeriesNew: "Series created",
    savedSeries: "Series saved",
    savedVersionNew: "Version created",
    savedVersion: "Version saved",
    savedVariantNew: "Size created",
    savedVariant: "Size saved",
    validRangeInvalid: "“Valid from” has to come before “valid until”",
    nominalInvalid: "Please enter a valid nominal weight in grams",
    dimensionsInvalid: "Please enter valid dimensions in millimetres",
  },

  adminPresets: {
    title: "Preset catalogue",
    description:
      "Maintain manufacturers, series, versions and sizes for everyone",
    newManufacturer: "New manufacturer",
    newSeries: "New series",
    emptyTitle: "No presets in the catalogue yet",
    emptyDescription:
      "Add a manufacturer, then a series below it, then a version, and finally the sizes with their empty weight.",
    nominalWeight: "Nominal weight",
    dimensions: "Ø × width × bore",
    origin: "Origin",
    disabled: "disabled",
    discontinued: "discontinued",
    addSize: "Size",
    addVersion: "Version",
    noVariants: "No size added yet.",
    missingTranslation: (vars: { language: string }) =>
      `${vars.language} missing`,
    missingTranslationTitle: (vars: { language: string }) =>
      `No ${vars.language} translation yet`,
    onlyMissing: "Untranslated only",
    allTranslated: "Every entry is translated.",
    deleted: "Entry deleted",
    deleteTitle: "Delete this entry?",
    deleteDescription: (vars: { label: string }) =>
      `“${vars.label}” will be removed for good. Entries that have sub-entries, or that materials still use, cannot be deleted – deactivate them instead.`,
  },

  adminProposals: {
    title: "Suggestions",
    description: "Review community suggestions for the preset catalogue",
    allProposals: "All suggestions",
    emptyTitle: "No suggestions in this view",
    submitted: "Submitted",
    from: "From",
    kind: "Kind",
    reason: "Reason",
    kindNew: "New entry",
    approve: "Accept",
    approving: "Accepting …",
    reject: "Reject",
    rejecting: "Rejecting …",
    approved: "Suggestion accepted",
    rejected: "Suggestion rejected",
    detailNew: "New catalogue entry",
    detailChange: "Change suggestion",
    submittedBy: (vars: { name: string }) => `Submitted by ${vars.name}`,
    unknownUser: "unknown",
    withComment: (vars: { comment: string }) => ` · “${vars.comment}”`,
    moderationNote: (vars: { note: string }) =>
      `Moderator's reason: ${vars.note}`,
    rejectTitle: "Reject suggestion",
    reasonLabel: "Reason *",
    reasonPlaceholder: "e.g. “empty weight differs from the manufacturer's”",
    reasonRequired: "Please give a reason for rejecting it",
    rowManufacturer: "Manufacturer",
    rowSeries: "Series",
    rowMaterialTypes: "Material types",
    rowVersion: "Version",
    rowContainerMaterial: "Container material",
  },

  adminSystem: {
    title: "System",
    description: "Database, migrations and starter catalogue",
    database: "Database",
    system: "System",
    databaseName: "Database",
    connection: "Connection",
    poolConnections: "Connections in the pool",
    migrations: "Schema migrations",
    upToDate: "Up to date",
    pendingCount: (vars: { count: number }) => `${vars.count} pending`,
    applied: "applied",
    pending: "pending",
    seedCatalog: "Preset starter catalogue",
    seedRevision: (vars: { revision: number; rows: string }) =>
      `Revision ${vars.revision} · ${vars.rows} entries from the starter catalogue`,
    source: "Source",
    tables: "Tables",
    colTable: "Table",
  },

  weighing: {
    title: "Weigh material",
    description: (vars: { name: string; withBox: boolean }) =>
      `Weigh “${vars.name}” as a whole – container${
        vars.withBox ? " and drybox" : ""
      } included. The empty weight is subtracted for you.`,
    grossLabel: "Measured total weight (g) *",
    grossPlaceholder: "e.g. 740",
    remaining: "Actually left",
    tareContainer: "Container / packaging tare",
    tareBox: "Drybox tare",
    tareBoxNamed: (vars: { name: string }) => `Drybox tare (${vars.name})`,
    tareTotal: "Total tare",
    notePlaceholder: "e.g. after printing part X",
    submit: "Save weigh-in",
    saved: "Weigh-in saved",
    invalidWeight: "Please enter a valid weight in grams",
  },

  preset: {
    scope: {
      manufacturer: "Manufacturer",
      series: "Series",
      version: "Version",
      variant: "Size",
    },
    status: {
      pending: "Open",
      approved: "Accepted",
      rejected: "Rejected",
      withdrawn: "Withdrawn",
    },
    containerMaterial: {
      kunststoff: "Plastic",
      karton: "Cardboard",
      metall: "Metal",
      sonstiges: "Other",
      glas: "Glass",
      folie: "Foil",
    },
    containerForm: {
      rolle: "Spool",
      beutel: "Bag",
      flasche: "Bottle",
      eimer: "Pail",
      kartusche: "Cartridge",
      sonstiges: "Other",
    },
    formFits: (vars: { kind: string }) => `Fits ${vars.kind}`,
    tareSuffix: (vars: { amount: string }) => `${vars.amount} tare`,
    olderVersion: "older version",
    catalogBadge: "Catalogue",
  },

  myProposals: {
    withdrawn: "Suggestion withdrawn",
    emptyTitle: "No suggestions submitted yet",
    emptyDescription:
      "Use “Suggest as preset” on one of your own container types, or “Suggest a change” in the catalogue, to improve the shared catalogue.",
    submitted: "Submitted",
    kind: "Kind",
    content: "Content",
    status: "Status",
    kindNew: "New entry",
    kindChange: (vars: { scope: string }) => `Change (${vars.scope})`,
    withdraw: "Withdraw",
  },

  proposeChange: {
    title: "Suggest a change",
    description: (vars: { container: string; size: string }) =>
      `${vars.container} · ${vars.size}. An administrator reviews your correction before it reaches the catalogue.`,
    tareLabel: "Empty weight (g)",
    outerDiameter: "Outer Ø (mm)",
    width: "Width (mm)",
    bore: "Bore (mm)",
    reason: "Reason",
    reasonPlaceholder:
      "e.g. “Weighed the empty container three times, 138 g on average”",
    submit: "Submit suggestion",
    submitting: "Sending …",
    submitted: "Suggestion submitted – it will be reviewed by a moderator.",
    invalidTare: "Please enter a valid empty weight in grams",
    invalidDimensions: "Please enter valid dimensions in millimetres",
    noChanges: "The suggestion does not contain any changes",
  },

  lager: {
    title: "Stores",
    description:
      "Keep your stock apart by material kind – filament, powder or resin. One kind per store; filament also gets a diameter.",
    switchLabel: "Store",
    switchAria: "Switch store",
    newLager: "New store",
    firstLager: "Create your first store",
    emptyTitle: "No store yet",
    emptyDescription:
      "A store groups what belongs together. Create one for filament – powder and resin get their own.",

    nameLabel: "Name *",
    namePlaceholder: "e.g. Filament 1.75 mm",
    kindLabel: "Material kind *",
    kindHint: "Determines which fields a material has and how it is converted.",
    diameterLabel: "Filament diameter *",
    diameterHint:
      "Applies to everything in this store. If you keep both diameters, create two stores.",

    kindFilament: "Filament",
    kindPowder: "Powder",
    kindResin: "Resin",
    kindFilamentHint: "Containers and reels; remaining amount also in metres.",
    kindPowderHint: "Sintering powder in bags or buckets; grams only.",
    kindResinHint: "Liquid resin; remaining amount also in litres.",

    editLager: "Edit store",
    deleteLager: "Delete store",
    deleteTitle: "Delete this store?",
    deleteDescription: (vars: { name: string }) =>
      `“${vars.name}” will be deleted. It must not contain any material.`,
    created: "Store created",
    saved: "Store saved",
    deleted: "Store deleted",

    materialCount: (vars: { count: number }) =>
      vars.count === 1 ? "1 material" : `${vars.count} materials`,
    sharedWith: (vars: { count: number }) =>
      vars.count === 1
        ? "shared with 1 friend"
        : `shared with ${vars.count} friends`,
    limitReached: (vars: { max: number }) =>
      `More than ${vars.max} stores are not possible at the moment.`,
    noLagerTitle: "No store available",
    noLagerDescription:
      "Material needs a store. Create one first, then you can stock it.",

    secondaryHint: (vars: { density: string }) =>
      `Calculated with ${vars.density}. Enter a density on the material if you need it more precise.`,
    densityLabel: "Density (g/l)",
    densityHint:
      "Only used to convert to metres or litres. Leave empty to use the value for the material type.",
    approx: (vars: { value: string }) => `approx. ${vars.value}`,
  },

  friends: {
    title: "Friends",
    description:
      "Share material with friends – you decide per store and per friend how much of it is visible. Nothing is shared by default, and prices never leave.",

    myCodeTitle: "Your friend code",
    myCodeHint:
      "Pass the code to someone you want to share material with. Only those who know it can send you a request.",
    copyCode: "Copy code",
    codeCopied: "Friend code copied",
    rotateCode: "Generate a new code",
    rotateCodeTitle: "Generate a new friend code?",
    rotateCodeDescription:
      "The old code stops working afterwards. Existing friendships are unaffected.",
    codeRotated: "New friend code generated",

    addTitle: "Add a friend",
    addHint:
      "Friend code or Telegram name. The code is the more reliable route – not everyone has set a Telegram name.",
    codeLabel: "Friend code",
    codePlaceholder: "FH-A2B3-C4D5",
    usernameLabel: "Telegram name",
    usernamePlaceholder: "@name",
    sendRequest: "Send request",
    requestSent: "Request sent",
    requestSentUnreachable:
      "Request sent. The person could not be reached on Telegram – they will see it on their next visit.",

    listTitle: "Your friends",
    emptyTitle: "No friends yet",
    emptyDescription:
      "Exchange friend codes, and you will find your friends' shared filament in search.",
    incomingTitle: "Requests waiting for you",
    outgoingTitle: "Requests you sent",
    pendingBadge: "Waiting",
    accept: "Accept",
    decline: "Decline",
    accepted: "Request accepted",
    declined: "Request declined",
    removeFriend: "End friendship",
    removeTitle: "End this friendship?",
    removeDescription: (vars: { name: string }) =>
      `Afterwards you will no longer see any filament from ${vars.name}, and ${vars.name} none of yours. Pending loan requests go with it.`,
    removed: "Friendship ended",

    sharedByMe: "You show – per store",
    sharedWithMe: "You see",
    theirChoice: "Your friend's choice, across all their stores",
    visibilityNone: "Nothing",
    visibilitySearch: "Search only",
    visibilityFull: "Whole store",
    visibilitySearchHint:
      "Matches appear only when something specific is searched for. No browsing.",
    visibilityFullHint:
      "The whole store can be viewed – without prices, notes, purchase dates, location and weigh-ins.",
    visibilitySaved: "Sharing saved",
    sharesNothingHint:
      "You are not sharing any store yet – this friend sees nothing of yours. Choose above what they may see, per store.",
    noLagerYet: "You have no store yet that you could share.",
    toLager: "Create a store",
    openInventory: "View stock",

    inventoryTitle: (vars: { name: string }) => `${vars.name}'s stock`,
    inventoryDescription:
      "Material from the stores this friend has shared with you in full. Prices, notes, purchase dates, location and weigh-ins are not included.",
    inventoryEmpty: "This stock is empty.",
    inventoryDenied:
      "You cannot view this stock. The sharing setting may have changed.",

    searchTitle: "Found with friends",
    searchCount: (vars: { count: number }) =>
      vars.count === 1 ? "1 match" : `${vars.count} matches`,
    ownerLabel: (vars: { name: string }) => `at ${vars.name}`,
    ownerColumn: "At",
  },

  organizations: {
    title: "Organizations",
    description:
      "Shared inventory for companies, university hubs and makerspaces. Everyone who belongs works on the same stock \u2013 graded by what they may do.",

    scopeLabel: "Area",
    scopeAria: "Switch area",
    personal: "Personal",

    roleViewer: "View",
    roleWeigher: "Weigh",
    roleEditor: "Record",
    roleAdmin: "Manage",
    roleViewerHint: "Look up and search the stock.",
    roleWeigherHint: "Additionally weigh, that is, draw material down.",
    roleEditorHint:
      "Additionally create and change material, container types and dryboxes.",
    roleAdminHint:
      "Additionally create stores, manage members and assign roles.",

    emptyTitle: "No organization yet",
    emptyDescription:
      "Create one to share stock with others \u2013 or join an existing one with a join code.",
    newOrganization: "Create organization",
    nameLabel: "Name *",
    namePlaceholder: "e.g. University makerspace",
    created: "Organization created",
    saved: "Saved",
    deleted: "Organization deleted",
    memberCount: vars =>
      vars.count === 1 ? "1 member" : `${vars.count} members`,

    joinTitle: "Join with a code",
    joinHint:
      "You get the join code from someone who manages the organization.",
    joinCodeLabel: "Join code",
    joinCodePlaceholder: "ORG-A2B3-C4D5",
    join: "Join",
    joined: vars => `You are now part of ${vars.name}.`,

    invitationsTitle: "Invitations",
    invitationFrom: vars =>
      `${vars.name} invites you as \u201c${vars.role}\u201d.`,
    accept: "Accept",
    decline: "Decline",
    invitationAccepted: "Invitation accepted",
    invitationDeclined: "Invitation declined",

    membersTitle: "Members",
    inviteTitle: "Invite someone",
    inviteHint:
      "Friend code or Telegram name. The invitation only takes effect once it is accepted.",
    inviteRoleLabel: "Role",
    invite: "Invite",
    invited: vars => `${vars.name} has been invited.`,
    inviteNotNotified: "Invited \u2013 but the Telegram notice did not arrive.",

    pendingInvitationsTitle: "Open invitations",
    pendingInvitationsHint:
      "Not answered yet. An invitation is only valid while the person who sent it still manages the organization.",
    revokeInvitation: "Withdraw invitation",
    invitationRevoked: "Invitation withdrawn",

    roleChanged: "Role changed",
    removeMember: "Remove",
    removeMemberTitle: "Remove member?",
    removeMemberDescription: vars =>
      `${vars.name} immediately loses all access to this organization\u2019s stock. Whatever ${vars.name} recorded stays.`,
    memberRemoved: "Member removed",

    joinCodeTitle: "Open joining",
    joinCodeHint:
      "Anyone with the code joins without further confirmation. It can be switched off or regenerated at any time.",
    joinCodeOff: "Open joining is off.",
    joinRoleLabel: "Level on joining",
    joinRoleHint:
      "The management level cannot be granted this way \u2013 a code carrying it would be a takeover.",
    enableJoinCode: "Generate code",
    rotateJoinCode: "Generate new code",
    disableJoinCode: "Switch off open joining",
    copyJoinCode: "Copy code",
    joinCodeCopied: "Join code copied",

    leave: "Leave organization",
    leaveTitle: "Leave organization?",
    leaveDescription:
      "You lose access to its stock. Whatever you recorded stays with the organization.",
    left: "Left the organization",
    deleteOrganization: "Delete organization",
    deleteTitle: "Delete organization?",
    deleteDescription:
      "This cannot be undone. It is only possible while no store is attached any more.",

    needEditor:
      "This needs at least the \u201cRecord\u201d level in this organization.",
    needAdmin: "This needs the \u201cManage\u201d level in this organization.",
  },

  loan: {
    ask: "Ask",
    askTitle: "Ask for material",
    askDescription: (vars: { material: string; name: string }) =>
      `${vars.name} will get a message that you would like to borrow “${vars.material}”.`,
    messageLabel: "Message (optional)",
    messagePlaceholder: "e.g. “I'd need about 200 g, will return the rest.”",
    send: "Send request",
    sending: "Sending …",
    sent: "Request sent",
    sentUnreachable:
      "Request sent. The person could not be reached on Telegram – they will see it on their next visit.",

    incomingTitle: "Loan requests for you",
    outgoingTitle: "Your loan requests",
    fromLabel: (vars: { name: string }) => `from ${vars.name}`,
    toLabel: (vars: { name: string }) => `to ${vars.name}`,
    statusOpen: "Open",
    statusAccepted: "Accepted",
    statusDeclined: "Declined",
    statusWithdrawn: "Withdrawn",
    accept: "Accept",
    decline: "Decline",
    accepted: "Accepted",
    declined: "Declined",
    withdraw: "Withdraw",
    withdrawn: "Request withdrawn",
  },
};
