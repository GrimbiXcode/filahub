import type { TextureKind } from "@contracts/appearance";

/**
 * Die Zeichnungen je Oberfläche – als `<defs>` und als Fläche darüber, im
 * 24×24-Raum. Benutzt vom Feld in der Tabelle (`AppearanceSwatch`) und vom
 * Kern der Spule (`Spool`), die den Raum auf ihre Größe skaliert. So gibt es
 * je Oberfläche genau eine Zeichnung.
 *
 * Eigene Datei ohne Komponenten, weil React Fast Refresh Module verlangt, die
 * entweder nur Komponenten oder keine exportieren.
 */

/**
 * Die Schraffur für „kein Farbcode“ – `currentColor`, damit sie in beiden
 * Farbschemata aus den Tokens kommt. Auch von der Spule benutzt.
 */
export function hatchDefs(uid: string) {
  return (
    <pattern
      id={`${uid}-hatch`}
      width="6"
      height="6"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <rect width="2" height="6" fill="currentColor" fillOpacity="0.45" />
    </pattern>
  );
}

/*
  Feste Positionen für die Streumuster – **kein Zufall zur Laufzeit**: Ein
  Muster, das bei jedem Rendern anders fällt, flackert beim Umschalten der
  Liste und ist in keinem Vergleich prüfbar. Die Punkte decken den ganzen
  24er-Raum ab **und** die Mitte: Die Spule zeigt nur den Kreis um (12, 12)
  mit Radius 7,2 – ein Muster, das nur am Rand liegt, fehlte dort ganz.
*/

/** Kurzfasern: Anfang und Ende je Strich, drei Hauptrichtungen */
const FIBERS: readonly (readonly [number, number, number, number])[] = [
  [2, 3, 6, 4.5],
  [9, 1.5, 11, 5],
  [15, 3, 19.5, 2],
  [20, 6, 22.5, 9.5],
  [3, 9, 5, 12.5],
  [7.5, 8, 11.5, 9],
  [13, 10.5, 16.5, 8.5],
  [8, 13, 10, 16.5],
  [13.5, 14, 17.5, 15],
  [18.5, 12, 20.5, 15.5],
  [2, 17, 6, 18.5],
  [10, 19.5, 13.5, 21],
  [16, 18, 18, 21.5],
  [19.5, 20.5, 23, 19],
];

/** Einsprengsel: Mitte, Radius, und ob im Gegenton (`1`) statt in der Tinte */
const SPECKS: readonly (readonly [number, number, number, 0 | 1])[] = [
  [2.5, 2, 0.8, 0],
  [7, 3.5, 0.5, 1],
  [11.5, 1.8, 0.9, 0],
  [16, 4, 0.6, 1],
  [21, 2.5, 0.7, 0],
  [4, 7, 0.6, 0],
  [9, 6.5, 1, 0],
  [13.5, 7.5, 0.5, 1],
  [18.5, 8, 0.9, 0],
  [22.5, 7, 0.5, 1],
  [2, 12, 0.9, 1],
  [6.5, 11, 0.6, 0],
  [11, 11.5, 0.7, 1],
  [15, 12.5, 1, 0],
  [20, 12, 0.6, 0],
  [4.5, 16.5, 1, 0],
  [8.5, 15, 0.5, 1],
  [12.5, 16, 0.8, 0],
  [17, 16.5, 0.5, 1],
  [21.5, 17, 0.9, 0],
  [2, 21.5, 0.6, 1],
  [7, 20.5, 0.8, 0],
  [11.5, 22, 0.5, 0],
  [16, 21, 0.9, 0],
  [20.5, 22, 0.6, 1],
  [9.5, 9, 0.4, 0],
  [14, 14.5, 0.4, 0],
];

/** Funkelsterne: Mitte und halbe Spannweite */
const SPARKLE_STARS: readonly (readonly [number, number, number])[] = [
  [4.5, 4.5, 2],
  [18, 4, 1.6],
  // Die beiden im Ring zwischen Nabe und Rand der Spule – die Mitte deckt die
  // Nabe ab, ein Stern dort wäre nur ein Stummel.
  [8.5, 9.5, 2.2],
  [15.5, 14.8, 2.4],
  [4.5, 18, 1.7],
  [20, 19.5, 1.8],
];

