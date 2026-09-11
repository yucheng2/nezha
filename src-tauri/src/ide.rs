//! 「用 IDE 打开」后端模块
//!
//! 负责两件事：
//! 1. 把用户配置的 `command` 模板(带 `{file}` `{line}` `{dir}` `{project}` 占位符)渲染成
//!    可执行的 program + args 列表。
//! 2. 用 spawn_blocking 启动 IDE 进程；fire-and-forget,失败返回错误信息给前端 toast。
//!
//! 路径合法性由 `crate::fs::validate_path_within` 保证项目内约束；`ide_id` 在
//! `AppSettings::ide_entries` 中的存在性由调用方在进入本模块前校验,避免任意命令执行。

use std::path::Path;
use std::process::{Command, Stdio};

use crate::app_settings::load_settings_internal;
use crate::fs::validate_path_within;

/// 占位符替换上下文。`line` 可选 —— 若调用方没传,模板里的 `{line}` 替换成空字符串。
pub struct IdeCommandContext<'a> {
    pub file: &'a str,
    pub line: Option<u32>,
    pub dir: &'a str,
    pub project: &'a str,
}

/// 把 `{file}` `{line}` `{dir}` `{project}` 占位符替换进模板。
/// 模板按空白简单 split —— 第一段是 program,其余是 args。
/// 未知 `{xxx}` 占位符保留原样(方便日后扩展),已替换的占位符不留任何残留。
pub fn render_command(template: &str, ctx: &IdeCommandContext) -> Result<(String, Vec<String>), String> {
    let template = template.trim();
    if template.is_empty() {
        return Err("IDE command template is empty".to_string());
    }

    let line_str = ctx.line.map(|n| n.to_string()).unwrap_or_default();
    let rendered = template
        .replace("{file}", ctx.file)
        .replace("{line}", &line_str)
        .replace("{dir}", ctx.dir)
        .replace("{project}", ctx.project);

    let mut parts = rendered.split_whitespace();
    let program = parts
        .next()
        .ok_or_else(|| "IDE command template has no program".to_string())?
        .to_string();
    let args: Vec<String> = parts.map(|s| s.to_string()).collect();

    Ok((program, args))
}

/// 解析 `path` 的父目录作为 `{dir}`。文件 → parent;目录 → 自身。
fn resolve_dir(path: &str) -> String {
    let p = Path::new(path);
    if p.is_dir() {
        path.to_string()
    } else {
        p.parent()
            .and_then(|p| p.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| path.to_string())
    }
}

#[tauri::command]
pub async fn open_in_ide(
    path: String,
    project_path: String,
    ide_id: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || open_in_ide_blocking(path, project_path, ide_id))
        .await
        .map_err(|e| e.to_string())?
}

fn open_in_ide_blocking(path: String, project_path: String, ide_id: String) -> Result<(), String> {
    // 1. 路径校验:必须落在 project_path 内
    let validated = validate_path_within(&path, &project_path, true)?;

    // 2. 查 settings 拿 ide 条目(避免任意命令执行)
    let settings = load_settings_internal();
    let entry = settings
        .ide_entries
        .iter()
        .find(|e| e.id == ide_id)
        .ok_or_else(|| format!("Unknown IDE id: {}", ide_id))?;

    let target_path_str = validated.to_string_lossy().to_string();
    let dir_str = resolve_dir(&target_path_str);
    let ctx = IdeCommandContext {
        file: &target_path_str,
        line: None, // V1:文件右键菜单不传 line;后续若支持从编辑器跳转到行再加
        dir: &dir_str,
        project: &project_path,
    };

    let (program, args) = render_command(&entry.command, &ctx)?;

    // 3. spawn —— detached fire-and-forget,IDE 是长期进程
    let mut cmd = Command::new(&program);
    crate::subprocess::configure_background_command(&mut cmd);
    cmd.args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    // spawn 失败 → 返回错误让前端 toast;spawn 成功 → 直接返回 Ok(()),
    // IDE 进程由 OS 接管,即使 nezha 退出也不会被 kill(kill_on_drop=false 默认行为)
    cmd.spawn().map_err(|e| format_spawn_error(&program, &e))?;
    Ok(())
}

