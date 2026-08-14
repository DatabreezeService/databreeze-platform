const MOJIBAKE_PATTERN =
  /(?:[\u00c2-\u00c6][\u0080-\u00bf]?|\u00d0[\u0080-\u00bf]?|\u00d1[\u0080-\u00bf]?|\u00e1[\u00ba\u00bb]|\u00e2(?:[\u0080-\u00bf]|\u20ac)|\u00ef\u00bf\u00bd|\ufffd)/gu;

export function findMojibake(text: string): readonly string[] {
  return text.match(MOJIBAKE_PATTERN) ?? [];
}
