import type { CSSProperties } from "react";
import {
  allergenCatalog,
  formatCzk,
  formatCzechDate,
  getAllergenLabel,
  type DeckManifest,
  type MenuExtractionResult,
  type Slide
} from "@masico/shared";

type TvCompositionProps = {
  deck: DeckManifest;
  menu: MenuExtractionResult;
  activeSlideId?: string;
  showSafeArea?: boolean;
};

const rootStyle: CSSProperties = {
  position: "relative",
  width: "1920px",
  height: "1080px",
  overflow: "hidden",
  background: "linear-gradient(135deg, #fcfbf7 0%, #f4efe6 48%, #1d1b19 100%)",
  color: "#181512",
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
};

const safeAreaStyle: CSSProperties = {
  position: "absolute",
  top: "72px",
  right: "128px",
  bottom: "72px",
  left: "128px",
  border: "2px dashed rgba(255, 255, 255, 0.65)",
  pointerEvents: "none",
  zIndex: 5
};

export function TvComposition({
  deck,
  menu,
  activeSlideId,
  showSafeArea = false
}: TvCompositionProps) {
  const slide = deck.slides.find((item) => item.id === activeSlideId) ?? deck.slides[0];

  return (
    <div style={rootStyle}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            slide.templateId === "special-offer"
              ? "radial-gradient(circle at 82% 30%, rgba(183, 28, 28, .38), transparent 32%), linear-gradient(120deg, #171412 0%, #34231d 52%, #f4efe6 100%)"
              : "linear-gradient(120deg, #fbfaf6 0%, #fff 46%, #f1e6d5 100%)"
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "96px",
          left: "128px",
          right: "128px",
          bottom: "128px",
          display: "grid",
          gridTemplateColumns: slide.templateId === "special-offer" ? "1fr 0.8fr" : "1fr",
          gap: "48px",
          zIndex: 2
        }}
      >
        {renderSlide(slide, menu)}
      </div>
      <div
        style={{
          position: "absolute",
          right: "128px",
          bottom: "78px",
          color: "rgba(24, 21, 18, 0.58)",
          fontSize: "28px",
          fontWeight: 700,
          letterSpacing: 0
        }}
      >
        MASI-CO food
      </div>
      {showSafeArea ? <div style={safeAreaStyle} /> : null}
    </div>
  );
}

function renderSlide(slide: Slide, menu: MenuExtractionResult) {
  if (slide.templateId === "allergen-legend") {
    return <AllergenLegend />;
  }

  if (slide.templateId === "special-offer") {
    const highlighted =
      getSlideSections(slide, menu)
        .flatMap((section) => section.items)
        .find((item) => slide.menuItemIds.includes(item.id)) ??
      getSlideSections(slide, menu)
        .flatMap((section) => section.items)
        .find((item) => item.highlight);

    return (
      <>
        <div style={{ alignSelf: "center" }}>
          <Kicker text="Special menu" dark />
          <h1
            style={{
              margin: "20px 0 24px",
              color: "#fffaf0",
              fontSize: "118px",
              lineHeight: 0.95,
              fontWeight: 900,
              letterSpacing: 0
            }}
          >
            {highlighted?.shortName ?? highlighted?.name ?? "Dnešní specialita"}
          </h1>
          <p
            style={{
              maxWidth: "820px",
              color: "rgba(255,250,240,.84)",
              fontSize: "42px",
              lineHeight: 1.18,
              fontWeight: 650,
              margin: 0
            }}
          >
            {highlighted?.description ?? "Poctivá kuchyně připravená dnes pro vás."}
          </p>
        </div>
        <div
          style={{
            alignSelf: "end",
            justifySelf: "end",
            color: "#fff",
            background: "#b71c1c",
            borderRadius: "8px",
            padding: "36px 44px",
            fontSize: "68px",
            fontWeight: 900,
            boxShadow: "0 22px 70px rgba(0,0,0,.25)"
          }}
        >
          {formatCzk(highlighted?.prices[0]?.amount ?? null)}
        </div>
      </>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: "32px" }}>
      <header>
        <Kicker text={formatCzechDate(menu.date)} />
        <h1
          style={{
            margin: "14px 0 0",
            color: "#191513",
            fontSize: "92px",
            lineHeight: 1,
            fontWeight: 900,
            letterSpacing: 0
          }}
        >
          {slide.title}
        </h1>
      </header>
      <div style={{ display: "grid", gap: "28px", alignContent: "start" }}>
        {getSlideSections(slide, menu).map((section) => (
          <section key={section.id}>
            <h2
              style={{
                display: "inline-flex",
                margin: "0 0 18px",
                padding: "10px 20px",
                borderRadius: "8px",
                background: "#b71c1c",
                color: "white",
                fontSize: "34px",
                lineHeight: 1,
                fontWeight: 850
              }}
            >
              {section.name}
            </h2>
            <div style={{ display: "grid", gap: "16px" }}>
              {section.items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "28px",
                    alignItems: "baseline",
                    padding: "18px 0",
                    borderBottom: "2px solid rgba(25,21,19,.12)"
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "#191513",
                        fontSize: item.name.length > 42 ? "44px" : "52px",
                        lineHeight: 1.08,
                        fontWeight: 850,
                        letterSpacing: 0
                      }}
                    >
                      {item.shortName ?? item.name}
                    </div>
                    <div
                      style={{
                        marginTop: "8px",
                        color: "rgba(25,21,19,.72)",
                        fontSize: "26px",
                        fontWeight: 650
                      }}
                    >
                      Alergeny: {item.allergens.map(getAllergenLabel).join(", ")}
                    </div>
                  </div>
                  <div
                    style={{
                      color: item.highlight ? "#b71c1c" : "#191513",
                      fontSize: "54px",
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums"
                    }}
                  >
                    {formatCzk(item.prices[0]?.amount ?? null)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Kicker({ text, dark = false }: { text: string; dark?: boolean }) {
  return (
    <div
      style={{
        color: dark ? "#ffdfd7" : "#b71c1c",
        fontSize: "34px",
        lineHeight: 1,
        fontWeight: 900,
        textTransform: "uppercase",
        letterSpacing: 0
      }}
    >
      {text}
    </div>
  );
}

function getSlideSections(slide: Slide, menu: MenuExtractionResult) {
  const sections = slide.menuSectionIds.length
    ? menu.sections.filter((section) => slide.menuSectionIds.includes(section.id))
    : menu.sections;

  return sections
    .map((section) => ({
      ...section,
      items: slide.menuItemIds.length
        ? section.items.filter((item) => slide.menuItemIds.includes(item.id))
        : section.items
    }))
    .filter((section) => section.items.length > 0 || slide.menuItemIds.length === 0);
}

function AllergenLegend() {
  return (
    <div>
      <Kicker text="Přehled alergenů" />
      <h1
        style={{
          margin: "14px 0 32px",
          color: "#191513",
          fontSize: "70px",
          lineHeight: 1,
          fontWeight: 900,
          letterSpacing: 0
        }}
      >
        Alergenová legenda
      </h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px 58px",
          fontSize: "30px",
          lineHeight: 1.12,
          fontWeight: 700
        }}
      >
        {allergenCatalog.map((allergen) => (
          <div key={allergen.code}>
            <strong style={{ color: "#b71c1c" }}>{allergen.code}.</strong>{" "}
            {allergen.fullName}
          </div>
        ))}
      </div>
    </div>
  );
}
