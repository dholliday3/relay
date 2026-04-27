/**
 * Compose a final list-of-strings from existing values plus four CLI knobs:
 * replace (full set), add (delta), remove (delta), clear (wipe to []).
 *
 * Used identically by task / plan / doc update handlers for fields
 * that are arrays in frontmatter (tags, blockedBy, relatedTo, tasks,
 * refs). The pattern is the same everywhere; this is the single place
 * the "no ops specified means leave the field alone" semantics live.
 *
 * Returns:
 *   - `[]` when `clear` is set
 *   - the composed list when any of replace/add/remove was specified
 *   - `undefined` when nothing was specified — signals "don't touch
 *     this field" to the caller, which it translates into omitting
 *     the field from the patch object
 */
export function applyListOps(
  existing: string[] | undefined,
  ops: {
    replace?: string[];
    add: string[];
    remove: string[];
    clear: boolean;
  },
): string[] | undefined {
  if (ops.clear) return [];
  let base: string[];
  if (ops.replace !== undefined) {
    base = [...ops.replace];
  } else {
    base = existing ? [...existing] : [];
  }
  for (const a of ops.add) {
    if (!base.includes(a)) base.push(a);
  }
  if (ops.remove.length > 0) {
    base = base.filter((v) => !ops.remove.includes(v));
  }
  const noOps =
    ops.replace === undefined &&
    ops.add.length === 0 &&
    ops.remove.length === 0 &&
    !ops.clear;
  if (noOps) return undefined;
  return base;
}
