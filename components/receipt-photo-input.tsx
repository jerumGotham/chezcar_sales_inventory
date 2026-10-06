"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { ReceiptPhoto } from "@/components/receipt-photo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Picks a receipt photo before it is uploaded. The chosen image opens in the
 * same magnifier Accounting uses, so the branch can check the figures are
 * legible, and can be removed and picked again before anything is saved.
 */
export function ReceiptPhotoInput({
  id,
  file,
  onChange,
  disabled,
  required,
  describedBy,
}: {
  id: string;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  required?: boolean;
  describedBy?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = "";
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [file, previewUrl]);

  return (
    <div className="space-y-2">
      <Input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        required={required && !file}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      {file && previewUrl ? (
        <div className="space-y-2 rounded-xl border p-3">
          <ReceiptPhoto src={previewUrl} alt="Receipt photo to attach" caption={`${file.name} · Scroll to zoom, drag to move around.`} className="max-h-48" />
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs text-muted-foreground">{file.name}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => {
                onChange(null);
                inputRef.current?.focus();
              }}
            >
              <Trash2 aria-hidden="true" />
              Remove photo
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
