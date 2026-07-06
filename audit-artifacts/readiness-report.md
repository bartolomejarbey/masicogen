# MASI-CO TV Studio Readiness Report

This report is intentionally critical. A passing build is not treated as proof that the product is production-ready.

## Risk Summary

- P0: 5
- P1: 5
- P2: 1

## Gate Summary

- open: 0
- partial: 9
- passing: 9

## Findings

### P0 - Produkční studio i browser API jsou za Supabase session, ale chybí DB role testy

- Category: Bezpecnost
- Status: partial
- Evidence: StudioShell, homepage a interní browser route handlery chat/upload/render/pair/export/import používají cookie-backed Supabase Auth, aktivní org_memberships roli a requireStudioApiAccess role skupiny. Auth je vyžadovaný pro production-like NODE_ENV, demo API nepoužívá service-role integrace a migrace 202607060006 zpřísňuje location-scoped RLS.
- Impact: Anonymní návštěvník už nemá vidět demo studio ani volat studio API bez session; přihlášená produkční homepage už neukazuje demo provozovny, ale zbývá prokázat RLS/cross-org/location-scope chování proti reálné Supabase DB.
- Next action: Doplnit integrační testy pro editor/approver/publisher/viewer, cross-org/location-scope import, export/render lookup a nasazenou RLS migraci.

### P0 - Fotka/PDF/OCR import neni jeste funkcni end-to-end

- Category: Menu spine
- Status: partial
- Evidence: Textovy import ma validovanou route /api/menus/import-text a Supabase RPC import_text_menu_version pro menu_sources, menus, menu_versions a menu_entries; PDF/fotka/OCR a produkcni UI napojeni stale chybi.
- Impact: Denní provoz muze z textu vytvorit auditovatelnou DB verzi menu, ale zatim nemuze spolehlive prejit z fotky nebo PDF do schvalene verze.
- Next action: Napojit upload intent na menu_sources, OpenAI Structured Outputs extrakci, kontrolu zdroje, UI import obrazovku a DB smoke test ulozeni.

### P0 - Schvaleni a publikace maji gate/RPC zaklad, ale nejsou jeste end-to-end v UI

- Category: Schvalovani
- Status: partial
- Evidence: Shared evaluatePublishReadiness blokuje publish bez content/layout/export potvrzeni a migrace 202607060003 pridava approve_menu_version, approve_deck_version a publish_deck_to_screen RPC s audit_log zapisem.
- Impact: Systém uz ma konkretni control point pro lidske schvaleni, ale personal ho zatim nevola pres Supabase Auth UI a DB integrační test.
- Next action: Napojit Supabase session do UI, zavolat RPC pres server action, pridat role/cross-org/publish rollback testy.

### P0 - Worker umi persistovat final MP4 export, ale publish UI/DB smoke stale chybi

- Category: Render
- Status: partial
- Evidence: Worker smoke render vytvari 27s MP4, UI umi stahnout lokalni export-demo a worker final render ma persistFinalMp4Export pro Storage upload, assets row, exports row a job_events. Chybi overeni proti realne Supabase Storage/DB a UI publish pointer.
- Impact: USB fallback je lokalne prokazatelny a produkcni export persistence ma kodovy zaklad, ale ostrý provoz stale nema prokazany schvaleny export navazany na screen publish.
- Next action: Spustit worker proti Supabase DB/Storage, overit exports row, signed download, publish_deck_to_screen a TV player manifest pro schvalenou deck_version.

### P0 - TV player uz nemaskuje produkcni chybu demo menum, ale last-known-good jeste chybi

- Category: TV player
- Status: partial
- Evidence: Lokální demo prehrava realne MP4; production /tv bez screen tokenu zobrazi provozni hlasku 'Obrazovka není spárovaná' misto demo menu nebo raw Manifest 401. Produkcni offline cache a restore pointer stale nejsou hotove.
- Impact: TV bez autorizace uz nevypada jako spravne publikovana smycka a neukazuje technicky raw error, ale ostrý provoz stale potrebuje posledni dobrou verzi pri expiraci URL nebo vypadku site.
- Next action: Doplnit produkcni last-known-good cache, preloading na hrane smycky a offline reload test.

### P1 - Service role je server-only, ale potrebuje uzsi RPC hranice

- Category: Bezpecnost
- Status: partial
- Evidence: Browser API uz odvozuji orgId ze Supabase membership; demo mode nepousti signed upload/render service-role cestu a export download kontroluje org-scoped Storage cestu. Server stale pouziva service role klienta uvnitr nekterych route handleru.
- Impact: Chyba v serverovem route handleru by stale mohla obejit RLS, i kdyz uzivatel nema moznost poslat vlastni orgId v produkci a export path ma aplikacni i DB pojistku.
- Next action: Nahradit primy service-role zapis uzkymi RPC funkcemi, pridat composite org_id FK testy a auditovat vsechny admin klienty.

