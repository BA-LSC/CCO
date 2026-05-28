import { describe, expect, it } from "vitest";
import {
  mergeServiceTeamRoster,
  mergeServiceTeams,
  parseMyServiceTeamsResponse,
  parseServiceTeamAssignmentsRoster,
  parseServiceTeamPeopleRoster,
  parseTeamLeadersResponse,
  parseTeamServiceTypesResponse,
} from "./services";

describe("parseMyServiceTeamsResponse", () => {
  it("dedupes teams from person assignments", () => {
    const teams = parseMyServiceTeamsResponse({
      data: [
        {
          type: "PersonTeamPositionAssignment",
          id: "1",
          relationships: { team_position: { data: { type: "TeamPosition", id: "p1" } } },
        },
        {
          type: "PersonTeamPositionAssignment",
          id: "2",
          relationships: { team_position: { data: { type: "TeamPosition", id: "p2" } } },
        },
      ],
      included: [
        {
          type: "TeamPosition",
          id: "p1",
          relationships: { team: { data: { type: "Team", id: "t1" } } },
        },
        {
          type: "TeamPosition",
          id: "p2",
          relationships: { team: { data: { type: "Team", id: "t1" } } },
        },
        {
          type: "Team",
          id: "t1",
          attributes: { name: "Audio" },
        },
      ],
    });

    expect(teams).toEqual([{ pcoTeamId: "t1", name: "Audio", role: "member" }]);
  });
});

describe("parseTeamLeadersResponse", () => {
  it("returns leader teams", () => {
    const teams = parseTeamLeadersResponse({
      data: [
        {
          type: "TeamLeader",
          id: "1",
          relationships: { team: { data: { type: "Team", id: "t2" } } },
        },
      ],
      included: [{ type: "Team", id: "t2", attributes: { name: "Worship" } }],
    });

    expect(teams).toEqual([{ pcoTeamId: "t2", name: "Worship", role: "leader" }]);
  });
});

describe("parseTeamServiceTypesResponse", () => {
  it("returns the included service type name", () => {
    const names = parseTeamServiceTypesResponse({
      data: {
        relationships: { service_type: { data: { id: "st1" } } },
      },
      included: [{ type: "ServiceType", id: "st1", attributes: { name: "Sunday Service" } }],
    });

    expect(names).toEqual(["Sunday Service"]);
  });
});

describe("parseServiceTeamAssignmentsRoster", () => {
  it("dedupes people from team assignments", () => {
    const roster = parseServiceTeamAssignmentsRoster({
      data: [
        {
          type: "PersonTeamPositionAssignment",
          id: "1",
          relationships: { person: { data: { id: "p1" } } },
        },
        {
          type: "PersonTeamPositionAssignment",
          id: "2",
          relationships: { person: { data: { id: "p1" } } },
        },
      ],
      included: [
        {
          type: "Person",
          id: "p1",
          attributes: { first_name: "Jamie", last_name: "Lee", email: "jamie@example.com" },
        },
      ],
    });

    expect(roster).toEqual([
      {
        pcoPersonId: "p1",
        displayName: "Jamie Lee",
        email: "jamie@example.com",
        avatarUrl: null,
        role: "member",
      },
    ]);
  });
});

describe("parseServiceTeamPeopleRoster", () => {
  it("includes team people without position assignments", () => {
    const roster = parseServiceTeamPeopleRoster([
      {
        type: "Person",
        id: "p9",
        attributes: { first_name: "Jonah", last_name: "Lewis", email: "jonah@example.com" },
      },
    ]);

    expect(roster).toEqual([
      {
        pcoPersonId: "p9",
        displayName: "Jonah Lewis",
        email: "jonah@example.com",
        avatarUrl: null,
        role: "member",
      },
    ]);
  });
});

describe("mergeServiceTeamRoster", () => {
  it("merges direct team people with position assignments", () => {
    const merged = mergeServiceTeamRoster(
      [
        {
          pcoPersonId: "p1",
          displayName: "Jamie Lee",
          email: "jamie@example.com",
          avatarUrl: null,
          role: "member",
        },
      ],
      [
        {
          pcoPersonId: "p9",
          displayName: "Jonah Lewis",
          email: "jonah@example.com",
          avatarUrl: null,
          role: "member",
        },
      ],
    );

    expect(merged.map((member) => member.displayName).sort()).toEqual(["Jamie Lee", "Jonah Lewis"]);
  });
});

describe("mergeServiceTeams", () => {
  it("includes leader-only teams and upgrades assigned teams to leader", () => {
    const merged = mergeServiceTeams(
      [{ pcoTeamId: "t1", name: "Audio", role: "member" }],
      [
        { pcoTeamId: "t1", name: "Audio", role: "leader" },
        { pcoTeamId: "t2", name: "Worship", role: "leader" },
      ],
    );

    expect(merged).toEqual([
      { pcoTeamId: "t1", name: "Audio", role: "leader" },
      { pcoTeamId: "t2", name: "Worship", role: "leader" },
    ]);
  });
});
