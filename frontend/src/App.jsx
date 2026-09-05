import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Shell } from "./components/Shell";
import CommandCenter from "./pages/CommandCenter";
import RiskInbox from "./pages/RiskInbox";
import CaseDetail from "./pages/CaseDetail";
import ApprovalQueue from "./pages/ApprovalQueue";
import JudgeMode from "./pages/JudgeMode";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import VoiceRecovery from "./pages/VoiceRecovery";

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<CommandCenter />} />
          <Route path="/inbox" element={<RiskInbox />} />
          <Route path="/cases/:id" element={<CaseDetail />} />
          <Route path="/approvals" element={<ApprovalQueue />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/voice" element={<VoiceRecovery />} />
          <Route path="/judge" element={<JudgeMode />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
