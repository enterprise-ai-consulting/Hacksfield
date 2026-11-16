import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { personalInstallation } from "@/config/installation";
import { WalletPage } from "@/components/account/wallet-page";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = { title: "Wallet" };

export default function Wallet() {
  if (personalInstallation) redirect("/settings/provider");
  return (
    <AppShell>
      <WalletPage />
    </AppShell>
  );
}