/// 把 `std::io::Error` 翻译成人话。`NotFound` 是最高频的失败模式 ——
/// 通常是命令行里写的绝对路径过期了(IDE 升级 / JetBrains Toolbox launcher 失效等),
/// 提示用户去 IDE 设置里修改 command。
fn format_spawn_error(program: &str, err: &std::io::Error) -> String {
    use std::io::ErrorKind;
    match err.kind() {
        ErrorKind::NotFound => format!(
            "Failed to launch IDE: \"{program}\" not found. \
             The path may be outdated (e.g. JetBrains Toolbox launcher pointing to a removed IDE). \
             Update the IDE command in Settings → IDE. ({err})"
        ),
        ErrorKind::PermissionDenied => format!(
            "Failed to launch IDE: permission denied for \"{program}\". ({err})"
        ),
        _ => format!("Failed to launch \"{program}\": {err}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx<'a>(file: &'a str, line: Option<u32>) -> IdeCommandContext<'a> {
        IdeCommandContext {
            file,
            line,
            dir: "/tmp/proj",
            project: "/tmp/proj",
        }
    }

    #[test]
    fn render_basic_template() {
        let (program, args) = render_command("code --goto {file}:{line}", &ctx("/tmp/a.rs", Some(10))).unwrap();
        assert_eq!(program, "code");
        assert_eq!(args, vec!["--goto", "/tmp/a.rs:10"]);
    }

    #[test]
    fn render_with_dir_placeholder() {
        let (program, args) =
            render_command("webstorm {dir}", &ctx("/tmp/proj/foo.rs", Some(1))).unwrap();
        assert_eq!(program, "webstorm");
        assert_eq!(args, vec!["/tmp/proj"]); // file.rs → parent /tmp/proj
    }

    #[test]
    fn render_with_unknown_placeholder_kept() {
        let (program, args) = render_command("foo {file} {bar}", &ctx("/tmp/a", None)).unwrap();
        assert_eq!(program, "foo");
        assert_eq!(args, vec!["/tmp/a", "{bar}"]);
    }

    #[test]
    fn render_empty_line_when_not_provided() {
        let (_, args) = render_command("code --goto {file}:{line}", &ctx("/tmp/a.rs", None)).unwrap();
        assert_eq!(args, vec!["--goto", "/tmp/a.rs:"]);
    }

    #[test]
    fn render_empty_template_errors() {
        assert!(render_command("", &ctx("/tmp/a", None)).is_err());
        assert!(render_command("   ", &ctx("/tmp/a", None)).is_err());
    }

    #[test]
    fn resolve_dir_on_file_returns_parent() {
        // /tmp/proj/does-not-exist-xyz.rs 在任何测试环境都不存在 → 走 file 分支取 parent
        assert_eq!(
            resolve_dir("/tmp/proj/does-not-exist-xyz.rs"),
            "/tmp/proj"
        );
    }

    #[test]
    fn format_spawn_error_for_not_found_mentions_settings() {
        // NotFound 是最高频失败模式(过期路径)—— 提示用户去设置改 command
        let err = std::io::Error::from(std::io::ErrorKind::NotFound);
        let msg = format_spawn_error("/Users/yuchengfan/Applications/IntelliJ IDEA 2025.3.1.app/Contents/MacOS/idea", &err);
        assert!(msg.contains("not found"), "msg={msg}");
        assert!(msg.contains("Settings"), "应该提示去设置改路径,msg={msg}");
    }

    #[test]
    fn format_spawn_error_for_permission_denied() {
        let err = std::io::Error::from(std::io::ErrorKind::PermissionDenied);
        let msg = format_spawn_error("code", &err);
        assert!(msg.contains("permission denied"), "msg={msg}");
    }

    #[test]
    fn format_spawn_error_for_other_kinds() {
        let err = std::io::Error::from(std::io::ErrorKind::Interrupted);
        let msg = format_spawn_error("code", &err);
        assert!(msg.contains("Failed to launch"), "msg={msg}");
        assert!(msg.contains("code"), "msg={msg}");
    }
}
