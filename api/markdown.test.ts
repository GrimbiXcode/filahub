import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_NESTING,
  parseInline,
  parseMarkdown,
  plainText,
  safeUrl,
  type MarkdownBlock,
  type MarkdownInline,
} from "@contracts/markdown";

/**
 * Der Markdown-Leser aus `contracts/markdown.ts` (bis 4.8.0
 * `react-markdown`). Beim Wechsel wurde die Ausgabe an allen Markdown-Dateien
 * des Repos gegen `react-markdown` + `remark-gfm` verglichen: identisch.
 * Diese Tests halten das Verhalten fest, vor allem die Sicherheitszusagen.
 */

const text = (value: string): MarkdownInline => ({ type: "text", value });
const para = (...children: MarkdownInline[]): MarkdownBlock => ({
  type: "paragraph",
  children,
});

describe("Adressen", () => {
  it.each([
    "https://example.com",
    "http://example.com/a?b#c",
    "mailto:a@b.de",
    "tel:+41123",
    "/einstellungen",
    "#abschnitt",
    "bild.png",
    "./a:b",
    "?q=a:b",
  ])("erlaubt %s", url => {
    expect(safeUrl(url)).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    " \u0001javascript:alert(1)",
    "data:text/html,<script>",
    "vbscript:x",
    "file:///etc/passwd",
  ])("verwirft %j", url => {
    expect(safeUrl(url)).toBeNull();
  });

  it("macht aus einem verbotenen Link reinen Text", () => {
    expect(parseInline("[klick](javascript:alert(1))")).toEqual([
      { type: "link", href: null, title: null, children: [text("klick")] },
    ]);
  });

  it("prüft auch Bilder und Autolinks", () => {
    expect(parseInline("![x](javascript:x)")[0]).toMatchObject({ src: null });
    expect(parseInline("<javascript:alert(1)>")[0]).toMatchObject({
      type: "link",
      href: null,
    });
  });
});

describe("Rohes HTML", () => {
  it("bleibt Text, als Block wie inline", () => {
    expect(parseMarkdown("<script>alert(1)</script>")).toEqual([
      para(text("<script>alert(1)</script>")),
    ]);
    expect(parseInline('a <img src=x onerror="alert(1)"> b')).toEqual([
      text('a <img src=x onerror="alert(1)"> b'),
    ]);
  });
});

