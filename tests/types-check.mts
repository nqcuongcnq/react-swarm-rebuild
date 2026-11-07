import { createSwarmRebuild, SwarmRebuild } from '../dist/index.js';
createSwarmRebuild({ ready: false, scope: 'target', controls: 'minimal' }).setReady(true);
void SwarmRebuild;
