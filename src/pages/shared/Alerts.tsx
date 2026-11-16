import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Siren, AlertTriangle, Info } from "lucide-react";
import { useStore } from "../../data/store";
import { alertsFor, alertLink, clock } from "../../data/selectors";
import { relative } from "../../lib/time";
import { resolutionText } from "../../data/calmAlerts";
import { Empty } from "../../components/ui";

/** Notification center. Titles are the PHI-free lock-screen text (CC-31); details show only in the app.
 *  CC-206: a settled missed-dose alert says how it was settled. CC-208: a morning summary lists what waited overnight. */
export default function Alerts() {
  const { state, actions } = useStore();
  const nav = useNavigate();
  const p = state.persona ?? "guardian";
  const list = alertsFor(state, p);
  useEffect(() => { const t = setTimeout(() => actions.markRead(p), 1500); return () => clearTimeout(t); }, [actions, p]);

  return (
    <div className="page narrow stack">
      <div className="page-head"><div><p className="page-kicker">Notifications</p><h1>Alerts</h1></div></div>
      {list.length === 0 ? <Empty><Bell size={32} style={{ margin: "0 auto 8px" }} />You're all caught up.</Empty> : (
        <div className="list">
          {list.map((a) => {
            const Icon = a.severity === "critical" ? Siren : a.severity === "warning" ? AlertTriangle : Info;
            const color = a.severity === "critical" ? "var(--red)" : a.severity === "warning" ? "var(--elder)" : "var(--blue)";
            const link = alertLink(p, a.link);
            return (
              <button key={a.id} className="list-row" style={{ alignItems: "flex-start" }} onClick={() => link && nav(link)}>
                <Icon size={22} color={color} style={{ flex: "none", marginTop: 2 }} />
                <span className="grow">
                  <span className="list-title" style={{ display: "block", fontWeight: a.read.includes(p) ? 500 : 700 }}>{a.detail}</span>
                  {a.items && a.items.length > 0 && (
                    <ul className="tiny" style={{ margin: "6px 0 4px", paddingLeft: 18 }}>{a.items.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  )}
                  {a.resolved && <span className={`badge ${a.resolved.outcome === "taken" ? "green" : "orange"}`} style={{ display: "inline-flex", margin: "4px 0", height: "auto", whiteSpace: "normal" }}>{resolutionText(state, a)}</span>}
                  <span className="tiny">Lock screen showed: “{a.title}”</span>
                </span>
                <span className="tiny" style={{ whiteSpace: "nowrap" }}>{relative(a.at, clock(state))}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
