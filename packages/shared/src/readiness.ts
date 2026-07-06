export type ReadinessSeverity = "P0" | "P1" | "P2";

export type ReadinessStatus = "open" | "partial" | "passing";

export type ReadinessFinding = {
  id: string;
  severity: ReadinessSeverity;
  category: string;
  title: string;
  evidence: string;
  impact: string;
  nextAction: string;
  status: ReadinessStatus;
};

export type ReadinessGate = {
  id: string;
  label: string;
  status: ReadinessStatus;
  owner: string;
  evidence: string;
};

export type CritiquePrompt = {
  id: string;
  round: string;
  question: string;
  whyItMatters: string;
};

export type ScreenshotAuditTarget = {
  id: string;
  label: string;
  route: string;
  desktopArtifact: string;
  mobileArtifact: string;
  mustCheck: string[];
};

export const readinessFindings: ReadinessFinding[] = [
  {
    id: "auth-rbac-prod",
    severity: "P0",
    category: "Bezpecnost",
    title: "Produkční studio i browser API jsou za Supabase session, ale chybí DB role testy",
    evidence: "StudioShell, homepage a interní browser route handlery chat/upload/render/pair/export/import používají cookie-backed Supabase Auth, aktivní org_memberships roli a requireStudioApiAccess role skupiny. Auth je vyžadovaný pro production-like NODE_ENV, demo API nepoužívá service-role integrace a migrace 202607060006 zpřísňuje location-scoped RLS.",
    impact: "Anonymní návštěvník už nemá vidět demo studio ani volat studio API bez session; přihlášená produkční homepage už neukazuje demo provozovny, ale zbývá prokázat RLS/cross-org/location-scope chování proti reálné Supabase DB.",
    nextAction: "Doplnit integrační testy pro editor/approver/publisher/viewer, cross-org/location-scope import, export/render lookup a nasazenou RLS migraci.",
    status: "partial"
  },
  {
    id: "import-ocr-disabled",
    severity: "P0",
    category: "Menu spine",
    title: "Fotka/PDF/OCR import neni jeste funkcni end-to-end",
    evidence: "Textovy import ma validovanou route /api/menus/import-text a Supabase RPC import_text_menu_version pro menu_sources, menus, menu_versions a menu_entries; PDF/fotka/OCR a produkcni UI napojeni stale chybi.",
    impact: "Denní provoz muze z textu vytvorit auditovatelnou DB verzi menu, ale zatim nemuze spolehlive prejit z fotky nebo PDF do schvalene verze.",
    nextAction: "Napojit upload intent na menu_sources, OpenAI Structured Outputs extrakci, kontrolu zdroje, UI import obrazovku a DB smoke test ulozeni.",
    status: "partial"
  },
  {
    id: "approval-publish-mutations",
    severity: "P0",
    category: "Schvalovani",
    title: "Schvaleni a publikace maji gate/RPC zaklad, ale nejsou jeste end-to-end v UI",
    evidence: "Shared evaluatePublishReadiness blokuje publish bez content/layout/export potvrzeni, migrace 202607060003 pridava approve_menu_version, approve_deck_version a publish_deck_to_screen RPC s audit_log zapisem a route handlery /api/approvals/* plus /api/screens/[screenId]/publish je volaji pres Supabase Auth.",
    impact: "Systém uz ma konkretni control point pro lidske schvaleni a produkcni API mutace, ale personal je zatim nema napojene z UI a chybi DB integrační test.",
    nextAction: "Napojit UI akce na approval/publish route handlery, pridat role/cross-org/publish rollback testy a overit player manifest po publish eventu.",
    status: "partial"
  },
  {
    id: "render-artifact-wireup",
    severity: "P0",
    category: "Render",
    title: "Worker umi persistovat final MP4 export, ale publish UI/DB smoke stale chybi",
    evidence: "Worker smoke render vytvari 27s MP4, UI umi stahnout lokalni export-demo a worker final render ma persistFinalMp4Export pro Storage upload, assets row, exports row a job_events. Chybi overeni proti realne Supabase Storage/DB a UI publish pointer.",
    impact: "USB fallback je lokalne prokazatelny a produkcni export persistence ma kodovy zaklad, ale ostrý provoz stale nema prokazany schvaleny export navazany na screen publish.",
    nextAction: "Spustit worker proti Supabase DB/Storage, overit exports row, signed download, publish_deck_to_screen a TV player manifest pro schvalenou deck_version.",
    status: "partial"
  },
  {
    id: "tv-fallback-masks-publish-failure",
    severity: "P0",
    category: "TV player",
    title: "TV player uz nemaskuje produkcni chybu demo menum, ale last-known-good jeste chybi",
    evidence: "Lokální demo prehrava realne MP4; production /tv bez screen tokenu zobrazi provozni hlasku 'Obrazovka není spárovaná' misto demo menu nebo raw Manifest 401. Pairing route uklada screen token hash a player manifest bere export_id z publish_events, ale produkcni offline cache a restore pointer stale nejsou hotove.",
    impact: "TV bez autorizace uz nevypada jako spravne publikovana smycka a neukazuje technicky raw error; publikovany artefakt je deterministicky podle publish eventu, ale ostrý provoz stale potrebuje posledni dobrou verzi pri expiraci signed URL nebo vypadku site.",
    nextAction: "Doplnit Cache API/Service Worker pro skutecny last-known-good MP4, preloading na hrane smycky a offline reload test.",
    status: "partial"
  },
  {
    id: "internal-token-service-role-scope",
    severity: "P1",
    category: "Bezpecnost",
    title: "Service role je server-only, ale potrebuje uzsi RPC hranice",
    evidence: "Browser API uz odvozuji orgId ze Supabase membership; demo mode nepousti signed upload/render service-role cestu a export download kontroluje org-scoped Storage cestu. Server stale pouziva service role klienta uvnitr nekterych route handleru.",
    impact: "Chyba v serverovem route handleru by stale mohla obejit RLS, i kdyz uzivatel nema moznost poslat vlastni orgId v produkci a export path ma aplikacni i DB pojistku.",
    nextAction: "Nahradit primy service-role zapis uzkymi RPC funkcemi, pridat composite org_id FK testy a auditovat vsechny admin klienty.",
    status: "partial"
  },
  {
    id: "tv-pairing-admin",
    severity: "P1",
    category: "TV player",
    title: "Parovani obrazovky ma DB token foundation, ale chybi admin UI a claim code flow",
    evidence: "/api/screens/pair pro authenticated screen managera vytvori nebo zrotuje screens/screen_tokens, uklada jen hash, revokuje stare tokeny a respektuje location scopes. Admin nema kompletni obrazovku pro pairing-code claim, heartbeat stav a lifecycle tokenu.",
    impact: "Instalace na fyzicke TV uz ma serverovy zaklad, ale stale by vyzadovala technicky POST misto samostatneho kroku pro personal.",
    nextAction: "Doplnit screens page a pairing sessions: jednorazovy kod zadany na TV, stav tokenu, posledni heartbeat, rotace/revokace a audit log.",
    status: "partial"
  },
  {
    id: "visual-audit-static",
    severity: "P1",
    category: "UI/UX audit",
    title: "UI audit ma inventar controls, ale jeste ne plny browser/OCR crawl",
    evidence: "Stranka /audit obsahuje 10+10 kritickych scenaru a pnpm audit:ui generuje ui-interaction-audit.md s inventarem route, screenshot artefaktu, tlacitek, linku a statickych problemu.",
    impact: "Kritika uz neni jen kuratorovany katalog, ale stale sama neprokazuje kliknuti kazdeho tlacitka, OCR cteni ani pixel kontrast ve finalnim TV renderu.",
    nextAction: "Doplnit browser click-through crawl, OCR/kontrast metriky, DOM inventory diff a automaticke screenshot assertions pro produkcni negativni stavy.",
    status: "partial"
  },
  {
    id: "worker-lease-retry",
    severity: "P1",
    category: "Worker",
    title: "Worker leasing/retry byl slabina a zustava potreba DB smoke test",
    evidence: "Kod nove pouziva lease token pro finalni update a recoveruje expired leases, ale neni overeny proti realne Supabase DB.",
    impact: "Bez DB testu stale neni prokazane, ze dva workery neprepisou stejnou praci nebo nezaseknou job.",
    nextAction: "Pridat integračni test running jobu s proslym lease_expires_at a soubezne lease race.",
    status: "partial"
  },
  {
    id: "ai-image-guardrails",
    severity: "P1",
    category: "AI kreativita",
    title: "gpt-image-2 background generator nema jeste provozni guardrails v UI",
    evidence: "Prompt pravidla jsou v planu a asistent ukazuje copy, ale generovani assetu neni napojene.",
    impact: "Bez kontroly textu, kontrastu a safe plochy by AI obraz mohl snizit citelnost nebo obsahovat falešny text.",
    nextAction: "Postavit asset draft/final flow s promptem bez textu, schvalenim a contrast/safe-area validaci.",
    status: "open"
  },
  {
    id: "mobile-editor-scope",
    severity: "P2",
    category: "Mobil",
    title: "Mobilni režim je vhodny pro kontrolu, ale nejasne oddeluje nouzove upravy od studia",
    evidence: "Responsive layout pada do jednoho sloupce a navigace je horizontalni; detailni studio zustava na mobilu dostupne.",
    impact: "Personal muze zkusit delat slozitou layout praci na telefonu a narazit na frustraci.",
    nextAction: "Zobrazit na mobilu kratke nouzove akce a detailni studio presunout do desktop-first režimu.",
    status: "partial"
  }
];

