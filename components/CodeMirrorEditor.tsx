'use client';

import React, { useEffect, useRef } from 'react';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from '@codemirror/language';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { xml } from '@codemirror/lang-xml';
import { json } from '@codemirror/lang-json';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';

export type CodeEditorThemeMode = 'light' | 'light-contrast' | 'dark' | 'dark-contrast';

type CodeMirrorEditorProps = {
    value: string;
    onChange: (nextValue: string) => void;
    readOnly?: boolean;
    placeholderText?: string;
    testId?: string;
    className?: string;
    language?: 'xml' | 'json' | 'none';
    lint?: boolean;
    height?: string;
    maxHeight?: string;
    themeMode?: CodeEditorThemeMode;
};

const sharedEditorTheme = EditorView.theme({
    '&': {
        height: 'var(--cm-height, 80vh)',
        maxHeight: 'var(--cm-max-height, none)',
    },
    '.cm-scroller': {
        fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: '12px',
        overflowX: 'auto',
    },
});

const lightTheme = EditorView.theme({
    '&': {
        backgroundColor: '#ffffff',
        color: '#111827',
    },
    '&.cm-editor.cm-focused': {
        outline: '1px solid #3b82f6',
    },
    '.cm-gutters': {
        backgroundColor: '#f9fafb',
        color: '#6b7280',
        borderRight: '1px solid #e5e7eb',
    },
    '.cm-activeLine': {
        backgroundColor: '#f3f4f6',
    },
    '.cm-activeLineGutter': {
        backgroundColor: '#f3f4f6',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: '#dbeafe',
    },
});

const lightContrastTheme = EditorView.theme({
    '&': {
        backgroundColor: '#ffffff',
        color: '#000000',
    },
    '&.cm-editor.cm-focused': {
        outline: '2px solid #1d4ed8',
    },
    '.cm-gutters': {
        backgroundColor: '#ffffff',
        color: '#1f2937',
        borderRight: '1px solid #111827',
    },
    '.cm-activeLine': {
        backgroundColor: '#e5e7eb',
    },
    '.cm-activeLineGutter': {
        backgroundColor: '#e5e7eb',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: '#bfdbfe',
    },
});

const darkTheme = EditorView.theme({
    '&': {
        backgroundColor: '#0f172a',
        color: '#e2e8f0',
    },
    '&.cm-editor.cm-focused': {
        outline: '1px solid #60a5fa',
    },
    '.cm-content': {
        caretColor: '#f8fafc',
    },
    '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: '#f8fafc',
    },
    '.cm-gutters': {
        backgroundColor: '#111827',
        color: '#94a3b8',
        borderRight: '1px solid #1f2937',
    },
    '.cm-activeLine': {
        backgroundColor: '#1e293b',
    },
    '.cm-activeLineGutter': {
        backgroundColor: '#1e293b',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: '#1e40af',
    },
});

const darkContrastTheme = EditorView.theme({
    '&': {
        backgroundColor: '#000000',
        color: '#ffffff',
    },
    '&.cm-editor.cm-focused': {
        outline: '2px solid #93c5fd',
    },
    '.cm-content': {
        caretColor: '#ffffff',
    },
    '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: '#ffffff',
    },
    '.cm-gutters': {
        backgroundColor: '#000000',
        color: '#d1d5db',
        borderRight: '1px solid #ffffff',
    },
    '.cm-activeLine': {
        backgroundColor: '#1f2937',
    },
    '.cm-activeLineGutter': {
        backgroundColor: '#1f2937',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: '#1d4ed8',
    },
});

const readOnlyTheme = EditorView.theme({
    '.cm-content': {
        opacity: '0.9',
    },
});

