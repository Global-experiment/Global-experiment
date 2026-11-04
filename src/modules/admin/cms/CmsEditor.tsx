"use client";

import Image from "@tiptap/extension-image";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { ContentBlock } from "@/shared/content/types";
import { isSafeHref } from "@/shared/content/safeHref";
import { adminApi, AdminApiError } from "../api/client";
import { AdminIcon, type AdminIconName } from "../ui/adminIcons";
import { AdminButton, focusRing, Popover } from "../ui/controls";
import { recordInput } from "../ui/RecordForm";
import { adminImageSrc, blocksToDoc, docToBlocks } from "./editorContent";

/** 5 MB; PNG, JPEG, WebP or GIF (the API checks the bytes again). */
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Images carry the id of their upload; one pasted from elsewhere has none and is dropped when saved. */
const CmsImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      imageId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-image-id"),
        renderHTML: (attributes) => (attributes.imageId ? { "data-image-id": attributes.imageId } : {}),
      },
    };
  },
}).configure({ inline: false, allowBase64: false });

/**
 * The rich-text editor of Home and Documentation (ADR 019: Tiptap), with
 * the toolbar of admin-desktop.pdf p7/p10 — undo, redo, heading, text,
 * bulleted and numbered lists, link — plus images. Only what the public
 * pages render is enabled: no bold, italic, code, quotes or tables.
 * `onChange` gets our content blocks (editorContent.ts), never HTML.
 */
export function CmsEditor({
  value,
  onChange,
  label,
  readOnly = false,
  resetKey,
}: {
  value: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  /** The content area's accessible name ("Home content"). */
  label: string;
  readOnly?: boolean;
  /** Changes when the content is replaced from outside (Discard changes, a reload): the editor takes `value` again. */
  resetKey: string;
}) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        bold: false,
        italic: false,
        strike: false,
        underline: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        heading: { levels: [1, 2, 3, 4] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          // The same rule the API applies: https, http, mailto, site paths, anchors.
          isAllowedUri: (url) => isSafeHref(url),
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null },
        },
      }),
      CmsImage,
    ],
    content: blocksToDoc(value),
    editorProps: {
      attributes: { role: "textbox", "aria-multiline": "true", "aria-label": label, class: `min-h-60 outline-none ${focusRing}` },
    },
    onUpdate: ({ editor: current }) => onChangeRef.current(docToBlocks(current.getJSON())),
  });

  // Replaced from outside: show the new content without firing onChange.
  const seen = useRef(resetKey);
  useEffect(() => {
    if (!editor || seen.current === resetKey) return;
    seen.current = resetKey;
    editor.commands.setContent(blocksToDoc(value), { emitUpdate: false });
  }, [editor, resetKey, value]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  return (
    <div data-cms-editor className="flex min-h-0 flex-col">
      {readOnly || !editor ? null : <Toolbar editor={editor} />}
      <div className="cms-editor px-2 py-3 text-body text-text-primary">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  active,
  disabled,
  onClick,
  buttonRef,
  children,
}: {
  buttonRef?: React.Ref<HTMLButtonElement>;
  icon?: AdminIconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      {...(active === undefined ? {} : { "aria-pressed": active })}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-control px-1 text-body font-bold text-text-primary hover:bg-surface-raised disabled:cursor-not-allowed disabled:text-text-muted ${active ? "bg-surface-raised" : ""} ${focusRing}`}
    >
      {icon ? <AdminIcon name={icon} size={20} /> : children}
    </button>
  );
}

/** p7's toolbar row: 40px, a rule under it, the controls 8px from the left. */
function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
      level: ([1, 2, 3, 4] as const).find((level) => current.isActive("heading", { level })) ?? null,
      paragraph: current.isActive("paragraph"),
      bullet: current.isActive("bulletList"),
      ordered: current.isActive("orderedList"),
      link: current.isActive("link"),
      href: (current.getAttributes("link").href as string | undefined) ?? "",
    }),
  });
  const [headingOpen, setHeadingOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const headingButton = useRef<HTMLButtonElement>(null);
  const linkButton = useRef<HTMLButtonElement>(null);
  const imageButton = useRef<HTMLButtonElement>(null);
  const chain = () => editor.chain().focus();

  return (
    <div role="toolbar" aria-label="Formatting" className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
      <ToolButton icon="undo" label="Undo" disabled={!state.canUndo} onClick={() => chain().undo().run()} />
      <ToolButton icon="redo" label="Redo" disabled={!state.canRedo} onClick={() => chain().redo().run()} />
      <div className="relative">
        <ToolButton
          buttonRef={headingButton}
          label={state.level ? `Heading ${state.level} (choose a heading)` : "Heading"}
          active={state.level !== null}
          onClick={() => setHeadingOpen((open) => !open)}
        >
          {state.level ? `H${state.level}` : "H1"}
        </ToolButton>
        {headingOpen ? (
          <Popover open triggerRef={headingButton} onClose={() => setHeadingOpen(false)} label="Headings" className="top-9 left-0">
            <div className="flex flex-col py-1">
              {([1, 2, 3, 4] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={state.level === level}
                  onClick={() => {
                    chain().setHeading({ level }).run();
                    setHeadingOpen(false);
                  }}
                  className={`flex h-8 items-center px-3 text-left text-body text-text-primary hover:bg-surface-raised ${focusRing}`}
                >
                  Heading {level}
                </button>
              ))}
            </div>
          </Popover>
        ) : null}
      </div>
      <ToolButton label="Text" active={state.paragraph && state.level === null && !state.bullet && !state.ordered} onClick={() => chain().setParagraph().run()}>
        Text
      </ToolButton>
      <ToolButton icon="format_list_bulleted" label="Bulleted list" active={state.bullet} onClick={() => chain().toggleBulletList().run()} />
      <ToolButton icon="format_list_numbered" label="Numbered list" active={state.ordered} onClick={() => chain().toggleOrderedList().run()} />
      <div className="relative">
        <ToolButton
          buttonRef={linkButton}
          icon="editor_link"
          label={state.link ? "Edit link" : "Add link"}
          active={state.link}
          onClick={() => setLinkOpen((open) => !open)}
        />
        {linkOpen ? <LinkPopover editor={editor} anchor={linkButton} href={state.href} onClose={() => setLinkOpen(false)} /> : null}
      </div>
      <div className="relative">
        <ToolButton buttonRef={imageButton} icon="image" label="Add image" onClick={() => setImageOpen((open) => !open)} />
        {imageOpen ? <ImagePopover editor={editor} anchor={imageButton} onClose={() => setImageOpen(false)} /> : null}
      </div>
    </div>
  );
}

function LinkPopover({
  editor,
  anchor,
  href,
  onClose,
}: {
  editor: Editor;
  anchor: React.RefObject<HTMLButtonElement | null>;
  href: string;
  onClose: () => void;
}) {
  const [value, setValue] = useState(href);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const apply = () => {
    const url = value.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return onClose();
    }
    // A bare address is a website.
    const full = /^[a-z][a-z0-9+.-]*:|^[/#]/i.test(url) ? url : `https://${url}`;
    if (!isSafeHref(full)) return setError("Use an https:// or mailto: address, or a page of this site (/documentation/…).");
    if (editor.state.selection.empty && !editor.isActive("link"))
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: full } }] })
        .run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: full }).run();
    onClose();
  };
  return (
    <Popover open triggerRef={anchor} onClose={onClose} label="Link" className="top-9 left-0">
      <div className="flex w-80 flex-col gap-2 p-2">
        <label htmlFor={id} className="text-meta text-text-muted">
          Link address
        </label>
        <input
          id={id}
          autoFocus
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
          placeholder="https://… or /documentation/…"
          className={recordInput}
        />
        {error ? (
          <p role="alert" className="text-meta text-text-primary">
            {error}
          </p>
        ) : null}
        <p className="flex justify-end gap-2">
          {href ? (
            <AdminButton
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                onClose();
              }}
            >
              Remove link
            </AdminButton>
          ) : null}
          <AdminButton onClick={apply}>Apply</AdminButton>
        </p>
      </div>
    </Popover>
  );
}

