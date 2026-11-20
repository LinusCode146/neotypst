import { forwardRef, memo, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

export type PageView = { hash: string; svg: string; width: number; height: number };
export type Marker = { page: number; x: number; y: number; key: number };

export type PreviewHandle = {
  scrollTo(page: number, y: number, onlyIfHidden: boolean): void;
};

type Props = {
  pages: PageView[];
  zoom: number;
  onZoom(zoom: number): void;
  marker: Marker | null;
  error: string | null;
  loading: boolean;
  onClick(page: number, x: number, y: number): void;
};

const PADDING = 56;

const Page = memo(function Page({
  svg,
  width,
  height,
  index,
  pxWidth,
  onClick,
}: {
  svg: string;
  width: number;
  height: number;
  index: number;
  pxWidth: number;
  onClick(page: number, x: number, y: number): void;
}) {
  return (
    <div
      className="page"
      data-page={index}
      style={{ width: pxWidth, height: (pxWidth * height) / width }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onClick(index, ((e.clientX - r.left) / r.width) * width, ((e.clientY - r.top) / r.height) * height);
      }}
    >
      <div className="svg-host" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="page-number">{index + 1}</div>
    </div>
  );
});

/** A point on a page that should stay under the same screen position while zooming. */
type Anchor = { page: number; fx: number; fy: number; vx: number; vy: number };

export const Preview = forwardRef<PreviewHandle, Props>(function Preview({ pages, zoom, onZoom, marker, error, loading, onClick }, ref) {
  const scroller = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(600);

  useLayoutEffect(() => {
    const el = scroller.current!;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const maxPt = Math.max(1, ...pages.map((p) => p.width));
  const fitScale = Math.max(0.2, (avail - PADDING) / maxPt);
  const scale = fitScale * zoom;

  /** Top of a page in scroll coordinates. */
  const pageTop = (pageEl: HTMLElement) => {
    const el = scroller.current!;
    return pageEl.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
  };

  useImperativeHandle(ref, () => ({
    scrollTo(page, y, onlyIfHidden) {
      const el = scroller.current;
      const pageEl = el?.querySelector<HTMLElement>(`.page[data-page="${page}"]`);
      if (!el || !pageEl) return;
      const target = pageTop(pageEl) + y * scale;
      const top = el.scrollTop;
      const visible = target > top + 40 && target < top + el.clientHeight - 40;
      if (onlyIfHidden && visible) return;
      el.scrollTo({ top: target - el.clientHeight / 3, behavior: "smooth" });
    },
  }));

  // ----- Zoom around a fixed point -----

  const captureAnchor = (vx: number, vy: number): Anchor | null => {
    const el = scroller.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const cx = box.left + vx;
    const cy = box.top + vy;
    let best: { el: HTMLElement; d: number } | null = null;
    el.querySelectorAll<HTMLElement>(".page").forEach((p) => {
      const r = p.getBoundingClientRect();
      const d = cy < r.top ? r.top - cy : cy > r.bottom ? cy - r.bottom : 0;
      if (!best || d < best.d) best = { el: p, d };
    });
    if (!best) return null;
    const pageEl = (best as { el: HTMLElement }).el;
    const r = pageEl.getBoundingClientRect();
    return { page: Number(pageEl.dataset.page), fx: (cx - r.left) / r.width, fy: (cy - r.top) / r.height, vx, vy };
  };

  const applyAnchor = (a: Anchor) => {
    const el = scroller.current;
    const pageEl = el?.querySelector<HTMLElement>(`.page[data-page="${a.page}"]`);
    if (!el || !pageEl) return;
    const box = el.getBoundingClientRect();
    const r = pageEl.getBoundingClientRect();
    el.scrollLeft += r.left + a.fx * r.width - (box.left + a.vx);
    el.scrollTop += r.top + a.fy * r.height - (box.top + a.vy);
  };

  const pendingAnchor = useRef<Anchor | null>(null);
  const lastScale = useRef(scale);
  // Zoom changed from elsewhere (buttons, ⌘+/−): keep the centre of the view
  // fixed. Measured during render, while the DOM still shows the old scale.
  if (lastScale.current !== scale && !pendingAnchor.current && scroller.current) {
    const el = scroller.current;
    pendingAnchor.current = captureAnchor(el.clientWidth / 2, el.clientHeight / 3);
  }
  useLayoutEffect(() => {
    if (lastScale.current === scale) return;
    lastScale.current = scale;
    const a = pendingAnchor.current;
    pendingAnchor.current = null;
    if (a) applyAnchor(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  // Trackpad pinch: WebKit sends gesture events, Chromium sends ctrl+wheel.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  useEffect(() => {
    const el = scroller.current!;
    let target: number | null = null;
    let frame = 0;
    let lastPoint = { x: 0, y: 0 };
    let gestureBase: number | null = null;

    const clamp = (z: number) => Math.min(4, Math.max(0.25, z));
    const schedule = (z: number, clientX: number, clientY: number) => {
      const box = el.getBoundingClientRect();
      lastPoint = { x: clientX - box.left, y: clientY - box.top };
      target = clamp(z);
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (target == null || Math.abs(target - zoomRef.current) < 0.001) return;
          pendingAnchor.current = captureAnchor(lastPoint.x, lastPoint.y);
          onZoomRef.current(target);
        });
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || gestureBase != null) return;
      e.preventDefault();
      const base = target ?? zoomRef.current;
      schedule(base * Math.exp(-e.deltaY / 100), e.clientX, e.clientY);
    };
    type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureBase = zoomRef.current;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as GestureEvent;
      if (gestureBase == null) gestureBase = zoomRef.current;
      schedule(gestureBase * g.scale, g.clientX, g.clientY);
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      gestureBase = null;
      target = null;
    };
    const onWheelEnd = () => {
      // Reset accumulated target once the wheel burst settles.
      if (gestureBase == null && !frame) target = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart, { passive: false } as AddEventListenerOptions);
    el.addEventListener("gesturechange", onGestureChange, { passive: false } as AddEventListenerOptions);
    el.addEventListener("gestureend", onGestureEnd, { passive: false } as AddEventListenerOptions);
    el.addEventListener("scroll", onWheelEnd);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
      el.removeEventListener("scroll", onWheelEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="preview-pane">
      {error && (
        <div className="preview-stale" title={error}>
          <span>●</span> {error}
        </div>
      )}
      <div className="preview-scroll" ref={scroller}>
        <div className="preview-pages" style={{ width: maxPt * scale }}>
          {pages.map((p, i) => (
            <div key={i} style={{ position: "relative" }}>
              <Page svg={p.svg} width={p.width} height={p.height} index={i} pxWidth={p.width * scale} onClick={onClick} />
              {marker && marker.page === i && (
                <div key={marker.key} className="cursor-marker" style={{ left: marker.x * scale, top: marker.y * scale }} />
              )}
            </div>
          ))}
        </div>
      </div>
      {pages.length === 0 && (
        <div className="preview-empty">{loading ? "Kompiliere …" : error ? "" : "Noch keine Vorschau"}</div>
      )}
    </div>
  );
});
