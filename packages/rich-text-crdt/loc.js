// @flow
import type { Content, CRDT, Node, Delta, Loc } from './types';

import { toKey, fromKey, length, keyCmp, contentLength } from './utils';

export const rootSite = '-root-';
export const rootParent = '0:-root-';

// Ok I actually need a better plan
// char-space -> crdt-space
// and back.
// 'abc'
// we need to select an "anchoring"
// certainly the 'start' of a selection anchors right
// and the 'end' anchors left.
// dunno what a good default is for the cursor when
// not selecting, but that can be decided.

/*

| a | b | c | d | e |
0   1   2   3   4   5

yeah just 1 or 0 for the side, true or false.

0(left) is [0:root,1]
0(right) is [1:a, 0]
1(left) is [1:a, 1]
1(right) is [2:a, 0]

*/

// Get the next sibling or parent's next sibling
export const nextSibling = function(crdt: CRDT, node: Node): ?string {
    if (node.parent === rootParent) {
        const idx = crdt.roots.indexOf(node);
        if (idx === -1 || idx + 1 >= crdt.roots.length) {
            return; // selection went too far
        }
        return crdt.roots[idx + 1];
    } else {
        const parent = crdt.map[node.parent];
        const idx = parent.children.indexOf(node);
        if (idx === -1) {
            throw new Error(`Can't find node in parents`);
        }
        if (idx + 1 >= parent.children.length) {
            return nextSibling(crdt, parent);
        }
        return parent.children[idx + 1];
    }
};

const posToPreLocForNode = (
    state: CRDT,
    node: Node,
    pos: number,
): [[number, string], number] => {
    if (pos === 1 && !node.deleted) {
        return [node.id, 0];
    }
    if (pos > node.size) {
        throw new Error(`pos ${pos} not in node ${toKey(node.id)}`);
    }
    if (!node.deleted && node.content.type === 'text') {
        if (pos <= node.content.text.length) {
            return [node.id, pos - 1];
        }
        pos -= node.content.text.length;
    }
    for (let i = 0; i < node.children.length; i++) {
        const child = state.map[node.children[i]];
        if (pos <= child.size) {
            return posToPreLocForNode(state, child, pos);
        }
        pos -= child.size;
    }
    throw new Error(
        `Node size caches must have been miscalculated! Pos ${pos} not found in node ${toKey(
            node.id,
        )}, even though node's size is ${node.size}`,
    );
};

// This represents the loc that is before the pos...
export const posToPreLoc = (
    crdt: CRDT,
    pos: number,
    format: ?{ [key: string]: any },
): [[number, string], number] => {
    if (pos === 0) {
        return [[0, rootSite], 0];
    }
    for (let i = 0; i < crdt.roots.length; i++) {
        const root = crdt.map[crdt.roots[i]];
        if (pos <= root.size) {
            return posToPreLocForNode(crdt, root, pos);
        }
        pos -= root.size;
    }
    throw new Error(`Pos ${pos} is outside the bounds`);
};

const posToPostLocForNode = (state: CRDT, node: Node, pos: number) => {
    if (pos === 0 && !node.deleted) {
        return [node.id, 0];
    }
    if (pos >= node.size) {
        throw new Error(`post pos ${pos} not in node ${toKey(node.id)}`);
    }
    if (!node.deleted && node.content.type === 'text') {
        if (pos < node.content.text.length) {
            return [node.id, pos];
            // return [node.id[0] + pos, node.id[1]];
        }
        pos -= node.content.text.length;
    }
    for (let i = 0; i < node.children.length; i++) {
        const child = state.map[node.children[i]];
        if (pos < child.size) {
            return posToPostLocForNode(state, child, pos);
        }
        pos -= child.size;
    }
    throw new Error(
        `Node size caches must have been miscalculated! Post pos ${pos} not found in node ${toKey(
            node.id,
        )}, even though node's size is ${node.size}`,
    );
};

// this represents the loc that is after the pos
export const posToPostLoc = (
    crdt: CRDT,
    pos: number,
    format: ?{ [key: string]: any },
): [[number, string], number] => {
    for (let i = 0; i < crdt.roots.length; i++) {
        const root = crdt.map[crdt.roots[i]];
        if (pos < root.size) {
            return posToPostLocForNode(crdt, root, pos);
        }
        pos -= root.size;
    }
    if (pos === 0) {
        return [[1, rootSite], 0];
    }
    throw new Error(`Pos ${pos} is outside the bounds`);
};

type Format = { [key: string]: any };

