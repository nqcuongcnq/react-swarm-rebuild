import * as react from 'react';
import { RefObject } from 'react';

type SwarmPhase = 'idle' | 'scanning' | 'intro' | 'building' | 'complete' | 'live' | 'paused';
interface SwarmState {
    phase: SwarmPhase;
    completed: number;
    total: number;
    progress: number;
    agents: number;
    speed: number;
    sound: boolean;
    tour: boolean;
}
interface SwarmOptions {
    /** A selector, element, or React ref. Defaults to document.body. */
    target?: string | HTMLElement | RefObject<HTMLElement | null>;
    /** Number of workers, between 2 and 48. Default: 16. */
    cursorCount?: number;
    /** Playback multiplier, between 0.25 and 8. Default: 1. */
    speed?: number;
    /** Synthesized audio; requires a browser user gesture. Default: false. */
    sound?: boolean;
    /** Follow the next unfinished layer by scrolling the page. Default: false. */
    tour?: boolean;
    /** Show floating playback controls. Default: true. */
    controls?: boolean;
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
    /** 'flock' keeps cursors until Go live; 'live' reveals the working UI. */
    finishBehavior?: 'flock' | 'live';
    onStateChange?: (state: SwarmState) => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;
}
interface SwarmController {
    start: () => void;
    replay: () => void;
    pause: () => void;
    resume: () => void;
    goLive: () => void;
    stop: () => void;
    setSpeed: (speed: number) => void;
    setSound: (enabled: boolean) => void;
    setTour: (enabled: boolean) => void;
    getState: () => SwarmState;
    destroy: () => void;
}

/** Create an imperative instance. Safe to import during SSR; call in the browser. */
declare function createSwarmRebuild(options?: SwarmOptions): SwarmController;

interface UseSwarmRebuildResult extends SwarmController {
    state: SwarmState;
}
declare function useSwarmRebuild(options?: SwarmOptions): UseSwarmRebuildResult;
interface SwarmRebuildProps extends SwarmOptions {
    /** Run on mount and whenever this changes from false to true. Default: true. */
    active?: boolean;
}
/** Render once beside the UI to rebuild. It adds no wrapper to your React tree. */
declare const SwarmRebuild: react.ForwardRefExoticComponent<SwarmRebuildProps & react.RefAttributes<SwarmController>>;

export { type SwarmController, type SwarmOptions, type SwarmPhase, SwarmRebuild, type SwarmRebuildProps, type SwarmState, type UseSwarmRebuildResult, createSwarmRebuild, useSwarmRebuild };
