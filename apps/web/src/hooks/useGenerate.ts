import { useState, useCallback } from "react";
import { streamGenerate, type GenerateRequest } from "../lib/api";
import type { GenerateResponse } from "../types";

interface UseGenerateState {
  data: GenerateResponse | null;
  loading: boolean;
  streaming: boolean;
  streamingTokens: string;
  error: string | null;
}

export function useGenerate() {
  const [state, setState] = useState<UseGenerateState>({
    data: null,
    loading: false,
    streaming: false,
    streamingTokens: "",
    error: null,
  });

  const generate = useCallback(async (req: GenerateRequest) => {
    setState({ data: null, loading: true, streaming: true, streamingTokens: "", error: null });
    try {
      let result: GenerateResponse | null = null;

      for await (const chunk of streamGenerate(req)) {
        if (chunk.type === "token") {
          setState((prev) => ({ ...prev, streamingTokens: prev.streamingTokens + chunk.text }));
        } else if (chunk.type === "done") {
          result = {
            thread_id: chunk.thread_id,
            turn_id: chunk.turn_id,
            plan: chunk.plan,
            sql: chunk.sql,
            optimized_sql: null,
            short_explanation: chunk.short_explanation,
            explanation: chunk.short_explanation,
            meeting_mode: "",
            validation: chunk.validation,
            dialect: chunk.dialect,
          };
        } else if (chunk.type === "error") {
          throw new Error(chunk.message);
        }
      }

      setState({ data: result, loading: false, streaming: false, streamingTokens: "", error: null });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setState({ data: null, loading: false, streaming: false, streamingTokens: "", error: message });
      return null;
    }
  }, []);

  return { ...state, generate };
}
