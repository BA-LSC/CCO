"use client";

import { UserAvatarWithPresence } from "@/components/UserAvatarWithPresence";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { usePresenceWatch } from "@/components/PresenceProvider";
import { resolveMemberAvatarUrl } from "@/lib/member-avatar";

export type PresenceMember = {
  id?: string;
  displayName: string;
  avatarUrl?: string | null;
};

type Props = {
  title?: string;
  members: PresenceMember[];
  enabled?: boolean;
};

export function PresenceMembersSection({
  title = "Members",
  members,
  enabled = true,
}: Props) {
  const { session } = useChatLayout();
  usePresenceWatch(
    members.map((member) => member.id),
    enabled && members.length > 0,
  );

  if (members.length === 0) return null;

  return (
    <section className="channel-settings-group" aria-label={title}>
      <div className="channel-settings-group-heading">
        <h3 className="channel-settings-group-label">{title}</h3>
      </div>
      <div className="channel-settings-card">
        <ul className="channel-member-list">
          {members.map((member) => (
            <li key={member.id ?? member.displayName}>
              <div className="channel-member-row">
                <UserAvatarWithPresence
                  userId={member.id}
                  displayName={member.displayName}
                  avatarUrl={resolveMemberAvatarUrl(member, session)}
                  className="channel-member-avatar"
                />
                <span className="channel-member-name">{member.displayName}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
