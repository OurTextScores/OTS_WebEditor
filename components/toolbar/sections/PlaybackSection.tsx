import React from 'react';
import { Button } from '../../ui/Button';
import { ToolbarSectionProps } from '../types';
import { Play, Square } from 'lucide-react';

export const PlaybackSection: React.FC<ToolbarSectionProps> = ({
    onPlayAudio,
    onPlayFromSelectionAudio,
    onStopAudio,
    isPlaying,
    audioAvailable,
    audioBusy,
    selectionActive,
}) => {
    return (
        <>
            <Button
                data-testid="btn-play"
                onClick={onPlayAudio}
                disabled={!audioAvailable || !onPlayAudio || audioBusy}
                variant="primary"
                size="sm"
                className="shadow-sm bg-green-600 hover:bg-green-700 border-green-600"
            >
                <Play size={14} className="mr-2" />
                {audioBusy ? 'Working…' : isPlaying ? 'Replay' : 'Play'}
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
            <Button
                data-testid="btn-stop"
                onClick={onStopAudio}
                disabled={!audioAvailable || !onStopAudio}
                variant="outline"
                size="sm"
                className="shadow-sm"
                title="Stop"
            >
                <Square size={14} className="mr-2" />
                Stop
            </Button>
        </>
    );
};
