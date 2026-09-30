#!/bin/bash
# 闹之钟 macOS / Linux 启动入口。
# 双击 .command 文件即可运行；首次使用可能需要先执行：
#   chmod +x launcher/启动应用.command
# 启动阶段（切目录、找 node）出错要立刻停，所以这里用 set -e；
# 但 serve.cjs 本身允许以非 0 退出（端口被占用等），它的退出码要自己接住。
set -e
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "需要先安装 Node.js，再重新启动闹之钟。"
  echo "下载地址：https://nodejs.org/"
  read -r -p "按回车键关闭…" _
  exit 1
fi

status=0
node launcher/serve.cjs || status=$?

# 出错时保留窗口，方便看清提示（正常退出由用户 Ctrl+C 结束）。
if [ "$status" -ne 0 ]; then
  echo
  read -r -p "按回车键关闭…" _
fi
exit "$status"
