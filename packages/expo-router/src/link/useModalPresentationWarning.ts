import type { LinkToOptions } from '../global-state/types';

// Only the native stack on iOS and Android shows a route without `presentation` as a modal.
export function useModalPresentationWarning(_href: string, _options: LinkToOptions) {}
