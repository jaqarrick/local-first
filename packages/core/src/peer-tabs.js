// @flow

import type {
    Persistence,
    OldNetwork,
    Network,
    ClockPersist,
    DeltaPersistence,
    FullPersistence,
} from './types';
import type { HLC } from '../../hybrid-logical-clock';
import * as hlc from '../../hybrid-logical-clock';
import deepEqual from 'fast-deep-equal';
import { type PeerChange } from './types';

export const peerTabAwareNetworks = function<SyncStatus>(
    name: string,
    handleCrossTabChanges: PeerChange => mixed,
    networks: { [key: string]: Network<SyncStatus> },
): OldNetwork<{ [key: string]: SyncStatus }> {
    const connectionListeners = [];
    let currentSyncStatus = {};
    Object.keys(networks).forEach(key => (currentSyncStatus[key] = networks[key].initial));

    const { sendCrossTabChange, sync, close } = peerTabAwareSync(
        name,
        status => {
            // STOPSHIP: this status tracking is *broken*, we need to track which network it was
            // when we send status across tabs
            Object.keys(networks).forEach(key => (currentSyncStatus[key] = status));
            // currentSyncStatus[] = status;
            connectionListeners.forEach(f => f(currentSyncStatus));
        },
        peerChange => {
            // console.log('received peer change');
            handleCrossTabChanges(peerChange);
        },
        // Create the thing.
        (sendCrossTabChange, onStatus) => {
            const syncs = {};
            Object.keys(networks).forEach(key => {
                syncs[key] = networks[key].createSync(sendCrossTabChange, onStatus, () => {
                    Object.keys(syncs).forEach(k => {
                        if (k !== key) {
                            syncs[k](true);
                        }
                    });
                });
            });
            return () => {
                Object.keys(syncs).forEach(k => {
                    syncs[k]();
                });
            };
        },
    );

    return {
        setDirty: sync,
        onSyncStatus: fn => {
            connectionListeners.push(fn);
        },
        getSyncStatus() {
            return currentSyncStatus;
        },
        sendCrossTabChanges(peerChange) {
            sendCrossTabChange(peerChange);
        },
        close() {
            close();
        },
    };
};

export const peerTabAwareNetwork = function<SyncStatus>(
    name: string,
    handleCrossTabChanges: PeerChange => mixed,
    network: Network<SyncStatus>,
): OldNetwork<SyncStatus> {
    const connectionListeners = [];
    let currentSyncStatus = network.initial;

    const { sendCrossTabChange, sync, close } = peerTabAwareSync(
        name,
        status => {
            currentSyncStatus = status;
            connectionListeners.forEach(f => f(currentSyncStatus));
        },
        peerChange => {
            // console.log('received peer change');
            handleCrossTabChanges(peerChange);
        },
        (sendCrossTabChange, onStatus) => {
            const sync = network.createSync(sendCrossTabChange, onStatus, () => {
                // do nothing
            });
            return () => sync(false);
        },
    );

    return {
        setDirty: sync,
        onSyncStatus: fn => {
            connectionListeners.push(fn);
        },
        getSyncStatus() {
            return currentSyncStatus;
        },
        sendCrossTabChanges(peerChange) {
            sendCrossTabChange(peerChange);
        },
        close() {
            // console.log('Not closing peer tabs?');
            network.close();
            close();
        },
    };
};

export const peerTabAwareSync = function<SyncStatus>(
    name: string,
    onStatus: SyncStatus => void,
    handleCrossTabChange: PeerChange => void,
    makeLeaderSync: (
        sendCrossTabChanges: (PeerChange) => void,
        onStatus: (SyncStatus) => void,
    ) => () => void,
) {
    const { BroadcastChannel, createLeaderElection } = require('broadcast-channel');
    const channel = new BroadcastChannel(name, {
        webWorkerSupport: false,
    });

    const originalSync = () => {
        channel.postMessage({ type: 'sync' });
    };

    channel.onmessage = (
        msg:
            | { type: 'change', peerChange: PeerChange }
            | { type: 'sync' }
            | { type: 'status', status: SyncStatus },
    ) => {
        // console.log('got a peer message', msg.type);
        if (msg.type === 'sync' && sync !== originalSync) {
            sync();
        } else if (msg.type === 'change') {
            handleCrossTabChange(msg.peerChange);
        } else if (msg.type === 'status') {
            onStatus(msg.status);
        }
        // console.log('Processed message', msg);
    };

    const sendCrossTabChange = (change: PeerChange) => {
        // console.log('Sending changes', change);
        channel.postMessage({ type: 'change', peerChange: change });
    };
    const sendConnectionStatus = (status: SyncStatus) => {
        channel.postMessage({ type: 'status', status });
    };

    const elector = createLeaderElection(channel);
    let sync = originalSync;
    elector.awaitLeadership().then(() => {
        sync = makeLeaderSync(sendCrossTabChange, status => {
            onStatus(status);
            sendConnectionStatus(status);
        });
    });

    let syncTimer = null;

    return {
        sendCrossTabChange,
        // Dedup sync calls within the same tick -- makes a lot of things easier.
        sync: () => {
            if (syncTimer) return;
            syncTimer = setTimeout(() => {
                syncTimer = null;
                sync();
            }, 0);
        },
        close() {
            channel.close();
        },
    };
};