function ImagePopover({ editor, anchor, onClose }: { editor: Editor; anchor: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileId = useId();
  const altId = useId();
  const insert = async () => {
    if (!file) return setError("Choose an image.");
    if (!IMAGE_TYPES.includes(file.type)) return setError("Use a PNG, JPEG, WebP or GIF image.");
    if (file.size > IMAGE_MAX_BYTES) return setError("Images can be at most 5 MB.");
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const image = await adminApi<{ id: string }>("/cms/images", { method: "POST", body: form });
      editor
        .chain()
        .focus()
        .insertContent({ type: "image", attrs: { src: adminImageSrc(image.id), alt: alt.trim(), imageId: image.id } })
        .run();
      onClose();
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Couldn't upload the image.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover open triggerRef={anchor} onClose={onClose} label="Image" className="top-9 left-0">
      <div className="flex w-80 flex-col gap-2 p-2">
        <label htmlFor={fileId} className="text-meta text-text-muted">
          Image (PNG, JPEG, WebP or GIF, up to 5 MB)
        </label>
        <input id={fileId} type="file" accept={IMAGE_TYPES.join(",")} onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="text-meta" />
        <label htmlFor={altId} className="text-meta text-text-muted">
          Description, for people who can&rsquo;t see it
        </label>
        <input id={altId} value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={300} className={recordInput} />
        {error ? (
          <p role="alert" className="text-meta text-text-primary">
            {error}
          </p>
        ) : null}
        <p className="flex justify-end">
          <AdminButton onClick={() => void insert()} disabled={busy}>
            {busy ? "Uploading…" : "Insert image"}
          </AdminButton>
        </p>
      </div>
    </Popover>
  );
}
