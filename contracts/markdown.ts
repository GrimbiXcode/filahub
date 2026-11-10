/**
 * Markdown → Baum, ohne Abhängigkeiten (bis 4.8.0 `react-markdown` und
 * `remark-gfm`, zusammen rund hundert Pakete).
 *
 * Gelesen wird die Teilmenge, die Rechtstexte, Release Notes und Notizen
 * brauchen: Überschriften (ATX und Setext), Absätze mit harten Umbrüchen,
 * Listen (auch verschachtelt und nummeriert), Zitate, Code (Inline und
 * umzäunt), Trennlinien, Tabellen, Links, Bilder, Autolinks, fett, kursiv,
 * durchgestrichen, Aufgabenlisten und die gängigen HTML-Entitäten. Nicht
 * dabei: Verweis-Links (`[text][ref]`), eingerückte Code-Blöcke, Fußnoten.
 *
 * **Rohes HTML bleibt Text.** Es gibt keinen Knoten dafür; `<script>` steht
 * wörtlich da. Der Renderer erzeugt React-Elemente, nie `innerHTML`.
 *
 * **Adressen werden geprüft** (`safeUrl`): erlaubt sind relative Adressen und
 * `http`, `https`, `mailto`, `tel`. Alles andere – vor allem `javascript:` –
 * wird `null`, und der Renderer zeigt nur den Text. Notizen schreiben auch
 * andere Mitglieder einer Organisation.
 *
 * **Grenzen gegen bösartige Eingaben:** Verschachtelung höchstens
 * `MAX_NESTING` tief (tiefer wird Text), und die Suche nach schließenden
 * Zeichen merkt sich Fehlschläge – sonst wüchse die Laufzeit bei Ketten wie
 * `*_*_*_…` exponentiell.
 */

export type MarkdownInline =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong" | "emphasis" | "delete"; children: MarkdownInline[] }
  | {
      type: "link";
      /** `null`, wenn die Adresse nicht erlaubt ist – dann nur Text. */
      href: string | null;
      title: string | null;
      children: MarkdownInline[];
    }
  | { type: "image"; src: string | null; alt: string; title: string | null }
  | { type: "break" };

export type MarkdownListItem = {
  /** Aufgabenliste (`- [ ]`, `- [x]`), sonst `null`. */
  checked: boolean | null;
  children: MarkdownBlock[];
};

export type TableAlign = "left" | "center" | "right" | null;

export type MarkdownBlock =
  | {
      type: "heading";
      depth: 1 | 2 | 3 | 4 | 5 | 6;
      children: MarkdownInline[];
    }
  | { type: "paragraph"; children: MarkdownInline[] }
  | { type: "thematicBreak" }
  | { type: "code"; lang: string | null; value: string }
  | { type: "blockquote"; children: MarkdownBlock[] }
  | {
      type: "list";
      ordered: boolean;
      /** Startnummer einer nummerierten Liste, sonst `null`. */
      start: number | null;
      /** Eng: Einträge ohne Leerzeilen – der Renderer lässt `<p>` weg. */
      tight: boolean;
      items: MarkdownListItem[];
    }
  | {
      type: "table";
      align: TableAlign[];
      head: MarkdownInline[][];
      rows: MarkdownInline[][][];
    };

/** Tiefer verschachtelte Zitate, Listen und Hervorhebungen werden Text. */
export const MAX_NESTING = 16;

// ---------------------------------------------------------------------------
// Adressen

const ALLOWED_PROTOCOLS = new Set(["http", "https", "mailto", "tel"]);

/**
 * Gibt die Adresse zurück, wenn sie relativ ist oder ein erlaubtes Schema hat,
 * sonst `null`. Geprüft wird die Form, die der Browser daraus macht: Er
 * entfernt Tabulatoren und Zeilenumbrüche überall und Steuerzeichen am
 * Anfang – `java\tscript:` wäre sonst ein Schlupfloch.
 */
