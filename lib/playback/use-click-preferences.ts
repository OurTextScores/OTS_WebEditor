'use client';

import { useSyncExternalStore } from 'react';
import {
  getClickPreferences,
  getClickPreferencesOnServer,
  subscribeClickPreferences,
  type ClickPreferences,
} from './click-preferences';

/**
 * The switches, live (re-renders when either changes). Kept apart from the store: the store is reached from the
 * command catalog, which the server-rendered help page imports, and a module that imports a React hook cannot be.
 */
export const useClickPreferences = (): ClickPreferences =>
  useSyncExternalStore(subscribeClickPreferences, getClickPreferences, getClickPreferencesOnServer);
