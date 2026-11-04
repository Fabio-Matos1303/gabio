import { useLayoutEffect, useRef, type RefObject } from "react";

/** Animate only the current DOM; never snapshot, retain or remount private content. */
export function useContentMotion(
  ref: RefObject<HTMLElement | null>,
  value: string,
  direction: "vertical" | "horizontal" = "vertical",
) {
  const previous = useRef(value);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = value;
    const element = ref.current;
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (
      before === value ||
      !element?.animate ||
      media?.matches ||
      element.closest("[hidden]")
    )
      return;
    const style = getComputedStyle(element);
    const distance =
      style.getPropertyValue("--motion-distance").trim() || "8px";
    const offset =
      direction === "horizontal"
        ? `translateX(${value > before ? "" : "-"}${distance})`
        : `translateY(${distance})`;
    const animation = element.animate(
      [{ transform: offset }, { transform: "translate(0, 0)" }],
      {
        duration: parseFloat(style.getPropertyValue("--motion-content")) || 220,
        easing: style.getPropertyValue("--motion-ease").trim() || "ease-out",
      },
    );
    const cancel = () => animation.cancel();
    media?.addEventListener("change", cancel);
    return () => {
      animation.cancel();
      media?.removeEventListener("change", cancel);
    };
  }, [ref, value, direction]);
}
