import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { notifications } from "@/lib/mock-data";

export default function NotificationsPage() {
  return (
    <PageShell
      title="Notifications"
      subtitle="View low stock alerts, pending approvals, and other important system reminders."
    >
      <div className="grid gap-4">
        {notifications.map((item) => (
          <Card key={item.title}>
            <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {item.description}
                </p>
              </div>
              <Badge>{item.time}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
