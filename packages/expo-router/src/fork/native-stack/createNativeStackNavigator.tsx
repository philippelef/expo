import { isLiquidGlassAvailable } from 'expo-glass-effect';
import * as React from 'react';
import { createStandardNavigator } from 'standard-navigation';

import { useRouteNode } from '../../Route';
import { useClearGuardedRoutes } from '../../layouts/useClearGuardedRoutes';
import {
  INTERNAL_EXPO_ROUTER_GESTURE_ENABLED_OPTION_NAME,
  type InternalNavigationOptions,
} from '../../navigationParams';
import { NavigatorStateContext } from '../../react-navigation/core/useNavigationState';
import type { Route } from '../../react-navigation/native';
import {
  NativeStackView,
  type NativeStackDescriptorMap,
  type NativeStackNavigationEventMap,
  type NativeStackNavigationOptions,
} from '../../react-navigation/native-stack';
import type { NativeStackNavigationConfig } from '../../react-navigation/native-stack/types';
import type { RouteOptionsMap } from '../../react-navigation/native-stack/utils/getModalRoutesKeys';
import {
  ModalPresentationScopeContext,
  warnIfCardShownAsModal,
} from '../../react-navigation/native-stack/utils/modalPresentationWarning';
import type { NavigatorContentProps } from '../../standard-navigation';
import { DescribeRouteContext } from '../../standard-navigation/DescribeRouteContext';
import { isModalPresentation } from '../../utils/stackPresentation';
import useLatestCallback from '../../utils/useLatestCallback';
import { CompositionContext, mergeOptions, useCompositionRegistry } from './composition-options';
import { DescriptorsContext } from './descriptors-context';
import { usePreviewTransition } from './usePreviewTransition';

const GLASS = isLiquidGlassAvailable();

type NativeStackNavigationOptionsWithInternal = NativeStackNavigationOptions &
  InternalNavigationOptions;

export interface NativeStackNavigatorCreateProps {
  isPreloaded: (key: string) => boolean;
  isRemovalPrevented: (key: string) => boolean;
  pop: (count: number, sourceRouteKey: string) => void;
  removeRoutes: (routeNames: string[]) => void;
  /** Registers pop-to-top on parent tab press, or returns undefined without a tab parent. */
  subscribePopToTopOnParentTabPress: () => (() => void) | undefined;
}

export type StandardNativeStackEventMap = {
  [Event in keyof NativeStackNavigationEventMap]: NativeStackNavigationEventMap[Event] & {
    canPreventDefault: false;
  };
};

type ContentArgs = NavigatorContentProps<
  NativeStackNavigationOptions,
  StandardNativeStackEventMap,
  NativeStackNavigationConfig,
  NativeStackNavigatorCreateProps
>;

