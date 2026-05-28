import { SidebarSectionHeader } from "@/components/SidebarSectionHeader";

const GROUP_ROWS = 2;
const CHANNEL_ROWS = 2;
const DM_ROWS = 3;
const TEAM_ROWS = 2;

export function SidebarSkeleton() {
  return (
    <div className="sidebar-skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">Loading sidebar</span>

      <section className="sidebar-section sidebar-section-indented" aria-hidden>
        <SidebarSectionHeader title="Groups" />
        <ul className="sidebar-list">
          {Array.from({ length: GROUP_ROWS }, (_, groupIndex) => (
            <li key={groupIndex} className="sidebar-group">
              <div className="sidebar-group-block">
                <div className="sidebar-group-header">
                  <span className="sidebar-skeleton-avatar sidebar-group-avatar" />
                  <span className="sidebar-skeleton-label sidebar-skeleton-label-group" />
                  <span
                    className="sidebar-group-menu-trigger sidebar-skeleton-icon"
                    aria-hidden
                  />
                </div>
              </div>
              <ul className="sidebar-nested">
                {Array.from({ length: CHANNEL_ROWS }, (_, channelIndex) => (
                  <li key={channelIndex}>
                    <div className="sidebar-item sidebar-team-item sidebar-skeleton-team-row">
                      <div className="sidebar-team-row">
                        <span className="sidebar-channel-prefix sidebar-channel-prefix-hash">#</span>
                        <span className="sidebar-skeleton-label sidebar-skeleton-label-team" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="sidebar-section sidebar-section-messages" aria-hidden>
        <SidebarSectionHeader title="Messages" />
        <ul className="sidebar-list">
          {Array.from({ length: DM_ROWS }, (_, dmIndex) => (
            <li key={dmIndex}>
              <div className="sidebar-item sidebar-dm-item sidebar-skeleton-dm-row">
                <div className="sidebar-dm-row">
                  <span className="sidebar-skeleton-avatar sidebar-dm-avatar" />
                  <span className="sidebar-skeleton-label sidebar-skeleton-label-dm" />
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="sidebar-item sidebar-dm-item sidebar-new-message-btn sidebar-skeleton-dm-row" aria-hidden>
          <div className="sidebar-dm-row">
            <span className="sidebar-skeleton-label sidebar-skeleton-label-dm sidebar-new-message-label" />
          </div>
        </div>
      </section>

      <section className="sidebar-section sidebar-section-teams" aria-hidden>
        <SidebarSectionHeader title="Teams" />
        <div className="sidebar-team-groups">
          <div className="sidebar-team-service-block">
            <h3 className="sidebar-team-service-heading">
              <span className="sidebar-skeleton-label sidebar-skeleton-label-team-heading" />
            </h3>
            <ul className="sidebar-list">
              {Array.from({ length: TEAM_ROWS }, (_, teamIndex) => (
                <li key={teamIndex}>
                  <div className="sidebar-item sidebar-team-item sidebar-skeleton-team-row">
                    <div className="sidebar-team-row">
                      <span className="sidebar-channel-prefix sidebar-channel-prefix-hash">#</span>
                      <span className="sidebar-skeleton-label sidebar-skeleton-label-team" />
                      {teamIndex === 0 ? (
                        <span className="sidebar-nested-trailing">
                          <span className="sidebar-team-leader sidebar-skeleton-icon" aria-hidden />
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
