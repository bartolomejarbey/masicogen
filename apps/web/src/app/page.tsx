import {
  CalendarPlus,
  CheckSquare,
  Copy,
  Database,
  Download,
  FileUp,
  MonitorPlay,
  RotateCcw,
  ShieldCheck
} from "lucide-react";
import { demoDeck, demoMenu, formatCzechDate } from "@masico/shared";
import { MenuReview } from "@/components/MenuReview";
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
          <button className="button" disabled type="button">
            <FileUp size={18} aria-hidden="true" />
            Import menu - čeká na produkční tok
          </button>
          <button className="button" disabled type="button">
            <MonitorPlay size={18} aria-hidden="true" />
            Spárovat TV - čeká na UI
          </button>
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
          <p className="eyebrow">Další produkční krok</p>
          <h2 className="card-title">Co musí být napojené, než půjde obsluha do provozu</h2>
          <div className="production-check-list">
            {[
              ["1", "Import menu", "Nahrát PDF/fotku a založit zdroj i verzi menu přes přihlášený účet."],
              ["2", "Schválení", "Spustit schvalovací krok ze serveru a zapsat audit log."],
              ["3", "Export", "Po renderu vytvořit export a bezpečný odkaz ke stažení v rámci organizace."],
              ["4", "Publish", "Přepnout screen pointer jen na schválený deck a ověřený MP4."]
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
        <button className="button" disabled type="button">
          <CheckSquare size={17} aria-hidden="true" />
          Otevřít workflow - čeká na detail
        </button>
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
    needs_export: "Chybí MP4",
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
