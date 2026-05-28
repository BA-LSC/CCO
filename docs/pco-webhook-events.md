# PCO Webhook Events — CCO Reference

Last probed: 2026-05-28 via [Planning Center Webhooks docs](https://api.planningcenteronline.com/docs/overview/webhooks) and PCO webhook subscription UI.

## CCO subscribed events

Configure these in Planning Center → API → Webhooks. Secret order must match Admin Settings / install wizard (`PCO_WEBHOOK_SUBSCRIPTIONS` in `@cco/shared`).

| Event | Purpose |
|-------|---------|
| `groups.v2.events.membership.created` | Add member to local group + conversation |
| `groups.v2.events.membership.updated` | Update membership role / re-add |
| `groups.v2.events.membership.destroyed` | Remove member from group + conversations |
| `people.v2.events.person.updated` | Sync display name, email, avatar |
| `people.v2.events.person.created` | Create local user before first login |

Endpoint: `https://api.<your-domain>/webhooks/pco`

## Unavailable — Services team roster

Planning Center does **not** publish webhook events for Services team roster changes. The following were checked and are **not** available for subscription:

- `services.v2.events.team.updated`
- `services.v2.events.team_leader.*`
- `services.v2.events.person_team_position_assignment.*`

Team membership freshness relies on:

- User login / admin PCO sync (`syncServiceTeamsFromPco`)
- Leader roster sync on team settings (`?sync=1` / `syncServiceTeamRoster`)
- Nightly reconcile (`reconcileStaleMemberships` → team list + throttled leader rosters)

Groups product webhooks cover membership; Services has REST APIs only for team positions and assignments.
