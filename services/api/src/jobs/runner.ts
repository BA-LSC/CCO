import { reconcileStaleMemberships } from "./reconcile";

async function main(): Promise<void> {
  const result = await reconcileStaleMemberships();
  console.log(`Reconciliation complete: removed ${result.removed} stale memberships`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