const lightContrastHighlightStyle = HighlightStyle.define([
    { tag: [tags.keyword, tags.operatorKeyword], color: '#0c4a6e', fontWeight: '700' },
    { tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: '#7c2d12' },
    { tag: [tags.variableName], color: '#92400e' },
    { tag: [tags.function(tags.variableName), tags.labelName], color: '#1d4ed8', fontWeight: '600' },
    { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#be123c' },
    { tag: [tags.definition(tags.name), tags.separator], color: '#111827' },
    { tag: [tags.brace], color: '#111827', fontWeight: '700' },
    { tag: [tags.annotation], color: '#0f766e' },
    { tag: [tags.number, tags.changed, tags.modifier, tags.self, tags.namespace], color: '#b45309' },
    { tag: [tags.typeName, tags.className], color: '#1d4ed8', fontWeight: '600' },
    { tag: [tags.special(tags.name)], color: '#7e22ce' },
    { tag: [tags.meta], color: '#0f766e' },
    { tag: [tags.comment], color: '#4b5563', fontStyle: 'italic' },
    { tag: [tags.string], color: '#166534' },
    { tag: [tags.invalid], color: '#ffffff', backgroundColor: '#dc2626' },
]);

const darkHighlightStyle = HighlightStyle.define([
    { tag: [tags.keyword, tags.operatorKeyword], color: '#93c5fd' },
    { tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: '#fca5a5' },
    { tag: [tags.variableName], color: '#fdba74' },
    { tag: [tags.function(tags.variableName), tags.labelName], color: '#60a5fa' },
    { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#f472b6' },
    { tag: [tags.definition(tags.name), tags.separator], color: '#e2e8f0' },
    { tag: [tags.brace], color: '#f8fafc' },
    { tag: [tags.annotation], color: '#2dd4bf' },
    { tag: [tags.number, tags.changed, tags.modifier, tags.self, tags.namespace], color: '#fbbf24' },
    { tag: [tags.typeName, tags.className], color: '#93c5fd' },
    { tag: [tags.special(tags.name)], color: '#c4b5fd' },
    { tag: [tags.meta], color: '#67e8f9' },
    { tag: [tags.comment], color: '#94a3b8', fontStyle: 'italic' },
    { tag: [tags.string], color: '#86efac' },
    { tag: [tags.invalid], color: '#ffffff', backgroundColor: '#dc2626' },
]);

const darkContrastHighlightStyle = HighlightStyle.define([
    { tag: [tags.keyword, tags.operatorKeyword], color: '#93c5fd', fontWeight: '700' },
    { tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: '#fca5a5', fontWeight: '600' },
    { tag: [tags.variableName], color: '#fdba74', fontWeight: '600' },
    { tag: [tags.function(tags.variableName), tags.labelName], color: '#bfdbfe', fontWeight: '700' },
    { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#f9a8d4', fontWeight: '700' },
    { tag: [tags.definition(tags.name), tags.separator], color: '#ffffff' },
    { tag: [tags.brace], color: '#ffffff', fontWeight: '700' },
    { tag: [tags.annotation], color: '#67e8f9' },
    { tag: [tags.number, tags.changed, tags.modifier, tags.self, tags.namespace], color: '#fde047', fontWeight: '700' },
    { tag: [tags.typeName, tags.className], color: '#93c5fd', fontWeight: '700' },
    { tag: [tags.special(tags.name)], color: '#ddd6fe', fontWeight: '700' },
    { tag: [tags.meta], color: '#22d3ee', fontWeight: '700' },
    { tag: [tags.comment], color: '#d1d5db', fontStyle: 'italic' },
    { tag: [tags.string], color: '#86efac', fontWeight: '700' },
    { tag: [tags.invalid], color: '#ffffff', backgroundColor: '#dc2626' },
]);

const editorShellThemes: Record<CodeEditorThemeMode, Extension> = {
    light: lightTheme,
    'light-contrast': lightContrastTheme,
    dark: darkTheme,
    'dark-contrast': darkContrastTheme,
};

const editorSyntaxThemes: Record<CodeEditorThemeMode, Extension> = {
    light: syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    'light-contrast': syntaxHighlighting(lightContrastHighlightStyle),
    dark: syntaxHighlighting(darkHighlightStyle),
    'dark-contrast': syntaxHighlighting(darkContrastHighlightStyle),
};

const xmlDiagnostics = (text: string): Diagnostic[] => {
    if (typeof DOMParser === 'undefined') {
        return [];
    }
    const diagnostics: Diagnostic[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
        const message = parserError.textContent?.trim() || 'Invalid XML.';
        diagnostics.push({
            from: 0,
            to: Math.min(1, text.length),
            severity: 'error',
            message,
        });
        return diagnostics;
    }
    const root = doc.documentElement;
    if (!root) {
        diagnostics.push({
            from: 0,
            to: Math.min(1, text.length),
            severity: 'error',
            message: 'XML document is empty.',
        });
        return diagnostics;
    }
    const rootName = root.localName || root.nodeName;
    if (rootName !== 'score-partwise' && rootName !== 'score-timewise') {
        diagnostics.push({
            from: 0,
            to: Math.min(1, text.length),
            severity: 'warning',
            message: 'Root element is not a MusicXML score.',
        });
        return diagnostics;
    }
    if (!doc.querySelector('part-list')) {
        diagnostics.push({
            from: 0,
            to: Math.min(1, text.length),
            severity: 'warning',
            message: 'Missing <part-list> element.',
        });
    }
    if (!doc.querySelector('part')) {
        diagnostics.push({
            from: 0,
            to: Math.min(1, text.length),
            severity: 'warning',
            message: 'No <part> elements found.',
        });
    }
    return diagnostics;
};

const xmlLinter = linter((view) => xmlDiagnostics(view.state.doc.toString()));

const jsonDiagnostics = (text: string): Diagnostic[] => {
    if (!text.trim()) {
        return [];
    }
    try {
        JSON.parse(text);
        return [];
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid JSON.';
        const match = message.match(/position (\d+)/i);
        const pos = match ? Number(match[1]) : 0;
        const from = Number.isFinite(pos) ? Math.max(0, Math.min(pos, text.length)) : 0;
        return [{
            from,
            to: Math.min(from + 1, text.length),
            severity: 'error',
            message,
        }];
    }
};

const jsonLinter = linter((view) => jsonDiagnostics(view.state.doc.toString()));

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
    value,
    onChange,
    readOnly = false,
    placeholderText,
    testId,
    className,
    language = 'xml',
    lint = true,
    height,
    maxHeight,
    themeMode = 'light',
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const configCompartmentRef = useRef(new Compartment());
    const suppressChangeRef = useRef(false);

    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    const buildConfigExtensions = () => {
        const extensions: Extension[] = [
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
            editorShellThemes[themeMode] ?? editorShellThemes.light,
            editorSyntaxThemes[themeMode] ?? editorSyntaxThemes.light,
        ];
        if (placeholderText) {
            extensions.push(placeholder(placeholderText));
        }
        if (readOnly) {
            extensions.push(readOnlyTheme);
        }
        if (language === 'xml') {
            extensions.push(xml());
            if (lint) {
                extensions.push(xmlLinter, lintGutter());
            }
        } else if (language === 'json') {
            extensions.push(json());
            if (lint) {
                extensions.push(jsonLinter, lintGutter());
            }
        }
        return extensions;
    };

    useEffect(() => {
        if (!containerRef.current || viewRef.current) {
            return;
        }
        const state = EditorState.create({
            doc: value,
            extensions: [
                basicSetup,
                foldGutter(),
                keymap.of(foldKeymap),
                sharedEditorTheme,
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        if (suppressChangeRef.current) {
                            return;
                        }
                        const nextValue = update.state.doc.toString();
                        onChangeRef.current(nextValue);
                    }
                }),
                configCompartmentRef.current.of(buildConfigExtensions()),
            ],
        });
        viewRef.current = new EditorView({
            state,
            parent: containerRef.current,
        });
        return () => {
            viewRef.current?.destroy();
            viewRef.current = null;
        };
    }, []);

    useEffect(() => {
        const view = viewRef.current;
        if (!view) {
            return;
        }
        const current = view.state.doc.toString();
        if (value !== current) {
            suppressChangeRef.current = true;
            view.dispatch({
                changes: { from: 0, to: current.length, insert: value },
            });
            suppressChangeRef.current = false;
        }
    }, [value]);

    useEffect(() => {
        const view = viewRef.current;
        if (!view) {
            return;
        }
        view.dispatch({
            effects: configCompartmentRef.current.reconfigure(buildConfigExtensions()),
        });
    }, [readOnly, placeholderText, language, lint, themeMode]);

    return (
        <div
            ref={containerRef}
            data-testid={testId}
            className={`w-full rounded border border-gray-300 ${className ?? ''}`}
            style={{
                '--cm-height': height ?? undefined,
                '--cm-max-height': maxHeight ?? undefined,
            } as React.CSSProperties}
        />
    );
};
