@load base/frameworks/packet-filter

# ============================================================
# drop_multicast.zeek
# 在抓包层面丢弃所有 IP 多播/组播流量
#
# 机制：通过 restrict_filters 注入 BPF 过滤表达式，
# libpcap 在读取数据包时即丢弃，不进入 Zeek 协议分析。
# 对在线抓包和离线 pcap (zeek -r) 均生效。
#
# IPv4 组播: 224.0.0.0/4  → BPF primitive: ip multicast
# IPv6 组播: ff00::/8     → BPF primitive: ip6 mcast
# ============================================================

redef restrict_filters += {
    ["drop_multicast_v4"] = "not ip multicast",
    ["drop_multicast_v6"] = "not ip6 mcast",
};
