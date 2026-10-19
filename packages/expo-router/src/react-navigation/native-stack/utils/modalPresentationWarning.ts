import { createContext, useEffect } from 'react';

import { useRouteNode, type RouteNode } from '../../../Route';
import { findRouteNodeByName } from '../../../routeNode';
import type { Route } from '../../native';
import { getModalRouteKeys, type RouteOptionsMap } from './getModalRoutesKeys';

let isWarningEnabled = true;
const warnedRoutes = new Set<string>();

/**
 * Disables the development warning when a route without `presentation` shows as a modal.
 *
 * @example
 * ```tsx app/_layout.tsx
 * import { disableModalPresentationWarning, Stack } from 'expo-router';
 *
 * disableModalPresentationWarning();
 *
 * export default function RootLayout() {
 *   return <Stack />;
 * }
 * ```
 */
export function disableModalPresentationWarning() {
  isWarningEnabled = false;
}

export function isModalPresentationWarningEnabled() {
  return isWarningEnabled;
}

/** Logs once per route when a route without `presentation` shows as a modal in a native stack. */
export function warnIfCardShownAsModal(
  routes: Route<string>[],
  descriptors: RouteOptionsMap,
  layoutNode: RouteNode | null
) {
  if (!isWarningEnabled) {
    return;
  }
  const modalRouteKeys = getModalRouteKeys(routes, descriptors);
  // The first modal route always sets a modal `presentation` itself.
  const modalRoute = routes.find((route) => route.key === modalRouteKeys[0]);
  if (!modalRoute) {
    return;
  }
  const getRouteFile = (routeName: string) =>
    findRouteNodeByName(layoutNode, routeName)?.contextKey ?? routeName;
  for (const route of routes) {
    const routeFile = getRouteFile(route.name);
    if (
      !modalRouteKeys.includes(route.key) ||
      descriptors[route.key]?.options.presentation ||
      warnedRoutes.has(routeFile)
    ) {
      continue;
    }
    warnedRoutes.add(routeFile);
    console.warn(
      `Route "${routeFile}" has no \`presentation\` option, but shows as a modal because modal route "${getRouteFile(modalRoute.name)}" is below it in the same stack. This can change in a future version. Set \`presentation\` in the layout's screen \`options\` (for example from route params with \`options={({ route }) => ...}\`), or create a card screen and a form sheet screen that share one component. Call \`disableModalPresentationWarning()\` to hide this warning.`
    );
  }
}

function useCardShownAsModalWarningImpl(
  activeRoutes: Route<string>[],
  descriptors: RouteOptionsMap
) {
  const layoutNode = useRouteNode();
  useEffect(() => {
    warnIfCardShownAsModal(activeRoutes, descriptors, layoutNode);
  }, [activeRoutes, descriptors, layoutNode]);
}

/** Checks the routes that a native stack shows. Production builds skip the check. */
export const useCardShownAsModalWarning: typeof useCardShownAsModalWarningImpl = __DEV__
  ? useCardShownAsModalWarningImpl
  : () => {};

/**
 * A native stack above the current component. A `Link` uses it to check the routes that the
 * stack will have after the `Link` navigates. Only development builds provide it.
 */
export type ModalPresentationScope = {
  stateKey: string;
  hasModalRoute: boolean;
  warnIfCardShownAsModal: (routes: Route<string>[]) => void;
  parent: ModalPresentationScope | null;
};

export const ModalPresentationScopeContext = createContext<ModalPresentationScope | null>(null);