describe("Blöcke", () => {
  it("liest Überschriften (ATX und Setext)", () => {
    expect(
      parseMarkdown("# Eins #\n###### Sechs\n#kein\n\nZwei\n---\n\nEins\n===")
    ).toEqual([
      { type: "heading", depth: 1, children: [text("Eins")] },
      { type: "heading", depth: 6, children: [text("Sechs")] },
      para(text("#kein")),
      { type: "heading", depth: 2, children: [text("Zwei")] },
      { type: "heading", depth: 1, children: [text("Eins")] },
    ]);
  });

  it("liest Trennlinien, aber nicht als Listenpunkt", () => {
    expect(parseMarkdown("---\n\n* * *\n\n- - -")).toEqual([
      { type: "thematicBreak" },
      { type: "thematicBreak" },
      { type: "thematicBreak" },
    ]);
  });

  it("liest umzäunten Code samt Leerzeilen und ohne Inline-Regeln", () => {
    expect(parseMarkdown("```gcode\nG28\n\n*G1* X10\n```\nnach")).toEqual([
      { type: "code", lang: "gcode", value: "G28\n\n*G1* X10" },
      para(text("nach")),
    ]);
    expect(parseMarkdown("~~~\nohne Ende")).toEqual([
      { type: "code", lang: null, value: "ohne Ende" },
    ]);
  });

  it("liest Zitate mit fauler Fortsetzung und Blöcken darin", () => {
    expect(parseMarkdown("> Zitat\nweiter\n\n> - Punkt")).toEqual([
      { type: "blockquote", children: [para(text("Zitat\nweiter"))] },
      {
        type: "blockquote",
        children: [
          {
            type: "list",
            ordered: false,
            start: null,
            tight: true,
            items: [{ checked: null, children: [para(text("Punkt"))] }],
          },
        ],
      },
    ]);
  });

  it("liest enge, verschachtelte Listen", () => {
    const [list] = parseMarkdown(
      "- PLA\n- PETG\n  - matt\n  - glänzend\n- ABS"
    );
    expect(list).toMatchObject({ type: "list", tight: true });
    if (list.type !== "list") throw new Error("keine Liste");
    expect(list.items).toHaveLength(3);
    expect(list.items[1].children[1]).toMatchObject({
      type: "list",
      items: [{ children: [para(text("matt"))] }, expect.anything()],
    });
  });

  it("erkennt lockere Listen an Leerzeilen", () => {
    expect(parseMarkdown("- a\n\n- b")[0]).toMatchObject({ tight: false });
    expect(parseMarkdown("- a\n\n  weiter\n- b")[0]).toMatchObject({
      tight: false,
    });
    // Eine Leerzeile nach dem letzten Eintrag zählt nicht.
    expect(parseMarkdown("- a\n- b\n\nAbsatz")[0]).toMatchObject({
      tight: true,
    });
  });

  it("merkt sich die Startnummer und trennt nach Zeichen", () => {
    expect(parseMarkdown("3. drei\n4. vier")[0]).toMatchObject({
      ordered: true,
      start: 3,
    });
    expect(parseMarkdown("- a\n+ b")).toHaveLength(2);
    expect(parseMarkdown("1. a\n1) b")).toHaveLength(2);
  });

  it("lässt eine Jahreszahl mitten im Absatz keine Liste beginnen", () => {
    expect(parseMarkdown("Rückblick\n2019. war gut")).toEqual([
      para(text("Rückblick\n2019. war gut")),
    ]);
  });

  it("liest Aufgabenlisten", () => {
    const [list] = parseMarkdown("- [ ] offen\n- [x] erledigt\n- [] kein");
    if (list.type !== "list") throw new Error("keine Liste");
    expect(list.items.map(item => item.checked)).toEqual([false, true, null]);
  });

  it("liest Tabellen mit Ausrichtung, maskiertem `|` und fehlenden Zellen", () => {
    expect(
      parseMarkdown("| A | B | C |\n|:--|:-:|--:|\n| 1 | `a\\|b` |\n")
    ).toEqual([
      {
        type: "table",
        align: ["left", "center", "right"],
        head: [[text("A")], [text("B")], [text("C")]],
        rows: [[[text("1")], [{ type: "code", value: "a|b" }], []]],
      },
    ]);
  });

  it("macht ohne passende Trennzeile keine Tabelle", () => {
    expect(parseMarkdown("a | b\n|---|---|---|")[0].type).toBe("paragraph");
  });
});

describe("Inline", () => {
  it("liest Hervorhebungen, auch verschachtelt", () => {
    expect(parseInline("**fett** *kursiv* ~~weg~~ `code`")).toEqual([
      { type: "strong", children: [text("fett")] },
      text(" "),
      { type: "emphasis", children: [text("kursiv")] },
      text(" "),
      { type: "delete", children: [text("weg")] },
      text(" "),
      { type: "code", value: "code" },
    ]);
    expect(parseInline("*a **b** c*")).toEqual([
      {
        type: "emphasis",
        children: [
          text("a "),
          { type: "strong", children: [text("b")] },
          text(" c"),
        ],
      },
    ]);
  });

  it("lässt Unterstriche in Wörtern stehen", () => {
    expect(parseInline("snake_case_name")).toEqual([text("snake_case_name")]);
    expect(parseInline("_ja_")).toEqual([
      { type: "emphasis", children: [text("ja")] },
    ]);
  });

  it("lässt alleinstehende Zeichen stehen", () => {
    expect(parseInline("2 * 3 = 6 und a*")).toEqual([text("2 * 3 = 6 und a*")]);
  });

  it("liest Maskierungen und Entitäten", () => {
    expect(
      parseInline("\\*kein\\* &amp; &copy; &#x41; &#0; &unbekannt;")
    ).toEqual([text("*kein* & © A � &unbekannt;")]);
  });

  it("liest harte Umbrüche", () => {
    expect(parseInline("a  \nb\\\nc\nd")).toEqual([
      text("a"),
      { type: "break" },
      text("b"),
      { type: "break" },
      text("c\nd"),
    ]);
  });

  it("liest Links, Bilder und Titel", () => {
    expect(parseInline('[Prusa](https://prusa3d.com "Titel")')).toEqual([
      {
        type: "link",
        href: "https://prusa3d.com",
        title: "Titel",
        children: [text("Prusa")],
      },
    ]);
    expect(parseInline("![Spule](images/a.png)")).toEqual([
      { type: "image", src: "images/a.png", alt: "Spule", title: null },
    ]);
    expect(parseInline("[a](https://x.org/foo_(bar))")[0]).toMatchObject({
      href: "https://x.org/foo_(bar)",
    });
  });

  it("verschachtelt keine Links", () => {
    const [link] = parseInline("[a [b](/x) c](/y)");
    expect(link).toMatchObject({ type: "link", href: "/y" });
    expect(plainText([link])).toBe("a [b](/x) c");
  });

  it("findet nackte Adressen ohne Satzzeichen am Ende", () => {
    expect(
      parseInline("Siehe https://prusa3d.com/x, www.example.org. (https://a.b)")
    ).toEqual([
      text("Siehe "),
      {
        type: "link",
        href: "https://prusa3d.com/x",
        title: null,
        children: [text("https://prusa3d.com/x")],
      },
      text(", "),
      {
        type: "link",
        href: "http://www.example.org",
        title: null,
        children: [text("www.example.org")],
      },
      text(". ("),
      {
        type: "link",
        href: "https://a.b",
        title: null,
        children: [text("https://a.b")],
      },
      text(")"),
    ]);
  });

  it("liest Code-Spans mit Backticks darin", () => {
    expect(parseInline("``a ` b``")).toEqual([
      { type: "code", value: "a ` b" },
    ]);
    expect(parseInline("` a `")).toEqual([{ type: "code", value: "a" }]);
    expect(parseInline("`offen")).toEqual([text("`offen")]);
  });
});

