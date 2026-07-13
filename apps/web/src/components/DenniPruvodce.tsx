"use client";

import { useMemo, useState } from "react";
import {
  buildDailyDeckManifest,
  formatCzechDate,
  parsePastedMenuText,
  type MenuExtractionResult
} from "@masico/shared";
import { TvComposition } from "@masico/render";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  Loader2,
  MonitorPlay,
  Pencil,
  Tv,
  UtensilsCrossed
} from "lucide-react";
import type { ProductionDashboardSnapshot } from "@/lib/studio-dashboard";
import { ScaledTvFrame } from "./ScaledTvFrame";

type Radek = { nazev: string; cena: string; alergeny: string };

type LaunchOk = {
  ok: true;
  playerUrl: string | null;
  slideCount?: number;
  loopDurationSeconds?: number;
};

const prazdnyRadek = (): Radek => ({ nazev: "", cena: "", alergeny: "" });
const POCET_POLEVEK = 2;
const POCET_HLAVNICH = 5;

/**
 * Domovská obrazovka jako průvodce 1-2-3: napiš dnešní menu → zkontroluj
 * náhled TV → pusť na TV. Vždy jen jedna věc na obrazovce, velká tlačítka.
 * Náhled i spuštění běží ze STEJNÉHO textu (parsePastedMenuText), takže co
 * je vidět v náhledu, to poběží na TV.
 */
