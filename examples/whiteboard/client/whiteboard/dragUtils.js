// @flow

import { type Drag, type State, type Action, type Selection } from './state';

import {
    type rect,
    type pos,
    evtPos,
    addPos,
    normalizedRect,
    posDiff,
    absMax,
    clamp,
    rectIntersect,
    fromScreen,
    BOUNDS,
} from '../types';

const MIN_MOVEMENT = 5;

export const dragScroll = (windowBounds: rect, drag: Drag, dispatch: Action => void) => {
    let dx = 0;
    let dy = 0;
    const margin = 50;
    const left = windowBounds.position.x;
    if (drag.screenPos.x <= margin + left) {
        dx = drag.screenPos.x - margin - left;
    }
    const top = windowBounds.position.y;
    if (drag.screenPos.y <= margin + top) {
        dy = drag.screenPos.y - margin - top;
    }
    const right = windowBounds.position.x + windowBounds.size.x;
    if (drag.screenPos.x >= right - margin) {
        dx = drag.screenPos.x - (right - margin);
    }
    const bottom = windowBounds.position.y + windowBounds.size.y;
    if (drag.screenPos.y >= bottom - margin) {
        dy = drag.screenPos.y - (bottom - margin);
    }
    if (dx !== 0 || dy !== 0) {
        // TODO maybe square the deltas
        dispatch({
            type: 'drag_scroll',
            windowSize: windowBounds.size,
            delta: {
                x: dx / 2,
                y: dy / 2,
            },
            drag,
        });
    }
};

export const onMove = (
    evt: MouseEvent,
    state: State,
    dispatch: Action => void,
    dragRef: { current: boolean },
    baseNode: Node,
) => {
    if (state.drag) {
        const drag = state.drag;
        evt.preventDefault();
        evt.stopPropagation();
        const screenPos = evtPos(evt);
        const pos = fromScreen(screenPos, state.pan, state.zoom);
        const diff = posDiff(drag.offset, pos);
        const enough = drag.enough || Math.max(Math.abs(diff.x), Math.abs(diff.y)) > MIN_MOVEMENT;
        if (enough) {
            dragRef.current = true;
        }
        dispatch({
            type: 'set_drag',
            drag: {
                offset: drag.offset,
                mouse: pos,
                enough: enough,
                screenPos,
            },
        });
    } else if (state.dragSelect) {
        const { dragSelect } = state;
        evt.preventDefault();
        evt.stopPropagation();
        // $FlowFixMe
        const box = baseNode.getBoundingClientRect();
        const pos = fromScreen(
            posDiff({ x: box.left, y: box.top }, evtPos(evt)),
            state.pan,
            state.zoom,
        );
        const enough = absMax(posDiff(dragSelect.position, pos)) > MIN_MOVEMENT;
        if (enough) {
            dragRef.current = true;
        }
        dispatch({
            type: 'set_select',
            dragSelect: {
                position: dragSelect.position,
                size: posDiff(dragSelect.position, pos),
            },
        });
    }
};

const mergeSelection = (one: Selection, two: Selection) => {
    const res = { ...one };
    for (let key of Object.keys(two)) {
        res[key] = res[key] || two[key];
    }
    return res;
};

export const onMouseUp = (
    evt: MouseEvent,
    state: State,
    bounds: { [key: string]: rect },
    dispatch: Action => void,
    onMove: (string, pos) => void,
    selection: Selection,
    setSelection: Selection => void,
) => {
    if (state.drag) {
        const drag = state.drag;
        if (drag.enough) {
            const diff = posDiff(drag.offset, drag.mouse);
            Object.keys(selection).forEach(key => {
                onMove(key, clamp(addPos(bounds[key].position, diff), bounds[key].size, BOUNDS));
            });
            evt.preventDefault();
        }
        evt.stopPropagation();
        dispatch({ type: 'set_drag', drag: null });
    } else if (state.dragSelect) {
        const { dragSelect } = state;
        const newSelection: Selection = {};
        let anySelected = false;
        Object.keys(bounds).forEach(key => {
            if (rectIntersect(bounds[key], normalizedRect(dragSelect))) {
                anySelected = true;
                newSelection[key] = true;
            }
        });
        // Suuper weird bug-looking thing, if this is called
        // synchronously, the react event doesn't bubble to the Whiteboard's
        // onClick handler
        setTimeout(() => dispatch({ type: 'set_select', dragSelect: null }), 0);
        if (anySelected) {
            if (evt.metaKey || evt.shiftKey) {
                setSelection(mergeSelection(selection, newSelection));
            } else {
                setSelection(newSelection);
            }
        }
    }
};
