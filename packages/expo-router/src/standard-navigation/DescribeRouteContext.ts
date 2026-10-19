import { createContext } from 'react';

import type { DescribePlaceholderRoute } from './types';

/** Describes a route of the nearest navigator, including routes that are not in its state yet. */
export const DescribeRouteContext = createContext<DescribePlaceholderRoute | undefined>(undefined);
