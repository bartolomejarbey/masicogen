import { CalendarDays, CircleCheck, CircleDashed, Pencil } from "lucide-react";
import type { ProductionDashboardSnapshot } from "@/lib/studio-dashboard";

type WeekStripProps = {
  snapshot: ProductionDashboardSnapshot;
};

type DayState = "empty" | "draft" | "ready";

const dayStateCopy: Record<DayState, { label: string; hint: string }> = {
  empty: { label: "Prázdný", hint: "Menu zatím není" },
  draft: { label: "Rozepsaný", hint: "Menu čeká na dokončení" },
  ready: { label: "Připravený", hint: "V den D se pustí sám" }
};

/**
 * Pás sedmi dní dopředu. Stav nese text a ikona, ne jen barva —
 * modrou a zelenou starší oči špatně rozlišují.
 */
export function WeekStrip({ snapshot }: WeekStripProps) {
  const canteenId = snapshot.canteens[0]?.id ?? null;
  const days = buildWeek(snapshot.todayIso);

  return (
    <section className="week-strip" aria-label="Menu na příštích 7 dní">
      <header className="week-strip-head">
        <CalendarDays size={22} aria-hidden="true" />
        <h2>Menu na dny dopředu</h2>
        <p>Klepněte na den a připravte menu předem. TV si ho v ten den pustí sama.</p>
      </header>
      <div className="week-strip-days">
        {days.map((day) => {
          const menu = canteenId
            ? snapshot.upcomingMenus.find(
                (candidate) => candidate.canteenId === canteenId && candidate.date === day.iso
              )
            : undefined;
          const state: DayState = !menu
            ? "empty"
            : menu.status === "approved" || menu.status === "published"
              ? "ready"
              : "draft";
          const copy = dayStateCopy[state];

          return (
            <a
              className={`week-day ${state} ${day.isToday ? "today" : ""}`}
              href={`/den/${day.iso}`}
              key={day.iso}
            >
              <span className="week-day-name">
                {day.isToday ? "Dnes" : day.weekday}
              </span>
              <strong className="week-day-date">{day.dayLabel}</strong>
              <span className="week-day-state">
                {state === "ready" ? (
                  <CircleCheck size={18} aria-hidden="true" />
                ) : state === "draft" ? (
                  <Pencil size={18} aria-hidden="true" />
                ) : (
                  <CircleDashed size={18} aria-hidden="true" />
                )}
                {copy.label}
              </span>
              <small>{copy.hint}</small>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function buildWeek(todayIso: string) {
  const base = new Date(`${todayIso}T12:00:00`);
  const weekdayFormat = new Intl.DateTimeFormat("cs-CZ", { weekday: "long" });
  const dayFormat = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric" });

  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(base);
    date.setDate(base.getDate() + offset);
    const iso = date.toISOString().slice(0, 10);

    return {
      iso,
      isToday: offset === 0,
      weekday: weekdayFormat.format(date),
      dayLabel: dayFormat.format(date)
    };
  });
}
