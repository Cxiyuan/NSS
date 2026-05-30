#!/bin/bash
# ============================================================
# block-gitignore.sh — PreToolUse hook for Reasonix
# 禁止编辑 .gitignore 文件
# ============================================================

input=$(cat)
tool_name=$(echo "$input" | jq -r '.toolName // empty')
tool_args=$(echo "$input" | jq -r '.toolArgs // empty')

is_blocked=false

case "$tool_name" in
    "edit_file"|"write_file")
        file_path=$(echo "$tool_args" | jq -r '.path // empty')
        if [ -n "$file_path" ] && echo "$file_path" | grep -q '\.gitignore'; then
            is_blocked=true
        fi
        ;;
esac

if [ "$is_blocked" = true ]; then
    echo "[block-gitignore] 禁止操作: .gitignore 文件为只读，不可修改"
    exit 2
fi

exit 0
