import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  PngExportDialog,
  type PngExportDialogProps,
} from '../components/score-editor/PngExportDialog';
import { GoogleDriveExportDialog } from '../components/score-editor/GoogleDriveExportDialog';
import {
  ShareLinkDialog,
  type ShareLinkDialogProps,
} from '../components/score-editor/ShareLinkDialog';

const pngProps = (overrides: Partial<PngExportDialogProps> = {}): PngExportDialogProps => ({
  pageCount: 4,
  pageInput: '1',
  setPageInput: vi.fn(),
  busy: false,
  onConfirm: vi.fn(),
  onClose: vi.fn(),
  ...overrides,
});

describe('PngExportDialog', () => {
  it('bounds the page selector by the pages the score actually has', () => {
    // A single-page number input, not a range string: the bound is what stops an
    // export request for a page that does not exist.
    render(<PngExportDialog {...pngProps()} />);
    const input = screen.getByTestId('png-export-page-input');

    expect(input).toHaveValue(1);
    expect(input).toHaveAttribute('max', '4');
    expect(input).toHaveAttribute('min', '1');
  });

  it('routes the page selection to the owner', () => {
    const setPageInput = vi.fn();

    render(<PngExportDialog {...pngProps({ setPageInput })} />);
    fireEvent.change(screen.getByTestId('png-export-page-input'), { target: { value: '3' } });

    expect(setPageInput).toHaveBeenCalledWith('3');
  });

  it('confirms and cancels through their own callbacks', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(<PngExportDialog {...pngProps({ onConfirm, onClose })} />);
    fireEvent.click(screen.getByTestId('btn-confirm-export-png'));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('btn-cancel-export-png'));
    expect(onClose).toHaveBeenCalledTimes(1);
    // Cancelling must not also export.
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('blocks a second export while one is running', () => {
    render(<PngExportDialog {...pngProps({ busy: true })} />);

    expect(screen.getByTestId('btn-confirm-export-png')).toBeDisabled();
  });
});

describe('GoogleDriveExportDialog', () => {
  it('hands off to the share-link dialog without closing itself twice', () => {
    const onOpenShareLink = vi.fn();
    const onClose = vi.fn();

    render(<GoogleDriveExportDialog onOpenShareLink={onOpenShareLink} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('btn-drive-next-share-link'));

    expect(onOpenShareLink).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

const shareProps = (overrides: Partial<ShareLinkDialogProps> = {}): ShareLinkDialogProps => ({
  driveUrl: '',
  setDriveUrl: vi.fn(),
  generatedUrl: '',
  setGeneratedUrl: vi.fn(),
  copied: false,
  setCopied: vi.fn(),
  error: '',
  setError: vi.fn(),
  onGenerate: vi.fn(),
  onCopy: vi.fn(),
  onClose: vi.fn(),
  ...overrides,
});

describe('ShareLinkDialog', () => {
  it('generates from the Drive URL it was given', () => {
    const onGenerate = vi.fn();
    const setDriveUrl = vi.fn();

    render(<ShareLinkDialog {...shareProps({ onGenerate, setDriveUrl })} />);
    fireEvent.change(screen.getByTestId('google-drive-share-url'), {
      target: { value: 'https://drive.google.com/file/d/abc/view' },
    });
    fireEvent.click(screen.getByTestId('btn-generate-share-link'));

    expect(setDriveUrl).toHaveBeenCalledWith('https://drive.google.com/file/d/abc/view');
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('offers the copy control only once a link exists', () => {
    const { rerender } = render(<ShareLinkDialog {...shareProps()} />);
    expect(screen.queryByTestId('btn-copy-share-link')).toBeNull();

    rerender(<ShareLinkDialog {...shareProps({ generatedUrl: 'https://ots.example/s/abc' })} />);
    expect(screen.getByTestId('generated-share-link')).toHaveValue('https://ots.example/s/abc');
  });

  it('copies through the owner rather than touching the clipboard itself', () => {
    const onCopy = vi.fn();

    render(
      <ShareLinkDialog {...shareProps({ generatedUrl: 'https://ots.example/s/abc', onCopy })} />,
    );
    fireEvent.click(screen.getByTestId('btn-copy-share-link'));

    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('acknowledges a completed copy', () => {
    render(
      <ShareLinkDialog
        {...shareProps({
          generatedUrl: 'https://ots.example/s/abc',
          copied: true,
        })}
      />,
    );

    expect(screen.getByTestId('share-link-modal')).toHaveTextContent(/copied/i);
  });

  it('surfaces a generation error', () => {
    render(<ShareLinkDialog {...shareProps({ error: 'not a Google Drive link' })} />);

    expect(screen.getByText('not a Google Drive link')).toBeVisible();
  });
});
