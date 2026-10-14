"use client";

import { useState } from "react";
import type { TreasuryOverview } from "@/shared/config/publicApi";
import { Button } from "@/shared/ui/Button";
import { Checkbox } from "@/shared/ui/Checkbox";
import { SHEET_BLEED, Sheet } from "@/shared/ui/Sheet";
import { TREASURY_COPY } from "./copy";
import { formatEntryDay } from "./format";
import { DATE_PRESETS, matchingPreset, presetRange, type DatePreset, type TreasuryCurrencyChoice, type TreasuryState } from "./treasuryParams";

const copy = TREASURY_COPY.filter;
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary";
const rowClasses = `${SHEET_BLEED} flex min-h-10 items-center border-b border-line`;

type Panel = "main" | "date" | "currency" | "expenseType";
type Changes = Partial<Pick<TreasuryState, "type" | "currency" | "from" | "to" | "expenseTypes">>;

interface TreasuryFilterSheetProps {
  open: boolean;
  onClose: () => void;
  state: TreasuryState;
  /** Values with public data (from the overview); null when unavailable — then only the type filter shows. */
  options: TreasuryOverview["filters"] | null;
  /** "YYYY-MM-DD" in Zurich, for the date presets. */
  today: string;
  onChange: (changes: Changes) => void;
  onErase: () => void;
}

/**
 * "Filter" (Common pages p14): Donations / Expenses checkboxes, then one row
 * per filter with its current value on the right, each opening its own
 * panel ("← Filter dates", p16 pattern) with Reset and "Apply filter". Only
 * filters with real data are offered — Location, Expertise and Amount are
 * not Treasury data; a row whose values are empty is left out.
 * The checkboxes apply at once; a panel applies on "Apply filter".
 */
export function TreasuryFilterSheet({ open, onClose, state, options, today, onChange, onErase }: TreasuryFilterSheetProps) {
  const [panel, setPanel] = useState<Panel>("main");
  // A panel edits a draft; "Apply filter" applies it, Reset (header) clears it, Back drops it.
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [draftKeys, setDraftKeys] = useState<string[]>([]);
  const openPanel = (next: Exclude<Panel, "main">) => {
    setDraftFrom(state.from ?? "");
    setDraftTo(state.to ?? "");
    setDraftKeys(next === "currency" ? [state.currency] : next === "expenseType" ? state.expenseTypes : []);
    setPanel(next);
  };
  const reset = () => {
    setDraftFrom("");
    setDraftTo("");
    setDraftKeys(panel === "currency" ? ["all"] : []);
  };
  const close = () => {
    setPanel("main");
    onClose();
  };
  const back = () => setPanel("main");
  const apply = (changes: Changes) => {
    onChange(changes);
    setPanel("main");
  };

  const donations = state.type !== "expense";
  const expenses = state.type !== "donation";
  // Unchecking one leaves the other; the last one checked stays (an empty history filter means nothing).
  const toggle = (kind: "donation" | "expense") => {
    const keep = { donation: kind === "donation" ? !donations : donations, expense: kind === "expense" ? !expenses : expenses };
    onChange({ type: keep.donation && keep.expense ? null : keep.donation ? "donation" : "expense" });
  };

  const titles: Record<Panel, string> = { main: copy.title, date: copy.dateTitle, currency: copy.currencyTitle, expenseType: copy.expenseTypeTitle };
  const hasDates = Boolean(options?.firstDate);
  // The header's currency switch, also here (one value: the stats and the history follow it).
  const currencyChoices = ["all", ...new Set([...(options?.currencies ?? []), ...(state.currency === "all" ? [] : [state.currency])])];
  const expenseTypes = options?.expenseTypes ?? [];

  return (
    <Sheet
      open={open}
      onClose={close}
      title={titles[panel]}
      onBack={panel === "main" ? undefined : back}
      headerAction={
        <button type="button" onClick={panel === "main" ? onErase : reset} className={`cursor-pointer rounded-control px-1 text-body font-bold ${focusRing}`}>
          {panel === "main" ? copy.erase : copy.reset}
        </button>
      }
    >
      {panel === "main" ? (
        <ul>
          <li className={rowClasses}>
            <Checkbox checked={donations} onChange={() => toggle("donation")} disabled={donations && !expenses} label={copy.donations} className="w-full py-2.5 [&_span]:font-bold" />
          </li>
          <li className={rowClasses}>
            <Checkbox checked={expenses} onChange={() => toggle("expense")} disabled={expenses && !donations} label={copy.expenses} className="w-full py-2.5 [&_span]:font-bold" />
          </li>
          {hasDates ? <PanelRow label={copy.date} value={dateSummary(state, today)} onOpen={() => openPanel("date")} /> : null}
          <PanelRow label={copy.currency} value={copy.currencyNames[state.currency] ?? state.currency} onOpen={() => openPanel("currency")} />
          {expenseTypes.length > 0 ? (
            <PanelRow
              label={copy.expenseType}
              value={state.expenseTypes.length > 0 ? expenseTypes.filter((type) => state.expenseTypes.includes(type.key)).map((type) => type.label).join(", ") || copy.all : copy.all}
              onOpen={() => openPanel("expenseType")}
            />
          ) : null}
        </ul>
      ) : null}

      {panel === "date" ? (
        <DatePanel from={draftFrom} to={draftTo} setFrom={setDraftFrom} setTo={setDraftTo} today={today} onApply={() => apply({ from: draftFrom || null, to: draftTo || null })} />
      ) : null}
      {panel === "currency" ? (
        <ChoicePanel
          single
          options={currencyChoices.map((code) => ({ key: code, label: copy.currencyNames[code] ?? code }))}
          draft={draftKeys}
          setDraft={setDraftKeys}
          onApply={(keys) => apply({ currency: (keys[0] ?? "all") as TreasuryCurrencyChoice })}
        />
      ) : null}
      {panel === "expenseType" ? (
        <ChoicePanel options={expenseTypes} draft={draftKeys} setDraft={setDraftKeys} onApply={(keys) => apply({ expenseTypes: keys })} />
      ) : null}
    </Sheet>
  );
}

