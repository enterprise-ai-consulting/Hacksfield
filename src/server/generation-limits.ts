import "server-only";

import { planOf } from "@/config/economy";
import { isPersonalMode } from "./provider-settings";

/** Personal installations have one resource limit, independent of membership. */
export function generationPlan(planId: string) {
  return isPersonalMode() ? { id: "personal", name: "Personal", concurrency: 4 } : planOf(planId);
}
