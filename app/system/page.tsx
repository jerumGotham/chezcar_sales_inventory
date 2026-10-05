"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Database, Download, Gauge, HardDrive, Info, Loader2, MemoryStick, RefreshCw, Save } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { TablePagination } from "@/components/table-pagination";
import { useCan } from "@/components/shell-access-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SystemHealth = {
  readAt: string;
  database: { name: string; bytes: number; tables: Array<{ name: string; bytes: number; rows: number }> };
  storage: { path: string; totalBytes: number; freeBytes: number; usedBytes: number; usedPercent: number } | null;
  memory: { totalBytes: number; freeBytes: number; usedPercent: number; processBytes: number };
  cpu: { cores: number; loadAverage: [number, number, number]; loadPerCore: number; processUptimeSeconds: number };
};

type LogLevel = "ERROR" | "WARN" | "INFO";

type LogEntry = {
  id: string;
  occurredAt: string;
  level: LogLevel;
  source: string;
  message: string;
  detail: string | null;
  actor: string;
};

type LogResponse = {
  data: LogEntry[];
  meta: { page: number; totalPages: number; totalItems: number; errors: number; warnings: number; info: number };
};

const LEVELS: Array<{ value: "all" | LogLevel; label: string }> = [
  { value: "all", label: "All" },
  { value: "ERROR", label: "Errors" },
  { value: "WARN", label: "Warnings" },
  { value: "INFO", label: "Info" },
];

const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "medium" });

