import type { LucideIcon } from "lucide-react";
import {
  DEFAULT_SEND_SHORTCUT,
  DEFAULT_SHIFT_ENTER_NEWLINE,
  type SendShortcut,
} from "../../shortcuts";
import { DEFAULT_TERMINAL_SCROLLBACK } from "../../types";

export type NavKey =
  | "general"
  | "theme"
  | "fonts"
  | "shortcuts"
  | "hooks"
  | "skills"
  | "ide"
  | "about"
  | "thanks"
  | "community"
  | "claude"
  | "codex";

export interface HookInstallStatus {
  node_path: string;
  script_path: string;
  claude_installed: boolean;
  codex_installed: boolean;
  error?: string;
}

export type HookReadinessReason = "ok" | "no_node" | "not_installed" | "version_too_low";

export interface HookAgentReadiness {
  agent: "claude" | "codex";
  usable: boolean;
  reason: HookReadinessReason;
  detectedVersion: string;
  minVersion: string;
}

export interface AgentModelOption {
  model: string;
  label?: string;
  reasoningEfforts: string[];
  defaultReasoningEffort?: string;
}

export interface AgentModelCatalog {
  models: AgentModelOption[];
  initialized: boolean;
  initializedAt?: number;
  sourceVersion?: string;
}

export const EMPTY_AGENT_MODEL_CATALOG: AgentModelCatalog = {
  models: [],
  initialized: false,
};

/** 单个 IDE 启动条目。builtin=true 表示是自动探测出来的常见 IDE(用户不可删,可隐藏);
 *  builtin=false 表示用户在设置里手动添加的自定义 IDE(可删)。
 *  command 是带 {file}/{line}/{dir}/{project} 占位符的启动模板。 */
export interface IdeEntry {
  id: string;
  label: string;
  command: string;
  builtin: boolean;
  hidden: boolean;
}

export const EMPTY_IDE_ENTRY: IdeEntry = {
  id: "",
  label: "",
  command: "",
  builtin: false,
  hidden: false,
};

export interface AppSettings {
  claude_path: string;
  codex_path: string;
  send_shortcut: SendShortcut;
  terminal_shift_enter_newline: boolean;
  claude_force_default_tui: boolean;
  terminal_scrollback: number;
  /** 终端框选松手后自动把选区复制到剪贴板（copy-on-select） */
  terminal_copy_on_select: boolean;
  /** Windows：优先使用随包侧载的新版 ConPTY（重启后生效），其余平台无效果 */
  use_sideloaded_conpty: boolean;
  claude_model_catalog: AgentModelCatalog;
  codex_model_catalog: AgentModelCatalog;
  /** 「用 IDE 打开」功能已配置的 IDE 列表 */
  ide_entries: IdeEntry[];
  /** 最近一次选择的 IDE id。None 时回落到 ide_entries 中第一个未隐藏条目 */
  last_used_ide_id: string | null;
}

/**
 * 后端加载完成前的占位默认值,与 app_settings.rs 各 default_* 保持一致。
 * 各面板统一引用此常量,新增字段只改这一处(组件内不要再写字面量)。
 */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  claude_path: "",
  codex_path: "",
  send_shortcut: DEFAULT_SEND_SHORTCUT,
  terminal_shift_enter_newline: DEFAULT_SHIFT_ENTER_NEWLINE,
  claude_force_default_tui: true,
  terminal_scrollback: DEFAULT_TERMINAL_SCROLLBACK,
  terminal_copy_on_select: false,
  use_sideloaded_conpty: true,
  claude_model_catalog: EMPTY_AGENT_MODEL_CATALOG,
  codex_model_catalog: EMPTY_AGENT_MODEL_CATALOG,
  ide_entries: [],
  last_used_ide_id: null,
};

export interface AgentVersions {
  claude_version: string;
  codex_version: string;
}

export type AgentKey = "claude" | "codex";

export type NavSection = "application" | "agents" | "community" | "about";

export interface AppSettingsNavItem {
  key: NavKey;
  labelKey: string;
  section: NavSection;
  icon?: LucideIcon;
  /** 覆盖图标描边颜色（默认 var(--text-secondary)） */
  iconColor?: string;
  /** 图标填充色（默认 "none"，传入颜色即为实心图标） */
  iconFill?: string;
  logo?: string;
  filePath?: string;
  lang?: string;
  /** 设置后点击该项不切换面板，而是用浏览器打开此外链 */
  url?: string;
}

export const APP_SETTINGS_CHANGED_EVENT = "nezha:app-settings-changed";
export const SKILL_HUB_CHANGED_EVENT = "nezha:skill-hub-changed";
export const OPEN_APP_SETTINGS_EVENT = "nezha:open-app-settings";

/**
 * `SKILL_HUB_CHANGED_EVENT` 可携带 `detail.projects`（来自后端 `set_skill_hub_path` 的完整列表），
 * App.tsx 收到后会把它作为权威列表替换前端 state，避免竞态覆盖 hub project。
 */
export interface SkillHubChangedDetail {
  projects?: unknown;
}

/**
 * `OPEN_APP_SETTINGS_EVENT` 的作用域。App 设置对话框由每个 `SidebarFooterActions` 实例各自托管，
 * 而多个 ProjectPage 会同时保持挂载：不带作用域的事件会让所有隐藏页面各开一个对话框，
 * 用户切回那些项目时对话框会凭空出现。带上 `projectId` 后只有该项目的宿主响应；
 * 不带 `projectId`（欢迎页派发）时只有欢迎页宿主响应。
 *
 * 来自「用 IDE 打开」下拉的入口想直接落到 IDE 标签页 —— 它派发的是独立的
 * `OPEN_APP_SETTINGS_WITH_NAV_EVENT`，**不**修改本事件的契约，保持与上游 main 的零耦合。
 */
export interface OpenAppSettingsDetail {
  projectId?: string;
}

export function dispatchOpenAppSettings(projectId?: string) {
  const detail: OpenAppSettingsDetail = projectId ? { projectId } : {};
  window.dispatchEvent(new CustomEvent<OpenAppSettingsDetail>(OPEN_APP_SETTINGS_EVENT, { detail }));
}

/**
 * 本地扩展：与 `OPEN_APP_SETTINGS_EVENT` 同样的作用域规则，但额外携带要打开的 nav 标签。
 * 这是「用 IDE 打开」下拉点「在设置中管理 IDE」时的派发路径 —— 不动上游事件契约,
 * SidebarFooterActions 单独多监听一份即可。
 */
export const OPEN_APP_SETTINGS_WITH_NAV_EVENT = "nezha:open-app-settings-with-nav";

export interface OpenAppSettingsWithNavDetail {
  projectId?: string;
  nav: NavKey;
}

export function dispatchOpenAppSettingsWithNav(projectId: string | undefined, nav: NavKey) {
  const detail: OpenAppSettingsWithNavDetail = { nav };
  if (projectId) detail.projectId = projectId;
  window.dispatchEvent(
    new CustomEvent<OpenAppSettingsWithNavDetail>(OPEN_APP_SETTINGS_WITH_NAV_EVENT, { detail }),
  );
}
