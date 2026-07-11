import * as React from "react";
import { cn } from "@/lib/cn";

const fieldBase =
  "w-full rounded-xl border border-hairline bg-surface-2 px-3.5 py-2.5 text-sm " +
  "text-ink placeholder:text-faint transition-colors outline-none " +
  "focus:border-accent focus:bg-surface";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldBase, className)} {...props} />;
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(fieldBase, "resize-y leading-relaxed", className)}
      {...props}
    />
  );
});
