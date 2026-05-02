import { z } from "zod";

export const adminStepUpSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export type AdminStepUpInput = z.infer<typeof adminStepUpSchema>;