import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, Eye, EyeOff, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useI18n } from "../../i18n";
import s from "../../styles";
import {
  APP_SETTINGS_CHANGED_EVENT,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type IdeEntry,
} from "./types";

/** 为自定义 IDE 生成稳定 id;builtin 用 slug("code"/"cursor"/...)作 id 不在此函数生成。 */
function genCustomIdeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `custom-${crypto.randomUUID()}`;
  }
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function IdePanel() {
  const { t } = useI18n();

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [originalSettings, setOriginalSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftCommand, setDraftCommand] = useState("");
  const skipNextChangeEventRef = useRef(false);

  const reload = useCallback(() => {
    return invoke<AppSettings>("load_app_settings")
      .then((loaded) => {
        setSettings(loaded);
        setOriginalSettings(loaded);
      })
      .catch((e) => {
        setError(String(e));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    void reload();
    const handler = () => {
      if (skipNextChangeEventRef.current) {
        skipNextChangeEventRef.current = false;
        return;
      }
      void reload();
    };
    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, handler);
  }, [reload]);

  const isDirty =
    JSON.stringify(settings.ide_entries) !== JSON.stringify(originalSettings.ide_entries) ||
    settings.last_used_ide_id !== originalSettings.last_used_ide_id;

  function patchEntry(id: string, patch: Partial<IdeEntry>) {
    setSettings((prev) => ({
      ...prev,
      ide_entries: prev.ide_entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  }

  function removeEntry(id: string) {
    setSettings((prev) => ({
      ...prev,
      ide_entries: prev.ide_entries.filter((e) => e.id !== id),
      last_used_ide_id: prev.last_used_ide_id === id ? null : prev.last_used_ide_id,
    }));
  }

  async function handleDetect() {
    setDetecting(true);
    setError(null);
    try {
      const next = await invoke<AppSettings>("detect_ide_entries");
      setSettings(next);
      setOriginalSettings(next);
      skipNextChangeEventRef.current = true;
      window.dispatchEvent(new Event(APP_SETTINGS_CHANGED_EVENT));
    } catch (e) {
      setError(t("appSettings.ide.failedDetect", { error: String(e) }));
    } finally {
      setDetecting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await invoke<AppSettings>("save_ide_entries", {
        entries: settings.ide_entries,
        lastUsedId: settings.last_used_ide_id,
      });
      setSettings(next);
      setOriginalSettings(next);
      skipNextChangeEventRef.current = true;
      window.dispatchEvent(new Event(APP_SETTINGS_CHANGED_EVENT));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleAddDraft() {
    const label = draftLabel.trim();
    const command = draftCommand.trim();
    if (!label || !command) return;
    const newEntry: IdeEntry = {
      id: genCustomIdeId(),
      label,
      command,
      builtin: false,
      hidden: false,
    };
    setSettings((prev) => ({
      ...prev,
      ide_entries: [...prev.ide_entries, newEntry],
    }));
    setDraftLabel("");
    setDraftCommand("");
    setAdding(false);
  }

  return (
    <div style={s.settingsBodyColumn}>
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</div>}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          {t("appSettings.ide.title")}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {loading && (
            <span style={{ color: "var(--text-hint)", fontSize: 12 }}>{t("common.loading")}</span>
          )}
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              background: "none",
              border: "1px solid var(--border-medium)",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--text-secondary)",
              cursor: detecting ? "default" : "pointer",
              opacity: detecting ? 0.6 : 1,
            }}
            onClick={() => void handleDetect()}
            disabled={detecting}
          >
            <RefreshCw size={12} className={detecting ? "spin" : undefined} />
            {detecting ? t("appSettings.detecting") : t("appSettings.ide.redetect")}
          </button>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--text-hint)", flexShrink: 0 }}>
        {t("appSettings.ide.commandHint")}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingRight: 4,
        }}
      >
        {settings.ide_entries.length === 0 && !loading && (
          <div style={{ fontSize: 12, color: "var(--text-hint)", padding: "10px 0" }}>
            {t("appSettings.ide.empty")}
          </div>
        )}
        {settings.ide_entries.map((entry) => (
          <IdeRow
            key={entry.id}
            entry={entry}
            disabled={loading}
            onPatch={(patch) => patchEntry(entry.id, patch)}
            onRemove={() => removeEntry(entry.id)}
          />
        ))}
      </div>

      {adding ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 10,
            border: "1px dashed var(--border-medium)",
            borderRadius: 7,
            flexShrink: 0,
          }}
        >
          <input
            style={addInputStyle}
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            placeholder={t("appSettings.ide.placeholderLabel")}
            spellCheck={false}
            autoFocus
          />
          <input
            style={addInputStyle}
            value={draftCommand}
            onChange={(e) => setDraftCommand(e.target.value)}
            placeholder={t("appSettings.ide.placeholderCommand")}
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddDraft();
              if (e.key === "Escape") {
                setAdding(false);
                setDraftLabel("");
                setDraftCommand("");
              }
            }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              style={addBtnSecondaryStyle}
              onClick={() => {
                setAdding(false);
                setDraftLabel("");
                setDraftCommand("");
              }}
            >
              {t("common.cancel")}
            </button>
            <button
              style={{
                ...addBtnSecondaryStyle,
                color: "var(--text-primary)",
                borderColor: "var(--accent)",
                opacity: !draftLabel.trim() || !draftCommand.trim() ? 0.5 : 1,
              }}
              disabled={!draftLabel.trim() || !draftCommand.trim()}
              onClick={handleAddDraft}
            >
              {t("common.add")}
            </button>
          </div>
        </div>
      ) : (
        <button
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 12px",
            background: "none",
            border: "1px dashed var(--border-medium)",
            borderRadius: 6,
            fontSize: 12,
            color: "var(--text-secondary)",
            cursor: "pointer",
            alignSelf: "flex-start",
            flexShrink: 0,
          }}
          onClick={() => setAdding(true)}
        >
          <Plus size={12} />
          {t("appSettings.ide.addIde")}
        </button>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 10,
          flexShrink: 0,
        }}
      >
        {saved && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: "var(--success)",
            }}
          >
            <Check size={12} /> {t("common.saved")}
          </span>
        )}
        <button
          style={{
            ...s.modalSaveBtn,
            padding: "5px 14px",
            fontSize: 12,
            cursor: saving || !isDirty ? "default" : "pointer",
            opacity: saving || !isDirty ? 0.5 : 1,
          }}
          onClick={() => void handleSave()}
          disabled={loading || saving || !isDirty}
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </div>
  );
}

const addInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 9px",
  background: "var(--bg-input)",
  border: "1px solid var(--border-medium)",
  borderRadius: 6,
  color: "var(--text-primary)",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  outline: "none",
  boxSizing: "border-box",
};

const addBtnSecondaryStyle: React.CSSProperties = {
  padding: "4px 10px",
  background: "none",
  border: "1px solid var(--border-medium)",
  borderRadius: 5,
  fontSize: 11.5,
  color: "var(--text-secondary)",
  cursor: "pointer",
};

function IdeRow({
  entry,
  disabled,
  onPatch,
  onRemove,
}: {
  entry: IdeEntry;
  disabled: boolean;
  onPatch: (patch: Partial<IdeEntry>) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const badge = entry.builtin
    ? t("appSettings.ide.detected")
    : t("appSettings.ide.custom");
  const badgeColor = entry.builtin ? "var(--accent)" : "var(--text-hint)";
  const badgeBg = entry.builtin ? "var(--accent-bg-subtle, rgba(99,154,255,0.12))" : "transparent";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        padding: 10,
        background: "var(--bg-input)",
        border: "1px solid var(--border-medium)",
        borderRadius: 7,
        opacity: entry.hidden ? 0.55 : 1,
      }}
      data-ide-row={entry.id}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          style={{
            ...addInputStyle,
            fontFamily: "var(--font-sans)",
            flex: 1,
          }}
          value={entry.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder={t("appSettings.ide.placeholderLabel")}
          disabled={disabled}
          spellCheck={false}
        />
        <span
          style={{
            fontSize: 10,
            color: badgeColor,
            background: badgeBg,
            padding: "2px 6px",
            borderRadius: 4,
            border: entry.builtin ? "none" : "1px solid var(--border-medium)",
            textTransform: "uppercase",
            letterSpacing: 0.3,
            whiteSpace: "nowrap",
          }}
        >
          {badge}
        </span>
        <button
          title={entry.hidden ? t("appSettings.ide.show") : t("appSettings.ide.hide")}
          onClick={() => onPatch({ hidden: !entry.hidden })}
          disabled={disabled}
          style={{
            ...addBtnSecondaryStyle,
            padding: "4px 6px",
          }}
        >
          {entry.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
        </button>
        {!entry.builtin && (
          <button
            title={t("appSettings.ide.deleteCustom")}
            onClick={onRemove}
            disabled={disabled}
            style={{
              ...addBtnSecondaryStyle,
              padding: "4px 6px",
              color: "var(--danger)",
              borderColor: "var(--border-medium)",
            }}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
      <input
        style={addInputStyle}
        value={entry.command}
        onChange={(e) => onPatch({ command: e.target.value })}
        placeholder={t("appSettings.ide.placeholderCommand")}
        disabled={disabled}
        spellCheck={false}
      />
    </div>
  );
}
