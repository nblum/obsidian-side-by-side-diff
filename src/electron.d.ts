/** Desktop runtime API supplied by Obsidian's Electron installation. */
declare module "electron" {
  export const webUtils: { getPathForFile(file: File): string } | undefined;
}
