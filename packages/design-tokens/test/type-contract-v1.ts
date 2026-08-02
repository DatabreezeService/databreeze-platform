import { designTokenEntriesV1, type DesignTokenV1 } from '../tokens/generated/typescript/v1.ts';

type Assert<Condition extends true> = Condition;
type IsEqual<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type TokenType = DesignTokenV1['type'];
const tokenTypesRemainDiscriminated: Assert<
  IsEqual<
    TokenType,
    'boolean' | 'color' | 'dimension' | 'duration' | 'integer' | 'number' | 'string'
  >
> = true;
type TokenName = DesignTokenV1['name'];
const knownNameRemainsLiteral: Assert<'color.primary' extends TokenName ? true : false> = true;
const namesAreNotWidened: Assert<string extends TokenName ? false : true> = true;

function consumeExhaustively(token: DesignTokenV1): string {
  switch (token.type) {
    case 'boolean':
    case 'color':
    case 'dimension':
    case 'duration':
    case 'integer':
    case 'number':
    case 'string':
      return token.name;
    default: {
      const unreachable: never = token;
      return unreachable;
    }
  }
}

const firstToken = designTokenEntriesV1[0];
// @ts-expect-error Public token entries are deeply readonly.
firstToken.name = 'color.compromised';

void tokenTypesRemainDiscriminated;
void knownNameRemainsLiteral;
void namesAreNotWidened;
void consumeExhaustively(firstToken);
