'use strict';

const axios = require('axios');

// ─── Configuration ────────────────────────────────────────────────────────────

// Notification channels are enabled by presence of their environment variable.
//   NOTIFY_WEBHOOK_URL   - generic JSON webhook  { title, message, updates }
//   NTFY_URL             - ntfy topic URL (optionally NTFY_TOKEN)
//   DISCORD_WEBHOOK_URL  - Discord webhook
//   SLACK_WEBHOOK_URL    - Slack incoming webhook
function getNotifyConfig(env = process.env) {
    const config = {
        webhookUrl: env.NOTIFY_WEBHOOK_URL || null,
        ntfyUrl: env.NTFY_URL || null,
        ntfyToken: env.NTFY_TOKEN || null,
        discordUrl: env.DISCORD_WEBHOOK_URL || null,
        slackUrl: env.SLACK_WEBHOOK_URL || null,
    };
    config.channels = [
        config.webhookUrl && 'webhook',
        config.ntfyUrl && 'ntfy',
        config.discordUrl && 'discord',
        config.slackUrl && 'slack',
    ].filter(Boolean);
    config.enabled = config.channels.length > 0;
    return config;
}

// ─── Diffing (pure, testable) ─────────────────────────────────────────────────

// A stable identity for a specific available update, so we only notify once.
function updateKey(update) {
    return `${update.name}|${update.latestVersion}|${update.updateType || ''}`;
}

// Compare the previously-notified keys with a fresh scan and return only the
// updates that are new (or whose latest version / bump type changed).
function diffUpdates(knownKeys, containers) {
    const nextKeys = new Set();
    const fresh = [];

    for (const container of containers) {
        if (!container.updateAvailable) continue;
        const key = updateKey(container);
        nextKeys.add(key);
        if (!knownKeys.has(key)) fresh.push(container);
    }

    return { fresh, nextKeys };
}

function buildSummary(updates) {
    const lines = updates.map((u) => {
        const current = u.currentVersion || u.currentTag || 'unknown';
        const bump = u.updateType ? ` [${u.updateType}]` : '';
        return `- ${u.name} (${u.image}): ${current} -> ${u.latestVersion}${bump}`;
    });

    return {
        title: `Docker updates available (${updates.length})`,
        body: lines.join('\n'),
    };
}

// ─── Delivery ─────────────────────────────────────────────────────────────────

async function postJson(url, payload) {
    await axios.post(url, payload, { timeout: 8000 });
}

async function postNtfy(config, title, body) {
    const headers = { Title: title, Tags: 'whale' };
    if (config.ntfyToken) headers.Authorization = `Bearer ${config.ntfyToken}`;
    await axios.post(config.ntfyUrl, body, { headers, timeout: 8000 });
}

// Sends the given updates to every configured channel. Never throws - a failing
// channel is logged and the others still run.
async function sendNotifications(updates, config = getNotifyConfig()) {
    if (!updates.length || !config.enabled) return [];

    const { title, body } = buildSummary(updates);
    const tasks = [];

    if (config.webhookUrl) {
        tasks.push(['webhook', postJson(config.webhookUrl, { title, message: body, updates })]);
    }
    if (config.discordUrl) {
        tasks.push(['discord', postJson(config.discordUrl, { content: `**${title}**\n${body}` })]);
    }
    if (config.slackUrl) {
        tasks.push(['slack', postJson(config.slackUrl, { text: `*${title}*\n${body}` })]);
    }
    if (config.ntfyUrl) {
        tasks.push(['ntfy', postNtfy(config, title, body)]);
    }

    const results = await Promise.allSettled(tasks.map(([, promise]) => promise));
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.error(
                `Notification via ${tasks[index][0]} failed:`,
                result.reason?.message || result.reason
            );
        }
    });

    return results;
}

module.exports = {
    getNotifyConfig,
    updateKey,
    diffUpdates,
    buildSummary,
    sendNotifications,
};
