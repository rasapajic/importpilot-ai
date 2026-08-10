import { z } from "zod";

import { supplierOfferSearchResultSchema } from "../../product-search/domain/search";
import { createProjectSchema } from "./validation";

export const createProjectFromUrlRequestSchema = z.object({
  project: createProjectSchema,
  offer: supplierOfferSearchResultSchema,
}).strict();

export type CreateProjectFromUrlRequest = z.infer<
  typeof createProjectFromUrlRequestSchema
>;
