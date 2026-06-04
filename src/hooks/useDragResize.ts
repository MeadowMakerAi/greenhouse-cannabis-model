import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drag-handle resize hook. Returns a ref to attach to the drag handle element
 * and the current size in px.
 *
 * @param initial  Starting height in px.
 * @param min      Minimum allowed height.
 * @param max      Maximum allowed height.
 * @param storageKey  Optional localStorage key to persist the size.
 */
export function useDragResize(
  initial: number,
  min: number,
  max: number,
  storageKey?: string,
): { handleRef: React.RefObject<HTMLDivElement | null>; size: number } {
  const [size, setSize] = useState<number>(() => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const n = parseInt(stored, 10);
        if (Number.isFinite(n) && n >= min && n <= max) return n;
      }
    }
    return initial;
  });
  const handleRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef(0);
  const startSize = useRef(size);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      const next = Math.max(min, Math.min(max, startSize.current + e.clientY - startY.current));
      setSize(next);
    },
    [min, max],
  );

  const onMouseUp = useCallback(() => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [onMouseMove]);

  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      startY.current = e.clientY;
      startSize.current = size;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [size, onMouseMove, onMouseUp],
  );

  useEffect(() => {
    const el = handleRef.current;
    if (!el) return;
    el.addEventListener("mousedown", onMouseDown);
    return () => el.removeEventListener("mousedown", onMouseDown);
  }, [onMouseDown]);

  // Persist
  useEffect(() => {
    if (storageKey) localStorage.setItem(storageKey, String(size));
  }, [size, storageKey]);

  return { handleRef, size };
}
