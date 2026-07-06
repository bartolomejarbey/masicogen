"use client";

import { useMemo, useState } from "react";
import { TvComposition } from "@masico/render";
import {
  defaultTemplateManifests,
  demoDeck,
  demoMenu,
  validateDeckAgainstTemplates
} from "@masico/shared";
import { Bot, Check, Clapperboard, Sparkles, TriangleAlert } from "lucide-react";
import { ScaledTvFrame } from "./ScaledTvFrame";
import { StatusBadge } from "./StatusBadge";

export function TvStudioClient() {
  const [activeSlideId, setActiveSlideId] = useState(demoDeck.slides[0]?.id);
  const [showSafeArea, setShowSafeArea] = useState(true);
  const issues = useMemo(
    () => validateDeckAgainstTemplates(demoDeck, defaultTemplateManifests),
    []
  );
  const activeSlide = demoDeck.slides.find((slide) => slide.id === activeSlideId);

  return (
    <section className="studio-grid">
      <div className="card pad">
        <p className="eyebrow">Šablony</p>
        <div className="template-list">
          {demoDeck.slides.map((slide) => (
            <button
              className={`template-button ${slide.id === activeSlideId ? "active" : ""}`}
              key={slide.id}
              onClick={() => setActiveSlideId(slide.id)}
              type="button"
            >
              <span>{slide.title}</span>
              <Clapperboard size={17} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="topbar">
          <div>
            <p className="eyebrow">Demo náhled 16:9</p>
            <h2 className="card-title">{activeSlide?.title ?? "TV smyčka"}</h2>
          </div>
          <div className="actions">
            <button
              className="button"
              onClick={() => setShowSafeArea((value) => !value)}
              type="button"
            >
              <TriangleAlert size={17} aria-hidden="true" />
              Bezpečný okraj
            </button>
            <button className="button" disabled type="button">
              <Check size={17} aria-hidden="true" />
              Schválení náhledu - nenapojeno
            </button>
          </div>
        </div>
        <div className="preview-shell">
          <ScaledTvFrame>
            <TvComposition
              deck={demoDeck}
              menu={demoMenu}
              activeSlideId={activeSlideId}
              showSafeArea={showSafeArea}
            />
          </ScaledTvFrame>
        </div>
      </div>

      <aside className="card pad">
        <p className="eyebrow">AI asistent - demo</p>
        <h2 className="card-title">Demo návrhy asistenta</h2>
        <div className="assistant-feed" style={{ marginTop: 14 }}>
          <div className="assistant-message">
            <Bot size={17} aria-hidden="true" /> Ukázka: navrhuji ponechat cenu a alergeny
            beze změny. Řízek je vhodný highlight pro special slide.
          </div>
          <div className="assistant-message">
            <Sparkles size={17} aria-hidden="true" /> Ukázka: pro novou akci připravím návrh
            pozadí bez textu a s volnou plochou vlevo nahoře.
          </div>
          <div className="assistant-message">
            {issues.length === 0 ? (
              <StatusBadge tone="good">Demo deck prošel kontrolou okraje</StatusBadge>
            ) : (
              <StatusBadge tone="warn">{issues.length} upozornění</StatusBadge>
            )}
          </div>
        </div>

        <div className="control-list" style={{ marginTop: 18 }}>
          <button className="button" disabled type="button">
            Zkrátit názvy - nenapojeno
          </button>
          <button className="button" disabled type="button">
            Rozdělit menu - nenapojeno
          </button>
          <button className="button" disabled type="button">
            Generovat pozadí - nenapojeno
          </button>
        </div>
      </aside>
    </section>
  );
}
