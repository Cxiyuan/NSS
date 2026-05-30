@load base/protocols/http/main
@load base/frameworks/files

module HTTP;

export {
    redef enum Log::ID += { LOG_HTTP_FILES };

    type FilesInfo: record {
        ts:          time   &log;
        uid:         string &log;
        id:          conn_id &log;
        is_orig:     bool   &log;
        fuid:        string &log;
        mime_type:   string &log &default="";
        total_bytes: count  &log &default=0;
        seen_bytes:  count  &log &default=0;
    };

    global log_http_files: event(rec: FilesInfo);
}

event zeek_init() &priority=5
{
    Log::create_stream(HTTP::LOG_HTTP_FILES, [$columns=FilesInfo, $ev=log_http_files, $path="http_files"]);
}

event file_state_remove(f: fa_file)
{
    # Debug: log all file_state_remove calls to verify handler fires
    local src = f?$source ? f$source : "(unset)";
    local n_conns = |f$conns|;
    local f_mime = (f?$info && f$info?$mime_type) ? f$info$mime_type : "(none)";
    print fmt("http-files: source=%s fuid=%s conns=%d mime=%s", src, f$id, n_conns, f_mime);

    if ( src != "HTTP" )
        return;

    if ( n_conns == 0 )
        return;

    for ( [cid], c in f$conns )
    {
        if ( ! c?$http )
            next;

        local info = FilesInfo(
            $ts         = network_time(),
            $uid        = c$uid,
            $id         = c$id,
            $is_orig    = f$is_orig,
            $fuid       = f$id
        );

        if ( f?$info && f$info?$mime_type )
            info$mime_type = f$info$mime_type;

        if ( f?$total_bytes )
            info$total_bytes = f$total_bytes;

        info$seen_bytes = f$seen_bytes;

        Log::write(HTTP::LOG_HTTP_FILES, info);
    }
}
