import { useEffect, useState } from "react";

/**
 * True when the viewport is at least Tailwind's `md` breakpoint (768px).
 *
 * Used to gate the heavy R3F scene: phones get a lightweight tap-to-open
 * card and only mount WebGL inside the full-screen overlay, while desktops
 * keep the inline live scene. This is a JS gate (not a CSS `hidden` class)
 * on purpose — `display:none` would still mount and run the WebGL context,
 * defeating the whole point of not paying that cost while scrolling on a
 * phone.
 */
export function useIsDesktop(): boolean {
  const query = "(min-width: 768px)";
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : true,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}
