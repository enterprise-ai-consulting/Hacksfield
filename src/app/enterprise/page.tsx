import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { personalInstallation } from "@/config/installation";
import { EnterprisePage } from "@/components/pricing/enterprise-page";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = { title: "Teams" };

export default function Enterprise() {
  if (personalInstallation) redirect("/settings/provider");
  return (
    <AppShell active="enterprise" nav="full" footer>
      <EnterprisePage />
    </AppShell>
  );
}
