'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parseVersion,
    isVersionTag,
    isPlausibleVersion,
    isPinnedVersion,
    bumpType,
    selectLatestVersion,
} = require('../src/version');

test('parseVersion understands core, prefix, variant and prerelease', () => {
    assert.deepEqual(parseVersion('1.2.3'), {
        raw: '1.2.3', prefix: '', core: '1.2.3', parts: [1, 2, 3],
        suffix: null, prerelease: false, variant: null,
    });

    const v = parseVersion('v1.2.3');
    assert.equal(v.prefix, 'v');
    assert.deepEqual(v.parts, [1, 2, 3]);

    const alpine = parseVersion('1.2.3-alpine');
    assert.equal(alpine.prerelease, false);
    assert.equal(alpine.variant, 'alpine');

    const rc = parseVersion('1.2.3-rc1');
    assert.equal(rc.prerelease, true);
    assert.equal(rc.variant, null);

    assert.equal(parseVersion('latest'), null);
    assert.equal(parseVersion('stable'), null);
    assert.equal(parseVersion(undefined), null);
});

test('isVersionTag accepts versions and rejects floating tags', () => {
    assert.equal(isVersionTag('1.2.3'), true);
    assert.equal(isVersionTag('v2.0'), true);
    assert.equal(isVersionTag('1.2.3-alpine'), true);
    assert.equal(isVersionTag('latest'), false);
    assert.equal(isVersionTag('edge'), false);
});

test('bumpType classifies major/minor/patch and rejects older/equal', () => {
    assert.equal(bumpType(parseVersion('1.2.3'), parseVersion('2.0.0')), 'major');
    assert.equal(bumpType(parseVersion('1.2.3'), parseVersion('1.3.0')), 'minor');
    assert.equal(bumpType(parseVersion('1.2.3'), parseVersion('1.2.4')), 'patch');
    assert.equal(bumpType(parseVersion('1.2.3'), parseVersion('1.2.3')), null);
    assert.equal(bumpType(parseVersion('1.2.3'), parseVersion('1.2.2')), null);
});

test('isPlausibleVersion rejects build numbers and dates, accepts real versions', () => {
    assert.equal(isPlausibleVersion(parseVersion('9799770991')), false);
    assert.equal(isPlausibleVersion(parseVersion('20201215.17')), false);
    assert.equal(isPlausibleVersion(parseVersion('1.2.3')), true);
    assert.equal(isPlausibleVersion(parseVersion('2024.10.1')), true);
});

test('isPinnedVersion distinguishes exact versions from partial tags', () => {
    assert.equal(isPinnedVersion(parseVersion('7.2.4')), true);
    assert.equal(isPinnedVersion(parseVersion('1.25.3-alpine')), true);
    assert.equal(isPinnedVersion(parseVersion('16')), false);
    assert.equal(isPinnedVersion(parseVersion('7-alpine')), false);
});

test('selectLatestVersion stays within the pinned major by default', () => {
    const info = selectLatestVersion(['1.2.3', '1.2.4', '1.3.0', '2.0.0'], '1.2.3');
    assert.deepEqual(info, { latest: '1.3.0', bump: 'minor', newer: true });
});

test('selectLatestVersion can cross majors when checkMajor is enabled', () => {
    const info = selectLatestVersion(['1.2.3', '1.2.4', '2.0.0'], '1.2.3', { checkMajor: true });
    assert.deepEqual(info, { latest: '2.0.0', bump: 'major', newer: true });
});

test('selectLatestVersion only compares within the same variant', () => {
    const info = selectLatestVersion(
        ['1.2.3', '1.2.4', '1.2.4-alpine', '1.2.5-alpine', '1.2.5-beta'],
        '1.2.3-alpine'
    );
    assert.deepEqual(info, { latest: '1.2.5-alpine', bump: 'patch', newer: true });
});

test('selectLatestVersion ignores prereleases', () => {
    const info = selectLatestVersion(['1.3.0', '1.2.4-rc1'], '1.2.3');
    assert.deepEqual(info, { latest: '1.3.0', bump: 'minor', newer: true });
});

test('selectLatestVersion ignores implausible build-number tags', () => {
    const info = selectLatestVersion(['10.2.3', '10.2.4', '9799770991'], '10.2.3');
    assert.deepEqual(info, { latest: '10.2.4', bump: 'patch', newer: true });
});

test('selectLatestVersion treats partial tags as floating (digest handles them)', () => {
    const info = selectLatestVersion(['16.1', '16.4', '18.6'], '16');
    assert.deepEqual(info, { latest: '16.4', bump: null, newer: false });
});

test('selectLatestVersion reports up-to-date when nothing newer exists', () => {
    const info = selectLatestVersion(['1.2.3', '1.2.3-alpine'], '1.2.3');
    assert.equal(info.newer, false);
    assert.equal(info.latest, '1.2.3');
});

test('selectLatestVersion for floating tags only suggests a display version', () => {
    const info = selectLatestVersion(['1.2.3', '1.3.0'], 'latest');
    assert.deepEqual(info, { latest: '1.3.0', bump: null, newer: false });
});