/** Feiner Glitter zwischen den Sternen: Mitte und Radius */
const GLITTER: readonly (readonly [number, number, number])[] = [
  [10, 3, 0.45],
  [21.5, 9, 0.4],
  [2.5, 11, 0.4],
  [8, 8.5, 0.5],
  [15.5, 8, 0.4],
  [9, 15, 0.45],
  [15, 14.5, 0.5],
  [11, 20, 0.4],
  [22, 21.5, 0.45],
  [7.5, 22, 0.35],
  [14.5, 18.5, 0.35],
  [20.5, 13, 0.35],
];

/** Vierstrahliger Stern als Pfad – schlank, damit er als Funkeln liest */
function starPath(x: number, y: number, r: number) {
  const w = r * 0.26;
  return (
    `M${x} ${y - r}L${x + w} ${y - w}L${x + r} ${y}L${x + w} ${y + w}` +
    `L${x} ${y + r}L${x - w} ${y + w}L${x - r} ${y}L${x - w} ${y - w}Z`
  );
}

/**
 * Mattes Rauschen. `feColorMatrix` färbt die Turbulenz **in den Ton** statt sie
 * auf Graustufen zu ziehen: Graues Rauschen verschwindet auf grauem Grund, und
 * Grau ist bei Filament keine Seltenheit. Benutzt von Matt und Satin.
 */
function noiseFilter(uid: string, ink: string) {
  return (
    <filter id={`${uid}-noise`} x="0" y="0" width="100%" height="100%">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.9"
        numOctaves="2"
        stitchTiles="stitch"
        result="noise"
      />
      <feColorMatrix
        in="noise"
        type="matrix"
        values={
          ink === "#ffffff"
            ? // Rauschen als helle Flecken
              "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1 0 0 0 -0.4"
            : // Rauschen als dunkle Flecken
              "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 -0.4"
        }
      />
    </filter>
  );
}

/**
 * Die `<defs>` je Musterart.
 *
 * Getrennt vom Zeichnen, weil ein Verlauf oder Filter erst deklariert und dann
 * benutzt wird – und weil so je Art genau eine Stelle zu lesen ist.
 *
 * Exportiert, weil die Spule (`Spool.tsx`) dieselben Muster in ihrem Kern
 * zeichnet – größer, aber es bleibt **eine** Zeichnung je Oberfläche.
 */