export function safeUrl(url: string): string | null {
  // eslint-disable-next-line no-control-regex
  const value = url.replace(/[\t\n\r]/g, "").replace(/^[\u0000- ]+/, "");
  const colon = value.indexOf(":");
  if (colon === -1) return value;
  for (const stop of ["/", "?", "#"]) {
    const at = value.indexOf(stop);
    if (at !== -1 && at < colon) return value;
  }
  return ALLOWED_PROTOCOLS.has(value.slice(0, colon).toLowerCase())
    ? value
    : null;
}

// ---------------------------------------------------------------------------
// Blöcke

const HR = /^ {0,3}([-*_])(?: *\1){2,} *$/;
const ATX = /^ {0,3}(#{1,6})(?=[ ]|$)(.*)$/;
const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const LIST_ITEM = /^( {0,3})([-+*]|\d{1,9}[.)])(?:( +)(.*))?$/;
const SETEXT_1 = /^ {0,3}=+ *$/;
const SETEXT_2 = /^ {0,3}-+ *$/;
const TABLE_DELIMITER = /^ {0,3}\|? *:?-+:? *(?:\| *:?-+:? *)*\|? *$/;

type ListMarker = {
  indent: number;
  marker: string;
  ordered: boolean;
  /** `-`, `+`, `*` oder bei Nummern `.`/`)` – ein anderes beginnt eine neue Liste. */
  kind: string;
  start: number;
  contentIndent: number;
  first: string;
};

function matchListItem(line: string): ListMarker | null {
  const m = LIST_ITEM.exec(line);
  if (!m) return null;
  const indent = m[1].length;
  const marker = m[2];
  const spaces = m[3]?.length ?? 0;
  const rest = m[4] ?? "";
  const ordered = /\d/.test(marker);
  // Mehr als vier Leerzeichen nach dem Zeichen zählen ab dem ersten zum Inhalt.
  const padding = rest === "" || spaces > 4 ? 1 : spaces;
  return {
    indent,
    marker,
    ordered,
    kind: ordered ? marker.slice(-1) : marker,
    start: ordered ? Number.parseInt(marker, 10) : 1,
    contentIndent: indent + marker.length + padding,
    first: (spaces > 4 ? " ".repeat(spaces - 1) : "") + rest,
  };
}

const isBlank = (line: string) => line.trim() === "";
const indentOf = (line: string) => /^ */.exec(line)![0].length;

/** Tabulatoren am Zeilenanfang als vier Leerzeichen – die Einrückung zählt. */
function expandLeadingTabs(line: string): string {
  return line.replace(/^[ \t]+/, lead => lead.replace(/\t/g, "    "));
}

