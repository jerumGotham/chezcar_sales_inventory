import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SimpleTable } from "@/components/simple-table";
import { products } from "@/lib/mock-data";

export default function ProductsPage() {
  return (
    <PageShell
      title="Products"
      subtitle="Maintain the product master list with category, price, branch stock, and item codes."
      actions={
        <>
          <Button>Add Product</Button>
          <Button variant="outline">Import Items</Button>
        </>
      }
    >
      <Card className="mb-6">
        <CardContent className="grid gap-4 p-5 md:grid-cols-4">
          <Input placeholder="Search SKU or item name" />
          <Input placeholder="Category" />
          <Input placeholder="Branch" />
          <Button className="w-full">Search</Button>
        </CardContent>
      </Card>

      <SimpleTable
        title="Product Master List"
        headers={[
          "SKU",
          "Name",
          "Category",
          "Price",
          "Stock",
          "Branch",
          "Action",
        ]}
        rows={products.map((product) => [
          product.sku,
          product.name,
          product.category,
          product.price,
          product.stock,
          product.branch,
          <div key={`${product.sku}-actions`} className="flex gap-2">
            <Button variant="ghost">Edit</Button>
            <Button variant="ghost">Stock</Button>
          </div>,
        ])}
      />
    </PageShell>
  );
}
