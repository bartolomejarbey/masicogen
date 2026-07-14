export function formatCzk(amount: number | null) {
  if (amount === null) {
    // Nevyplněná cena = na slidu se nic nekreslí (dřív „Cena k ověření"
    // přetékalo přes alergeny). Obsluha prázdné místo vidí a doplní.
    return "";
  }

  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatCzechDate(date: string | null) {
  if (!date) {
    return "Datum k ověření";
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${date}T12:00:00`));
}
