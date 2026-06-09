import { useEffect, useMemo, useState } from "react";

export function usePagination<T>(items: T[], pageSize: number, resetKey?: string | number) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [resetKey, items.length]);

  return {
    page: safePage,
    setPage,
    totalPages,
    pageItems,
    total: items.length,
  };
}