function bytes(value: number) {
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / 1024 ** index;
  return `${scaled.toFixed(scaled >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function duration(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Green while there is room, amber when it is worth looking, red when it is not. */
function pressure(percent: number) {
  if (percent >= 90) return "text-red-600 dark:text-red-400";
  if (percent >= 75) return "text-amber-700 dark:text-amber-300";
  return "text-foreground";
}

type BackupFile = { name: string; bytes: number; createdAt: string };

export default function SystemPage() {
  const canMonitor = useCan("system:monitor");
  const canBackup = useCan("system:backup");
  const queryClient = useQueryClient();
  const [backupError, setBackupError] = useState<string | null>(null);
  const [level, setLevel] = useState<"all" | LogLevel>("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const health = useQuery({
    queryKey: ["system-health"],
    enabled: canMonitor,
    queryFn: async (): Promise<SystemHealth> => {
      const response = await fetch("/api/system/health", { credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to read system health");
      return json.data;
    },
    // The numbers move on their own, so the page keeps itself current.
    refetchInterval: 30_000,
  });

  const backups = useQuery({
    queryKey: ["system-backups"],
    enabled: canBackup,
    queryFn: async (): Promise<BackupFile[]> => {
      const response = await fetch("/api/system/backup", { credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to read the backups");
      return json.data;
    },
  });

  const takeBackup = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/system/backup", { method: "POST", credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to take the backup");
      return json.data;
    },
    onSuccess: async () => {
      setBackupError(null);
      await queryClient.invalidateQueries({ queryKey: ["system-backups"] });
    },
    onError: (error: Error) => setBackupError(error.message),
  });

  const logs = useQuery({
    queryKey: ["system-logs", level, search, page],
    enabled: canMonitor,
    placeholderData: (previous) => previous,
    queryFn: async (): Promise<LogResponse> => {
      const params = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (level !== "all") params.set("level", level);
      if (search) params.set("search", search);
      const response = await fetch(`/api/system/logs?${params}`, { credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to read the logs");
      return json;
    },
  });

  if (!canMonitor) {
    return (
      <PageShell title="System" subtitle="Server health, logs and database size.">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">You do not have access to the system console.</CardContent></Card>
      </PageShell>
    );
  }

  const data = health.data;

  return (
    <PageShell
      title="System"
      subtitle="Server health, application logs and database size, so a problem can be read without opening a terminal."
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {data ? `Read ${dateTime.format(new Date(data.readAt))}` : "Reading..."}
          </p>
          <Button variant="outline" size="sm" onClick={() => health.refetch()} disabled={health.isFetching}>
            {health.isFetching ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
            Refresh
          </Button>
        </div>

        {health.error ? (
          <Card><CardContent className="p-4 text-sm text-destructive" role="alert">{(health.error as Error).message}</CardContent></Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <HealthCard
            icon={<Database aria-hidden="true" className="size-4" />}
            label="Database"
            value={data ? bytes(data.database.bytes) : "-"}
            hint={data ? data.database.name : ""}
          />
          <HealthCard
            icon={<HardDrive aria-hidden="true" className="size-4" />}
            label="Storage volume"
            value={data?.storage ? `${data.storage.usedPercent}% used` : "Not measurable"}
            hint={data?.storage ? `${bytes(data.storage.freeBytes)} free of ${bytes(data.storage.totalBytes)}` : "This platform does not report it"}
            tone={data?.storage ? pressure(data.storage.usedPercent) : undefined}
          />
          <HealthCard
            icon={<MemoryStick aria-hidden="true" className="size-4" />}
            label="Memory"
            value={data ? `${data.memory.usedPercent}% used` : "-"}
            hint={data ? `${bytes(data.memory.freeBytes)} free · this app holds ${bytes(data.memory.processBytes)}` : ""}
            tone={data ? pressure(data.memory.usedPercent) : undefined}
          />
          <HealthCard
            icon={<Gauge aria-hidden="true" className="size-4" />}
            label="CPU load"
            value={data ? String(data.cpu.loadPerCore) : "-"}
            hint={data ? `${data.cpu.cores} core(s) · up ${duration(data.cpu.processUptimeSeconds)}` : ""}
            tone={data ? pressure(data.cpu.loadPerCore * 100) : undefined}
          />
        </div>

        <Card>
          <CardContent className="p-0">
            <h2 className="px-4 pt-4 font-semibold">Biggest tables</h2>
            <p className="px-4 pb-3 text-xs text-muted-foreground">
              Table, indexes and overflow together, which is what fills the disk. Row counts are the planner&apos;s estimate.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Table</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Rows</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.database.tables ?? []).map((table) => (
                    <tr key={table.name} className="border-t">
                      <td className="px-4 py-2">{table.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{table.rows.toLocaleString("en-PH")}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{bytes(table.bytes)}</td>
                    </tr>
                  ))}
                  {!data ? <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Reading...</td></tr> : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {canBackup ? (
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Database backup</h2>
                  <p className="text-xs text-muted-foreground">
                    Written to the server&apos;s persistent volume and downloadable here. Restore it on your own machine with
                    <code className="mx-1 rounded bg-muted px-1">pg_restore</code>; this page deliberately does not restore over the live database.
                  </p>
                </div>
                <Button size="sm" onClick={() => takeBackup.mutate()} disabled={takeBackup.isPending}>
                  {takeBackup.isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Save aria-hidden="true" />}
                  {takeBackup.isPending ? "Taking backup..." : "Take a backup now"}
                </Button>
              </div>
              {backupError ? <p className="text-sm text-destructive" role="alert">{backupError}</p> : null}
              <div className="overflow-hidden rounded-xl border">
                {(backups.data ?? []).map((file) => (
                  <div key={file.name} className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 last:border-0">
                    <span className="min-w-0">
                      <span className="block break-all text-sm">{file.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {dateTime.format(new Date(file.createdAt))} · {bytes(file.bytes)}
                      </span>
                    </span>
                    <a
                      className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-sm hover:bg-accent"
                      href={`/api/system/backup?file=${encodeURIComponent(file.name)}`}
                    >
                      <Download aria-hidden="true" className="size-4" />
                      Download
                    </a>
                  </div>
                ))}
                {backups.data && backups.data.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">No backup taken yet.</p>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">The five most recent are kept; older ones are removed as new ones are taken.</p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <h2 className="font-semibold">Application log</h2>
              <p className="text-xs text-muted-foreground">
                What the application recorded going wrong. The container&apos;s own output is lost on restart; this is not.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {LEVELS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={level === option.value ? "default" : "outline"}
                  onClick={() => { setLevel(option.value); setPage(1); }}
                >
                  {option.label}
                  {option.value === "ERROR" && logs.data ? ` (${logs.data.meta.errors})` : ""}
                  {option.value === "WARN" && logs.data ? ` (${logs.data.meta.warnings})` : ""}
                  {option.value === "INFO" && logs.data ? ` (${logs.data.meta.info})` : ""}
                </Button>
              ))}
              <form
                className="ml-auto flex items-center gap-2"
                onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); setPage(1); }}
              >
                <Input
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Search message, route or stack"
                  className="w-64"
                />
                <Button type="submit" size="sm" variant="outline">Search</Button>
              </form>
            </div>

            {logs.error ? (
              <p className="text-sm text-destructive" role="alert">{(logs.error as Error).message}</p>
            ) : null}

            <div className="overflow-hidden rounded-xl border">
              {(logs.data?.data ?? []).map((entry) => (
                <div key={entry.id} className="border-b last:border-0">
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-accent/50"
                    onClick={() => setExpanded((current) => (current === entry.id ? null : entry.id))}
                  >
                    <LevelBadge level={entry.level} />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm">{entry.message}</span>
                      <span className="block text-xs text-muted-foreground">
                        {dateTime.format(new Date(entry.occurredAt))} · {entry.source} · {entry.actor}
                      </span>
                    </span>
                  </button>
                  {expanded === entry.id && entry.detail ? (
                    <pre className="overflow-x-auto border-t bg-muted/40 px-3 py-2 text-xs">{entry.detail}</pre>
                  ) : null}
                </div>
              ))}
              {logs.data && logs.data.data.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nothing logged in this filter. An empty error list is the good outcome.
                </p>
              ) : null}
              {logs.isLoading ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Reading...</p> : null}
            </div>

            {logs.data ? (
              <div className="flex justify-end">
                <TablePagination
                  page={logs.data.meta.page}
                  totalPages={logs.data.meta.totalPages}
                  busy={logs.isFetching}
                  onPageChange={setPage}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function HealthCard({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string; hint: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold", tone)}>{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function LevelBadge({ level }: { level: LogLevel }) {
  const styles = {
    ERROR: "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300",
    WARN: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
    INFO: "border-border bg-muted text-muted-foreground",
  } as const;
  const Icon = level === "ERROR" ? AlertTriangle : level === "WARN" ? AlertTriangle : Info;
  return (
    <span className={cn("mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-medium", styles[level])}>
      <Icon aria-hidden="true" className="size-3" />
      {level}
    </span>
  );
}
