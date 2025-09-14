#!/usr/bin/env node
/*
  Analyse des logs d'actions Twitter (24h)
  Usage: node scripts/analyze-raid-actions.js <path_to_json> <now_iso>
*/
const fs = require('fs');
const path = require('path');

function getActionKey(type) {
  if (!type) return 'unknown';
  const t = String(type).toLowerCase();
  switch (t) {
    case 'retweet': return 'retweet';
    case 'unretweet': return 'unretweet';
    case 'like': return 'like';
    case 'unlike': return 'unlike';
    case 'reply': return 'reply';
    case 'tweet': return 'tweet';
    case 'follow': return 'follow';
    case 'unfollow': return 'unfollow';
    case 'mute': return 'mute';
    case 'unmute': return 'unmute';
    default: return t;
  }
}

const LIMITS = {
  // 15 min windows
  retweet:  { window: '15min', limit: 5 },
  unretweet:{ window: '15min', limit: 5 },
  follow:   { window: '15min', limit: 5 },
  unfollow: { window: '15min', limit: 5 },
  mute:     { window: '15min', limit: 5 },
  unmute:   { window: '15min', limit: 5 },
  // 24h windows
  like:     { window: '24h',   limit: 200 },
  unlike:   { window: '24h',   limit: 100 },
  reply:    { window: '24h',   limit: 100 },
  tweet:    { window: '24h',   limit: 100 },
};

function bucket15(date) {
  const u = new Date(date);
  const y = u.getUTCFullYear();
  const m = u.getUTCMonth();
  const d = u.getUTCDate();
  const h = u.getUTCHours();
  const mm = Math.floor(u.getUTCMinutes() / 15) * 15;
  return Date.UTC(y, m, d, h, mm, 0);
}

function fmtUtc(ts) {
  return new Date(ts).toISOString().replace('T', ' ').replace('Z', ' UTC');
}

function main() {
  const filePath = process.argv[2];
  const nowIso = process.argv[3];
  if (!filePath) {
    console.error('Usage: node scripts/analyze-raid-actions.js <path_to_json> <now_iso>');
    process.exit(1);
  }
  const now = nowIso ? new Date(nowIso) : new Date();
  const cutoff = new Date(now.getTime() - 24 * 3600 * 1000);

  const raw = fs.readFileSync(filePath, 'utf8');
  const json = JSON.parse(raw);
  const rows = (json.data || []).filter(r => {
    const ts = new Date(r.Timestamp);
    return ts >= cutoff;
  });

  // Group by account
  const byAccount = new Map();
  for (const r of rows) {
    const acct = r['Nom du compte'] || r.account || 'unknown';
    const list = byAccount.get(acct) || [];
    list.push(r);
    byAccount.set(acct, list);
  }

  const reportLines = [];

  for (const [acct, actions] of byAccount.entries()) {
    // counts by type (24h totals)
    const countByType = new Map();
    for (const a of actions) {
      const k = getActionKey(a["Type d'action"]);
      countByType.set(k, (countByType.get(k) || 0) + 1);
    }

    // 15-min buckets for relevant types
    const peaks = [];
    const violations = [];

    const groupByType = new Map();
    for (const a of actions) {
      const k = getActionKey(a["Type d'action"]);
      const arr = groupByType.get(k) || [];
      arr.push(a);
      groupByType.set(k, arr);
    }

    // Check 24h limits
    for (const [type, total] of countByType.entries()) {
      const lim = LIMITS[type];
      if (lim && lim.window === '24h') {
        const status = total > lim.limit ? 'VIOLATION' : 'OK';
        if (status === 'VIOLATION') {
          violations.push(`${type}: ${total}/${lim.limit} (24h)`);
        }
      }
    }

    // Check 15-min limits
    for (const [type, list] of groupByType.entries()) {
      const lim = LIMITS[type];
      if (lim && lim.window === '15min') {
        const buckets = new Map();
        for (const a of list) {
          const b = bucket15(a.Timestamp);
          buckets.set(b, (buckets.get(b) || 0) + 1);
        }
        // peak and violations
        let peakCount = 0, peakStart = null;
        for (const [start, cnt] of buckets.entries()) {
          if (cnt > peakCount) { peakCount = cnt; peakStart = start; }
          if (cnt > lim.limit) {
            violations.push(`${type}: ${cnt}/${lim.limit} (15min) at ${fmtUtc(start)}`);
          }
        }
        if (peakCount > 0) {
          peaks.push(`${type}: peak ${peakCount}/${lim.limit} (15min) at ${fmtUtc(peakStart)}`);
        }
      }
    }

    // Build account report
    reportLines.push(`Account: ${acct}`);
    reportLines.push(`  Total actions (24h): ${actions.length}`);

    const typeSummary = Array.from(countByType.entries())
      .sort((a,b)=> a[0].localeCompare(b[0]))
      .map(([t,c]) => `${t}=${c}`)
      .join(', ');
    reportLines.push(`  By type: ${typeSummary || 'n/a'}`);

    if (peaks.length) {
      reportLines.push('  Peaks (15min):');
      for (const p of peaks.sort()) reportLines.push(`    - ${p}`);
    }
    if (violations.length) {
      reportLines.push('  POSSIBLE 429 Violations:');
      for (const v of violations.sort()) reportLines.push(`    - ${v}`);
    }
    reportLines.push('');
  }

  // Global summary
  const totalActions = rows.length;
  reportLines.unshift(`Global actions in last 24h: ${totalActions}`);

  console.log(reportLines.join('\n'));
}

main();
