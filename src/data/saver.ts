// CC-195: save the demo store as soon as it changes, so a change made just before the tab closes is kept.
//
// Encryption in the browser is async (CC-26), so a save can't be forced to finish before the page goes.
// What this does instead is start each save at once, which makes the gap a few milliseconds instead of a
// 250 ms timer. Saves can finish out of order, so a save only writes when nothing newer has been written.
// The latest state is also saved when the page is hidden (switching apps on a phone) or closed.
// While the circle is being wiped (CC-33), saving is paused and any save already under way is dropped, so
// a save can't bring wiped data back.

export interface Saver<T> {
  /** Starts saving this value now. Resolves once it is written, or skipped because a newer one was. */
  save(value: T): Promise<void>;
  /** Saves the value only if it is a different object from the last one seen, so an unchanged state isn't saved again. */
  changed(value: T): Promise<void>;
  /** Saves the latest value again, for a page that is being hidden or closed. */
  flush(): Promise<void>;
  /** Stops saving and drops every save under way, until resume(). */
  pause(): void;
  resume(): void;
}

export function createSaver<T>(encode: (value: T) => Promise<string> | string, store: (encoded: string) => void): Saver<T> {
  let started = 0;
  let written = 0;
  let epoch = 0;
  let paused = false;
  let latest: { value: T } | null = null;

  async function write(value: T, mine: number, ep: number, retry: boolean): Promise<void> {
    let encoded: string;
    try {
      encoded = await encode(value);
    } catch (e) {
      // Retry the newest value once, so a one-off failure doesn't leave the latest change unsaved.
      if (retry && mine === started && ep === epoch) return write(value, mine, ep, false);
      throw e;
    }
    if (paused || ep !== epoch) return; // a wipe started while this was encoding
    if (mine <= written) return; // a newer value is already stored
    written = mine;
    store(encoded);
  }

  const saver: Saver<T> = {
    save(value) {
      latest = { value };
      if (paused) return Promise.resolve();
      return write(value, ++started, epoch, true);
    },
    changed(value) {
      if (latest && latest.value === value) return Promise.resolve();
      return saver.save(value);
    },
    flush() {
      return latest ? saver.save(latest.value) : Promise.resolve();
    },
    pause() {
      paused = true;
      epoch++;
    },
    resume() {
      paused = false;
    },
  };
  return saver;
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
