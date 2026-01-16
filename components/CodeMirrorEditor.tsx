'use client';

import React, { useEffect, useRef } from 'react';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { xml } from '@codemirror/lang-xml';
import { basicSetup } from 'codemirror';

type CodeMirrorEditorProps = {
    value: string;
    onChange: (nextValue: string) => void;
    readOnly?: boolean;
    placeholderText?: string;
    testId?: string;
    className?: string;
};

const editorTheme = EditorView.theme({
    '&': {
        height: '80vh',
        backgroundColor: '#ffffff',
    },
    '&.cm-editor.cm-focused': {
        outline: '1px solid #3b82f6',
    },
    '.cm-scroller': {
        fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: '12px',
        overflowX: 'auto',
    },
});

const readOnlyTheme = EditorView.theme({
    '&': {
        backgroundColor: '#f3f4f6',
    },
    '.cm-content': {
        color: '#9ca3af',
    },
});

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

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
    value,
    onChange,
    readOnly = false,
    placeholderText,
    testId,
    className,
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
        ];
        if (placeholderText) {
            extensions.push(placeholder(placeholderText));
        }
        if (readOnly) {
            extensions.push(readOnlyTheme);
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
                xml(),
                xmlLinter,
                lintGutter(),
                foldGutter(),
                keymap.of(foldKeymap),
                syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
                editorTheme,
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
    }, [readOnly, placeholderText]);

    return (
        <div
            ref={containerRef}
            data-testid={testId}
            className={`w-full rounded border border-gray-300 ${className ?? ''}`}
        />
    );
};
