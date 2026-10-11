'use client';

import { useSyncExternalStore } from 'react';
import {
  getVolumePreference,
  getVolumePreferenceOnServer,
  subscribeVolumePreference,
} from './volume-preference';

/** The volume, live (re-renders when it changes). Kept apart from the store, as the click preferences' hook is. */
export const useVolumePreference = (): number =>
  useSyncExternalStore(
    subscribeVolumePreference,
    getVolumePreference,
    getVolumePreferenceOnServer,
  );
