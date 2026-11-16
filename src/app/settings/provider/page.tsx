import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import { ProviderSettings } from "@/components/provider/settings";

export const metadata: Metadata = { title: "Generation settings" };
export default function Page() {
  return <AppShell><ProviderSettings /></AppShell>;
}
