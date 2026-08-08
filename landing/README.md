# Landing page

The public product page, published to
<https://grimbixcode.github.io/filahub/> by
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml) on every push to
`main` that touches this directory.

Plain HTML and CSS, no build step and no external requests — `index.html`,
`style.css` and the PNGs in `assets/` are the whole thing. To work on it, open
`index.html` in a browser.

The colour tokens at the top of `style.css` are the app's own dark theme from
[`src/index.css`](../src/index.css), converted from HSL to hex, plus the
fill-level ramp from [`src/lib/format.ts`](../src/lib/format.ts) (orange at
25 % and under, yellow to 50 %, green above). Keep them in sync if the app's
theme changes — the page is dark only, so there is no light variant to update.

## Regenerating the screenshots

`assets/*.png` are captured from a real instance, so they go stale when the UI
changes. To redo them:

1. Start a throwaway database:

   ```bash
   docker run -d --name filahub-landing-db -p 127.0.0.1:5434:5432 -e POSTGRES_DB=filahub -e POSTGRES_USER=filahub -e POSTGRES_PASSWORD=filahub postgres:17-alpine
   ```

2. Apply the migrations and seed the preset catalogue against it:

   ```bash
   DATABASE_URL='postgres://filahub:filahub@127.0.0.1:5434/filahub' npx drizzle-kit migrate
   ```

   ```bash
   DATABASE_URL='postgres://filahub:filahub@127.0.0.1:5434/filahub' npm run db:seed
   ```

3. Run the dev server against it with `DEV_LOGIN=1` and
   `DEV_LOGIN_NAME=Demo` — the `filahub-landing` entry in
   [`.claude/launch.json`](../.claude/launch.json) has the full command — then
   open `/api/dev-login` once to create the account.

4. Set the account to the **English interface** (`users.language = 'en'`) with
   the `en-GB` regional format and EUR — the page is in English, so the
   screenshots have to be too. Then insert sample materials, spool types,
   storage boxes and weigh-ins, with English notes and box names.

   The numbers on the page (nine materials, 6,508 g remaining, three under 25%,
   and the 1,954 − 140 − 1,450 = 364 g weigh-in) come from that data, so update
   the copy if you change it.

5. Capture at 1440 × 1000 CSS pixels, dark theme, device scale factor 1.5;
   `mobile.png` at 390 × 844 with factor 2.

6. Stop the container: `docker rm -f filahub-landing-db`.

Two things that stay German no matter the interface language, because they are
**data rather than interface**: the seeded preset catalogue (`Kunststoffspule`,
`Kartonspule (ab 2021)` — see `db/presets/catalog.ts`) and the JSON keys of the
bulk import (`typ`, `hersteller` …, fixed by `contracts/import.ts`). Both are
visible in `presets.png` and `import.png`. The date inside `import.png` is
rendered by the browser's own `<input type="date">` and follows the operating
system, not the app.
