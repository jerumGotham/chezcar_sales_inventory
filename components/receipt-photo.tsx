"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const STEP = 0.5;

function clampZoom(value: number) {
  return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
}

/**
 * A handwritten receipt, which is the whole point of verification and is often
 * too small to read in the panel. The thumbnail opens a viewer that magnifies
 * and pans, so a figure can be checked without leaving the screen.
 */
export function ReceiptPhoto({
  src,
  alt,
  caption,
  className,
}: {
  src: string;
  alt: string;
  caption?: string;
  /** Sizes the thumbnail. Defaults to the same height the panels used before. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Click to magnify"
        className="group relative block w-full overflow-hidden rounded-xl border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {/* Uploaded evidence, served by a private route: never run through the
            image optimizer, which would cache it behind the authorization. */}
        <Image src={src} alt={alt} width={800} height={1000} unoptimized className={cn("w-full bg-muted object-contain", className ?? "max-h-72")} />
        <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-lg bg-background/90 px-2 py-1 text-xs font-medium text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Maximize2 aria-hidden="true" className="size-3.5" />
          Magnify
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{alt}</DialogTitle>
            <DialogDescription>{caption ?? "Scroll to zoom, drag to move around."}</DialogDescription>
          </DialogHeader>
          <Magnifier src={src} alt={alt} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Magnifier({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Zooming back out to the top recentres, so the image can never be left
  // parked off screen with nothing visible to drag back.
  const changeZoom = useCallback((next: number) => {
    const level = clampZoom(next);
    setZoom(level);
    if (level === MIN_ZOOM) setOffset({ x: 0, y: 0 });
  }, []);

  /*
   * The wheel listener is attached by hand because React's onWheel is passive,
   * and a passive listener cannot stop the dialog scrolling underneath.
   */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      changeZoom(zoom + (event.deltaY < 0 ? STEP : -STEP));
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [zoom, changeZoom]);

  return (
    <div className="space-y-2">
      <div
        ref={frameRef}
        className={cn(
          "relative h-[60vh] overflow-hidden rounded-xl border bg-muted",
          zoom > MIN_ZOOM ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
        )}
        onPointerDown={(event) => {
          if (zoom === MIN_ZOOM) {
            changeZoom(zoom + STEP * 2);
            return;
          }
          dragging.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = dragging.current;
          if (!start) return;
          setOffset({ x: event.clientX - start.x, y: event.clientY - start.y });
        }}
        onPointerUp={() => { dragging.current = null; }}
        onPointerCancel={() => { dragging.current = null; }}
      >
        <Image
          src={src}
          alt={alt}
          width={1200}
          height={1600}
          unoptimized
          draggable={false}
          className="absolute left-1/2 top-1/2 max-h-none max-w-none select-none"
          style={{
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})`,
            height: "100%",
            width: "auto",
            objectFit: "contain",
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{Math.round(zoom * 100)}%</p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => changeZoom(zoom - STEP)} disabled={zoom <= MIN_ZOOM}>
            <Minus aria-hidden="true" />
            <span className="sr-only">Zoom out</span>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => changeZoom(zoom + STEP)} disabled={zoom >= MAX_ZOOM}>
            <Plus aria-hidden="true" />
            <span className="sr-only">Zoom in</span>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={reset} disabled={zoom === MIN_ZOOM && offset.x === 0 && offset.y === 0}>
            <RotateCcw aria-hidden="true" />
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
