import Link from "next/link";
import { CircleAlert, CircleCheck, Sparkles } from "lucide-react";
import type { ProductionDashboardSnapshot } from "@/lib/studio-dashboard";

type AutopilotBannerProps = {
  snapshot: ProductionDashboardSnapshot;
};

/**
 * Stavový pruh autopilota na homepage (server komponenta). Priorita:
 * 1. drafty čekající na kontrolu (žlutá) → /tyden,
 * 2. dnešek bez decku dle ranní kontroly (červená) → /den/[dnes],
 * 3. dnešní deck připravený (zelená),
 * 4. bez ranní kontroly a bez draftů se nic neukazuje.
 */
export function AutopilotBanner({ snapshot }: AutopilotBannerProps) {
  const { autopilot, todayIso } = snapshot;

  if (autopilot.pendingReviewDates.length > 0) {
    return (
      <section className="autopilot-banner review" aria-label="Autopilot čeká na kontrolu">
        <Sparkles size={22} aria-hidden="true" />
        <div>
          <strong>
            Autopilot načetl jídelníček — zkontrolujte{" "}
            {formatCzechDayList(autopilot.pendingReviewDates)}
          </strong>
          <p>Ceny a alergeny přečetl systém z lístku. Před vysíláním je potvrďte.</p>
        </div>
        <Link className="button" href="/tyden">
          Zkontrolovat týden
        </Link>
      </section>
    );
  }

  if (autopilot.lastMorningCheck?.detail.hasDeckToday === false) {
    return (
      <section className="autopilot-banner alert" aria-label="Chybí dnešní menu">
        <CircleAlert size={22} aria-hidden="true" />
        <div>
          <strong>Na dnešek není připravené menu</strong>
          <p>TV nemá co pustit. Vložte dnešní menu, nebo nahrajte týdenní lístek.</p>
        </div>
        <a className="button" href={`/den/${todayIso}`}>
          Připravit dnešek
        </a>
      </section>
    );
  }

  if (autopilot.lastMorningCheck?.detail.hasDeckToday === true) {
    return (
      <section className="autopilot-banner ok" aria-label="Autopilot v pořádku">
        <CircleCheck size={22} aria-hidden="true" />
        <div>
          <strong>Týden je připravený ✓ TV se o sebe postará</strong>
        </div>
      </section>
    );
  }

  return null;
}

/** „2026-07-08" → „středa 8. 7." — spojené čárkami pro víc dní. */
function formatCzechDayList(dates: string[]) {
  const format = new Intl.DateTimeFormat("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "numeric"
  });

  return dates.map((date) => format.format(new Date(`${date}T12:00:00`))).join(", ");
}
