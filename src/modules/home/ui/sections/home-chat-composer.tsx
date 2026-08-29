"use client";

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { ArrowUp, FileText, Paperclip, X } from "lucide-react";
import { type FormEvent, useRef } from "react";

type HomeChatComposerProps = {
  input: string;
  isResponding: boolean;
  error: string | null;
  selectedFile: File | null;
  onFileChange: (file: File | null) => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
};

export function HomeChatComposer({
  input,
  isResponding,
  error,
  selectedFile,
  onFileChange,
  onInputChange,
  onSend,
}: HomeChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSend = Boolean(input.trim() || selectedFile) && !isResponding;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSend) onSend();
  };

  return (
    <form className="mx-auto w-full max-w-3xl" onSubmit={handleSubmit}>
      {selectedFile && (
        <AttachmentGroup className="mb-2">
          <Attachment size="sm">
            <AttachmentMedia>
              <FileText />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{selectedFile.name}</AttachmentTitle>
              <AttachmentDescription>
                {(selectedFile.size / 1024 / 1024).toFixed(1)} MB · PDF
              </AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction
                type="button"
                aria-label="移除附件"
                onClick={() => onFileChange(null)}
              >
                <X />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        </AttachmentGroup>
      )}

      <InputGroup className="rounded-2xl bg-card shadow-sm">
        <InputGroupTextarea
          value={input}
          aria-label="聊天消息"
          placeholder="输入消息，Shift + Enter 换行"
          className="min-h-24 max-h-48 px-4 pt-3"
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <InputGroupAddon
          align="block-end"
          className="justify-between px-3 pb-3"
        >
          <div className="flex items-center gap-1">
            <InputGroupButton
              size="icon-sm"
              aria-label="添加 PDF"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip />
            </InputGroupButton>
            <span className="text-xs font-normal text-muted-foreground">
              支持 PDF
            </span>
            <input
              ref={fileInputRef}
              hidden
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => {
                onFileChange(event.target.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
          </div>
          <InputGroupButton
            type="submit"
            size="icon-sm"
            variant="default"
            aria-label="发送消息"
            disabled={!canSend}
            className="rounded-full"
          >
            {isResponding ? <Spinner /> : <ArrowUp />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : (
          "AI 可能会犯错，请核对重要信息。"
        )}
      </p>
    </form>
  );
}