/** Zerlegt eine Tabellenzeile an nicht maskierten `|`. */
function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === "\\" && row[i + 1] === "|") {
      // Wie GFM: `\|` ist ein Zeichen der Zelle, auch in Code.
      cell += "|";
      i++;
    } else if (c === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += c;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function tableAlign(cell: string): TableAlign {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

function isTableStart(lines: string[], i: number): boolean {
  const header = lines[i];
  const delimiter = lines[i + 1];
  if (header === undefined || delimiter === undefined) return false;
  if (!header.includes("|") || !TABLE_DELIMITER.test(delimiter)) return false;
  return splitRow(header).length === splitRow(delimiter).length;
}

/** Beginnt die Zeile einen Block, der einen Absatz unterbricht? */
function interruptsParagraph(lines: string[], i: number): boolean {
  const line = lines[i];
  if (ATX.test(line) || HR.test(line) || QUOTE.test(line)) return true;
  if (FENCE_OPEN.test(line) && isFenceOpen(line)) return true;
  const item = matchListItem(line);
  // Eine Liste unterbricht nur mit Inhalt, eine nummerierte nur ab 1 – sonst
  // würde „2019. war ein gutes Jahr“ mitten im Absatz zur Liste.
  if (item && item.first.trim() !== "" && (!item.ordered || item.start === 1)) {
    return true;
  }
  return isTableStart(lines, i);
}

function isFenceOpen(line: string): boolean {
  const m = FENCE_OPEN.exec(line);
  // Hinter Backticks darf die Info-Zeile keine Backticks enthalten.
  return !!m && !(m[2][0] === "`" && m[3].includes("`"));
}

type BlockInfo = { blankBetween: boolean };

/** Liest Blöcke; `info.blankBetween` meldet Leerzeilen zwischen ihnen. */
function parseBlocks(
  lines: string[],
  depth: number,
  info?: BlockInfo
): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  let pendingBlank = false;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      pendingBlank = true;
      i++;
      continue;
    }
    if (pendingBlank && blocks.length > 0 && info) info.blankBetween = true;
    pendingBlank = false;

    // Zu tief verschachtelt: der Rest wird ein Absatz aus Text.
    if (depth > MAX_NESTING) {
      blocks.push({
        type: "paragraph",
        children: [{ type: "text", value: lines.slice(i).join("\n").trim() }],
      });
      break;
    }

    const atx = ATX.exec(line);
    if (atx) {
      const content = atx[2].trim().replace(/(?:^|\s+)#+$/, "");
      blocks.push({
        type: "heading",
        depth: atx[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        children: parseInline(content),
      });
      i++;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ type: "thematicBreak" });
      i++;
      continue;
    }

    const fence = FENCE_OPEN.exec(line);
    if (fence && isFenceOpen(line)) {
      const indent = fence[1].length;
      const marker = fence[2];
      const lang = fence[3].trim().split(/\s+/)[0] || null;
      const close = new RegExp(`^ {0,3}${marker[0]}{${marker.length},} *$`);
      const body: string[] = [];
      i++;
      while (i < lines.length && !close.test(lines[i])) {
        body.push(lines[i].replace(new RegExp(`^ {0,${indent}}`), ""));
        i++;
      }
      i++; // schließender Zaun (oder Ende des Containers)
      blocks.push({ type: "code", lang, value: body.join("\n") });
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length) {
        const quoted = QUOTE.exec(lines[i]);
        if (quoted) {
          inner.push(quoted[1]);
        } else if (
          // Faule Fortsetzung: eine Textzeile ohne `>` gehört noch dazu.
          !isBlank(lines[i]) &&
          inner.length > 0 &&
          !isBlank(inner[inner.length - 1]) &&
          !interruptsParagraph(lines, i)
        ) {
          inner.push(lines[i]);
        } else {
          break;
        }
        i++;
      }
      blocks.push({
        type: "blockquote",
        children: parseBlocks(inner, depth + 1),
      });
      continue;
    }

    const item = matchListItem(line);
    if (item) {
      const [list, next] = parseList(lines, i, item, depth);
      blocks.push(list);
      i = next;
      continue;
    }

    if (isTableStart(lines, i)) {
      const head = splitRow(lines[i]);
      const align = splitRow(lines[i + 1]).map(tableAlign);
      const rows: MarkdownInline[][][] = [];
      i += 2;
      while (
        i < lines.length &&
        !isBlank(lines[i]) &&
        !interruptsParagraph(lines, i)
      ) {
        const cells = splitRow(lines[i]);
        rows.push(head.map((_, c) => parseInline(cells[c] ?? "")));
        i++;
      }
      blocks.push({
        type: "table",
        align,
        head: head.map(cell => parseInline(cell)),
        rows,
      });
      continue;
    }

    // Absatz, gegebenenfalls mit Setext-Unterstreichung als Überschrift.
    const text: string[] = [line.trimStart()];
    i++;
    let setext: 1 | 2 | null = null;
    while (i < lines.length && !isBlank(lines[i])) {
      if (SETEXT_1.test(lines[i])) {
        setext = 1;
        i++;
        break;
      }
      if (SETEXT_2.test(lines[i])) {
        setext = 2;
        i++;
        break;
      }
      if (interruptsParagraph(lines, i)) break;
      text.push(lines[i].trimStart());
      i++;
    }
    const content = text.join("\n").trimEnd();
    blocks.push(
      setext
        ? { type: "heading", depth: setext, children: parseInline(content) }
        : { type: "paragraph", children: parseInline(content) }
    );
  }

  return blocks;
}

