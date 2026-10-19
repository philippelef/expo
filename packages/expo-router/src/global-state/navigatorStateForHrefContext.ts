import { createContext } from 'react';

import type { NavigationState } from '../react-navigation/routers';
import type { LinkToOptions } from './types';

/** Returns the navigator that an href changes from `state`, and its next state, without navigating. */
export const NavigatorStateForHrefContext = createContext<
  | ((
      href: string,
      options: LinkToOptions,
      state: NavigationState
    ) => { stateKey: string; state: NavigationState } | undefined)
  | undefined
>(undefined);
