// @flow
import * as React from 'react';
import { Route, Link, useRouteMatch, useParams } from 'react-router-dom';
// import Quill from 'quill';
// import { type QuillDelta } from '../../../packages/rich-text-crdt/quill-deltas';
import QuillEditor from './Quill';
import { parse, detectLists } from './parse';
import TextField from '@material-ui/core/TextField';
import Button from '@material-ui/core/Button';
import type {
    RecipeMeta,
    RecipeAbout,
    RecipeText,
    RecipeStatus,
    TagT,
    IngredientT,
} from '../collections';
import urlImport from './urlImport';
import { makeStyles } from '@material-ui/core/styles';
import { useCollection, useItem } from '../../../packages/client-react';
import type { Client, Collection } from '../../../packages/client-bundle';
import Delta from 'quill-delta';
import IconButton from '@material-ui/core/IconButton';
import Close from '@material-ui/icons/Close';
import Check from '@material-ui/icons/Check';
import Help from '@material-ui/icons/Help';
import ShoppingCart from '@material-ui/icons/ShoppingCart';
import Edit from '@material-ui/icons/Edit';
import DeleteForever from '@material-ui/icons/DeleteForever';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';

import Grid from '@material-ui/core/Grid';
import Autocomplete, { createFilterOptions } from '@material-ui/lab/Autocomplete';
import Tooltip from './Tooltip';
import { ingredientKinds } from '../collections';
import { ingredientAvailabilities, type PantryIngredient } from '../private-collections';

const filter = createFilterOptions();

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const ingredientMatch = (ingredient: IngredientT, needle: string) => {
    return (
        ingredient.name.toLowerCase().includes(needle) ||
        Object.keys(ingredient.alternateNames).some((name) => name.toLowerCase().includes(needle))
    );
};

const PAGE_SIZE = 20;
const MIN_TO_PAGE = PAGE_SIZE * 3;

const Pager = ({ page, pages, onChange }) => {
    const res = [
        <button onClick={() => onChange(page - 1)} key="<" disabled={page <= 0}>
            {'<'}
        </button>,
    ];
    for (let i = 0; i < pages; i++) {
        res.push(
            <button key={i} disabled={i === page} onClick={() => onChange(i)}>
                {i + 1}
            </button>,
        );
    }
    res.push(
        <button onClick={() => onChange(page + 1)} key=">" disabled={page >= pages - 1}>
            {'>'}
        </button>,
    );
    return res;
};

const SearchField = ({ text, onChange }) => {
    const [value, setValue] = React.useState(text);
    // const inputText = React.useRef(text);
    // if (inputText.current !== text) {
    //     inputText.current = text;
    //     // setValue(text);
    // }
    React.useEffect(() => {
        let tid = setTimeout(() => {
            onChange(value);
        }, 300);
        return () => clearTimeout(tid);
    }, [value]);
    return (
        <TextField
            placeholder="Search"
            label="Search"
            value={value}
            onChange={(evt) => setValue(evt.target.value)}
            fullWidth
        />
    );
};

