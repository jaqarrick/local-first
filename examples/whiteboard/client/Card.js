// @flow
/** @jsx jsx */
import { jsx } from '@emotion/core';
import { render } from 'react-dom';
import React from 'react';

import { type Schema, type Collection } from '../../../packages/client-bundle';
import {
    type pos,
    type rect,
    type CardT,
    CardSchema,
    evtPos,
    addPos,
    normalizedRect,
    posDiff,
    absMax,
    rectIntersect,
    fromScreen,
    clamp,
    BOUNDS,
} from './types';

import type { Action } from '.';

type Props = {
    offset: ?pos,
    card: CardT,
    col: Collection<CardT>,
    panZoom: { current: { pan: pos, zoom: number } },
    selected: boolean,
    hovered: ?boolean,
    dispatch: Action => void,
    dragRef: { current: boolean },
};

const fontSizes = ['1.1em', '1.5em', '1.7em', '2em', '2.2em'];

const Card = ({
    offset,
    card,
    col,
    selected,
    hovered,
    dispatch,
    dragRef,
    panZoom,
}: Props) => {
    const pos = offset
        ? clamp(addPos(card.position, offset), card.size, BOUNDS)
        : card.position;
    const [editing, setEditing] = React.useState(null);
    return (
        <div
            key={card.id}
            onDoubleClick={() => {
                console.log('double click');
                setEditing({
                    title: card.title,
                    description: card.description,
                });
            }}
            style={{
                top: pos.y,
                left: pos.x,
                width: card.size.x,
                height: card.size.y,
                backgroundColor: selected || hovered ? 'aliceblue' : undefined,
            }}
            css={
                card.header == null
                    ? {
                          padding: '4px 12px',
                          boxShadow: '0 0 3px #ccc',
                          backgroundColor: 'white',
                          position: 'absolute',
                          cursor: 'pointer',
                      }
                    : {
                          cursor: 'pointer',
                          padding: '4px 12px',
                          fontSize:
                              fontSizes[
                                  Math.min(card.header, fontSizes.length - 1)
                              ],
                          backgroundColor: 'transparent',
                          position: 'absolute',
                      }
            }
            onMouseDown={evt => {
                const screenPos = evtPos(evt);
                const pos = fromScreen(
                    screenPos,
                    panZoom.current.pan,
                    panZoom.current.zoom,
                );
                dispatch({
                    type: 'start_drag',
                    pos,
                    screenPos,
                });
                dragRef.current = false;
                // downPos.current = pos;
                if (!selected) {
                    dispatch(
                        evt.metaKey
                            ? {
                                  type: 'add_selection',
                                  selection: { [card.id]: true },
                              }
                            : {
                                  type: 'replace_selection',
                                  selection: { [card.id]: true },
                              },
                    );
                } else if (evt.metaKey) {
                    dispatch({
                        type: 'remove_selection',
                        selection: { [card.id]: true },
                    });
                }
                evt.stopPropagation();
            }}
            onClick={evt => {
                evt.stopPropagation();
                if (dragRef.current) {
                    return;
                }
                if (selected && !evt.metaKey) {
                    dispatch({
                        type: 'replace_selection',
                        selection: { [card.id]: true },
                    });
                }
            }}
        >
            <div
                style={{
                    fontWeight: 'bold',
                    marginBottom: 4,
                    textAlign: 'center',
                }}
            >
                {editing ? (
                    <input
                        onMouseDown={evt => evt.stopPropagation()}
                        onClick={evt => evt.stopPropagation()}
                        value={editing.title}
                        onChange={evt =>
                            setEditing({ ...editing, title: evt.target.value })
                        }
                        style={{
                            fontWeight: 'inherit',
                            fontFamily: 'inherit',
                            width: '100%',
                        }}
                    />
                ) : (
                    card.title
                )}
            </div>
            <div
                style={{
                    fontSize: '80%',
                    textAlign: card.header != null ? 'center' : 'left',
                }}
            >
                {/* {card.description} */}
                {editing ? (
                    <input
                        onMouseDown={evt => evt.stopPropagation()}
                        onClick={evt => evt.stopPropagation()}
                        value={editing.description}
                        onChange={evt =>
                            setEditing({
                                ...editing,
                                description: evt.target.value,
                            })
                        }
                        style={{
                            fontWeight: 'inherit',
                            fontFamily: 'inherit',
                            width: '100%',
                        }}
                    />
                ) : (
                    card.description
                )}
            </div>
            {editing != null ? (
                <div
                    onMouseDown={evt => evt.stopPropagation()}
                    onClick={evt => evt.stopPropagation()}
                >
                    <button
                        onClick={() => {
                            col.setAttribute(card.id, ['title'], editing.title);
                            col.setAttribute(
                                card.id,
                                ['description'],
                                editing.description,
                            );
                            setEditing(null);
                        }}
                    >
                        Save
                    </button>
                    <button onClick={() => setEditing(null)}>Cancel</button>
                </div>
            ) : null}
        </div>
    );
};
export default React.memo<Props>(Card);
