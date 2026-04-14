import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";
import type { Dialect } from "../types";
import { DialectSelector } from "./DialectSelector";
import { MicButton } from "./MicButton";
import { SchemaUpload } from "./SchemaUpload";

interface Props {
  onSubmit: (prompt: string, dialect: Dialect, schemaContext?: string) => void;
  loading: boolean;
  fillPrompt?: string;
  onFillPromptConsumed?: () => void;
}

export function PromptInput({ onSubmit, loading, fillPrompt, onFillPromptConsumed }: Props) {
  const [prompt, setPrompt] = useState("");
  const [dialect, setDialect] = useState<Dialect>("postgresql");
  const [schemaContext, setSchemaContext] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (fillPrompt) {
      setPrompt(fillPrompt);
      textareaRef.current?.focus();
      onFillPromptConsumed?.();
    }
  }, [fillPrompt, onFillPromptConsumed]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed, dialect, schemaContext.trim() || undefined);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleTranscript = (text: string) => {
    setPrompt((prev) => (prev ? prev + " " + text : text));
    textareaRef.current?.focus();
  };

  const charCount = prompt.length;

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-2">
      <SchemaUpload value={schemaContext} onChange={setSchemaContext} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-lg focus-within:border-brand-500 transition-colors">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          placeholder="Use voice dictation or type the business question — e.g. 'Find the latest invoice per vendor where total spend is over 10k'"
          disabled={loading}
          className="
            w-full bg-transparent text-gray-100 placeholder-gray-500
            resize-none rounded-2xl px-5 pt-4 pb-14 text-sm leading-relaxed
            focus:outline-none disabled:opacity-60
          "
          aria-label="Business question"
        />

        {/* Bottom toolbar */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MicButton onTranscript={handleTranscript} disabled={loading} />
            <DialectSelector value={dialect} onChange={setDialect} />
            <span className="text-xs text-gray-600 hidden sm:inline">
              {charCount > 0 ? `${charCount} chars` : ""}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 hidden sm:inline">⌘↩ to run</span>
            <button
              type="submit"
              disabled={!prompt.trim() || loading}
              className="
                flex items-center gap-2 bg-brand-600 hover:bg-brand-500
                text-white text-sm font-medium px-4 py-2 rounded-xl
                transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-brand-400
              "
            >
              {loading ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288z" />
                  </svg>
                  Generate SQL
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
