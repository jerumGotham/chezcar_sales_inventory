import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SimpleTable } from "@/components/simple-table";
import { transfers } from "@/lib/mock-data";

export default function StockTransfersPage() {
  return (
    <PageShell
      title="Stock Transfers"
      subtitle="Request, approve, and monitor branch-to-branch stock transfers."
      actions={
        <>
          <Button>Create Transfer Request</Button>
          <Button variant="outline">Approve Requests</Button>
        </>
      }
    >
      <SimpleTable
        title="Transfer Requests"
        headers={[
          "Transfer No.",
          "From",
          "To",
          "Item",
          "Qty",
          "Status",
          "Action",
        ]}
        rows={transfers.map((transfer) => [
          transfer.transferNo,
          transfer.from,
          transfer.to,
          transfer.item,
          transfer.qty,
          <Badge key={`${transfer.transferNo}-status`}>
            {transfer.status}
          </Badge>,
          <div key={`${transfer.transferNo}-actions`} className="flex gap-2">
            <Button variant="ghost">View</Button>
            <Button variant="ghost">Approve</Button>
          </div>,
        ])}
      />
    </PageShell>
  );
}
