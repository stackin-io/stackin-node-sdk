import { ValidationError } from "./errors";

/**
 * One path segment, escaped, refusing the ones that would leave it.
 *
 * encodeURIComponent leaves "." alone — RFC 3986 calls it unreserved —
 * so the dot segments have to be refused rather than escaped, or the
 * HTTP client collapses ".." into a different endpoint.
 */
export function segment(value: string): string {
  if (value === "" || value === "." || value === "..") {
    throw new ValidationError(`"${value}" is not a usable path segment`);
  }
  return encodeURIComponent(value);
}
