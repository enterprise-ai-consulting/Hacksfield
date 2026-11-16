import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { personalInstallation } from "@/config/installation";
import { PricingPage } from "@/components/pricing/pricing-page";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = { title: "Pricing" };

export default function Pricing() {
  if (personalInstallation) redirect("/settings/provider");
  return (
    <AppShell active="pricing" nav="full" footer>
      <PricingPage />
    </AppShell>
  );
}
