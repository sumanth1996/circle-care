import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type CSSProperties } from "react";
import { X, Coffee, Droplets, Footprints, Utensils, GlassWater, Phone, Pill, Heart, Check, type LucideIcon } from "lucide-react";
import { photos, type PhotoKey } from "../data/images";
import type { Member, Medication } from "../data/types";

export const taskIcons: Record<string, LucideIcon> = { coffee: Coffee, droplets: Droplets, footprints: Footprints, utensils: Utensils, "glass-water": GlassWater, phone: Phone, pill: Pill, heart: Heart };

export function Photo({ k, w = 1200, className, style, eager }: { k: PhotoKey; w?: number; className?: string; style?: CSSProperties; eager?: boolean }) {
  const p = photos[k];
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={className} style={{ ...style, background: "linear-gradient(135deg,#fff4e5,#efeffd)" }} role="img" aria-label={p.alt} />;
  return <img className={className} style={style} src={p.src(w)} alt={p.alt} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />;
}

/** Picks white or near-black initials, whichever reads better on the member's color (CC-71). */
function inkOn(hex: string) {
  const c = hex.replace("#", "").match(/../g)?.map((x) => parseInt(x, 16) / 255) ?? [0, 0, 0];
  const [r, g, b] = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (lum + 0.05) >= 4.5 ? "#fff" : "#1d1d1f";
}

export function Avatar({ m, size = 40 }: { m?: Member; size?: number }) {
  if (!m) return <div className="avatar" style={{ width: size, height: size }} />;
  const photo = m.photo as PhotoKey | undefined;
  return (
    <div className="avatar" style={{ width: size, height: size, background: m.color, color: inkOn(m.color), fontSize: size * 0.4 }} aria-hidden="true">
      {photo ? <Photo k={photo} w={size * 3} style={{ objectPosition: "center 25%" }} /> : m.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      <span className="knob" />
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Sheet({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grabber" />
        <div className="sheet-head">
          <h2 className="t-md">{title}</h2>
          <div className="row" style={{ "--gap": "8px" } as CSSProperties}>
            {actions}
            <button className="btn plain sm" style={{ width: 34, padding: 0 }} onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function IconTile({ icon: Icon, color, size = 36 }: { icon: LucideIcon; color: string; size?: number }) {
  return (
    <span className="icon-tile" style={{ background: color, width: size, height: size, borderRadius: size * 0.28 }} aria-hidden="true">
      <Icon size={size * 0.55} strokeWidth={2.2} />
    </span>
  );
}

export function Ring({ value, size = 64, stroke = 8, color = "var(--green)", track = "#ececf0", children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg className="ring" width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>{children}</div>
    </div>
  );
}

export function PillArt({ med, size = 44 }: { med: Pick<Medication, "pill">; size?: number }) {
  const { color, shape } = med.pill;
  const w = shape === "round" ? size * 0.62 : size * 0.86;
  const h = shape === "round" ? size * 0.62 : size * 0.44;
  return (
    <div style={{ width: size, height: size, display: "grid", placeItems: "center", background: "var(--mist)", borderRadius: size * 0.3, flex: "none" }} aria-hidden="true">
      {shape === "capsule" ? (
        <div className="pill-art" style={{ width: w, height: h, borderRadius: h, background: `linear-gradient(90deg, ${color} 50%, #fff 50%)` }} />
      ) : (
        <div className="pill-art" style={{ width: w, height: h, borderRadius: shape === "round" ? "50%" : h, background: color }} />
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastCtx.Provider value={setMsg}>
      {children}
      {msg && <div className="toast" role="status"><Check size={18} /> {msg}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- Speech (on-device read-aloud, CC-72) ---------- */
export function useSpeech() {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const speak = useCallback((text: string) => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92;
    window.speechSynthesis.speak(u);
  }, [supported]);
  return { supported, speak };
}

export function download(filename: string, data: string, type = "application/json") {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
