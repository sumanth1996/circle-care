// Voice confirmation (CC-73). Uses the browser's speech recognition ONLY when it
// can run on this device (processLocally). If recognition would need to send
// audio to a cloud service, voice stays off — health-related speech never leaves
// the phone. No audio or transcript is stored.

type Rec = {
  lang: string; interimResults: boolean; maxAlternatives: number; processLocally?: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; abort(): void;
};
type RecCtor = { new (): Rec; available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string> };

const ctor = (): RecCtor | undefined => (window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: RecCtor }).webkitSpeechRecognition;

export type VoiceSupport = "on-device" | "cloud-only" | "none";

/** Quick, synchronous check: could this browser possibly listen on-device? */
export function voiceMaybe(): boolean {
  const C = ctor();
  return !!C && typeof C.available === "function";
}

/**
 * Asks the browser whether on-device recognition is ready. Called only when the
 * person taps the voice button, and given up after a few seconds.
 */
export async function voiceSupport(lang = "en-US"): Promise<VoiceSupport> {
  const C = ctor();
  if (!C) return "none";
  if (!C.available) return "cloud-only";
  try {
    const r = await Promise.race([C.available({ langs: [lang], processLocally: true }), new Promise<string>((res) => setTimeout(() => res("timeout"), 4000))]);
    return r === "available" ? "on-device" : "cloud-only";
  } catch {
    return "cloud-only";
  }
}

export type Intent = "taken" | "skipped" | "unknown";

/** Maps what was said to an intent. Kept deliberately small and forgiving. */
export function intentOf(text: string): Intent {
  const t = text.toLowerCase();
  if (/\b(skip|later|not now|no)\b/.test(t)) return "skipped";
  if (/\b(took|taken|take|done|yes|did)\b/.test(t)) return "taken";
  return "unknown";
}

export function listenOnce(lang = "en-US"): { result: Promise<string>; stop: () => void } {
  const C = ctor()!;
  const r = new C();
  r.lang = lang;
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.processLocally = true;
  let stop = () => r.abort();
  const result = new Promise<string>((resolve, reject) => {
    let heard = "";
    r.onresult = (e) => { heard = e.results[0]?.[0]?.transcript ?? ""; };
    r.onerror = (e) => reject(new Error(e.error));
    r.onend = () => resolve(heard);
    stop = () => { r.abort(); resolve(""); };
    r.start();
  });
  return { result, stop: () => stop() };
}
