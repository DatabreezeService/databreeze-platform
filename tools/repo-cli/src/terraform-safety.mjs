function maskTerraformNonCode(text) {
  const masked = text.split('');
  let quoted = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let heredoc = undefined;
  let lineStart = true;

  const mask = (index) => {
    if (masked[index] !== '\n') masked[index] = ' ';
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (heredoc !== undefined) {
      if (lineStart) {
        const lineEnd = text.indexOf('\n', index) === -1 ? text.length : text.indexOf('\n', index);
        const rawLine = text.slice(index, lineEnd).replace(/\r$/u, '');
        const candidate = heredoc.allowIndent ? rawLine.trim() : rawLine;
        for (let position = index; position < lineEnd; position += 1) mask(position);
        if (candidate === heredoc.delimiter) heredoc = undefined;
        lineStart = false;
        index = lineEnd - 1;
        continue;
      }
      mask(index);
      if (character === '\n') lineStart = true;
      continue;
    }

    if (lineComment) {
      mask(index);
      if (character === '\n') {
        lineComment = false;
        lineStart = true;
      }
      continue;
    }

    if (blockComment) {
      mask(index);
      if (character === '*' && next === '/') {
        mask(index + 1);
        index += 1;
        blockComment = false;
      }
      lineStart = character === '\n';
      continue;
    }

    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      if (character === '\n') lineStart = true;
      else lineStart = false;
      continue;
    }

    if (character === '"') {
      quoted = true;
      lineStart = false;
      continue;
    }
    if (character === '#') {
      lineComment = true;
      mask(index);
      lineStart = false;
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      mask(index);
      mask(index + 1);
      index += 1;
      lineStart = false;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      mask(index);
      mask(index + 1);
      index += 1;
      lineStart = false;
      continue;
    }
    if (character === '<' && next === '<') {
      const match = text.slice(index).match(/^<<(-?)([A-Za-z_][A-Za-z0-9_-]*)/u);
      if (match) {
        for (let position = index; position < index + match[0].length; position += 1) {
          mask(position);
        }
        heredoc = { allowIndent: match[1] === '-', delimiter: match[2] };
        index += match[0].length - 1;
        lineStart = false;
        continue;
      }
    }
    lineStart = character === '\n';
  }
  return masked.join('');
}

export function balancedBlocks(text, keyword) {
  const masked = maskTerraformNonCode(text);
  const blocks = [];
  const startPattern = new RegExp(`\\b${keyword}\\s*\\{`, 'g');
  for (const match of masked.matchAll(startPattern)) {
    const openingBrace = masked.indexOf('{', match.index);
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = openingBrace; index < masked.length; index += 1) {
      const character = masked[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') {
        quoted = true;
        continue;
      }
      if (character === '{') depth += 1;
      if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          blocks.push(masked.slice(openingBrace, index + 1));
          break;
        }
      }
    }
  }
  return blocks;
}
