import { notFound } from "next/navigation";
import { StockScreen } from "@/components/modules/StockScreen";
import { getModuleConfig } from "@/lib/tables";

export default function Page() {
  const config = getModuleConfig("estoque");
  if (!config) notFound();
  return <StockScreen config={config} />;
}
