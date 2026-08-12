export interface AuthApiV1 {
  readonly signInWithPassword: (input: {
    readonly email: string;
    readonly password: string;
  }) => Promise<{ readonly accepted: true } | { readonly accepted: false; readonly code: 'AUTH_FAILED' }>;
}

export function createAuthApiV1(): AuthApiV1 {
  return {
    async signInWithPassword() {
      return Object.freeze({ accepted: false, code: 'AUTH_FAILED' });
    },
  };
}