export const readinessGates: ReadinessGate[] = [
  {
    id: "api-fails-closed",
    label: "Produkční API bez integraci selze bezpecne",
    status: "passing",
    owner: "Platform",
    evidence: "Route handlery pouzivaji integration_required/demo guardy; studio API navic vyzaduji Supabase session a roli, zatimco player/worker maji oddelene tokeny. Preview/production-like NODE_ENV uz neni anonymni demo API."
  },
  {
    id: "studio-api-rbac",
    label: "Studio browser API používá role z org_memberships",
    status: "partial",
    owner: "Security",
    evidence: "requireStudioApiAccess chrání chat/upload/render/pair/export/import/approval/publish, role skupiny blokují viewer u mutací, menu import nepovoluje designer roli, approval je oddeleny od editace a produkční orgId se bere ze session; chybí DB integrační testy."
  },
  {
    id: "production-studio-auth-lock",
    label: "Produkční studio stránky bez session neukazují demo shell",
    status: "passing",
    owner: "Security",
    evidence: "StudioShell používá getStudioAccessState; production env bez Supabase Auth session zobrazí locked screen a /login je mimo StudioShell."
  },
  {
    id: "production-home-no-demo-data",
    label: "Produkční přihlášená homepage nepoužívá lokální demo data",
    status: "partial",
    owner: "Product",
    evidence: "HomePage větví authenticated režim na getProductionDashboardSnapshot přes Supabase session/RLS, při DB chybě skrývá nuly a lokální demo MenuReview/TvStudioClient zůstává jen v demo větvi; chybí browser ověření se skutečnou Supabase session."
  },
  {
    id: "export-storage-scope",
    label: "MP4 export musí být ve Storage cestě své organizace",
    status: "partial",
    owner: "Security",
    evidence: "Download route ověřuje object_path prefix org/{org_id}/ a migrace 202607060004 přidává exports_object_path_org_scope; chybí DB integrační test na škodlivý export row."
  },
  {
    id: "visual-audit-10-10",
    label: "Vizuální audit obsahuje 10 prezentaci a 10 sablon",
    status: "passing",
    owner: "Design",
    evidence: "Stranka /audit ma data-audit-kind=presentations/templates a responsive screenshoty."
  },
  {
    id: "worker-preset",
    label: "Worker ma MP4 H.264/yuv420p/AAC/+faststart preset",
    status: "passing",
    owner: "Render",
    evidence: "WORKER_DRY_RUN=1 vypisuje finalni FFmpeg preset."
  },
  {
    id: "worker-smoke-render",
    label: "Worker umi lokalne vytvorit skutecny MP4 smoke export",
    status: "passing",
    owner: "Render",
    evidence: "pnpm worker:smoke-render vytvori 27s MP4; audit-artifacts/final-smoke-render.mp4 ma H.264, yuv420p, 1920x1080, 30fps, AAC stereo."
  },
  {
    id: "worker-export-persistence",
    label: "Worker final render ma export persistence foundation",
    status: "partial",
    owner: "Render",
    evidence: "persistFinalMp4Export uklada MP4 do exports Storage bucketu, upsertuje assets/exports a zapisuje job_events; zatim chybi Supabase Storage/DB smoke test s realnou service-role konfiguraci."
  },
  {
    id: "demo-mp4-download",
    label: "Studio umi lokálně stáhnout demo MP4",
    status: "passing",
    owner: "Export",
    evidence: "GET /api/exports/export-demo/download vrací audit-artifacts/final-smoke-render.mp4 jako video/mp4 attachment."
  },
  {
    id: "demo-tv-player-real-mp4",
    label: "TV player lokálně přehrává skutečný demo MP4 export",
    status: "passing",
    owner: "TV player",
    evidence: "GET /api/player/screen-demo/manifest vrací inline URL na /api/exports/export-demo/download?inline=1; export route podporuje byte ranges pro video element."
  },
  {
    id: "screen-token-persistence",
    label: "Produkční pairing route ukládá hashovaný screen token",
    status: "partial",
    owner: "TV player",
    evidence: "/api/screens/pair vytváří nebo updatuje screens, revokuje staré screen_tokens, ukládá nový token_hash s expirací a raw token vrací jen jednou; chybí DB smoke test a admin pairing-code UI."
  },
  {
    id: "player-uses-published-export",
    label: "TV manifest používá export explicitně uložený publish eventem",
    status: "partial",
    owner: "TV player",
    evidence: "getPublishedPlayerManifest vybírá poslední publish_events.export_id pro screen a teprve ten podepisuje pro přehrání; chybí integrační test publish_deck_to_screen -> player manifest."
  },
  {
    id: "supabase-rls",
    label: "RLS migrace existuji pro multi-tenant zaklad",
    status: "partial",
    owner: "Data",
    evidence: "supabase/migrations obsahuje foundation, audit hardening, approval/publish RPC, text import RPC, location-scope hardening a export uniqueness, ale chybi realne role testy proti DB."
  },
  {
    id: "screenshots",
    label: "Klicove obrazovky maji desktop/mobile screenshot",
    status: "partial",
    owner: "QA",
    evidence: "audit-artifacts obsahuje home, TV player, audit, readiness, approval gate a produkcni locked-screen screenshoty; pnpm audit:ui kontroluje existenci a rozmery artefaktu."
  },
  {
    id: "paste-import",
    label: "Textovy import menu umi vytvorit strukturovanou kontrolu",
    status: "passing",
    owner: "Menu spine",
    evidence: "MenuReview pouziva parsePastedMenuText, zobrazuje ceny, alergeny, confidence a blokujici varovani."
  },
  {
    id: "text-import-persistence",
    label: "Textovy import ma produkcni DB persistence foundation",
    status: "partial",
    owner: "Menu spine",
    evidence: "/api/menus/import-text vola import_text_menu_version RPC pro menu_sources, menus, menu_versions a menu_entries; RPC dostava target_org_id, kontroluje can_access_location a DB limity. Chybi DB integračni test se Supabase Auth session a UI napojeni import obrazovky."
  },
  {
    id: "approval-publish-api-rpc",
    label: "Schvaleni a publish maji produkcni API nad RPC",
    status: "partial",
    owner: "Product",
    evidence: "POST /api/approvals/menu-version, /api/approvals/deck-version a /api/screens/[screenId]/publish validuji UUID payloady, pouzivaji role approver/publisher a volaji Supabase RPC pres cookie-backed Auth klienta; chybi DB smoke test a napojeni tlacitek v UI."
  },
  {
    id: "ui-interaction-audit",
    label: "UI audit generuje inventar tlacitek, linku a screenshot artefaktu",
    status: "partial",
    owner: "QA",
    evidence: "pnpm audit:ui pise audit-artifacts/ui-interaction-audit.md a ui-interaction-inventory.json; staticky scan hlasi problemove disabled/link/API prvky, ale jeste neklika browserem ani neprovadi OCR."
  },
  {
    id: "manual-approval",
    label: "Kazdy vystup vyzaduje rucni schvaleni",
    status: "partial",
    owner: "Product",
    evidence: "MenuReview obsahuje local content/layout/export approval gate, Supabase migrace pridava auditovane RPC a produkcni approval/publish route handlery uz volaji RPC pres Supabase Auth; chybi UI napojeni a DB test."
  },
  {
    id: "local-approval-gate",
    label: "Lokální UI gate nepustí publish bez content/layout/export potvrzení",
    status: "passing",
    owner: "Product",
    evidence: "evaluatePublishReadiness ma unit testy pro pending approval, missing allergens, missing export a missing allergen legend."
  }
];

