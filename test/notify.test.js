'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getNotifyConfig,
    updateKey,
    diffUpdates,
    buildSummary,
} = require('../src/notify');

function container(overrides = {}) {
    return {
        name: 'web',
        image: 'nginx:latest',
        currentTag: 'latest',
        currentVersion: '1.25.3',
        latestVersion: '1.27.0',
        updateType: 'minor',
        updateAvailable: true,
        ...overrides,
    };
}

test('getNotifyConfig is disabled when no channel env vars are set', () => {
    const config = getNotifyConfig({});
    assert.equal(config.enabled, false);
    assert.deepEqual(config.channels, []);
});

test('getNotifyConfig enables every configured channel', () => {
    const config = getNotifyConfig({
        NTFY_URL: 'https://ntfy.sh/mytopic',
        DISCORD_WEBHOOK_URL: 'https://discord.test/hook',
    });
    assert.equal(config.enabled, true);
    assert.deepEqual(config.channels, ['ntfy', 'discord']);
});

test('updateKey is stable and includes the bump type', () => {
    assert.equal(updateKey(container()), 'web|1.27.0|minor');
});

test('diffUpdates returns all updates when nothing was notified yet', () => {
    const { fresh, nextKeys } = diffUpdates(new Set(), [
        container(),
        container({ name: 'db', updateAvailable: false, updateType: null }),
    ]);
    assert.equal(fresh.length, 1);
    assert.equal(fresh[0].name, 'web');
    assert.deepEqual([...nextKeys], ['web|1.27.0|minor']);
});

test('diffUpdates does not repeat an already-notified update', () => {
    const known = new Set(['web|1.27.0|minor']);
    const { fresh } = diffUpdates(known, [container()]);
    assert.equal(fresh.length, 0);
});

test('diffUpdates notifies again when the latest version changes', () => {
    const known = new Set(['web|1.27.0|minor']);
    const { fresh } = diffUpdates(known, [container({ latestVersion: '1.28.0', updateType: 'minor' })]);
    assert.equal(fresh.length, 1);
});

test('diffUpdates drops resolved updates from the known set', () => {
    const known = new Set(['web|1.27.0|minor']);
    const { fresh, nextKeys } = diffUpdates(known, [container({ updateAvailable: false })]);
    assert.equal(fresh.length, 0);
    assert.equal(nextKeys.size, 0);
});

test('buildSummary formats one line per update with the bump type', () => {
    const summary = buildSummary([container(), container({ name: 'db', image: 'postgres:16', currentVersion: '16.1', latestVersion: '17.0', updateType: 'major' })]);
    assert.equal(summary.title, 'Docker updates available (2)');
    assert.match(summary.body, /- web \(nginx:latest\): 1\.25\.3 -> 1\.27\.0 \[minor\]/);
    assert.match(summary.body, /- db \(postgres:16\): 16\.1 -> 17\.0 \[major\]/);
});
