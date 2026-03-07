import { describe, expect, it } from 'vitest';
import {
    parseEditorLaunchContextParam,
    sanitizeEditorLaunchContext,
    stringifyEditorLaunchContext,
} from '../lib/editor-launch-context';

describe('editor-launch-context', () => {
    it('preserves branchName when sanitizing and stringifying launch context', () => {
        const context = sanitizeEditorLaunchContext({
            source: 'ourtextscores',
            workId: '10',
            sourceId: 's1',
            revisionId: 'r2',
            branchName: 'feature-a',
        });

        expect(context).toMatchObject({
            source: 'ourtextscores',
            workId: '10',
            sourceId: 's1',
            revisionId: 'r2',
            branchName: 'feature-a',
        });
        expect(parseEditorLaunchContextParam(stringifyEditorLaunchContext(context))).toEqual(context);
    });
});
