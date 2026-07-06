# MASI-CO TV Studio UI Interaction Audit

This report is deliberately skeptical. It inventories visible controls and screenshot proof points, then highlights what still needs human/browser/OCR review.

## Summary

- Screenshot targets: 6
- Screenshot artifacts checked: 12
- Missing screenshot artifacts: 0
- Interactive elements inventoried: 29
- Disabled controls: 13
- Elements with audit issues: 6
- Visual audit presentations/templates: 10/10

## Critical Notes

- All configured screenshot artifact paths currently exist.
- Static scan found 6 controls needing critique before production confidence.
- 2 UI links point directly at API routes; verify auth, content type, and failure states in browser.
- The 10+10 visual audit data contract is intact.

## Screenshot Evidence

- desktop Dnes / provozni dashboard (/): exists, 1440x1100 - audit-artifacts/final-desktop-home.png
- mobile Dnes / provozni dashboard (/): exists, 390x844 - audit-artifacts/final-mobile-home.png
- desktop Produkční studio lock (env:NEXT_PUBLIC_APP_ENV=production /): exists, 1280x720 - audit-artifacts/final-production-locked-studio.png
- mobile Produkční studio lock (env:NEXT_PUBLIC_APP_ENV=production /): exists, 1280x720 - audit-artifacts/final-production-login.png
- desktop Vizuální audit 10 + 10 (/audit): exists, 1440x1000 - audit-artifacts/final-audit-desktop-viewport.png
- mobile Vizuální audit 10 + 10 (/audit): exists, 390x900 - audit-artifacts/final-audit-mobile-viewport.png
- desktop Readiness audit (/readiness): exists, 1440x1000 - audit-artifacts/final-readiness-desktop.png
- mobile Readiness audit (/readiness): exists, 390x900 - audit-artifacts/final-readiness-mobile.png
- desktop TV web player (/tv/screen-demo): exists, 1920x1080 - audit-artifacts/final-desktop-tv-player.png
- mobile TV web player (/tv/screen-demo): exists, 390x844 - audit-artifacts/final-mobile-tv-player.png
- desktop Worker smoke MP4 export (worker:smoke-render): exists, 1920x1080 - audit-artifacts/final-smoke-render-frame.png
- mobile Worker smoke MP4 export (worker:smoke-render): exists - audit-artifacts/final-smoke-render.mp4

## Interactive Inventory

### /audit

- apps/web/src/app/audit/page.tsx:51 anchor enabled "10 prezentací" -> #prezentace
- apps/web/src/app/audit/page.tsx:52 anchor enabled "10 šablon" -> #sablony
- apps/web/src/app/audit/page.tsx:53 anchor enabled "Readiness P0/P1" -> /readiness

### /login

- apps/web/src/app/login/page.tsx:34 link enabled "Zpět na studio" -> /

### /

- apps/web/src/app/page.tsx:92 button disabled "Použít včerejšek - nenapojeno"
- apps/web/src/app/page.tsx:128 button disabled "{location.action}" [disabled_state_needs_clearer_reason]
- apps/web/src/app/page.tsx:194 button disabled "Vrátit verzi - není archiv"
- apps/web/src/app/page.tsx:215 button disabled "Naplánovat týden - plánováno" [disabled_state_needs_clearer_reason]
- apps/web/src/app/page.tsx:246 button disabled "Import menu - čeká na produkční tok"
- apps/web/src/app/page.tsx:250 button disabled "Spárovat TV - čeká na UI"
- apps/web/src/app/page.tsx:420 button disabled "Otevřít workflow - čeká na detail"
- apps/web/src/app/page.tsx:96 anchor enabled "Vyzkoušet vložení textu" -> #kontrola-menu
- apps/web/src/app/page.tsx:123 anchor enabled "{location.action}" -> location.actionHref
- apps/web/src/app/page.tsx:186 anchor enabled "Otevřít demo přehrávač" -> /tv/screen-demo
- apps/web/src/app/page.tsx:190 anchor enabled "Stáhnout demo MP4" -> /api/exports/export-demo/download [direct_api_link_needs_runtime_access_check]

### component:LoginForm

- apps/web/src/components/LoginForm.tsx:75 button disabled "{isSubmitting ? "Přihlašuji..." : "Přihlásit se"}" [label_too_long_for_fast_scan, disabled_state_needs_clearer_reason]

### component:MenuReview

