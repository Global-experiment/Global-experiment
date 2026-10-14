import { completenessLabel } from "../completeness";
import { PropertyRow } from "./RecordForm";

/**
 * Which required-for-completeness fields are still empty — live, from the
 * form as it's being edited (the list shows the saved state).
 */
export function CompletenessRow({ missing }: { missing: readonly string[] }) {
  return (
    <PropertyRow icon="check_box" label="Completeness">
      <span role="status" data-complete={missing.length === 0 ? "true" : "false"} className={`px-2 ${missing.length === 0 ? "" : "text-text-muted"}`}>
        {completenessLabel(missing)}
      </span>
    </PropertyRow>
  );
}
