/** Interface wording. The English text written in the code is the default and is also the lookup key,
 *  so nothing can break if an override is missing. An administrator can replace any catalogued text from
 *  Admin > Website content > Interface wording. {name} placeholders are filled from `vars`. */
export type TextVars = Record<string, string | number>;
export type Translate = (text: string, vars?: TextVars) => string;

export function makeT(overrides: Record<string, string> | undefined): Translate {
  const o = overrides ?? {};
  return (text, vars) => {
    const v = Object.prototype.hasOwnProperty.call(o, text) && o[text].trim() ? o[text] : text;
    return vars ? v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : v;
  };
}
export const MAX_OVERRIDE_LEN = 800;
export const MAX_OVERRIDES = 3000;
