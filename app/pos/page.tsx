import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { products } from "@/lib/mock-data";

export default function PosPage() {
  return (
    <PageShell
      title="POS / Sales"
      subtitle="Fast sales screen for walk-in transactions with product cards and order summary."
      actions={
        <div className="flex gap-3">
          <Button variant="outline">Hold Sale</Button>
          <Button>Checkout</Button>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex gap-3">
              <Input placeholder="Scan barcode or search product" />
              <Button>Search</Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <div key={product.sku} className="rounded-2xl border p-4">
                  <div className="mb-4 h-28 rounded-xl bg-slate-100" />
                  <p className="text-xs text-slate-400">{product.sku}</p>
                  <h3 className="font-semibold text-foreground">
                    {product.name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {product.category}
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-semibold text-primary">
                      {product.price}
                    </span>
                    <Button variant="outline">Add</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Sale</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-2xl border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Leather Seat Cover</p>
                    <p className="text-sm text-slate-500">Qty 1</p>
                  </div>
                  <p className="font-semibold">₱4,500</p>
                </div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="flex items-center justify-between text-sm">
                  <span>Subtotal</span>
                  <span>₱4,500</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span>Discount</span>
                  <span>₱0.00</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-3 text-base font-semibold">
                  <span>Total</span>
                  <span>₱4,500</span>
                </div>
              </div>
              <Input placeholder="Customer name (optional)" />
              <Input placeholder="Payment type" />
              <Button className="w-full">Complete Sale</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
