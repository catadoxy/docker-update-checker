import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const THEME_KEY = 'docker-update-checker-theme';

const THEMES = [
    { id: 'cyberpunk', label: 'Cyberpunk' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
];

function readStoredTheme() {
    try {
        return localStorage.getItem(THEME_KEY) || 'cyberpunk';
    } catch {
        return 'cyberpunk';
    }
}

function App() {
    const [containers, setContainers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [endpoint] = useState(window.location.origin);
    const [checkInterval, setCheckInterval] = useState(null);
    const [configLoaded, setConfigLoaded] = useState(false);
    const [theme, setTheme] = useState(readStoredTheme);

    // Apply + persist the selected theme on <html data-theme="...">.
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch {
            /* storage unavailable - ignore */
        }
    }, [theme]);

    const fetchContainers = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${endpoint}/api/containers`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            setContainers(data.containers || []);
        } catch (err) {
            console.error('Fetch error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const init = async () => {
            try {
                const response = await fetch(`${endpoint}/api/config`);
                if (response.ok) {
                    const data = await response.json();
                    setCheckInterval(data.checkInterval);
                } else {
                    setCheckInterval(300);
                }
            } catch (err) {
                console.error('Failed to fetch config:', err);
                setCheckInterval(300);
            }
            setConfigLoaded(true);
            await fetchContainers();
        };

        init();
    }, [endpoint]);

    useEffect(() => {
        if (!configLoaded || checkInterval === null) return;
        if (checkInterval === 0) return; // auto-refresh disabled

        const interval = setInterval(fetchContainers, checkInterval * 1000);
        return () => clearInterval(interval);
    }, [checkInterval, configLoaded, endpoint]);

    const stats = {
        total: containers.length,
        updates: containers.filter((c) => c.updateAvailable).length,
        current: containers.filter((c) => !c.updateAvailable).length,
    };

    const updates = containers.filter((c) => c.updateAvailable);
    const upToDate = containers.filter((c) => !c.updateAvailable);

    const renderCard = (container, idx, hasUpdate) => (
        <div
            key={container.id}
            className={`container-card${hasUpdate ? ' has-update' : ''}`}
            style={{ animationDelay: `${idx * 0.1}s` }}
        >
            <div className="container-header">
                <div className="container-name">{container.name}</div>
                <div className={`status-badge ${hasUpdate ? 'status-update' : 'status-running'}`}>
                    {hasUpdate ? '⚠ Update' : '✓ Current'}
                </div>
            </div>

            <div className="container-info">
                <div className="info-row">
                    <div className="info-label">Image</div>
                    <div className="info-value">{container.image}</div>
                </div>
                <div className="info-row">
                    <div className="info-label">Current</div>
                    <div className="info-value">
                        <span className="version-badge">
                            {container.currentVersion || container.currentTag || 'unknown'}
                        </span>
                    </div>
                </div>
                {hasUpdate && (
                    <div className="info-row">
                        <div className="info-label">Latest</div>
                        <div className="info-value">
                            <span className="version-badge version-badge-latest">
                                {container.latestVersion || 'unknown'}
                            </span>
                        </div>
                    </div>
                )}
                {hasUpdate && container.updateType && (
                    <div className="info-row">
                        <div className="info-label">Type</div>
                        <div className="info-value">
                            <span className={`version-badge bump-${container.updateType}`}>
                                {String(container.updateType).toUpperCase()}
                            </span>
                        </div>
                    </div>
                )}
                <div className="info-row">
                    <div className="info-label">Status</div>
                    <div className="info-value">{container.status}</div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="app-container">
            <div className="header">
                <h1 className="title">DOCKER IMAGE MONITOR</h1>
                <p className="subtitle">Container Update Surveillance System</p>
                <div className="docker-endpoint">
                    {checkInterval === null ? (
                        'Loading config...'
                    ) : checkInterval === 0 ? (
                        <span className="endpoint-status disabled">
                            Auto-refresh: <strong>DISABLED</strong> (manual only)
                        </span>
                    ) : (
                        `Auto-refresh: every ${checkInterval} seconds (${(checkInterval / 60).toFixed(1)} min)`
                    )}
                </div>
            </div>

            <div className="controls">
                <button className="btn btn-refresh" onClick={fetchContainers} disabled={loading}>
                    {loading ? 'Scanning...' : 'Refresh Status'}
                </button>
                <div className="theme-switcher" role="group" aria-label="Theme">
                    {THEMES.map((t) => (
                        <button
                            key={t.id}
                            className={`theme-btn${theme === t.id ? ' active' : ''}`}
                            onClick={() => setTheme(t.id)}
                            aria-pressed={theme === t.id}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {!loading && !error && containers.length > 0 && (
                <div className="status-bar">
                    <div className="stat stat-total">
                        <span className="stat-value">{stats.total}</span>
                        <span className="stat-label">Total Containers</span>
                    </div>
                    <div className="stat stat-updates">
                        <span className="stat-value">{stats.updates}</span>
                        <span className="stat-label">Updates Available</span>
                    </div>
                    <div className="stat stat-current">
                        <span className="stat-value">{stats.current}</span>
                        <span className="stat-label">Up to Date</span>
                    </div>
                </div>
            )}

            {loading && <div className="loading">Scanning Docker containers</div>}

            {error && (
                <div className="error">
                    <div className="error-title">⚠ CONNECTION ERROR</div>
                    <div>{error}</div>
                    <div className="error-hint">
                        Make sure the backend server is running on {endpoint}
                    </div>
                </div>
            )}

            {!loading && !error && containers.length === 0 && (
                <div className="empty-state">
                    <div className="empty-state-icon">🐳</div>
                    <div>No containers detected</div>
                    <div className="empty-state-hint">
                        Start some Docker containers or check your Docker connection
                    </div>
                </div>
            )}

            {!loading && !error && updates.length > 0 && (
                <>
                    <div className="section-title section-title-updates">
                        ⚠ Updates Available ({updates.length})
                    </div>
                    <div className="container-grid">
                        {updates
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((c, idx) => renderCard(c, idx, true))}
                    </div>
                </>
            )}

            {!loading && !error && upToDate.length > 0 && (
                <>
                    <div className="section-title section-title-current">
                        ✓ Up to Date ({upToDate.length})
                    </div>
                    <div className="container-grid">
                        {upToDate
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((c, idx) => renderCard(c, idx, false))}
                    </div>
                </>
            )}
        </div>
    );
}

createRoot(document.getElementById('root')).render(<App />);
