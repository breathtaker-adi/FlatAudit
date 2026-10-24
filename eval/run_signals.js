/**
 * Bridge script for eval/evaluate.py to evaluate listings directly using
 * the single source of truth: extension/lib/signals.js
 *
 * Reads JSON array of listings from stdin, runs analyzeListing, and outputs results as JSON.
 */

import { analyzeListing } from '../extension/lib/signals.js';

let inputData = '';
process.stdin.setEncoding('utf-8');

process.stdin.on('data', chunk => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    const listings = JSON.parse(inputData || '[]');
    const results = listings.map(l => {
      const isDup = (l.is_duplicate_photo === 'True' || l.is_duplicate_photo === true);
      const duplicateStats = { seenCount: isDup ? 4 : 1 };
      const analysis = analyzeListing({
        title: l.title || '',
        description: l.description || '',
        locality: l.locality || '',
        bhk: parseInt(l.bhk, 10) || 2,
        rent: parseInt(l.rent, 10) || 0,
        deposit: parseInt(l.deposit, 10) || 0
      }, duplicateStats);

      return {
        id: l.id,
        badgeLabel: analysis.badgeLabel,
        badgeTone: analysis.badgeTone,
        firedCount: analysis.firedCount,
        isSuspicious: (analysis.badgeLabel === 'Some signals' || analysis.badgeLabel === 'Many signals'),
        observableFacts: analysis.observableFacts,
        scamKillChainStage: analysis.scamKillChainStage
      };
    });

    process.stdout.write(JSON.stringify(results));
  } catch (err) {
    process.stderr.write(`[run_signals.js Error] ${err.message}\n`);
    process.exit(1);
  }
});
