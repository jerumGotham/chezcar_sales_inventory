"use client";

import Image from "next/image";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ClaimEvidenceInput({ id, name, file, onChange, accept, disabled, required, describedBy }: {
  id: string;
  name: string;
  file: File | null;
  onChange: (file: File | null) => void;
  accept: string;
  disabled?: boolean;
  required?: boolean;
  describedBy?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);

  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = "";
    return () => { if (preview) URL.revokeObjectURL(preview.url); };
  }, [file, preview]);

  return <div className="space-y-2">
    <Input ref={inputRef} id={id} name={name} type="file" accept={accept} disabled={disabled} required={required} aria-describedby={describedBy} onChange={(event) => {
      const selected = event.target.files?.[0] ?? null;
      setPreview(selected?.type.startsWith("image/") ? { file: selected, url: URL.createObjectURL(selected) } : null);
      onChange(selected);
    }} />
    {file ? <div className="space-y-2 rounded-md border p-3">
      {preview?.file === file ? <Image src={preview.url} alt="Selected attachment preview" width={240} height={160} unoptimized className="max-h-40 w-auto max-w-full rounded object-contain" /> : null}
      <p className="break-all text-sm">{file.name}</p>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => {
        if (inputRef.current) inputRef.current.value = "";
        setPreview(null);
        onChange(null);
        inputRef.current?.focus();
      }}><Trash2 aria-hidden="true" />Remove attachment</Button>
    </div> : null}
  </div>;
}
