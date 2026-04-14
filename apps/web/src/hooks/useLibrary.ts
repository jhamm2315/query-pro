import { useState, useEffect, useCallback } from "react";
import { libraryApi } from "../lib/api";
import type { SavedQuery } from "../types";

export function useLibrary() {
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);

  const refresh = useCallback(async () => {
    try {
      setSavedQueries(await libraryApi.list());
    } catch {
      // silently ignore — library is non-critical
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { savedQueries, refresh };
}
