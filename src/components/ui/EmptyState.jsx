export function EmptyState({ title, children }) {
  return (
    <div className="empty-state">
      <div className="empty-mark">A</div>
      <div>
        <p className="item-title">{title}</p>
        <p className="muted">{children}</p>
      </div>
    </div>
  );
}
