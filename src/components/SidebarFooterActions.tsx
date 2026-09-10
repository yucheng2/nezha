import { useEffect, useState } from "react";
import { Settings, Moon, Sun } from "lucide-react";
import type {
  ThemeMode,
  ThemeVariant,
  TerminalFontSize,
  TerminalScrollback,
  TaskDisplayWindow,
  FontFamily,
} from "../types";
import { AppSettingsDialog } from "./AppSettingsDialog";
import {
  OPEN_APP_SETTINGS_EVENT,
  OPEN_APP_SETTINGS_WITH_NAV_EVENT,
  type OpenAppSettingsDetail,
  type OpenAppSettingsWithNavDetail,
  type NavKey,
} from "./app-settings/types";
import { NotificationBell } from "./NotificationBell";
import { ENABLE_USAGE_INSIGHTS } from "../platform";
import { UsagePopover } from "./UsagePopover";
import { useI18n } from "../i18n";
import s from "../styles";

export function SidebarFooterActions({
  projectId,
  themeVariant,
  themeMode,
  systemPrefersDark,
  onThemeModeChange,
  onToggleTheme,
  terminalFontSize,
  onTerminalFontSizeChange,
  taskDisplayWindow,
  onTaskDisplayWindowChange,
  attentionBadge,
  onAttentionBadgeChange,
  terminalScrollback,
  onTerminalScrollbackChange,
  uiFontFamily,
  onUiFontFamilyChange,
  monoFontFamily,
  onMonoFontFamilyChange,
}: {
  /**
   * 所属项目；欢迎页宿主不传。`OPEN_APP_SETTINGS_EVENT` 只在作用域匹配时响应，
   * 避免多个同时挂载的 ProjectPage 各开一个设置对话框（见 OpenAppSettingsDetail）。
   */
  projectId?: string;
  themeVariant: ThemeVariant;
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
  onToggleTheme: () => void;
  terminalFontSize: TerminalFontSize;
  onTerminalFontSizeChange: (size: TerminalFontSize) => void;
  taskDisplayWindow: TaskDisplayWindow;
  onTaskDisplayWindowChange: (window: TaskDisplayWindow) => void;
  attentionBadge: boolean;
  onAttentionBadgeChange: (enabled: boolean) => void;
  terminalScrollback: TerminalScrollback;
  onTerminalScrollbackChange: (value: TerminalScrollback) => void;
  uiFontFamily: FontFamily;
  onUiFontFamilyChange: (family: FontFamily) => void;
  monoFontFamily: FontFamily;
  onMonoFontFamilyChange: (family: FontFamily) => void;
}) {
  const { t } = useI18n();
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [defaultNav, setDefaultNav] = useState<NavKey | undefined>(undefined);
  const isDark = themeVariant === "dark" || themeVariant === "midnight";

  useEffect(() => {
    // 主路径:与上游 main 完全相同的 OPEN_APP_SETTINGS_EVENT 监听器,只读 projectId,
    // 不读任何额外字段 —— 与 main 同步成本最低。
    const open = (event: Event) => {
      const detail = (event as CustomEvent<OpenAppSettingsDetail | undefined>).detail;
      if (detail?.projectId !== projectId) return;
      setDefaultNav(undefined);
      setShowAppSettings(true);
    };
    // 本地扩展:另一个事件专门给 IDE 下拉「在设置中管理」入口用,带 nav 标签。
    // 与 OPEN_APP_SETTINGS_EVENT 并列监听,不会相互影响。
    const openWithNav = (event: Event) => {
      const detail = (event as CustomEvent<OpenAppSettingsWithNavDetail | undefined>).detail;
      if (detail?.projectId !== projectId) return;
      setDefaultNav(detail?.nav);
      setShowAppSettings(true);
    };
    window.addEventListener(OPEN_APP_SETTINGS_EVENT, open);
    window.addEventListener(OPEN_APP_SETTINGS_WITH_NAV_EVENT, openWithNav);
    return () => {
      window.removeEventListener(OPEN_APP_SETTINGS_EVENT, open);
      window.removeEventListener(OPEN_APP_SETTINGS_WITH_NAV_EVENT, openWithNav);
    };
  }, [projectId]);

  return (
    <>
      <div style={s.sidebarFooterActions}>
        <NotificationBell />
        <button
          style={s.sidebarIconBtn}
          title={t("appSettings.title")}
          onClick={() => setShowAppSettings(true)}
        >
          <Settings size={14} strokeWidth={1.6} color="var(--text-hint)" />
        </button>
        <button
          style={s.sidebarIconBtn}
          title={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
          onClick={onToggleTheme}
        >
          {isDark ? (
            <Sun size={14} strokeWidth={1.8} color="var(--text-hint)" />
          ) : (
            <Moon size={14} strokeWidth={1.8} color="var(--text-hint)" />
          )}
        </button>
        {ENABLE_USAGE_INSIGHTS ? <UsagePopover /> : null}
      </div>

      {showAppSettings && (
        <AppSettingsDialog
          themeVariant={themeVariant}
          themeMode={themeMode}
          systemPrefersDark={systemPrefersDark}
          onThemeModeChange={onThemeModeChange}
          terminalFontSize={terminalFontSize}
          onTerminalFontSizeChange={onTerminalFontSizeChange}
          taskDisplayWindow={taskDisplayWindow}
          onTaskDisplayWindowChange={onTaskDisplayWindowChange}
          attentionBadge={attentionBadge}
          onAttentionBadgeChange={onAttentionBadgeChange}
          terminalScrollback={terminalScrollback}
          onTerminalScrollbackChange={onTerminalScrollbackChange}
          uiFontFamily={uiFontFamily}
          onUiFontFamilyChange={onUiFontFamilyChange}
          monoFontFamily={monoFontFamily}
          onMonoFontFamilyChange={onMonoFontFamilyChange}
          defaultNav={defaultNav}
          onClose={() => {
            setShowAppSettings(false);
            setDefaultNav(undefined);
          }}
        />
      )}
    </>
  );
}
