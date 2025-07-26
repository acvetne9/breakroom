import { useState, useMemo } from 'react';

export const usePagination = <T,>(items: T[], itemsPerPage: number = 20) => {
  const [currentPage, setCurrentPage] = useState(1);

  const paginatedItems = useMemo(() => {
    const startIndex = 0;
    const endIndex = currentPage * itemsPerPage;
    return items.slice(startIndex, endIndex);
  }, [items, currentPage, itemsPerPage]);

  const hasMore = currentPage * itemsPerPage < items.length;

  const loadMore = () => {
    if (hasMore) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const reset = () => {
    setCurrentPage(1);
  };

  return {
    items: paginatedItems,
    hasMore,
    loadMore,
    reset,
    currentPage
  };
};