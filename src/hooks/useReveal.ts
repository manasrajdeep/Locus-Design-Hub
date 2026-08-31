import { useEffect, useRef, useState } from "react";

/** Reveals an element once it scrolls into view (SSR-safe). */
export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.15) {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, shown };
}

/** Counts a numeric value up when it enters the viewport. Keeps any prefix/suffix. */
export function useCountUp(raw: string, duration = 1400) {
  const { ref, shown } = useReveal<HTMLDivElement>(0.4);
  const match = raw.match(/^(\D*)([\d.,]+)(.*)$/);
  const target = match ? Number(match[2]!.replace(/,/g, "")) : NaN;
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!shown || Number.isNaN(target)) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic — mimics damped motion settling
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shown, target, duration]);

  if (!match || Number.isNaN(target)) return { ref, text: raw };

  const decimals = match[2]!.includes(".") ? 1 : 0;
  const shownNum = shown ? value : 0;
  const text = `${match[1]}${shownNum.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${match[3]}`;
  return { ref, text };
}