export const formatAt = function(crdt: CRDT, loc: Loc): Format {
    try {
        const node = nodeForKey(crdt, [loc.id, loc.site]);
        // const [id, offset] = posToPostLoc(crdt, pos);
        // const node = nodeForKey(crdt, id);
        const format = {};
        if (!node) {
            return format;
        }
        Object.keys(node.formats).forEach(key => {
            // hmm whats the point of doing it by ID? yeah there is one, its ok
            if (node.formats[key].length) {
                const fmtNode = crdt.map[node.formats[key][0]];
                if (fmtNode.content.type !== 'open') {
                    throw new Error(
                        `non-open node (${
                            node.formats[key][0]
                        }) found in a formats cache for ${toKey(node.id)}`,
                    );
                }
                format[key] = fmtNode.content.value;
            }
        });
        return format;
    } catch {
        return {};
    }
};

export const idAfter = function(crdt: CRDT, loc: Loc): number {
    const node = nodeForKey(crdt, [loc.id, loc.site]);
    if (!loc.pre) {
        return loc.id;
    }
    if (node && node.id[0] + contentLength(node.content) - 1 == loc.id) {
        if (node.children.length) {
            return crdt.map[node.children[0]].id[0];
        }
        const next = nextSibling(crdt, node);
        if (next) {
            return crdt.map[next].id[0];
        }
    }
    return 0;
};

export const posToLoc = function(
    crdt: CRDT,
    pos: number,
    // if true, loc is the char to the left of the pos (the "pre-loc")
    // if false, loc is the char to the right of the pos (the "post-loc")
    anchorToLocAtLeft: boolean,
    // Note that I don't currently support anchoring to the right
    // of the end of the string, but I probably could?
    // ok 1:root is the end, 0:root is the start. cool beans
    format: ?{ [key: string]: any },
): Loc {
    const total = length(crdt);
    if (pos > total) {
        throw new Error(`Loc is outside of the bounds`);
    }
    const [[id, site], offset] = anchorToLocAtLeft
        ? posToPreLoc(crdt, pos, format)
        : posToPostLoc(crdt, pos, format);
    return { id: id + offset, site, pre: anchorToLocAtLeft };
};

export const nodeForKey = function(crdt: CRDT, key: [number, string]): ?Node {
    for (let i = key[0]; i >= 0; i--) {
        const k = toKey([i, key[1]]);
        if (crdt.map[k]) {
            return crdt.map[k];
        }
    }
};

export const charactersBeforeNode = function(crdt: CRDT, node: Node): number {
    let total = 0;
    while (node) {
        const siblings =
            node.parent === rootParent
                ? crdt.roots
                : crdt.map[node.parent].children;
        const idx = siblings.indexOf(node);
        if (idx === -1) {
            throw new Error(
                `node not found in parents children ${toKey(node.id)} ${
                    node.parent
                } - ${siblings.join(';')}`,
            );
        }
        for (let i = 0; i < idx; i++) {
            total += crdt.map[siblings[i]].size;
        }
        if (node.parent === rootParent) {
            break;
        } else {
            node = crdt.map[node.parent];
            if (!node.deleted && node.content.type === 'text') {
                total += node.content.text.length;
            }
        }
    }
    return total;
};

export const locToPos = function(crdt: CRDT, loc: Loc): number {
    if (loc.site === rootSite) {
        return loc.id === 0 ? 0 : length(crdt);
    }
    // step 1: find the node this loc is within
    const node = nodeForKey(crdt, [loc.id, loc.site]);
    if (!node) {
        throw new Error(`Loc does not exist in tree ${JSON.stringify(loc)}`);
    }
    // step 2: find the position-in-text for this node
    const nodePos = charactersBeforeNode(crdt, node);
    // step 3: add 1 based on whether it's pre or post
    const offset = loc.id - node.id[0];
    return nodePos + offset + (loc.pre ? 1 : 0);
};

export const locToInsertionPos = function(
    crdt: CRDT,
    after: [number, string],
    id: [number, string],
): number {
    if (after[1] === rootSite) {
        let idx = crdt.roots.length;
        let pos = 0;
        for (let i = 0; i < crdt.roots.length; i++) {
            if (keyCmp(fromKey(crdt.roots[i]), id) < 1) {
                idx = i;
                break;
            }
            pos += crdt.map[crdt.roots[i]].size;
        }
        return pos;
    }
    // step 1: find the parent node
    const node = nodeForKey(crdt, after);
    if (!node) {
        throw new Error(`Loc does not exist in tree ${JSON.stringify(after)}`);
    }

    // step 2: find the position-in-text for this node
    let nodePos = charactersBeforeNode(crdt, node);

    // We're at the end, in competition with other children
    if (node.id[0] + contentLength(node.content) === after[0] + 1) {
        nodePos += contentLength(node.content);
        let idx = node.children.length;
        for (let i = 0; i < node.children.length; i++) {
            if (keyCmp(fromKey(node.children[i]), id) < 1) {
                idx = i;
                break;
            }
            nodePos += crdt.map[node.children[i]].size;
        }
        return nodePos; // - 1;
    } else {
        // no one here but us
        const offset = after[0] - node.id[0];
        return nodePos + offset + 1;
    }
};