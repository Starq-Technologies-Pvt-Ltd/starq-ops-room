const ACK_LINE_RE = /^ACK::([A-Za-z0-9_-]+)::(S[1-4])::([A-Z0-9_-]+)::([0-9a-f]{4})\b/;

function splitNonEmptyLines(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Capture the tail anchor lines before sending a prompt.
 */
export function captureBaseline(text, maxLines = 10) {
  const lines = splitNonEmptyLines(text);
  return lines.slice(-maxLines);
}

/**
 * Return only lines produced AFTER the baseline anchor.
 */
export function slicePostBaseline(text, anchorLines) {
  const lines = splitNonEmptyLines(text);
  if (!anchorLines || anchorLines.length === 0) return lines;

  // Find the last index where the anchor tail matches
  const anchorLen = anchorLines.length;
  for (let i = lines.length - anchorLen; i >= 0; i--) {
    let matched = true;
    for (let j = 0; j < anchorLen; j++) {
      if (lines[i + j] !== anchorLines[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return lines.slice(i + anchorLen);
    }
  }
  // If terminal scrolled completely past the anchor, return all current lines
  return lines;
}

/**
 * Verify a standalone ACK token line in post-baseline output.
 * Prompt echo embeds the token inline after instruction text, so `^ACK::...` never matches the prompt itself.
 */
export function parseStandaloneAck(postLines, expectedToken) {
  for (const line of postLines) {
    const m = line.match(ACK_LINE_RE);
    if (!m) continue;
    const token = `ACK::${m[1]}::${m[2]}::${m[3]}::${m[4]}`;
    if (token === expectedToken) {
      return { found: true, token, line };
    }
  }
  return { found: false, token: null, line: null };
}

/**
 * Parse downstream tokens included in a consolidated Vision reply (S2/S3).
 * Excludes lines that look like our own outbound prompt instruction.
 */
export function parseDownstreamTokens(postLines, expectedMap) {
  const results = {};
  const candidateLines = postLines.filter(
    (l) => !l.includes('Startup handshake ') && !l.includes('reply on its own line')
  );
  const joined = candidateLines.join('\n');

  for (const [seatKey, expectedToken] of Object.entries(expectedMap)) {
    const idx = joined.indexOf(expectedToken);
    if (idx !== -1) {
      // Grab the line containing the token as evidence
      const line = candidateLines.find((l) => l.includes(expectedToken)) ?? expectedToken;
      results[seatKey] = { found: true, token: expectedToken, line };
    } else {
      results[seatKey] = { found: false, token: null, line: null };
    }
  }
  return results;
}

/**
 * Diagnostic check: did the prompt text actually reach the pane?
 */
export function detectPromptDelivered(postLines, promptMarker) {
  if (!promptMarker) return false;
  return postLines.some((l) => l.includes(promptMarker));
}
