/** Wide type so tsc does not materialize the 6k-line locale JSON trees. */
export type LocaleMessages = Record<string, any>;

export const en: LocaleMessages;
export const es: LocaleMessages;
export const fr: LocaleMessages;
