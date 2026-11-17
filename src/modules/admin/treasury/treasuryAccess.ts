/**
 * Whether the record page offers Archive / Restore for a Treasury entry: treasury.update, and also
 * treasury.publish when the entry is published, since archiving or restoring it changes the public
 * Treasury (OPS-158). The API checks the same rule.
 */
export function canArchiveEntry({ canUpdate, canPublish, published }: { canUpdate: boolean; canPublish: boolean; published: boolean }): boolean {
  return canUpdate && (!published || canPublish);
}
