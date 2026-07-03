export interface CommandSegment {
  separatorBefore: "start" | "pipe" | "and" | "or" | "semicolon";
  argv: string[];
}

function finalizeSegment(
  segments: CommandSegment[],
  current: string[],
  separatorBefore: CommandSegment["separatorBefore"],
): void {
  if (current.length === 0) return;
  segments.push({ separatorBefore, argv: [...current] });
  current.length = 0;
}

/**
 * Split a shell-like command line into command segments and argv tokens.
 * Supports quotes, simple escaping, and separates on `;`, `&&`, `||`, and `|`.
 */
export function parseCommandLine(command: string): CommandSegment[] {
  const segments: CommandSegment[] = [];
  const current: string[] = [];
  let currentWord = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  let separatorBefore: CommandSegment["separatorBefore"] = "start";

  const finishWord = () => {
    if (currentWord.length > 0) current.push(currentWord);
    currentWord = "";
  };

  const finishSegment = (nextSeparator: CommandSegment["separatorBefore"]) => {
    finishWord();
    finalizeSegment(segments, current, separatorBefore);
    separatorBefore = nextSeparator;
  };

  for (let index = 0; index < command.length; index++) {
    const char = command[index];

    if (escaped) {
      currentWord += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      if (quote === "'") currentWord += char;
      else escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) quote = null;
      else currentWord += char;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      finishWord();
      continue;
    }

    if (char === "&" && command[index + 1] === "&") {
      finishSegment("and");
      index += 1;
      continue;
    }
    if (char === "|" && command[index + 1] === "|") {
      finishSegment("or");
      index += 1;
      continue;
    }
    if (char === "|") {
      finishSegment("pipe");
      continue;
    }
    if (char === ";") {
      finishSegment("semicolon");
      continue;
    }

    currentWord += char;
  }

  finishWord();
  finalizeSegment(segments, current, separatorBefore);
  return segments;
}
