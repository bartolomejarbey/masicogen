"use client";

import { useEffect, useRef, useState } from "react";

type ScaledTvFrameProps = {
  children: React.ReactNode;
  className?: string;
  /**
   * Vrstva kreslená UVNITŘ scaled-tv-inner (sdílí souřadnice plátna 1920×1080
   * a škáluje se s ním) — sem patří drag-n-drop overlay editoru rozvržení.
   */
  overlay?: React.ReactNode;
  /** Aktuální poměr obrazovka↔plátno; děl jím pixely myši na canvas px. */
  onScaleChange?: (scale: number) => void;
};

export function ScaledTvFrame({
  children,
  className = "",
  overlay,
  onScaleChange
}: ScaledTvFrameProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const onScaleChangeRef = useRef(onScaleChange);
  useEffect(() => {
    onScaleChangeRef.current = onScaleChange;
  });

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    const updateScale = () => {
      const next = shell.clientWidth / 1920;
      setScale(next);
      onScaleChangeRef.current?.(next);
    };

    updateScale();
    const resizeObserver = new ResizeObserver(updateScale);
    resizeObserver.observe(shell);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div className={`scaled-tv-shell ${className}`} ref={shellRef}>
      <div
        className="scaled-tv-inner"
        style={{
          transform: `scale(${scale})`
        }}
      >
        {children}
        {overlay}
      </div>
    </div>
  );
}
