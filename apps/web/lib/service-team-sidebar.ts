import type { ServiceTeamSummary } from "@/lib/api";

export type ServiceTeamGroup = {
  serviceType: string;
  teams: ServiceTeamSummary[];
};

function primaryServiceType(names?: string[]): string {
  if (!names?.length) return "Other";
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))[0]!;
}

export function groupTeamsByServiceType(teams: ServiceTeamSummary[]): ServiceTeamGroup[] {
  const groups = new Map<string, ServiceTeamSummary[]>();

  for (const team of teams) {
    const section = primaryServiceType(team.serviceTypeNames);
    const bucket = groups.get(section) ?? [];
    bucket.push(team);
    groups.set(section, bucket);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    })
    .map(([serviceType, sectionTeams]) => ({
      serviceType,
      teams: [...sectionTeams].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    }));
}

export function shouldShowTeamServiceSections(groups: ServiceTeamGroup[]): boolean {
  return groups.length > 1 || (groups.length === 1 && groups[0]?.serviceType !== "Other");
}
