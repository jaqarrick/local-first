// @flow

const insert = (at, text, format = {}) => ({
    type: 'insert',
    at,
    text,
    format,
});
const del = (at, count) => ({ type: 'delete', at, count });
const fmt = (at, count, key, value, stamp = Date.now()) => ({
    type: 'fmt',
    at,
    count,
    key,
    value,
    stamp,
});

const text = (text, fmt = {}) => ({ text, fmt });

// Content
const bold = (value, stamp?) => ({
    type: 'open',
    key: 'bold',
    value,
    ...(stamp ? { stamp } : {}),
});
const ctext = text => ({ type: 'text', text });
const close = stamp => ({ type: 'close', ...(stamp ? { stamp } : {}) });

module.exports = [
    // // Insertions
    {
        title: 'Basic insertion',
        // only: true,
        actions: [insert(0, 'Hia'), { state: [text('Hia')] }],
    },
    {
        title: 'Insert several',
        actions: [
            insert(0, 'Hello'),
            insert(1, '1'),
            insert(3, '2'),
            { state: [text('H1e2llo')] },
        ],
    },
    {
        title: 'Insert + merge',
        actions: [
            insert(0, 'A'),
            insert(1, 'B'),
            insert(2, 'C'),
            { contents: [ctext('ABC')] },
        ],
    },
    {
        title: 'Insert + delete merge',
        actions: [
            insert(0, 'ABCD'),
            del(3),
            del(2),
            del(1),
            { contents: [ctext('A')] },
            { contents: [ctext('A'), ctext('BCD')], all: true },
        ],
    },
    // TODO test deletion merging
    // {
    //     title: 'Delete + merge',
    //     actions: [
    //         insert(0, 'ABCD'),
    //         del(3, 1),
    //         del(2, 1),
    //         del(1, 1),
    //         {contents: [ctext('A')]}
    //     ]
    // }
    // // Deletions
    {
        title: 'Delete at start',
        actions: [insert(0, 'Hello'), del(0, 2), { state: [text('llo')] }],
    },
    {
        title: 'Delete in middle',
        actions: [insert(0, 'Hello'), del(1, 2), { state: [text('Hlo')] }],
    },
    {
        title: 'Delete multiple',
        actions: [
            insert(0, 'Hello'),
            del(1, 2),
            del(2, 1),
            { state: [text('Hl')] },
        ],
    },
    {
        title: 'Insert and delete',
        actions: [
            insert(0, 'Hello'),
            insert(2, '-i-'),
            del(0, 1),
            { state: [text('e-i-llo')] },
        ],
    },
    {
        title: 'Basic fmt',
        actions: [
            insert(0, 'Hello'),
            fmt(1, 2, 'bold', true),
            { state: [text('H'), text('el', { bold: true }), text('lo')] },
        ],
    },
    {
        title: 'fmt overwrite',
        actions: [
            insert(0, 'a b c d'),
            fmt(0, 7, 'bold', true, '0'),
            fmt(0, 3, 'bold', false, '1'),
            {
                contents: [
                    bold(false, '1'),
                    bold(true, '0'),
                    ctext('a b'),
                    close('1'),
                    ctext(' c d'),
                    close('0'),
                ],
            },
            {
                state: [
                    text('a b', { bold: false }),
                    text(' c d', { bold: true }),
                ],
            },
        ],
    },
    {
        title: 'fmt then insert, chech cache',
        actions: [
            insert(0, 'a bc d'),
            fmt(2, 2, 'bold', true),
            insert(3, 'hi'),
            { state: [text('a '), text('bhic', { bold: true }), text(' d')] },
        ],
    },
    {
        title: 'parallel fmt, stamp precedence',
        actions: [
            insert(0, 'a b c d'),
            {
                parallel: {
                    a: [
                        fmt(0, 7, 'bold', true, '0'),
                        fmt(0, 3, 'bold', false, '1'),
                    ],
                    b: [fmt(2, 3, 'bold', true, '2')],
                },
            },
            {
                contents: [
                    bold(false, '1'),
                    bold(true, '0'),
                    ctext('a '),
                    bold(true, '2'),
                    ctext('b'),
                    close('1'),
                    ctext(' c'),
                    close('2'),
                    ctext(' d'),
                    close('0'),
                ],
            },
            {
                state: [
                    text('a ', { bold: false }),
                    text('b c d', { bold: true }),
                ],
            },
        ],
    },
    // different order
    {
        title: 'parallel fmt (different stamp order)',
        actions: [
            insert(0, 'a b c d'),
            {
                parallel: {
                    a: [
                        fmt(0, 7, 'bold', true, '0'),
                        fmt(0, 3, 'bold', false, '2'),
                    ],
                    b: [fmt(2, 3, 'bold', true, '1')],
                },
            },
            {
                state: [
                    text('a b', { bold: false }),
                    text(' c d', { bold: true }),
                ],
            },
        ],
    },
    {
        title: 'Insert with format',
        actions: [
            insert(0, 'Hello world'),
            insert(5, ' cruel', { bold: true }),
            {
                state: [
                    text('Hello'),
                    text(' cruel', { bold: true }),
                    text(' world'),
                ],
            },
        ],
    },
    {
        title:
            'Insert with format - connected - should reuse existing format tag',
        actions: [
            insert(0, 'a b c d'),
            fmt(2, 3, 'bold', true),
            insert(2, 'bold', { bold: true }),
            {
                state: [
                    text('a '),
                    text('boldb c', { bold: true }),
                    text(' d'),
                ],
            },
            {
                contents: [
                    ctext('a '),
                    bold(true),
                    ctext('bold'),
                    ctext('b c'),
                    close(),
                    ctext(' d'),
                ],
            },
        ],
    },
    {
        title: 'Bullet then insert',
        quillDeltas: [
            { ops: [{ insert: 'Hello\n' }] },
            {
                ops: [
                    { retain: 5 },
                    { retain: 1, attributes: { list: 'bullet' } },
                ],
            },
            {
                ops: [
                    { retain: 5 },
                    { insert: '\n', attributes: { list: 'bullet' } },
                ],
            },
            { ops: [{ retain: 6 }, { insert: 'Y' }] },
            { ops: [{ retain: 7 }, { insert: 'e' }] },
        ],
        quillResult: {
            ops: [
                { insert: 'Hello' },
                { attributes: { list: 'bullet' }, insert: '\n' },
                { insert: 'Ye' },
                { attributes: { list: 'bullet' }, insert: '\n' },
            ],
        },
    },
    {
        title: 'bullet delete then indent',
        // only: true,
        quillDeltas: [
            { ops: [{ insert: 'Hello\n' }] },
            {
                ops: [
                    { retain: 5 },
                    { retain: 1, attributes: { list: 'bullet' } },
                ],
            },
            {
                ops: [
                    { retain: 5 },
                    { insert: '\n', attributes: { list: 'bullet' } },
                ],
            },
            { ops: [{ retain: 6 }, { insert: 'k' }] },
            { ops: [{ retain: 7 }, { insert: '\t' }] },
            { ops: [{ retain: 7 }, { delete: 1 }] },
            { ops: [{ retain: 7 }, { retain: 1, attributes: { indent: 1 } }] },
        ],
        quillResult: {
            ops: [
                { insert: 'Hello' },
                { attributes: { list: 'bullet' }, insert: '\n' },
                { insert: 'k' },
                { attributes: { indent: 1, list: 'bullet' }, insert: '\n' },
            ],
        },
    },
    {
        title: 'Format then delete format',
        // only: true,
        actions: [
            insert(0, 'Hello'),
            fmt(0, 5, 'bold', true, '0'),
            fmt(0, 5, 'bold', null, '1'),
            {
                state: [text('Hello', {})],
            },
            {
                contents: [ctext('Hello')],
            },
        ],
    },
    {
        title: 'Format then delete - within',
        // only: true,
        actions: [
            insert(0, 'Hello'),
            fmt(1, 3, 'bold', true, '0'),
            fmt(1, 3, 'bold', null, '1'),
            {
                state: [text('Hello', {})],
            },
            {
                contents: [ctext('H'), ctext('ell'), ctext('o')],
            },
        ],
    },

    {
        title: 'Format nested then delete - within',
        // only: true,
        actions: [
            insert(0, 'Hello'),
            fmt(1, 3, 'bold', true, '0'),
            fmt(0, 5, 'bold', true, '1'),
            fmt(0, 5, 'bold', null, '2'),
            {
                state: [text('Hello', {})],
            },
            {
                contents: [ctext('H'), ctext('ell'), ctext('o')],
            },
        ],
    },
    {
        title: 'Format nested then delete - within',
        // only: true,
        actions: [
            insert(0, 'Hello'),
            fmt(3, 2, 'bold', true, '0'),
            fmt(0, 5, 'bold', true, '1'),
            fmt(0, 5, 'bold', null, '2'),
            {
                state: [text('Hello', {})],
            },
            {
                contents: [ctext('Hel'), ctext('lo')],
            },
        ],
    },

    {
        title: 'Format nested twice then delete',
        // only: true,
        actions: [
            insert(0, '123456'),
            fmt(0, 3, 'bold', true, '0'),
            fmt(3, 3, 'bold', true, '1'),
            fmt(0, 6, 'bold', null, '2'),
            {
                state: [text('123456', {})],
            },
            {
                contents: [ctext('123'), ctext('456')],
            },
        ],
    },

    {
        title: 'merge ups',
        // only: true,
        actions: [
            insert(0, 'abc'),
            del(1, 1),
            del(1, 1),
            { state: [text('a', {})] },
        ],
    },

    {
        title: 'Delete across added',
        // only: true,
        actions: [
            insert(0, 'abde'),
            insert(2, 'c'),
            del(1, 3),
            { state: [text('ae', {})] },
        ],
    },

    // Umm. So now what?
    // Maybe I write out the results?
    // Or something?
    // Or how bout I add some ... tests?
    // Or deletion of things?
    // Yeah I definitely need to add deletion.
    // And then ...
    // ... some way to
];
