import { putFile } from "./secureStorage";
import { uid } from "./time";

/** Photos people pick on their phone can be large. Anything bigger is refused before it is read. */
export const MAX_PHOTO_INPUT = 10 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Crops a photo to a square and re-encodes it as a JPEG of at most `max` pixels a side. Re-encoding drops its
 * metadata, including where it was taken. Used for profile photos and, since Sprint 22, memory-aid and scam photos.
 */
export async function preparePhoto(file: Blob, max = 512): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("bad image")); i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const out = Math.min(max, side);
    const c = document.createElement("canvas");
    c.width = out; c.height = out;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.86));
  } finally { URL.revokeObjectURL(url); }
}

/** Sprint 22: checks, prepares and stores a photo in the device's encrypted file store. Returns its id, or an error. */
export async function storePhoto(file: File): Promise<{ id: string } | { error: string }> {
  if (!PHOTO_TYPES.includes(file.type)) return { error: "Choose a JPEG, PNG or WebP photo." };
  if (file.size > MAX_PHOTO_INPUT) return { error: "That photo is over 10 MB. Choose a smaller one." };
  try {
    const blob = await preparePhoto(file);
    const id = uid("photo");
    await putFile(id, new Uint8Array(await blob.arrayBuffer()));
    return { id };
  } catch {
    return { error: "We couldn't read that photo. Try another one." };
  }
}
