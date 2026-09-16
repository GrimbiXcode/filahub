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
    /*
      Mattes Rauschen. `feColorMatrix` färbt die Turbulenz **in den Ton** statt
      sie auf Graustufen zu ziehen: Graues Rauschen verschwindet auf grauem
      Grund, und Grau ist bei Filament keine Seltenheit.
    */
    case "matte":
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

    /*
      Köperbindung: zwei versetzte Schrägrechtecke, wie das Gewebe eines
      Karbonlaminats. Sechs Einheiten Kachel auf 24 – vier Wiederholungen, mehr
      wäre bei 24 Pixeln Matsch.
    */
    case "carbon":
      return (
        <pattern
          id={`${uid}-carbon`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
        >
          <rect width="3" height="3" fill={ink} fillOpacity="0.4" />
          <rect x="3" y="3" width="3" height="3" fill={ink} fillOpacity="0.4" />
          <rect x="3" width="3" height="3" fill={counter} fillOpacity="0.15" />
          <rect y="3" width="3" height="3" fill={counter} fillOpacity="0.15" />
        </pattern>
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

    case "glossy":
    case "wood":
    case "plain":
      return null;
  }
}

/** Die Zeichnung je Musterart, über der Grundfläche – im 24×24-Raum. */
export function textureOverlay(kind: TextureKind, uid: string, ink: string) {
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

    case "carbon":
      return <rect width="24" height="24" fill={`url(#${uid}-carbon)`} />;

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
