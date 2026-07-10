import {
  Bot,
  CalendarDays,
  CheckSquare,
  Clapperboard,
  Home,
  MonitorPlay,
  Palette,
  Settings,
  ShieldAlert
} from "lucide-react";
import Link from "next/link";
import { getStudioAccessState, type StudioAccessRole, type StudioAccessState } from "@/lib/studio-auth";

const navItems = [
  { label: "Dnes", icon: Home, section: "today", href: "/" },
  { label: "Týden", icon: CalendarDays, section: "week", href: "/tyden" },
  { label: "Prezentace", icon: Clapperboard, section: "presentations", href: "/prezentace" },
  { label: "Kontrola vzhledu", icon: CheckSquare, section: "audit", href: "/audit" }
];

const adminNavItems = [
  { label: "Šablony", icon: Palette, section: "templates", href: "/sablony" },
  { label: "Stav systému", icon: ShieldAlert, section: "readiness", href: "/readiness" },
  { label: "Nastavení", icon: Settings, section: "settings", href: "/nastaveni" }
];

export async function StudioShell({
  activeSection = "today",
  access: providedAccess,
  children
}: {
  activeSection?:
    | "today"
    | "week"
    | "presentations"
    | "audit"
    | "readiness"
    | "templates"
    | "settings";
  access?: StudioAccessState;
  children: React.ReactNode;
}) {
  const access = providedAccess ?? (await getStudioAccessState());
  const showAdminNav =
    access.mode !== "authenticated" ||
    access.role === "owner" ||
    access.role === "admin" ||
    access.role === "designer";

  if (access.mode === "locked") {
    return (
      <div className="locked-studio-page">
        <section className="locked-studio-card" aria-labelledby="locked-studio-title">
          <span className="brand-mark">M</span>
          <p className="eyebrow">Produkční ochrana</p>
          <h1 id="locked-studio-title">{access.title}</h1>
          <p>{access.message}</p>
          <div className="locked-studio-next">
            <strong>Další krok</strong>
            <span>{access.action}</span>
          </div>
          {access.loginHref ? (
            <Link className="button primary" href={access.loginHref}>
              Přihlásit se
            </Link>
          ) : null}
          <p className="locked-studio-note">
            TV obrazovky běží dál. Přihlášení se týká jen studia pro úpravu menu,
            schvalování a publikování.
          </p>
          <div className="locked-studio-meta">
            <span>Stav: {getLockedReasonLabel(access.reason)}</span>
            <span>Demo shell: blokován</span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>
            MASI-CO
            <br />
            TV Studio
          </span>
        </div>
        <nav className="nav" aria-label="Hlavní navigace">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.section === activeSection;

            return (
              <Link className={`nav-item ${isActive ? "active" : ""}`} href={item.href} key={item.label}>
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-admin">
          {showAdminNav ? (
            <>
              <p>Správa</p>
              <nav className="nav" aria-label="Správa">
                {adminNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.section === activeSection;

                  return (
                    <Link className={`nav-item ${isActive ? "active" : ""}`} href={item.href} key={item.label}>
                      <Icon size={18} aria-hidden="true" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </>
          ) : null}
          <div className="sidebar-meta">
            <div className="nav-item">
              <MonitorPlay size={18} aria-hidden="true" />
              tv.masi-co-food.cz
            </div>
            <div className="nav-item">
              <Bot size={18} aria-hidden="true" />
              {access.mode === "authenticated"
                ? `Přihlášeno: ${getRoleLabel(access.role)}`
                : "AI asistent: demo návrhy"}
            </div>
          </div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

function getLockedReasonLabel(reason: "auth_not_configured" | "unauthenticated" | "membership_missing") {
  if (reason === "auth_not_configured") {
    return "auth env chybí";
  }

  if (reason === "membership_missing") {
    return "role nenalezena";
  }

  return "nepřihlášeno";
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
