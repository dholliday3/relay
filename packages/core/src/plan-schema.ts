import { z } from "zod";

export const PlanStatusEnum = z.enum([
  "draft",
  "active",
  "completed",
  "archived",
]);

const lowercaseString = z
  .string()
  .refine((s) => s === s.toLowerCase(), "Tags must be lowercase");

export const PlanFrontmatterSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: PlanStatusEnum,
  created: z.coerce.date(),
  updated: z.coerce.date(),
  tags: z.array(lowercaseString).optional(),
  project: z.string().optional(),
  tickets: z.array(z.string()).optional(),
  refs: z.array(z.string()).optional(),
});

export const CreatePlanInputSchema = z.object({
  title: z.string().min(1),
  status: PlanStatusEnum.default("draft"),
  tags: z.array(lowercaseString).optional(),
  project: z.string().optional(),
  tickets: z.array(z.string()).optional(),
  refs: z.array(z.string()).optional(),
  body: z.string().optional(),
});

export const PlanPatchSchema = z.object({
  title: z.string().min(1).optional(),
  status: PlanStatusEnum.optional(),
  tags: z.array(lowercaseString).optional(),
  project: z.string().nullish(),
  tickets: z.array(z.string()).optional(),
  refs: z.array(z.string()).optional(),
  body: z.string().optional(),
});

export const PlanFiltersSchema = z.object({
  status: z.union([PlanStatusEnum, z.array(PlanStatusEnum)]).optional(),
  project: z.string().optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().optional(),
});