function parseList(
  lines: string[],
  from: number,
  first: ListMarker,
  depth: number
): [MarkdownBlock, number] {
  const items: MarkdownListItem[] = [];
  let tight = true;
  let i = from;

  while (i < lines.length) {
    const item = matchListItem(lines[i]);
    if (!item || item.kind !== first.kind || item.ordered !== first.ordered) {
      break;
    }
    // Ein Eintrag ohne Inhalt, dem eine Leerzeile folgt, ist leer.
    const body: string[] = [item.first];
    i++;
    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) {
        body.push("");
        i++;
        continue;
      }
      if (indentOf(line) >= item.contentIndent) {
        body.push(line.slice(item.contentIndent));
        i++;
        continue;
      }
      const previous = body[body.length - 1];
      // Faule Fortsetzung eines Absatzes im Eintrag.
      if (
        previous !== undefined &&
        !isBlank(previous) &&
        !interruptsParagraph(lines, i) &&
        !matchListItem(line)
      ) {
        body.push(line.trimStart());
        i++;
        continue;
      }
      break;
    }

    let trailing = 0;
    while (body.length > 1 && isBlank(body[body.length - 1])) {
      body.pop();
      trailing++;
    }
    const task = /^\[([ xX])\](?: +|$)/.exec(body[0]);
    if (task) body[0] = body[0].slice(task[0].length);
    const info: BlockInfo = { blankBetween: false };
    items.push({
      checked: task ? task[1] !== " " : null,
      children: parseBlocks(body, depth + 1, info),
    });
    if (info.blankBetween) tight = false;

    // Leerzeilen zwischen zwei Einträgen machen die Liste locker.
    if (trailing > 0) {
      const next = i < lines.length ? matchListItem(lines[i]) : null;
      if (next && next.kind === first.kind && next.ordered === first.ordered) {
        tight = false;
      } else {
        break;
      }
    }
  }

  return [
    {
      type: "list",
      ordered: first.ordered,
      start: first.ordered ? first.start : null,
      tight,
      items,
    },
    i,
  ];
}

/** Liest einen Markdown-Text. */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(expandLeadingTabs);
  return parseBlocks(lines, 0);
}

// ---------------------------------------------------------------------------
// Inline

const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const AUTOLINK = /<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>]*)>/y;
const EMAIL_AUTOLINK =
  /<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/y;
const BARE_URL = /(?:https?:\/\/|www\.)[^\s<]+/y;
const ENTITY =
  /&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|amp|lt|gt|quot|apos|nbsp|shy|ndash|mdash|hellip|copy|reg|trade|euro|laquo|raquo|bdquo|ldquo|rdquo|lsquo|rsquo|sbquo|middot|deg|times|auml|ouml|uuml|Auml|Ouml|Uuml|szlig);/y;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  shy: "­",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  laquo: "«",
  raquo: "»",
  bdquo: "„",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  middot: "·",
  deg: "°",
  times: "×",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
};

function decodeEntity(name: string): string {
  if (name[0] !== "#") return NAMED_ENTITIES[name];
  const code =
    name[1] === "x" || name[1] === "X"
      ? Number.parseInt(name.slice(2), 16)
      : Number.parseInt(name.slice(1), 10);
  const valid =
    code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
  return String.fromCodePoint(valid ? code : 0xfffd);
}

const isWhitespace = (c: string | undefined) => c === undefined || /\s/.test(c);
const isAlnum = (c: string | undefined) =>
  c !== undefined && /[\p{L}\p{N}]/u.test(c);

function runLength(text: string, at: number, ch: string): number {
  let end = at;
  while (text[end] === ch) end++;
  return end - at;
}

type InlineOptions = { inLink: boolean; depth: number };

class InlineParser {
  private closerMemo = new Map<string, number>();
  /** Je Trenner und Ende: ab hier bis zum Ende gesucht, nichts gefunden. */
  private closerMissing = new Map<string, number>();
  private backtickMissing = new Map<number, number>();
  private titleMissing = new Map<string, number>();
  private brackets: Int32Array | null = null;

