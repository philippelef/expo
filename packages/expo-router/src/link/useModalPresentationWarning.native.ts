import { use, useEffect } from 'react';

import { NavigatorStateForHrefContext } from '../global-state/navigatorStateForHrefContext';
import type { LinkToOptions } from '../global-state/types';
import { RootNavigationStateContext } from '../react-navigation/core/RootNavigationStateContext';
import { IsFocusedContext } from '../react-navigation/core/useIsFocused';
import {
  isModalPresentationWarningEnabled,
  type ModalPresentationScope,
  ModalPresentationScopeContext,
} from '../react-navigation/native-stack/utils/modalPresentationWarning';
import { shouldLinkExternally } from '../utils/url';

function findScope(
  scope: ModalPresentationScope | null,
  match: (scope: ModalPresentationScope) => boolean
) {
  while (scope && !match(scope)) {
    scope = scope.parent;
  }
  return scope;
}

function useModalPresentationWarningImpl(
  href: string,
  { event, relativeToDirectory, withAnchor, dangerouslySingular }: LinkToOptions
) {
  const getNavigatorStateForHref = use(NavigatorStateForHrefContext);
  const scope = use(ModalPresentationScopeContext);
  const rootState = use(RootNavigationStateContext);
  const isFocused = use(IsFocusedContext);

  useEffect(() => {
    // A `Link` in a screen that is not focused cannot be pressed, and the prediction below
    // resolves the href against the focused route.
    if (
      !isModalPresentationWarningEnabled() ||
      !isFocused ||
      !rootState ||
      !getNavigatorStateForHref ||
      shouldLinkExternally(href) ||
      // A route shows as a modal only above a modal route, so skip the prediction until a stack
      // that renders this `Link` has one.
      !findScope(scope, (item) => item.hasModalRoute)
    ) {
      return;
    }
    let next: ReturnType<typeof getNavigatorStateForHref>;
    try {
      next = getNavigatorStateForHref(
        href,
        { event, relativeToDirectory, withAnchor, dangerouslySingular },
        rootState
      );
    } catch {
      // The `Link` reports an invalid href when it is pressed.
      return;
    }
    if (!next) {
      return;
    }
    // Only a native stack that renders this `Link` can be checked.
    findScope(scope, (item) => item.stateKey === next.stateKey)?.warnIfCardShownAsModal(
      next.state.routes.filter((route) => !route.isPreloaded)
    );
  }, [
    getNavigatorStateForHref,
    scope,
    rootState,
    isFocused,
    href,
    event,
    relativeToDirectory,
    withAnchor,
    dangerouslySingular,
  ]);
}

/**
 * Warns when the `Link` would show a route without `presentation` as a modal in a native stack.
 * Production builds skip the check, so a `Link` does not render again after each navigation.
 */
export const useModalPresentationWarning: typeof useModalPresentationWarningImpl = __DEV__
  ? useModalPresentationWarningImpl
  : () => {};
