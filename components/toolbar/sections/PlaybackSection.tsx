import React from 'react';
import { Button } from '../../ui/Button';
import { ToolbarSectionProps } from '../types';
import { Pause, Play, Square } from 'lucide-react';

export const PlaybackSection: React.FC<ToolbarSectionProps> = ({
  onTogglePlayPause,
  onStopAudio,
  onPlayFromSelectionAudio,
  audioAvailable,
  audioBusy,
  isPlaying,
  isPaused,
  selectionActive,
}) => {
  const showPause = Boolean(isPlaying && !isPaused);
  const transportActive = Boolean(isPlaying || isPaused);
  // audioBusy stays true for the whole of a streamed playback -- playTransportAudio
  // awaits the render loop, which runs until the score is exhausted. Gating on it
  // unconditionally would make Pause unclickable for exactly as long as there is
  // something to pause. It only guards the pre-sound startup, so once the transport
  // is active the control must stay live.
  const startupBusy = Boolean(audioBusy) && !transportActive;

  return (
    <>
      <Button
        data-testid="btn-play"
        onClick={onTogglePlayPause}
        disabled={!audioAvailable || !onTogglePlayPause || startupBusy}
        variant="primary"
        size="sm"
        className="shadow-sm"
        title={showPause ? 'Pause' : isPaused ? 'Resume' : 'Play'}
      >
        {showPause ? <Pause size={14} className="mr-2" /> : <Play size={14} className="mr-2" />}
        {showPause ? 'Pause' : isPaused ? 'Resume' : 'Play'}
      </Button>
      <Button
        data-testid="btn-stop"
        onClick={onStopAudio}
        // Only meaningful while the transport is live, and -- like the toggle --
        // must not be gated on audioBusy, which stays true for all of playback.
        disabled={!audioAvailable || !onStopAudio || !transportActive}
        variant="outline"
        size="sm"
        className="shadow-sm"
        title="Stop and rewind"
      >
        <Square size={14} className="mr-2" />
        Stop
      </Button>
      <Button
        data-testid="btn-play-from-selection"
        onClick={onPlayFromSelectionAudio}
        disabled={!audioAvailable || !onPlayFromSelectionAudio || !selectionActive || audioBusy}
        variant="outline"
        size="sm"
        className="shadow-sm"
      >
        <Play size={14} className="mr-2" />
        Play From Selection
      </Button>
    </>
  );
};
