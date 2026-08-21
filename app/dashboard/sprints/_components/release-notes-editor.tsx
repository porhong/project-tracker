"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/core";
import { BoldIcon, Heading2Icon, Heading3Icon, ItalicIcon, ListIcon, ListOrderedIcon, QuoteIcon, Redo2Icon, StrikethroughIcon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Json } from "@/lib/supabase/database.types";

type ReleaseNotesEditorProps = {
  content: Json;
  editable?: boolean;
  onChange?: (content: Json) => void;
};

type ToolbarButtonProps = {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
};

function ToolbarButton({ active, disabled, label, onClick, children }: ToolbarButtonProps) {
  return <Button type="button" variant={active ? "secondary" : "ghost"} size="icon-sm" aria-label={label} aria-pressed={active} title={label} disabled={disabled} onClick={onClick}>{children}</Button>;
}

export function ReleaseNotesEditor({ content, editable = false, onChange }: ReleaseNotesEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ code: false, codeBlock: false, heading: { levels: [2, 3] }, link: false, underline: false })],
    content: content as JSONContent,
    editable,
    immediatelyRender: false,
    enableContentCheck: true,
    onUpdate: ({ editor: updatedEditor }) => onChange?.(updatedEditor.getJSON() as Json),
  });

  if (!editor) return <div className="min-h-44 rounded-2xl border bg-muted/40" aria-busy="true" />;

  return <div className="overflow-hidden rounded-2xl border">
    {editable ? <div className="flex flex-wrap gap-1 border-b bg-muted/40 p-1" aria-label="Release notes formatting toolbar">
      <ToolbarButton label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2Icon /></ToolbarButton>
      <ToolbarButton label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2Icon /></ToolbarButton>
      <ToolbarButton label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2Icon /></ToolbarButton>
      <ToolbarButton label="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3Icon /></ToolbarButton>
      <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><BoldIcon /></ToolbarButton>
      <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><ItalicIcon /></ToolbarButton>
      <ToolbarButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><StrikethroughIcon /></ToolbarButton>
      <ToolbarButton label="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><ListIcon /></ToolbarButton>
      <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrderedIcon /></ToolbarButton>
      <ToolbarButton label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><QuoteIcon /></ToolbarButton>
    </div> : null}
    <EditorContent editor={editor} className="min-h-44 px-4 py-3 text-sm [&_.ProseMirror]:min-h-36 [&_.ProseMirror]:outline-none [&_.ProseMirror_blockquote]:my-3 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_h2]:my-3 [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h3]:my-2 [&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_p]:my-2 [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6" />
  </div>;
}
