// @flow
/** @jsx jsx */
import { jsx } from '@emotion/core';
import React from 'react';
import { useCollection } from '../../../packages/client-react';

import { type Client, type SyncStatus } from '../../../packages/client-bundle';

import PilesMode, { PILE_WIDTH } from './screens/Piles/AnimatedPiles';
import PhonePilesMode from './screens/Phone/PhonePiles';
import HomePage from './screens/HomePage';

import {
    // type TagT,
    // TagSchema,
    // type ScaleT,
    // ScaleSchema,
    type SortT,
    type CommentT,
    type CardT,
    normalizedRect,
    posDiff,
    rectIntersect,
    BOUNDS,
} from './types';

import { type Collection } from '../../../packages/client-bundle';

const trimmedHash = () => (window.location.hash ? window.location.hash.slice(1) : null);

const useHash = () => {
    const [hash, setHash] = React.useState(() => {
        return trimmedHash();
    });
    React.useEffect(() => {
        const fn = () => {
            setHash(trimmedHash());
        };
        window.addEventListener('hashchange', fn);
        return () => {
            window.removeEventListener('hashchange', fn);
        };
    }, []);
    const setter = React.useCallback((newHash) => {
        // that'll trigger it
        window.location.hash = newHash;
    }, []);
    return [hash, setter];
};

const Main = ({
    client,
    user,
    logout,
}: {
    client: Client<SyncStatus>,
    user: ?{ name: string, email: string },
    logout: () => mixed,
}) => {
    const [col, cards] = useCollection<CardT, SyncStatus>(React, client, 'cards');
    const [sortsCol, sorts] = useCollection<SortT, SyncStatus>(React, client, 'sorts');
    const [commentsCol, comments] = useCollection<CommentT, SyncStatus>(React, client, 'comments');

    const [screen, setScreen] = React.useState('piles');

    // const [sort, setSort] = React.useState(null);
    const [sortId, setSortId] = useHash();
    const sort = sortId ? sorts[sortId] : null;

    if (sort) {
        if (
            window.innerWidth <
            PILE_WIDTH * Math.max(2, (Object.keys(sort.piles).length / 2) | 0)
        ) {
            return (
                <PhonePilesMode
                    cards={cards}
                    col={col}
                    onDone={() => setScreen('whiteboard')}
                    genId={client.getStamp}
                    sort={sort}
                    sortsCol={sortsCol}
                    comments={comments}
                    commentsCol={commentsCol}
                />
            );
        }
        return (
            <PilesMode
                cards={cards}
                col={col}
                onDone={() => setScreen('whiteboard')}
                genId={client.getStamp}
                sort={sort}
                sortsCol={sortsCol}
            />
        );
    } else {
        return (
            <HomePage
                client={client}
                user={user}
                logout={logout}
                openSort={(id) => setSortId(id)}
                genId={client.getStamp}
                cards={cards}
                cardsCol={col}
                sorts={sorts}
                sortsCol={sortsCol}
            />
        );
    }
};

export default Main;
