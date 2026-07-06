export type VisualAuditPresentation = {
  id: string;
  name: string;
  location: string;
  scenario: string;
  template: string;
  headline: string;
  accent: string;
  background: string;
  rows: Array<{ label: string; price: string; note: string }>;
  critique: string[];
  improvements: string[];
  scoreBefore: number;
  scoreAfter: number;
};

export type VisualAuditTemplate = {
  id: string;
  name: string;
  useCase: string;
  visualIdea: string;
  accent: string;
  background: string;
  layout: "split" | "list" | "hero" | "notice";
  critique: string[];
  improvements: string[];
  validationFocus: string[];
};

export const visualAuditPresentations: VisualAuditPresentation[] = [
  {
    id: "breakfast-quick",
    name: "Ranní rychlá nabídka",
    location: "Jídelna MASI-CO",
    scenario: "Snídaně a káva mezi 7:00-9:30",
    template: "Ranní menu",
    headline: "Ranní nabídka",
    accent: "#b71c1c",
    background: "linear-gradient(135deg, #fffdf9 0%, #efe6db 100%)",
    rows: [
      { label: "Míchaná vejce", price: "69 Kč", note: "Alergeny 3, 7" },
      { label: "Chléb se šunkou", price: "49 Kč", note: "Alergeny 1, 7" },
      { label: "Káva + koláč", price: "55 Kč", note: "do 9:30" }
    ],
    critique: [
      "Původní verze by pravděpodobně míchala akci a běžné položky bez jasné hierarchie.",
      "Ranní časové omezení musí být větší než detail alergenů.",
      "Cena combo nabídky nesmí vypadat jako cena samotné kávy."
    ],
    improvements: [
      "Oddělit combo do zvýrazněného pruhu a zbytek menu držet v klidném seznamu.",
      "Čas 7:00-9:30 dát pod nadpis jako provozní podmínku.",
      "Alergeny zkrátit na číselné chips, ne dlouhý šedý text."
    ],
    scoreBefore: 58,
    scoreAfter: 86
  },
  {
    id: "lunch-classic",
    name: "Klasické denní menu",
    location: "Výdejna výroba",
    scenario: "Nejčastější obědová smyčka 11:00-14:00",
    template: "Denní menu",
    headline: "Dnešní menu",
    accent: "#1f7a4d",
    background: "linear-gradient(135deg, #ffffff 0%, #f3f7f1 100%)",
    rows: [
      { label: "Gulášová polévka", price: "49 Kč", note: "1, 9" },
      { label: "Vepřový řízek", price: "159 Kč", note: "1, 3, 7" },
      { label: "Hovězí guláš", price: "149 Kč", note: "1, 3, 7" }
    ],
    critique: [
      "Tři položky fungují, ale při pěti a více položkách by cena ztratila vazbu na název.",
      "Polévka a hlavní jídla potřebují odlišný rytmus, ne stejnou váhu.",
      "Řádkové linky jsou slabé pro sledování z větší dálky."
    ],
    improvements: [
      "Přidat silnější vodicí linku mezi název a cenu.",
      "Polévku držet jako menší blok, hlavní jídla jako primární seznam.",
      "Automaticky splitovat nad 5 položek místo zmenšování písma."
    ],
    scoreBefore: 72,
    scoreAfter: 91
  },
  {
    id: "special-burger",
    name: "Special burger den",
    location: "Jídelna MASI-CO",
    scenario: "Jednodenní akce s jednou hero položkou",
    template: "Special nabídka",
    headline: "Burger special",
    accent: "#276a86",
    background: "linear-gradient(135deg, #101820 0%, #294c5c 100%)",
    rows: [
      { label: "Hovězí burger", price: "189 Kč", note: "hranolky v ceně" },
      { label: "Kuřecí burger", price: "169 Kč", note: "lehčí varianta" }
    ],
    critique: [
      "Tmavý food background snadno sníží kontrast menších textů.",
      "Hero akce musí mít jen jednu hlavní zprávu, ne plný jídelníček.",
      "Bez prázdné textové plochy AI background rychle soupeří s textem."
    ],
    improvements: [
      "Vynutit tmavý overlay a bezpečnou textovou zónu vlevo.",
      "Cenu udělat jako samostatný badge, ne řádek v tabulce.",
      "Do promptu pro obraz explicitně zakázat text, cedule, loga a čísla."
    ],
    scoreBefore: 49,
    scoreAfter: 88
  },
  {
    id: "sold-out",
    name: "Vyprodáno během oběda",
    location: "Záložní obrazovka",
    scenario: "Rychlá změna nabídky v 12:40",
    template: "Změna nabídky",
    headline: "Řízek vyprodán",
    accent: "#b7791f",
    background: "linear-gradient(135deg, #fff6e6 0%, #ffffff 100%)",
    rows: [
      { label: "Náhrada: kuřecí steak", price: "149 Kč", note: "Alergeny 7" },
      { label: "Polévka zůstává", price: "49 Kč", note: "beze změny" }
    ],
    critique: [
      "Změna musí být brutálně jasná, jinak lidé čekají špatné jídlo.",
      "Náhrada nesmí vypadat jako další běžná položka.",
      "Historie změny musí být auditovaná, ne jen dočasný text na TV."
    ],
    improvements: [
      "Použít varovný layout s jedním hlavním sdělením.",
      "Náhradu dát do zeleného potvrzeného bloku.",
      "Zobrazit čas změny a kdo ji schválil v adminu, ne na TV."
    ],
    scoreBefore: 42,
    scoreAfter: 84
  },
  {
    id: "allergen-legal",
    name: "Alergenová legenda",
    location: "Všechny provozovny",
    scenario: "Krátká informativní obrazovka ve smyčce",
    template: "Alergenová legenda",
    headline: "Alergeny",
    accent: "#4d3a31",
    background: "linear-gradient(135deg, #f8f5ef 0%, #ffffff 100%)",
    rows: [
      { label: "1 Lepek", price: "", note: "obiloviny" },
      { label: "3 Vejce", price: "", note: "výrobky z vajec" },
      { label: "7 Mléko", price: "", note: "včetně laktózy" }
    ],
    critique: [
      "Všech 14 alergenů na jedné TV obrazovce je pro 3 metry příliš husté.",
      "Legenda je právně užitečná, ale vizuálně nudná a málokdo ji stihne přečíst.",
      "Malé šedé vysvětlivky selžou na levnějších TV."
    ],
    improvements: [
      "Rozdělit legendu do dvou obrazovek nebo použít jen číselné chips na menu.",
      "Zvýšit řádkování a držet maximálně 7 položek na slide.",
      "Dlouhé názvy přesunout do QR/detailu mimo TV smyčku."
    ],
    scoreBefore: 50,
    scoreAfter: 78
  },
  {
    id: "weekly-preview",
    name: "Zítřejší ochutnávka",
    location: "Jídelna MASI-CO",
    scenario: "Promo slide na konec smyčky",
    template: "Promo",
    headline: "Zítra se těšte",
    accent: "#7a2f8f",
    background: "linear-gradient(135deg, #ffffff 0%, #f2e9f7 100%)",
    rows: [
      { label: "Svíčková na smetaně", price: "", note: "zítra od 11:00" },
      { label: "Domácí dezert", price: "", note: "omezené množství" }
    ],
    critique: [
      "Promo bez ceny může působit jako dnešní nabídka a mást hosty.",
      "Slovo zítra musí být výraznější než název jídla.",
      "Fialová akce může utéct mimo MASI-CO brand, pokud není červená jen akcent."
    ],
    improvements: [
      "Přidat velký badge ZÍTRA, žádné ceny, žádné alergeny.",
      "Barevnost držet neutrální a akcentovat pouze štítkem.",
      "V adminu jasně označit, že slide není dnešní menu."
    ],
    scoreBefore: 61,
    scoreAfter: 82
  },
  {
    id: "opening-hours",
    name: "Otevírací doba",
    location: "Výdejna výroba",
    scenario: "Informační slide mimo obědovou špičku",
    template: "Info",
    headline: "Otevírací doba",
    accent: "#276a86",
    background: "linear-gradient(135deg, #eef7fb 0%, #ffffff 100%)",
    rows: [
      { label: "Snídaně", price: "7:00-9:30", note: "" },
      { label: "Obědy", price: "11:00-14:00", note: "" },
      { label: "Výdej s sebou", price: "do 14:30", note: "" }
    ],
    critique: [
      "Časy musí být zarovnané do jednoho sloupce, jinak se špatně skenují.",
      "Info slide nepotřebuje food fotografii; rušila by čitelnost.",
      "Nesmí soupeřit s denním menu stejnou vizuální hlasitostí."
    ],
    improvements: [
      "Použít čistý dvousloupcový layout s ikonou hodin.",
      "Dát nižší prioritu ve smyčce a kratší duration.",
      "Zvýraznit jen změnu oproti normálu, ne celý rozpis."
    ],
    scoreBefore: 64,
    scoreAfter: 89
  },
  {
    id: "diet-tags",
    name: "Vegetariánská volba",
    location: "Jídelna MASI-CO",
    scenario: "Dietní preference bez neověřených tvrzení",
    template: "Denní menu s tagy",
    headline: "Lehčí volba",
    accent: "#1f7a4d",
    background: "linear-gradient(135deg, #f2fbf6 0%, #ffffff 100%)",
    rows: [
      { label: "Zeleninové rizoto", price: "139 Kč", note: "bez masa" },
      { label: "Salát s balkánem", price: "129 Kč", note: "7" }
    ],
    critique: [
      "Tagy jako vegan/fit/gluten free jsou rizikové, pokud nejsou strukturovaně ověřené.",
      "Zelená barva sama o sobě může naznačovat dietní tvrzení.",
      "Bez masa není totéž co vegetariánské, pokud provoz nemá pravidla."
    ],
    improvements: [
      "Zobrazit jen ověřené štítky z dat, jinak použít neutrální copy.",
      "Dietní štítky držet jako malé chips vedle názvu.",
      "Změna dietního tvrzení musí vždy vracet obsah do reapproval."
    ],
    scoreBefore: 46,
    scoreAfter: 83
  },
  {
    id: "price-change",
    name: "Změna ceny",
    location: "Výdejna výroba",
    scenario: "Manager opravil cenu před publikací",
    template: "Schvalovací náhled",
    headline: "Kontrola ceny",
    accent: "#b71c1c",
    background: "linear-gradient(135deg, #fffdf9 0%, #f7eeee 100%)",
    rows: [
      { label: "Kuřecí steak", price: "149 Kč", note: "opraveno z 139 Kč" },
      { label: "Rýže", price: "v ceně", note: "" }
    ],
    critique: [
      "TV nemá zobrazovat historii změny ceny, ale admin ji musí vidět.",
      "Cena je faktický údaj; AI ji nesmí upravit bez schválení.",
      "Při opravě ceny musí spadnout předchozí approval."
    ],
    improvements: [
      "Na TV ukázat jen finální cenu.",
      "V admin preview zobrazit diff stará/nová cena.",
      "Audit log musí obsahovat uživatele, čas a důvod změny."
    ],
    scoreBefore: 55,
    scoreAfter: 90
  },
  {
    id: "full-loop",
    name: "Kompletní 90s smyčka",
    location: "Všechny obrazovky",
    scenario: "Plná denní smyčka pro TV player i MP4 export",
    template: "Multi-slide loop",
    headline: "Dnešní smyčka",
    accent: "#191513",
    background: "linear-gradient(135deg, #ffffff 0%, #f6f3ee 100%)",
    rows: [
      { label: "Denní menu", price: "27 s", note: "3 položky" },
      { label: "Special", price: "8 s", note: "1 položka" },
      { label: "Alergeny", price: "10 s", note: "legenda" }
    ],
    critique: [
      "Loop musí být čitelný jako celek, ne jen každý slide zvlášť.",
      "Příliš dlouhá alergenová část zhorší vnímání hlavního menu.",
      "Přechody nesmí být výraznější než obsah."
    ],
    improvements: [
      "Držet běžnou smyčku do 45-90 sekund.",
      "Prioritizovat denní menu a special, info slidy dávat kratší.",
      "Před publish validovat celkovou délku, počet slidů a poslední dobrou verzi."
    ],
    scoreBefore: 67,
    scoreAfter: 92
  }
];