export function textureDefs(
  kind: TextureKind,
  uid: string,
  ink: string,
  counter: string
) {
  switch (kind) {
    // Mattes Rauschen, siehe `noiseFilter`.
    case "matte":
      return noiseFilter(uid, ink);

    /*
      Seidenglanz: **ein** breites, weiches Band quer über die Fläche – nicht
      zwei helle Ecken. Der erste Versuch verlief von Ecke zu Ecke und war auf
      Weiß wie auf Schwarz kaum von „ohne Muster" zu unterscheiden; er las sich
      als Schatten, nicht als Glanz. Weiche Kanten sind der Unterschied zu
      `glossy`, nicht geringere Deckkraft.
    */
    case "silk":
      return (
        <linearGradient id={`${uid}-silk`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={ink} stopOpacity="0.06" />
          <stop offset="28%" stopColor={ink} stopOpacity="0" />
          <stop offset="50%" stopColor={ink} stopOpacity="0.48" />
          <stop offset="72%" stopColor={ink} stopOpacity="0" />
          <stop offset="100%" stopColor={ink} stopOpacity="0.06" />
        </linearGradient>
      );

    /*
      Metallic braucht beide Töne: harte helle und dunkle Bänder, sonst sieht es
      aus wie Seide. Der Gegenton liegt schwächer darauf – er hat auf dieser
      Grundfarbe den geringeren Kontrast, deshalb trägt er nicht die Zeichnung,
      sondern nur die Tiefe.
    */
    case "metallic":
      return (
        <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={counter} stopOpacity="0.2" />
          <stop offset="22%" stopColor={ink} stopOpacity="0.45" />
          <stop offset="38%" stopColor={counter} stopOpacity="0.2" />
          <stop offset="58%" stopColor={ink} stopOpacity="0.5" />
          <stop offset="74%" stopColor={counter} stopOpacity="0.2" />
          <stop offset="100%" stopColor={ink} stopOpacity="0.4" />
        </linearGradient>
      );

    // Schachbrett wie in Bildbearbeitungen – die verbreitete Chiffre für
    // „durchsichtig“.
    case "transparent":
      return (
        <pattern
          id={`${uid}-checker`}
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
        >
          <rect width="8" height="8" fill={counter} fillOpacity="0.25" />
          <rect width="4" height="4" fill={ink} fillOpacity="0.3" />
          <rect x="4" y="4" width="4" height="4" fill={ink} fillOpacity="0.3" />
        </pattern>
      );

    /*
      Leuchten als **Hof**, nicht als Fleck. Ein gefüllter Mittelpunkt war auf
      hellen Farben ein dunkles Loch – das Gegenteil der Aussage. Ein Ring liest
      sich in beide Richtungen als Abstrahlung: hell auf dunklem Grund, dunkel
      auf hellem, in beiden Fällen als etwas, das von der Mitte ausgeht.
    */
    case "glow":
      return (
        <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={ink} stopOpacity="0" />
          <stop offset="30%" stopColor={ink} stopOpacity="0.12" />
          <stop offset="52%" stopColor={ink} stopOpacity="0.55" />
          <stop offset="74%" stopColor={ink} stopOpacity="0.18" />
          <stop offset="100%" stopColor={ink} stopOpacity="0" />
        </radialGradient>
      );

    /*
      Satin: dasselbe Band wie Silk, aber breit und flach – ohne helle Mitte,
      mit halber Deckkraft. Darunter ein Hauch Rauschen wie bei Matt, denn
      Satin liegt zwischen beiden. Auf 24 px unterscheidet es sich von Silk am
      fehlenden Glanzstreifen, von Matt am Schimmer.
    */
    case "satin":
      return (
        <>
          <linearGradient id={`${uid}-satin`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={ink} stopOpacity="0" />
            <stop offset="18%" stopColor={ink} stopOpacity="0.1" />
            <stop offset="50%" stopColor={ink} stopOpacity="0.26" />
            <stop offset="82%" stopColor={ink} stopOpacity="0.1" />
            <stop offset="100%" stopColor={ink} stopOpacity="0" />
          </linearGradient>
          {noiseFilter(uid, ink)}
        </>
      );

    case "glossy":
    case "wood":
    case "fiber":
    case "speckle":
    case "sparkle":
    case "marble":
    case "plain":
      return null;
  }
}

/** Die Zeichnung je Musterart, über der Grundfläche – im 24×24-Raum. */
export function textureOverlay(
  kind: TextureKind,
  uid: string,
  ink: string,
  counter: string
) {
  switch (kind) {
    case "plain":
      return null;

    case "matte":
      return (
        <rect
          width="24"
          height="24"
          filter={`url(#${uid}-noise)`}
          opacity="0.75"
        />
      );

    // Zwei Glanzstriche, wie das Licht einer Lampe auf einer runden Spule.
    case "glossy":
      return (
        <g transform="rotate(-30 12 12)">
          <rect
            x="1"
            y="-6"
            width="4"
            height="36"
            fill={ink}
            fillOpacity="0.55"
          />
          <rect
            x="7"
            y="-6"
            width="2"
            height="36"
            fill={ink}
            fillOpacity="0.3"
          />
        </g>
      );

    case "silk":
      return <rect width="24" height="24" fill={`url(#${uid}-silk)`} />;

    case "metallic":
      return <rect width="24" height="24" fill={`url(#${uid}-metal)`} />;

    /*
      Faserverstärkt: kurze Striche in wenigen Richtungen – so sieht eine
      Kurzfaser im Strang aus, egal ob Kohle, Glas oder Aluminium. Bis 4.4.0
      stand hier ein Köpergewebe; das zeigt ein Laminat, kein Filament.
    */
    case "fiber":
      return (
        <g stroke={ink} strokeLinecap="round" strokeWidth="0.9">
          {FIBERS.map(([x1, y1, x2, y2], index) => (
            <line
              key={index}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeOpacity={index % 3 === 1 ? 0.3 : 0.55}
            />
          ))}
        </g>
      );

    case "satin":
      return (
        <>
          <rect
            width="24"
            height="24"
            filter={`url(#${uid}-noise)`}
            opacity="0.3"
          />
          <rect width="24" height="24" fill={`url(#${uid}-satin)`} />
        </>
      );

    /*
      Gesprenkelt: runde, deckende Punkte in Tinte **und** Gegenton – stoneFill
      und Terrazzo haben dunkle und helle Einsprengsel zugleich. Der Gegenton
      trägt nicht die Zeichnung (er hat auf dieser Grundfarbe den geringeren
      Kontrast), er macht sie zum Gemisch.
    */
    case "speckle":
      return (
        <g>
          {SPECKS.map(([cx, cy, r, tone], index) => (
            <circle
              key={index}
              cx={cx}
              cy={cy}
              r={r}
              fill={tone === 0 ? ink : counter}
              fillOpacity={tone === 0 ? 0.7 : 0.5}
            />
          ))}
        </g>
      );

    /*
      Glitzernd: spitze Sterne und feine Punkte, nur in der Tinte – hell und
      spitz statt rund und matt wie beim Sprenkel. Galaxy ist dieselbe
      Zeichnung; die dunkle Grundfarbe bringt das Material mit.
    */
    case "sparkle":
      return (
        <g fill={ink}>
          {SPARKLE_STARS.map(([x, y, r], index) => (
            <path key={index} d={starPath(x, y, r)} fillOpacity="0.85" />
          ))}
          {GLITTER.map(([cx, cy, r], index) => (
            <circle key={index} cx={cx} cy={cy} r={r} fillOpacity="0.7" />
          ))}
        </g>
      );

    /*
      Marmoriert: zwei kräftige Adern und eine feine, geschwungen und
      ungleich – gleichmäßige Wellen sähen nach Muster aus, nicht nach Stein.
      Eine Ader läuft durch die Mitte, damit die Spule sie zeigt.
    */
    case "marble":
      return (
        <g fill="none" stroke={ink} strokeLinecap="round">
          <path
            d="M-1 6 C 5 3, 8 10, 13 8 S 20 3, 25 5"
            strokeOpacity="0.45"
            strokeWidth="1.2"
          />
          <path
            d="M-1 17 C 4 13, 9 15, 12 12 S 18 15, 25 11"
            strokeOpacity="0.5"
            strokeWidth="1.4"
          />
          <path
            d="M3 25 C 6 20, 5 16, 12 12 M16 -1 C 14 4, 17 7, 13 8"
            strokeOpacity="0.3"
            strokeWidth="0.6"
          />
        </g>
      );

    /*
      Das Schachbrett liegt halbdurchsichtig über der Farbe – so scheint beides
      durcheinander, und genau das ist die Aussage: Ein transparentes Filament
      zeigt, was hinter ihm liegt.
    */
    case "transparent":
      return (
        <rect
          width="24"
          height="24"
          fill={`url(#${uid}-checker)`}
          opacity="0.55"
        />
      );

    case "glow":
      return <rect width="24" height="24" fill={`url(#${uid}-glow)`} />;

    // Maserung: gebogene Linien in ungleichen Abständen, wie Jahresringe im
    // Anschnitt. Gleichmäßige Striche sähen nach Zebra aus, nicht nach Holz.
    case "wood":
      return (
        <g
          fill="none"
          stroke={ink}
          strokeOpacity="0.35"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <path d="M2 -1 C 7 6, 7 18, 2 25" />
          <path d="M8 -1 C 13 6, 13 18, 8 25" />
          <path d="M13 -1 C 17 6, 17 18, 13 25" />
          <path d="M19 -1 C 23 6, 23 18, 19 25" />
        </g>
      );
  }
}
