import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const actions = [
  {
    title: "Receive Stocks",
    description: "Create stock receiving entries from supplier deliveries.",
  },
  {
    title: "Adjust Stocks",
    description: "Increase or decrease on-hand quantities with reasons.",
  },
  {
    title: "View Stock Card",
    description: "Check item movement history per branch and SKU.",
  },
  {
    title: "Branch Availability",
    description: "Monitor available items across all branches.",
  },
];

export default function InventoryPage() {
  return (
    <PageShell
      title="Inventory"
      subtitle="Track branch inventory, stock movements, stock adjustments, and receiving records."
      actions={
        <>
          <Button>Receive Stock</Button>
          <Button variant="outline">Stock Adjustment</Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {actions.map((item) => (
          <Card key={item.title}>
            <CardContent className="p-5">
              <Badge className="mb-4">UI Scope</Badge>
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-500">{item.description}</p>
              <Button
                variant="ghost"
                className="mt-4 px-0 text-primary hover:text-primary"
              >
                Open screen
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
