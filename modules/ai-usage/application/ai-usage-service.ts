import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "../../../lib/database/prisma";
import {
  aiUsageEventsSchema,
  type AiUsageEvent,
} from "../domain/ai-usage";

type RecordAiUsageInput = {
  organizationId: string;
  projectId?: string | null;
  events: AiUsageEvent[];
};

type AiUsageSummaryInput = {
  organizationId: string;
  projectId?: string;
  from?: Date;
  to?: Date;
};

type TotalRow = {
  request_count: bigint;
  input_tokens: bigint;
  cached_input_tokens: bigint;
  output_tokens: bigint;
  total_tokens: bigint;
  web_search_calls: bigint;
  estimated_total_cost_usd: string;
};

type GroupRow = {
  operation: string;
  model: string;
  request_count: bigint;
  total_tokens: bigint;
  web_search_calls: bigint;
  estimated_total_cost_usd: string;
};

function decimal(value: number) {
  return new Prisma.Decimal(value.toFixed(12));
}

export async function recordAiUsageEvents({
  organizationId,
  projectId = null,
  events,
}: RecordAiUsageInput) {
  const parsed = aiUsageEventsSchema.parse(events);
  let inserted = 0;

  for (const event of parsed) {
    inserted += await prisma.$executeRaw`
      INSERT INTO "ai_usage_events" (
        "id",
        "organization_id",
        "project_id",
        "provider",
        "operation",
        "model",
        "response_id",
        "status",
        "input_tokens",
        "cached_input_tokens",
        "output_tokens",
        "reasoning_output_tokens",
        "total_tokens",
        "web_search_calls",
        "duration_ms",
        "currency",
        "pricing_version",
        "input_price_per_million_usd",
        "cached_input_price_per_million_usd",
        "output_price_per_million_usd",
        "web_search_price_per_call_usd",
        "input_cost_usd",
        "cached_input_cost_usd",
        "output_cost_usd",
        "web_search_cost_usd",
        "estimated_total_cost_usd",
        "estimated"
      ) VALUES (
        CAST(${randomUUID()} AS UUID),
        CAST(${organizationId} AS UUID),
        ${projectId ? Prisma.sql`CAST(${projectId} AS UUID)` : Prisma.sql`NULL`},
        ${event.provider},
        ${event.operation},
        ${event.model},
        ${event.responseId},
        ${event.status},
        ${event.inputTokens},
        ${event.cachedInputTokens},
        ${event.outputTokens},
        ${event.reasoningOutputTokens},
        ${event.totalTokens},
        ${event.webSearchCalls},
        ${event.durationMs},
        ${event.currency},
        ${event.pricingVersion},
        ${decimal(event.inputPricePerMillionUsd)},
        ${decimal(event.cachedInputPricePerMillionUsd)},
        ${decimal(event.outputPricePerMillionUsd)},
        ${decimal(event.webSearchPricePerCallUsd)},
        ${decimal(event.inputCostUsd)},
        ${decimal(event.cachedInputCostUsd)},
        ${decimal(event.outputCostUsd)},
        ${decimal(event.webSearchCostUsd)},
        ${decimal(event.estimatedTotalCostUsd)},
        ${event.estimated}
      )
      ON CONFLICT ("provider", "response_id") DO NOTHING
    `;
  }

  return { received: parsed.length, inserted };
}

function usageWhere({ organizationId, projectId, from, to }: AiUsageSummaryInput) {
  const filters: Prisma.Sql[] = [
    Prisma.sql`"organization_id" = CAST(${organizationId} AS UUID)`,
  ];
  if (projectId) {
    filters.push(Prisma.sql`"project_id" = CAST(${projectId} AS UUID)`);
  }
  if (from) filters.push(Prisma.sql`"created_at" >= ${from}`);
  if (to) filters.push(Prisma.sql`"created_at" < ${to}`);
  return Prisma.join(filters, " AND ");
}

function number(value: bigint) {
  return Number(value);
}

export async function getAiUsageSummary(input: AiUsageSummaryInput) {
  const where = usageWhere(input);
  const [totals] = await prisma.$queryRaw<TotalRow[]>(Prisma.sql`
    SELECT
      COUNT(*)::bigint AS "request_count",
      COALESCE(SUM("input_tokens"), 0)::bigint AS "input_tokens",
      COALESCE(SUM("cached_input_tokens"), 0)::bigint AS "cached_input_tokens",
      COALESCE(SUM("output_tokens"), 0)::bigint AS "output_tokens",
      COALESCE(SUM("total_tokens"), 0)::bigint AS "total_tokens",
      COALESCE(SUM("web_search_calls"), 0)::bigint AS "web_search_calls",
      COALESCE(SUM("estimated_total_cost_usd"), 0)::text AS "estimated_total_cost_usd"
    FROM "ai_usage_events"
    WHERE ${where}
  `);

  const groups = await prisma.$queryRaw<GroupRow[]>(Prisma.sql`
    SELECT
      "operation",
      "model",
      COUNT(*)::bigint AS "request_count",
      COALESCE(SUM("total_tokens"), 0)::bigint AS "total_tokens",
      COALESCE(SUM("web_search_calls"), 0)::bigint AS "web_search_calls",
      COALESCE(SUM("estimated_total_cost_usd"), 0)::text AS "estimated_total_cost_usd"
    FROM "ai_usage_events"
    WHERE ${where}
    GROUP BY "operation", "model"
    ORDER BY SUM("estimated_total_cost_usd") DESC, "operation", "model"
  `);

  return {
    currency: "USD",
    estimated: true,
    totals: {
      requests: number(totals?.request_count ?? 0n),
      inputTokens: number(totals?.input_tokens ?? 0n),
      cachedInputTokens: number(totals?.cached_input_tokens ?? 0n),
      outputTokens: number(totals?.output_tokens ?? 0n),
      totalTokens: number(totals?.total_tokens ?? 0n),
      webSearchCalls: number(totals?.web_search_calls ?? 0n),
      estimatedTotalCostUsd: totals?.estimated_total_cost_usd ?? "0",
    },
    byOperationAndModel: groups.map((group) => ({
      operation: group.operation,
      model: group.model,
      requests: number(group.request_count),
      totalTokens: number(group.total_tokens),
      webSearchCalls: number(group.web_search_calls),
      estimatedTotalCostUsd: group.estimated_total_cost_usd,
    })),
  };
}
