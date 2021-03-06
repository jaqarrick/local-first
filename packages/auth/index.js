// @flow

import {
    createUser,
    fulfillInvite,
    validateSessionToken,
    loginUser,
    createUserSession,
    completeUserSession,
    checkUserExists,
} from './db';

export { createTables } from './db';

type express = any;
type DB = any;

export const setupAuth = (
    db: DB,
    app: express,
    secret: string,
    requireInvite: boolean,
    prefix: string = '/api',
    paths: { [key: string]: string } = {},
) => {
    app.get(prefix + (paths.checkUsername || '/check-login'), (req, res) => {
        if (!req.query.email) {
            return res.status(400).send('email as url param required');
        }
        if (checkUserExists(db, req.query.email)) {
            return res.status(204).end();
        } else {
            return res
                .status(404)
                .json({ inviteRequired: requireInvite })
                .end();
        }
    });
    app.post(prefix + (paths.login || '/login'), (req, res) => {
        if (!req.body || !req.body.email || !req.body.password) {
            return res.status(400).send('username + password as JSON body required');
        }
        const user = loginUser(db, req.body.email, req.body.password);
        if (user == null) {
            res.status(404).send('User not found');
        } else if (user === false) {
            res.status(401).send('Incorrect password');
        } else {
            const token = createUserSession(db, secret, user.id, req.ip);
            res.cookie('token', token, {
                // TODO: this should auto-refresh when you use the app within
                // a reasonable period of time.
                // 60 days
                maxAge: 60 * 24 * 3600 * 1000,
            });
            res.set('X-Session', token);
            res.status(200).json(user.info);
        }
    });
    app.post(prefix + (paths.signup || '/signup'), (req, res) => {
        if (!req.body || !req.body.email || !req.body.password || !req.body.name) {
            return res.status(400).send('required fields: email, password, name');
        }
        const { email, password, name, invite } = req.body;

        if (requireInvite) {
            if (!req.body.invite) {
                return res.status(400).send('invite required');
            }
            const result = fulfillInvite(db, req.body.invite);
            if (result === null) {
                return res.status(400).send('Invalid invite');
            } else if (result === false) {
                return res.status(400).send('Invite has already been used');
            }
        }

        const createdDate = Date.now();
        const userId = createUser(db, {
            password,
            info: { email, name, createdDate },
        });
        const token = createUserSession(db, secret, userId, req.ip);
        res.cookie('token', token, {
            // httpOnly: true,
            // 90 days
            maxAge: 90 * 24 * 3600 * 1000,
        });
        res.set('X-Session', token);
        res.status(200).json({ id: userId, info: { email, name, createdDate, id: userId } });
    });
    const mid = middleware(db, secret);
    app.post(prefix + (paths.logout || '/logout'), mid, (req, res) => {
        completeUserSession(db, req.auth.sessionId);
        res.status(204).end();
    });
    app.post(prefix + (paths.chpwd || '/chpwd'), mid, (req, res) => {
        //
    });
    app.post(prefix + (paths.forgotpw || '/forgotpw'), mid, (req, res) => {
        //
    });
    app.post(prefix + (paths.invite || '/invite'), mid, (req, res) => {
        //
    });
    app.get(prefix + (paths.user || '/user'), mid, (req, res) => {
        res.status(200).json(req.auth.user);
    });
    // forgot pwd
    // will require a separate table. 'forgot-pw-tokens'
    // should I require email verification?
    // another table i'll want: 'invites'.
    // and allow you to require that someone have an invite key
    // in order to sign up.
    // hmm yeah I guess that does have bearing on this stuff.
    // And we'll want to be able to send "You've been invited" emails.
    // Ok, the gmail api looks like a reasonable way to do it?
    // Although I probably want to abstract it out, so you just
    // pass in a 'email this' function or something.
    // Like "sendEmail(address, data)" where data is
    // {type: 'verify'}
    // {type: 'invite', code: string}
    // {type: 'recover', code: string}
    // etc.
    // https://www.npmjs.com/package/juice might be useful
};

export const getAuth = (db: DB, secret: string, req: *) => {
    if (req.query.token) {
        // TODO validateSessionToken should ... issue a new token?
        // if we're getting close to the end...
        // query param doesn't work super well for that.
        // cookies are simplest, for sure.
        // hm. Or a response header.
        // res.set('X-Session', token) could work.
        const auth = validateSessionToken(db, secret, req.query.token);
        if (auth == null) {
            return 'Invalid or expired token (from query)';
        }
        return auth;
    }
    const authHeader = req.get('authorization');
    if (authHeader && authHeader.match(/^Bearer: /i)) {
        const token = authHeader.slice('Bearer: '.length);
        const auth = validateSessionToken(db, secret, token);
        if (auth == null) {
            return 'Invalid or expired token (from header)';
        }
        return auth;
    }
    if (req.cookies && req.cookies.session) {
        const auth = validateSessionToken(db, secret, req.cookies.token);
        if (auth == null) {
            return 'Invalid or expired token (from cookie)';
        }
        return auth;
    }
    return 'No token given (query param or header or cookie)';
};

export const middleware = (db: DB, secret: string) => (req: *, res: *, next: *) => {
    const auth = getAuth(db, secret, req);
    if (typeof auth === 'string') {
        console.log(auth);
        res.status(401);
        return res.send(auth);
    }
    req.auth = auth;
    next();
};
