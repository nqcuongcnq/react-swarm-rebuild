import type { RefObject } from 'react';

export type SwarmPhase = 'idle' | 'scanning' | 'intro' | 'building' | 'complete' | 'live' | 'paused';
export interface SwarmState {
    phase: SwarmPhase;
    completed: number;
    total: number;
    progress: number;
    agents: number;
    speed: number;
    sound: boolean;
    tour: boolean;
}
export interface SwarmOptions {
    /** A selector, element, or React ref. Defaults to document.body. */
    target?: string | HTMLElement | RefObject<HTMLElement | null>;
    /** Component targets are clipped to their visible bounds by default. */
    scope?: 'target' | 'viewport';
    /** Keep orbiting without taking a snapshot until content is ready. Default true. */
    ready?: boolean;
    /** Number of workers, between 2 and 48. Default: 16. */
    cursorCount?: number;
    /** Playback multiplier, between 0.25 and 8. Default: 1. */
    speed?: number;
    /** Synthesized audio; requires a browser user gesture. Default: false. */
    sound?: boolean;
    /** Follow the next unfinished layer by scrolling the page. Default: false. */
    tour?: boolean;
    /** Show floating playback controls. Default: true. */
    controls?: boolean | 'minimal';
    /** Show collaborator names. Default: false, matching the minimal cursor look. */
    showNames?: boolean;
    names?: readonly string[];
    colors?: readonly string[];
    /** Intro orbit duration in milliseconds. Default: 1600. */
    introDuration?: number;
    /** Maximum number of visual layers. Default: 2500. */
    maxLayers?: number;
    zIndex?: number;
    background?: string;
    /** Skip animation for prefers-reduced-motion users. Default: true. */
    respectReducedMotion?: boolean;
    /** Default 'live' removes the overlay on completion. Use 'flock' to keep cursors. */
    finishBehavior?: 'flock' | 'live';
    onStateChange?: (state: SwarmState) => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;
}
export interface SwarmController {
    start: () => void;
    replay: () => void;
    pause: () => void;
    resume: () => void;
    goLive: () => void;
    stop: () => void;
    setSpeed: (speed: number) => void;
    setSound: (enabled: boolean) => void;
    setTour: (enabled: boolean) => void;
    setReady: (ready: boolean) => void;
    getState: () => SwarmState;
    destroy: () => void;
}