export const visualAuditTemplates: VisualAuditTemplate[] = [
  {
    id: "template-clean-daily",
    name: "Čisté denní menu",
    useCase: "Standardní obědová nabídka",
    visualIdea: "Bílá plocha, silné názvy, ceny v pravém sloupci, červený sekční štítek.",
    accent: "#b71c1c",
    background: "linear-gradient(135deg, #ffffff 0%, #f6f3ee 100%)",
    layout: "list",
    critique: ["Snadno se přeplní při více než pěti jídlech.", "Cena daleko vpravo potřebuje vodicí linku."],
    improvements: ["Automatický split nad limit.", "Silnější řádkování a leader lines."],
    validationFocus: ["max 5 položek", "kontrast ceny", "safe area"]
  },
  {
    id: "template-soup-main",
    name: "Polévka + hlavní jídla",
    useCase: "Krátké denní menu se soup blokem",
    visualIdea: "Polévka jako menší horní blok, hlavní jídla jako dominantní seznam.",
    accent: "#1f7a4d",
    background: "linear-gradient(135deg, #f7fbf7 0%, #ffffff 100%)",
    layout: "list",
    critique: ["Polévka nesmí konkurovat hlavním jídlům.", "Zelená může působit dietně."],
    improvements: ["Polévku zmenšit na badge.", "Zelenou používat jen pro stav, ne pro brand."],
    validationFocus: ["hierarchie sekcí", "max 4 hlavní jídla", "alergeny jako chips"]
  },
  {
    id: "template-special-hero",
    name: "Special hero",
    useCase: "Jedna akční položka",
    visualIdea: "Velký nadpis, jedna položka, cena jako výrazný badge, klidný food background.",
    accent: "#276a86",
    background: "linear-gradient(135deg, #0f1c22 0%, #315b68 100%)",
    layout: "hero",
    critique: ["Tmavé pozadí je riziko pro text.", "AI background může obsahovat falešný text."],
    improvements: ["Overlay s min. kontrastem 4.5.", "Post-generation OCR kontrola bez textu."],
    validationFocus: ["OCR no-text", "contrast", "hero max 1-2 položky"]
  },
  {
    id: "template-promo",
    name: "Promo akce",
    useCase: "Zítřejší nabídka, event, sezónní akce",
    visualIdea: "Krátká zpráva, žádná tabulka, časový badge, výrazná bezpečná textová plocha.",
    accent: "#7a2f8f",
    background: "linear-gradient(135deg, #ffffff 0%, #f3e9f7 100%)",
    layout: "hero",
    critique: ["Promo může mást s dnešním menu.", "Bez jasného data je provozně nebezpečné."],
    improvements: ["Povinný datum/časový štítek.", "Zakázat ceny, pokud nejde o dnešní nabídku."],
    validationFocus: ["datum", "žádné falešné ceny", "duration max 8 s"]
  },
  {
    id: "template-sold-out",
    name: "Vyprodáno / náhrada",
    useCase: "Rychlá změna během dne",
    visualIdea: "Varovný nadpis, náhrada v potvrzeném bloku, minimální text.",
    accent: "#b7791f",
    background: "linear-gradient(135deg, #fff8e8 0%, #ffffff 100%)",
    layout: "notice",
    critique: ["Příliš mnoho detailů zpomalí pochopení.", "Červená by mohla vypadat jako chyba systému."],
    improvements: ["Použít amber pro změnu, červenou jen pro kritické chyby.", "Náhradu zobrazit jednou větou."],
    validationFocus: ["jedna hlavní zpráva", "čas změny v adminu", "audit log"]
  },
  {
    id: "template-info-hours",
    name: "Info / otevírací doba",
    useCase: "Provozní informace mimo menu",
    visualIdea: "Dvousloupcový rozpis, ikonka hodin, žádné jídlo na pozadí.",
    accent: "#276a86",
    background: "linear-gradient(135deg, #eef7fb 0%, #ffffff 100%)",
    layout: "split",
    critique: ["Info může být nudné a zbytečně dlouhé.", "Malé časy se špatně čtou z dálky."],
    improvements: ["Časy tabulárně zarovnat.", "Zobrazit jen výjimky, ne celý provoz každý den."],
    validationFocus: ["časový formát", "max 4 řádky", "duration 5-7 s"]
  },
  {
    id: "template-allergen-split",
    name: "Alergeny rozděleně",
    useCase: "Legenda alergenu bez mikropísma",
    visualIdea: "Dvě varianty slidů po 7 alergenech, větší řádky, jednoduché číslování.",
    accent: "#4d3a31",
    background: "linear-gradient(135deg, #fffdf9 0%, #f0e8de 100%)",
    layout: "list",
    critique: ["Jedna obrazovka pro 14 položek je příliš hustá.", "Full názvy nepotřebují stejnou váhu jako číslo."],
    improvements: ["Rozdělit na 1-7 a 8-14.", "Čísla zvětšit, popis zkrátit."],
    validationFocus: ["max 7 položek", "min font size", "line height"]
  },
  {
    id: "template-photo-left",
    name: "Foto vlevo, text vpravo",
    useCase: "Background schválený designérem",
    visualIdea: "Fotka zabírá levých 40 %, text vpravo na čisté ploše.",
    accent: "#b71c1c",
    background: "linear-gradient(135deg, #33251d 0%, #fffdf9 52%, #ffffff 100%)",
    layout: "split",
    critique: ["Fotka může ukrojit safe area nebo tmavnout text.", "Stock-like jídlo snižuje důvěru."],
    improvements: ["Vyžadovat skutečný asset nebo AI obraz bez textu.", "Textovou zónu validovat nezávisle na fotce."],
    validationFocus: ["asset present", "safe text zone", "contrast"]
  },
  {
    id: "template-price-board",
    name: "Cenová tabule",
    useCase: "Více krátkých položek s cenami",
    visualIdea: "Kompaktní seznam s pevnou cenovou osou a silnými oddělovači.",
    accent: "#191513",
    background: "linear-gradient(135deg, #ffffff 0%, #f9f9f7 100%)",
    layout: "list",
    critique: ["Hrozí příliš hustá tabulka.", "Bez skupin se ztrácí polévka vs hlavní jídla."],
    improvements: ["Povinné sekce.", "Nepřidávat víc než 6 položek, raději split."],
    validationFocus: ["price alignment", "section labels", "overflow split"]
  },
  {
    id: "template-restore-good",
    name: "Poslední dobrá verze",
    useCase: "Fallback při chybě renderu nebo publikace",
    visualIdea: "Není designová šablona pro hosty, ale interní restore náhled v adminu.",
    accent: "#1f7a4d",
    background: "linear-gradient(135deg, #f4fbf7 0%, #ffffff 100%)",
    layout: "notice",
    critique: ["Hosté nemají vidět interní chybu.", "Admin musí vidět, co se obnoví a na jaké obrazovky."],
    improvements: ["Na TV držet poslední export.", "V adminu vypsat verzi, čas, autor, checksum."],
    validationFocus: ["last known good", "screen list", "confirmation"]
  }
];
