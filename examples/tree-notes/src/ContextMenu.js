// @flow
/** @jsx jsx */
import { jsx } from '@emotion/core';
import { useHistory, Route, Link, useRouteMatch, useParams } from 'react-router-dom';

import Button from '@material-ui/core/Button';
import ButtonGroup from '@material-ui/core/ButtonGroup';
import IconButton from '@material-ui/core/IconButton';
import Snackbar from '@material-ui/core/Snackbar';
import CloseIcon from '@material-ui/icons/Close';
import querystring from 'querystring';
import ListItem from '@material-ui/core/ListItem';
import Switch from '@material-ui/core/Switch';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import * as React from 'react';
import Checkbox from '@material-ui/core/Checkbox';

import {
    createPersistedBlobClient,
    createPersistedDeltaClient,
    createPollingPersistedDeltaClient,
    createInMemoryDeltaClient,
    createInMemoryEphemeralClient,
} from '../../../packages/client-bundle';
import { useCollection, useItem } from '../../../packages/client-react';
import { type Client, type SyncStatus, type Collection } from '../../../packages/client-bundle';
import type { Data } from '../../shared/auth-api';
import type { AuthData } from '../../shared/Auth';

import LocalClient from './LocalClient';
import Item from './Item';
import { type DropTarget } from './dragging';
import { setupDragListeners, type DragInit, type DragState } from './dragging';
import type { ItemT } from '../collections';
import { removeFromParent } from './navigation';

type Props = {
    col: Collection<ItemT>,
    path: Array<string>,
    onClose: () => mixed,
    client: Client<*>,
};

const ItemMenuItems = ({ col, path, onClose, client }: Props) => {
    const history = useHistory();
    const [_, item] = useItem(React, client, 'items', path[path.length - 1]);
    if (!item) {
        return null;
    }
    const items = [
        <MenuItem
            key="zoom"
            onClick={() => {
                history.push(`/item/${path.join(':-:')}`);
                onClose();
            }}
        >
            Zoom to here
        </MenuItem>,
    ];
    items.push(
        <MenuItem
            key="completed"
            onClick={() => {
                col.setAttribute(
                    item.id,
                    ['completed'],
                    item.completed == null ? Date.now() : null,
                );
                onClose();
            }}
        >
            <FormControlLabel
                control={
                    <Checkbox
                        checked={item.completed != null}
                        onChange={() => {
                            col.setAttribute(
                                item.id,
                                ['completed'],
                                item.completed == null ? Date.now() : null,
                            );
                            onClose();
                        }}
                    />
                }
                label={'Completed'}
            />
        </MenuItem>,
    );
    items.push(
        <MenuItem key="style">
            Style:
            <ButtonGroup>
                {['header', 'todo'].map((style) => (
                    <Button
                        key={style}
                        size="small"
                        variant={item.style === style ? 'contained' : 'text'}
                        onClick={() => {
                            col.setAttribute(item.id, ['style'], style);
                        }}
                    >
                        {style}
                    </Button>
                ))}
            </ButtonGroup>
        </MenuItem>,
    );
    items.push(
        <MenuItem key="numbering">
            Numbering:
            <ButtonGroup>
                {['numbers', 'letters', 'roman', 'checkbox'].map((style) => (
                    <Button
                        key={style}
                        size="small"
                        variant={
                            item.numbering != null && item.numbering.style === style
                                ? 'contained'
                                : 'text'
                        }
                        onClick={() => {
                            col.setAttribute(
                                item.id,
                                ['numbering'],
                                item.numbering?.style === style ? null : { style },
                            );
                            // onClose();
                        }}
                    >
                        {style}
                    </Button>
                ))}
            </ButtonGroup>
        </MenuItem>,
    );
    items.push(
        <MenuItem
            key="remove"
            onClick={() => {
                removeFromParent(col, path.slice(0, -1), path[path.length - 1]);
                onClose();
            }}
        >
            Remove
        </MenuItem>,
    );
    return items;
};

export default React.forwardRef<*, Props>(ItemMenuItems);
