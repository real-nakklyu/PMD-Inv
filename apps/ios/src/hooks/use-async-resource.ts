import { useCallback, useEffect, useState } from "react";

export function useAsyncResource<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(
    async (mode: "load" | "refresh" = "refresh") => {
      if (mode === "load") setIsLoading(true);
      if (mode === "refresh") setIsRefreshing(true);

      try {
        const next = await fetcher();
        setData(next);
        setError(null);
        return next;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Something went wrong.");
        return null;
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [fetcher]
  );

  useEffect(() => {
    void refresh("load");
  }, [refresh]);

  return {
    data,
    error,
    isLoading,
    isRefreshing,
    refresh,
    setData,
  };
}
