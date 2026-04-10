import type { z } from "zod";
import type {
  DocFrontmatterSchema,
  CreateDocInputSchema,
  DocPatchSchema,
  DocFiltersSchema,
} from "./doc-schema.js";

export type DocFrontmatter = z.infer<typeof DocFrontmatterSchema>;

export type Doc = DocFrontmatter & {
  body: string;
  filePath: string;
};

export type CreateDocInput = z.infer<typeof CreateDocInputSchema>;

export type DocPatch = z.infer<typeof DocPatchSchema>;

export type DocFilters = z.infer<typeof DocFiltersSchema>;
