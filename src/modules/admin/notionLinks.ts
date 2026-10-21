import { getNotionDocumentationEnv, getNotionHomeEnv } from "@/shared/config/env";

/** Notion's address for a page or database id (the editors open it signed in to the workspace). */
const notionUrl = (id: string) => `https://www.notion.so/${id.replace(/-/g, "")}`;

/** Where Home's content is edited while cms.mode = notion. */
export const notionHomeUrl = () => notionUrl(getNotionHomeEnv().NOTION_HOME_PAGE_ID);

/** Where the Documentation articles are edited while cms.mode = notion. */
export const notionDocumentationUrl = () => notionUrl(getNotionDocumentationEnv().NOTION_DOCUMENTATION_DB_ID);
