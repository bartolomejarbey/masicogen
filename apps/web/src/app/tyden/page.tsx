import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** /tyden bez data → přehled aktuálního týdne (pondělí dle Europe/Prague). */
export default function WeekIndexPage() {
  redirect(`/tyden/${currentPragueMondayIso()}`);
}

function currentPragueMondayIso() {
  const todayIso = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  const date = new Date(`${todayIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
