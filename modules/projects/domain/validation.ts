import { ProjectCompletionStatus, ProjectStatus } from "@prisma/client";
import { z } from "zod";
import { normalizeTargetCountryCode } from "../../i18n/country-names";

const targetCountrySchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/)
  .transform(normalizeTargetCountryCode);

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(160),
  targetCountry: targetCountrySchema,
  quantity: z.coerce.number().int().positive().max(2_147_483_647),
  targetMargin: z.coerce.number().min(0).max(100),
});

export const listProjectsSchema = z.object({
  search: z.string().trim().max(160).default(""),
  status: z.nativeEnum(ProjectStatus).optional(),
  completionStatus: z.nativeEnum(ProjectCompletionStatus).optional(),
  targetCountry: targetCountrySchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