const Ingredients = ({
    client,
    privateClient,
    actorId,
}: {
    client: Client<*>,
    privateClient: Client<*>,
    actorId: string,
}) => {
    const [ingredientsCol, ingredients] = useCollection<IngredientT, _>(
        React,
        client,
        'ingredients',
    );
    const [pantryIngredientsCol, pantryIngredients] = useCollection<PantryIngredient, _>(
        React,
        privateClient,
        'pantryIngredients',
    );

    const [filterNoKinds, setFilterNoKinds] = React.useState(false);
    const [filterNoPantryStatus, setFilterNoPantryStatus] = React.useState(false);

    const [bulkEdit, setBulkEdit] = React.useState(null);

    const [search, setSearch] = React.useState('');

    const onSelect = React.useCallback(
        (key, val) => setBulkEdit((bulkEdit) => ({ ...bulkEdit, [key]: val })),
        [],
    );

    const [dialog, setDialog] = React.useState(null);
    const [merge, setMerge] = React.useState(null);

    const [bulkTags, setBulkTags] = React.useState(null);

    let [page, setPage] = React.useState(0);

    const keys = Object.keys(ingredients)
        .filter(
            (id) =>
                ingredients[id] != null &&
                ingredients[id].mergedInto == null &&
                (!filterNoKinds || Object.keys(ingredients[id].kinds).length === 0) &&
                (!filterNoPantryStatus || !pantryIngredients[id]),
        )
        .sort((a, b) => cmp(ingredients[a].name.toLowerCase(), ingredients[b].name.toLowerCase()));

    const needle = search.toLowerCase();
    let results =
        search.trim() != ''
            ? keys.filter((key) => ingredientMatch(ingredients[key], needle))
            : keys;

    const pages = results.length / PAGE_SIZE;
    const paging = results.length > MIN_TO_PAGE;

    page = Math.min(page, Math.floor(results.length / PAGE_SIZE));

    if (paging) {
        results = results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    }

    return (
        <div>
            <div style={{ display: 'flex' }}>
                <SearchField text={search} onChange={setSearch} />
                <Button
                    variant={filterNoPantryStatus ? 'contained' : 'text'}
                    onClick={() => {
                        setFilterNoPantryStatus(!filterNoPantryStatus);
                    }}
                >
                    Only w/o pantry status
                </Button>
                <Button
                    onClick={() => {
                        setFilterNoKinds(!filterNoKinds);
                    }}
                    variant={filterNoKinds ? 'contained' : 'text'}
                >
                    Only w/o kinds
                </Button>
                <Button
                    onClick={() => {
                        if (bulkEdit) {
                            setBulkEdit(null);
                        } else {
                            setBulkEdit({});
                            setBulkTags([]);
                        }
                    }}
                >
                    {bulkEdit ? 'Stop bulk editing' : 'Bulk edit'}
                </Button>
            </div>
            {merge != null ? (
                <div>
                    Click on the ingredient to merge "{ingredients[merge]?.name}" into.
                    <Button variant="contained" onClick={() => setMerge(null)}>
                        Cancel merge
                    </Button>
                </div>
            ) : null}
            {paging ? <Pager page={page} pages={pages} onChange={setPage} /> : null}
            {merge != null
                ? results.map((key) => {
                      if (key === merge) {
                          return (
                              <div
                                  style={{
                                      padding: '8px 16px',
                                      fontSize: '1.3em',
                                      backgroundColor: '#aaa',
                                  }}
                              >
                                  {ingredients[key].name}
                              </div>
                          );
                      }
                      return (
                          <div
                              key={key}
                              style={{
                                  padding: '8px 16px',
                                  fontSize: '1.3em',
                                  cursor: 'pointer',
                              }}
                              onClick={() => {
                                  ingredientsCol.setAttribute(merge, ['mergedInto'], key);
                                  // Do the merge!
                                  setMerge(null);
                              }}
                          >
                              {ingredients[key].name}
                          </div>
                      );
                  })
                : results.map((key) => {
                      const ing = (
                          <Ingredient
                              key={key}
                              pantryIngredient={pantryIngredients[key]}
                              pantryCol={pantryIngredientsCol}
                              ingredient={ingredients[key]}
                              col={ingredientsCol}
                              setDialog={setDialog}
                          />
                      );
                      if (bulkEdit) {
                          return (
                              <React.Fragment key={key}>
                                  {ing}
                                  <div>
                                      {ingredientKinds.map((kind) => (
                                          <button
                                              key={kind}
                                              style={
                                                  ingredients[key].kinds[kind] == null
                                                      ? null
                                                      : {
                                                            fontWeight: 'bold',
                                                            textDecoration: 'underline',
                                                        }
                                              }
                                              onClick={async () => {
                                                  if (ingredients[key].kinds[kind] == null) {
                                                      await ingredientsCol.setAttribute(
                                                          key,
                                                          ['kinds', kind],
                                                          Date.now(),
                                                      );
                                                  } else {
                                                      await ingredientsCol.clearAttribute(key, [
                                                          'kinds',
                                                          kind,
                                                      ]);
                                                  }
                                              }}
                                          >
                                              {kind}
                                          </button>
                                      ))}
                                  </div>
                              </React.Fragment>
                          );
                      }
                      return ing;
                  })}
            {paging ? <Pager page={page} pages={pages} onChange={setPage} /> : null}
            {dialog != null ? (
                dialog.type === 'delete' ? (
                    <DeleteDialog
                        ingredient={ingredients[dialog.id]}
                        col={ingredientsCol}
                        setDialog={setDialog}
                        setMerge={setMerge}
                    />
                ) : null
            ) : null}
        </div>
    );
};

const LineEdit = ({ label, value, onChange }) => {
    const [editing, setEditing] = React.useState(null);

    if (editing == null) {
        return (
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 200, fontSize: 20 }}>{value}</div>
                <IconButton
                    onClick={() => {
                        setEditing(value);
                    }}
                >
                    <Edit />
                </IconButton>
            </div>
        );
    }

    return (
        <div>
            <TextField
                placeholder={label}
                label={label}
                value={editing}
                onChange={(evt) => setEditing(evt.target.value)}
            />
            <IconButton
                onClick={() => {
                    onChange(editing);
                    setEditing(null);
                }}
            >
                <Check />
            </IconButton>
            <IconButton
                onClick={() => {
                    setEditing(null);
                }}
            >
                <Close />
            </IconButton>
        </div>
    );
};

