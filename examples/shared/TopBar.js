// @flow
import AppBar from '@material-ui/core/AppBar';
import IconButton from '@material-ui/core/IconButton';
import { makeStyles } from '@material-ui/core/styles';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import MenuIcon from '@material-ui/icons/Menu';
import Wifi from '@material-ui/icons/Wifi';
import WifiOff from '@material-ui/icons/WifiOff';
import CircularProgress from '@material-ui/core/CircularProgress';
import * as React from 'react';
import { Link } from 'react-router-dom';
import type { Client, SyncStatus } from '../../packages/client-bundle';
import { useSyncStatus } from '../../packages/client-react';

type Props = {
    client: Client<*>,
    openMenu: () => void,
    title: string,
    icons?: React.Node,
};
const TopBar = ({ openMenu, client, title, icons }: Props) => {
    const styles = useStyles();
    const syncStatus = useSyncStatus(React, client);

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
                        {title}
                    </Link>
                </Typography>
                <div style={{ flex: 1 }} />
                {icons}
                <div style={{ width: 24, height: 24 }}>
                    {syncStatus.status === 'connected' ? (
                        <Wifi className={styles.connected} />
                    ) : syncStatus.status === 'disconnected' ? (
                        <WifiOff className={styles.disconnected} />
                    ) : (
                        <CircularProgress className={styles.loading} size={24} />
                    )}
                </div>
            </Toolbar>
        </AppBar>
    );
};

const useStyles = makeStyles(theme => ({
    connected: {
        color: theme.palette.primary.dark,
    },
    disconnected: {
        color: theme.palette.text.disabled,
    },
    loading: {
        color: theme.palette.primary.dark,
    },
    title: {
        // flexGrow: 1,
        marginRight: theme.spacing(2),
    },
    menuButton: {
        marginRight: theme.spacing(2),
    },
}));

export default React.memo<Props>(TopBar);
