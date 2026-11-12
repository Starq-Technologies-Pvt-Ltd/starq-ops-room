// Rehearsal helper: set lastSeq in a (synthetic) old-dispatcher state file to the given Room tail, keep the rest.
const fs = require('fs');
const [file, tail] = process.argv.slice(2);
const s = JSON.parse(fs.readFileSync(file, 'utf8'));
const before = s.lastSeq;
s.lastSeq = Number(tail);
fs.writeFileSync(file, JSON.stringify(s) + '\n');
console.log(`lastSeq ${before} -> ${s.lastSeq}; kept: delivered=${s.delivered.length} pending=${s.pending.length} held=${s.held.length}`);
