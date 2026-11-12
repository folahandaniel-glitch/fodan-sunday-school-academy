import "server-only";
import { getSetting } from "./settings";
import { makeT, type Translate } from "@/lib/ui-text";

/** `const t = await getT();` then `t("Sign in")`. Returns the administrator's wording if one is saved, else the text given. */
export async function getT(): Promise<Translate> {
  const s = await getSetting("uiText");
  return makeT(s.overrides);
}