  private readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  /** Schließende Backtick-Folge genau dieser Länge ab `from`, sonst -1. */
  findBacktickClose(from: number, length: number): number {
    const missingFrom = this.backtickMissing.get(length);
    if (missingFrom !== undefined && from >= missingFrom) return -1;
    let j = from;
    while (j < this.text.length) {
      if (this.text[j] === "`") {
        const run = runLength(this.text, j, "`");
        if (run === length) return j;
        j += run;
      } else {
        j++;
      }
    }
    this.backtickMissing.set(length, from);
    return -1;
  }

  canOpen(at: number, run: number, ch: string): boolean {
    const next = this.text[at + run];
    if (isWhitespace(next)) return false;
    return ch !== "_" || !isAlnum(this.text[at - 1]);
  }

  canClose(at: number, run: number, ch: string): boolean {
    if (isWhitespace(this.text[at - 1])) return false;
    return ch !== "_" || !isAlnum(this.text[at + run]);
  }

  /** Position des passenden schließenden Trenners, sonst -1. */
  findCloser(from: number, delim: string, end: number, depth = 0): number {
    const key = `${from}|${delim}|${end}`;
    const known = this.closerMemo.get(key);
    if (known !== undefined) return known;
    const missingKey = `${delim}|${end}`;
    const missingFrom = this.closerMissing.get(missingKey);
    if (missingFrom !== undefined && from >= missingFrom) return -1;
    const ch = delim[0];
    let result = -1;
    let j = from;
    while (j < end) {
      const c = this.text[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === "`") {
        const run = runLength(this.text, j, "`");
        const close = this.findBacktickClose(j + run, run);
        j = close >= 0 && close < end ? close + run : j + run;
        continue;
      }
      if (c === ch) {
        const run = Math.min(runLength(this.text, j, ch), end - j);
        if (run >= delim.length && j > from && this.canClose(j, run, ch)) {
          result = j;
          break;
        }
        if (depth < MAX_NESTING && this.canOpen(j, run, ch)) {
          const innerLength = Math.min(run, 2);
          const inner = this.findCloser(
            j + innerLength,
            ch.repeat(innerLength),
            end,
            depth + 1
          );
          if (inner >= 0) {
            j = inner + innerLength;
            continue;
          }
          // Findet ein gleich langer oder kürzerer Trenner bis zum Ende
          // keinen Abschluss, findet ihn dieser auch nicht. Ohne diesen
          // Abbruch liefe `*a *a *a …` quadratisch.
          if (innerLength <= delim.length) break;
        }
        j += run;
        continue;
      }
      j++;
    }
    this.closerMemo.set(key, result);
    if (result < 0 && (missingFrom === undefined || from < missingFrom)) {
      this.closerMissing.set(missingKey, from);
    }
    return result;
  }

  /**
   * Die schließende `]` zu jeder `[`, einmal für den ganzen Text in einem
   * Durchgang – je Klammer neu gesucht wäre `[[[[…` quadratisch.
   */
  matchingBracket(at: number): number {
    if (!this.brackets) {
      const text = this.text;
      const match = new Int32Array(text.length).fill(-1);
      const open: number[] = [];
      let j = 0;
      while (j < text.length) {
        const c = text[j];
        if (c === "\\") {
          j += 2;
          continue;
        }
        if (c === "`") {
          const run = runLength(text, j, "`");
          const close = this.findBacktickClose(j + run, run);
          j = close >= 0 ? close + run : j + run;
          continue;
        }
        if (c === "[") open.push(j);
        if (c === "]" && open.length > 0) match[open.pop()!] = j;
        j++;
      }
      this.brackets = match;
    }
    return this.brackets[at];
  }

