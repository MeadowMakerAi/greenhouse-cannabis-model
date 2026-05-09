import { ScenarioProvider } from "./context/ScenarioContext";
import { SimulationProvider } from "./context/SimulationContext";
import DashboardLayout from "./components/DashboardLayout";
import Chatbot from "./components/Chatbot";

export default function App() {
  return (
    <ScenarioProvider>
      <SimulationProvider>
        <DashboardLayout />
        <Chatbot />
      </SimulationProvider>
    </ScenarioProvider>
  );
}
