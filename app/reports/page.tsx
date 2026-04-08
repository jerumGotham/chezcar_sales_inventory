"use client";

import { useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileSpreadsheet, FileText, Search } from "lucide-react";

const reports = [
  {
    name: "Daily Sales Report",
    category: "Sales",
    description: "Export daily sales transactions by date range and branch.",
  },
  {
    name: "Customer Orders Report",
    category: "Sales",
    description: "Export customer orders, balances, and order statuses.",
  },
  {
    name: "Inventory Movement Report",
    category: "Inventory",
    description: "Export stock in, stock out, transfers, and adjustments.",
  },
  {
    name: "Low Stock Report",
    category: "Inventory",
    description: "Export products below reorder level.",
  },
  {
    name: "Transfer Monitoring Report",
    category: "Inventory",
    description: "Export transfer requests and receiving statuses.",
  },
  {
    name: "Job Orders Report",
    category: "Service",
    description: "Export service transactions, parts usage, and job status.",
  },
];

export default function ReportsPage() {
  const [search, setSearch] = useState("");
  const [selectedReport, setSelectedReport] = useState<string>(reports[0].name);
  const [branch, setBranch] = useState("all");

  const filteredReports = useMemo(() => {
    const keyword = search.toLowerCase().trim();
    if (!keyword) return reports;

    return reports.filter(
      (report) =>
        report.name.toLowerCase().includes(keyword) ||
        report.category.toLowerCase().includes(keyword) ||
        report.description.toLowerCase().includes(keyword),
    );
  }, [search]);

  const activeReport =
    reports.find((report) => report.name === selectedReport) ?? reports[0];

  const handleExport = (format: "excel" | "pdf") => {
    console.log("Export:", {
      report: activeReport.name,
      format,
      branch,
    });
  };

  return (
    <PageShell
      title="Reports"
      subtitle="Generate and export operational reports without loading large datasets on screen."
      actions={<Button>Generate Report</Button>}
    >
      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search report..."
              className="pl-9"
            />
          </div>

          <div className="space-y-3">
            {filteredReports.map((report) => {
              const isActive = selectedReport === report.name;

              return (
                <Card
                  key={report.name}
                  onClick={() => setSelectedReport(report.name)}
                  className={`cursor-pointer transition-all ${
                    isActive
                      ? "border-primary shadow-sm"
                      : "hover:border-primary/40"
                  }`}
                >
                  <CardContent className="p-4">
                    <Badge className="mb-2">{report.category}</Badge>
                    <h3 className="text-sm font-semibold md:text-base">
                      {report.name}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {report.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}

            {filteredReports.length === 0 && (
              <Card>
                <CardContent className="p-4 text-sm text-slate-500">
                  No reports found.
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="space-y-6 p-6">
            <div>
              <Badge className="mb-3">{activeReport.category}</Badge>
              <h2 className="text-xl font-semibold">{activeReport.name}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {activeReport.description}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Date From</Label>
                <Input type="date" />
              </div>

              <div className="space-y-2">
                <Label>Date To</Label>
                <Input type="date" />
              </div>

              <div className="space-y-2">
                <Label>Branch</Label>
                <Select
                  value={branch}
                  onValueChange={(value) => value && setBranch(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    <SelectItem value="main">Main Warehouse</SelectItem>
                    <SelectItem value="branch-1">Branch 1</SelectItem>
                    <SelectItem value="branch-2">Branch 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">
              This page is optimized for export only. The system will generate
              the file directly instead of rendering large report tables on the
              screen.
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => handleExport("excel")}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export Excel
              </Button>

              <Button variant="outline" onClick={() => handleExport("pdf")}>
                <FileText className="mr-2 h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
