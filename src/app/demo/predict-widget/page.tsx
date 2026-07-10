// Standalone preview of the Predict hero (now the shared Hero component used on
// the home page). Kept for isolated iteration; width:100% so `main` fills its
// max-width (it would otherwise shrink to the hero's content width).

import { Hero } from "@/components/hero";

export default function PredictWidgetDemo() {
  return (
    <main style={{ width: "100%" }}>
      <Hero />
    </main>
  );
}
