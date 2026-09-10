import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodeMirrorEditor } from '../components/CodeMirrorEditor';

describe('CodeMirrorEditor', () => {
  it('updates document and configuration without recreating the editor view', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CodeMirrorEditor
        value="first"
        onChange={onChange}
        language="none"
        lint={false}
        testId="editor"
      />,
    );
    const shell = screen.getByTestId('editor');
    const originalEditor = shell.querySelector('.cm-editor');
    expect(originalEditor).not.toBeNull();
    expect(shell.querySelector('.cm-content')).toHaveTextContent('first');

    rerender(
      <CodeMirrorEditor
        value="second"
        onChange={onChange}
        language="json"
        lint={false}
        readOnly
        themeMode="dark"
        testId="editor"
      />,
    );

    expect(shell.querySelector('.cm-editor')).toBe(originalEditor);
    expect(shell.querySelector('.cm-content')).toHaveTextContent('second');
    expect(shell.querySelector('.cm-content')).toHaveAttribute('contenteditable', 'false');
    expect(onChange).not.toHaveBeenCalled();
  });
});
