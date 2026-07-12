"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

interface AvatarUploadProps {
  botId: string;
  value: string;
  onChange: (url: string) => void;
}

export function AvatarUpload({ botId, value, onChange }: AvatarUploadProps) {
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/bots/${botId}/avatar`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Upload failed.");
      }
      onChange(data.url as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void upload(file);
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-hairline-strong bg-surface-2 p-4 transition-colors",
          dragOver && "border-foreground bg-muted"
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="Avatar preview"
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="grid h-12 w-12 place-items-center rounded-full bg-surface text-xs text-faint">
            None
          </div>
        )}
        <div className="text-sm text-muted">
          {uploading
            ? "Uploading…"
            : "Click or drag an image here (PNG, JPEG, WEBP, max 2MB)"}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange("")}
        >
          Remove
        </Button>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