export const critiquePrompts: CritiquePrompt[] = [
  {
    id: "ocr-round",
    round: "OCR rada",
    question: "Ktere texty ze screenshotu by obsluha nebo host neprecetl do 3 sekund ze vzdalenosti 3 metru?",
    whyItMatters: "TV signage selze, pokud je hezke, ale nefunguje na skutecne obrazovce v jidelne."
  },
  {
    id: "button-round",
    round: "Funkcni rada",
    question: "Ktere tlacitko vypada aktivne, ale nema bezpecny backendovy efekt nebo jasny disabled stav?",
    whyItMatters: "Falesna interaktivita nici duveru personalu a maskuje nedokoncene workflow."
  },
  {
    id: "facts-round",
    round: "Fakticka rada",
    question: "Kde by AI mohla zmenit cenu, alergen, datum nebo nazev jidla bez viditelneho reapproval?",
    whyItMatters: "Ceny a alergeny jsou fakta, ne kreativni text. Musi zustat auditovatelne."
  },
  {
    id: "failure-round",
    round: "Krizova rada",
    question: "Co uvidi personal a TV, kdyz spadne OpenAI, Supabase, worker, sit nebo fyzicka televize?",
    whyItMatters: "Jidelna potrebuje posledni dobrou verzi a jednoduche zotaveni, ne technickou chybu."
  },
  {
    id: "cost-round",
    round: "Nakladova rada",
    question: "Kde muze personal omylem spustit drahe high-quality generovani bez viditelneho budgetu?",
    whyItMatters: "AI obrazky jsou uzitecne, ale musi mit rozpoctove brzdy a schvaleni."
  }
];

