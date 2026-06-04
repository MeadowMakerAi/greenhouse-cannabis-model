import { useEffect, useState } from "react";
import { ScenarioProvider } from "./context/ScenarioContext";
import { SimulationProvider } from "./context/SimulationContext";
import DashboardLayout from "./components/DashboardLayout";
import Chatbot from "./components/Chatbot";
import AgentObservations from "./components/AgentObservations";
import LandingScreen from "./components/LandingScreen";
import { useEquipmentPhysics } from "./context/useEquipmentPhysics";

function PhysicsHooks() {
  useEquipmentPhysics();
  return null;
}

const LANDING_DISMISSED_KEY = "greenhouse-model:landingDismissed";

export default function App() {
  // Default: show landing on first visit, skip on subsequent. The dashboard
  // header's brand mark also serves as a return path back to the landing
  // (see DashboardLayout — clicking the mark clears the preference).
  const [showLanding, setShowLanding] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(LANDING_DISMISSED_KEY) !== "true";
  });

  // Listen for an in-app "show landing again" event so any UI element can
  // open it without prop-drilling.
  useEffect(() => {
    const handler = () => setShowLanding(true);
    window.addEventListener("greenhouse-model:show-landing", handler);
    return () =>
      window.removeEventListener("greenhouse-model:show-landing", handler);
  }, []);

  const launch = () => {
    localStorage.setItem(LANDING_DISMISSED_KEY, "true");
    setShowLanding(false);
  };

  if (showLanding) {
    return <LandingScreen onLaunch={launch} />;
  }

  return (
    <ScenarioProvider>
      <SimulationProvider>
        <PhysicsHooks />
        <DashboardLayout />
        <AgentObservations />
        <Chatbot />
      </SimulationProvider>
    </ScenarioProvider>
  );
}
