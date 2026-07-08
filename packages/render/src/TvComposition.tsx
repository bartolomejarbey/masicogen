import type { CSSProperties } from "react";
import {
  allergenCatalog,
  brandTokens,
  formatCzk,
  formatCzechDate,
  getAllergenLabel,
  isTemplateManifestV2,
  resolveSectionByKey,
  tvFontFamily,
  type DeckManifest,
  type ImageLayerV2,
  type LayerFrame,
  type MenuExtractionItem,
  type MenuExtractionResult,
  type SectionKey,
  type Slide,
  type TemplateLayerV2,
  type TemplateManifestV2,
  type TextLayerV2
} from "@masico/shared";

type TvCompositionProps = {
  deck: DeckManifest;
  menu: MenuExtractionResult;
  activeSlideId?: string;
  showSafeArea?: boolean;
};

const LOGO_SRC = "/brand/masico-logo.svg";

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
  const manifest = deck.templateManifests?.[slide.templateId];

  if (manifest && isTemplateManifestV2(manifest)) {
    return (
      <LayerSlide
        deck={deck}
        menu={menu}
        slide={slide}
        manifest={manifest}
        showSafeArea={showSafeArea}
      />
    );
  }

  const backgroundUrl = slide.backgroundAssetId
    ? deck.assetUrls?.[slide.backgroundAssetId] ?? null
    : null;

  return (
    <div style={rootStyle}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: backgroundUrl
            ? `url("${backgroundUrl}")`
            : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          background:
            backgroundUrl
              ? undefined
              : slide.templateId === "special-offer"
                ? "radial-gradient(circle at 82% 30%, rgba(183, 28, 28, .38), transparent 32%), linear-gradient(120deg, #171412 0%, #34231d 52%, #f4efe6 100%)"
                : "linear-gradient(120deg, #fbfaf6 0%, #fff 46%, #f1e6d5 100%)"
        }}
      />
      {backgroundUrl ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              slide.templateId === "special-offer"
                ? "linear-gradient(90deg, rgba(18,16,14,.88), rgba(18,16,14,.42) 58%, rgba(18,16,14,.18))"
                : "linear-gradient(90deg, rgba(255,255,255,.92), rgba(255,255,255,.80) 58%, rgba(255,255,255,.32))"
          }}
        />
      ) : null}
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

type LayerSlideProps = {
  deck: DeckManifest;
  menu: MenuExtractionResult;
  slide: Slide;
  manifest: TemplateManifestV2;
  showSafeArea: boolean;
};

