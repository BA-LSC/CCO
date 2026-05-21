"use client";

import { UserAvatar } from "@/components/UserAvatar";

export type ChannelMember = {
  id?: string;
  pcoPersonId: string;
  displayName: string;
  role: string;
  avatarUrl?: string | null;
  onCco: boolean;
  email?: string | null;
};

export function channelMemberCountLabel(members: ChannelMember[], isLeader: boolean): string {
  const total = members.length;
  const userWord = total === 1 ? "user" : "users";

  if (!isLeader) {
    return `${total} ${userWord}`;
  }

  const onCcoCount = members.filter((member) => member.onCco).length;
  if (onCcoCount < total) {
    return `${onCcoCount} / ${total} users`;
  }

  return `${total} ${userWord}`;
}

function isMemberLeaderRole(role: string): boolean {
  return role === "leader" || role === "admin";
}

type ChannelAccessProps = {
  channelAccessIds: string[];
  onToggleAccess: (userId: string, hasAccess: boolean) => void;
};

type Props = {
  title: string;
  members: ChannelMember[];
  isLeader: boolean;
  sessionUserId?: string;
  inviteFeedback?: string | null;
  removingMemberId?: string | null;
  onInvite?: (member: ChannelMember) => void;
  onRemove?: (memberId: string, displayName: string) => void;
  channelAccess?: ChannelAccessProps;
};

export function ChannelMembersSection({
  title,
  members,
  isLeader,
  sessionUserId,
  inviteFeedback,
  removingMemberId,
  onInvite,
  onRemove,
  channelAccess,
}: Props) {
  if (members.length === 0) return null;

  const countLabel = channelMemberCountLabel(members, isLeader);

  return (
    <section className="channel-settings-group" aria-label={title}>
      <div className="channel-settings-group-heading">
        <h3 className="channel-settings-group-label">
          {`${title} · ${countLabel}`}
        </h3>
      </div>
      {inviteFeedback && (
        <p className="channel-settings-invite-feedback" role="status">
          {inviteFeedback}
        </p>
      )}
      <div className="channel-settings-card">
        <ul className="channel-member-list">
          {members.map((member) => {
            const isGroupLeader = isMemberLeaderRole(member.role);
            const canManageAccess = Boolean(
              channelAccess && member.onCco && member.id && !isGroupLeader,
            );
            const hasAccess = canManageAccess
              ? channelAccess!.channelAccessIds.includes(member.id!)
              : false;

            return (
              <li key={member.id ?? member.pcoPersonId}>
                <div
                  className={`channel-member-row ${!member.onCco ? "channel-member-row--pending" : ""} ${channelAccess ? "channel-member-row--with-access" : ""}`}
                >
                  {channelAccess && !isGroupLeader && (
                    canManageAccess ? (
                      <label className="channel-member-access-toggle channel-settings-toggle">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={hasAccess}
                          onChange={(e) =>
                            channelAccess.onToggleAccess(member.id!, e.target.checked)
                          }
                          aria-label={`${member.displayName} can access this channel`}
                        />
                        <span className="toggle-switch" aria-hidden="true" />
                      </label>
                    ) : (
                      <label className="channel-member-access-toggle channel-member-access-toggle--disabled channel-settings-toggle">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={false}
                          disabled
                          aria-label={`${member.displayName} has not joined CCO`}
                        />
                        <span className="toggle-switch" aria-hidden="true" />
                      </label>
                    )
                  )}
                  <UserAvatar
                    displayName={member.displayName}
                    avatarUrl={member.avatarUrl}
                    className="channel-member-avatar"
                  />
                  <span className="channel-member-name">{member.displayName}</span>
                  {member.role !== "member" && (
                    <span className="channel-access-role">{member.role}</span>
                  )}
                  {isLeader && !member.onCco && onInvite && (
                    <button
                      type="button"
                      className="channel-member-invite"
                      onClick={() => onInvite(member)}
                    >
                      Invite
                    </button>
                  )}
                  {isLeader &&
                    member.onCco &&
                    member.id &&
                    member.id !== sessionUserId &&
                    onRemove && (
                      <button
                        type="button"
                        className="channel-member-remove"
                        disabled={removingMemberId === member.id}
                        onClick={() => void onRemove(member.id!, member.displayName)}
                      >
                        {removingMemberId === member.id ? "Removing…" : "Remove"}
                      </button>
                    )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