  /** `[label](ziel "titel")` ab `at` (auf `[`), sonst `null`. */
  parseLinkLike(
    at: number,
    end: number
  ): {
    label: [number, number];
    dest: string;
    title: string | null;
    end: number;
  } | null {
    const text = this.text;
    const j = this.matchingBracket(at);
    if (j < 0 || j >= end || text[j + 1] !== "(") return null;
    const labelEnd = j;
    let k = j + 2;
    while (k < end && (text[k] === " " || text[k] === "\n")) k++;

    let dest: string;
    if (text[k] === "<") {
      const close = text.indexOf(">", k + 1);
      if (close === -1 || close >= end) return null;
      dest = text.slice(k + 1, close);
      if (/[<\n]/.test(dest)) return null;
      k = close + 1;
    } else {
      let parens = 0;
      const startDest = k;
      while (k < end) {
        const c = text[k];
        if (c === "\\" && k + 1 < end && ESCAPABLE.test(text[k + 1])) {
          k += 2;
          continue;
        }
        if (/\s/.test(c)) break;
        // Höchstens 32 Ebenen wie in CommonMark – sonst liefe `[a](` in
        // Serie bei jedem Link bis zum Textende.
        if (c === "(" && ++parens > 32) return null;
        if (c === ")") {
          if (parens === 0) break;
          parens--;
        }
        k++;
      }
      dest = text.slice(startDest, k);
    }
    dest = dest.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1");

    let title: string | null = null;
    const beforeTitle = k;
    while (k < end && (text[k] === " " || text[k] === "\n")) k++;
    const open = text[k];
    if ((open === '"' || open === "'" || open === "(") && k > beforeTitle) {
      const closeChar = open === "(" ? ")" : open;
      const missing = this.titleMissing.get(closeChar);
      if (missing !== undefined && k >= missing) return null;
      let t = k + 1;
      while (t < end && text[t] !== closeChar) t += text[t] === "\\" ? 2 : 1;
      if (t >= end) {
        if (end === text.length) this.titleMissing.set(closeChar, k);
        return null;
      }
      title = text.slice(k + 1, t).replace(/\\(.)/g, "$1");
      k = t + 1;
      while (k < end && (text[k] === " " || text[k] === "\n")) k++;
    }
    if (text[k] !== ")") return null;
    return { label: [at + 1, labelEnd], dest, title, end: k + 1 };
  }

