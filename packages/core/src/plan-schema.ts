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

function normalizeLegacyTaskLinkFields(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (record.tasks !== undefined || record.tasks === undefined) return value;
  return { ...record, tasks: record.tasks };
}

export const PlanFrontmatterSchema = z.preprocess(
  normalizeLegacyTaskLinkFields,
  z.object({
    id: z.string(),
    title: z.string(),
    status: PlanStatusEnum,
    created: z.coerce.date(),
    updated: z.coerce.date(),
    tags: z.array(lowercaseString).optional(),
    project: z.string().optional(),
    tasks: z.array(z.string()).optional(),
    assignee: z.string().optional(),
    createdBy: z.string().optional(),
    refs: z.array(z.string()).optional(),
  }),
);

export const CreatePlanInputSchema = z.preprocess(
  normalizeLegacyTaskLinkFields,
  z.object({
    title: z.string().min(1),
    status: PlanStatusEnum.default("draft"),
    tags: z.array(lowercaseString).optional(),
    project: z.string().optional(),
    tasks: z.array(z.string()).optional(),
    assignee: z.string().optional(),
    createdBy: z.string().optional(),
    refs: z.array(z.string()).optional(),
    body: z.string().optional(),
  }),
);

export const PlanPatchSchema = z.preprocess(
  normalizeLegacyTaskLinkFields,
  z.object({
    title: z.string().min(1).optional(),
    status: PlanStatusEnum.optional(),
    tags: z.array(lowercaseString).optional(),
    project: z.string().nullish(),
    tasks: z.array(z.string()).optional(),
    assignee: z.string().nullish(),
    createdBy: z.string().nullish(),
    refs: z.array(z.string()).optional(),
    body: z.string().optional(),
  }),
);

export const PlanFiltersSchema = z.object({
  status: z.union([PlanStatusEnum, z.array(PlanStatusEnum)]).optional(),
  project: z.string().optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().optional(),
});