- apps/web/src/components/MenuReview.tsx:99 button enabled "Zpracovat lokálně"
- apps/web/src/components/MenuReview.tsx:103 button enabled "Vrátit ukázku"
- apps/web/src/components/MenuReview.tsx:257 button disabled "{publishReadiness.canPublish
                ? "Publikovat - čeká na produkční RPC"
                : "Publikovat - čeká na schválení"}" [label_too_long_for_fast_scan]
- apps/web/src/components/MenuReview.tsx:263 anchor enabled "Otevřít demo přehrávač" -> /tv/screen-demo
- apps/web/src/components/MenuReview.tsx:267 anchor enabled "Stáhnout demo MP4" -> /api/exports/export-demo/download [direct_api_link_needs_runtime_access_check]

### component:StudioShell

- apps/web/src/components/StudioShell.tsx:54 link enabled "Přihlásit se" -> access.loginHref
- apps/web/src/components/StudioShell.tsx:89 link enabled "{item.label}" -> item.href

### component:TvStudioClient

- apps/web/src/components/TvStudioClient.tsx:30 button enabled "{slide.title}"
- apps/web/src/components/TvStudioClient.tsx:50 button enabled "Bezpečný okraj"
- apps/web/src/components/TvStudioClient.tsx:58 button disabled "Schválení náhledu - nenapojeno"
- apps/web/src/components/TvStudioClient.tsx:98 button disabled "Zkrátit názvy - nenapojeno"
- apps/web/src/components/TvStudioClient.tsx:101 button disabled "Rozdělit menu - nenapojeno"
- apps/web/src/components/TvStudioClient.tsx:104 button disabled "Generovat pozadí - nenapojeno"

## Elements Requiring Critique

- apps/web/src/app/page.tsx:128 button "{location.action}"
  Issues: disabled_state_needs_clearer_reason
- apps/web/src/app/page.tsx:215 button "Naplánovat týden - plánováno"
  Issues: disabled_state_needs_clearer_reason
- apps/web/src/app/page.tsx:190 anchor "Stáhnout demo MP4"
  Issues: direct_api_link_needs_runtime_access_check
- apps/web/src/components/LoginForm.tsx:75 button "{isSubmitting ? "Přihlašuji..." : "Přihlásit se"}"
  Issues: label_too_long_for_fast_scan, disabled_state_needs_clearer_reason
- apps/web/src/components/MenuReview.tsx:257 button "{publishReadiness.canPublish
                ? "Publikovat - čeká na produkční RPC"
                : "Publikovat - čeká na schválení"}"
  Issues: label_too_long_for_fast_scan
- apps/web/src/components/MenuReview.tsx:267 anchor "Stáhnout demo MP4"
  Issues: direct_api_link_needs_runtime_access_check

## OCR / 3m Readability Council Prompts

### OCR rada

- Question: Ktere texty ze screenshotu by obsluha nebo host neprecetl do 3 sekund ze vzdalenosti 3 metru?
- Why it matters: TV signage selze, pokud je hezke, ale nefunguje na skutecne obrazovce v jidelne.

### Funkcni rada

- Question: Ktere tlacitko vypada aktivne, ale nema bezpecny backendovy efekt nebo jasny disabled stav?
- Why it matters: Falesna interaktivita nici duveru personalu a maskuje nedokoncene workflow.

### Fakticka rada

- Question: Kde by AI mohla zmenit cenu, alergen, datum nebo nazev jidla bez viditelneho reapproval?
- Why it matters: Ceny a alergeny jsou fakta, ne kreativni text. Musi zustat auditovatelne.

### Krizova rada

- Question: Co uvidi personal a TV, kdyz spadne OpenAI, Supabase, worker, sit nebo fyzicka televize?
- Why it matters: Jidelna potrebuje posledni dobrou verzi a jednoduche zotaveni, ne technickou chybu.

### Nakladova rada

- Question: Kde muze personal omylem spustit drahe high-quality generovani bez viditelneho budgetu?
- Why it matters: AI obrazky jsou uzitecne, ale musi mit rozpoctove brzdy a schvaleni.

## Next Browser Pass

- Capture fresh desktop and mobile screenshots for every screenshot target after each material UI change.
- Click every enabled control once in demo mode and record whether it mutates state, navigates, downloads, or is decorative.
- OCR or manually transcribe screenshot text from three-metre viewing distance and flag text that cannot be read in under three seconds.
- Verify that disabled production controls explain why they are disabled and what unlocks them.
- Compare the TV player with and without a token so demo content never masks a production authorization failure.
