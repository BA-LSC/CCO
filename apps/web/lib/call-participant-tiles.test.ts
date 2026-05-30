import { describe, expect, it } from "vitest";
import {
  buildCallParticipantTiles,
  buildCallScreenShareTiles,
  isCallTileSelf,
} from "./call-participant-tiles";

const USER_ID = "user-1";

describe("buildCallParticipantTiles", () => {
  it("drops joined peer that matches self customParticipantId", () => {
    const self = { id: "self-rtk", customParticipantId: USER_ID };
    const joined = [{ id: "ghost-rtk", customParticipantId: USER_ID, name: "Brian" }];

    const tiles = buildCallParticipantTiles(joined, self, true);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]?.id).toBe("self-rtk");
  });

  it("keeps other participants and self", () => {
    const self = { id: "self-rtk", customParticipantId: USER_ID };
    const joined = [{ id: "peer-rtk", customParticipantId: "user-2" }];

    const tiles = buildCallParticipantTiles(joined, self, true);
    expect(tiles).toHaveLength(2);
    expect(tiles[0]?.id).toBe("self-rtk");
    expect(tiles[1]?.id).toBe("peer-rtk");
  });

  it("does not add self when room is not joined", () => {
    const self = { id: "self-rtk", customParticipantId: USER_ID };
    expect(buildCallParticipantTiles([], self, false)).toHaveLength(0);
  });
});

describe("buildCallScreenShareTiles", () => {
  const videoTrack = { id: "screen-v1" } as MediaStreamTrack;

  it("includes self when sharing screen", () => {
    const self = {
      id: "self-rtk",
      customParticipantId: USER_ID,
      screenShareEnabled: true,
      screenShareTracks: { video: videoTrack },
    };
    const tiles = buildCallScreenShareTiles([], self, true);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]?.isSelf).toBe(true);
  });

  it("includes remote peer screen share and skips self duplicate in joined", () => {
    const self = {
      id: "self-rtk",
      customParticipantId: USER_ID,
      screenShareEnabled: false,
      screenShareTracks: { video: undefined },
    };
    const joined = [
      {
        id: "peer-rtk",
        customParticipantId: "user-2",
        screenShareEnabled: true,
        screenShareTracks: { video: videoTrack },
      },
    ];
    const tiles = buildCallScreenShareTiles(joined, self, true);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]?.peer.id).toBe("peer-rtk");
    expect(tiles[0]?.isSelf).toBe(false);
  });
});

describe("isCallTileSelf", () => {
  it("matches by customParticipantId when RTK ids differ", () => {
    const self = { id: "a", customParticipantId: USER_ID };
    const peer = { id: "b", customParticipantId: USER_ID };
    expect(isCallTileSelf(peer, self)).toBe(true);
  });
});
