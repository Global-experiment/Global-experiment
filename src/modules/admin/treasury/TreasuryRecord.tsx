"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { formatDateOnly } from "@/shared/format/dates";
import { Timestamp } from "@/shared/format/Timestamp";
import { adminApi, AdminApiError } from "../api/client";
import { formatEntryNumber, type RecordHistory, type TreasuryEntry, type TreasuryOptions } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { RecordMeta } from "../record/RecordMeta";
import { RecordPage } from "../record/RecordPage";
import { AdminIcon } from "../ui/adminIcons";
import { AdminButton, focusRing, StatusMessage } from "../ui/controls";
import { AutoGrowTextarea, DateField, invalidProps, PanelButton, Pills, PropertyRow, recordInput } from "../ui/RecordForm";
import { RelationPicker, type RelationOption } from "../ui/RelationPicker";
import { useCan } from "../session";
import { useFieldValidation } from "../ui/fieldValidation";
import { useToast } from "../ui/Toast";
import { parseAmount, recipientFromOption, recipientOption, searchRecipients, searchTypes, toAmountText, typeOption } from "./expenseFields";
import { CADENCE_LABEL, formatMoney, modeLabel, publicationLabel, SOURCE_LABEL, TYPE_LABEL } from "./treasuryDisplay";

/** A value the admin can't change here: plain text, no field ring (only editable values look like fields). */
function ReadOnly({ children }: { children: ReactNode }) {
  return <span className="flex min-h-8 items-center px-2 break-words text-text-primary">{children ?? <span className="text-text-muted">—</span>}</span>;
}

/** What "Submit changes" saves on an entry: the note and the review, and an expense's business fields (OPS-155). */
interface Draft {
  internalNote: string;
  reviewStatus: string;
  recipient: RelationOption[];
  expenseTypes: RelationOption[];
  name: string;
  publicDescription: string;
  occurredOn: string;
  amount: string;
  fee: string;
  cadence: string;
}

const ERROR_FIELDS = ["name", "occurredOn", "amount", "fee", "recipient", "expenseTypes", "publicDescription", "reviewStatus"] as const;
type ErrorField = (typeof ERROR_FIELDS)[number];
type FieldErrors = Partial<Record<ErrorField, string>>;
const isErrorField = (field: string): field is ErrorField => (ERROR_FIELDS as readonly string[]).includes(field);
/** The fields the page checks itself (OPS-70: when left, then live), in the form's order. */
const CHECKED = ["name", "occurredOn", "amount", "fee"] as const;
type CheckedField = (typeof CHECKED)[number];
const FIELD_IDS: Record<CheckedField, string> = { name: "treasury-name", occurredOn: "treasury-date", amount: "treasury-amount", fee: "treasury-fee" };

const REVIEWED = new Set(["qualified", "not_required"]);
const CADENCES = ["one_off", "monthly", "yearly"].map((value) => ({ value, label: CADENCE_LABEL[value]! }));
/** The API's field names → this page's. */
const ISSUE_FIELD: Record<string, ErrorField> = { grossAmount: "amount", feeAmount: "fee" };

const message = (caught: unknown, fallback: string) => (caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : fallback);

/**
 * /admin/treasury/[id] — one ledger entry on the record page (prototype
 * p14's panel and history; the Treasury has no frame of its own).
 *
 * Data ownership (overview §2.1) decides what can change:
 * - the Treasury is edited here only (decision of 2026-10-23: no import, no
 *   export); expenses copied from Notion earlier are ordinary entries;
 * - an expense (OPS-155): Recipient, Expense types, Name, Public description
 *   and Review status first, then the rest; every business field is
 *   editable by the Rootadmin (treasury.manage), the net worked out by the
 *   API; other roles keep the internal note and the review;
 * - Stripe entries: amounts and dates come from Stripe; only the internal
 *   note, the review and the publication change here;
 * - "Submit changes" saves everything together (one History event); publish
 *   and unpublish are explicit panel actions, offered only when the API's
 *   rules and settings allow them.
 *
 * No supporting documents (OPS-155, ADR 021): accountants keep them outside
 * the platform.
 */
