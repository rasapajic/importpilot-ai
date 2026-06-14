import { z } from "zod";

export const negotiationToneSchema = z.object({
  tone: z.enum(["FORMAL", "DIRECT", "FRIENDLY"]),
}).strict();

