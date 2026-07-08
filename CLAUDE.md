# MASI-CO TV Studio — průvodce pro agenty

Interní systém, který z jídelního lístku MASI-CO postaví denní TV smyčku: extrakce menu → schválení → deck → publikace na obrazovku (a volitelně MP4 export).

## Mapa monorepa (pnpm workspace)

- `apps/web` — Next.js App Router: studio (`/den`, `/tyden`, `/sablony`, `/nastaveni`) + TV web player (`/tv`). Business logika v `src/lib` (day-launch, autopilot, weekly-import, settings-store, template-store).
- `apps/worker` — Docker worker pro MP4 render: slide → HTML (`renderToStaticMarkup(TvComposition)`) → screenshot přes headless Chromium → FFmpeg concat. `@remotion/renderer` slouží **jen** ke stažení Chrome Headless Shell (`ensureBrowser()`), nic jiného z Remotionu se nepoužívá.
- `packages/shared` — Zod schémata, `deck-builder`, `deck-audit`, `settings`, katalog šablon (`templates.ts`), alergeny.
- `packages/render` — `TvComposition`, jediný renderer slidů (viz Pasti).
- `supabase/migrations` — SQL 0001–0017; mutace jdou přes security definer RPC, ne přímé zápisy.

## Datový tok

1. `/den` (formulář) nebo `/tyden` (autopilot z fotky lístku) → RPC `import_text_menu_version` / `import_week_from_source` → `menu_versions` ve stavu `draft`.
2. Schválení dne → `approveMenuAndBuildDeck` (`apps/web/src/lib/autopilot.ts`): načte settings (`organizations.settings`) + org přepisy šablon (`loadTemplateOverrides`) → `buildDailyDeckManifest` → `auditDeck`. **Blokují jen `missing_price` / `missing_allergens`** — vizuální nálezy jsou max warning, nikdy nezastaví provoz.
3. → RPC `create_tv_deck_from_manifest` (verzuje šablony podle obsahu) → `approve_deck_version`. Publish se tady NIKDY nevolá.
4. Publikace v den D je výhradně **pull-publish**: TV si při fetch manifestu sama zavolá `auto_publish_due_deck` (`apps/web/src/lib/player-data.ts`). Žádný cron nikdy nepublikuje.

## Příkazy

- `pnpm dev` / `pnpm test` / `pnpm typecheck` / `pnpm build` (vše `pnpm -r` přes workspace).
- Worker smoke render: `pnpm worker:smoke-render` (= `WORKER_SMOKE_RENDER=1`, reálný Chromium + FFmpeg nad demo deckem).
- Worker testy s reálným prohlížečem: `WORKER_BROWSER_TESTS=1 pnpm --filter @masico/worker test`.
- Lokální DB: `supabase db reset` — vyžaduje běžící Docker.

## Pasti

- `template_versions` a `deck_versions` jsou po approve **IMMUTABLE** — vždy nová verze, nikdy update. Editor šablon řeší souběh optimisticky přes `base_version`; konflikt = HTTP 409 (`api/templates/save-version`).
- Player má **dva režimy**: `video` (MP4 z workeru) a `live` (TvComposition přímo v prohlížeči) — discriminated union `playerPayloadSchema` na poli `mode`. Oba musí zůstat funkční.
- **JEDEN renderer**: `TvComposition` kreslí editor preview, studio, TV live i MP4 frame. Nikdy nezavádět druhý renderer / duplikovat markup — rozjely by se výstupy.
- `OPENAI_API_KEY` je sensitive jen na Vercelu; lokálně v `.env.local` typicky chybí — kód musí jeho absenci přežít (demo/fallback větve).
- Cron konfigurace je **duplicitně** ve `vercel.ts` (repo root) i `apps/web/vercel.json` — při změně upravit OBA soubory.
- Mapa RPC chyb → HTTP: `rpcStatus` v `apps/web/src/lib/day-launch.ts` (a `autopilot.ts`): `28000`→401, `42501`→403, `P0002`→404, `23514`/`22023`/`23502`→422, jinak 500. Testováno v `day-launch.test.ts`.
- Zod 4: pozor na rozdíl `.prefault({})` vs `.default()` (viz `packages/shared/src/settings.ts`); `orgSettingsSchema.parse({})` musí vrátit kompletní defaulty.
- Nastavení organizace žije v `organizations.settings` (jsonb) — žádná samostatná tabulka. Zápis jen přes RPC `update_org_settings` (deep-merge + whitelist top-level klíčů).