export function TreasuryRecord({ id }: { id: string }) {
  const toast = useToast();
  const canUpdate = useCan("treasury.update");
  const canReview = useCan("treasury.review");
  const canPublish = useCan("treasury.publish");
  const canManage = useCan("treasury.manage");
  const entry = useAdminData<TreasuryEntry>(`/treasury/${id}`);
  const options = useAdminData<TreasuryOptions>("/treasury/options");
  const history = useAdminData<RecordHistory>(`/history/treasury_entry/${id}`);
  const [edit, setEdit] = useState<{ version: string; draft: Draft } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The API's field messages after a refused save; the page's own come from the validation below.
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const validation = useFieldValidation(CHECKED, (field) => FIELD_IDS[field]);

  if (entry.error || !entry.data) {
    return (
      <RecordPage backHref="/admin/treasury/manage" backLabel="Treasury" title="">
        {entry.error ? (
          <div>
            <StatusMessage tone="error">{entry.error.status === 404 ? "This Treasury entry doesn’t exist." : entry.error.message}</StatusMessage>
            {entry.error.status !== 404 ? <AdminButton onClick={entry.reload}>Retry</AdminButton> : null}
          </div>
        ) : (
          <StatusMessage>Loading entry…</StatusMessage>
        )}
      </RecordPage>
    );
  }

  const loaded = entry.data;
  const isExpense = loaded.type === "expense";
  const editsExpense = canManage && loaded.permissions.editExpense;
  const version = `${loaded.id}@${loaded.updatedAt}@${loaded.archivedAt}`;
  const base: Draft = {
    internalNote: loaded.internalNote ?? "",
    reviewStatus: loaded.review.key,
    recipient: loaded.recipient ? [recipientOption(loaded.recipient)] : [],
    expenseTypes: loaded.expenseTypes.map(typeOption),
    name: loaded.name,
    publicDescription: loaded.publicDescription ?? "",
    occurredOn: loaded.occurredOn,
    amount: toAmountText(loaded.grossAmount),
    fee: toAmountText(loaded.feeAmount),
    cadence: loaded.cadence,
  };
  const draft = edit?.version === version ? edit.draft : base;
  const hasRecipient = (editsExpense ? draft.recipient.length : loaded.recipient ? 1 : 0) > 0;
  // What the entry allows (the API's rules), narrowed to what the role allows; Qualified and Not required need a recipient.
  const permissions = {
    ...loaded.permissions,
    editInternalNote: loaded.permissions.editInternalNote && canUpdate,
    review: canReview
      ? { ...loaded.permissions.review, options: loaded.permissions.review.options.filter((option) => hasRecipient || !REVIEWED.has(option.key)) }
      : { ...loaded.permissions.review, allowed: false, reason: "Your role can't review expenses." },
  };

  const amount = parseAmount(draft.amount, { allowEmpty: false });
  const fee = parseAmount(draft.fee, { allowEmpty: true });
  const patch: Record<string, unknown> = {};
  if (permissions.editInternalNote && draft.internalNote.trim() !== base.internalNote.trim()) patch.internalNote = draft.internalNote;
  if (permissions.review.allowed && draft.reviewStatus !== base.reviewStatus) patch.reviewStatus = draft.reviewStatus;
  if (editsExpense) {
    if ((draft.recipient[0]?.id ?? null) !== (base.recipient[0]?.id ?? null)) patch.recipient = recipientFromOption(draft.recipient[0]);
    const keys = (selected: RelationOption[]) => selected.map((option) => option.id);
    if ([...keys(draft.expenseTypes)].sort().join() !== [...keys(base.expenseTypes)].sort().join()) patch.expenseTypes = keys(draft.expenseTypes);
    if (draft.name.trim() !== base.name.trim()) patch.name = draft.name;
    if (draft.publicDescription.trim() !== base.publicDescription.trim()) patch.publicDescription = draft.publicDescription;
    if (draft.occurredOn !== base.occurredOn) patch.occurredOn = draft.occurredOn;
    if (draft.amount !== base.amount) patch.grossAmount = "minor" in amount && amount.minor !== null ? -amount.minor : draft.amount;
    if (draft.fee !== base.fee) patch.feeAmount = "minor" in fee ? fee.minor : draft.fee;
    if (draft.cadence !== base.cadence) patch.cadence = draft.cadence;
  }
  const dirty = Object.keys(patch).length > 0;
  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => {
    setEdit({ version, draft: { ...draft, [key]: value } });
    if (isErrorField(key)) setFieldErrors((errors) => ({ ...errors, [key]: undefined }));
    // A date is chosen, not typed: picking one counts as leaving the field.
    if (key === "occurredOn") validation.leave("occurredOn");
  };
  const number = formatEntryNumber(loaded.number);

  /** What the page can tell before asking the API (the API checks everything again). */
  function check(): Partial<Record<CheckedField, string>> {
    const errors: Partial<Record<CheckedField, string>> = {};
    if (!editsExpense) return errors;
    if (!draft.name.trim()) errors.name = "Give the entry a name.";
    if (!draft.occurredOn) errors.occurredOn = "Choose a date.";
    if ("error" in amount) errors.amount = amount.error;
    else if (amount.minor === 0) errors.amount = "An expense's amount is money out: above zero here.";
    if ("error" in fee) errors.fee = fee.error;
    return errors;
  }

  const shownErrors: FieldErrors = { ...fieldErrors, ...validation.shown(check()) };

  async function submit(): Promise<boolean> {
    if (!validation.checkAll(check())) return false;
    setBusy("saving");
    setError(null);
    try {
      await adminApi(`/treasury/${id}`, { method: "PATCH", body: patch });
      toast("Treasury entry updated");
      return true;
    } catch (caught) {
      // A field's message goes under the field; anything else above the form.
      const issue = caught instanceof AdminApiError ? caught.issues[0] : undefined;
      const field = issue ? (ISSUE_FIELD[issue.path] ?? issue.path) : "";
      if (issue && isErrorField(field)) setFieldErrors({ [field]: issue.message });
      else setError(message(caught, "Couldn't save."));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function run(label: string, action: () => Promise<unknown>, done: string) {
    setBusy(label);
    setError(null);
    try {
      await action();
      toast(done);
    } catch (caught) {
      setError(message(caught, "Couldn't save."));
    } finally {
      entry.reload();
      history.reload();
      setBusy(null);
    }
  }

  const published = loaded.publication === "published";
  const publication = published ? permissions.unpublish : permissions.publish;
  const publishAction = (
    <>
      <PanelButton
        icon="visibility"
        onClick={() =>
          void run(
            "publication",
            () => adminApi(`/treasury/${id}/${published ? "unpublish" : "publish"}`, { method: "POST" }),
            published ? "Unpublished" : "Published",
          )
        }
        disabled={!publication.allowed || dirty || busy !== null}
        title={dirty ? "Submit or discard your changes first" : (publication.reason ?? undefined)}
      >
        {busy === "publication" ? "Saving…" : published ? "Unpublish" : "Publish"}
      </PanelButton>
      {!publication.allowed && publication.reason ? <p className="px-1 text-meta text-text-muted">{publication.reason}</p> : null}
    </>
  );

  const money = (minor: number | null) => (
    <ReadOnly>
      <span className="tabular-nums">{formatMoney(minor, loaded.currency)}</span>
    </ReadOnly>
  );
  // While the Rootadmin edits the amount or the fee, the net shows what it will be.
  const previewNet =
    editsExpense && "minor" in amount && amount.minor !== null && "minor" in fee ? (fee.minor === null ? null : -amount.minor - fee.minor) : loaded.netAmount;

  const rows = {
    recipient: isExpense ? (
      <PropertyRow
        key="recipient"
        icon="arrow_outward"
        label="Recipient"
        hint={editsExpense ? "A person or an organization." : undefined}
        error={shownErrors.recipient}
      >
        {editsExpense ? (
          <RelationPicker
            label="Recipient"
            selected={draft.recipient}
            onChange={(next) => set("recipient", next.slice(-1))}
            search={searchRecipients}
            max={1}
            limitMessage="An expense has one recipient."
          />
        ) : (
          <ReadOnly>
            {loaded.recipient ? (
              <Link
                href={`/admin/${loaded.recipient.kind === "person" ? "people" : "organizations"}/${loaded.recipient.id}`}
                className={`underline underline-offset-2 ${focusRing}`}
              >
                {loaded.recipient.name}
              </Link>
            ) : null}
          </ReadOnly>
        )}
      </PropertyRow>
    ) : null,
    expenseTypes: isExpense ? (
      <PropertyRow key="expenseTypes" icon="select" label="Expense types" error={shownErrors.expenseTypes}>
        {editsExpense ? (
          <RelationPicker
            label="Expense types"
            selected={draft.expenseTypes}
            onChange={(next) => set("expenseTypes", next)}
            search={searchTypes(options.data?.expenseTypes ?? [])}
          />
        ) : (
          <ReadOnly>{loaded.expenseTypes.length > 0 ? loaded.expenseTypes.map((type) => type.label).join(", ") : null}</ReadOnly>
        )}
      </PropertyRow>
    ) : null,
    name: (
      <PropertyRow key="name" icon="title" label="Name" htmlFor={editsExpense ? "treasury-name" : undefined} error={shownErrors.name}>
        {editsExpense ? (
          <input
            id="treasury-name"
            className={recordInput}
            value={draft.name}
            maxLength={200}
            onChange={(event) => set("name", event.target.value)}
            onBlur={() => validation.leave("name")}
            {...invalidProps("treasury-name", shownErrors.name)}
          />
        ) : (
          <ReadOnly>{loaded.name}</ReadOnly>
        )}
      </PropertyRow>
    ),
    publicDescription: (
      <PropertyRow
        key="publicDescription"
        icon="title"
        label="Public description"
        htmlFor={editsExpense ? "treasury-description" : undefined}
        hint="Shown on the public Treasury page once the entry is qualified."
        error={shownErrors.publicDescription}
      >
        {editsExpense ? (
          <AutoGrowTextarea
            id="treasury-description"
            value={draft.publicDescription}
            onChange={(event) => set("publicDescription", event.target.value)}
            maxLength={2000}
            placeholder="What the money paid for, in plain words…"
            {...invalidProps("treasury-description", shownErrors.publicDescription)}
          />
        ) : (
          <ReadOnly>{loaded.publicDescription}</ReadOnly>
        )}
      </PropertyRow>
    ),
    review: (
      <PropertyRow
        key="review"
        icon="approval"
        label="Review status"
        hint={permissions.review.allowed ? "Qualified and Not required need a recipient." : (permissions.review.reason ?? undefined)}
        error={shownErrors.reviewStatus}
      >
        {permissions.review.allowed ? (
          <Pills
            label="Review status"
            options={permissions.review.options.map((option) => ({ value: option.key, label: option.label }))}
            value={draft.reviewStatus}
            onChange={(value) => set("reviewStatus", value)}
          />
        ) : (
          <ReadOnly>{loaded.review.label}</ReadOnly>
        )}
      </PropertyRow>
    ),
    type: (
      <PropertyRow key="type" icon="select" label="Type">
        <ReadOnly>{TYPE_LABEL[loaded.type]}</ReadOnly>
      </PropertyRow>
    ),
    date: (
      <PropertyRow key="date" icon="calendar" label="Date" htmlFor={editsExpense ? "treasury-date" : undefined} error={shownErrors.occurredOn}>
        {editsExpense ? (
          <DateField id="treasury-date" label="Date" value={draft.occurredOn} onChange={(value) => set("occurredOn", value)} error={shownErrors.occurredOn} />
        ) : (
          <ReadOnly>{loaded.occurredAt ? <Timestamp value={loaded.occurredAt} format="full" /> : formatDateOnly(loaded.occurredOn)}</ReadOnly>
        )}
      </PropertyRow>
    ),
    amount: (
      <PropertyRow
        key="amount"
        icon="numbers"
        label="Amount"
        htmlFor={editsExpense ? "treasury-amount" : undefined}
        hint={editsExpense ? `Money out, in ${loaded.currency}.` : undefined}
        error={shownErrors.amount}
      >
        {editsExpense ? (
          <input
            id="treasury-amount"
            className={`${recordInput} tabular-nums`}
            inputMode="decimal"
            value={draft.amount}
            onChange={(event) => set("amount", event.target.value)}
            onBlur={() => validation.leave("amount")}
            {...invalidProps("treasury-amount", shownErrors.amount)}
          />
        ) : (
          money(loaded.grossAmount)
        )}
      </PropertyRow>
    ),
    fee: (
      <PropertyRow key="fee" icon="numbers" label="Fee" htmlFor={editsExpense ? "treasury-fee" : undefined} error={shownErrors.fee}>
        {editsExpense ? (
          <input
            id="treasury-fee"
            className={`${recordInput} tabular-nums`}
            inputMode="decimal"
            value={draft.fee}
            placeholder="No fee"
            onChange={(event) => set("fee", event.target.value)}
            onBlur={() => validation.leave("fee")}
            {...invalidProps("treasury-fee", shownErrors.fee)}
          />
        ) : (
          money(loaded.feeAmount)
        )}
      </PropertyRow>
    ),
    net: (
      <PropertyRow key="net" icon="numbers" label="Net" hint={editsExpense ? "Amount − fee, worked out on save." : undefined}>
        {money(previewNet)}
      </PropertyRow>
    ),
    settlement: loaded.settlement ? (
      <PropertyRow key="settlement" icon="numbers" label="Settlement">
        <ReadOnly>
          <span className="tabular-nums">
            {`${formatMoney(loaded.settlement.grossAmount, loaded.settlement.currency)} − fee ${formatMoney(loaded.settlement.feeAmount, loaded.settlement.currency)} = ${formatMoney(loaded.settlement.netAmount, loaded.settlement.currency)} (rate ${loaded.settlement.exchangeRate})`}
          </span>
        </ReadOnly>
      </PropertyRow>
    ) : null,
    cadence: (
      <PropertyRow key="cadence" icon="select" label="Cadence">
        {editsExpense ? (
          <Pills label="Cadence" options={CADENCES} value={draft.cadence} onChange={(value) => set("cadence", value)} />
        ) : (
          <ReadOnly>{CADENCE_LABEL[loaded.cadence] ?? loaded.cadence}</ReadOnly>
        )}
      </PropertyRow>
    ),
    adjusts: loaded.adjusts ? (
      <PropertyRow key="adjusts" icon="arrow_outward" label="Adjusts">
        <ReadOnly>
          <Link href={`/admin/treasury/${loaded.adjusts.id}`} className={`underline underline-offset-2 ${focusRing}`}>
            {`Donation ${formatEntryNumber(loaded.adjusts.number)}`}
          </Link>
        </ReadOnly>
      </PropertyRow>
    ) : null,
    adjustments:
      loaded.adjustments.length > 0 ? (
        <PropertyRow key="adjustments" icon="arrow_outward" label="Adjustments">
          <div className="flex flex-col px-2">
            {loaded.adjustments.map((adjustment) => (
              <Link
                key={adjustment.id}
                href={`/admin/treasury/${adjustment.id}`}
                className={`flex min-h-8 items-center underline underline-offset-2 ${focusRing}`}
              >
                {`${TYPE_LABEL[adjustment.type as keyof typeof TYPE_LABEL] ?? adjustment.type} ${formatEntryNumber(adjustment.number)} · ${formatMoney(adjustment.grossAmount, loaded.currency)}`}
              </Link>
            ))}
          </div>
        </PropertyRow>
      ) : null,
    lastReviewed: loaded.reviewedAt ? (
      <PropertyRow key="lastReviewed" icon="schedule" label="Last reviewed">
        <ReadOnly>
          <Timestamp value={loaded.reviewedAt} format="full" />
        </ReadOnly>
      </PropertyRow>
    ) : null,
    publication: (
      <PropertyRow key="publication" icon="visibility" label="Publication">
        <ReadOnly>
          {publicationLabel(loaded)}
          {loaded.publishedAt ? (
            <>
              {" · "}
              <Timestamp value={loaded.publishedAt} format="full" />
            </>
          ) : null}
        </ReadOnly>
      </PropertyRow>
    ),
    source: (
      <PropertyRow key="source" icon="select" label="Source">
        <ReadOnly>{`${SOURCE_LABEL[loaded.source]} · ${modeLabel(loaded)}`}</ReadOnly>
      </PropertyRow>
    ),
    transaction: (
      <PropertyRow key="transaction" icon="numbers" label={loaded.source === "stripe" ? "Stripe ID" : "Transaction ID"}>
        <ReadOnly>{loaded.externalTransactionId ? <span className="font-mono text-meta">{loaded.externalTransactionId}</span> : null}</ReadOnly>
      </PropertyRow>
    ),
    sourceAccount: loaded.sourceAccountId ? (
      <PropertyRow key="sourceAccount" icon="numbers" label="Source account">
        <ReadOnly>{loaded.sourceAccountId}</ReadOnly>
      </PropertyRow>
    ) : null,
    internalNote: (
      <PropertyRow
        key="internalNote"
        icon="title"
        label="Internal note"
        htmlFor={permissions.editInternalNote ? "treasury-note" : undefined}
        hint="Admins only: never public."
      >
        {permissions.editInternalNote ? (
          <AutoGrowTextarea
            id="treasury-note"
            value={draft.internalNote}
            onChange={(event) => set("internalNote", event.target.value)}
            maxLength={5000}
            placeholder="Notes for the admin team…"
          />
        ) : (
          <ReadOnly>{loaded.internalNote}</ReadOnly>
        )}
      </PropertyRow>
    ),
    imported: loaded.importedAt ? (
      <PropertyRow key="imported" icon="sync" label="Imported">
        <ReadOnly>
          <Timestamp value={loaded.importedAt} format="full" />
        </ReadOnly>
      </PropertyRow>
    ) : null,
  } satisfies Record<string, ReactNode>;

  // OPS-155: an expense starts with what the client checks first; other entries keep their order.
  const order: (keyof typeof rows)[] = isExpense
    ? [
        "recipient",
        "expenseTypes",
        "name",
        "publicDescription",
        "review",
        "type",
        "date",
        "amount",
        "fee",
        "net",
        "settlement",
        "cadence",
        "lastReviewed",
        "publication",
        "source",
        "transaction",
        "sourceAccount",
        "internalNote",
        "imported",
      ]
    : [
        "name",
        "type",
        "date",
        "amount",
        "fee",
        "net",
        "settlement",
        "cadence",
        "adjusts",
        "adjustments",
        "review",
        "lastReviewed",
        "publication",
        "publicDescription",
        "source",
        "transaction",
        "sourceAccount",
        "internalNote",
        "imported",
      ];

  return (
    <RecordPage
      backHref="/admin/treasury/manage"
      backLabel="Treasury"
      title={`${number} · ${loaded.name}`}
      entity={{ type: "treasury_entry", id }}
      entityNoun="entry"
      recordLink={(other) => `/admin/treasury/${other}`}
      panelExtra={canPublish ? publishAction : null}
      revision={loaded.updatedAt}
      readOnly={!canUpdate && !canReview && !canPublish && !editsExpense}
      actions={{
        submit,
        discard: () => {
          setEdit(null);
          setError(null);
          setFieldErrors({});
          validation.reset();
        },
        archived: loaded.archivedAt !== null,
        setArchived: !canUpdate
          ? undefined
          : (archived) =>
              run(
                archived ? "archiving" : "restoring",
                () => adminApi(`/treasury/${id}/${archived ? "archive" : "restore"}`, { method: "POST" }),
                archived ? "Entry archived" : "Entry restored",
              ),
        savedMessage: "Treasury entry updated",
        dirty,
        busy,
      }}
    >
      {loaded.source === "stripe" ? (
        <div data-managed="stripe" className="flex flex-wrap items-center gap-2 pl-1 text-body">
          <span className="inline-flex h-6 items-center gap-1 rounded-control px-2 font-bold ring-1 ring-line">
            <AdminIcon name="lock" />
            From Stripe
          </span>
          <span className="text-text-muted">Amounts and dates come from Stripe; only the internal note, the review and the publication change here.</span>
        </div>
      ) : null}
      {!loaded.livemode ? (
        <StatusMessage>
          {loaded.publicNow
            ? "Stripe test mode: a sandbox payment, shown on the public Treasury (marked Test in production, until go-live)."
            : loaded.publication === "published"
              ? "Stripe test mode: a sandbox payment, not on the public Treasury (shown only before go-live, with treasury.show_test_donations on)."
              : "Stripe test mode: a sandbox payment, not real money."}
        </StatusMessage>
      ) : null}
      {loaded.sample ? (
        <StatusMessage>
          Sample entry: shown on the public Treasury marked Test until go-live; npm run api:purge-sample-treasury removes every sample.
        </StatusMessage>
      ) : null}
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

      {order.map((key) => rows[key])}
      <RecordMeta
        numberLabel="Entry ID"
        number={number}
        updatedAt={loaded.updatedAt}
        createdAt={loaded.createdAt}
        lastEditedBy={history.data?.lastEditedBy?.label ?? null}
        createdBy={history.data?.createdBy?.label ?? (loaded.source === "stripe" ? "Automation" : null)}
      />
    </RecordPage>
  );
}
