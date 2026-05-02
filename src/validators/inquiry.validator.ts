/**
 * Inquiry Validators - Harsh Makeovers
 */

import { z } from "zod";
import { safeString } from "./helpers";

const inquiryTypeEnum = z.enum(["CONTACT", "CLASS", "LARGE_GROUP"]);
const inquiryStatusEnum = z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]);

const baseInquirySchema = z.object({
  inquiryType: inquiryTypeEnum,
  message: safeString({ min: 10, max: 2000 }),
});

export const createInquirySchema = z.discriminatedUnion("inquiryType", [
  baseInquirySchema.extend({
    inquiryType: z.literal("CONTACT"),
    subject: safeString({ min: 1, max: 200 }),
    category: safeString({ min: 1, max: 100 }),
    peopleCount: z.undefined().optional(),
  }),
  baseInquirySchema.extend({
    inquiryType: z.literal("CLASS"),
    subject: safeString({ min: 1, max: 200 }),
    category: safeString({ min: 1, max: 100 }),
    peopleCount: z.undefined().optional(),
  }),
  baseInquirySchema.extend({
    inquiryType: z.literal("LARGE_GROUP"),
    subject: safeString({ max: 200 }).optional(),
    category: safeString({ min: 1, max: 100 }),
    peopleCount: z
      .number()
      .int()
      .min(5, "Large group inquiries require at least 5 people")
      .max(100, "Maximum 100 people"),
  }),
]);

export const updateInquiryStatusSchema = z.object({
  status: inquiryStatusEnum,
});

export type CreateInquiryInput = z.infer<typeof createInquirySchema>;
