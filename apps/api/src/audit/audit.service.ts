import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, gte, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { AdminPrincipal } from "../auth/auth.service.js";
import { adminUsers } from "../auth/auth.schema.js";
import { CLOCK, type Clock } from "../common/clock/clock.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { ForbiddenError, NotFoundError } from "../common/errors/api-error.js";
import type { Page } from "../common/listing/list-query.js";
import { SettingsService } from "../settings/settings.service.js";
import { AUDITED_ENTITIES, auditEvents, recordComments, recordViews } from "./audit.schema.js";
import { canReadEntity } from "../access-control/permissions.js";
import { entityTitles, titleOfLabel } from "./entity-labels.js";
import type { AuditActor, AuditChange, AuditEventInput } from "./audit.types.js";
import { visibleChanges, type VisibleChange } from "./record-fields.js";

export type Executor = Pick<Database, "select" | "insert" | "update" | "delete">;

/**
 * Writes one audit event in the caller's transaction. AuditService.record()
 * for request handlers; importers and the ledger call this directly.
 */
export async function recordAuditEvent(tx: Pick<Database, "insert">, input: AuditEventInput, at: Date = new Date()): Promise<void> {
  await tx.insert(auditEvents).values({
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actorType: input.actor.type,
    actorId: input.actor.type === "admin" ? input.actor.id : null,
    actorLabel: input.actor.label,
    source: input.source,
    changes: input.changes ?? [],
    meta: input.meta ?? {},
    occurredAt: at,
  });
}

/** The actor for a signed-in admin: their display name, or the part of their email before "@". */
export function actorFor(admin: AdminPrincipal): AuditActor {
  return { type: "admin", id: admin.id, label: admin.displayName ?? admin.email.split("@")[0]!, role: admin.role };
}

export interface HistoryItemDto {
  /** "event:123" or "view:45" — stable keys for the list. */
  id: string;
  kind: "event" | "view";
  action: AuditEventInput["action"] | "viewed";
  occurredAt: string;
  actor: { type: "admin" | "automation"; label: string };
  changes: VisibleChange[];
  meta: Record<string, unknown>;
  /** For comment events: the comment, and whether the viewer may still edit or delete it (their own, not deleted). */
  comment?: { id: string; body: string; current: string; mine: boolean; deleted: boolean };
}

export interface RecordHistoryDto {
  /** Events + "viewed" entries shown — the "History N" header. */
  total: number;
  views: number;
  edits: number;
  createdBy: { label: string; at: string } | null;
  lastEditedBy: { label: string; at: string } | null;
  items: HistoryItemDto[];
}

