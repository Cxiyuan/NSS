#!/bin/bash
# ============================================================
# block-zeek-edit.sh — PreToolUse hook for Reasonix
# 禁止编辑 zeek-8.2.0/ 目录下的任何文件
# ============================================================

input=$(cat)
tool_name=$(echo "$input" | jq -r '.toolName // empty')
tool_args=$(echo "$input" | jq -r '.toolArgs // empty')

zeek_dir="zeek-8.2.0"

is_blocked=false

case "$tool_name" in
    "edit_file"|"write_file"|"delete_file"|"delete_directory")
        file_path=$(echo "$tool_args" | jq -r '.path // empty')
        if [ -n "$file_path" ] && echo "$file_path" | grep -q "$zeek_dir"; then
            is_blocked=true
        fi
        ;;
    "run_command")
        command=$(echo "$tool_args" | jq -r '.command // empty')
        if [ -n "$command" ]; then
            if echo "$command" | grep -E "(rm\s+-?[a-z]*\s*|rmdir\s+).*${zeek_dir}" > /dev/null 2>&1; then
                is_blocked=true
            fi
        fi
        ;;
esac

if [ "$is_blocked" = true ]; then
    echo "[block-zeek-edit] 禁止操作: zeek-8.2.0/ 目录为只读，不可编辑/删除/写入"
    exit 2
fi

exit 0
