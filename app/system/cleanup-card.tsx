"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useCan } from "@/components/shell-access-context";
import { StatusBanner } from "@/components/status-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type CleanupItem = {
  task: string;
  label: string;
  description: string;
  count: number;
  bytes: number | null;
};

function size(value: number) {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${units[unit]}`;
}

/*
 * Run on the server itself, from the Hetzner console or SSH. The application
 * lives inside one container and cannot reach any of this, which is why these
 * are shown to copy rather than offered as buttons that would do nothing.
 */
const HOST_COMMANDS = [
  { label: "See what is filling the disk", command: "df -h / && docker system df" },
  { label: "Remove old Docker images from earlier deploys (biggest win)", command: "docker image prune -a -f" },
  { label: "Clear Docker build cache", command: "docker builder prune -f" },
  { label: "Shrink the system journal to 200 MB", command: "journalctl --vacuum-size=200M" },
  { label: "See what is using memory and CPU", command: "docker stats --no-stream" },
];

/**
 * One place to free space: scan what the application can clear, pick, confirm.
 * Memory and CPU belong to the whole server, so that half explains what to run
 * there instead.
 */
export function CleanupCard() {
  const canClean = useCan("system:cleanup");
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const scan = useQuery({
    queryKey: ["system-cleanup"],
    queryFn: async (): Promise<CleanupItem[]> => {
      const response = await fetch("/api/system/cleanup", { credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to scan for cleanup");
      return json.data;
    },
  });

  const items = scan.data ?? [];
  // Until the reader changes it, everything that has something in it is ticked.
  const chosen = selected ?? new Set(items.filter((item) => item.count > 0).map((item) => item.task));
  const reclaimable = items.filter((item) => chosen.has(item.task)).reduce((total, item) => total + (item.bytes ?? 0), 0);

  const clean = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/system/cleanup", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: [...chosen] }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to clean up");
      return json.data as { results: Array<{ task: string; count: number }>; freedBytes: number };
    },
    onSuccess: async (result) => {
      setConfirming(false);
      setSelected(null);
      const removed = result.results.reduce((total, row) => total + row.count, 0);
      setNotice(`Cleaned up ${removed} item(s) and freed ${size(result.freedBytes)} of disk.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["system-cleanup"] }),
        queryClient.invalidateQueries({ queryKey: ["system-health"] }),
        queryClient.invalidateQueries({ queryKey: ["system-backups"] }),
      ]);
    },
    onError: () => setConfirming(false),
  });

  const toggle = (task: string) => {
    const next = new Set(chosen);
    if (next.has(task)) next.delete(task);
    else next.add(task);
    setSelected(next);
  };

  const copy = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(command);
      setTimeout(() => setCopied((current) => (current === command ? null : current)), 2000);
    } catch {
      // Clipboard refused (no permission or not a secure context): the command is still on screen to select.
    }
  };

  return (
    <Card id="cleanup" className="scroll-mt-24">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Sparkles aria-hidden="true" className="size-4" />
              Clean up
            </h2>
            <p className="text-xs text-muted-foreground">
              Things this app wrote and no longer needs. Nothing a sale, order or product still uses is touched.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => scan.refetch()} disabled={scan.isFetching}>
            {scan.isFetching ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
            Scan again
          </Button>
        </div>

        {notice ? <StatusBanner tone="success" onDismiss={() => setNotice(null)}>{notice}</StatusBanner> : null}
        {clean.error ? <StatusBanner tone="error">{(clean.error as Error).message}</StatusBanner> : null}
        {scan.error ? <p className="text-sm text-destructive" role="alert">{(scan.error as Error).message}</p> : null}

        <div className="overflow-hidden rounded-xl border">
          {scan.isLoading ? (
            <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="size-4 animate-spin" />Scanning...</p>
          ) : (
            items.map((item) => (
              <label key={item.task} className="flex cursor-pointer items-start gap-3 border-b px-3 py-3 last:border-0 hover:bg-accent/40">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={chosen.has(item.task)}
                  disabled={!canClean || item.count === 0}
                  onChange={() => toggle(item.task)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.description}</span>
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums">
                  {item.count === 0 ? (
                    <span className="text-muted-foreground">Nothing to clear</span>
                  ) : (
                    <>
                      <span className="block font-medium">{item.count.toLocaleString("en-PH")}</span>
                      {item.bytes !== null ? <span className="block text-xs text-muted-foreground">{size(item.bytes)}</span> : null}
                    </>
                  )}
                </span>
              </label>
            ))
          )}
        </div>

        {canClean ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setConfirming(true)} disabled={clean.isPending || chosen.size === 0}>
              {clean.isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Sparkles aria-hidden="true" />}
              {clean.isPending ? "Cleaning..." : "Clean up selected"}
            </Button>
            {reclaimable > 0 ? <span className="text-sm text-muted-foreground">Frees about {size(reclaimable)} of disk</span> : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">You can see what could be cleared, but cleaning up needs the System cleanup permission.</p>
        )}

        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Server memory, CPU and Docker</h3>
          <p className="text-xs text-muted-foreground">
            High memory or CPU belongs to the whole server, not this page, and most disk space is taken by old Docker images
            from earlier deploys. The app cannot reach those from inside its container, so run these on the server
            (Hetzner console or SSH). If memory or CPU stays high, restarting or upgrading the server is the real fix.
          </p>
          <div className="space-y-2">
            {HOST_COMMANDS.map((entry) => (
              <div key={entry.command} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">{entry.label}</span>
                  <code className="block break-all text-sm">{entry.command}</code>
                </span>
                <Button variant="outline" size="sm" onClick={() => copy(entry.command)} aria-label={`Copy ${entry.command}`}>
                  {copied === entry.command ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied === entry.command ? "Copied" : "Copy"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </CardContent>

      <ConfirmationDialog
        open={confirming}
        title="Clean up the selected items?"
        description={`The selected files and records will be deleted for good${reclaimable > 0 ? `, freeing about ${size(reclaimable)}` : ""}. Nothing that a sale, order or product still uses is removed. This cannot be undone.`}
        confirmLabel="Clean up"
        onConfirm={() => clean.mutate()}
        onOpenChange={(open) => { if (!open) setConfirming(false); }}
      />
    </Card>
  );
}
