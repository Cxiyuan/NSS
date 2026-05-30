#!/bin/bash
# ============================================================
# block-builds.sh — PreToolUse hook for Reasonix
# 禁止本地编译、前端构建、docker 构建/拉取
# ============================================================

input=$(cat)
tool_name=$(echo "$input" | jq -r '.toolName // empty')
tool_args=$(echo "$input" | jq -r '.toolArgs // empty')
command=$(echo "$tool_args" | jq -r '.command // empty')

# 只拦截 run_command
if [ "$tool_name" != "run_command" ] || [ -z "$command" ]; then
    exit 0
fi

blocked=false

# 1. 软件编译
if echo "$command" | grep -E '(^|\s)(make\s|(gcc|g\+\+|clang|clang\+\+|cc|c\+\+|rustc|go|javac)\s)' > /dev/null 2>&1; then
    blocked=true
fi

# 2. 前端构建
if echo "$command" | grep -E '(^|\s)(npm run build|yarn build|webpack|vite build|esbuild|next build|nuxt build)' > /dev/null 2>&1; then
    blocked=true
fi

# 3. Docker 镜像构建
if echo "$command" | grep -E '(^|\s)(docker build|docker buildx build)' > /dev/null 2>&1; then
    blocked=true
fi

# 4. Docker 镜像拉取
if echo "$command" | grep -E '(^|\s)(docker pull)' > /dev/null 2>&1; then
    blocked=true
fi

if [ "$blocked" = true ]; then
    echo "[block-builds] 禁止操作: 本地编译、前端构建、docker 构建/拉取不被允许"
    exit 2
fi

exit 0
