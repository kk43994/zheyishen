export const FIRST_RUN_GUIDE_KEY = 'zys-first-run-guide-v1';

export function hasCompletedFirstRunGuide(): boolean {
  try {
    return window.localStorage.getItem(FIRST_RUN_GUIDE_KEY) === 'done';
  } catch {
    return false;
  }
}

export function completeFirstRunGuide(): void {
  try {
    window.localStorage.setItem(FIRST_RUN_GUIDE_KEY, 'done');
  } catch {
    // The guide can repeat when embedded storage is unavailable.
  }
}
