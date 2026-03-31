import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SimpleTable } from "@/components/simple-table";
import { customers } from "@/lib/mock-data";

export default function CustomersPage() {
  return (
    <PageShell
      title="Customers"
      subtitle="Manage customer records and view their sales, order, and service history."
      actions={
        <>
          <Button>Add Customer</Button>
          <Button variant="outline">Export List</Button>
        </>
      }
    >
      <Card className="mb-6">
        <CardContent className="grid gap-4 p-5 md:grid-cols-4">
          <Input placeholder="Search customer" />
          <Input placeholder="Mobile number" />
          <Input placeholder="City" />
          <Button className="w-full">Apply Filters</Button>
        </CardContent>
      </Card>

      <SimpleTable
        title="Customer List"
        headers={[
          "Customer ID",
          "Name",
          "Mobile",
          "City",
          "Status",
          "Last Transaction",
          "Action",
        ]}
        rows={customers.map((customer) => [
          customer.id,
          customer.name,
          customer.mobile,
          customer.city,
          <Badge key={`${customer.id}-status`}>{customer.status}</Badge>,
          customer.lastTransaction,
          <div key={`${customer.id}-actions`} className="flex gap-2">
            <Button variant="ghost">View</Button>
            <Button variant="ghost">Edit</Button>
          </div>,
        ])}
      />
    </PageShell>
  );
}
