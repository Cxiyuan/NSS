@load base/frameworks/packet-filter

# ============================================================
# drop_multicast.zeek
# 在抓包层面丢弃所有 IP 多播/组播流量
#
# 机制：zeek_init 时通过 PacketFilter::exclude() 注入 BPF 过滤表达式，
# libpcap 在读取数据包时即丢弃，不进入 Zeek 协议分析。
# 对在线抓包和离线 pcap (zeek -r) 均生效。
#
# IPv4 组播: 224.0.0.0/4
#   BPF 中 `net` 默认只匹配 `dst net`，但组播响应包的源IP也是组播地址，
#   所以必须 src net 和 dst net 同时排除。
# IPv6 组播: ff00::/8
# ============================================================

event zeek_init() &priority=10
{
    # 注意：PacketFilter::exclude() 会对 filter 参数自动包装 not (...)
    # 所以这里传入的是"正匹配"表达式 — 匹配所有应被排除的流量
    PacketFilter::exclude("drop_multicast_v4", "dst net 224.0.0.0/4 or src net 224.0.0.0/4");
    PacketFilter::exclude("drop_multicast_v6", "dst net ff00::/8 or src net ff00::/8");
}
