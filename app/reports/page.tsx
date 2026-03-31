import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const reports = [
  "Daily Sales Report",
  "Inventory Movement Report",
  "Low Stock Report",
  "Customer Orders Report",
  "Job Orders Report",
  "Transfer Monitoring Report",
];

export default function ReportsPage() {
  return (
    <PageShell
      title="Reports"
      subtitle="Review and export operational reports for sales, inventory, orders, and services."
      actions={<Button>Generate Report</Button>}
    >
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => (
          <Card key={report}>
            <CardContent className="p-5">
              <Badge className="mb-3">Export Ready UI</Badge>
              <h3 className="text-lg font-semibold">{report}</h3>
              <p className="mt-2 text-sm text-slate-500">
                This screen can include filters, date range, branch selection,
                preview, and export buttons.
              </p>
              <Button variant="outline" className="mt-4">
                Open Report
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
