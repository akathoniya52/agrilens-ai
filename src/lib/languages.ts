export const LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English", speech: "en-IN" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", speech: "hi-IN" },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી", speech: "gu-IN" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी", speech: "mr-IN" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்", speech: "ta-IN" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు", speech: "te-IN" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা", speech: "bn-IN" },
  { code: "sw", label: "Swahili", nativeLabel: "Kiswahili", speech: "sw-KE" },
  { code: "es", label: "Spanish", nativeLabel: "Español", speech: "es-ES" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português", speech: "pt-BR" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && LANGUAGES.some((l) => l.code === value);
}

export function getLanguage(code: string | null | undefined) {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
