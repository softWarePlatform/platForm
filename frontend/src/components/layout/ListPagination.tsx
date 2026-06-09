type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export default function ListPagination({ page, pageSize, total, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <nav className="list-pagination" aria-label="列表分页">
      <button
        type="button"
        className="btn list-pagination__btn"
        disabled={safePage <= 1}
        onClick={() => onPageChange(safePage - 1)}
      >
        上一页
      </button>
      <span className="list-pagination__info">
        {from}–{to} / {total}
      </span>
      <button
        type="button"
        className="btn list-pagination__btn"
        disabled={safePage >= totalPages}
        onClick={() => onPageChange(safePage + 1)}
      >
        下一页
      </button>
    </nav>
  );
}
