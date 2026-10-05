export type Theme = "dark" | "daylight";

export const THEME_STORAGE_KEY = "agrilens-theme";

/** Render-blocking script for <head>: applies the stored theme before first paint (no flash). */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");document.documentElement.setAttribute("data-theme",t==="daylight"?"daylight":"dark")}catch(e){}})();`;

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "daylight";
}
