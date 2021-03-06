// @flow

import type { Collection, PeerChange, Export } from './types';
import type {
    Persistence,
    OldNetwork,
    ClockPersist,
    DeltaPersistence,
    FullPersistence,
    NetworkCreator,
    QueryOp,
} from './types';
import {
    type Schema,
    type Type as SchemaType,
    validate,
    validateSet,
    subSchema,
} from '../../nested-object-crdt/src/schema.js';
import type { HLC } from '../../hybrid-logical-clock';
import * as hlc from '../../hybrid-logical-clock';
import deepEqual from 'fast-deep-equal';

export const fullExport = async function<Data>(persistence: Persistence): Export<Data> {
    const dump = {};
    await Promise.all(
        persistence.collections.map(async colid => {
            // const items = await (await db).getAll(colid + ':nodes');
            dump[colid] = await persistence.loadAll(colid);
        }),
    );
    return dump;
};

export type CollectionState<Data, T> = {
    cache: { [key: string]: Data },
    listeners: Array<(Array<{ id: string, value: ?T }>) => mixed>,
    itemListeners: { [key: string]: Array<(?T) => mixed> },
};

export const newCollection = () => ({
    cache: {},
    listeners: [],
    itemListeners: {},
});

export type UndoManager = {
    add(() => mixed): void,
    undo(): void,
};

export type CRDTImpl<Delta, Data> = {
    merge(?Data, Data): Data,
    latestStamp(Data): ?string,
    value<T>(Data): T,
    get(Data, Array<string | number>): ?Data,
    deltas: {
        diff(?Data, Data): Delta,
        set(Data, Array<string | number>, Data): Delta,
        replace(Data): Delta,
        remove(string): Delta,
        insert(Data, Array<string | number>, number, string, Data, string): Delta,
        insertRelative(
            Data,
            Array<string | number>,
            chidlId: string,
            relativeTo: string,
            before: boolean,
            Data,
            string,
        ): Delta,
        reorderRelative(
            Data,
            path: Array<string | number>,
            childId: string,
            relativeTo: string,
            before: boolean,
            stamp: string,
        ): Delta,
        // $FlowFixMe
        other<Other>(Data, Array<string | number>, Other, string): Delta,
        apply(Data, Delta): Data,
        stamp(Delta): string,
        invert(Data, Delta, () => string): ?Delta,
        restamp(Delta, string): Delta,
    },
    createValue<T>(T, string, () => string, SchemaType): Data,
    createEmpty(string): Data,
};

const send = <Data, T>(state: CollectionState<Data, T>, id: string, value: ?T) => {
    state.listeners.forEach(fn => fn([{ id, value }]));
    if (state.itemListeners[id]) {
        state.itemListeners[id].forEach(fn => fn(value));
    }
};

const atPath = (value, path) => {
    if (path.length === 0) {
        return value;
    }
    return atPath(value[path[0]], path.slice(1));
};

