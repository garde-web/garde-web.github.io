// Browser-side image helpers: photos are shrunk before they are stored, so they stay small and fast.
export async function resizeImage(file, max = 900, quality = 0.75) {
  const bmp = await createImageBitmap(file), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}
// A small centre-cropped thumbnail (kept on the recipe itself so the recipe list loads quickly)
export async function thumbOf(file, w = 320, h = 240) {
  const bmp = await createImageBitmap(file), k = Math.max(w / bmp.width, h / bmp.height);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d").drawImage(bmp, (w - bmp.width * k) / 2, (h - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
  return c.toDataURL("image/jpeg", 0.7);
}
