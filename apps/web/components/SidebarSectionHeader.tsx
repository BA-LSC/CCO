type Props = {
  title: string;
  action?: React.ReactNode;
};

export function SidebarSectionHeader({ title, action }: Props) {
  return (
    <div className={`sidebar-section-header${action ? " sidebar-section-header-has-action" : ""}`}>
      <div className="sidebar-section-header-label">
        <span className="sidebar-section-header-line" aria-hidden="true" />
        <h2 className="sidebar-section-title">{title}</h2>
        <span className="sidebar-section-header-line" aria-hidden="true" />
      </div>
      {action ? <div className="sidebar-section-header-action">{action}</div> : null}
    </div>
  );
}
