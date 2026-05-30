import { notFound } from "next/navigation";
import { ModuleScreen } from "@/components/modules/ModuleScreen";
import { getModuleConfig } from "@/lib/tables";

export default function Page() {
  const config = getModuleConfig("eventos");
  if (!config) notFound();
  return <ModuleScreen config={config} />;
}