function NativeStackNavigatorContent({
  state,
  descriptors,
  emitter,
  isPreloaded,
  isRemovalPrevented,
  pop,
  removeRoutes,
  subscribePopToTopOnParentTabPress,
  unstable_nativeProps,
}: ContentArgs) {
  const fullDescriptors = descriptors as unknown as NativeStackDescriptorMap;

  const {
    computedState,
    emit,
    isPreloaded: isComputedRoutePreloaded,
  } = usePreviewTransition(state, emitter.emit, isPreloaded);

  useClearGuardedRoutes(removeRoutes);
  React.useEffect(() => subscribePopToTopOnParentTabPress(), [subscribePopToTopOnParentTabPress]);

  // Map internal gesture option to React Navigation's gestureEnabled option
  // This allows Expo Router to override gesture behavior without affecting user settings
  const finalDescriptors = React.useMemo(() => {
    let needsNewMap = false;
    const result: NativeStackDescriptorMap = {};
    for (const key of Object.keys(fullDescriptors)) {
      const descriptor = fullDescriptors[key]!;
      const options = descriptor.options as NativeStackNavigationOptionsWithInternal;
      const internalGestureEnabled = options?.[INTERNAL_EXPO_ROUTER_GESTURE_ENABLED_OPTION_NAME];
      const needsGestureFix = internalGestureEnabled !== undefined;
      const needsGlassFix = GLASS && options?.presentation === 'formSheet';

      if (needsGestureFix || needsGlassFix) {
        needsNewMap = true;
        const newOptions = { ...options };
        if (needsGestureFix) {
          newOptions.gestureEnabled = internalGestureEnabled;
        }
        if (needsGlassFix) {
          newOptions.headerTransparent ??= true;
          newOptions.contentStyle ??= { backgroundColor: 'transparent' };
          newOptions.headerShadowVisible ??= false;
          newOptions.headerLargeTitleShadowVisible ??= false;
        }
        result[key] = { ...descriptor, options: newOptions };
      } else {
        result[key] = descriptor;
      }
    }
    return needsNewMap ? result : fullDescriptors;
  }, [fullDescriptors]);
  const { registry, contextValue } = useCompositionRegistry();

  const mergedDescriptors = React.useMemo(
    () => mergeOptions(finalDescriptors, registry, computedState),
    [finalDescriptors, computedState, registry]
  );

  // Native can push a preloaded screen on its own (link preview commit), so it must not animate.
  // The screen gets its animation back when JS pushes it, which also keeps the pop animated.
  const stackDescriptors = React.useMemo(() => {
    const preloadedKeys = computedState.routes
      .map((route) => route.key)
      .filter(isComputedRoutePreloaded);
    if (preloadedKeys.length === 0) {
      return mergedDescriptors;
    }
    const result = { ...mergedDescriptors };
    for (const key of preloadedKeys) {
      const descriptor = result[key];
      if (descriptor) {
        result[key] = { ...descriptor, options: { ...descriptor.options, animation: 'none' } };
      }
    }
    return result;
  }, [mergedDescriptors, computedState, isComputedRoutePreloaded]);

  const stackView = (
    <NativeStackView
      state={computedState}
      descriptors={stackDescriptors}
      emit={emit}
      isPreloaded={isComputedRoutePreloaded}
      isRemovalPrevented={isRemovalPrevented}
      pop={pop}
      unstable_nativeProps={unstable_nativeProps}
    />
  );

  return (
    <DescriptorsContext value={fullDescriptors}>
      <CompositionContext value={contextValue}>
        {__DEV__ ? (
          <ModalPresentationScopeProvider descriptors={stackDescriptors}>
            {stackView}
          </ModalPresentationScopeProvider>
        ) : (
          stackView
        )}
      </CompositionContext>
    </DescriptorsContext>
  );
}

function ModalPresentationScopeProvider({
  descriptors,
  children,
}: {
  descriptors: NativeStackDescriptorMap;
  children: React.ReactNode;
}) {
  const parent = React.use(ModalPresentationScopeContext);
  const describe = React.use(DescribeRouteContext);
  // `NavigatorContent` always renders inside the navigator that provides its state.
  const stateKey = React.use(NavigatorStateContext)!.key;
  const layoutNode = useRouteNode();
  const warn = useLatestCallback((routes: Route<string>[]) => {
    const options = Object.fromEntries(
      routes.map((route) => [
        route.key,
        // A route that is not in the stack yet has no descriptor, so describe it from the layout.
        descriptors[route.key] ?? describe?.({ ...route, key: undefined }),
      ])
    ) as RouteOptionsMap; // `describe` returns this navigator's options.
    warnIfCardShownAsModal(routes, options, layoutNode);
  });
  const hasModalRoute = Object.values(descriptors).some((descriptor) =>
    isModalPresentation(descriptor.options)
  );
  const scope = React.useMemo(
    () => ({ stateKey, hasModalRoute, warnIfCardShownAsModal: warn, parent }),
    [stateKey, hasModalRoute, warn, parent]
  );
  return <ModalPresentationScopeContext value={scope}>{children}</ModalPresentationScopeContext>;
}

export const createStandardNativeStackNavigator = createStandardNavigator<
  NativeStackNavigationOptions,
  StandardNativeStackEventMap,
  NativeStackNavigatorCreateProps
>(NativeStackNavigatorContent);
