export type OpenAiProviderErrorCode =
  | 'OPENAI_CREDENTIAL'
  | 'OPENAI_AUTHORIZATION'
  | 'OPENAI_RATE_LIMIT'
  | 'OPENAI_TIMEOUT'
  | 'OPENAI_TRANSIENT'
  | 'OPENAI_REFUSAL'
  | 'OPENAI_INCOMPLETE'
  | 'OPENAI_SCHEMA'
  | 'OPENAI_UNSAFE_CONFIGURATION'
  | 'OPENAI_BUDGET'
  | 'OPENAI_DISABLED';

export class OpenAiProviderError extends Error {
  public readonly code: OpenAiProviderErrorCode;

  public constructor(code: OpenAiProviderErrorCode, message = code) {
    super(message);
    this.name = 'OpenAiProviderError';
    this.code = code;
  }
}
