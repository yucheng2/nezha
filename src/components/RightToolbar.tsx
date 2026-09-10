import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppWindow, Blocks, ChevronDown, Folder, GitBranch, History, Search, Settings, Terminal } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { invoke } from "@tauri-apps/api/core";
import { IconButton } from "./IconButton";
import { useI18n } from "../i18n";
import { useToast } from "./Toast";
import type { RightPanel } from "../hooks/useProjectPanels";
import {
  APP_SETTINGS_CHANGED_EVENT,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type IdeEntry,
} from "./app-settings/types";
import { dispatchOpenAppSettingsWithNav } from "./app-settings/types";
import s from "../styles";

export function RightToolbar({
  activePanel,
  onToggle,
  terminalActive,
  onToggleTerminal,
  onOpenSearch,
  onOpenSettings,
  showSkillStore = true,
  projectPath,
  targetPath,
  projectId,
}: {
  activePanel: RightPanel;
  onToggle: (panel: Exclude<RightPanel, null>) => void;
  terminalActive: boolean;
  onToggleTerminal: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  /** 技能库项目自身不需要「安装到本项目」入口,隐藏该按钮 */
  showSkillStore?: boolean;
  /**
   * 项目根目录 —— 用于 `open_in_ide` / `open_in_system_file_manager` 命令的
   * 路径校验锚点(防止误指到任意目录),也是没有 `targetPath` 时的回落值。
   * 通常就是 `project.path`。
   */
  projectPath?: string;
  /**
   * IDE 实际要打开的目录（可选）。不传时回落到 `projectPath`。
   * 在 worktree / monorepo sub-repo 场景下应指向当前活动仓库/工作树,
   * 这样 IDE 打开的就是用户当前实际工作的目录,而不是项目根。
   *
   * 这是仅追加的可选 prop —— 上游调用方只传 `projectPath` 的旧用法仍然有效,
   * 不破坏现有 API。
   */
  targetPath?: string;
  /**
   * 当前所属项目,用于「在设置中管理 IDE」入口的事件作用域匹配。
   * 选填 —— 缺省时点击「管理 IDE」会派发到全局事件。
   */
  projectId?: string;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [ideOpen, setIdeOpen] = useState(false);
  const [hoveredIdeId, setHoveredIdeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      invoke<AppSettings>("load_app_settings")
        .then((loaded) => {
          if (!cancelled) setSettings(loaded);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, load);
    };
  }, []);

  const visibleIdes = useMemo(
    () => settings.ide_entries.filter((e) => !e.hidden),
    [settings.ide_entries],
  );

  const defaultIde: IdeEntry | null = useMemo(() => {
    const byLast = settings.last_used_ide_id
      ? visibleIdes.find((e) => e.id === settings.last_used_ide_id) ?? null
      : null;
    return byLast ?? visibleIdes[0] ?? null;
  }, [settings.last_used_ide_id, visibleIdes]);

  const launchIde = useCallback(
    async (entry: IdeEntry, target: { file?: string }) => {
      const root = projectPath;
      const targetDir = targetPath ?? projectPath;
      if (!root || !targetDir) {
        showToast(t("toolbar.openInIde.noProject"), "error");
        return;
      }
      try {
        await invoke("open_in_ide", {
          ideId: entry.id,
          path: target.file ?? targetDir,
          projectPath: root,
        });
      } catch (e) {
        showToast(t("file.failedOpenIde", { error: String(e) }), "error");
      }
    },
    [projectPath, targetPath, showToast, t],
  );

  const openInSystemFileManager = useCallback(async () => {
    const root = projectPath;
    const targetDir = targetPath ?? projectPath;
    if (!root || !targetDir) {
      showToast(t("toolbar.openInIde.noProject"), "error");
      return;
    }
    setIdeOpen(false);
    try {
      await invoke("open_in_system_file_manager", {
        path: targetDir,
        projectPath: root,
      });
    } catch (e) {
      showToast(t("file.failedOpenSystemFolder", { error: String(e) }), "error");
    }
  }, [projectPath, targetPath, showToast, t]);

  const pickIdeAndRemember = useCallback(
    async (entry: IdeEntry) => {
      setIdeOpen(false);
      // 用户主动选了 IDE → 把 last_used_ide_id 同步到后端,下次默认走这个
      if (entry.id !== settings.last_used_ide_id) {
        try {
          const next = await invoke<AppSettings>("save_ide_entries", {
            entries: settings.ide_entries,
            lastUsedId: entry.id,
          });
          setSettings(next);
        } catch {
          // 记住偏好失败不阻塞启动 IDE
        }
      }
      await launchIde(entry, {});
    },
    [launchIde, settings.last_used_ide_id, settings.ide_entries],
  );

  const handleMainButtonClick = useCallback(() => {
    if (!defaultIde) {
      // 没有 IDE 时只打开 popover 让用户去设置,不做别的事
      setIdeOpen(true);
      return;
    }
    if (visibleIdes.length > 1) {
      // 多 IDE 场景:点主按钮 = 启动 last-used + 同步展开 popover 给个反馈;但更稳妥是
      // 直接启动 + 不展开。这里选择「单 IDE 时直接启动,多 IDE 时弹 popover 让用户选」。
      setIdeOpen(true);
      return;
    }
    void launchIde(defaultIde, {});
  }, [defaultIde, visibleIdes.length, launchIde]);

  const buttons: Array<{
    key: Exclude<RightPanel, null>;
    icon: ReactNode;
    title: string;
  }> = [
    { key: "files", icon: <Folder size={17} />, title: t("toolbar.fileExplorer") },
    { key: "git-changes", icon: <GitBranch size={17} />, title: t("toolbar.gitChanges") },
    { key: "git-history", icon: <History size={17} />, title: t("toolbar.gitHistory") },
  ];
  if (showSkillStore) {
    buttons.push({ key: "skills", icon: <Blocks size={17} />, title: t("toolbar.skillStore") });
  }

  const footerItems = [
    { icon: <Settings size={17} />, title: t("settings.title"), disabled: false, onClick: onOpenSettings },
  ];

  const ideTitle = defaultIde
    ? t("toolbar.openInIde.withDefault", { ide: defaultIde.label })
    : t("toolbar.openInIde.disabledHint");

  return (
    <div style={s.rightToolbar}>
      {buttons.map((btn) => (
        <IconButton
          key={btn.key}
          icon={btn.icon}
          title={btn.title}
          active={activePanel === btn.key}
          onClick={() => onToggle(btn.key)}
        />
      ))}

      <IconButton
        icon={<Terminal size={17} />}
        title={t("terminal.title")}
        active={terminalActive}
        onClick={onToggleTerminal}
      />

      <Popover.Root open={ideOpen} onOpenChange={setIdeOpen}>
        <Popover.Anchor asChild>
          <div
            style={{
              position: "relative",
              width: 44,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconButton
              icon={<AppWindow size={17} />}
              title={ideTitle}
              active={ideOpen}
              disabled={!defaultIde && visibleIdes.length === 0 && settings.ide_entries.length === 0}
              onClick={() => {
                handleMainButtonClick();
              }}
            />
            <button
              type="button"
              title={ideTitle}
              tabIndex={-1}
              aria-label={ideTitle}
              disabled={!defaultIde && visibleIdes.length === 0 && settings.ide_entries.length === 0}
              onClick={(e) => {
                e.stopPropagation();
                setIdeOpen((v) => !v);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                right: 2,
                bottom: 1,
                width: 14,
                height: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: ideOpen ? "var(--control-active-bg)" : "var(--bg-card)",
                border: "1px solid var(--border-dim)",
                borderRadius: 5,
                color: "var(--text-hint)",
                cursor: "pointer",
                padding: 0,
                opacity: !defaultIde && visibleIdes.length === 0 && settings.ide_entries.length === 0 ? 0.4 : 1,
              }}
            >
              <ChevronDown size={9} />
            </button>
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            side="left"
            align="end"
            sideOffset={6}
            style={s.ideDropdownContent}
            onOpenAutoFocus={(e) => {
              // 阻止默认 focus,避免从右键菜单 / 新任务输入框抢焦点(终端 IME 防御的同款思路)
              e.preventDefault();
            }}
          >
            <button
              type="button"
              style={{
                ...s.ideDropdownItem,
                ...(hoveredIdeId === "__system__" ? s.ideDropdownItemHover : null),
              }}
              onClick={() => void openInSystemFileManager()}
              onMouseEnter={() => setHoveredIdeId("__system__")}
              onMouseLeave={() =>
                setHoveredIdeId((curr) => (curr === "__system__" ? null : curr))
              }
            >
              <Folder size={14} style={s.ideDropdownItemIcon} />
              <span style={s.ideDropdownItemLabel}>{t("toolbar.openInSystemFolder")}</span>
            </button>
            <div style={s.ideDropdownSeparator} />
            {visibleIdes.length === 0 ? (
              <div style={s.ideDropdownEmpty}>{t("toolbar.openInIde.noConfigured")}</div>
            ) : (
              visibleIdes.map((entry) => {
                const isActive = entry.id === defaultIde?.id;
                const isHover = hoveredIdeId === entry.id && !isActive;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    style={{
                      ...s.ideDropdownItem,
                      ...(isActive ? s.ideDropdownItemActive : null),
                      ...(isHover ? s.ideDropdownItemHover : null),
                    }}
                    onClick={() => void pickIdeAndRemember(entry)}
                    onMouseEnter={() => setHoveredIdeId(entry.id)}
                    onMouseLeave={() =>
                      setHoveredIdeId((curr) => (curr === entry.id ? null : curr))
                    }
                  >
                    <AppWindow size={14} style={s.ideDropdownItemIcon} />
                    <span style={s.ideDropdownItemLabel}>{entry.label}</span>
                    {entry.builtin && <span style={s.ideDropdownBadge}>{t("appSettings.ide.detected")}</span>}
                  </button>
                );
              })
            )}
            <div style={s.ideDropdownSeparator} />
            <button
              type="button"
              style={{
                ...s.ideDropdownItem,
                ...s.ideDropdownFooterItem,
                ...(hoveredIdeId === "__manage__" ? s.ideDropdownItemHover : null),
              }}
              onClick={() => {
                setIdeOpen(false);
                dispatchOpenAppSettingsWithNav(projectId, "ide");
              }}
              onMouseEnter={() => setHoveredIdeId("__manage__")}
              onMouseLeave={() =>
                setHoveredIdeId((curr) => (curr === "__manage__" ? null : curr))
              }
            >
              <Settings size={14} style={{ ...s.ideDropdownItemIcon, ...s.ideDropdownFooterIcon }} />
              <span style={s.ideDropdownItemLabel}>{t("toolbar.openInIde.manageIde")}</span>
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <IconButton icon={<Search size={17} />} title={t("toolbar.search")} onClick={onOpenSearch} />

      <div style={s.rightToolbarSpacer} />

      {footerItems.map((item, i) => (
        <IconButton
          key={i}
          icon={item.icon}
          title={item.title}
          disabled={item.disabled}
          onClick={item.onClick}
        />
      ))}
    </div>
  );
}
