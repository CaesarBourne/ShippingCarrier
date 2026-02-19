import { z } from "zod";

export const RateRequestSchema = z.object({
  shipFrom: z.any(),
  shipTo: z.any(),
  packages: z.array(z.any()).min(1),
});