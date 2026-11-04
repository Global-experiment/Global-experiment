# 019 — The rich-text editor for Home and Documentation: Tiptap

## Status

Accepted — 2026-11-04 (Delivery 6; OPS-26, OPS-27, OPS-28).

## Context

Home and Documentation move from Notion into the admin (ADR 020). Editors
need a rich-text editor matching the Figma toolbar (admin-desktop.pdf p7 and
p10): undo, redo, headings, text, bulleted and numbered lists, links. Images
come through the existing file storage.

Requirements: open source with a permissive licence, actively maintained,
accessible (keyboard, screen readers), works with React 19 and Next.js 16,
and produces structured content we validate ourselves — never HTML we
would have to trust.

## Options compared

| | **Tiptap 3** | **Lexical** | Quill 2 | Slate |
|---|---|---|---|---|
| Licence | MIT (core and the extensions used here) | MIT | BSD-3 | MIT |
| Maintained | Releases every week or two (3.32.0, 13 Oct 2026) | Monthly releases (0.52, Sep 2026), still 0.x | Slow (2.0.3) | Still beta (0.x), slower |
| Built on | ProseMirror (mature, used widely) | Meta's own engine | Own engine | Own engine |
| Schema | Strict: content outside the schema is dropped on paste | Node classes; stricter rules need more code | Delta format; HTML-oriented | Anything; we write every rule |
| React 19 / Next 16 | `@tiptap/react`; render on the client, `immediatelyRender: false` for SSR | `@lexical/react` | Wrapper libraries | `slate-react` |
| Accessibility | contenteditable with ARIA roles; we add a labelled toolbar | Good (accessibility a stated goal) | Fair | Depends on our code |
| Toolbar | Headless: we build it in our design system | Headless; more plumbing per button | Own toolbar theme | Headless |
| Output | JSON document, mapped to our blocks | JSON, mapped to our blocks | Delta / HTML | JSON |

Not considered: hosted or "open core" editors whose useful parts are paid
(TinyMCE's premium plugins, CKEditor 5's GPL-or-commercial licence),
because the project's code is public and must stay under a permissive
licence.

## Decision

**Tiptap 3** (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`,
exact version 3.32.0), with only the extensions the content model uses:
paragraphs, headings 1–4, bulleted and numbered lists, links, images,
history (undo/redo). Bold, italic, code, quotes, tables and the rest are
turned off: the public pages don't style them, and turning them on later is
a configuration change.

Why Tiptap over Lexical: the stricter schema (pasting from Word or a web
page can only produce the blocks we allow), ProseMirror's maturity, a
1.x API instead of 0.x, and less code per toolbar button. Lexical has no
blocking drawback; it was the close second.

## How it is used

- The editor is a client component of the admin only; visitors never load
  it. The public pages render the stored blocks with React (text nodes and
  our own components), never `dangerouslySetInnerHTML`.
- Between the editor and the API, the content is **our** block model
  (`apps/api/src/cms/content.ts`, `src/shared/content/types.ts`), not
  Tiptap's JSON: the conversion lives in `src/modules/admin/cms/editorContent.ts`.
  Changing editors later only changes that file.
- The API validates every save against the block model (zod): unknown
  blocks or fields are refused, links can only be `https:`, `http:`,
  `mailto:`, a path of the site or an anchor, and control characters are
  dropped. This is the sanitizing step; the website adds no second parser.
- The toolbar is a labelled `role="toolbar"` with buttons that say what they
  do and whether they are on (`aria-pressed`); keyboard shortcuts are
  Tiptap's defaults (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl/⌘+Shift+7/8 for lists).
- The CSP is unchanged: Tiptap needs no `eval`, and our styles already allow
  inline style attributes.

## Consequences

- Five packages in the website's dependencies, loaded only on the admin's
  editor pages (never by the public site).
- Upgrades are pinned and taken deliberately, like every other dependency.
