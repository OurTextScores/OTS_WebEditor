'use client';

import { useSyncExternalStore } from 'react';
import {
  getFollowState,
  getFollowStateOnServer,
  subscribeFollowState,
  type FollowState,
} from './score-following';

/**
 * The editor's following state, live. Kept out of the store's barrel for the same reason as `useClickPreferences`:
 * the command catalog that reads the store is imported by the server-rendered help page.
 */
export const useFollowState = (): FollowState =>
  useSyncExternalStore(subscribeFollowState, getFollowState, getFollowStateOnServer);
