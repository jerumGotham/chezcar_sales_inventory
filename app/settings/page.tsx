"use client";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export default function SettingsPage() {
  return (
    <PageShell
      title="Settings"
      subtitle="Manage system configuration, company profile, and master data."
      actions={<Button>Save Changes</Button>}
    >
      <Tabs defaultValue="company" className="space-y-6">
        <TabsList>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
        </TabsList>

        {/* ================= COMPANY ================= */}
        <TabsContent value="company">
          <Card>
            <CardContent className="space-y-4 p-5">
              <h3 className="text-lg font-semibold">Company Details</h3>

              <Input
                placeholder="Company name"
                defaultValue="Chezcar Accessories"
              />
              <Input
                placeholder="Business address"
                defaultValue="Quezon City"
              />
              <Input
                placeholder="Contact number"
                defaultValue="0917-000-0000"
              />

              <Textarea placeholder="Company description (optional)" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= PAYMENTS ================= */}
        <TabsContent value="payments">
          <Card>
            <CardContent className="space-y-4 p-5">
              <h3 className="text-lg font-semibold">Payment Types</h3>

              <div className="flex gap-2">
                <Input placeholder="Add payment type (e.g. GCash)" />
                <Button>Add</Button>
              </div>

              <div className="rounded-lg border p-3 text-sm">
                • Cash <br />
                • Card <br />• Bank Transfer
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= CATEGORIES ================= */}
        <TabsContent value="categories">
          <Card>
            <CardContent className="space-y-4 p-5">
              <h3 className="text-lg font-semibold">Product Categories</h3>

              <div className="flex gap-2">
                <Input placeholder="Add category" />
                <Button>Add</Button>
              </div>

              <div className="rounded-lg border p-3 text-sm">
                • Interior <br />
                • Exterior <br />• Electronics
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= BRANCHES ================= */}
        <TabsContent value="branches">
          <Card>
            <CardContent className="space-y-4 p-5">
              <h3 className="text-lg font-semibold">Branches</h3>

              <div className="grid gap-2 md:grid-cols-3">
                <Input placeholder="Branch name" />
                <Input placeholder="Location" />
                <Button>Add Branch</Button>
              </div>

              <div className="rounded-lg border p-3 text-sm">
                • QC Main <br />
                • Makati <br />• Pasig
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
