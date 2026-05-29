@load base/protocols/http/main
module HTTP;

# ============================================================
# 扩展 Zeek HTTP Info record
# 采集完整请求/响应头、Authorization、XFF（仅客户端真实IP）
# ============================================================

# ============================================================
# 扩展 Info record
# ============================================================
redef record Info += {
    # ---- 认证相关 ----
    ## 完整 Authorization 头原始值（Basic/Bearer/Digest 等）
    authorizations:        string    &log &optional;
    ## Proxy-Authorization 头原始值
    proxy_authorization:   string    &log &optional;

    # ---- 代理转发（仅客户端真实 IP）----
    ## X-Forwarded-For 头原始值（含完整 IP 链）
    xff:                   string    &log &optional;
    ## 从 X-Forwarded-For 提取的第一个 IP（客户端真实 IP）
    client_ip:             string    &log &optional;
    ## X-Real-IP 头
    x_real_ip:             string    &log &optional;

    # ---- Cookie ----
    ## 完整 Cookie 请求头原始值
    cookies:               string    &log &optional;
    ## Set-Cookie 响应头原始值（含 HttpOnly/Secure/SameSite 属性）
    set_cookie:            string    &log &optional;

    # ---- 标准请求头 ----
    ## Accept 头
    accept:                string    &log &optional;
    ## Accept-Language 头
    accept_language:       string    &log &optional;
    ## Accept-Encoding 头
    accept_encoding:       string    &log &optional;
    ## Content-Type 头（请求/响应共用）
    content_type:          string    &log &optional;
    ## Content-Length 头（请求/响应共用）
    content_length:        count     &log &optional;
    ## Cache-Control 头（请求/响应共用）
    cache_control:         string    &log &optional;
    ## X-Requested-With 头（通常用于 AJAX）
    x_requested_with:      string    &log &optional;
    ## X-CSRF-Token 头
    x_csrf_token:          string    &log &optional;
    ## X-Api-Key 头
    x_api_key:             string    &log &optional;
    ## Origin 头
    origin_header:         string    &log &optional;
    ## Referer 头（已在 main.zeek 中处理，此处作为冗余存储）
    referer:               string    &log &optional;

    # ---- 标准响应头 ----
    ## Server 头
    server_header:         string    &log &optional;
    ## Date 头
    date_header:           string    &log &optional;
    ## Connection 头
    connection_header:     string    &log &optional;
    ## Vary 头
    vary_header:           string    &log &optional;
    ## Expires 头
    expires_header:        string    &log &optional;
    ## Keep-Alive 头
    keep_alive_header:     string    &log &optional;
};

# ============================================================
# http_header 事件处理
# priority=6 高于 main.zeek 的 priority=5，确保先处理
# ============================================================
event http_header(c: connection, is_orig: bool, original_name: string, name: string, value: string) &priority=-6
{
    if ( ! c?$http )
        return;

    # ============================================================
    # 客户端请求头
    # ============================================================
    if ( is_orig )
    {
        if ( name == "AUTHORIZATION" )
        {
            c$http$authorizations = value;
        }
        else if ( name == "PROXY-AUTHORIZATION" )
        {
            c$http$proxy_authorization = value;
        }
        else if ( name == "X-FORWARDED-FOR" )
        {
            c$http$xff = value;
            # 提取第一个 IP（逗号分隔列表的第一个即为客户端真实 IP）
            local xff_parts = split_string1(value, /,/);
            if ( |xff_parts| > 0 )
            {
                c$http$client_ip = strip(xff_parts[0]);
            }
        }
        else if ( name == "X-REAL-IP" )
        {
            c$http$x_real_ip = value;
        }
        else if ( name == "COOKIE" )
        {
            c$http$cookies = value;
        }
        else if ( name == "ACCEPT" )
        {
            c$http$accept = value;
        }
        else if ( name == "ACCEPT-LANGUAGE" )
        {
            c$http$accept_language = value;
        }
        else if ( name == "ACCEPT-ENCODING" )
        {
            c$http$accept_encoding = value;
        }
        else if ( name == "CONTENT-TYPE" )
        {
            c$http$content_type = value;
        }
        else if ( name == "CONTENT-LENGTH" )
        {
            c$http$content_length = to_count(value);
        }
        else if ( name == "CACHE-CONTROL" )
        {
            c$http$cache_control = value;
        }
        else if ( name == "X-REQUESTED-WITH" )
        {
            c$http$x_requested_with = value;
        }
        else if ( name == "X-CSRF-TOKEN" )
        {
            c$http$x_csrf_token = value;
        }
        else if ( name == "X-API-KEY" )
        {
            c$http$x_api_key = value;
        }
        else if ( name == "ORIGIN" )
        {
            c$http$origin_header = value;
        }
        else if ( name == "REFERER" )
        {
            c$http$referer = value;
        }
    }
    # ============================================================
    # 服务器响应头
    # ============================================================
    else
    {
        if ( name == "SET-COOKIE" )
        {
            if ( ! c$http?$set_cookie || |c$http$set_cookie| == 0 )
                c$http$set_cookie = value;
            else
                c$http$set_cookie = fmt("%s; %s", c$http$set_cookie, value);
        }
        else if ( name == "SERVER" )
        {
            c$http$server_header = value;
        }
        else if ( name == "DATE" )
        {
            c$http$date_header = value;
        }
        else if ( name == "CONTENT-TYPE" )
        {
            c$http$content_type = value;
        }
        else if ( name == "CONTENT-LENGTH" )
        {
            c$http$content_length = to_count(value);
        }
        else if ( name == "CONNECTION" )
        {
            c$http$connection_header = value;
        }
        else if ( name == "VARY" )
        {
            c$http$vary_header = value;
        }
        else if ( name == "EXPIRES" )
        {
            c$http$expires_header = value;
        }
        else if ( name == "KEEP-ALIVE" )
        {
            c$http$keep_alive_header = value;
        }
        else if ( name == "CACHE-CONTROL" )
        {
            c$http$cache_control = value;
        }
    }
}