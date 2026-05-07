import { z } from "zod";

const lowercaseString = z
  .string()
  .refine((s) => s === s.toLowerCase(), "Tags must be lowercase");

// Short scannable summary in YAML frontmatter (agent-skill convention).
// Body holds full content; description is the at-a-glance line.
const descriptionField = z.string().max(500);

export const DocFrontmatterSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: descriptionField.optional(),
  created: z.coerce.date(),
  updated: z.coerce.date(),
  tags: z.array(lowercaseString).optional(),
  project: z.string().optional(),
  createdBy: z.string().optional(),
  refs: z.array(z.string()).optional(),
});

export const CreateDocInputSchema = z.object({
  title: z.string().min(1),
  description: descriptionField.optional(),
  tags: z.array(lowercaseString).optional(),
  project: z.string().optional(),
  createdBy: z.string().optional(),
  refs: z.array(z.string()).optional(),
  body: z.string().optional(),
});

export const DocPatchSchema = z.object({
  title: z.string().min(1).optional(),
  description: descriptionField.nullish(),
  tags: z.array(lowercaseString).optional(),
  project: z.string().nullish(),
  createdBy: z.string().nullish(),
  refs: z.array(z.string()).optional(),
  body: z.string().optional(),
});

export const DocFiltersSchema = z.object({
  project: z.string().optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().optional(),
});
