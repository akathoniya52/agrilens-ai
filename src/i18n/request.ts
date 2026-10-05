import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LANGUAGE, LOCALE_COOKIE, isLanguageCode } from "@/lib/languages";

export default getRequestConfig(async () => {
  const store = await cookies();
  const requested = store.get(LOCALE_COOKIE)?.value;
  const locale = isLanguageCode(requested) ? requested : DEFAULT_LANGUAGE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
