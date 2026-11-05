import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const THEME_KEY = 'docker-update-checker-theme';

const THEMES = [
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
    { id: 'cyberpunk', label: 'Cyberpunk' },
];

const THEME_COLORS = { dark: '#0b0f19', light: '#f5f7fa', cyberpunk: '#060911' };

const BUMP_LABEL = { major: 'Major', minor: 'Minor', patch: 'Patch', digest: 'Digest' };

function readStoredTheme() {
    try {
        return localStorage.getItem(THEME_KEY) || 'dark';
    } catch {
        return 'dark';
    }
}

function formatTime(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(date);
}

function ThemeSwitcher({ theme, onChange }) {
    return (
        <div className="segmented" role="group" aria-label="Color theme">
            {THEMES.map((t) => (
                <button
                    key={t.id}
                    type="button"
                    className="seg-btn"
                    aria-pressed={theme === t.id}
                    onClick={() => onChange(t.id)}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
}

function StatusPill({ update }) {
    return (
        <span className={`pill ${update ? 'pill-update' : 'pill-ok'}`}>
            <span className="dot" aria-hidden="true" />
            {update ? 'Update' : 'Current'}
        </span>
    );
}

function ContainerCard({ container, hasUpdate }) {
    const current = container.currentVersion || container.currentTag || 'unknown';
    const bump = container.updateType ? BUMP_LABEL[container.updateType] || container.updateType : null;

    return (
        <article className={`card${hasUpdate ? ' card-update' : ''}`}>
            <div className="card-head">
                <h3 className="card-name" title={container.name}>
                    {container.name}
                </h3>
                <StatusPill update={hasUpdate} />
            </div>

            <dl className="meta">
                <div className="row">
                    <dt>Image</dt>
                    <dd className="mono" title={container.image}>
                        {container.image}
                    </dd>
                </div>
                <div className="row">
                    <dt>Version</dt>
                    <dd>
                        <span className="versions">
                            <span className="ver mono">{current}</span>
                            {hasUpdate && (
                                <>
                                    <span className="arrow" aria-hidden="true">
                                        →
                                    </span>
                                    <span className="ver ver-new mono">
                                        {container.latestVersion || 'unknown'}
                                    </span>
                                    {bump && <span className="chip">{bump}</span>}
                                </>
                            )}
                        </span>
                    </dd>
                </div>
                <div className="row">
                    <dt>Status</dt>
                    <dd>{container.status}</dd>
                </div>
            </dl>
        </article>
    );
}

const MARK = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
            d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7L12 2.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
        />
        <path
            d="M3.5 7 12 11.5 20.5 7M12 11.5V21.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
        />
    </svg>
);

function App() {
    const [containers, setContainers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [hasData, setHasData] = useState(false);
    const [error, setError] = useState(null);
    const [endpoint] = useState(window.location.origin);
    const [checkInterval, setCheckInterval] = useState(null);
    const [configLoaded, setConfigLoaded] = useState(false);
    const [theme, setTheme] = useState(readStoredTheme);
    const [query, setQuery] = useState('');
    const [lastUpdated, setLastUpdated] = useState(null);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', THEME_COLORS[theme] || THEME_COLORS.dark);
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch {
            /* storage unavailable - ignore */
        }
    }, [theme]);

    // Read the result of the last scan. This never contacts a registry.
    const loadCached = async () => {
        try {
            const response = await fetch(`${endpoint}/api/containers`);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            setContainers(data.containers || []);
            setHasData(Boolean(data.hasData));
            if (data.timestamp) setLastUpdated(data.timestamp);
            setError(null);
        } catch (err) {
            console.error('Fetch error:', err);
            setError(err.message);
        }
    };

    // Explicit scan, only triggered by the Refresh button.
    const refresh = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${endpoint}/api/scan`, { method: 'POST' });
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            setContainers(data.containers || []);
            setHasData(true);
            setLastUpdated(data.timestamp || new Date().toISOString());
        } catch (err) {
            console.error('Scan error:', err);
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
            await loadCached();
            setInitialLoading(false);
        };

        init();
    }, [endpoint]);

    // The server scans on CHECK_INTERVAL. The page only re-reads the cached
    // result, so leaving a tab open never causes extra registry requests.
    // Until the first result arrives, poll a little faster to pick up the
    // startup scan promptly.
    useEffect(() => {
        if (!configLoaded || !checkInterval || checkInterval <= 0) return;
        const pollMs = hasData ? Math.min(checkInterval * 1000, 30000) : 5000;
        const interval = setInterval(loadCached, pollMs);
        return () => clearInterval(interval);
    }, [checkInterval, configLoaded, endpoint, hasData]);

    const q = query.trim().toLowerCase();
    const matches = (c) =>
        !q || c.name.toLowerCase().includes(q) || (c.image || '').toLowerCase().includes(q);
    const byName = (a, b) => a.name.localeCompare(b.name);

    const visible = containers.filter(matches);
    const updates = visible.filter((c) => c.updateAvailable).sort(byName);
    const upToDate = visible.filter((c) => !c.updateAvailable).sort(byName);

    const totalUpdates = containers.filter((c) => c.updateAvailable).length;

    const refreshLabel =
        checkInterval === null
            ? 'Loading…'
            : checkInterval === 0
              ? 'Manual refresh only'
              : `Checks every ${checkInterval}s`;

    return (
        <div className="shell">
            <a className="skip" href="#main">
                Skip to content
            </a>

            <header className="appbar">
                <div className="appbar-inner">
                    <div className="brand">
                        <span className="mark" aria-hidden="true">
                            {MARK}
                        </span>
                        <span className="brand-text">
                            <h1 className="brand-name">Docker Update Checker</h1>
                            <span className="brand-sub">Container update monitor</span>
                        </span>
                    </div>

                    <div className="appbar-right">
                        <span className="scan-meta">
                            {refreshLabel}
                            {lastUpdated ? ` · last scan ${formatTime(lastUpdated)}` : ''}
                        </span>
                        <ThemeSwitcher theme={theme} onChange={setTheme} />
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={refresh}
                            disabled={loading}
                        >
                            {loading ? 'Scanning…' : 'Refresh'}
                        </button>
                    </div>
                </div>
            </header>

            <main className="main" id="main">
                {(hasData || loading) && (
                    <section className="stats" aria-label="Summary">
                        <div className="stat">
                            <span className="stat-num">{containers.length}</span>
                            <span className="stat-label">Containers</span>
                        </div>
                        <div className={`stat${totalUpdates > 0 ? ' stat-updates' : ''}`}>
                            <span className="stat-num">{totalUpdates}</span>
                            <span className="stat-label">Updates available</span>
                        </div>
                        <div className="stat">
                            <span className="stat-num">{containers.length - totalUpdates}</span>
                            <span className="stat-label">Up to date</span>
                        </div>
                    </section>
                )}

                {containers.length > 0 && (
                    <div className="toolbar">
                        <label className="search">
                            <svg
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill="none"
                                aria-hidden="true"
                            >
                                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                                <path
                                    d="m20 20-3.5-3.5"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                />
                            </svg>
                            <input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Filter by name or image…"
                                aria-label="Filter containers"
                                autoComplete="off"
                                spellCheck={false}
                            />
                        </label>
                        {q ? (
                            <span className="toolbar-count">
                                {visible.length} of {containers.length}
                            </span>
                        ) : null}
                    </div>
                )}

                {loading && containers.length === 0 && (
                    <div className="state" aria-live="polite">
                        <span className="spinner" aria-hidden="true" />
                        <p className="state-text">Scanning containers…</p>
                    </div>
                )}

                {error && (
                    <div className="state state-error" role="alert">
                        <p className="state-title">Can’t reach the Docker daemon</p>
                        <p className="state-text">{error}</p>
                        <p className="state-hint">
                            Check that Docker is running and that /var/run/docker.sock is mounted,
                            then refresh.
                        </p>
                    </div>
                )}

                {!loading && !error && !initialLoading && !hasData && (
                    <div className="state">
                        <span className="state-emoji" aria-hidden="true">
                            🐳
                        </span>
                        <p className="state-title">No scan yet</p>
                        <p className="state-text">
                            Press Refresh to check your containers for updates.
                        </p>
                    </div>
                )}

                {!loading && !error && hasData && containers.length === 0 && (
                    <div className="state">
                        <span className="state-emoji" aria-hidden="true">
                            🐳
                        </span>
                        <p className="state-title">No containers found</p>
                        <p className="state-text">
                            Start some containers, or confirm this app can reach the Docker socket.
                        </p>
                    </div>
                )}

                {!error && updates.length > 0 && (
                    <section className="section section-updates">
                        <div className="section-head">
                            <h2 className="section-title">Updates Available</h2>
                            <span className="section-count">{updates.length}</span>
                        </div>
                        <div className="grid">
                            {updates.map((c) => (
                                <ContainerCard key={c.id} container={c} hasUpdate />
                            ))}
                        </div>
                    </section>
                )}

                {!error && upToDate.length > 0 && (
                    <section className="section">
                        <div className="section-head">
                            <h2 className="section-title">Up to Date</h2>
                            <span className="section-count">{upToDate.length}</span>
                        </div>
                        <div className="grid">
                            {upToDate.map((c) => (
                                <ContainerCard key={c.id} container={c} hasUpdate={false} />
                            ))}
                        </div>
                    </section>
                )}

                {!error && containers.length > 0 && visible.length === 0 && (
                    <div className="state">
                        <p className="state-text">No containers match “{query}”.</p>
                    </div>
                )}
            </main>
        </div>
    );
}

createRoot(document.getElementById('root')).render(<App />);
