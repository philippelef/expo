import { act, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { disableModalPresentationWarning, type RedirectConfig } from '..';
import { router } from '../imperative-api';
import Stack from '../layouts/Stack';
import { Link } from '../link/Link';
import { renderRouter } from '../testing-library';
import type { FileStub } from '../testing-library/context-stubs';

const mockRedirects = jest.fn(() => [] as RedirectConfig[]);
const mockOpenURL = jest.fn((_url: string) => undefined);

jest.mock('expo-constants', () => ({
  ...jest.requireActual('expo-constants'),
  expoConfig: {
    extra: {
      router: {
        get redirects() {
          return mockRedirects();
        },
      },
    },
  },
}));

jest.mock('expo-linking', () => ({
  ...jest.requireActual('expo-linking'),
  get openURL() {
    return (url: string) => mockOpenURL(url);
  },
}));

let warn: jest.SpyInstance;

beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  mockRedirects.mockReturnValue([]);
});

// The warning logs once per route for the whole test file, so each test uses its own target route.
function modalWarnings() {
  return warn.mock.calls.filter(([message]) => String(message).includes('as a modal'));
}

function renderApp(index = () => <Text testID="index" />, routes: Record<string, FileStub> = {}) {
  return renderRouter({
    _layout: () => (
      <Stack>
        <Stack.Screen name="sheet" options={{ presentation: 'formSheet' }} />
        <Stack.Screen name="link-sheet" options={{ presentation: 'formSheet' }} />
        <Stack.Screen name="other-sheet" options={{ presentation: 'formSheet' }} />
        <Stack.Screen name="nested" options={{ presentation: 'formSheet' }} />
        <Stack.Screen name="external-sheet" options={{ presentation: 'formSheet' }} />
        <Stack.Screen name="lazy-sheet" options={{ presentation: 'formSheet' }} />
        <Stack.Screen
          name="param-target"
          options={({ route }) => ({
            presentation: (route.params as { sheet?: string } | undefined)?.sheet
              ? 'formSheet'
              : undefined,
          })}
        />
      </Stack>
    ),
    index,
    sheet: () => <Text testID="sheet" />,
    'link-sheet': () => (
      <>
        <Link href="/link-target">First</Link>
        <Link href="/link-target">Second</Link>
        <Link href="/other-sheet">Sheet</Link>
        <Link href="/param-target?sheet=1">Param sheet</Link>
      </>
    ),
    'other-sheet': () => <Text testID="other-sheet" />,
    'param-target': () => <Text testID="param-target" />,
    'push-target': () => <Text testID="push-target" />,
    'navigate-target': () => <Text testID="navigate-target" />,
    'replace-target': () => <Text testID="replace-target" />,
    'replace-sheet-target': () => <Text testID="replace-sheet-target" />,
    'link-target': () => <Text testID="link-target" />,
    'nested/_layout': () => <Stack />,
    'nested/index': () => <Link href="/parent-target">Parent target</Link>,
    'parent-target': () => <Text testID="parent-target" />,
    'external-sheet': () => <Link href="/external">External</Link>,
    ...routes,
    'index-link-target': () => <Text testID="index-link-target" />,
    'disabled-target': () => <Text testID="disabled-target" />,
  });
}

it('warns once when router.push shows a card route as a modal', async () => {
  await renderApp();
  await act(() => router.push('/sheet'));
  // These routes set their own presentation, so they do not warn.
  await act(() => router.push('/other-sheet'));
  await act(() => router.push('/param-target?sheet=1'));

  await act(() => router.push('/push-target'));
  await act(() => router.push('/push-target'));

  expect(screen.getByTestId('push-target')).toBeVisible();
  expect(modalWarnings()).toEqual([
    [
      'Route "./push-target.js" has no `presentation` option, but shows as a modal because modal route "./sheet.js" is below it in the same stack. This can change in a future version. Set `presentation` in the layout\'s screen `options` (for example from route params with `options={({ route }) => ...}`), or create a card screen and a form sheet screen that share one component. Call `disableModalPresentationWarning()` to hide this warning.',
    ],
  ]);
});

it('warns when router.navigate shows a card route as a modal', async () => {
  await renderApp();
  await act(() => router.push('/sheet'));

  await act(() => router.navigate('/navigate-target'));

  expect(modalWarnings()).toEqual([[expect.stringContaining('"./navigate-target.js"')]]);
});

it('warns when router.replace shows a card route as a modal', async () => {
  await renderApp();
  await act(() => router.push('/sheet'));
  // Replacing the modal route itself does not warn.
  await act(() => router.replace('/replace-sheet-target'));
  await act(() => router.push('/sheet'));
  await act(() => router.push('/other-sheet'));

  await act(() => router.replace('/replace-target'));

  expect(modalWarnings()).toEqual([[expect.stringContaining('"./replace-target.js"')]]);
});

it('warns once when Links to a card route render inside a modal route', async () => {
  await renderApp();

  await act(() => router.push('/link-sheet'));

  // No Link was pressed. Only the two Links to `/link-target` match, and they log one warning.
  expect(screen).toHavePathname('/link-sheet');
  expect(modalWarnings()).toEqual([[expect.stringContaining('"./link-target.js"')]]);
});

it('does not warn for a Link in a screen below the modal route', async () => {
  await renderApp(() => <Link href="/index-link-target">Index link</Link>);

  await act(() => router.push('/sheet'));

  // The `Link` in `index` cannot be pressed while the sheet is open.
  expect(screen).toHavePathname('/sheet');
  expect(modalWarnings()).toEqual([]);
});

it('warns when a Link in a nested stack targets a card route in the parent stack', async () => {
  await renderApp();

  await act(() => router.push('/nested'));

  // The `Link` renders in the nested stack, and the parent stack has the modal route.
  expect(screen).toHavePathname('/nested');
  expect(modalWarnings()).toEqual([[expect.stringContaining('"./parent-target.js"')]]);
});

it('does not open an external redirect when a Link renders', async () => {
  mockRedirects.mockReturnValue([
    // An external redirect has no destination route file, so `destinationContextKey` is not set.
    { source: '/external', destination: 'https://example.com' } as RedirectConfig,
  ]);
  await renderApp();

  await act(() => router.push('/external-sheet'));

  expect(screen).toHavePathname('/external-sheet');
  expect(mockOpenURL).not.toHaveBeenCalled();
});

it('does not load a layout when a Link renders', async () => {
  const loadLayout = jest.fn();
  await renderApp(undefined, {
    'lazy-sheet': () => <Link href="/lazy">Lazy</Link>,
    // Like an async route: the module is a thenable until it loads.
    'lazy/_layout': { then: loadLayout } as unknown as FileStub,
    'lazy/index': () => <Text testID="lazy-index" />,
  });

  await act(() => router.push('/lazy-sheet'));

  expect(screen).toHavePathname('/lazy-sheet');
  expect(loadLayout).not.toHaveBeenCalled();
});

// The flag is module state, so this test must stay last.
it('does not warn after disableModalPresentationWarning()', async () => {
  disableModalPresentationWarning();
  await renderApp();
  await act(() => router.push('/sheet'));

  await act(() => router.push('/disabled-target'));

  expect(screen.getByTestId('disabled-target')).toBeVisible();
  expect(modalWarnings()).toEqual([]);
});