function PanelRow({ label, value, onOpen }: { label: string; value: string; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`${rowClasses} w-[calc(100%+2*var(--sheet-pad))] cursor-pointer justify-between gap-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-text-primary`}
      >
        <span className="text-body text-text-primary">{label}</span>
        <span className="min-w-0 truncate text-meta text-text-muted">{value}</span>
      </button>
    </li>
  );
}

/** The Date row's value: a preset's name, a range, or "All". */
export function dateSummary(state: Pick<TreasuryState, "from" | "to">, today: string): string {
  const preset = matchingPreset(state.from, state.to, today);
  if (preset) return copy.presets[preset];
  const day = (date: string) => formatEntryDay({ occurredOn: date, occurredAt: null });
  if (state.from && state.to) return `${day(state.from)} – ${day(state.to)}`;
  if (state.from) return copy.rangeFrom(day(state.from));
  if (state.to) return copy.rangeTo(day(state.to));
  return copy.all;
}

/** p16: preset pills, the two dates, "Apply filter". */
function DatePanel({
  from,
  to,
  setFrom,
  setTo,
  today,
  onApply,
}: {
  from: string;
  to: string;
  setFrom: (value: string) => void;
  setTo: (value: string) => void;
  today: string;
  onApply: () => void;
}) {
  const active = matchingPreset(from || null, to || null, today);
  const invalid = Boolean(from && to && from > to);
  const choose = (preset: DatePreset) => {
    const range = presetRange(preset, today);
    setFrom(range.from ?? "");
    setTo(range.to ?? "");
  };
  return (
    <div className="pt-2">
      <div className="flex flex-wrap gap-2">
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => choose(preset)}
            aria-pressed={active === preset}
            className={`h-8 cursor-pointer rounded-full border px-[calc(var(--spacing-gutter)-1px)] text-meta ${focusRing} ${
              active === preset ? "border-inverse-surface bg-inverse-surface text-inverse-content" : "border-line text-text-primary"
            }`}
          >
            {copy.presets[preset]}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="flex flex-col">
          <span className="sr-only">{copy.from}</span>
          <input
            type="date"
            value={from}
            max={to || today}
            onChange={(event) => setFrom(event.target.value)}
            aria-invalid={invalid}
            className={`h-10 rounded-control border border-line bg-surface-base px-2 text-body text-text-primary [color-scheme:inherit] ${focusRing}`}
          />
        </label>
        <label className="flex flex-col">
          <span className="sr-only">{copy.to}</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            max={today}
            onChange={(event) => setTo(event.target.value)}
            aria-invalid={invalid}
            className={`h-10 rounded-control border border-line bg-surface-base px-2 text-body text-text-primary [color-scheme:inherit] ${focusRing}`}
          />
        </label>
      </div>
      {invalid ? (
        <p role="alert" className="mt-2 text-meta text-text-primary">
          {copy.invalidRange}
        </p>
      ) : null}
      {invalid ? (
        <Button variant="primary" fullWidth className="mt-4" disabled>
          {copy.apply}
        </Button>
      ) : (
        <Button variant="primary" fullWidth className="mt-4" onClick={onApply}>
          {copy.apply}
        </Button>
      )}
    </div>
  );
}

/** A list of checkboxes (expense types; none checked = all), or of single choices (`single`: the currency). */
function ChoicePanel({
  options,
  draft,
  setDraft,
  onApply,
  single = false,
}: {
  options: { key: string; label: string }[];
  draft: string[];
  setDraft: (keys: string[]) => void;
  onApply: (keys: string[]) => void;
  single?: boolean;
}) {
  const toggle = (key: string) =>
    setDraft(single ? [key] : draft.includes(key) ? draft.filter((value) => value !== key) : [...draft, key]);
  return (
    <div>
      <ul>
        {options.map((option) => (
          <li key={option.key} className={rowClasses}>
            {single ? (
              <label className="flex w-full cursor-pointer items-center gap-2 py-2.5 text-body text-text-primary">
                <input
                  type="radio"
                  name="treasury-currency"
                  checked={draft.includes(option.key)}
                  onChange={() => toggle(option.key)}
                  className={`h-4 w-4 shrink-0 cursor-pointer accent-current ${focusRing}`}
                />
                {option.label}
              </label>
            ) : (
              <Checkbox checked={draft.includes(option.key)} onChange={() => toggle(option.key)} label={option.label} className="w-full py-2.5" />
            )}
          </li>
        ))}
      </ul>
      <Button variant="primary" fullWidth className="mt-4" onClick={() => onApply(options.map((option) => option.key).filter((key) => draft.includes(key)))}>
        {copy.apply}
      </Button>
    </div>
  );
}