### P1 - Parovani obrazovky neni obsluze viditelne jako hotovy tok

- Category: TV player
- Status: partial
- Evidence: Player umi token v URL/localStorage, ale admin nema kompletni parovaci obrazovku s jednorazovym kodem.
- Impact: Instalace na fyzicke TV by vyzadovala technicky zasah misto samostatneho kroku pro personal.
- Next action: Doplnit screens page: vytvorit kod, ukazat token stav, posledni heartbeat a rotaci tokenu.

### P1 - UI audit ma inventar controls, ale jeste ne plny browser/OCR crawl

- Category: UI/UX audit
- Status: partial
- Evidence: Stranka /audit obsahuje 10+10 kritickych scenaru a pnpm audit:ui generuje ui-interaction-audit.md s inventarem route, screenshot artefaktu, tlacitek, linku a statickych problemu.
- Impact: Kritika uz neni jen kuratorovany katalog, ale stale sama neprokazuje kliknuti kazdeho tlacitka, OCR cteni ani pixel kontrast ve finalnim TV renderu.
- Next action: Doplnit browser click-through crawl, OCR/kontrast metriky, DOM inventory diff a automaticke screenshot assertions pro produkcni negativni stavy.

### P1 - Worker leasing/retry byl slabina a zustava potreba DB smoke test

- Category: Worker
- Status: partial
- Evidence: Kod nove pouziva lease token pro finalni update a recoveruje expired leases, ale neni overeny proti realne Supabase DB.
- Impact: Bez DB testu stale neni prokazane, ze dva workery neprepisou stejnou praci nebo nezaseknou job.
- Next action: Pridat integračni test running jobu s proslym lease_expires_at a soubezne lease race.

### P1 - gpt-image-2 background generator nema jeste provozni guardrails v UI

- Category: AI kreativita
- Status: open
- Evidence: Prompt pravidla jsou v planu a asistent ukazuje copy, ale generovani assetu neni napojene.
- Impact: Bez kontroly textu, kontrastu a safe plochy by AI obraz mohl snizit citelnost nebo obsahovat falešny text.
- Next action: Postavit asset draft/final flow s promptem bez textu, schvalenim a contrast/safe-area validaci.

### P2 - Mobilni režim je vhodny pro kontrolu, ale nejasne oddeluje nouzove upravy od studia

- Category: Mobil
- Status: partial
- Evidence: Responsive layout pada do jednoho sloupce a navigace je horizontalni; detailni studio zustava na mobilu dostupne.
- Impact: Personal muze zkusit delat slozitou layout praci na telefonu a narazit na frustraci.
- Next action: Zobrazit na mobilu kratke nouzove akce a detailni studio presunout do desktop-first režimu.

## Gates

### Produkční API bez integraci selze bezpecne

- Status: passing
- Owner: Platform
- Evidence: Route handlery pouzivaji integration_required/demo guardy; studio API navic vyzaduji Supabase session a roli, zatimco player/worker maji oddelene tokeny. Preview/production-like NODE_ENV uz neni anonymni demo API.

### Studio browser API používá role z org_memberships

- Status: partial
- Owner: Security
- Evidence: requireStudioApiAccess chrání chat/upload/render/pair/export/import, role skupiny blokují viewer u mutací, menu import nepovoluje designer roli a produkční orgId se bere ze session; chybí DB integrační testy.

### Produkční studio stránky bez session neukazují demo shell

- Status: passing
- Owner: Security
- Evidence: StudioShell používá getStudioAccessState; production env bez Supabase Auth session zobrazí locked screen a /login je mimo StudioShell.

### Produkční přihlášená homepage nepoužívá lokální demo data

- Status: partial
- Owner: Product
- Evidence: HomePage větví authenticated režim na getProductionDashboardSnapshot přes Supabase session/RLS, při DB chybě skrývá nuly a lokální demo MenuReview/TvStudioClient zůstává jen v demo větvi; chybí browser ověření se skutečnou Supabase session.

### MP4 export musí být ve Storage cestě své organizace

- Status: partial
- Owner: Security
- Evidence: Download route ověřuje object_path prefix org/{org_id}/ a migrace 202607060004 přidává exports_object_path_org_scope; chybí DB integrační test na škodlivý export row.

### Vizuální audit obsahuje 10 prezentaci a 10 sablon

- Status: passing
- Owner: Design
- Evidence: Stranka /audit ma data-audit-kind=presentations/templates a responsive screenshoty.

### Worker ma MP4 H.264/yuv420p/AAC/+faststart preset

- Status: passing
- Owner: Render
- Evidence: WORKER_DRY_RUN=1 vypisuje finalni FFmpeg preset.

### Worker umi lokalne vytvorit skutecny MP4 smoke export

- Status: passing
- Owner: Render
- Evidence: pnpm worker:smoke-render vytvori 27s MP4; audit-artifacts/final-smoke-render.mp4 ma H.264, yuv420p, 1920x1080, 30fps, AAC stereo.

