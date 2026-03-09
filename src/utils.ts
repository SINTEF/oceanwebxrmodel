/** Returns the URL for a file in the public /data folder, respecting the Vite base path. */
export function dataUrl(filename: string): string {
  return `${import.meta.env.BASE_URL}data/${filename}`;
}
