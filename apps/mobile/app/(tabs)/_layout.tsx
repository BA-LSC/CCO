import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="groups" options={{ title: "Groups" }} />
    </Tabs>
  );
}
