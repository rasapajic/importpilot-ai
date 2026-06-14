import { cookies } from "next/headers";

import { LOCALE_COOKIE, resolveLocale } from "@/modules/i18n/translations";

export async function getServerLocale() {
  return resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}