// This is the full version, non-patch I think?
// Ok I believe this also works with the patch version.
export const getCollection = function<Delta, Data, RichTextDelta, T>(
    colid: string,
    crdt: CRDTImpl<Delta, Data>,
    persistence: Persistence,
    state: CollectionState<Data, T>,
    getStamp: () => string,
    setDirty: () => void,
    sendCrossTabChanges: PeerChange => mixed,
    schema: Schema,
    undoManager?: UndoManager,
): Collection<T> {
    // console.log('setting up a collection', colid);
    const applyDelta = async (id: string, delta: Delta, sendNew?: boolean, skipUndo) => {
        let plain = null;

        if (undoManager && !skipUndo) {
            const inverted =
                state.cache[id] == null
                    ? crdt.deltas.replace(crdt.createEmpty(getStamp()))
                    : crdt.deltas.invert(state.cache[id], delta, getStamp);
            if (inverted != null) {
                undoManager.add(() => {
                    // console.log('undoing', inverted);
                    applyDelta(id, crdt.deltas.restamp(inverted, getStamp()), false, true);
                });
            } else {
                // console.log(`Unable to invert delta: undo will be skipped`);
            }
        }

        if (state.cache[id] != null || sendNew) {
            state.cache[id] = crdt.deltas.apply(state.cache[id], delta);
            plain = crdt.value(state.cache[id]);
            send(state, id, plain);
        }
        const full = await persistence.applyDelta(
            colid,
            id,
            delta,
            crdt.deltas.stamp(delta),
            crdt.deltas.apply,
        );
        state.cache[id] = full;
        const newPlain = crdt.value(full);
        if (!deepEqual(plain, newPlain)) {
            send(state, id, newPlain);
        }
        sendCrossTabChanges({ col: colid, nodes: [id] });
        setDirty();
    };
    return {
        // Updaters
        async save(id: string, node: T) {
            validate(node, schema);
            // NOTE this overwrites everything, setAttribute will do much better merges
            // Hmmm I think I want a method that will do "merge in all (changed) values"
            // SEE "updateAttributes" for that WIP
            const delta = crdt.deltas.replace(crdt.createValue(node, getStamp(), getStamp, schema));
            return applyDelta(id, delta, true);
        },

        async applyRichTextDelta(
            id: string,
            path: Array<string | number>,
            // $FlowFixMe um it wants to ebe OtherDelta or something?
            delta: Array<RichTextDelta>,
        ) {
            const sub = subSchema(schema, path);
            if (sub !== 'rich-text') {
                throw new Error(`Schema at path is not a rich-text`);
            }
            if (state.cache[id] == null) {
                const stored = await persistence.load(colid, id);
                if (!stored) {
                    throw new Error(`Cannot set attribute, node with id ${id} doesn't exist`);
                }
                state.cache[id] = stored;
            }
            const hostDelta = crdt.deltas.other(state.cache[id], path, delta, getStamp());
            return applyDelta(id, hostDelta);
        },

        async clearAttribute(id: string, path: Array<string | number>) {
            const sub = subSchema(schema, path);
            if (state.cache[id] == null) {
                const stored = await persistence.load(colid, id);
                if (!stored) {
                    throw new Error(`Cannot set attribute, node with id ${id} doesn't exist`);
                }
                state.cache[id] = stored;
            }
            const delta = crdt.deltas.set(state.cache[id], path, crdt.createEmpty(getStamp()));
            return applyDelta(id, delta);
        },

        async removeId(id: string, path: Array<string | number>, childId: string) {
            const sub = subSchema(schema, path);

            if (state.cache[id] == null) {
                const stored = await persistence.load(colid, id);
                if (!stored) {
                    throw new Error(`Cannot set attribute, node with id ${id} doesn't exist`);
                }
                state.cache[id] = stored;
            }

            const stamp = getStamp();
            const delta = crdt.deltas.set(
                state.cache[id],
                path.concat([childId]),
                crdt.createEmpty(getStamp()),
            );
            return applyDelta(id, delta);
        },

        async reorderIdRelative(
            id: string,
            path: Array<string | number>,
            childId: string,
            relativeTo: string,
            before: boolean,
        ) {
            const sub = subSchema(schema, path);

            if (state.cache[id] == null) {
                const stored = await persistence.load(colid, id);
                if (!stored) {
                    throw new Error(`Cannot set attribute, node with id ${id} doesn't exist`);
                }
                state.cache[id] = stored;
            }

            const stamp = getStamp();
            const delta = crdt.deltas.reorderRelative(
                state.cache[id],
                path,
                childId,
                relativeTo,
                before,
                stamp,
            );

            return applyDelta(id, delta);
        },

        async insertIdRelative(
            id: string,
            path: Array<string | number>,
            childId: string,
            relativeTo: string,
            before: boolean,
        ) {
            if (state.cache[id] == null) {
                const stored = await persistence.load(colid, id);
                if (!stored) {
                    throw new Error(`Cannot set attribute, node with id ${id} doesn't exist`);
                }
                state.cache[id] = stored;
            }

            const stamp = getStamp();
            const delta = crdt.deltas.insertRelative(
                state.cache[id],
                path,
                childId,
                relativeTo,
                before,
                crdt.createValue(childId, stamp, getStamp, 'string'),
                stamp,
            );

            return applyDelta(id, delta);
        },

        async insertId(id: string, path: Array<string | number>, idx: number, childId: string) {
            if (state.cache[id] == null) {
                const stored = await persistence.load(colid, id);
                if (!stored) {
                    throw new Error(`Cannot set attribute, node with id ${id} doesn't exist`);
                }
                state.cache[id] = stored;
            }

            const stamp = getStamp();
            const delta = crdt.deltas.insert(
                state.cache[id],
                path,
                idx,
                childId,
                crdt.createValue(childId, stamp, getStamp, 'string'),
                stamp,
            );

            return applyDelta(id, delta);
        },

        // STOPSHIP test all this madness
        // This does a shallow check of object's keys for exact equality.
        // async updateAttributes(id: string, path: Array<string | number>, value: any) {
        //     const sub = subSchema(schema, path);
        //     validate(value, sub);
        //     if (state.cache[id] == null) {
        //         const stored = await persistence.load(colid, id);
        //         if (!stored) {
        //             throw new Error(`Cannot set attribute, node with id ${id} doesn't exist`);
        //         }
        //         state.cache[id] = stored;
        //     }
        //     const prev = atPath(crdt.value(state.cache[id]), path);
        //     for (const key of Object.keys(value)) {
        //         if (value[key] !== prev[key]) {
        //             await this.setAttribute(id, path.concat([key]), value[key]);
        //         }
        //     }
        // },

        async setAttribute(id: string, path: Array<string | number>, value: any) {
            const sub = subSchema(schema, path);
            validate(value, sub);
            if (state.cache[id] == null) {
                const stored = await persistence.load(colid, id);
                if (!stored) {
                    throw new Error(`Cannot set attribute, node with id ${id} doesn't exist`);
                }
                state.cache[id] = stored;
            }
            const delta = crdt.deltas.set(
                state.cache[id],
                path,
                crdt.createValue(value, getStamp(), getStamp, sub),
            );
            return applyDelta(id, delta);
        },

        async delete(id: string) {
            const stamp = getStamp();

            if (undoManager) {
                if (state.cache[id] == null) {
                    const stored = await persistence.load(colid, id);
                    if (!stored) {
                        throw new Error(`Cannot set attribute, node with id ${id} doesn't exist`);
                    }
                    state.cache[id] = stored;
                }

                const inverted = crdt.deltas.invert(
                    state.cache[id],
                    crdt.deltas.remove(stamp),
                    getStamp,
                );
                if (inverted != null) {
                    undoManager.add(() => {
                        applyDelta(id, crdt.deltas.restamp(inverted, getStamp()), false, true);
                    });
                } else {
                    // console.log(`Unable to invert delta: undo will be skipped`);
                }
            }

            delete state.cache[id];
            send(state, id, null);
            const delta = crdt.deltas.remove(stamp);

            await persistence.applyDelta(colid, id, delta, stamp, crdt.deltas.apply);
            sendCrossTabChanges({ col: colid, nodes: [id] });
            setDirty();
        },

        // Getters
        genId: getStamp,

        getAllCached: () => {
            const values = {};
            Object.keys(state.cache).forEach(id => (values[id] = crdt.value(state.cache[id])));
            return values;
        },

        getCached: (id: string) => {
            return state.cache[id] != null ? crdt.value(state.cache[id]) : null;
        },
        clearCached: (id: string) => {
            delete state.cache[id];
        },

        async load(id: string) {
            if (!id) {
                throw new Error(`No id specified to load.`);
            }
            const v = await persistence.load(colid, id);
            if (!v) {
                return null;
            }
            state.cache[id] = v;
            return crdt.value(v);
        },
        async query(key: string, op: QueryOp, value: any) {
            const results = await persistence.query(colid, key, op, value);
            const res = [];
            // Why isn't this being loaded correctly?
            results.forEach(result => {
                state.cache[result.value.id] = result.value.value; // TODO is this ok?
                const v = crdt.value(result.value.value);
                // STOPSHIP there should be a `crdt.isEmpty` or something
                // to allow true null values if we want them
                if (v != null) {
                    // console.log('QUERY', result.key, result.value.value, v);
                    // TODO also report the id?
                    res.push({ key: result.key, value: v });
                } else {
                    // console.log('NULL', result);
                }
            });

            return res;
        },
        async loadAll() {
            // OOOH I really need to dedup collections
            const all = await persistence.loadAll(colid);
            const res = {};
            // Why isn't this being loaded correctly?
            Object.keys(all).forEach(id => {
                state.cache[id] = all[id];
                const v = crdt.value(all[id]);
                // STOPSHIP there should be a `crdt.isEmpty` or something
                // to allow true null values if we want them
                if (v != null) {
                    res[id] = v;
                }
            });
            return res;
        },

        /**
         * onQueryChanges: Listen for changes to a query.
         *
         * fn: called with (list of results to add/update, list of results to remove)
         *
         * Note that removal isn't yet supported. Neither are indexes
         */
        onQueryChanges(
            key: string,
            op: QueryOp,
            value: any,
            fn: (Array<{ key: string, value: T }>, Array<string>) => mixed,
        ) {
            if (key !== 'key' && key !== 'id') {
                throw new Error('Custom indexes not supported');
            }
            return this.onChanges(changes => {
                const matching = changes.filter(change => matchesQuery(change, key, op, value));
                // console.log('CHANGES', changes, matching, key, op, value);
                const data = matching.map(({ id, value }) => ({
                    key: id,
                    value,
                }));
                const remove = data.filter(change => change.value == null).map(change => change.id);
                fn(
                    data.filter(item => item.value != null),
                    remove,
                );
            });
        },

        onChanges(fn: (Array<{ id: string, value: ?T }>) => void) {
            state.listeners.push(fn);
            return () => {
                state.listeners = state.listeners.filter(f => f !== fn);
            };
        },

        onItemChange(id: string, fn: (?T) => void) {
            if (!state.itemListeners[id]) {
                state.itemListeners[id] = [fn];
            } else {
                state.itemListeners[id].push(fn);
            }
            return () => {
                if (!state.itemListeners[id]) {
                    return;
                }
                state.itemListeners[id] = state.itemListeners[id].filter(f => f !== fn);
            };
        },

        getCachedItems(ids: Array<string>): ?{ [k: string]: ?T | false } {
            const items = {};
            let found = false;
            ids.forEach(id => {
                items[id] = this.getCached(id);
                if (items[id] != null) [(found = true)];
                if (items[id] == null) {
                    items[id] = false;
                }
            });
            return found || ids.length === 0 ? items : null;
        },

        onItemsChange(
            ids: Array<string>,
            fn: ({ [k: string]: ?T | false }) => mixed,
        ): [?{ [k: string]: ?T | false }, () => void] {
            let items = {};
            let found = false;
            ids.forEach(id => {
                items[id] = this.getCached(id);
                if (items[id] != null) [(found = true)];
                if (items[id] == null) {
                    items[id] = false;
                }
            });
            const onChange = (id, data) => {
                items = { ...items, [id]: data };
                fn(items);
            };
            const listeners = ids.filter(Boolean).map(id => {
                if (!items || !items[id]) {
                    this.load(id).then(
                        data => onChange(id, data),
                        /* istanbul ignore next */
                        err => {
                            console.error('Unable to load item!', id);
                            console.error(err);
                        },
                    );
                }
                return this.onItemChange(id, data => onChange(id, data));
            });
            return [found || ids.length === 0 ? items : null, () => listeners.forEach(fn => fn())];
        },
    };
};

const matchesQuery = (change, key, op, value) => {
    if (key !== 'id' && key !== 'key') {
        // custom index
        throw new Error('watching custom index not supported');
    }
    return opCmp(change.id, op, value);
};

const opCmp = (one, op: QueryOp, other) => {
    switch (op) {
        case '=':
            return one === other;
        case '>=':
            return one >= other;
        case '>':
            return one > other;
        case '<=':
            return one <= other;
        case '<':
            return one < other;
        default:
            return false;
    }
};

export const onCrossTabChanges = async function<Delta, Data, T>(
    crdt: CRDTImpl<Delta, Data>,
    persistence: Persistence,
    state: CollectionState<Data, T>,
    colid: string,
    nodes: Array<string>,
) {
    const values = {};
    await Promise.all(
        nodes.map(async id => {
            const v = await persistence.load(colid, id);
            if (v) {
                state.cache[id] = v;
                values[id] = crdt.value(v);
            } else {
                delete state.cache[id];
            }
        }),
    );
    state.listeners.forEach(fn => fn(nodes.map(id => ({ id, value: values[id] }))));
    nodes.forEach(id => {
        if (state.itemListeners[id]) {
            state.itemListeners[id].forEach(fn => fn(values[id]));
        }
    });
};