export function DenniPruvodce({
  snapshot,
  canLaunch,
  roleLabel
}: {
  snapshot: ProductionDashboardSnapshot;
  canLaunch: boolean;
  roleLabel: string;
}) {
  const [krok, setKrok] = useState<1 | 2 | 3>(1);
  const [polevky, setPolevky] = useState<Radek[]>(() =>
    Array.from({ length: POCET_POLEVEK }, prazdnyRadek)
  );
  const [hlavni, setHlavni] = useState<Radek[]>(() =>
    Array.from({ length: POCET_HLAVNICH }, prazdnyRadek)
  );
  const [nahledSlide, setNahledSlide] = useState<string | null>(null);
  const [odesilam, setOdesilam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [hotovo, setHotovo] = useState<LaunchOk | null>(null);

  const menuDate = snapshot.todayIso;

  // Kam se pouští: první jídelna a první spárovaná TV. MASI-CO má typicky
  // jednu — víc jich vyřeší nastavení, sem patří „prostě to pusť".
  const location = snapshot.locations[0] ?? null;
  const canteen =
    snapshot.canteens.find((item) => item.locationId === location?.id) ??
    snapshot.canteens[0] ??
    null;
  const screen =
    snapshot.screens.find(
      (item) => item.canteenId === canteen?.id && item.status !== "unpaired"
    ) ??
    snapshot.screens.find((item) => item.status !== "unpaired") ??
    null;

  const sourceText = useMemo(() => stavText(polevky, hlavni), [polevky, hlavni]);
  const pocetJidel =
    polevky.filter((r) => r.nazev.trim()).length + hlavni.filter((r) => r.nazev.trim()).length;

  const menu = useMemo<MenuExtractionResult | null>(() => {
    if (sourceText.trim().length < 3) {
      return null;
    }
    try {
      return parsePastedMenuText(sourceText, menuDate);
    } catch {
      return null;
    }
  }, [sourceText, menuDate]);

  const previewDeck = useMemo(() => {
    if (!menu) return null;
    try {
      return buildDailyDeckManifest(menu);
    } catch {
      return null;
    }
  }, [menu]);

  const aktivniSlide =
    nahledSlide && previewDeck?.slides.some((s) => s.id === nahledSlide)
      ? nahledSlide
      : previewDeck?.slides[0]?.id ?? null;

  function upravRadek(
    typ: "polevka" | "hlavni",
    index: number,
    pole: keyof Radek,
    hodnota: string
  ) {
    const setter = typ === "polevka" ? setPolevky : setHlavni;
    setter((radky) => radky.map((r, i) => (i === index ? { ...r, [pole]: hodnota } : r)));
    setHotovo(null);
    setChyba(null);
  }

  async function pustitNaTv() {
    if (!canLaunch) {
      setChyba("Pouštět na TV může jen přihlášený vlastník, admin nebo editor.");
      return;
    }
    if (!location || !canteen) {
      setChyba("Nejdřív v Nastavení vytvořte provozovnu a jídelnu.");
      return;
    }
    if (!screen) {
      setChyba("Zatím není spárovaná žádná TV. Spárujte obrazovku v Nastavení a zkuste to znovu.");
      return;
    }

    setOdesilam(true);
    setChyba(null);
    setHotovo(null);
    try {
      const response = await fetch("/api/today/launch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationId: location.id,
          canteenId: canteen.id,
          menuDate,
          sourceText,
          screenId: screen.id,
          comment: "Spuštěno průvodcem na hlavní obrazovce."
        })
      });
      const body = (await response.json().catch(() => null)) as
        | (LaunchOk & { error?: string })
        | { error?: string }
        | null;
      if (!response.ok || !body || !("ok" in body)) {
        const zprava = body && "error" in body ? body.error : null;
        throw new Error(zprava ?? `Spuštění selhalo (${response.status}).`);
      }
      setHotovo(body);
    } catch (error) {
      setChyba(error instanceof Error ? error.message : "Spuštění na TV selhalo.");
    } finally {
      setOdesilam(false);
    }
  }

  return (
    <div className="pruvodce">
      <header className="pruvodce-head">
        <div>
          <p className="pruvodce-datum">Dnes · {formatCzechDate(menuDate)}</p>
          <h1 className="pruvodce-title">Dostat dnešní menu na TV</h1>
        </div>
        <span className="pruvodce-role">{roleLabel}</span>
      </header>

      <ol className="pruvodce-kroky" aria-label="Postup">
        {[
          { n: 1, label: "Napsat menu", icon: Pencil },
          { n: 2, label: "Náhled", icon: Eye },
          { n: 3, label: "Pustit na TV", icon: Tv }
        ].map((k) => {
          const Ikona = k.icon;
          const stav = krok === k.n ? "aktivni" : krok > k.n ? "hotovo" : "";
          return (
            <li className={`pruvodce-krok ${stav}`} key={k.n}>
              <span className="pruvodce-krok-cislo">
                {krok > k.n ? <CheckCircle2 aria-hidden="true" size={20} /> : k.n}
              </span>
              <span className="pruvodce-krok-label">
                <Ikona aria-hidden="true" size={16} /> {k.label}
              </span>
            </li>
          );
        })}
      </ol>

      {snapshot.dataError ? (
        <div className="pruvodce-chyba" role="alert">
          Přihlášení funguje, ale data se nepodařilo načíst. Zkuste stránku načíst znovu.
        </div>
      ) : null}

      {krok === 1 ? (
        <section className="pruvodce-panel" aria-labelledby="krok1">
          <div className="pruvodce-panel-head">
            <h2 id="krok1">
              <span className="pruvodce-cislo-velky">1</span> Napište dnešní menu
            </h2>
            <p>Stačí název jídla. Cenu a alergeny doplňte, ať to jde rovnou na TV.</p>
          </div>

          <SkupinaRadku
            ikona={<UtensilsCrossed aria-hidden="true" size={18} />}
            label="Polévky"
            popisek="Polévka"
            radky={polevky}
            typ="polevka"
            onZmena={upravRadek}
          />
          <SkupinaRadku
            ikona={<UtensilsCrossed aria-hidden="true" size={18} />}
            label="Hlavní jídla"
            popisek="Hlavní jídlo"
            radky={hlavni}
            typ="hlavni"
            onZmena={upravRadek}
          />

          <div className="pruvodce-navigace">
            <span className="pruvodce-pocet">{pocetJidel} jídel vyplněno</span>
            <button
              className="pruvodce-tlacitko primary"
              disabled={pocetJidel === 0}
              onClick={() => setKrok(2)}
              type="button"
            >
              Dál — náhled <ArrowRight aria-hidden="true" size={22} />
            </button>
          </div>
        </section>
      ) : null}

      {krok === 2 ? (
        <section className="pruvodce-panel" aria-labelledby="krok2">
          <div className="pruvodce-panel-head">
            <h2 id="krok2">
              <span className="pruvodce-cislo-velky">2</span> Takhle to bude vypadat na TV
            </h2>
            <p>Zkontrolujte, že je vše správně. Když ne, vraťte se a upravte.</p>
          </div>

          {previewDeck && menu && aktivniSlide ? (
            <>
              <div className="pruvodce-nahled">
                <ScaledTvFrame>
                  <TvComposition activeSlideId={aktivniSlide} deck={previewDeck} menu={menu} />
                </ScaledTvFrame>
              </div>
              {previewDeck.slides.length > 1 ? (
                <div className="pruvodce-nahled-prepinac">
                  {previewDeck.slides.map((slide, index) => (
                    <button
                      className={aktivniSlide === slide.id ? "active" : ""}
                      key={slide.id}
                      onClick={() => setNahledSlide(slide.id)}
                      type="button"
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="pruvodce-nahled-prazdno">
              Zatím není z čeho udělat náhled — vraťte se a napište aspoň jedno jídlo.
            </div>
          )}

          <div className="pruvodce-navigace">
            <button className="pruvodce-tlacitko" onClick={() => setKrok(1)} type="button">
              <ArrowLeft aria-hidden="true" size={22} /> Zpět — upravit
            </button>
            <button
              className="pruvodce-tlacitko primary"
              disabled={!previewDeck}
              onClick={() => setKrok(3)}
              type="button"
            >
              Dál — pustit na TV <ArrowRight aria-hidden="true" size={22} />
            </button>
          </div>
        </section>
      ) : null}

      {krok === 3 ? (
        <section className="pruvodce-panel" aria-labelledby="krok3">
          <div className="pruvodce-panel-head">
            <h2 id="krok3">
              <span className="pruvodce-cislo-velky">3</span> Pustit na TV
            </h2>
            <p>
              {screen
                ? `Menu se pošle na obrazovku „${screen.name}". Na TV naskočí do minuty.`
                : "Zatím není spárovaná žádná TV."}
            </p>
          </div>

          <div className="pruvodce-souhrn">
            <div>
              <span className="pruvodce-souhrn-label">Provozovna</span>
              <strong>{location?.name ?? "—"}</strong>
            </div>
            <div>
              <span className="pruvodce-souhrn-label">TV obrazovka</span>
              <strong>{screen?.name ?? "Není spárovaná"}</strong>
            </div>
            <div>
              <span className="pruvodce-souhrn-label">Jídel v menu</span>
              <strong>{pocetJidel}</strong>
            </div>
          </div>

          {chyba ? (
            <div className="pruvodce-chyba" role="alert">
              {chyba}
            </div>
          ) : null}

          {hotovo ? (
            <div className="pruvodce-hotovo" role="status">
              <CheckCircle2 aria-hidden="true" size={26} />
              <div>
                <strong>Hotovo — menu běží na TV.</strong>
                <span>Web přehrávač si novou verzi načte do minuty.</span>
              </div>
              {hotovo.playerUrl ? (
                <a className="pruvodce-tlacitko" href={hotovo.playerUrl} rel="noreferrer" target="_blank">
                  <MonitorPlay aria-hidden="true" size={20} /> Otevřít TV
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="pruvodce-navigace">
            <button className="pruvodce-tlacitko" onClick={() => setKrok(2)} type="button">
              <ArrowLeft aria-hidden="true" size={22} /> Zpět — náhled
            </button>
            {!hotovo ? (
              <button
                className="pruvodce-tlacitko velke primary"
                disabled={odesilam || !canLaunch || !screen}
                onClick={() => void pustitNaTv()}
                type="button"
              >
                {odesilam ? (
                  <Loader2 aria-hidden="true" className="spin" size={24} />
                ) : (
                  <Tv aria-hidden="true" size={24} />
                )}
                {odesilam ? "Posílám na TV…" : "Pustit na TV"}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SkupinaRadku({
  label,
  popisek,
  ikona,
  radky,
  typ,
  onZmena
}: {
  label: string;
  popisek: string;
  ikona: React.ReactNode;
  radky: Radek[];
  typ: "polevka" | "hlavni";
  onZmena: (typ: "polevka" | "hlavni", index: number, pole: keyof Radek, hodnota: string) => void;
}) {
  return (
    <div className="pruvodce-skupina">
      <p className="pruvodce-skupina-label">
        {ikona} {label}
      </p>
      <div className="pruvodce-radky">
        {radky.map((radek, index) => (
          <div className="pruvodce-radek" key={index}>
            <input
              aria-label={`${popisek} ${index + 1} — název`}
              className="pruvodce-nazev"
              maxLength={160}
              onChange={(event) => onZmena(typ, index, "nazev", event.target.value)}
              placeholder={`${popisek} ${index + 1} (nepovinné)`}
              value={radek.nazev}
            />
            <input
              aria-label={`${popisek} ${index + 1} — cena`}
              className="pruvodce-cena"
              inputMode="numeric"
              onChange={(event) => onZmena(typ, index, "cena", event.target.value.replace(/[^\d]/g, ""))}
              placeholder="Kč"
              value={radek.cena}
            />
            <input
              aria-label={`${popisek} ${index + 1} — alergeny`}
              className="pruvodce-alergeny"
              onChange={(event) => onZmena(typ, index, "alergeny", event.target.value)}
              placeholder="alergeny (1, 7)"
              value={radek.alergeny}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Strukturovaná pole → text ve formátu, který umí parsePastedMenuText. */
function stavText(polevky: Radek[], hlavni: Radek[]): string {
  const bloky: string[] = [];
  const napln = (nadpis: string, radky: Radek[]) => {
    const vyplnene = radky.filter((r) => r.nazev.trim());
    if (vyplnene.length === 0) return;
    bloky.push([nadpis, ...vyplnene.map(radekText)].join("\n"));
  };
  napln("Polévky", polevky);
  napln("Hlavní jídla", hlavni);
  return bloky.join("\n\n").trim();
}

function radekText(radek: Radek): string {
  let text = radek.nazev.trim();
  if (radek.cena.trim()) {
    text += ` ${radek.cena.trim()} Kč`;
  }
  if (radek.alergeny.trim()) {
    text += ` alergeny ${radek.alergeny.trim()}`;
  }
  return text;
}
