@load base/frameworks/packet-filter

# ============================================================
# drop_multicast.zeek — 组播过滤（兜底机制）
#
# 角色定位：
#   这是 ⭐兜底方案⭐，主过滤由 zeek-run.sh 通过命令行
#   -f 参数加载 extend/filters/drop_multicast.bpf 完成。
#
#   此脚本通过 PacketFilter::exclude() 提供二重防护：
#   - 离线 pcap 分析 (zeek -r) 场景
#   - 在线抓包但 -f 参数被覆盖/遗漏的场景
#
# 注意：在 Zeek 8.2.0 实时抓包场景中，PacketFilter::exclude()
# 可能因启动时序问题无法将 BPF 下发到 pcap 层，因此必须依赖
# zeek-run.sh 的 -f 命令行过滤作为主要手段。
# ============================================================

event zeek_init() &priority=10
{
    # exclude() 会对 filter 自动包装 not (...)
    # 传入"正匹配"表达式 — 匹配所有应被排除的流量
    PacketFilter::exclude("drop_multicast_v4", "dst net 224.0.0.0/4 or src net 224.0.0.0/4");
    PacketFilter::exclude("drop_multicast_v6", "dst net ff00::/8 or src net ff00::/8");
}
