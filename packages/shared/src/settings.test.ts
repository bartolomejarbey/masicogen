import { describe, expect, it } from "vitest";
import { czechHolidayName } from "./czech-holidays";
import { defaultFooterLegendText, orgSettingsSchema, resolveSettings } from "./settings";

describe("orgSettingsSchema", () => {
  it("parses an empty object into complete defaults", () => {
    const settings = orgSettingsSchema.parse({});

    expect(settings.loop.enabledSlides).toEqual({
      intro: true,
      soups: true,
      mains: true,
      pizza: true,
      buffet: true,
      special: true
    });
    expect(settings.loop.durationsSeconds).toEqual({});
    expect(settings.content.footerLegendText).toBe(defaultFooterLegendText);
    expect(settings.content.defaultSoup).toBe("Hovězí vývar");
    expect(settings.branding.logoAssetId).toBeNull();
    expect(settings.automation.autoPublish).toBe(true);
    expect(settings.automation.aiPhotos).toEqual({ enabled: true, dailyLimit: 20 });
    expect(settings.export.autoExportMp4).toBe(false);
  });

  it("fills defaults around a partial patch", () => {
    const settings = orgSettingsSchema.parse({
      loop: { enabledSlides: { pizza: false } },
      automation: { aiPhotos: { dailyLimit: 5 } }
    });

    expect(settings.loop.enabledSlides.pizza).toBe(false);
    expect(settings.loop.enabledSlides.intro).toBe(true);
    expect(settings.automation.aiPhotos).toEqual({ enabled: true, dailyLimit: 5 });
    expect(settings.automation.autoPublish).toBe(true);
  });

  it("rejects slide durations outside 3-60 seconds", () => {
    expect(
      orgSettingsSchema.safeParse({ loop: { durationsSeconds: { soups: 2 } } }).success
    ).toBe(false);
    expect(
      orgSettingsSchema.safeParse({ loop: { durationsSeconds: { soups: 61 } } }).success
    ).toBe(false);
    expect(
      orgSettingsSchema.safeParse({ loop: { durationsSeconds: { soups: 3, mains: 60 } } })
        .success
    ).toBe(true);
  });
});

describe("resolveSettings", () => {
  it("returns full defaults for invalid input", () => {
    const defaults = orgSettingsSchema.parse({});

    expect(resolveSettings({ loop: { durationsSeconds: { soups: 999 } } })).toEqual(defaults);
    expect(resolveSettings("nonsense")).toEqual(defaults);
    expect(resolveSettings(null)).toEqual(defaults);
    expect(resolveSettings(undefined)).toEqual(defaults);
  });

  it("keeps valid stored settings", () => {
    const settings = resolveSettings({ automation: { autoPublish: false } });

    expect(settings.automation.autoPublish).toBe(false);
    expect(settings.content.defaultSoup).toBe("Hovězí vývar");
  });
});

describe("czechHolidayName", () => {
  it("resolves fixed holidays", () => {
    expect(czechHolidayName("2026-07-05")).toBe("Den slovanských věrozvěstů Cyrila a Metoděje");
    expect(czechHolidayName("2026-07-06")).toBe("Den upálení mistra Jana Husa");
  });

  it("computes Easter holidays for 2026", () => {
    expect(czechHolidayName("2026-04-03")).toBe("Velký pátek");
    expect(czechHolidayName("2026-04-06")).toBe("Velikonoční pondělí");
  });

  it("returns null for ordinary days and invalid input", () => {
    expect(czechHolidayName("2026-07-08")).toBeNull();
    expect(czechHolidayName("2026-04-05")).toBeNull();
    expect(czechHolidayName("not-a-date")).toBeNull();
  });
});