  parse(start: number, end: number, options: InlineOptions): MarkdownInline[] {
    const text = this.text;
    const out: MarkdownInline[] = [];
    let buffer = "";
    const flush = () => {
      if (buffer) pushText(out, buffer);
      buffer = "";
    };
    const nested = (from: number, to: number, inLink = options.inLink) =>
      options.depth >= MAX_NESTING
        ? [{ type: "text" as const, value: text.slice(from, to) }]
        : this.parse(from, to, { inLink, depth: options.depth + 1 });

    let i = start;
    while (i < end) {
      const ch = text[i];

      if (ch === "\\") {
        const next = text[i + 1];
        if (next === "\n" && i + 1 < end) {
          flush();
          out.push({ type: "break" });
          i += 2;
          while (text[i] === " ") i++;
          continue;
        }
        if (next !== undefined && i + 1 < end && ESCAPABLE.test(next)) {
          buffer += next;
          i += 2;
          continue;
        }
        buffer += ch;
        i++;
        continue;
      }

      if (ch === "\n") {
        const spaces = /( *)$/.exec(buffer)![1].length;
        buffer = buffer.slice(0, buffer.length - spaces);
        if (spaces >= 2) {
          flush();
          out.push({ type: "break" });
        } else {
          buffer += "\n";
        }
        i++;
        while (text[i] === " ") i++;
        continue;
      }

      if (ch === "`") {
        const run = runLength(text, i, "`");
        const close = this.findBacktickClose(i + run, run);
        if (close >= 0 && close + run <= end) {
          flush();
          let value = text.slice(i + run, close).replace(/\n/g, " ");
          if (/^ .*[^ ].* $/s.test(value)) value = value.slice(1, -1);
          out.push({ type: "code", value });
          i = close + run;
          continue;
        }
        buffer += "`".repeat(run);
        i += run;
        continue;
      }

      if (ch === "!" && text[i + 1] === "[") {
        const link = this.parseLinkLike(i + 1, end);
        if (link) {
          flush();
          out.push({
            type: "image",
            src: safeUrl(link.dest),
            alt: plainText(nested(link.label[0], link.label[1])),
            title: link.title,
          });
          i = link.end;
          continue;
        }
      }

      if (ch === "[" && !options.inLink) {
        const link = this.parseLinkLike(i, end);
        if (link) {
          flush();
          out.push({
            type: "link",
            href: safeUrl(link.dest),
            title: link.title,
            children: nested(link.label[0], link.label[1], true),
          });
          i = link.end;
          continue;
        }
      }

      if (ch === "<" && !options.inLink) {
        AUTOLINK.lastIndex = i;
        EMAIL_AUTOLINK.lastIndex = i;
        const url = AUTOLINK.exec(text);
        const email = url ? null : EMAIL_AUTOLINK.exec(text);
        const m = url ?? email;
        if (m && m.index + m[0].length <= end) {
          flush();
          out.push({
            type: "link",
            href: safeUrl(email ? `mailto:${m[1]}` : m[1]),
            title: null,
            children: [{ type: "text", value: m[1] }],
          });
          i += m[0].length;
          continue;
        }
      }

      if (
        (ch === "h" || ch === "w") &&
        !options.inLink &&
        (i === 0 || /[\s*_~(]/.test(text[i - 1]))
      ) {
        BARE_URL.lastIndex = i;
        const m = BARE_URL.exec(text);
        if (m) {
          let url = m[0].slice(0, Math.max(0, end - i));
          // Satzzeichen am Ende gehören nicht zur Adresse, ebenso eine
          // schließende Klammer ohne öffnende.
          for (;;) {
            const trimmed = url.replace(/[?!.,:*_~'";]+$/, "");
            const opens = (trimmed.match(/\(/g) ?? []).length;
            const closes = (trimmed.match(/\)/g) ?? []).length;
            const next =
              trimmed.endsWith(")") && closes > opens
                ? trimmed.slice(0, -1)
                : trimmed;
            if (next === url) break;
            url = next;
          }
          const host = url.replace(/^(?:https?:\/\/|www\.)/, "");
          if (/^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*/u.test(host) && host) {
            flush();
            out.push({
              type: "link",
              href: safeUrl(url.startsWith("www.") ? `http://${url}` : url),
              title: null,
              children: [{ type: "text", value: url }],
            });
            i += url.length;
            continue;
          }
        }
      }

      if (ch === "*" || ch === "_" || ch === "~") {
        const run = Math.min(runLength(text, i, ch), end - i);
        let matched = false;
        if (this.canOpen(i, run, ch)) {
          const lengths =
            ch === "~" ? (run <= 2 ? [run] : []) : run >= 2 ? [2, 1] : [1];
          for (const length of lengths) {
            const close = this.findCloser(i + length, ch.repeat(length), end);
            if (close > i + length) {
              flush();
              out.push({
                type:
                  ch === "~" ? "delete" : length === 2 ? "strong" : "emphasis",
                children: nested(i + length, close),
              });
              i = close + length;
              matched = true;
              break;
            }
          }
        }
        if (matched) continue;
        buffer += ch.repeat(run);
        i += run;
        continue;
      }

      if (ch === "&") {
        ENTITY.lastIndex = i;
        const m = ENTITY.exec(text);
        if (m && m.index + m[0].length <= end) {
          buffer += decodeEntity(m[1]);
          i += m[0].length;
          continue;
        }
      }

      buffer += ch;
      i++;
    }
    flush();
    return out;
  }
}

function pushText(out: MarkdownInline[], value: string) {
  const last = out[out.length - 1];
  if (last?.type === "text") last.value += value;
  else out.push({ type: "text", value });
}

/** Liest eine Zeile Inline-Markdown. */
export function parseInline(text: string): MarkdownInline[] {
  return new InlineParser(text).parse(0, text.length, {
    inLink: false,
    depth: 0,
  });
}

/** Nur der Text, etwa für den Alternativtext eines Bildes. */
export function plainText(nodes: MarkdownInline[]): string {
  return nodes
    .map(node => {
      switch (node.type) {
        case "text":
        case "code":
          return node.value;
        case "break":
          return "\n";
        case "image":
          return node.alt;
        default:
          return plainText(node.children);
      }
    })
    .join("");
}
