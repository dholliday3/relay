import type { z } from "zod";
import type {
  PlanFrontmatterSchema,
  CreatePlanInputSchema,
  PlanPatchSchema,
  PlanFiltersSchema,
} from "./plan-schema.js";

export type PlanFrontmatter = z.infer<typeof PlanFrontmatterSchema>;

export type Plan = PlanFrontmatter & {
  body: string;
  filePath: string;
};

export type CreatePlanInput = z.infer<typeof CreatePlanInputSchema>;

export type PlanPatch = z.infer<typeof PlanPatchSchema>;

export type PlanFilters = z.infer<typeof PlanFiltersSchema>;
