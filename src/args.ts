export interface ParsedArgs {
  positionals: string[];
  options: Record<string, string | boolean>;
}

export function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (!item.startsWith("--")) {
      positionals.push(item);
      continue;
    }

    const keyValue = item.slice(2);
    const eqIndex = keyValue.indexOf("=");
    if (eqIndex >= 0) {
      const key = keyValue.slice(0, eqIndex);
      options[key] = keyValue.slice(eqIndex + 1);
      continue;
    }

    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      options[keyValue] = next;
      index += 1;
    } else {
      options[keyValue] = true;
    }
  }

  return { positionals, options };
}

export function getStringOption(options: Record<string, string | boolean>, key: string, fallback = ""): string {
  const value = options[key];
  if (typeof value === "string") return value;
  return fallback;
}

export function hasOption(options: Record<string, string | boolean>, key: string): boolean {
  return Boolean(options[key]);
}
