import "server-only";

import { newId, run } from "@/server/db";
import { ApiError } from "@/server/errors";
import type { Interval } from "./plans";
import { isPersonalMode } from "../provider-settings";

/**
 * Billing sits behind this interface so a real payment provider can replace the demo one
 * without touching plan logic. There is no real provider in Hacksfield: the `demo` provider
 * approves every charge at once and writes a receipt. No card data exists anywhere.
 */

export interface ChargeRequest {
  userId: string;
  planId: string;
  interval: Interval;
  amountCents: number;
  description: string;
  periodStart: number;
  periodEnd: number;
}

export type ChargeResult = { ok: true; receiptId: string } | { ok: false; message: string };

export interface BillingProvider {
  id: string;
  charge(req: ChargeRequest): ChargeResult;
}

/** Approves at once. The receipt says "demo" so nobody mistakes it for a real payment. */
export const demoProvider: BillingProvider = {
  id: "demo",
  charge(req) {
    const id = newId("rcp");
    run(
      `INSERT INTO account_receipts (id, user_id, provider, reference, plan_id, interval, amount_cents, currency, description, status, period_start, period_end, created_at)
       VALUES (?, ?, 'demo', ?, ?, ?, ?, 'usd', ?, 'paid', ?, ?, ?)`,
      id,
      req.userId,
      newId("demo"),
      req.planId,
      req.interval,
      req.amountCents,
      req.description,
      req.periodStart,
      req.periodEnd,
      Date.now(),
    );
    return { ok: true, receiptId: id };
  },
};

export function demoBillingOn(): boolean {
  return !isPersonalMode() && process.env.PARALLAX_DEMO_BILLING !== "off";
}

/** The provider in use, or null when billing is closed. */
export function billingProvider(): BillingProvider | null {
  return demoBillingOn() ? demoProvider : null;
}

export function requireProvider(): BillingProvider {
  const p = billingProvider();
  if (!p) throw new ApiError(503, "billing_closed", "Plan changes are not open yet. Your current plan stays as it is.");
  return p;
}