function LayerSlide({ deck, menu, slide, manifest, showSafeArea }: LayerSlideProps) {
  const slotItems = collectSlotItems(menu, slide);
  const offsets = computeGroupOffsets(manifest.layers, slotItems);
  const backgroundUrl = manifest.backgroundAssetId
    ? deck.assetUrls?.[manifest.backgroundAssetId] ?? null
    : null;
  const layers = [...manifest.layers].sort((a, b) => a.frame.zIndex - b.frame.zIndex);

  return (
    <div
      style={{
        position: "relative",
        width: `${manifest.canvas.width}px`,
        height: `${manifest.canvas.height}px`,
        overflow: "hidden",
        background: manifest.backgroundGradient ?? manifest.backgroundColor,
        color: brandTokens.ink,
        fontFamily: tvFontFamily
      }}
    >
      {backgroundUrl ? (
        <img
          alt=""
          src={backgroundUrl}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
      {layers.map((layer) => (
        <Layer
          key={layer.id}
          layer={layer}
          deck={deck}
          menu={menu}
          slide={slide}
          slotItems={slotItems}
          offset={layer.group ? offsets.get(layer.group) ?? null : null}
        />
      ))}
      {showSafeArea ? (
        <div
          style={{
            position: "absolute",
            left: `${manifest.safeArea.x}px`,
            top: `${manifest.safeArea.y}px`,
            width: `${manifest.safeArea.width}px`,
            height: `${manifest.safeArea.height}px`,
            border: "2px dashed rgba(25, 21, 19, 0.45)",
            pointerEvents: "none",
            zIndex: 40
          }}
        />
      ) : null}
    </div>
  );
}

type GroupOffset = { x: number; y: number };

type SlotItems = Partial<Record<SectionKey, MenuExtractionItem[]>>;

function collectSlotItems(menu: MenuExtractionResult, slide: Slide): SlotItems {
  const keys: SectionKey[] = ["soups", "mains", "pizza", "buffet", "special"];
  const result: SlotItems = {};

  for (const key of keys) {
    const section = resolveSectionByKey(menu, key);
    if (!section) {
      continue;
    }

    result[key] = slide.menuItemIds.length
      ? section.items.filter((item) => slide.menuItemIds.includes(item.id))
      : section.items.filter((item) => item.available);
  }

  return result;
}

function itemForBinding(
  layer: TemplateLayerV2,
  slotItems: SlotItems
): { bound: boolean; item: MenuExtractionItem | null } {
  if (!("binding" in layer) || !layer.binding || layer.binding.source !== "item") {
    return { bound: false, item: null };
  }

  const items = slotItems[layer.binding.sectionKey] ?? [];
  return { bound: true, item: items[layer.binding.index] ?? null };
}

/**
 * Skryté skupiny (sloty bez položky) se vynechají a viditelné skupiny se
 * převystředí podle původního rozestupu — 3 jídla z 5 tak nezůstanou
 * nalepená nahoře na slidu.
 */
function computeGroupOffsets(
  layers: TemplateLayerV2[],
  slotItems: SlotItems
): Map<string, GroupOffset | null> {
  const groups = new Map<
    string,
    { sectionKey: SectionKey; index: number; originX: number; originY: number }
  >();

  for (const layer of layers) {
    if (!layer.group) {
      continue;
    }

    const existing = groups.get(layer.group);
    if (existing) {
      existing.originX = Math.min(existing.originX, layer.frame.x);
      existing.originY = Math.min(existing.originY, layer.frame.y);
      continue;
    }

    if ("binding" in layer && layer.binding && layer.binding.source === "item") {
      groups.set(layer.group, {
        sectionKey: layer.binding.sectionKey,
        index: layer.binding.index,
        originX: layer.frame.x,
        originY: layer.frame.y
      });
    }
  }

  // Doplnit originy i z vrstev bez bindingu (karty/podklady ve skupině).
  for (const layer of layers) {
    if (!layer.group) {
      continue;
    }
    const group = groups.get(layer.group);
    if (group) {
      group.originX = Math.min(group.originX, layer.frame.x);
      group.originY = Math.min(group.originY, layer.frame.y);
    }
  }

  const families = new Map<SectionKey, Array<[string, { index: number; originX: number; originY: number }]>>();
  for (const [groupId, group] of groups) {
    const family = families.get(group.sectionKey) ?? [];
    family.push([groupId, group]);
    families.set(group.sectionKey, family);
  }

  const offsets = new Map<string, GroupOffset | null>();

  for (const [sectionKey, family] of families) {
    const items = slotItems[sectionKey] ?? [];
    const sorted = family.sort((a, b) => a[1].index - b[1].index);
    const visible = sorted.filter(([, group]) => group.index < items.length);

    if (visible.length === sorted.length || visible.length === 0) {
      for (const [groupId, group] of sorted) {
        offsets.set(groupId, group.index < items.length ? { x: 0, y: 0 } : null);
      }
      continue;
    }

    const spreadX = Math.max(...sorted.map(([, g]) => g.originX)) - Math.min(...sorted.map(([, g]) => g.originX));
    const spreadY = Math.max(...sorted.map(([, g]) => g.originY)) - Math.min(...sorted.map(([, g]) => g.originY));
    const axis: "x" | "y" = spreadX > spreadY ? "x" : "y";
    const pitch =
      sorted.length > 1
        ? (axis === "x"
            ? sorted[1][1].originX - sorted[0][1].originX
            : sorted[1][1].originY - sorted[0][1].originY)
        : 0;
    const shift = ((sorted.length - visible.length) * pitch) / 2;

    for (const [groupId, group] of sorted) {
      if (group.index >= items.length) {
        offsets.set(groupId, null);
        continue;
      }

      const visiblePosition = visible.findIndex(([id]) => id === groupId);
      const delta = shift + (visiblePosition - group.index) * pitch;
      offsets.set(groupId, axis === "x" ? { x: delta, y: 0 } : { x: 0, y: delta });
    }
  }

  return offsets;
}

type LayerProps = {
  layer: TemplateLayerV2;
  deck: DeckManifest;
  menu: MenuExtractionResult;
  slide: Slide;
  slotItems: SlotItems;
  offset: GroupOffset | null;
};

function Layer({ layer, deck, menu, slide, slotItems, offset }: LayerProps) {
  if (layer.group && offset === null) {
    return null;
  }

  const { bound, item } = itemForBinding(layer, slotItems);
  if (bound && !item) {
    return null;
  }

  const frame = frameStyle(layer.frame, offset);

  if (layer.type === "shape") {
    return (
      <div
        style={{
          ...frame,
          background: layer.fill,
          opacity: layer.opacity,
          borderRadius: `${layer.cornerRadius}px`
        }}
      />
    );
  }

  if (layer.type === "logo") {
    return (
      <img
        alt="MASI-CO food"
        src={LOGO_SRC}
        style={{
          ...frame,
          objectFit: "contain",
          objectPosition: "left center",
          filter: layer.variant === "white" ? "brightness(0) invert(1)" : undefined
        }}
      />
    );
  }

  if (layer.type === "image") {
    return <ImageLayer layer={layer} item={item} deck={deck} frame={frame} />;
  }

  return <TextLayer layer={layer} item={item} menu={menu} slide={slide} frame={frame} />;
}

function frameStyle(frame: LayerFrame, offset: GroupOffset | null): CSSProperties {
  return {
    position: "absolute",
    left: `${frame.x}px`,
    top: `${frame.y}px`,
    width: `${frame.w}px`,
    height: `${frame.h}px`,
    zIndex: frame.zIndex,
    transform: offset && (offset.x !== 0 || offset.y !== 0)
      ? `translate(${offset.x}px, ${offset.y}px)`
      : undefined
  };
}

function ImageLayer({
  layer,
  item,
  deck,
  frame
}: {
  layer: ImageLayerV2;
  item: MenuExtractionItem | null;
  deck: DeckManifest;
  frame: CSSProperties;
}) {
  const assetId = layer.binding?.source === "item" ? item?.photoAssetId ?? null : layer.assetId;
  const url = assetId ? deck.assetUrls?.[assetId] ?? null : null;
  const focalPoint = item?.photoFocalPoint ?? layer.focalPoint;

  if (!url) {
    if (layer.placeholder === "none") {
      return null;
    }

    return (
      <div
        style={{
          ...frame,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f1e9dd 0%, #e6d8c4 100%)",
          borderRadius: `${layer.cornerRadius}px`,
          overflow: "hidden"
        }}
      >
        <img
          alt=""
          src={LOGO_SRC}
          style={{ width: "46%", opacity: 0.4, objectFit: "contain" }}
        />
      </div>
    );
  }

  return (
    <div style={{ ...frame, borderRadius: `${layer.cornerRadius}px`, overflow: "hidden" }}>
      <img
        alt={item?.name ?? ""}
        src={url}
        style={{
          width: "100%",
          height: "100%",
          objectFit: layer.fit,
          objectPosition: `${focalPoint.x * 100}% ${focalPoint.y * 100}%`
        }}
      />
      {layer.overlay !== "none" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              layer.overlay === "darken-bottom"
                ? "linear-gradient(transparent 40%, rgba(25, 21, 19, 0.75))"
                : "linear-gradient(90deg, rgba(25, 21, 19, 0.75), transparent 60%)"
          }}
        />
      ) : null}
    </div>
  );
}

