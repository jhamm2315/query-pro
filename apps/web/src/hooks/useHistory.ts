import { useState, useEffect, useCallback } from "react";
import { historyApi } from "../lib/api";
import type { ThreadSummary } from "../types";

export function useHistory() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await historyApi.listThreads();
      setThreads(data);
    } catch {
      // silently ignore — sidebar history is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { threads, loading, refresh };
}
