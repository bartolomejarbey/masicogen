"use client";

import { useEffect, useRef, useState } from "react";

type ScaledTvFrameProps = {
  children: React.ReactNode;
  className?: string;
};

export function ScaledTvFrame({ children, className = "" }: ScaledTvFrameProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    const updateScale = () => {
      setScale(shell.clientWidth / 1920);
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
      </div>
    </div>
  );
}
