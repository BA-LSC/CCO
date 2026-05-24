"use client";

import { useChatLayout } from "@/components/ChatLayoutContext";
import { UserAvatar } from "@/components/UserAvatar";
import { resolveMemberAvatarUrl } from "@/lib/member-avatar";

export type MentionMember = {
  id?: string;
  displayName: string;
  onCco?: boolean;
  avatarUrl?: string | null;
};

function memberCanMention(member: MentionMember): boolean {
  return Boolean(member.id && member.onCco !== false);
}

type Props = {
  members: MentionMember[];
  onSelect: (member: MentionMember) => void;
};

export function MentionSuggestions({ members, onSelect }: Props) {
  const { session } = useChatLayout();

  if (members.length === 0) return null;

  return (
    <ul className="mention-suggestions" role="listbox" aria-label="Mention suggestions">
      {members.slice(0, 8).map((member) => {
        const canMention = memberCanMention(member);
        return (
          <li key={member.id ?? member.displayName}>
            <button
              type="button"
              role="option"
              className={canMention ? undefined : "mention-suggestion--pending"}
              disabled={!canMention}
              aria-disabled={!canMention}
              onMouseDown={(event) => {
                if (!canMention) return;
                event.preventDefault();
                onSelect(member);
              }}
            >
              <span className="mention-suggestion-main">
                <UserAvatar
                  displayName={member.displayName}
                  avatarUrl={resolveMemberAvatarUrl(member, session)}
                  className="mention-suggestion-avatar"
                />
                <span className="mention-suggestion-copy">
                  <span className="mention-suggestion-name">{member.displayName}</span>
                  {!canMention ? (
                    <span className="mention-suggestion-hint">Not on CCO yet</span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