### Worker final render ma export persistence foundation

- Status: partial
- Owner: Render
- Evidence: persistFinalMp4Export uklada MP4 do exports Storage bucketu, upsertuje assets/exports a zapisuje job_events; zatim chybi Supabase Storage/DB smoke test s realnou service-role konfiguraci.

### Studio umi lokálně stáhnout demo MP4

- Status: passing
- Owner: Export
- Evidence: GET /api/exports/export-demo/download vrací audit-artifacts/final-smoke-render.mp4 jako video/mp4 attachment.

### TV player lokálně přehrává skutečný demo MP4 export

- Status: passing
- Owner: TV player
- Evidence: GET /api/player/screen-demo/manifest vrací inline URL na /api/exports/export-demo/download?inline=1; export route podporuje byte ranges pro video element.

### RLS migrace existuji pro multi-tenant zaklad

- Status: partial
- Owner: Data
- Evidence: supabase/migrations obsahuje foundation, audit hardening, approval/publish RPC, text import RPC, location-scope hardening a export uniqueness, ale chybi realne role testy proti DB.

### Klicove obrazovky maji desktop/mobile screenshot

- Status: partial
- Owner: QA
- Evidence: audit-artifacts obsahuje home, TV player, audit, readiness, approval gate a produkcni locked-screen screenshoty; pnpm audit:ui kontroluje existenci a rozmery artefaktu.

### Textovy import menu umi vytvorit strukturovanou kontrolu

- Status: passing
- Owner: Menu spine
- Evidence: MenuReview pouziva parsePastedMenuText, zobrazuje ceny, alergeny, confidence a blokujici varovani.

### Textovy import ma produkcni DB persistence foundation

- Status: partial
- Owner: Menu spine
- Evidence: /api/menus/import-text vola import_text_menu_version RPC pro menu_sources, menus, menu_versions a menu_entries; RPC dostava target_org_id, kontroluje can_access_location a DB limity. Chybi DB integračni test se Supabase Auth session a UI napojeni import obrazovky.

### UI audit generuje inventar tlacitek, linku a screenshot artefaktu

- Status: partial
- Owner: QA
- Evidence: pnpm audit:ui pise audit-artifacts/ui-interaction-audit.md a ui-interaction-inventory.json; staticky scan hlasi problemove disabled/link/API prvky, ale jeste neklika browserem ani neprovadi OCR.

### Kazdy vystup vyzaduje rucni schvaleni

- Status: partial
- Owner: Product
- Evidence: MenuReview obsahuje local content/layout/export approval gate a Supabase migrace pridava auditovane RPC; chybi UI server action se Supabase Auth a DB test.

### Lokální UI gate nepustí publish bez content/layout/export potvrzení

- Status: passing
- Owner: Product
- Evidence: evaluatePublishReadiness ma unit testy pro pending approval, missing allergens, missing export a missing allergen legend.

## Screenshot Targets

### Dnes / provozni dashboard

- Route: /
- Desktop artifact: audit-artifacts/final-desktop-home.png (exists)
- Mobile artifact: audit-artifacts/final-mobile-home.png (exists)
- Must check: pravdivy demo stav, approval gate, menu kontrola, TV studio preview, zadny horizontalni overflow

### Produkční studio lock

- Route: env:NEXT_PUBLIC_APP_ENV=production /
- Desktop artifact: audit-artifacts/final-production-locked-studio.png (exists)
- Mobile artifact: audit-artifacts/final-production-login.png (exists)
- Must check: zadny demo obsah, jasny duvod locku, TV neni dotcena, login mimo StudioShell

### Vizuální audit 10 + 10

- Route: /audit
- Desktop artifact: audit-artifacts/final-audit-desktop-viewport.png (exists)
- Mobile artifact: audit-artifacts/final-audit-mobile-viewport.png (exists)
- Must check: 10 prezentaci, 10 sablon, kritika i zlepseni, citelný prvni viewport

### Readiness audit

- Route: /readiness
- Desktop artifact: audit-artifacts/final-readiness-desktop.png (exists)
- Mobile artifact: audit-artifacts/final-readiness-mobile.png (exists)
- Must check: P0/P1/P2 souhrn, gates, screenshot matrix, otevrene zbytky neprikraslene

### TV web player

- Route: /tv/screen-demo
- Desktop artifact: audit-artifacts/final-desktop-tv-player.png (exists)
- Mobile artifact: audit-artifacts/final-mobile-tv-player.png (exists)
- Must check: realne MP4 video, portrait warning, production no-token error, offline fallback pri chybe, zadne UI prekazky pres video

### Worker smoke MP4 export

- Route: worker:smoke-render
- Desktop artifact: audit-artifacts/final-smoke-render-frame.png (exists)
- Mobile artifact: audit-artifacts/final-smoke-render.mp4 (exists)
- Must check: H.264, yuv420p, 1920x1080, 30fps, AAC stereo, 27s duration

## Critique Prompts

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
