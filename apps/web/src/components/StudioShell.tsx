import {
  Archive,
  Bot,
  CheckSquare,
  Clapperboard,
  Download,
  Home,
  Image,
  MonitorPlay,
  Settings,
  ShieldAlert,
  Utensils
} from "lucide-react";
import Link from "next/link";
import { getStudioAccessState, type StudioAccessRole, type StudioAccessState } from "@/lib/studio-auth";

const navItems = [
  { label: "Dnes", icon: Home, section: "today", href: "/" },
  { label: "Vizuální audit", icon: CheckSquare, section: "audit", href: "/audit" },
  { label: "Readiness", icon: ShieldAlert, section: "readiness", href: "/readiness" },
  { label: "Menu - plánováno", icon: Utensils },
  { label: "TV Studio - plánováno", icon: Clapperboard },
  { label: "Schválení - plánováno", icon: CheckSquare },
  { label: "Média - plánováno", icon: Image },
  { label: "Exporty - plánováno", icon: Download },
  { label: "Archiv - plánováno", icon: Archive },
  { label: "Nastavení - plánováno", icon: Settings }
];

export async function StudioShell({
  activeSection = "today",
  access: providedAccess,
  children
}: {
  activeSection?: "today" | "audit" | "readiness";
  access?: StudioAccessState;
  children: React.ReactNode;
}) {
  const access = providedAccess ?? (await getStudioAccessState());

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

            if (item.href) {
              return (
                <Link className={`nav-item ${isActive ? "active" : ""}`} href={item.href} key={item.label}>
                  <Icon size={18} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            }

            return (
              <span
                className="nav-item future"
                key={item.label}
                title="Sekce připravená pro další milník"
              >
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </span>
            );
          })}
        </nav>
        <div className="sidebar-meta" style={{ marginTop: 28 }}>
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
