import { redirect } from "next/navigation";

export default function InventoryTransferRedirect() {
  redirect("/stock-transfers");
}
