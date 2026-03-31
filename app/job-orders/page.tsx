import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SimpleTable } from "@/components/simple-table";
import { jobOrders } from "@/lib/mock-data";

export default function JobOrdersPage() {
  return (
    <PageShell
      title="Job Orders"
      subtitle="Manage installation and service transactions with parts and labor details."
      actions={
        <>
          <Button>Create Job Order</Button>
          <Button variant="outline">Assign Parts</Button>
        </>
      }
    >
      <SimpleTable
        title="Job Orders"
        headers={[
          "JO No.",
          "Customer",
          "Service",
          "Technician",
          "Status",
          "Amount",
          "Action",
        ]}
        rows={jobOrders.map((job) => [
          job.joNo,
          job.customer,
          job.service,
          job.technician,
          <Badge key={`${job.joNo}-status`}>{job.status}</Badge>,
          job.amount,
          <div key={`${job.joNo}-actions`} className="flex gap-2">
            <Button variant="ghost">View</Button>
            <Button variant="ghost">Update</Button>
          </div>,
        ])}
      />
    </PageShell>
  );
}
