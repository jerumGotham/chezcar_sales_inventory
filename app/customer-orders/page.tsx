import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SimpleTable } from "@/components/simple-table";
import { orders } from "@/lib/mock-data";

export default function CustomerOrdersPage() {
  return (
    <PageShell
      title="Customer Orders"
      subtitle="Handle reservations, special orders, downpayments, and release status."
      actions={
        <>
          <Button>Create Order</Button>
          <Button variant="outline">Record Downpayment</Button>
        </>
      }
    >
      <SimpleTable
        title="Order List"
        headers={[
          "Order No.",
          "Customer",
          "Item",
          "Status",
          "Downpayment",
          "Release Date",
          "Action",
        ]}
        rows={orders.map((order) => [
          order.orderNo,
          order.customer,
          order.item,
          <Badge key={`${order.orderNo}-status`}>{order.status}</Badge>,
          order.downpayment,
          order.releaseDate,
          <div key={`${order.orderNo}-actions`} className="flex gap-2">
            <Button variant="ghost">View</Button>
            <Button variant="ghost">Release</Button>
          </div>,
        ])}
      />
    </PageShell>
  );
}
