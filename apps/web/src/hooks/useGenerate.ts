import { useState, useCallback } from "react";
import { sqlApi, type GenerateRequest } from "../lib/api";
import type { GenerateResponse } from "../types";

interface UseGenerateState {
  data: GenerateResponse | null;
  loading: boolean;
  error: string | null;
}

export function useGenerate() {
  const [state, setState] = useState<UseGenerateState>({
    data: null,
    loading: false,
    error: null,
  });

  const generate = useCallback(async (req: GenerateRequest) => {
    setState({ data: null, loading: true, error: null });
    try {
      const data = await sqlApi.generate(req);
      setState({ data, loading: false, error: null });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setState({ data: null, loading: false, error: message });
      return null;
    }
  }, []);

  return { ...state, generate };
}
