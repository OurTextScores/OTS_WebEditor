import React from 'react';

interface CustomIconProps extends React.SVGProps<SVGSVGElement> {
    size?: number;
}

export const ClefIcon: React.FC<CustomIconProps> = ({ size = 14, ...props }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <path d="M12 22V2" />
        <path d="M12 2c3.5 0 6 2.5 6 5 0 3-10 6-10 11 0 2.5 2.5 4 5 4s5-1.5 5-4c0-3-2.5-5-6-5" />
    </svg>
);

export const KeySignatureIcon: React.FC<CustomIconProps> = ({ size = 14, ...props }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        {/* Sharp 1: top-left */}
        <path d="M2 8h7M2 13h7M4.5 4v13M7.5 4v13" />
        {/* Sharp 2: bottom-right offset */}
        <path d="M13 11h7M12 16h8M15.5 7v13M18.5 7v13" />
    </svg>
);
