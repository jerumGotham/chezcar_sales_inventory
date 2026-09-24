"use client";

import { useState, type MouseEvent } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * A product photo that magnifies where you click.
 *
 * Click enlarges the image around the point under the pointer and keeps it
 * there while the pointer moves, so a part number or a mounting bracket can be
 * read without leaving the dialog. Clicking again returns it.
 *
 * It is a button rather than a div so the keyboard reaches it and a screen
 * reader is told what pressing it does.
 */
export function ZoomableImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [origin, setOrigin] = useState<string | null>(null);
  const zoomed = origin !== null;

  /** Turns a pointer position into the transform origin under it. */
  function pointAt(event: MouseEvent<HTMLButtonElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * 100;
    const y = ((event.clientY - box.top) / box.height) * 100;
    // A pointer leaving the box mid-drag would otherwise push the origin past
    // the image and swing it out of view.
    return `${Math.min(100, Math.max(0, x))}% ${Math.min(100, Math.max(0, y))}%`;
  }

  return (
    <button
      type="button"
      aria-label={zoomed ? `Zoom out of ${alt}` : `Zoom into ${alt}`}
      aria-pressed={zoomed}
      onClick={(event) => setOrigin(zoomed ? null : pointAt(event))}
      onMouseMove={(event) => {
        if (zoomed) setOrigin(pointAt(event));
      }}
      onMouseLeave={() => setOrigin(null)}
      className={cn(
        "group relative block h-64 w-full overflow-hidden rounded-xl border bg-muted",
        zoomed ? "cursor-zoom-out" : "cursor-zoom-in",
        className,
      )}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="640px"
        // The route behind this URL requires products:view. Optimising it would
        // have the server fetch it without the viewer's cookies, which comes
        // back 401 and renders a broken image.
        unoptimized
        draggable={false}
        className={cn(
          "object-contain transition-transform duration-200 ease-out",
          zoomed && "scale-[2.5]",
        )}
        style={origin ? { transformOrigin: origin } : undefined}
      />
      {!zoomed && (
        <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          Click to zoom
        </span>
      )}
    </button>
  );
}
