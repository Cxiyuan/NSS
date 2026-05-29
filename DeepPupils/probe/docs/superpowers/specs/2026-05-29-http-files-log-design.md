# HTTP Files 日志 — 设计说明

## 目标

在 probe 项目中新增 `http_files.log`，记录 HTTP 请求/响应 body 中每个文件的 MIME 类型和大小。

## 背景

Zeek 8.2.0 C++ 层 HTTP 解析器（`HTTP.cc:SubmitData()`）在收到 body 数据时自动调用
`file_mgr->DataIn()`，创建 `fa_file` 记录并触发 Files 框架事件链：
`file_new` → `file_sniff`（MIME 检测）→ `file_state_remove`（分析完成）。

`file_state_remove` 时所有文件元数据已完整，可以直接读取。

## 设计

### 新增文件

`docker/extend/http-files.zeek` — 独立脚本，不修改 `http-extend.zeek`。

### 触发时机

`file_state_remove` 事件。比 `file_sniff` 晚但数据完整（total_bytes 已确定）。

### 过滤逻辑

仅处理 `f$source == "HTTP"` 的文件，跳过 SMTP/FTP 等其他协议的文件。

### 日志结构

新增日志流 `HTTP::LOG_HTTP_FILES`，路径 `http_files`，字段：

| 字段 | 类型 | 来源 |
|------|------|------|
| ts | time | network_time() |
| uid | string | c$uid |
| id | conn_id | c$id |
| is_orig | bool | f$is_orig |
| fuid | string | f$id |
| mime_type | string | f$info$mime_type |
| total_bytes | count | f$total_bytes |
| seen_bytes | count | f$seen_bytes |

### 连接关联

`fa_file` 的 `$conns` 表包含该文件涉及的所有连接。对每个连接，取其 `c$http` 确认是 HTTP 连接后写日志。

### Dockerfile 变更

在 `local.zeek` 中增加 `@load /opt/probe/extend/http-files.zeek`。

### 测试

- 新增 `http-files` PCAP 场景（含 Content-Disposition 文件下载），body 为已知大小的文件
- `zeek-analysis` 循环中转换 `http_files.log` 为 JSON
- `field-assertion` 验证 `http_files.json` 字段存在
- `test_http.py` 新增 `TestHttpFiles`，验证 mime_type / total_bytes 值正确

## 与现有组件的关系

```
http-extend.zeek          http-files.zeek
├─ http_header event       ├─ file_state_remove event
├─ http_entity_data event  ├─ 读取 fa_file 元数据
├─ 扩展 Info record        └─ 写入 http_files.log
└─ 输出到 http.log

互不依赖，并列 @load
```