export interface HistoryListQuery {
  entityType?: string;
  /** An admin's id, or "automation". */
  actor?: string;
  source?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface HistoryListItemDto extends HistoryItemDto {
  /** `title`: the record's current title (or its last known one); `exists`: false once it's deleted (no link). */
  entity: { type: string; id: string; label: string; title: string; exists: boolean };
}

/** Comments are supported on these record types (they have detail pages). */
export const COMMENTABLE = ["person", "organization", "treasury_entry", "service", "access_grant", "admin_user"] as const;

const FEED_LIMIT = 300;

/** Same instant: the later write first (ids are increasing numbers; a view sorts after the events of that instant). */
const order = (item: { id: string; kind: string }) => Number(item.id.split(":")[1]) - (item.kind === "view" ? Number.MAX_SAFE_INTEGER / 2 : 0);
const EDIT_ACTIONS = ["updated"] as const;

/**
 * The audit log and its views (migration 0009): `record()` is called by
 * every write, inside the write's own transaction, so a change and its
 * event commit or roll back together. Never secrets: only the declared
 * record fields are audited.
 */
@Injectable()
export class AuditService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly settings: SettingsService,
  ) {}

  async record(tx: Executor, input: AuditEventInput): Promise<void> {
    await recordAuditEvent(tx, input, this.clock());
  }

  /** A refused request (overview §3.1): logged on the account that tried, with the permission it lacked. */
  async recordDenied(admin: AdminPrincipal, permission: string, route: string): Promise<void> {
    await recordAuditEvent(
      this.db,
      {
        entityType: "admin_user",
        entityId: admin.id,
        action: "permission_denied",
        actor: actorFor(admin),
        source: "admin",
        meta: { label: admin.displayName ?? admin.email.split("@")[0]!, permission, route },
      },
      this.clock(),
    );
  }

  /**
   * One opening of a record (decision 11): every opening counts; the
   * history shows it only when this account has no shown view within the
   * window (history.view_event_window_hours).
   */
  async recordView(entityType: string, entityId: string, viewer: AdminPrincipal): Promise<{ views: number }> {
    const hours = await this.settings.get("history.view_event_window_hours");
    const now = this.clock();
    const since = new Date(now.getTime() - hours * 3_600_000);
    await this.db.transaction(async (tx) => {
      const [recent] = await tx
        .select({ id: recordViews.id })
        .from(recordViews)
        .where(
          and(
            eq(recordViews.entityType, entityType),
            eq(recordViews.entityId, entityId),
            eq(recordViews.viewerId, viewer.id),
            eq(recordViews.inHistory, true),
            gte(recordViews.viewedAt, since),
          ),
        )
        .limit(1);
      await tx.insert(recordViews).values({ entityType, entityId, viewerId: viewer.id, viewedAt: now, inHistory: recent === undefined });
    });
    const [row] = await this.db.select({ total: count() }).from(recordViews).where(and(eq(recordViews.entityType, entityType), eq(recordViews.entityId, entityId)));
    return { views: row?.total ?? 0 };
  }

  /** A record's history, newest first, as `viewer` may see it (masked contact values, no private notes). */
  async feed(entityType: string, entityId: string, viewer: AdminPrincipal): Promise<RecordHistoryDto> {
    const forEntity = and(eq(auditEvents.entityType, entityType), eq(auditEvents.entityId, entityId));
    const viewsOf = and(eq(recordViews.entityType, entityType), eq(recordViews.entityId, entityId));
    const [events, shownViews, [viewCount], [editCount], [eventCount], [shownViewCount], [created], [edited]] = await Promise.all([
      this.db.select().from(auditEvents).where(forEntity).orderBy(desc(auditEvents.id)).limit(FEED_LIMIT),
      this.db
        .select({ id: recordViews.id, viewedAt: recordViews.viewedAt, label: sql<string | null>`coalesce(${adminUsers.displayName}, split_part(${adminUsers.email}, '@', 1))` })
        .from(recordViews)
        .leftJoin(adminUsers, eq(adminUsers.id, recordViews.viewerId))
        .where(and(viewsOf, eq(recordViews.inHistory, true)))
        .orderBy(desc(recordViews.id))
        .limit(FEED_LIMIT),
      this.db.select({ total: count() }).from(recordViews).where(viewsOf),
      this.db.select({ total: count() }).from(auditEvents).where(and(forEntity, inArray(auditEvents.action, [...EDIT_ACTIONS]))),
      this.db.select({ total: count() }).from(auditEvents).where(forEntity),
      this.db.select({ total: count() }).from(recordViews).where(and(viewsOf, eq(recordViews.inHistory, true))),
      this.db
        .select({ label: auditEvents.actorLabel, at: auditEvents.occurredAt })
        .from(auditEvents)
        .where(and(forEntity, inArray(auditEvents.action, ["created", "imported", "duplicated"])))
        .orderBy(auditEvents.id)
        .limit(1),
      this.db
        .select({ label: auditEvents.actorLabel, at: auditEvents.occurredAt })
        .from(auditEvents)
        .where(and(forEntity, inArray(auditEvents.action, ["updated", "created", "imported", "duplicated"])))
        .orderBy(desc(auditEvents.id))
        .limit(1),
    ]);
    const comments = await this.commentsFor(events.map((event) => event.meta));
    const items: HistoryItemDto[] = [
      ...events.map((event) => this.toItem(event, viewer, comments)),
      ...shownViews.map((view) => ({
        id: `view:${view.id}`,
        kind: "view" as const,
        action: "viewed" as const,
        occurredAt: view.viewedAt.toISOString(),
        actor: { type: "admin" as const, label: view.label ?? "Former account" },
        changes: [],
        meta: {},
      })),
    ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || order(b) - order(a));
    return {
      total: (eventCount?.total ?? 0) + (shownViewCount?.total ?? 0),
      views: viewCount?.total ?? 0,
      edits: editCount?.total ?? 0,
      createdBy: created ? { label: created.label, at: created.at.toISOString() } : null,
      lastEditedBy: edited ? { label: edited.label, at: edited.at.toISOString() } : null,
      items,
    };
  }

  /** Every event (the Monitoring → History page), newest first, with the same privacy rules. */
  async list(query: HistoryListQuery, viewer: AdminPrincipal): Promise<Page<HistoryListItemDto>> {
    const conditions: (SQL | undefined)[] = [];
    if (query.entityType) conditions.push(eq(auditEvents.entityType, query.entityType));
    // Without history.read, only the record types of the modules the role can read (overview §3.1).
    if (!viewer.permissions.has("history.read")) {
      const readable = AUDITED_ENTITIES.filter((type) => canReadEntity(viewer.permissions, type));
      conditions.push(readable.length > 0 ? inArray(auditEvents.entityType, [...readable]) : sql`false`);
    }
    if (query.actor === "automation") conditions.push(eq(auditEvents.actorType, "automation"));
    else if (query.actor) conditions.push(eq(auditEvents.actorId, query.actor));
    if (query.source) conditions.push(eq(auditEvents.source, query.source));
    const isDay = (value: string) => value.length === 10;
    if (query.from) conditions.push(gte(auditEvents.occurredAt, new Date(isDay(query.from) ? `${query.from}T00:00:00Z` : query.from)));
    if (query.to) conditions.push(lt(auditEvents.occurredAt, isDay(query.to) ? new Date(new Date(`${query.to}T00:00:00Z`).getTime() + 86_400_000) : new Date(query.to)));
    const where = and(...conditions);
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(auditEvents)
        .where(where)
        .orderBy(desc(auditEvents.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ total: count() }).from(auditEvents).where(where),
    ]);
    const [comments, titles] = await Promise.all([
      this.commentsFor(rows.map((row) => row.meta)),
      entityTitles(this.db, rows.map((row) => ({ type: row.entityType, id: row.entityId }))),
    ]);
    return {
      items: rows.map((row) => {
        const label = typeof row.meta.label === "string" ? row.meta.label : row.entityId;
        const current = titles.get(`${row.entityType}:${row.entityId}`);
        return {
          ...this.toItem(row, viewer, comments),
          entity: { type: row.entityType, id: row.entityId, label, title: current ?? titleOfLabel(label), exists: current !== undefined },
        };
      }),
      page: query.page,
      pageSize: query.pageSize,
      total: total?.total ?? 0,
    };
  }

  /** The admins who appear in the log, for the History page's actor filter. */
  async actors(): Promise<{ id: string; label: string }[]> {
    return this.db
      .selectDistinct({ id: adminUsers.id, label: sql<string>`coalesce(${adminUsers.displayName}, split_part(${adminUsers.email}, '@', 1))` })
      .from(auditEvents)
      .innerJoin(adminUsers, eq(adminUsers.id, auditEvents.actorId));
  }

  async addComment(entityType: string, entityId: string, label: string, author: AdminPrincipal, body: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [comment] = await tx.insert(recordComments).values({ entityType, entityId, authorId: author.id, body }).returning({ id: recordComments.id });
      await this.record(tx, { entityType, entityId, action: "comment_added", actor: actorFor(author), source: "admin", meta: { label, commentId: comment!.id, body } });
    });
  }

  /** Authors edit their own comments; the previous text stays in the history. */
  async editComment(commentId: string, author: AdminPrincipal, body: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const comment = await this.ownComment(tx, commentId, author);
      await tx.update(recordComments).set({ body, updatedAt: this.clock() }).where(eq(recordComments.id, commentId));
      await this.record(tx, {
        entityType: comment.entityType,
        entityId: comment.entityId,
        action: "comment_edited",
        actor: actorFor(author),
        source: "admin",
        changes: [{ field: "comment", label: "Comment", kind: "text", before: comment.body, after: body }],
        meta: { label: await this.labelOf(tx, comment.entityType, comment.entityId), commentId },
      });
    });
  }

  /** Authors delete their own comments; the text stays in the history (decision 10). */
  async deleteComment(commentId: string, author: AdminPrincipal): Promise<void> {
    await this.db.transaction(async (tx) => {
      const comment = await this.ownComment(tx, commentId, author);
      await tx.update(recordComments).set({ deletedAt: this.clock() }).where(eq(recordComments.id, commentId));
      await this.record(tx, {
        entityType: comment.entityType,
        entityId: comment.entityId,
        action: "comment_deleted",
        actor: actorFor(author),
        source: "admin",
        meta: { label: await this.labelOf(tx, comment.entityType, comment.entityId), commentId, body: comment.body },
      });
    });
  }

  private async ownComment(tx: Executor, commentId: string, author: AdminPrincipal) {
    const [comment] = await tx.select().from(recordComments).where(and(eq(recordComments.id, commentId), isNull(recordComments.deletedAt))).limit(1);
    if (!comment) throw new NotFoundError("Comment not found.");
    if (comment.authorId !== author.id) throw new ForbiddenError("Only its author can change a comment.");
    return comment;
  }

  /** The record's label from its latest event (comments are written on records that have events). */
  private async labelOf(tx: Executor, entityType: string, entityId: string): Promise<string> {
    const [row] = await tx
      .select({ meta: auditEvents.meta })
      .from(auditEvents)
      .where(and(eq(auditEvents.entityType, entityType), eq(auditEvents.entityId, entityId)))
      .orderBy(desc(auditEvents.id))
      .limit(1);
    return typeof row?.meta.label === "string" ? row.meta.label : entityId;
  }

  private async commentsFor(metas: Record<string, unknown>[]) {
    const ids = [...new Set(metas.map((meta) => meta.commentId).filter((id): id is string => typeof id === "string"))];
    if (ids.length === 0) return new Map<string, typeof recordComments.$inferSelect>();
    const rows = await this.db.select().from(recordComments).where(inArray(recordComments.id, ids));
    return new Map(rows.map((row) => [row.id, row]));
  }

  private toItem(event: typeof auditEvents.$inferSelect, viewer: AdminPrincipal, comments: Map<string, typeof recordComments.$inferSelect>): HistoryItemDto {
    const meta = event.meta as Record<string, unknown>;
    const item: HistoryItemDto = {
      id: `event:${event.id}`,
      kind: "event",
      action: event.action as AuditEventInput["action"],
      occurredAt: event.occurredAt.toISOString(),
      actor: { type: event.actorType as "admin" | "automation", label: event.actorLabel },
      changes: visibleChanges(event.changes as AuditChange[], viewer.role),
      meta,
    };
    if (event.action === "comment_added" && typeof meta.commentId === "string") {
      const comment = comments.get(meta.commentId);
      item.comment = {
        id: meta.commentId,
        body: typeof meta.body === "string" ? meta.body : (comment?.body ?? ""),
        current: comment?.body ?? "",
        mine: comment !== undefined && comment.deletedAt === null && comment.authorId === viewer.id,
        deleted: comment?.deletedAt != null,
      };
    }
    return item;
  }
}
