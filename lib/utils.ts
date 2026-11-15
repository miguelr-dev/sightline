type ClassValue = string | number | false | null | undefined | ClassValue[];

/**
 * Joins class names, skipping falsy values. A dependency-free stand-in for
 * clsx + tailwind-merge: it does not resolve conflicting Tailwind classes, so
 * pass overrides through props or style rather than competing utilities.
 */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const walk = (value: ClassValue) => {
    if (!value) return;
    if (Array.isArray(value)) value.forEach(walk);
    else out.push(String(value));
  };
  inputs.forEach(walk);
  return out.join(" ");
}
