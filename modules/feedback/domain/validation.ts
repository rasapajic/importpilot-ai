import {
  ProjectCompletionStatus,
  ProjectOutcomeType,
  RecommendationFeedbackVote,
} from "@prisma/client";
import { z } from "zod";

const optionalComment = z.string().trim().min(1).max(2000).optional();

export const projectOutcomeSchema = z
  .object({
    outcome: z.nativeEnum(ProjectOutcomeType),
    finalPrice: z.coerce.number().positive().max(999_999_999_999).optional(),
    finalCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
    purchaseSuccessful: z.boolean().optional(),
    comment: optionalComment,
  })
  .strict()
  .refine((input) => Boolean(input.finalPrice) === Boolean(input.finalCurrency), {
    message: "Konačna cena i valuta moraju biti navedene zajedno.",
  });

export const recommendationFeedbackSchema = z.object({
  vote: z.nativeEnum(RecommendationFeedbackVote),
  comment: optionalComment,
}).strict();

export const projectCompletionSchema = z.object({
  status: z.nativeEnum(ProjectCompletionStatus),
}).strict();
