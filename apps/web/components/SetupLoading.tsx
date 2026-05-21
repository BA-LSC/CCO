import { LoadingState } from "@/components/PageStates";
import { SetupThemeShell } from "@/components/SetupThemeShell";

type Props = {
  label?: string;
};

export function SetupLoading({ label = "Loading" }: Props) {
  return (
    <SetupThemeShell>
      <LoadingState variant="page" label={label} />
    </SetupThemeShell>
  );
}