function TextLayer({
  layer,
  item,
  menu,
  slide,
  frame
}: {
  layer: TextLayerV2;
  item: MenuExtractionItem | null;
  menu: MenuExtractionResult;
  slide: Slide;
  frame: CSSProperties;
}) {
  const content = resolveTextContent(layer, item, menu, slide);
  if (!content) {
    return null;
  }

  return (
    <div
      style={{
        ...frame,
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: layer.maxLines,
        overflow: "hidden",
        color: layer.color,
        textAlign: layer.align,
        fontSize: `${layer.fontSizePx}px`,
        fontWeight: layer.fontWeight,
        fontStyle: layer.fontStyle,
        lineHeight: layer.lineHeight,
        textTransform: layer.uppercase ? "uppercase" : undefined
      }}
    >
      {content}
    </div>
  );
}

function resolveTextContent(
  layer: TextLayerV2,
  item: MenuExtractionItem | null,
  menu: MenuExtractionResult,
  slide: Slide
): string | null {
  const binding = layer.binding;

  if (!binding || binding.source === "static") {
    return layer.text;
  }

  if (binding.source === "menu") {
    if (binding.field === "date") {
      return formatCzechDate(menu.date);
    }

    return slide.title;
  }

  if (!item) {
    return null;
  }

  switch (binding.field) {
    case "name":
      return item.name;
    case "description":
      return item.description;
    case "price":
      return formatCzk(item.prices[0]?.amount ?? null);
    case "allergens":
      // Alergeny jako čísla červenou kurzívou bez mezer — styl tištěného lístku.
      return item.allergens.length > 0 ? item.allergens.join(",") : null;
    default:
      return null;
  }
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
