import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { StoreProvider } from "./data/store";
import { ToastProvider } from "./components/ui";
import Landing from "./pages/Landing";
import Welcome from "./pages/Welcome";
import SignIn from "./pages/SignIn";
import AppShell from "./components/AppShell";
import ElderHome from "./pages/elder/ElderHome";
import ElderNext from "./pages/elder/ElderNext";
import ElderSos from "./pages/elder/ElderSos";
import ElderCall from "./pages/elder/ElderCall";
import PrivacyCenter from "./pages/shared/PrivacyCenter";
import ElderSettings from "./pages/elder/ElderSettings";
import ElderDecisions from "./pages/elder/ElderDecisions";
import CaregiverToday from "./pages/caregiver/CaregiverToday";
import CaregiverHandoff from "./pages/caregiver/CaregiverHandoff";
import CaregiverSchedule from "./pages/caregiver/CaregiverSchedule";
import GuardianHome from "./pages/guardian/GuardianHome";
import Medications from "./pages/guardian/Medications";
import Approvals from "./pages/guardian/Approvals";
import Circle from "./pages/guardian/Circle";
import Schedule from "./pages/guardian/Schedule";
import Feed from "./pages/guardian/Feed";
import Digest from "./pages/guardian/Digest";
import GuardianSettings from "./pages/guardian/GuardianSettings";
import Notes from "./pages/shared/Notes";
import EmergencyCard from "./pages/shared/EmergencyCard";
import SosResponder from "./pages/shared/SosResponder";
import Alerts from "./pages/shared/Alerts";
import Invite from "./pages/Invite";

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { if (!pathname.startsWith("/#")) window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <HashRouter>
          <ScrollTop />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app" element={<Welcome />} />
            <Route path="/app/sign-in/:persona" element={<SignIn />} />
            <Route path="/app/invite/:memberId" element={<Invite />} />
            <Route path="/app/elder" element={<AppShell persona="elder" />}>
              <Route index element={<ElderHome />} />
              <Route path="next" element={<ElderNext />} />
              <Route path="sos" element={<ElderSos />} />
              <Route path="call" element={<ElderCall />} />
              <Route path="privacy" element={<PrivacyCenter />} />
              <Route path="settings" element={<ElderSettings />} />
              <Route path="decisions" element={<ElderDecisions />} />
              <Route path="card" element={<EmergencyCard />} />
            </Route>
            <Route path="/app/caregiver" element={<AppShell persona="caregiver" />}>
              <Route index element={<CaregiverToday />} />
              <Route path="handoff" element={<CaregiverHandoff />} />
              <Route path="schedule" element={<CaregiverSchedule />} />
              <Route path="notes" element={<Notes />} />
              <Route path="card" element={<EmergencyCard />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="sos" element={<SosResponder />} />
            </Route>
            <Route path="/app/guardian" element={<AppShell persona="guardian" />}>
              <Route index element={<GuardianHome />} />
              <Route path="meds" element={<Medications />} />
              <Route path="approvals" element={<Approvals />} />
              <Route path="circle" element={<Circle />} />
              <Route path="schedule" element={<Schedule />} />
              <Route path="feed" element={<Feed />} />
              <Route path="digest" element={<Digest />} />
              <Route path="notes" element={<Notes />} />
              <Route path="privacy" element={<PrivacyCenter />} />
              <Route path="card" element={<EmergencyCard />} />
              <Route path="settings" element={<GuardianSettings />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="sos" element={<SosResponder />} />
            </Route>
            <Route path="/app/sos" element={<SosRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </ToastProvider>
    </StoreProvider>
  );
}

import { useStore } from "./data/store";
function SosRedirect() {
  const { state } = useStore();
  const p = state.persona ?? "guardian";
  return <Navigate to={p === "elder" ? "/app/elder/sos" : `/app/${p}/sos`} replace />;
}
