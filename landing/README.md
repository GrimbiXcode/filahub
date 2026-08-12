# Landing page

The public product page, published to
<https://grimbixcode.github.io/filahub/> by
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml) on every push to
`main` that touches this directory.

Before the first run, set **Settings → Pages → Source** to **GitHub Actions**
once. The workflow cannot do it for you: its token is not allowed to create a
Pages site, so the job fails until the setting exists.

Plain HTML and CSS, no build step and no external requests — `index.html`,
`style.css` and the PNGs in `assets/` are the whole thing. To work on it, open
`index.html` in a browser.

`landing/` is **not** in `.prettierignore`, so `npm run format:check` covers
both files and CI fails on a stray line break. Run `npx prettier --write
landing/` before committing.

## Colours

The colour tokens at the top of `style.css` are the app's own dark theme from
[`src/index.css`](../src/index.css), converted from HSL to hex, plus the
fill-level ramp from [`src/lib/format.ts`](../src/lib/format.ts). The ramp has
**four** steps, not three: red at 10 % and under, orange to 25 %, yellow to
50 %, green above. Keep them in sync if the app's theme changes — the page is
dark only, so there is no light variant to update.

The ramp values come from Tailwind's palette, and **Tailwind 4 restated that
palette in OKLCH**, so `emerald-500` and friends no longer resolve to the hexes
Tailwind 3 shipped. Do not copy them out of any documentation. Measure them
from a freshly captured screenshot instead — decode `assets/overview.png` and
read the pixels out of a fill bar — so that the swatches on the page and the
bars in the screenshots are the same colour.

## Regenerating the screenshots

`assets/*.png` are captured from a real instance, so they go stale when the UI
changes. There are ten of them: `overview`, `weighing`, `detail`, `stores`,
`containers`, `presets`, `friends`, `organizations`, `import` and `mobile`.

1. Start a throwaway database. With Docker:

   ```bash
   docker run -d --name filahub-landing-db -p 127.0.0.1:5434:5432 -e POSTGRES_DB=filahub -e POSTGRES_USER=filahub -e POSTGRES_PASSWORD=filahub postgres:17-alpine
   ```

   Without Docker, a local cluster does just as well — it only has to hold
   sample data, and PostgreSQL 16 applies the migrations too. `initdb` refuses
   to run as root, so use an unprivileged account:

   ```bash
   runuser -u postgres -- /usr/lib/postgresql/16/bin/initdb -D /var/lib/postgresql/landing-pgdata -U filahub --auth=trust
   runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/landing-pgdata -o "-p 5434" -w start
   runuser -u postgres -- /usr/lib/postgresql/16/bin/createdb -h 127.0.0.1 -p 5434 -U filahub filahub
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
   screenshots have to be too. Then insert sample data.

   Four things the sample data has to contain, or a screenshot loses its point:

   - **At least two stores.** With exactly one, the store switcher hides itself
     (`AuthLayout.tsx`), and half of what `stores.png` and `overview.png` are
     there to show disappears.
   - **One material at 10 % or below**, so the red step of the ramp appears
     somewhere. Nothing else on the page proves it exists.
   - **A weighing history of four entries** on the material behind
     `detail.png`, which is what makes it a consumption record rather than a
     number.
   - **A second user account.** `friends.png` and `organizations.png` need
     somebody on the other side, and `DEV_LOGIN` only ever creates one account.
     Insert the row directly and set the friendship, the per-store shares and
     the organization memberships in SQL.

   The numbers in the copy come from that data — nine materials, 4,194 g
   remaining, three running low, and the 1,954 − 140 − 1,450 = 364 g weigh-in
   on `F01`. **Update the copy if you change the data**, including the
   figcaptions and the `.ledger` block in the hero.

5. Capture at 1440 × 1000 CSS pixels, dark theme, device scale factor 1.5;
   `mobile.png` at 390 × 844 with factor 2. Short pages (`stores`,
   `containers`) look better in a lower window than in a tall one with half of
   it empty — the height is the one value worth varying per shot.

6. Stop the container: `docker rm -f filahub-landing-db`.

One thing stays German no matter the interface language, because it is **data
rather than interface**: the JSON keys of the bulk import (`typ`,
`hersteller` …), fixed by `contracts/import.ts` and visible in `import.png`.
The preset catalogue is _not_ in that category any more — entries carry a
`nameI18n` and `resolveName` picks the language, so `presets.png` reads
"Cardboard spool (from 2021)" rather than "Kartonspule (ab 2021)". The date
inside `import.png` is rendered by the browser's own `<input type="date">` and
follows the operating system, not the app.