import Checkbox from '@material-ui/core/Checkbox';
const Ingredient = React.memo(({ ingredient, setDialog, col, pantryIngredient, pantryCol }) => {
    const [altName, setAltName] = React.useState('');
    return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
            <div>
                {ingredientAvailabilities.map((name, i) => {
                    const color =
                        pantryIngredient != null && pantryIngredient.availability === name
                            ? 'secondary'
                            : 'disabled';
                    return (
                        <IconButton
                            key={name}
                            edge={
                                i === 0
                                    ? 'end'
                                    : i === ingredientAvailabilities.length - 1
                                    ? 'start'
                                    : false
                            }
                            onClick={async () => {
                                if (
                                    pantryIngredient != null &&
                                    pantryIngredient.availability === name
                                ) {
                                    await pantryCol.clearAttribute(ingredient.id, ['availability']);
                                } else {
                                    if (pantryIngredient == null) {
                                        await pantryCol.save(ingredient.id, {
                                            id: ingredient.id,
                                            availability: name,
                                        });
                                    } else {
                                        await pantryCol.setAttribute(
                                            ingredient.id,
                                            ['availability'],
                                            name,
                                        );
                                    }
                                }
                            }}
                        >
                            {name === 'always' ? (
                                <Check color={color} />
                            ) : name === 'sometimes' ? (
                                <Help color={color} />
                            ) : (
                                <ShoppingCart color={color} />
                            )}
                            {/* {name} */}
                        </IconButton>
                    );
                })}
            </div>
            <div style={{ width: 16 }} />
            <LineEdit
                label="Ingredient name"
                value={ingredient.name}
                onChange={(newName) => {
                    col.setAttribute(ingredient.id, ['name'], newName);
                }}
            />
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                {Object.keys(ingredient.alternateNames).map((name) => (
                    <div key={name}>
                        {name}
                        <IconButton
                            onClick={() => {
                                col.clearAttribute(ingredient.id, ['alternateNames', name]);
                            }}
                        >
                            <Close />
                        </IconButton>
                    </div>
                ))}
                <TextField
                    value={altName}
                    onChange={(evt) => setAltName(evt.target.value)}
                    placeholder="Add alternate name"
                />
                {altName.trim() != '' ? (
                    <React.Fragment>
                        <IconButton
                            onClick={() => {
                                col.setAttribute(
                                    ingredient.id,
                                    ['alternateNames', altName],
                                    Date.now(),
                                );
                                setAltName('');
                            }}
                        >
                            <Check />
                        </IconButton>
                        <IconButton
                            onClick={() => {
                                setAltName('');
                            }}
                        >
                            <Close />
                        </IconButton>
                    </React.Fragment>
                ) : null}
            </div>
            <Kinds kinds={ingredientKinds} ingredient={ingredient} col={col} />
            <IconButton
                onClick={() => {
                    setDialog({ type: 'delete', id: ingredient.id });
                }}
            >
                <DeleteForever />
            </IconButton>
        </div>
    );
});

const DeleteDialog = ({ ingredient, col, setDialog, setMerge }: *) => {
    if (!ingredient) {
        return null;
    }
    return (
        <Dialog open={true} onClose={() => setDialog(null)}>
            <DialogTitle>Delete Ingredient?</DialogTitle>
            <div style={{ padding: 16, textAlign: 'center' }}>{ingredient.name}</div>
            <div style={{ display: 'flex' }}>
                <Button
                    onClick={() => {
                        setDialog(null);
                        col.delete(ingredient.id);
                    }}
                >
                    Delete
                </Button>
                <Button
                    onClick={() => {
                        setDialog(null);
                        setMerge(ingredient.id);
                    }}
                >
                    Merge
                </Button>
                <Button onClick={() => setDialog(null)}>Cancel</Button>
            </div>
        </Dialog>
    );
};

const Kinds = ({ kinds, ingredient, col }) => {
    const [current, setCurrent] = React.useState(null);

    if (!current) {
        return (
            <div>
                {Object.keys(ingredient.kinds).map((kind) => (
                    <span key={kind} style={{ padding: '0 8px' }}>
                        {kind}
                    </span>
                ))}
                {Object.keys(ingredient.kinds).length === 0 ? 'Kinds' : null}
                <IconButton
                    // edge="start"
                    // style={{ marginRight: 16 }}
                    color="inherit"
                    aria-label="menu"
                    onClick={() => {
                        setCurrent(Object.keys(ingredient.kinds));
                    }}
                >
                    <Edit />
                </IconButton>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex' }}>
            <Autocomplete
                // style={{ flex: 1 }}
                multiple
                id="tags-standard"
                options={ingredientKinds}
                // getOptionLabel={(option) => option.text}
                selectOnFocus
                clearOnBlur
                handleHomeEndKeys
                renderOption={(option) => option}
                value={current}
                onChange={(event, newValue) => {
                    setCurrent(newValue);
                }}
                renderInput={(params) => (
                    <TextField {...params} variant="outlined" label="Kinds" placeholder="Kinds" />
                )}
            />
            <IconButton
                color="inherit"
                aria-label="menu"
                onClick={async () => {
                    for (const kind of Object.keys(ingredient.kinds)) {
                        if (!current.includes(kind)) {
                            await col.clearAttribute(ingredient.id, ['kinds', kind]);
                        }
                    }
                    for (const kind of current) {
                        if (ingredient.kinds[kind] == null) {
                            await col.setAttribute(ingredient.id, ['kinds', kind], Date.now());
                        }
                    }
                    setCurrent(null);
                }}
            >
                <Check />
            </IconButton>
            <IconButton
                color="inherit"
                aria-label="menu"
                onClick={() => {
                    setCurrent(null);
                }}
            >
                <Close />
            </IconButton>
        </div>
    );
};

export default Ingredients;
