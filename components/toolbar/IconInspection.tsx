import React from 'react';
import { 
    Music, 
    Music2, 
    Music3, 
    Music4, 
    FileMusic, 
    KeyboardMusic, 
    ListMusic,
    Guitar,
    Mic,
    Speech,
    Pencil,
    Play,
    Square,
    Hash
} from 'lucide-react';
import { ClefIcon, KeySignatureIcon } from './CustomIcons';

export const IconInspection = () => {
    // Added text-slate-900 to ensure icons are dark
    const iconStyle = "flex flex-col items-center justify-center p-4 border border-slate-300 rounded bg-white shadow-md gap-2 text-slate-900";
    // Darkened the label for better readability
    const labelStyle = "text-[10px] font-mono text-slate-800 font-bold uppercase";

    return (
        <div className="p-8 bg-slate-200 min-h-screen">
            <h1 className="text-2xl font-black mb-8 text-slate-900">Toolbar Icon Inspection</h1>
            
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6">
                {/* Standard Music Icons */}
                <div className={iconStyle}>
                    <Music size={32} strokeWidth={2.5} />
                    <span className={labelStyle}>Music (1 note)</span>
                </div>
                <div className={iconStyle}>
                    <Music2 size={32} strokeWidth={2.5} />
                    <span className={labelStyle}>Music2 (2 notes)</span>
                </div>
                <div className={iconStyle}>
                    <Music3 size={32} strokeWidth={2.5} />
                    <span className={labelStyle}>Music3 (beamed)</span>
                </div>
                <div className={iconStyle}>
                    <Music4 size={32} strokeWidth={2.5} />
                    <span className={labelStyle}>Music4 (staff)</span>
                </div>

                {/* Specific Instrument Icons */}
                <div className={iconStyle}>
                    <Guitar size={32} strokeWidth={2.5} />
                    <span className={labelStyle}>Guitar</span>
                </div>
                <div className={iconStyle}>
                    <KeyboardMusic size={32} strokeWidth={2.5} />
                    <span className={labelStyle}>KeyboardMusic</span>
                </div>
                <div className={iconStyle}>
                    <Mic size={32} strokeWidth={2.5} />
                    <span className={labelStyle}>Mic</span>
                </div>
                <div className={iconStyle}>
                    <Speech size={32} strokeWidth={2.5} />
                    <span className={labelStyle}>Speech</span>
                </div>

                {/* Utility Icons */}
                <div className={iconStyle}>
                    <ListMusic size={32} strokeWidth={2.5} />
                    <span className={labelStyle}>ListMusic</span>
                </div>
                <div className={iconStyle}>
                    <FileMusic size={32} strokeWidth={2.5} />
                    <span className={labelStyle}>FileMusic</span>
                </div>
                <div className={iconStyle}>
                    <Hash size={32} strokeWidth={2.5} />
                    <span className={labelStyle}>Hash (#)</span>
                </div>
                <div className={iconStyle}>
                    <Pencil size={32} strokeWidth={2.5} />
                    <span className={labelStyle}>Pencil</span>
                </div>

                {/* Playback Icons */}
                <div className={iconStyle}>
                    <Play size={32} strokeWidth={2.5} />
                    <span className={labelStyle}>Play</span>
                </div>
                <div className={iconStyle}>
                    <Square size={32} strokeWidth={2.5} />
                    <span className={labelStyle}>Square (Stop)</span>
                </div>

                {/* Custom Icons */}
                <div className={`${iconStyle} border-blue-400 bg-blue-100`}>
                    <ClefIcon size={32} strokeWidth={2.5} />
                    <span className={labelStyle}>Custom Clef</span>
                </div>
                <div className={`${iconStyle} border-blue-400 bg-blue-100`}>
                    <KeySignatureIcon size={32} strokeWidth={2.5} />
                    <span className={labelStyle}>Custom KeySig</span>
                </div>
            </div>

            <div className="mt-12 p-6 bg-white border-l-4 border-blue-600 rounded shadow-sm text-base text-slate-900">
                <p className="font-bold mb-2">Analysis:</p>
                <ul className="list-disc ml-5 space-y-1">
                    <li>Lucide's <code>Music</code> is a single eighth note.</li>
                    <li>Lucide's <code>Music2</code> is two eighth notes (what you mentioned seeing currently).</li>
                    <li>The <strong>"Custom Clef"</strong> and <strong>"Custom KeySig"</strong> are the SVG components I just built for you.</li>
                </ul>
            </div>
        </div>
    );
};