export const screenshotAuditTargets: ScreenshotAuditTarget[] = [
  {
    id: "home",
    label: "Dnes / provozni dashboard",
    route: "/",
    desktopArtifact: "audit-artifacts/final-desktop-home.png",
    mobileArtifact: "audit-artifacts/final-mobile-home.png",
    mustCheck: ["pravdivy demo stav", "approval gate", "menu kontrola", "TV studio preview", "zadny horizontalni overflow"]
  },
  {
    id: "studio-lock",
    label: "Produkční studio lock",
    route: "env:NEXT_PUBLIC_APP_ENV=production /",
    desktopArtifact: "audit-artifacts/final-production-locked-studio.png",
    mobileArtifact: "audit-artifacts/final-production-login.png",
    mustCheck: ["zadny demo obsah", "jasny duvod locku", "TV neni dotcena", "login mimo StudioShell"]
  },
  {
    id: "audit",
    label: "Vizuální audit 10 + 10",
    route: "/audit",
    desktopArtifact: "audit-artifacts/final-audit-desktop-viewport.png",
    mobileArtifact: "audit-artifacts/final-audit-mobile-viewport.png",
    mustCheck: ["10 prezentaci", "10 sablon", "kritika i zlepseni", "citelný prvni viewport"]
  },
  {
    id: "readiness",
    label: "Readiness audit",
    route: "/readiness",
    desktopArtifact: "audit-artifacts/final-readiness-desktop.png",
    mobileArtifact: "audit-artifacts/final-readiness-mobile.png",
    mustCheck: ["P0/P1/P2 souhrn", "gates", "screenshot matrix", "otevrene zbytky neprikraslene"]
  },
  {
    id: "tv-player",
    label: "TV web player",
    route: "/tv/screen-demo",
    desktopArtifact: "audit-artifacts/final-desktop-tv-player.png",
    mobileArtifact: "audit-artifacts/final-mobile-tv-player.png",
    mustCheck: ["realne MP4 video", "portrait warning", "production no-token error", "offline fallback pri chybe", "zadne UI prekazky pres video"]
  },
  {
    id: "worker-render",
    label: "Worker smoke MP4 export",
    route: "worker:smoke-render",
    desktopArtifact: "audit-artifacts/final-smoke-render-frame.png",
    mobileArtifact: "audit-artifacts/final-smoke-render.mp4",
    mustCheck: ["H.264", "yuv420p", "1920x1080", "30fps", "AAC stereo", "27s duration"]
  }
];
