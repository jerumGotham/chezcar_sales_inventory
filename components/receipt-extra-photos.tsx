"use client";

import { Trash2, Upload } from "lucide-react";
import { useState } from "react";

import { ReceiptPhoto } from "@/components/receipt-photo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The second to fifth pictures of a receipt, shown beside its first. While the
 * receipt is still open to change, more can be added up to five in all and an
 * extra can be removed; the first photo is managed where it always was.
 */
export function ReceiptExtraPhotos({
  urls,
  hasPrimary,
  addUrl,
  canAdd,
  canDelete,
  label = "Receipt",
  standalone = false,
  onChanged,
}: {
  urls: string[];
  /** Every photo is in `urls`, with no separate first photo (a transfer's receipt). */
  standalone?: boolean;
  hasPrimary: boolean;
  /** Where more photos are posted; omit to show only. */
  addUrl?: string;
  canAdd?: boolean;
  canDelete?: boolean;
  label?: string;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = (hasPrimary && !standalone ? 1 : 0) + urls.length;
  const canAddHere = Boolean(canAdd && addUrl && (hasPrimary || standalone) && 5 - total > 0);
  const room = 5 - total;

  const add = async (files: File[]) => {
    if (!addUrl || files.length === 0) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    files.slice(0, room).forEach((file) => body.append("photos", file));
    const response = await fetch(addUrl, { method: "POST", credentials: "same-origin", body }).catch(() => null);
    const json = response ? await response.json().catch(() => null) : null;
    setBusy(false);
    if (!response?.ok) setError(json?.error?.message ?? "Unable to add the photos");
    else onChanged?.();
  };

  const remove = async (url: string) => {
    setBusy(true);
    setError(null);
    const response = await fetch(url, { method: "DELETE", credentials: "same-origin" }).catch(() => null);
    const json = response ? await response.json().catch(() => null) : null;
    setBusy(false);
    if (!response?.ok) setError(json?.error?.message ?? "Unable to remove the photo");
    else onChanged?.();
  };

  if (urls.length === 0 && !canAddHere) return null;

  return (
    <div className="space-y-2">
      {urls.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {urls.map((url, index) => (
            <div key={url} className="space-y-1">
              <ReceiptPhoto src={url} alt={`${label} photo ${index + (standalone ? 1 : 2)}`} className="max-h-28" />
              {canDelete ? (
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => remove(url)}>
                  <Trash2 aria-hidden="true" className="mr-1 size-3.5" />
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {canAddHere ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Upload aria-hidden="true" className="size-3.5" />
          <span>Add more photos ({total} of 5)</span>
          <Input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="h-8 max-w-56 text-xs"
            disabled={busy}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void add(files);
            }}
          />
        </label>
      ) : null}
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
