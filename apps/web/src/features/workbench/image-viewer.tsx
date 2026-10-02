import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Add01Icon, Remove01Icon, Download01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../components/ui/button';
import './image-viewer.css';

type Size = { width: number; height: number };
const steps = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8, 16];

export function ImageViewer({
  src,
  name,
  bytes,
  onComment,
}: {
  src: string;
  name: string;
  bytes: number;
  onComment: (quote?: string) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<Size>();
  const [size, setSize] = useState<Size>();
  const [scale, setScale] = useState<number | null>(null);
  const [annotating, setAnnotating] = useState(false);
  const [failed, setFailed] = useState(false);
  const anchor = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit =
    natural && size
      ? Math.min(
          1,
          Math.max(1, size.width - 32) / natural.width,
          Math.max(1, size.height - 32) / natural.height,
        )
      : 1;
  const shown = scale ?? fit;
  const canPan = Boolean(
    natural &&
    size &&
    (natural.width * shown + 32 > size.width || natural.height * shown + 32 > size.height),
  );

  function zoom(next: number, clientX?: number, clientY?: number) {
    if (!natural || !image.current || !viewport.current) return;
    const bounds = viewport.current.getBoundingClientRect();
    const rect = image.current.getBoundingClientRect();
    const x = clientX ?? bounds.left + viewport.current.clientWidth / 2;
    const y = clientY ?? bounds.top + viewport.current.clientHeight / 2;
    anchor.current = {
      x: (x - rect.left) / shown,
      y: (y - rect.top) / shown,
      clientX: x,
      clientY: y,
    };
    flushSync(() => setScale(Math.max(Math.min(0.1, fit), Math.min(16, next))));
  }

  useLayoutEffect(() => {
    const point = anchor.current;
    anchor.current = null;
    if (!point || !image.current || !viewport.current) return;
    const rect = image.current.getBoundingClientRect();
    viewport.current.scrollLeft += rect.left + point.x * shown - point.clientX;
    viewport.current.scrollTop += rect.top + point.y * shown - point.clientY;
  }, [shown]);

  const wheel = useEffectEvent((event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 200 : 1);
    zoom(
      shown * Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.01),
      event.clientX,
      event.clientY,
    );
  });
  const pinch = useEffectEvent((ratio: number, x: number, y: number) => zoom(shown * ratio, x, y));
  useEffect(() => {
    const element = viewport.current!;
    const onWheel = (event: WheelEvent) => wheel(event);
    let distance = 0;
    const onTouch = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        distance = 0;
        return;
      }
      const a = event.touches[0]!;
      const b = event.touches[1]!;
      const next = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (event.type === 'touchmove') {
        event.preventDefault();
        if (distance > 0)
          pinch(next / distance, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
      }
      distance = next;
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('touchstart', onTouch, { passive: true });
    element.addEventListener('touchmove', onTouch, { passive: false });
    element.addEventListener('touchend', onTouch);
    element.addEventListener('touchcancel', onTouch);
    return () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchstart', onTouch);
      element.removeEventListener('touchmove', onTouch);
      element.removeEventListener('touchend', onTouch);
      element.removeEventListener('touchcancel', onTouch);
    };
  }, []);

  const zoomIn = () => zoom(steps.find((step) => step > shown + 0.001) ?? 16);
  const zoomOut = () => zoom(steps.findLast((step) => step < shown - 0.001) ?? Math.min(0.1, fit));
  return (
    <div className="wb-image-viewer">
      <div className="wb-subtoolbar wb-image-toolbar">
        <span className="wb-note wb-image-meta">
          {natural ? `${natural.width} × ${natural.height} · ` : ''}
          {new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / 1024)} KB
        </span>
        <div className="wb-actions">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            title="Zoom out (−)"
            disabled={!natural || shown <= Math.min(0.1, fit)}
            onClick={zoomOut}
          >
            <HugeiconsIcon icon={Remove01Icon} size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="wb-image-scale"
            aria-label="Actual size"
            title="Actual size (1)"
            disabled={!natural}
            onClick={() => zoom(1)}
          >
            {Math.round(shown * 100)}%
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            title="Zoom in (+)"
            disabled={!natural || shown >= 16}
            onClick={zoomIn}
          >
            <HugeiconsIcon icon={Add01Icon} size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={scale === null}
            title="Fit image (0)"
            onClick={() => setScale(null)}
          >
            Fit
          </Button>
          <a
            className="wb-image-download"
            href={src}
            download={name.split('/').at(-1)}
            aria-label="Download image"
            title="Download image"
          >
            <HugeiconsIcon icon={Download01Icon} size={14} />
          </a>
        </div>
      </div>
      <div
        ref={viewport}
        className="wb-image-viewport"
        role="region"
        aria-label={`Image preview: ${name}. Use + and − to zoom, 0 to fit, 1 for actual size.`}
        tabIndex={0}
        data-pan={canPan}
        data-annotating={annotating}
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          if (['+', '=', '-', '0', '1'].includes(event.key)) {
            event.preventDefault();
            if (event.key === '+' || event.key === '=') zoomIn();
            else if (event.key === '-') zoomOut();
            else if (event.key === '1') zoom(1);
            else setScale(null);
          }
        }}
        onDoubleClick={(event) => {
          if (annotating) return;
          if (scale === null) zoom(1, event.clientX, event.clientY);
          else setScale(null);
        }}
        onPointerDown={(event) => {
          if (!canPan || annotating || event.pointerType !== 'mouse' || event.button !== 0) return;
          const element = event.currentTarget;
          const rect = element.getBoundingClientRect();
          if (
            event.clientX - rect.left >= element.clientWidth ||
            event.clientY - rect.top >= element.clientHeight
          )
            return;
          event.preventDefault();
          element.focus({ preventScroll: true });
          element.setPointerCapture(event.pointerId);
          element.dataset.dragging = 'true';
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            left: element.scrollLeft,
            top: element.scrollTop,
          };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          event.currentTarget.scrollLeft = drag.current.left + drag.current.x - event.clientX;
          event.currentTarget.scrollTop = drag.current.top + drag.current.y - event.clientY;
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={(event) => {
          drag.current = null;
          delete event.currentTarget.dataset.dragging;
        }}
      >
        {failed ? (
          <p className="wb-empty" role="alert">
            Could not decode this image.
          </p>
        ) : (
          <div
            className="wb-image-canvas"
            style={
              natural
                ? { width: natural.width * shown + 32, height: natural.height * shown + 32 }
                : undefined
            }
          >
            <img
              ref={image}
              src={src}
              alt={name}
              draggable={false}
              style={
                natural
                  ? { width: natural.width * shown, height: natural.height * shown }
                  : { maxWidth: '100%' }
              }
              onLoad={(event) =>
                setNatural({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              onError={() => setFailed(true)}
              onClick={(event) => {
                if (!annotating) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const x = Math.round(((event.clientX - rect.left) / rect.width) * 100);
                const y = Math.round(((event.clientY - rect.top) / rect.height) * 100);
                onComment(
                  `Image point: ${x}% from left, ${y}% from top. Original dimensions: ${natural?.width} × ${natural?.height}.`,
                );
                setAnnotating(false);
              }}
            />
          </div>
        )}
      </div>
      <div className="wb-subtoolbar wb-image-footer">
        <span className="wb-note">
          {annotating ? 'Click a point on the image' : 'Pinch to zoom · Drag to pan'}
        </span>
        <div className="wb-actions">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={annotating}
            disabled={!natural}
            onClick={() => setAnnotating(!annotating)}
          >
            Annotate point
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onComment()}>
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
