# MASI-CO TV Studio

Interni aplikace pro denni TV menu smycky MASI-CO. Projekt je pnpm monorepo:

- `apps/web` - Next.js App Router studio a TV web player.
- `apps/worker` - Docker worker pro AI joby, Remotion a FFmpeg export.
- `packages/shared` - Zod schemata, typy, konstanty a katalog alergenu.
- `packages/render` - deterministicke TV kompozice.

## Lokalni start

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Do `.env.local` patri pouze lokalni tajemstvi. Soubor se necommituje.

## Overeni

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Vercel deploy

Vercel projekt pro studio ma mit Root Directory nastaveny na `apps/web`.
Build command je `pnpm build` a Output Directory je `.next`.
Nenastavujte Output Directory na `apps/web/.next`, protoze pri rootu `apps/web` by Vercel hledal `apps/web/apps/web/.next`.
Soubor `apps/web/vercel.json` zamerne drzi `outputDirectory` primo v project rootu,
aby prepsal pripadny stary dashboard override.

## Bezpecnost

Klice sdilene v chatu nebo issue trackeru povazujte pred produkci za kompromitovane. Pro ostrou verzi vytvorte nove OpenAI a Supabase credentials, omezte je na potrebne scope a ulozte je do Vercel/Railway secrets.
