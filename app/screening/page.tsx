import type { Metadata } from "next";
import SelfScreening from "@/components/SelfScreening";

export const metadata: Metadata = {
  title: "Wellbeing Self-Check · TIFEC",
  description: "A private, on-device wellbeing self-check. Your answers are never saved or sent.",
};

// Public, no login. Nothing is stored or transmitted - results are computed in
// the browser and shown only to the person filling it out.
export default function ScreeningPage() {
  return (
    <div className="container container-form">
      <SelfScreening />
    </div>
  );
}
