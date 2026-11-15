// CC-195: save the demo store as soon as it changes, so a change made just before the tab closes is kept.
//
// Encryption in the browser is async (CC-26), so a save can't be forced to finish before the page goes.
// What this does instead is start each save at once, with the device key already loaded, which makes the
// gap a few milliseconds instead of a 250 ms timer. Saves can finish out of order, so a save only writes
// when nothing newer has been written already. The latest state is also saved when the page is hidden
// (switching apps on a phone) or closed.

export interface Saver<T> {
  /** Starts saving this value now. Resolves once it is written, or skipped because a newer one was. */
  save(value: T): Promise<void>;
}

export function createSaver<T>(encode: (value: T) => Promise<string> | string, store: (encoded: string) => void): Saver<T> {
  let started = 0;
  let written = 0;
  return {
    async save(value) {
      const mine = ++started;
      const encoded = await encode(value);
      if (mine <= written) return; // a newer value is already stored
      written = mine;
      store(encoded);
    },
  };
}

/** Calls flush when the page is hidden or closed. Returns a function that stops listening. */
export function saveWhenPageGoes(flush: () => void, win: Pick<Window, "addEventListener" | "removeEventListener"> = window, doc: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState"> = document) {
  const onHidden = () => { if (doc.visibilityState === "hidden") flush(); };
  win.addEventListener("pagehide", flush);
  doc.addEventListener("visibilitychange", onHidden);
  return () => {
    win.removeEventListener("pagehide", flush);
    doc.removeEventListener("visibilitychange", onHidden);
  };
}
