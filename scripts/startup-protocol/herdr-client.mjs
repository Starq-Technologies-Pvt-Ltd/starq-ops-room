import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function machineArgs(machine) {
  return machine && machine !== 'local' ? ['--machine', machine] : [];
}

/**
 * Live Herdr CLI transport over `herdr` (local + `--machine XPS`).
 */
export class LiveHerdrTransport {
  constructor({ herdrBin = 'herdr' } = {}) {
    this.herdrBin = herdrBin;
  }

  async _run(args, timeoutMs = 30_000) {
    try {
      const { stdout, stderr } = await execFileAsync(this.herdrBin, args, {
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      });
      return { ok: true, code: 0, stdout: stdout ?? '', stderr: stderr ?? '' };
    } catch (err) {
      return {
        ok: false,
        code: typeof err.code === 'number' ? err.code : 1,
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? err.message ?? String(err),
      };
    }
  }

  async paneList(machine = 'local') {
    const args = [...machineArgs(machine), 'pane', 'list'];
    const res = await this._run(args, 20_000);
    if (!res.ok) {
      return { ok: false, panes: [], error: res.stderr || res.stdout || 'pane list failed' };
    }
    try {
      const parsed = JSON.parse(res.stdout);
      const panes = parsed?.result?.panes ?? [];
      return { ok: true, panes, error: null };
    } catch (err) {
      return { ok: false, panes: [], error: `Invalid JSON from herdr pane list: ${err.message}` };
    }
  }

  async agentRead(machine = 'local', paneId, { source = 'recent-unwrapped', lines = 120 } = {}) {
    const args = [
      ...machineArgs(machine),
      'agent',
      'read',
      paneId,
      '--source',
      source,
      '--lines',
      String(lines),
    ];
    const res = await this._run(args, 20_000);
    if (!res.ok) {
      return { ok: false, text: '', error: res.stderr || res.stdout || 'agent read failed' };
    }
    return { ok: true, text: res.stdout, error: null };
  }

  async agentPrompt(machine = 'local', paneId, text, { wait = true, timeoutMs = 60_000 } = {}) {
    const args = [...machineArgs(machine), 'agent', 'prompt', paneId, text];
    if (wait) {
      args.push('--wait', '--timeout', String(timeoutMs));
    }
    const res = await this._run(args, timeoutMs + 15_000);
    const combined = `${res.stdout}\n${res.stderr}`.toLowerCase();
    let status = res.ok ? 'ok' : 'error';
    if (combined.includes('agent_blocked')) status = 'agent_blocked';
    else if (combined.includes('agent_prompt_stalled')) status = 'agent_prompt_stalled';
    else if (combined.includes('timeout')) status = 'timeout';
    return { ok: res.ok, code: res.code, status, stdout: res.stdout, stderr: res.stderr };
  }
}

/**
 * Dependency-injectable Herdr client wrapper.
 */
export class HerdrClient {
  constructor(transport = new LiveHerdrTransport()) {
    this.transport = transport;
  }

  paneList(machine = 'local') {
    return this.transport.paneList(machine);
  }

  agentRead(machine = 'local', paneId, opts) {
    return this.transport.agentRead(machine, paneId, opts);
  }

  agentPrompt(machine = 'local', paneId, text, opts) {
    return this.transport.agentPrompt(machine, paneId, text, opts);
  }
}
