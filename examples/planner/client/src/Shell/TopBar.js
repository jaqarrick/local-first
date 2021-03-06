// @flow
import AppBar from '@material-ui/core/AppBar';
import IconButton from '@material-ui/core/IconButton';
import { makeStyles } from '@material-ui/core/styles';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import MenuIcon from '@material-ui/icons/Menu';
import Wifi from '@material-ui/icons/Wifi';
import WifiOff from '@material-ui/icons/WifiOff';
import * as React from 'react';
import type { Data } from '../auth-api';
import { Link } from 'react-router-dom';
import { showDate, today, tomorrow } from '../utils';
import type { Client, SyncStatus } from '../../../../../packages/client-bundle';
import { useSyncStatus } from '../../../../../packages/client-react';

const TopBar = ({ openMenu, client }: { client: Client<SyncStatus>, openMenu: () => void }) => {
    const styles = useStyles();
    const syncStatus = useSyncStatus(React, client);
    const todayId = showDate(today());

    return (
        <AppBar position="sticky">
            <Toolbar>
                <IconButton
                    edge="start"
                    className={styles.menuButton}
                    color="inherit"
                    aria-label="menu"
                    onClick={openMenu}
                >
                    <MenuIcon />
                </IconButton>
                <Typography variant="h6" className={styles.title}>
                    <Link style={{ color: 'inherit', textDecoration: 'none' }} to="/">
                        Planner
                    </Link>
                </Typography>
                <Typography variant="body1" className={styles.title}>
                    <Link
                        style={{ color: 'inherit', textDecoration: 'none' }}
                        to={`/day/${todayId}`}
                    >
                        Today
                    </Link>
                </Typography>
                <div style={{ flex: 1 }} />
                {/* {JSON.stringify(syncStatus)} */}
                {syncStatus.status === 'connected' ? (
                    <Wifi className={styles.connected} />
                ) : syncStatus.status === 'disconnected' ? (
                    <WifiOff className={styles.disconnected} />
                ) : null}
            </Toolbar>
        </AppBar>
    );
};

const useStyles = makeStyles((theme) => ({
    connected: {
        color: theme.palette.primary.dark,
    },
    disconnected: {
        color: theme.palette.text.disabled,
    },
    title: {
        // flexGrow: 1,
        marginRight: theme.spacing(2),
    },
    menuButton: {
        marginRight: (console.log(theme.palette), theme.spacing(2)),
    },
}));

export default TopBar;
