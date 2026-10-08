import type { ReactNode } from "react";
import {
  DENSITIES,
  THEMES,
  resetSettings,
  updateSettings,
  useSetting,
  type Settings,
} from "../settings/settings";
import { useSelector } from "../store/react";
import { Dialog } from "./Dialog";

type BooleanSetting = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

function Toggle({ name, children }: { name: BooleanSetting; children: ReactNode }) {
  const value = useSetting(name);
  return (
    <label className="setting setting--toggle">
      <input type="checkbox" checked={value} onChange={(e) => updateSettings({ [name]: e.target.checked })} />
      <span>{children}</span>
    </label>
  );
}

function SyncInfo() {
  const status = useSelector((s) => s.syncStatus);
  const rooms = useSelector((s) => s.roomIds.length);
  const events = useSelector((s) =>
    Object.values(s.timelines).reduce((sum, tl) => sum + tl.order.length + tl.pending.length, 0),
  );
  return (
    <dl className="settings__facts">
      <dt>Sync</dt>
      <dd>{status}</dd>
      <dt>Rooms</dt>
      <dd>{rooms}</dd>
      <dt>Loaded events</dt>
      <dd>{events}</dd>
    </dl>
  );
}

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const theme = useSetting("theme");
  const density = useSetting("density");

  return (
    <Dialog title="Settings" onClose={onClose}>
      <section className="settings__section">
        <h3>Appearance</h3>
        <fieldset className="setting">
          <legend>Theme</legend>
          {THEMES.map((value) => (
            <label key={value} className="setting__choice">
              <input
                type="radio"
                name="theme"
                checked={theme === value}
                onChange={() => updateSettings({ theme: value })}
              />
              {value[0]!.toUpperCase() + value.slice(1)}
            </label>
          ))}
        </fieldset>
        <fieldset className="setting">
          <legend>Density</legend>
          {DENSITIES.map((value) => (
            <label key={value} className="setting__choice">
              <input
                type="radio"
                name="density"
                checked={density === value}
                onChange={() => updateSettings({ density: value })}
              />
              {value[0]!.toUpperCase() + value.slice(1)}
            </label>
          ))}
        </fieldset>
        <Toggle name="clock24h">Use 24-hour clock</Toggle>
        <Toggle name="reduceMotion">Reduce motion</Toggle>
      </section>
      <section className="settings__section">
        <h3>Messages</h3>
        <Toggle name="enterToSend">Send with Enter (Shift+Enter for a new line)</Toggle>
        <Toggle name="showImages">Show images automatically</Toggle>
        <Toggle name="showTyping">Show typing notifications</Toggle>
      </section>
      <section className="settings__section">
        <h3>Privacy</h3>
        <Toggle name="sendReadReceipts">Send read receipts</Toggle>
      </section>
      <section className="settings__section">
        <h3>About</h3>
        <SyncInfo />
        <button type="button" className="button" onClick={resetSettings}>
          Reset all settings
        </button>
      </section>
    </Dialog>
  );
}
