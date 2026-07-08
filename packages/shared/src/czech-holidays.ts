const fixedHolidays: Record<string, string> = {
  "01-01": "Den obnovy samostatného českého státu",
  "05-01": "Svátek práce",
  "05-08": "Den vítězství",
  "07-05": "Den slovanských věrozvěstů Cyrila a Metoděje",
  "07-06": "Den upálení mistra Jana Husa",
  "09-28": "Den české státnosti",
  "10-28": "Den vzniku samostatného československého státu",
  "11-17": "Den boje za svobodu a demokracii",
  "12-24": "Štědrý den",
  "12-25": "1. svátek vánoční",
  "12-26": "2. svátek vánoční"
};

const dayMs = 24 * 60 * 60 * 1000;

/** Neděle velikonoční — anonymní gregoriánský algoritmus (computus). */
function easterSundayUtc(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}

/** Název českého státního svátku pro ISO datum (YYYY-MM-DD), jinak null. */
export function czechHolidayName(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return null;
  }

  const fixed = fixedHolidays[`${match[2]}-${match[3]}`];
  if (fixed) {
    return fixed;
  }

  const year = Number(match[1]);
  const dateUtc = Date.UTC(year, Number(match[2]) - 1, Number(match[3]));
  const easterUtc = easterSundayUtc(year);

  if (dateUtc === easterUtc - 2 * dayMs) {
    return "Velký pátek";
  }
  if (dateUtc === easterUtc + dayMs) {
    return "Velikonoční pondělí";
  }

  return null;
}
