import { z } from "zod";

const provider = z.string().trim().min(1).max(40);
const providerId = z.string().trim().min(1).max(200);
const organizationId = z.string().uuid();
const projectId = z.string().uuid();
const paidPlan = z.enum(["PLUS", "PRO"]);

const base = {
  provider,
  eventId: providerId,
};

export const billingEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("SUBSCRIPTION_ACTIVE"),
    organizationId,
    plan: paidPlan,
    providerCustomerId: providerId.nullable().optional(),
    providerSubscriptionId: providerId,
    currentPeriodStart: z.coerce.date().nullable().optional(),
    currentPeriodEnd: z.coerce.date().nullable().optional(),
    cancelAtPeriodEnd: z.boolean().optional(),
  }).strict(),
  z.object({
    ...base,
    type: z.literal("SUBSCRIPTION_CANCEL_AT_PERIOD_END"),
    organizationId,
    providerSubscriptionId: providerId,
    currentPeriodEnd: z.coerce.date().nullable().optional(),
  }).strict(),
  z.object({
    ...base,
    type: z.literal("SUBSCRIPTION_ENDED"),
    organizationId,
    providerSubscriptionId: providerId,
  }).strict(),
  z.object({
    ...base,
    type: z.literal("FULL_IMPORT_ANALYSIS_PAID"),
    organizationId,
    projectId,
    providerCheckoutId: providerId.nullable().optional(),
    providerPaymentId: providerId,
    amountEurCents: z.number().int().positive(),
    currency: z.literal("EUR"),
  }).strict(),
  z.object({
    ...base,
    type: z.literal("FULL_IMPORT_ANALYSIS_REFUNDED"),
    providerPaymentId: providerId,
  }).strict(),
]);

export type BillingEvent = z.infer<typeof billingEventSchema>;
export type PaidSubscriptionPlan = z.infer<typeof paidPlan>;
