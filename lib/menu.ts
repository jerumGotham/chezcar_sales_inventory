import type {
  ShellCapabilityId,
  ShellMenuHref,
  ShellMenuIcon,
} from "./contracts/access";
import {
  Boxes,
  ClipboardList,
  ArrowLeftRight,
  LayoutDashboard,
  Package,
  FileText,
  UserCog,
  Building2,
  Users,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";

export type MenuDefinition = {
  label: string;
  href: ShellMenuHref;
  icon: LucideIcon;
  iconId: ShellMenuIcon;
  capability: ShellCapabilityId | readonly ShellCapabilityId[];
};

// Navigation is deliberately closed over server-authorized capabilities. Prototype
// routes without a policy capability stay out of the authenticated shell.
export const menus = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    iconId: "dashboard",
    capability: "dashboard:view",
  },
  {
    label: "Customers",
    href: "/customers",
    icon: Users,
    iconId: "customers",
    capability: "customers:view",
  },
  {
    label: "Customer Sales",
    href: "/pos",
    icon: ShoppingCart,
    iconId: "customer-sales",
    capability: "sales:post",
  },
  {
    label: "Receipt Verification",
    href: "/accounting/receipt-verification",
    icon: FileText,
    iconId: "receipt-verification",
   capability: "sales:verify:view",
  },
  {
    label: "Customer Orders",
    href: "/customer-orders",
    icon: ClipboardList,
    iconId: "customer-orders",
    capability: ["customer-orders:view", "sales:view"],
  },
  {
    label: "Products",
    href: "/products",
    icon: Package,
    iconId: "products",
    capability: "products:view",
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Boxes,
    iconId: "inventory",
    capability: "inventory:view",
  },
  {
    label: "Stock Transfers",
    href: "/stock-transfers",
    icon: ArrowLeftRight,
    iconId: "stock-transfers",
    capability: "stock-transfers:view",
  },
  {
    label: "Reports",
    href: "/reports",
    icon: FileText,
    iconId: "reports",
    capability: "reports:view",
  },
  {
    label: "Branch Maintenance",
    href: "/branches",
    icon: Building2,
    iconId: "branches",
    capability: "branches:view",
  },
  {
    label: "Role Maintenance",
    href: "/users/roles",
    icon: UserCog,
    iconId: "roles",
    capability: "roles:view",
  },
  {
    label: "User Management",
    href: "/users",
    icon: UserCog,
    iconId: "users",
    capability: "users:view",
  },
] as const satisfies readonly MenuDefinition[];
