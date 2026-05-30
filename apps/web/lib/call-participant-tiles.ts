export type CallTilePeer = {
  id: string;
  customParticipantId?: string;
};

/** One tile per logical participant; never show self twice (RTK joined + self). */
export function buildCallParticipantTiles(
  joined: CallTilePeer[],
  self: CallTilePeer | null | undefined,
  roomJoined: boolean,
): CallTilePeer[] {
  const selfCustomId = self?.customParticipantId?.trim() || null;
  const seen = new Set<string>();
  const peers: CallTilePeer[] = [];

  for (const peer of joined) {
    const customId = peer.customParticipantId?.trim();
    if (customId && customId === selfCustomId) continue;
    const key = customId || peer.id;
    if (seen.has(key)) continue;
    seen.add(key);
    peers.push(peer);
  }

  if (roomJoined && self?.id && !peers.some((peer) => peer.id === self.id)) {
    peers.unshift(self);
  }

  return peers;
}

export function isCallTileSelf(
  peer: CallTilePeer,
  self: CallTilePeer | null | undefined,
): boolean {
  if (!self) return false;
  if (peer.id === self.id) return true;
  const peerCustomId = peer.customParticipantId?.trim();
  const selfCustomId = self.customParticipantId?.trim();
  return Boolean(peerCustomId && selfCustomId && peerCustomId === selfCustomId);
}

export type CallScreenSharePeer = CallTilePeer & {
  name?: string;
  screenShareEnabled?: boolean;
  screenShareTracks?: { video?: MediaStreamTrack | null };
  addListener?: (event: string, handler: () => void) => void;
  removeListener?: (event: string, handler: () => void) => void;
};

/** Active screenshare tiles (self + remote), deduped like participant tiles. */
export function buildCallScreenShareTiles(
  joined: CallScreenSharePeer[],
  self: CallScreenSharePeer | null | undefined,
  roomJoined: boolean,
): { peer: CallScreenSharePeer; isSelf: boolean }[] {
  const tiles: { peer: CallScreenSharePeer; isSelf: boolean }[] = [];
  const seen = new Set<string>();

  const pushIfSharing = (peer: CallScreenSharePeer, isSelf: boolean) => {
    if (!peer.screenShareEnabled || !peer.screenShareTracks?.video) return;
    const key = peer.customParticipantId?.trim() || peer.id;
    if (seen.has(key)) return;
    seen.add(key);
    tiles.push({ peer, isSelf });
  };

  if (roomJoined && self) {
    pushIfSharing(self, true);
  }

  for (const peer of joined) {
    if (isCallTileSelf(peer, self)) continue;
    pushIfSharing(peer, false);
  }

  return tiles;
}
