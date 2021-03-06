// @flow
/** @jsx jsx */
import { jsx } from '@emotion/core';
import { render } from 'react-dom';
import React from 'react';
import {
    createInMemoryDeltaClient,
    createPersistedDeltaClient,
    createPersistedBlobClient,
} from '../../../packages/client-bundle';
import { default as makeDeltaInMemoryPersistence } from '../../../packages/idb/src/delta-mem';

import { SortSchema, CommentSchema, CardSchema } from './types';

import Main from './Main';
import Auth, { useAuthStatus, logout } from './Auth';

const schemas = {
    cards: CardSchema,
    comments: CommentSchema,
    sorts: SortSchema,
};

const AppWithAuth = ({ host }) => {
    const status = useAuthStatus(host);
    if (status === null) {
        console.log('waiting');
        // Waiting
        return <div />;
    } else if (status === false) {
        console.log('need login');
        return <Auth host={host} />;
    } else {
        console.log('now working');
        return <App host={host} auth={status} logout={() => logout(host, status.token)} />;
    }
};

const App = ({
    host,
    auth,
    logout,
}: {
    host: string,
    auth: ?{ token: string, user: { name: string, email: string } },
    logout: () => mixed,
}) => {
    // We're assuming we're authed, and cookies are taking care of things.
    const client = React.useMemo(() => {
        console.log('starting a client', auth);
        return auth
            ? createPersistedDeltaClient(
                  'value-sort',
                  schemas,
                  `${host.startsWith('localhost:') ? 'ws' : 'wss'}://${host}/sync?token=${
                      auth.token
                  }`,
              )
            : createPersistedBlobClient('miller-values-sort', schemas, null, 2);
    }, [auth && auth.token]);
    return <Main client={client} user={auth ? auth.user : null} logout={logout} />;
};

const root = document.createElement('div');
if (document.body) {
    document.body.appendChild(root);
    // const host = 'localhost:9090';
    const host = 'value-sort-server.glitch.me';
    console.log('toplevel login');
    render(<AppWithAuth host={host} />, root);
}
