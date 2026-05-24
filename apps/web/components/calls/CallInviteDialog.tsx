"use client";

import { useEffect, useState } from "react";
import { inviteToCall, searchCallInviteCandidates } from "@/lib/calls-api";
import type { CallInviteCandidateDto } from "@cco/shared/calls";

type Props = {
  callId: string;
  onClose: () => void;
};

export function CallInviteDialog({ callId, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<CallInviteCandidateDto[]>([]);
  const [guestLink, setGuestLink] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      void searchCallInviteCandidates(query || undefined)
        .then((res) => setPeople(res.people))
        .catch(() => setPeople([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  async function invitePerson(person: CallInviteCandidateDto) {
    if (!person.id) return;
    setLoading(true);
    setFeedback(null);
    try {
      await inviteToCall({ callId, targetUserId: person.id });
      setFeedback(`Invited ${person.displayName}`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setLoading(false);
    }
  }

  async function createGuestLink() {
    setLoading(true);
    setFeedback(null);
    try {
      const result = await inviteToCall({ callId, externalGuest: true });
      if (result.inviteUrl) {
        setGuestLink(result.inviteUrl);
        await navigator.clipboard.writeText(result.inviteUrl);
        setFeedback("Guest link copied to clipboard");
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Could not create guest link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="call-invite-dialog-backdrop" onClick={onClose} role="presentation">
      <div
        className="call-invite-dialog"
        role="dialog"
        aria-label="Invite to call"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="call-invite-dialog-header">
          <h2>Invite to call</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </header>

        <input
          className="integrations-input"
          placeholder="Search org members…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <ul className="call-invite-list">
          {people.map((person) => (
            <li key={`${person.source}-${person.id ?? person.displayName}`}>
              <span>
                {person.displayName}
                {!person.onCco ? " (not on CCO yet)" : ""}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={loading || !person.id}
                onClick={() => void invitePerson(person)}
              >
                Invite
              </button>
            </li>
          ))}
        </ul>

        <div className="call-invite-dialog-footer">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loading}
            onClick={() => void createGuestLink()}
          >
            Copy guest link
          </button>
          {guestLink ? <p className="call-invite-link">{guestLink}</p> : null}
          {feedback ? <p className="integrations-feedback integrations-feedback--success">{feedback}</p> : null}
        </div>
      </div>
    </div>
  );
}
