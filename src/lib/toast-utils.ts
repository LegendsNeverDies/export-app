import { toast } from "sonner";

let toastCounter = 0;

/** Get a unique toast ID. Use to prevent duplicate-key warnings from sonner v2. */
export function nextToastId(): string {
  return `toast-${Date.now()}-${++toastCounter}`;
}

export { toast };
