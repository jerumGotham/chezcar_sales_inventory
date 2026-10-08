"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { ReceiptPhoto } from "@/components/receipt-photo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const MAX_RECEIPT_PHOTOS = 5;

/**
 * Picks up to five pictures of one receipt before they are uploaded. Each opens
 * in the magnifier so the branch can check it is readable, and each can be
 * removed. The first becomes the receipt's main photo, the one Accounting
 * verifies against; the rest are kept beside it.
 */
export function ReceiptPhotosInput({
  id,
  files,
  onChange,
  max = MAX_RECEIPT_PHOTOS,
  disabled,
  required,
  describedBy,
}: {
  id: string;
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
  disabled?: boolean;
  required?: boolean;
  describedBy?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(() => {
    if (files.length === 0 && inputRef.current) inputRef.current.value = "";
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [files, previews]);

  const room = max - files.length;

  return (
    <div className="space-y-2">
      <Input
        ref={inputRef}
        id={id}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled || room <= 0}
        required={required && files.length === 0}
        aria-describedby={describedBy}
        onChange={(event) => {
          // Added to what is already picked, never past the limit.
          const picked = Array.from(event.target.files ?? []).slice(0, Math.max(room, 0));
          if (picked.length) onChange([...files, ...picked]);
          event.target.value = "";
        }}
      />
      <p className="text-xs text-muted-foreground">
        {files.length} of {max} photos{room <= 0 ? " — remove one to add another" : ""}. The first is the main photo.
      </p>
      {files.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="space-y-1 rounded-xl border p-2">
              <ReceiptPhoto src={previews[index]} alt={`Receipt photo ${index + 1}`} caption={`${file.name} · Scroll to zoom, drag to move around.`} className="max-h-28" />
              <div className="flex items-center justify-between gap-1">
                <span className="min-w-0 truncate text-xs text-muted-foreground">{index === 0 ? "Main · " : ""}{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove photo ${index + 1}`}
                  disabled={disabled}
                  onClick={() => onChange(files.filter((_, position) => position !== index))}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/*
 * Sends the picked photos for one receipt: the first to the receipt's own
 * photo route, the rest beside it. Returns false if any of them failed, so the
 * caller can say the money or the goods are recorded but a photo is missing.
 */
export async function uploadReceiptPhotos(files: File[], routes: { primary: string; extras: string }) {
  if (files.length === 0) return true;
  const first = new FormData();
  first.set("photo", files[0]);
  const primary = await fetch(routes.primary, { method: "POST", credentials: "same-origin", body: first }).catch(() => null);
  if (!primary?.ok) return false;
  if (files.length === 1) return true;
  const rest = new FormData();
  files.slice(1).forEach((file) => rest.append("photos", file));
  const extras = await fetch(routes.extras, { method: "POST", credentials: "same-origin", body: rest }).catch(() => null);
  return Boolean(extras?.ok);
}
