export function quoteGradleApplicationArgument(value) {
  if (value.length === 0) return '""';

  return [...value]
    .map((character) => {
      if (character === '"') return `'"'`;
      if (character === "'") return `"'"`;
      if (/\s/u.test(character)) return `"${character}"`;
      return character;
    })
    .join('');
}
