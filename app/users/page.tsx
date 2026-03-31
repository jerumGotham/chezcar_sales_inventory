import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SimpleTable } from "@/components/simple-table";

const users = [
  {
    name: "Owner Account",
    email: "owner@chezcar.local",
    role: "Super Admin",
    branch: "All Branches",
    status: "Active",
  },
  {
    name: "QC Manager",
    email: "qc.manager@chezcar.local",
    role: "Branch Manager",
    branch: "QC Main",
    status: "Active",
  },
  {
    name: "Inventory Admin",
    email: "inventory@chezcar.local",
    role: "Admin",
    branch: "QC Main",
    status: "Active",
  },
];

export default function UsersPage() {
  return (
    <PageShell
      title="Users & Roles"
      subtitle="Manage user accounts, branch assignment, and permission-based access."
      actions={
        <>
          <Button>Add User</Button>
          <Button variant="outline">Manage Roles</Button>
        </>
      }
    >
      <SimpleTable
        title="System Users"
        headers={["Name", "Email", "Role", "Branch", "Status", "Action"]}
        rows={users.map((user) => [
          user.name,
          user.email,
          user.role,
          user.branch,
          <Badge key={`${user.email}-status`}>{user.status}</Badge>,
          <div key={`${user.email}-actions`} className="flex gap-2">
            <Button variant="ghost">Edit</Button>
            <Button variant="ghost">Permissions</Button>
          </div>,
        ])}
      />
    </PageShell>
  );
}
