import {
  Archive,
  CalendarPlus,
  CheckSquare,
  Clapperboard,
  Database,
  Download,
  Image as ImageIcon,
  MonitorPlay,
  RotateCcw,
  Settings,
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
    status: "Ukázka",
    tone: "warn" as const,
    tv: "Ukázková TV není připojená",
    published: "Zatím nic",
    action: "Zkontrolovat demo menu",
    actionDisabled: false,
    actionHref: "#kontrola-menu"
  },
  {
    name: "Výdejna výroba",
    status: "Ukázka",
    tone: "info" as const,
    tv: "Ukázková TV není připojená",
    published: "Zatím nic",
    action: "V ukázce vypnuto",
    actionDisabled: true,
    actionHref: null
  },
  {
    name: "Záložní obrazovka",
    status: "Ukázkový problém",
    tone: "critical" as const,
    tv: "TV není spárovaná",
    published: "Zatím nic",
    action: "V ukázce vypnuto",
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
          <h1 className="page-title">Ukázkový režim TV Studia</h1>
          <p className="page-copy">
            Vyzkoušejte vložení jídelníčku, kontrolu cen a alergenů a náhled obrazovky.
            V ukázce se nic neodešle na TV.
          </p>
        </div>
      </div>

      <section className="demo-banner" aria-label="Demo režim">
        <strong>DEMO / ukázková data</strong>
        <span>
          Obrazovky níže používají ukázkový jídelníček. Nic se zde neuloží ani neodešle na TV.
        </span>
      </section>

      <div id="kontrola-menu" style={{ marginTop: 18 }}>
        <MenuReview />
      </div>

      <details className="settings-details demo-details">
        <summary>
          <span>Ukázkový stav a náhledy</span>
          <small>Provozovny, postup, demo přehrávač</small>
        </summary>

        <div className="demo-details-body">
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

          <section className="grid cols-dashboard">
            <article className="card pad">
              <p className="eyebrow">Postup</p>
              <h2 className="card-title">Co musí být hotové před odesláním na TV</h2>
              <div className="grid" style={{ marginTop: 18 }}>
                {[
                  ["1", "Vložit text menu", "Text ze stolu nebo PDF přepsaný do pole níže."],
                  ["2", "Zkontrolovat ceny", "Systém připraví položky, člověk potvrdí fakta."],
                  ["3", "Zkontrolovat TV náhled", "Systém hlídá bezpečný okraj a čitelnost."],
                  ["4", "Odeslání v ukázce vypnuto", "V ostrém režimu se po potvrzení menu odešle na TV."]
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
                Ukázkový soubor slouží jen pro kontrolu přehrávání. Ostré TV běží z potvrzeného menu.
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
                  Vrátit verzi - v ukázce vypnuto
                </button>
              </div>
              <p className="muted">Nepárováno s žádnou provozní obrazovkou.</p>
            </article>
          </section>

          <section>
            <div className="topbar">
              <div>
                <p className="eyebrow">TV náhled</p>
                <h2 className="page-title" style={{ fontSize: 32 }}>
                  Obrazovky, bezpečný okraj a návrhy asistenta
                </h2>
              </div>
              <button className="button" disabled type="button">
                <CalendarPlus size={18} aria-hidden="true" />
                Týdenní plán - v ukázce vypnuto
              </button>
            </div>
            <TvStudioClient />
          </section>
        </div>
      </details>
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
          <p className="eyebrow">Dnes · {formatCzechDate(snapshot.todayIso)}</p>
          <h1 className="page-title">Pustit dnešní menu na TV</h1>
          <p className="page-copy">
            {snapshot.dataError
              ? "Přihlášení funguje, ale data se nepodařilo načíst. Dokud se to neopraví, stránka schová denní spuštění."
              : `Přihlášeno: ${getRoleLabel(access.role)} · ${snapshot.orgName}`}
          </p>
        </div>
      </div>

      {snapshot.dataError ? (
        <ProductionDataError error={snapshot.dataError} />
      ) : (
        <>
          <ProductionQuickLaunch
            canLaunch={canLaunchToday(access.role)}
            roleLabel={getRoleLabel(access.role)}
            snapshot={snapshot}
          />

          <ProductionTodaySummary snapshot={snapshot} />
          <ProductionSettings access={access} snapshot={snapshot} />
        </>
      )}
    </>
  );
}

function ProductionTodaySummary({ snapshot }: { snapshot: ProductionDashboardSnapshot }) {
  return (
    <section className="today-summary" id="dnesni-stav" aria-label="Dnešní stav">
      <div className="today-summary-header">
        <div>
          <p className="eyebrow">Stav</p>
          <h2>Co je dnes vidět na TV</h2>
        </div>
        <StatusBadge
          tone={
            snapshot.counts.screens > 0 && snapshot.counts.onlineScreens === snapshot.counts.screens
              ? "good"
              : "warn"
          }
        >
          TV {snapshot.counts.onlineScreens}/{snapshot.counts.screens}
        </StatusBadge>
      </div>

      <div className="today-summary-grid">
        <ProductionMetric
          label="Dnešní menu"
          value={snapshot.counts.menusToday > 0 ? "Hotovo" : "Chybí"}
          tone={snapshot.counts.menusToday > 0 ? "good" : "warn"}
        />
        <ProductionMetric
          label="TV obrazovky"
          value={`${snapshot.counts.onlineScreens}/${snapshot.counts.screens}`}
          tone={
            snapshot.counts.screens > 0 && snapshot.counts.onlineScreens === snapshot.counts.screens
              ? "good"
              : "warn"
          }
        />
        <ProductionMetric
          label="MP4 záloha"
          value={snapshot.counts.exports > 0 ? "Ano" : "Není"}
          tone={snapshot.counts.exports > 0 ? "good" : "info"}
        />
      </div>

      {snapshot.locations.length === 0 ? (
        <article className="empty-state">
          <Database size={28} aria-hidden="true" />
          <h3>Není založená žádná provozovna</h3>
          <p>Provozovna, jídelna a TV se nastavují jednorázově v Nastavení.</p>
        </article>
      ) : (
        <div className="location-list">
          {snapshot.locations.map((location) => (
            <ProductionLocationCard location={location} key={location.id} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProductionSettings({
  access,
  snapshot
}: {
  access: Extract<StudioAccessState, { mode: "authenticated" }>;
  snapshot: ProductionDashboardSnapshot;
}) {
  const modules = [
    {
      id: "menu",
      title: "Menu",
      copy: "Vložení denního jídelníčku, ceny a alergeny.",
      icon: Utensils,
      tone: "good" as const,
      status: "Aktivní"
    },
    {
      id: "tv-studio",
      title: "TV Studio",
      copy: "Náhled obrazovky, šablony a čitelné texty.",
      icon: Clapperboard,
      tone: "good" as const,
      status: "Aktivní"
    },
    {
      id: "schvaleni",
      title: "Schválení",
      copy: "Potvrzení obsahu a vzhledu před odesláním.",
      icon: CheckSquare,
      tone: "good" as const,
      status: "Napojeno"
    },
    {
      id: "media",
      title: "Média",
      copy: "Pozadí, obrázky a ukázkové vizuály.",
      icon: ImageIcon,
      tone: "good" as const,
      status: "Napojeno"
    },
    {
      id: "exporty",
      title: "Exporty",
      copy: "TV přehrávač a MP4 záloha pro flashku.",
      icon: Download,
      tone: "info" as const,
      status: "TV + MP4"
    },
    {
      id: "archiv",
      title: "Archiv",
      copy: "Historie menu, vzhledů a odeslání na TV.",
      icon: Archive,
      tone: "good" as const,
      status: "Auditováno"
    },
    {
      id: "nastaveni",
      title: "Nastavení",
      copy: "Role, provozovny, jídelny a TV obrazovky.",
      icon: Settings,
      tone: "good" as const,
      status: "Nastaveno"
    }
  ];

  return (
    <section className="settings-section" id="nastaveni" aria-label="Nastavení">
      <details className="settings-details">
        <summary>
          <span>
            <Settings size={20} aria-hidden="true" />
            Správa a nastavení
          </span>
          <small>Provozovna, šablony, role, exporty, archiv</small>
        </summary>

        <div className="settings-grid">
          <div className="settings-panel">
            <p className="eyebrow">Provoz</p>
            <h3>Základní údaje</h3>
            <dl className="settings-facts">
              <div>
                <dt>Organizace</dt>
                <dd>{snapshot.orgName}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{getRoleLabel(access.role)}</dd>
              </div>
              <div>
                <dt>Provozovny</dt>
                <dd>{snapshot.counts.locations}</dd>
              </div>
              <div>
                <dt>Interní ID</dt>
                <dd>{access.orgId}</dd>
              </div>
            </dl>
          </div>

          <div className="settings-panel">
            <p className="eyebrow">Moduly</p>
            <h3>Co je zapojené</h3>
            <div className="settings-module-list">
              {modules.map((module) => {
                const Icon = module.icon;

                return (
                  <div className="settings-row" id={module.id} key={module.id}>
                    <Icon size={18} aria-hidden="true" />
                    <strong>{module.title}</strong>
                    <StatusBadge tone={module.tone}>{module.status}</StatusBadge>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="settings-panel settings-panel-wide">
            <p className="eyebrow">Workflow</p>
            <h3>Co se provede při spuštění</h3>
            <div className="production-check-list compact">
              {[
                ["1", "Import menu", "Text se uloží jako dnešní menu."],
                ["2", "Schválení", "Systém uloží potvrzenou verzi."],
                ["3", "Pozadí", "Pozadí zůstane bez textu, menu se vykreslí zvlášť."],
                ["4", "Odeslání", "TV dostane novou smyčku a odkaz pro přehrávač."]
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
          </div>
        </div>
      </details>
    </section>
  );
}

function ProductionDataError({ error }: { error: string }) {
  return (
    <section className="card pad production-alert" aria-label="Datová chyba">
      <Database size={22} aria-hidden="true" />
      <div>
        <p className="eyebrow">Kontrola dat</p>
        <h2 className="card-title">Data se nepodařilo načíst</h2>
        <p className="muted">
          Denní spuštění je schované, aby nevznikl omyl. Požádejte správce o kontrolu napojení.
        </p>
        <details className="diagnostic-details">
          <summary>Podrobnosti pro správce</summary>
          <p className="diagnostic-text">{error}</p>
        </details>
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
        TV potvrzeno: {location.confirmedScreenCount}/{location.screenCount}
      </p>
      <p className="muted">
        Poslední menu:{" "}
        {location.latestMenuDate ? formatCzechDate(location.latestMenuDate) : "žádné menu"}
      </p>
      <p className="muted">Stav menu: {location.latestMenuStatus ?? "nenalezeno"}</p>
      <div className="actions" style={{ marginTop: 18 }}>
        <a className="button" href="#dnes-spustit-tv">
          <CheckSquare size={17} aria-hidden="true" />
          Přejít ke spuštění
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
    needs_publish: "Čeká na odeslání",
    needs_tv_online: "TV offline",
    awaiting_tv_confirmation: "Čeká na TV",
    needs_export: "TV běží",
    verify_tv: "Ověřit na TV"
  };

  return labels[status];
}

function getRoleLabel(role: StudioAccessRole) {
  const labels: Record<StudioAccessRole, string> = {
    owner: "vlastník",
    admin: "admin",
    editor: "editor",
    designer: "designér",
    approver: "schvalovatel",
    publisher: "publikující",
    viewer: "náhled"
  };

  return labels[role];
}

function canLaunchToday(role: StudioAccessRole) {
  return role === "owner" || role === "admin";
}
