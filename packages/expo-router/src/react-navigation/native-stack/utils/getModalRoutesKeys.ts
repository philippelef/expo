import type { Route } from '../../native';
import type { NativeStackNavigationOptions } from '../types';

export type RouteOptionsMap = Record<string, { options: NativeStackNavigationOptions } | undefined>;

export const getModalRouteKeys = (routes: Route<string>[], descriptors: RouteOptionsMap) =>
  routes.reduce<string[]>((acc, route) => {
    const { presentation } = descriptors[route.key]?.options ?? {};

    if (
      (acc.length && !presentation) ||
      presentation === 'modal' ||
      presentation === 'transparentModal' ||
      presentation === 'containedModal' ||
      presentation === 'containedTransparentModal' ||
      presentation === 'fullScreenModal' ||
      presentation === 'formSheet' ||
      presentation === 'pageSheet'
    ) {
      acc.push(route.key);
    }

    return acc;
  }, []);
