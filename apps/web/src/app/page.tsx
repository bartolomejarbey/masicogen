import {
  Archive,
  CalendarPlus,
  CheckSquare,
  Clapperboard,
  Copy,
  Database,
  Download,
  FileUp,
  Image as ImageIcon,
  MonitorPlay,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Utensils
} from "lucide-react";
import { demoDeck, demoMenu, formatCzechDate } from "@masico/shared";
import { MenuReview } from "@/components/MenuReview";
import { ProductionQuickLaunch } from "@/components/ProductionQuickLaunch";
import { StatusBadge } from "@/components/StatusBadge";
import { StudioShell } from "@/components/StudioShell";
import { TvStudioClient } from "@/components/TvStudioClient";
import {
  getProductionDashboardSnapshot,
  type ProductionDashboardSnapshot,
  type ProductionLocationStatus
} from "@/lib/studio-dashboard";
import { getStudioAccessState, type StudioAccessRole, type StudioAccessState } from "@/lib/studio-auth";

export const dynamic = "force-dynamic";

const locations = [
  {
    name: "Jídelna MASI-CO",
    status: "Demo data - not live",
    tone: "warn" as const,
    tv: "Nepřipojeno k reálné obrazovce",
    published: "Produkční publikace: zatím žádná",
    action: "Zkontrolovat demo menu",
    actionDisabled: false,
    actionHref: "#kontrola-menu"
  },
  {
    name: "Výdejna výroba",
    status: "Demo data - not live",
    tone: "info" as const,
    tv: "Nepřipojeno k reálné obrazovce",
    published: "Produkční publikace: zatím žádná",
    action: "Publikace - nenapojeno",
    actionDisabled: true,
    actionHref: null
  },
  {
    name: "Záložní obrazovka",
    status: "Demo problém - not live",
    tone: "critical" as const,
    tv: "Nepárováno s reálnou TV",
    published: "Produkční publikace: zatím žádná",
    action: "Diagnostika - nenapojeno",
    actionDisabled: true,
    actionHref: null
  }
];

export default async function HomePage() {
  const access = await getStudioAccessState();

  if (access.mode === "authenticated") {
    const snapshot = await getProductionDashboardSnapshot(access.orgId);

    return (
      <StudioShell access={access}>
        <ProductionHome access={access} snapshot={snapshot} />
      </StudioShell>
    );
  }

  return (
    <StudioShell access={access}>
      <LocalDemoHome />
    </StudioShell>
  );
}