describe("Grenzen", () => {
  it("macht tiefe Verschachtelung zu Text statt zu einem Stapelüberlauf", () => {
    const deep = ">".repeat(5000) + " x";
    expect(() => parseMarkdown(deep)).not.toThrow();
    let depth = 0;
    let blocks = parseMarkdown(deep);
    while (blocks[0]?.type === "blockquote") {
      blocks = blocks[0].children;
      depth++;
    }
    expect(depth).toBeLessThanOrEqual(MAX_NESTING + 1);
  });

  /*
    Notizen haben bis zu 10 000 Zeichen, und andere Mitglieder einer
    Organisation schreiben sie. Diese Muster liefen vor den Gedächtnissen in
    `InlineParser` quadratisch oder schlimmer – bis zu Sekunden je Aufruf.
  */
  it.each([
    ["*a ", 3333],
    ["**a ", 2500],
    ["_a ", 3333],
    ["~~a ", 2500],
    ["*_", 5000],
    ["[", 10000],
    ["[a](", 2500],
    ['[a](x "', 1500],
    ["` ", 5000],
  ])("liest %j × %i schnell", (unit, count) => {
    const input = unit.repeat(count);
    const started = performance.now();
    parseMarkdown(input);
    expect(performance.now() - started).toBeLessThan(250);
  });

  it("übersteht Zufallseingaben", () => {
    const alphabet = [
      "*",
      "_",
      "~",
      "`",
      "[",
      "]",
      "(",
      ")",
      "!",
      "<",
      ">",
      "#",
      "-",
      "|",
      "\\",
      "\n",
      " ",
      "a",
      "1.",
      "&",
      "http://x",
      "\t",
      ":",
    ];
    let seed = 7;
    const random = () =>
      (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let n = 0; n < 3000; n++) {
      let input = "";
      const length = Math.floor(random() * 120);
      for (let i = 0; i < length; i++) {
        input += alphabet[Math.floor(random() * alphabet.length)];
      }
      expect(() => parseMarkdown(input)).not.toThrow();
    }
  });
});

describe("Echte Texte", () => {
  const dirs = ["src/release-notes", "src/legal"];
  const files = dirs.flatMap(dir =>
    readdirSync(dir)
      .filter(name => name.endsWith(".md") && name !== "AGENTS.md")
      .map(name => join(dir, name))
  );

  it.each(files)("%s enthält keinen verworfenen Link", file => {
    const source = readFileSync(file, "utf8");
    const rejected: string[] = [];
    const visit = (nodes: (MarkdownBlock | MarkdownInline)[]) => {
      for (const node of nodes) {
        if (node.type === "link" && node.href === null) {
          rejected.push(plainText(node.children));
        }
        if ("children" in node) visit(node.children);
        if (node.type === "list") {
          for (const item of node.items) visit(item.children);
        }
        if (node.type === "table") {
          for (const cell of [...node.head, ...node.rows.flat()]) visit(cell);
        }
      }
    };
    visit(parseMarkdown(source));
    expect(rejected).toEqual([]);
  });
});
