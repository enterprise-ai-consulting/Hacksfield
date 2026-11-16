import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { personalInstallation } from "@/config/installation";
import { InvitePage } from "@/components/account/invite-page";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = { title: "Invite friends" };

export default function Invite() {
  if (personalInstallation) redirect("/settings/provider");
  return (
    <AppShell>
      <InvitePage />
    </AppShell>
  );
}