function LocalDemoHome() {
  return (
    <>
      <div className="topbar">
        <div>
          <p className="eyebrow">Dnes · {formatCzechDate(demoMenu.date)}</p>
          <h1 className="page-title">Ukázkové dnešní menu pro TV</h1>
          <p className="page-copy">
            Nahrajte jídelníček, ověřte ceny a alergeny, zkontrolujte náhled
            obrazovky a teprve potom odešlete dnešní smyčku na TV.
          </p>
        </div>
        <div className="actions">
          <button className="button" disabled type="button">
            <Copy size={18} aria-hidden="true" />
            Použít včerejšek - nenapojeno
          </button>
          <a className="button primary" href="#kontrola-menu">
            <FileUp size={18} aria-hidden="true" />
            Vyzkoušet vložení textu
          </a>
        </div>
      </div>

      <section className="demo-banner" aria-label="Demo režim">
        <strong>DEMO / nenapojeno na produkční data</strong>
        <span>
          Obrazovky níže používají ukázkový jídelníček. Produkční API cesty bez
          reálného Supabase/worker napojení v production režimu selžou bezpečně
          s kódem <code>integration_required</code>. Nic se zde neuloží ani nepublikuje.
        </span>
      </section>

      <section className="grid cols-3" aria-label="Stav provozoven">
        {locations.map((location) => (
          <article className="card pad" key={location.name}>
            <div className="topbar" style={{ marginBottom: 12 }}>
              <h2 className="card-title">{location.name}</h2>
              <StatusBadge tone={location.tone}>{location.status}</StatusBadge>
            </div>
            <p className="muted">TV: {location.tv}</p>
            <p className="muted">Poslední publikace: {location.published}</p>
            <div className="actions" style={{ marginTop: 18 }}>
              {location.actionHref ? (
                <a className="button primary" href={location.actionHref}>
                  <CheckSquare size={17} aria-hidden="true" />
                  {location.action}
                </a>
              ) : (
                <button className="button primary" disabled={location.actionDisabled} type="button">
                  <CheckSquare size={17} aria-hidden="true" />
                  {location.action}
                </button>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="grid cols-dashboard" style={{ marginTop: 20 }}>
        <article className="card pad">
          <p className="eyebrow">Postup</p>
          <h2 className="card-title">Co musí být hotové před odesláním na TV</h2>
          <div className="grid" style={{ marginTop: 18 }}>
            {[
              ["1", "Vložit text menu", "Text ze stolu nebo PDF přepsaný do pole níže."],
              ["2", "Zkontrolovat ceny", "Parser navrhne data, člověk potvrdí fakta."],
              ["3", "Zkontrolovat TV náhled", "Systém hlídá bezpečný okraj a čitelnost."],
              ["4", "Publikování zatím nenapojeno", "Produkční odeslání bude dostupné až po Supabase RPC, workeru, párování TV a audit logu."]
            ].map(([step, title, copy]) => (
              <div
                key={step}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr",
                  gap: 12,
                  alignItems: "center"
                }}
              >
                <span className="brand-mark" style={{ width: 40, height: 40 }}>
                  {step}
                </span>
                <div>
                  <strong>{title}</strong>
                  <div className="muted">{copy}</div>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="card pad">
          <p className="eyebrow">TV smyčka</p>
          <h2 className="card-title">Demo smyčka</h2>
          <p className="muted">
            Ukázková smyčka má {demoDeck.slides.length} obrazovky a délku přibližně{" "}
            {Math.round(
              demoDeck.slides.reduce((total, slide) => total + slide.durationFrames, 0) /
                demoDeck.fps
            )}{" "}
            sekund.
          </p>
          <p className="muted">
            Demo MP4 níže je poslední lokální smoke render z workeru. Produkční export
            bude po napojení vznikat přes Storage a schválený deck.
          </p>
          <div className="actions" style={{ marginTop: 18 }}>
            <a className="button" href="/tv/screen-demo" rel="noreferrer" target="_blank">
              <MonitorPlay size={18} aria-hidden="true" />
              Otevřít demo přehrávač
            </a>
            <a className="button" href="/api/exports/export-demo/download">
              <Download size={18} aria-hidden="true" />
              Stáhnout demo MP4
            </a>
            <button className="button" disabled type="button">
              <RotateCcw size={18} aria-hidden="true" />
              Vrátit verzi - není archiv
            </button>
          </div>
          <p className="muted">Nepárováno s žádnou provozní obrazovkou.</p>
        </article>
      </section>

      <div id="kontrola-menu" style={{ marginTop: 24 }}>
        <MenuReview />
      </div>

      <section style={{ marginTop: 24 }}>
        <div className="topbar">
          <div>
            <p className="eyebrow">TV náhled</p>
            <h2 className="page-title" style={{ fontSize: 32 }}>
              Obrazovky, bezpečný okraj a návrhy asistenta
            </h2>
          </div>
          <button className="button" disabled type="button">
            <CalendarPlus size={18} aria-hidden="true" />
            Naplánovat týden - plánováno
          </button>
        </div>
        <TvStudioClient />
      </section>
    </>
  );
}

function ProductionHome({
  access,
  snapshot
}: {
  access: Extract<StudioAccessState, { mode: "authenticated" }>;
  snapshot: ProductionDashboardSnapshot;
}) {
  return (
    <>
      <div className="topbar">
        <div>
          <p className="eyebrow">Produkční režim · {formatCzechDate(snapshot.todayIso)}</p>
          <h1 className="page-title">Dnešní provoz TV Studia</h1>
          <p className="page-copy">
            {snapshot.dataError
              ? "Přihlášení funguje, ale datová vrstva není ověřená. Tato stránka proto nezobrazuje souhrn ani nuly jako zdravý stav."
              : `Přihlášeno do organizace ${snapshot.orgName}. Tato obrazovka používá pouze data dostupná přes Supabase session a RLS; lokální demo smyčka se v produkci nezobrazuje.`}
          </p>
        </div>
        <div className="actions">
          <a className="button primary" href="#dnes-spustit-tv">
            <FileUp size={18} aria-hidden="true" />
            Dnes spustit TV
          </a>
          <a className="button" href="#dnes-spustit-tv">
            <MonitorPlay size={18} aria-hidden="true" />
            TV web player
          </a>
        </div>
      </div>

      <section className="production-banner" aria-label="Produkční datový režim">
        <ShieldCheck size={19} aria-hidden="true" />
        <strong>Bez demo fallbacku</strong>
        <span>
          Role {getRoleLabel(access.role)} vidí jen data organizace {access.orgId}. Pokud
          nejsou tabulky nebo RLS připravené, stránka ukáže chybu místo ukázkového menu.
        </span>
      </section>

      {snapshot.dataError ? (
        <ProductionDataError error={snapshot.dataError} />
      ) : (
        <>
          <ProductionModules />
          <ProductionQuickLaunch snapshot={snapshot} />

          <section className="grid cols-3" aria-label="Produkční stav">
            <ProductionMetric label="Provozovny" value={snapshot.counts.locations} tone="info" />
            <ProductionMetric
              label="TV online"
              value={`${snapshot.counts.onlineScreens}/${snapshot.counts.screens}`}
              tone={
                snapshot.counts.screens > 0 &&
                snapshot.counts.onlineScreens === snapshot.counts.screens
                  ? "good"
                  : "warn"
              }
            />
            <ProductionMetric
              label="Dnešní menu"
              value={snapshot.counts.menusToday}
              tone={snapshot.counts.menusToday > 0 ? "good" : "warn"}
            />
            <ProductionMetric
              label="MP4 exporty"
              value={snapshot.counts.exports}
              tone={snapshot.counts.exports > 0 ? "good" : "warn"}
            />
            <ProductionMetric
              label="Render joby"
              value={snapshot.counts.renderJobsRunning}
              tone={snapshot.counts.renderJobsRunning > 0 ? "warn" : "info"}
            />
          </section>

          <section style={{ marginTop: 22 }}>
            <div className="topbar">
              <div>
                <p className="eyebrow">Provozovny</p>
                <h2 className="page-title" style={{ fontSize: 32 }}>
                  Skutečný stav bez ukázkových dat
                </h2>
              </div>
            </div>

            {snapshot.locations.length === 0 ? (
              <article className="empty-state">
                <Database size={28} aria-hidden="true" />
                <h3>Žádná provozovna zatím není dostupná</h3>
                <p>
                  Přihlášení funguje, ale pro tuto organizaci nejsou přes RLS viditelné žádné
                  provozovny. V produkci je potřeba založit organizaci, provozovny, jídelny a TV
                  obrazovky.
                </p>
              </article>
            ) : (
              <div className="grid cols-3">
                {snapshot.locations.map((location) => (
                  <ProductionLocationCard location={location} key={location.id} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <section className="grid cols-dashboard" style={{ marginTop: 22 }}>
        <article className="card pad">
          <p className="eyebrow">Produkční workflow</p>
          <h2 className="card-title">Co se provede při dnešním spuštění</h2>
          <div className="production-check-list">
            {[
              ["1", "Import menu", "Text jídelníčku se uloží jako zdroj, menu verze a položky."],
              ["2", "Schválení", "Menu i TV deck projdou schvalovacími RPC kroky a audit logem."],
              ["3", "Image 2 šablona", "Pozadí se uloží do Storage, texty se renderují deterministicky přes něj."],
              ["4", "Publish", "Screen pointer se přepne na publikovanou live TV smyčku s párovacím tokenem."]
            ].map(([step, title, copy]) => (
              <div className="production-check" key={step}>
                <span className="brand-mark">{step}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{copy}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="card pad">
          <p className="eyebrow">Bezpečnost</p>
          <h2 className="card-title">Co tato stránka už hlídá</h2>
          <ul className="production-bullet-list">
            <li>Neukazuje demo jídelnu v produkčním authenticated režimu.</li>
            <li>Nezobrazuje odkaz na lokální `export-demo` MP4.</li>
            <li>Čte přes Supabase session a RLS, ne přes browser service role.</li>
            <li>Role a orgId jsou převzaté ze serverového auth guardu.</li>
          </ul>
        </article>
      </section>
    </>
  );
}

function ProductionModules() {
  const modules = [
    {
      id: "menu",
      title: "Menu",
      copy: "Import textu denního jídelníčku, strukturované položky, ceny, alergeny a uložená menu verze.",
      icon: Utensils,
      tone: "good" as const,
      status: "Aktivní"
    },
    {
      id: "tv-studio",
      title: "TV Studio",
      copy: "Image 2 background, 16:9 live deck, deterministic text overlay a TV web player.",
      icon: Clapperboard,
      tone: "good" as const,
      status: "Aktivní"
    },
    {
      id: "schvaleni",
      title: "Schválení",
      copy: "Menu i deck se schvalují přes Supabase RPC a změny se zapisují do audit logu.",
      icon: CheckSquare,
      tone: "good" as const,
      status: "Napojeno"
    },
    {
      id: "media",
      title: "Média",
      copy: "Vygenerované Image 2 assety se ukládají do Storage bucketu generated-assets.",
      icon: ImageIcon,
      tone: "good" as const,
      status: "Napojeno"
    },
    {
      id: "exporty",
      title: "Exporty",
      copy: "Live player je primární cesta pro dnešek; MP4 export zůstává připravený jako fallback workflow.",
      icon: Download,
      tone: "info" as const,
      status: "Live + MP4 fallback"
    },
    {
      id: "archiv",
      title: "Archiv",
      copy: "Menu verze, deck verze, publish eventy a AI generace zůstávají uložené v Supabase.",
      icon: Archive,
      tone: "good" as const,
      status: "Auditováno"
    },
    {
      id: "nastaveni",
      title: "Nastavení",
      copy: "Role, organizace, provozovna, jídelna, TV screen tokeny a produkční env jsou nastavené.",
      icon: Settings,
      tone: "good" as const,
      status: "Nastaveno"
    }
  ];

  return (
    <section className="module-section" aria-label="Aktivní moduly">
      <div className="topbar compact">
        <div>
          <p className="eyebrow">Moduly</p>
          <h2 className="page-title" style={{ fontSize: 30 }}>
            Pro dnešní provoz nejsou jen plánované
          </h2>
        </div>
        <a className="button primary" href="#dnes-spustit-tv">
          <Sparkles size={18} aria-hidden="true" />
          Spustit dnešní TV
        </a>
      </div>
      <div className="module-grid">
        {modules.map((module) => {
          const Icon = module.icon;

          return (
            <article className="card pad module-card" id={module.id} key={module.id}>
              <div className="module-card-head">
                <Icon size={20} aria-hidden="true" />
                <StatusBadge tone={module.tone}>{module.status}</StatusBadge>
              </div>
              <h3>{module.title}</h3>
              <p>{module.copy}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ProductionDataError({ error }: { error: string }) {
  return (
    <section className="card pad production-alert" aria-label="Datová chyba">
      <Database size={22} aria-hidden="true" />
      <div>
        <p className="eyebrow">Supabase kontrola</p>
        <h2 className="card-title">Produkční data se nepodařilo ověřit</h2>
        <p className="muted">
          Souhrn provozoven, TV a exportů je skrytý, protože by nuly mohly vypadat jako
          zdravý prázdný stav.
        </p>
        <p className="diagnostic-text">{error}</p>
      </div>
    </section>
  );
}

function ProductionMetric({
  label,
  value,
  tone
}: {
  label: string;
  value: number | string;
  tone: "good" | "warn" | "critical" | "info";
}) {
  return (
    <article className="card pad production-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <StatusBadge tone={tone}>{getMetricLabel(tone)}</StatusBadge>
    </article>
  );
}

function ProductionLocationCard({ location }: { location: ProductionLocationStatus }) {
  return (
    <article className="card pad">
      <div className="topbar" style={{ marginBottom: 12 }}>
        <h3 className="card-title">{location.name}</h3>
        <StatusBadge tone={getLocationTone(location.blockingStatus)}>
          {getLocationLabel(location.blockingStatus)}
        </StatusBadge>
      </div>
      <p className="muted">
        TV online: {location.onlineScreenCount}/{location.screenCount}
      </p>
      <p className="muted">
        Poslední menu:{" "}
        {location.latestMenuDate ? formatCzechDate(location.latestMenuDate) : "žádné menu"}
      </p>
      <p className="muted">Stav menu: {location.latestMenuStatus ?? "nenalezeno"}</p>
      <div className="actions" style={{ marginTop: 18 }}>
        <a className="button" href="#dnes-spustit-tv">
          <CheckSquare size={17} aria-hidden="true" />
          Otevřít dnešní workflow
        </a>
      </div>
    </article>
  );
}

function getMetricLabel(tone: "good" | "warn" | "critical" | "info") {
  if (tone === "good") {
    return "OK";
  }

  if (tone === "critical") {
    return "Blokuje";
  }

  return tone === "warn" ? "Pozor" : "Info";
}

function getLocationTone(status: ProductionLocationStatus["blockingStatus"]) {
  return status === "empty" ? "info" : "warn";
}

function getLocationLabel(status: ProductionLocationStatus["blockingStatus"]) {
  const labels: Record<ProductionLocationStatus["blockingStatus"], string> = {
    empty: "Bez TV",
    needs_menu: "Chybí dnešní menu",
    needs_publish: "Chybí publish",
    needs_tv_online: "TV offline",
    needs_export: "Live publikováno",
    verify_tv: "Ověřit na TV"
  };

  return labels[status];
}

function getRoleLabel(role: StudioAccessRole) {
  const labels: Record<StudioAccessRole, string> = {
    owner: "owner",
    admin: "admin",
    editor: "editor",
    designer: "designer",
    approver: "approver",
    publisher: "publisher",
    viewer: "viewer"
  };

  return labels[role];
}
