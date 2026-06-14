import { z } from "zod";

const nullableText = (max: number) =>
  z.preprocess(
    (value) => (value === undefined || value === "" ? null : value),
    z.string().trim().min(1).max(max).nullable(),
  );

const nullableNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (value) => (value === undefined || value === "" ? null : value),
    schema.nullable(),
  );

export const searchRequestSchema = z
  .object({
    productQuery: z.string().trim().min(2).max(200).optional(),
    query: z.string().trim().min(2).max(200).optional(),
    quantity: z.number().int().positive().max(2_147_483_647),
    targetCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
    language: z.enum(["en", "de", "sr"]).default("en"),
  })
  .strict()
  .superRefine((input, context) => {
    if (!input.productQuery && !input.query) {
      context.addIssue({
        code: "custom",
        path: ["productQuery"],
        message: "productQuery is required.",
      });
    }
  })
  .transform((input) => ({
    productQuery: input.productQuery ?? input.query ?? "",
    quantity: input.quantity,
    targetCountry: input.targetCountry,
    language: input.language,
  }));

export const supplierSearchResultSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    supplierName: z.string().trim().min(1).max(200),
    supplierCountry: nullableText(2).refine(
      (value) => value === null || /^[A-Z]{2}$/.test(value),
      "supplierCountry must be a two-letter code.",
    ),
    price: nullableNumber(z.number().nonnegative().finite()),
    currency: nullableText(3).refine(
      (value) => value === null || /^[A-Z]{3}$/.test(value),
      "currency must be a three-letter code.",
    ),
    minimumOrderQuantity: nullableNumber(z.number().int().positive()),
    incoterm: nullableText(20),
    productUrl: z.url().max(2_000),
    imageUrl: nullableText(2_000).refine(
      (value) => value === null || z.url().safeParse(value).success,
      "imageUrl must be a valid URL.",
    ),
    source: z.string().trim().min(1).max(100),
  })
  .strict()
  .superRefine((result, context) => {
    if ((result.price === null) !== (result.currency === null)) {
      context.addIssue({
        code: "custom",
        path: ["currency"],
        message: "price and currency must be provided together.",
      });
    }
  });

export const supplierSearchResultsSchema = z.array(supplierSearchResultSchema).max(100);

export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type SupplierSearchResult = z.infer<typeof supplierSearchResultSchema>;

export type SearchResponse = {
  results: SupplierSearchResult[];
  reason?: string;
};
