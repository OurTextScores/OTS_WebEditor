export {
  buildCursorIndex,
  cursorAt,
  nextPageChange,
  passTime,
  sameCursor,
  seekTimeAt,
  type CursorIndex,
  type CursorKind,
  type PlaybackCursor,
} from './cursor-model';
export { revealScroll, type Rect, type Viewport } from './follow-viewport';
export {
  getEditorHighlights,
  getEditorHighlightsOnServer,
  subscribeEditorHighlights,
  setEditorHighlight,
  resetEditorHighlightsForTests,
  type EditorHighlightPreferences,
} from './highlight-preferences';
export {
  getFollowState,
  getFollowStateOnServer,
  requestReveal,
  resetFollowStateForTests,
  resumeFollowing,
  setFollowEnabled,
  subscribeFollowState,
  suspendFollow,
  updateFollowState,
  type FollowState,
} from './follow-preferences';
export {
  buildFollowMapIndex,
  resolveContinuousCursor,
  type ContinuousCursor,
  type FollowMapIndex,
} from './follow-map';
