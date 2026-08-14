/**
 * A typed mirror of T's keys: `keyMirror<Flags>().chat` is the string 'chat' with the
 * literal type 'chat'. Makes `reads` arrays rename-refactorable. ACCESS-ONLY: the
 * proxy has no ownKeys trap, so enumeration and spread see an empty object; never
 * iterate a mirror. Bracket access for dash-keys works and is typed.
 */
export const keyMirror = <T,>(): { readonly [K in keyof T]: K } =>
  new Proxy({}, { get: (_target, key) => key }) as { readonly [K in keyof T]: K };
