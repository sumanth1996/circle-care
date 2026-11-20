import { useEffect } from "react";
import { useStore } from "../../data/store";
import { TodayDoses } from "../../components/saferDoses";

/** CC-243: James sees today's doses and who recorded each one, so he never records one twice. */
export default function FamilyDoses() {
  const { actions } = useStore();
  useEffect(() => { actions.logView("today's doses"); }, [actions]);
  return (
    <div className="page narrow stack">
      <div className="page-head"><div><p className="page-kicker">Maggie's medicines</p><h1>Today's doses</h1></div></div>
      <TodayDoses />
    </div>
  );
}
