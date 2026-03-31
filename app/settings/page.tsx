import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function SettingsPage() {
  return (
    <PageShell
      title="Settings"
      subtitle="Configure company profile, categories, payment types, and other system setup values."
      actions={<Button>Save Changes</Button>}
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-5">
            <h3 className="text-lg font-semibold">Company Details</h3>
            <Input
              placeholder="Company name"
              defaultValue="Chezcar Accessories"
            />
            <Input placeholder="Business address" defaultValue="Quezon City" />
            <Input placeholder="Contact number" defaultValue="0917-000-0000" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <h3 className="text-lg font-semibold">Supporting Data</h3>
            <Input
              placeholder="Default payment types"
              defaultValue="Cash, Card, Bank Transfer"
            />
            <Input
              placeholder="Product categories"
              defaultValue="Interior, Exterior, Electronics"
            />
            <Input
              placeholder="Branch list"
              defaultValue="QC Main, Makati, Pasig"
            />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
