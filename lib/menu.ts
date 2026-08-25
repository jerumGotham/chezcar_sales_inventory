import type {
  ShellCapabilityId,
  ShellMenuHref,
  ShellMenuIcon,
} from "./contracts/access";
import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  Package,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export type MenuDefinition = {
  label: string;
  href: ShellMenuHref;
  icon: LucideIcon;
  iconId: ShellMenuIcon;
  capability: ShellCapabilityId;
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
    label: "Customer Orders",
    href: "/customer-orders",
    icon: ClipboardList,
    iconId: "customer-orders",
    capability: "customer-orders:view",
  },
  {
    label: "User Management",
    href: "/users",
    icon: UserCog,
    iconId: "users",
    capability: "users:manage",
  },
] as const satisfies readonly MenuDefinition[];
