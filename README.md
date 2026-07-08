# MASI-CO TV Studio

Interní aplikace pro denní TV menu smyčky MASI-CO: z jídelního lístku (formulář nebo fotka) vznikne schválené menu, z něj automaticky TV smyčka, kterou si obrazovka v den D sama stáhne a publikuje.

## Architektura

Projekt je pnpm monorepo:

- `apps/web` — Next.js App Router studio a TV web player.
- `apps/worker` — Docker worker pro MP4 export: slidy renderuje přes headless Chromium (Chrome Headless Shell) a skládá FFmpegem. Závislost `@remotion/renderer` slouží pouze ke stažení prohlížeče (`ensureBrowser()`).
- `packages/shared` — Zod schémata, deck-builder, deck-audit, nastavení organizace a katalog šablon.
- `packages/render` — `TvComposition`, jediný deterministický renderer slidů (editor, studio, TV i MP4 kreslí totéž).
- `supabase/migrations` — číslované SQL migrace; zápisy jdou přes security definer RPC.

Datový tok: import menu (`import_text_menu_version` / `import_week_from_source`) → `menu_versions` (draft) → schválení dne (`approveMenuAndBuildDeck`: settings + org šablony + audit) → `create_tv_deck_from_manifest` + `approve_deck_version` → v den D si TV smyčku stáhne sama přes pull-publish (`auto_publish_due_deck`). Žádný cron nepublikuje.

## Stránky studia

- `/den/[datum]` — detail dne: kontrola cen a alergenů, jediné schvalovací tlačítko, spuštění na TV.
- `/tyden/[weekStart]` — týdenní autopilot: nahrání fotky lístku, přehled PO–PÁ se stavy a odkazy na detail dne.
- `/sablony` — vizuální editor TV šablon (verzované, immutable po schválení).
- `/nastaveni` — nastavení organizace: skladba a délky slidů, legenda alergenů, automatika, brand.
- `/tv` — web player pro obrazovky (režimy `video` a `live`).

## Role

Role členů organizace: `owner`, `admin`, `editor`, `designer`, `approver`, `publisher`, `viewer`. Role `publisher` (obsluha TV / kuchařka) smí nahrát jídelní lístek, schválit den a spustit smyčku na obrazovce — bez ní by autopilot v praxi nikdo nekrmil.

## Autopilot

Nahráním fotky týdenního lístku v `/tyden` vzniknou drafty menu pro PO–PÁ (extrakce OpenAI, datumy počítá aplikace, nikdy model). Člověk schvaluje menu (ceny a alergeny) — deck se z něj staví a schvaluje automaticky. Blokují jen chyby v datech menu (chybějící cena či alergeny); vizuální nálezy auditu jsou nanejvýš varování. Státní svátek dostane neutrální sváteční slide, aby TV nedržela včerejší ceny.

## Lokální start

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Do `.env.local` patří pouze lokální tajemství. Soubor se necommituje. `OPENAI_API_KEY` je potřeba jen pro reálnou extrakci a generování fotek; lokálně může chybět.

## Migrace

Lokální Supabase vyžaduje běžící Docker:

```bash
supabase db reset   # aplikuje migrace 0001–0017
```

## Ověření

```bash
pnpm typecheck
pnpm test
pnpm build
```

Worker navíc:

```bash
pnpm worker:smoke-render                                  # WORKER_SMOKE_RENDER=1 — reálný render demo decku
WORKER_BROWSER_TESTS=1 pnpm --filter @masico/worker test  # testy s reálným Chromiem
```

## Vercel deploy

Vercel projekt pro studio má mít Root Directory nastavený na `apps/web`.
Build command je `pnpm build` a Output Directory je `.next`.
Nenastavujte Output Directory na `apps/web/.next`, protože při rootu `apps/web` by Vercel hledal `apps/web/apps/web/.next`.
Soubor `apps/web/vercel.json` záměrně drží `outputDirectory` přímo v project rootu,
aby přepsal případný starý dashboard override. Cron konfigurace je duplicitně
ve `vercel.ts` i `apps/web/vercel.json` — změny dělejte v obou souborech.

## Bezpečnost

Klíče sdílené v chatu nebo issue trackeru považujte před produkcí za kompromitované. Pro ostrou verzi vytvořte nové OpenAI a Supabase credentials, omezte je na potřebné scope a uložte je do Vercel/Railway secrets.
