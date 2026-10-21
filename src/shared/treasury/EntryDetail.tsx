import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchTreasuryEntry, type PublicTreasuryEntry } from "@/shared/config/publicApi";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { FullBleedSeparator } from "@/shared/ui/FullBleedSeparator";
import { FeedbackIssueActions } from "@/shared/ui/FeedbackIssueActions";
import { NavHeader } from "@/shared/ui/NavHeader";
import { ShareButton } from "@/shared/ui/ShareButton";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";
import { Tag } from "@/shared/ui/Tag";
import { TREASURY_COPY } from "./copy";
import { entryMenu } from "./entryMenu";
import { amountInWords, formatCodeAmount, formatEntryDay, formatEntryMoment, formatEntryTime } from "./format";
import { entryHref, entryTags } from "./HistoryList";

const copy = TREASURY_COPY.entry;

/** The route's number: a positive integer, else the page doesn't exist. */
export function parseEntryNumber(value: string): number | null {
  return /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2_147_483_647 ? Number(value) : null;
}

/** Reads a public entry for a route; 404 when it isn't public (or isn't this route's kind). */
export async function loadEntry(number: string, route: "expense" | "donation"): Promise<PublicTreasuryEntry | "unavailable"> {
  const parsed = parseEntryNumber(number);
  if (parsed === null) notFound();
  const result = await fetchTreasuryEntry(parsed);
  if (!result.ok) {
    if (result.status === 404 || result.status === 400) notFound();
    return "unavailable";
  }
  const isExpense = result.data.type === "expense";
  if (isExpense !== (route === "expense")) notFound();
  return result.data;
}

/**
 * An entry's public page: expense (Common pages p22–p23) or anonymous
 * donation (p26–p27; refunds and dispute adjustments use the same page).
 * Only what the public API returns — never a donor, and a recipient only
 * while recipient names are public. Figma's roadmap link, reactions and
 * timeline have no data yet and are left out.
 */
export function EntryDetail({ entry, route, now }: { entry: PublicTreasuryEntry | "unavailable"; route: "expense" | "donation"; now: Date }) {
  const title = copy.titles[entry === "unavailable" ? route : entry.type]!;
  if (entry === "unavailable") {
    return (
      <main className="flex flex-1 flex-col">
        <NavHeader title={title} backHref="/treasury" />
        <Container className="pt-1">
          <p className="text-body text-text-muted">{copy.unavailable}</p>
        </Container>
      </main>
    );
  }

  const url = entryHref(entry);
  const amount = formatCodeAmount(entry.amount, entry.currency);
  const words = amountInWords(entry.amount, entry.currency);
  const sentence = entry.type === "expense" ? copy.menu.expense!(words, formatEntryMoment(entry, now)) : copy.menu[entry.type]!(words, formatEntryDay(entry));
  const tags = [...entryTags(entry), ...(entry.type === "donation" && entry.cadence === "monthly" ? [copy.monthly] : [])];

  return (
    <main className="flex flex-1 flex-col">
      <NavHeader
        title={title}
        backHref="/treasury"
        shareUrl={url}
        menu={entryMenu({ sentence, url, title: `${title} ${amount}` })}
      />
      <Container className="pt-1">
        {/* p22/p26: the time, muted, with Share on the right of the same row. */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-meta text-text-muted">{copy.when[entry.type]!(formatEntryTime(entry, now))}</p>
          {/* The 40px hit box overlaps the row: Figma aligns the 16px glyph with the date line. */}
          <ShareButton url={url} title={`${title} ${amount}`} className="-my-3 -mr-gutter" />
        </div>
        {entry.recipient ? <p className="text-meta text-text-muted">{copy.paidTo(entry.recipient.name)}</p> : null}
        {entry.adjustsNumber !== null ? (
          <p className="text-meta text-text-muted">
            {copy.adjusts(entry.type)}
            <Link href={`/treasury/donation/${entry.adjustsNumber}`} className="underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary">
              {copy.adjustsLink(entry.adjustsNumber)}
            </Link>
          </p>
        ) : null}
        {tags.length > 0 ? (
          // p22: tags 10px under the date row, amount 16px under the tags.
          <div className="mt-2.5 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        ) : null}
        <p className={`${tags.length > 0 ? "mt-4" : "mt-3"} text-body font-bold text-text-primary`}>
          {entry.amount < 0 && entry.type !== "expense" ? `- ${amount}` : amount}
        </p>
        {entry.description && entry.type === "expense" ? <p className="mt-3.5 text-body text-text-primary">{entry.description}</p> : null}
        {/* Send feedback and Report issue, as under every documentation article (client review 2026-10-21). */}
        <FeedbackIssueActions className="mt-3" />

        {route === "donation" ? (
          <>
            {/* p26: a full-bleed rule 12px under Send feedback, then the two explanations. */}
            <FullBleedSeparator className="mt-3" />
            <section className="mt-4">
              <h2 className="text-body font-bold text-text-primary">{copy.why.title}</h2>
              <p className="text-body text-text-primary">{copy.why.body}</p>
            </section>
            <section className="mt-6">
              <h2 className="text-body font-bold text-text-primary">{copy.spent.title}</h2>
              <p className="text-body text-text-primary">
                {copy.spent.body}
                <br />
                {copy.spent.record}{" "}
                <Link href="/documentation" className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary">
                  {copy.spent.readMore}
                </Link>
              </p>
            </section>
          </>
        ) : null}
      </Container>

      <StickyActionBar>
        <Button variant="primary" href="/donate" icon="volunteer_activism" fullWidth>
          {TREASURY_COPY.donateCta}
        </Button>
      </StickyActionBar>
    </main>
  );
}
