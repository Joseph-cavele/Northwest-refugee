import { z } from 'zod';

export const spendQuerySchema = z.object({
  // 'YYYY-MM'. Defaults to the current month in the service.
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a period of the form YYYY-MM')
    .optional(),
});
