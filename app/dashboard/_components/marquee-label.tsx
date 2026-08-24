"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function MarqueeLabel({ children }: { children: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      setOverflow(Math.max(0, text.scrollWidth - container.clientWidth));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(text);
    void document.fonts.ready.then(measure);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [children]);

  useEffect(() => {
    const text = textRef.current;
    if (!text || overflow <= 0) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    // Scroll forward → return to start → pause → repeat.
    const animation = text.animate(
      [
        { transform: "translateX(0)", offset: 0, easing: "ease-in-out" },
        { transform: `translateX(-${overflow}px)`, offset: 0.35 },
        { transform: `translateX(-${overflow}px)`, offset: 0.42, easing: "ease-in-out" },
        { transform: "translateX(0)", offset: 0.77 },
        { transform: "translateX(0)", offset: 1 },
      ],
      {
        duration: 8000,
        iterations: Infinity,
      },
    );

    return () => animation.cancel();
  }, [overflow, children]);

  return (
    <span ref={containerRef} className="min-w-0 flex-1 overflow-hidden text-left" title={children}>
      <span
        ref={textRef}
        className={cn("inline-block max-w-none", overflow <= 0 && "truncate")}
      >
        {children}
      </span>
    </span>
  );
}
