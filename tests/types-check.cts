import swarm = require('../dist/index.cjs');
swarm.createSwarmRebuild({ ready: false, scope: 'target', controls: 'minimal' }).setReady(true);
