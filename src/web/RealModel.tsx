import { useState } from "react";
import { DEFAULT_MODEL, MODELS } from "../core/llmAgent";

export interface RealConfig {
  apiKey: string;
  model: string;
}

const KEY = "erp-agent-lab.apiKey";
const MODEL = "erp-agent-lab.model";

/** The key lives only in this browser: sessionStorage by default, localStorage if the visitor asks to remember it. */
export function loadConfig(): { config: RealConfig | null; remembered: boolean } {
  try {
    const remembered = localStorage.getItem(KEY);
    const apiKey = remembered ?? sessionStorage.getItem(KEY);
    const model = localStorage.getItem(MODEL) ?? DEFAULT_MODEL;
    return { config: apiKey ? { apiKey, model } : null, remembered: !!remembered };
  } catch {
    return { config: null, remembered: false };
  }
}

export function saveConfig(c: RealConfig, remember: boolean): void {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
    (remember ? localStorage : sessionStorage).setItem(KEY, c.apiKey);
    localStorage.setItem(MODEL, c.model);
  } catch { /* storage blocked: the key stays in memory for this page only */ }
}

export function clearConfig(): void {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch { /* nothing to clear */ }
}

export function RealModelDialog({ current, remembered, onSave, onRemove, onClose }: {
  current: RealConfig | null;
  remembered: boolean;
  onSave: (c: RealConfig, remember: boolean) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState(current?.apiKey ?? "");
  const [model, setModel] = useState(current?.model ?? DEFAULT_MODEL);
  const [remember, setRemember] = useState(remembered);
  const valid = key.trim().startsWith("sk-ant-") && key.trim().length > 20;
  return (
    <div className="dialog-back" role="dialog" aria-modal="true" aria-label="Use a real model">
      <form className="dialog" onSubmit={(e) => { e.preventDefault(); if (valid) onSave({ apiKey: key.trim(), model }, remember); }}>
        <h2>Use a real model</h2>
        <p>
          Optional. A Claude model decides which tools to call, instead of the script. Requests go <strong>straight from your browser to the Anthropic API</strong>,
          using <strong>your own API key</strong>, so they are billed to your account. This site has no server and never sees the key.
        </p>
        <label>
          Anthropic API key
          <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-..." />
        </label>
        <label>
          Model
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember the key on this device (otherwise it is forgotten when you close the tab)
        </label>
        <p className="note">
          Use a key with a low spending limit, and only on a device you trust: anyone with access to this browser profile could read a remembered key.
          The model can only read the fictional data and propose reminders; sending still needs your click on Approve.
        </p>
        <div className="dialog-actions">
          {current && <button type="button" onClick={onRemove}>Remove key</button>}
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!valid}>Save and use</button>
        </div>
      </form>
    </div>
  );
}
