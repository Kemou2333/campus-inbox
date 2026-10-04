package io.github.kemou2333.campusinbox;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Base64;

/** Pure Java validation shared by the activity and its free host checks. */
final class NativePolicy {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    static final String HOME = ORIGIN + "/assets/web/index.html";
    static final int MAX_MESSAGE_CHARS = 270_000;
    static final int MAX_CHUNK_CHARS = 262_144;
    static final long MAX_EXPORT_BYTES = 96L * 1024 * 1024;
    static final long MAX_CALENDAR_TIME = 4_102_444_800_000L; // 2100-01-01 UTC

    private NativePolicy() {}

    static boolean isTrustedOrigin(String value) {
        try {
            URI uri = new URI(value);
            return "https".equals(uri.getScheme())
                    && "appassets.androidplatform.net".equals(uri.getHost())
                    && (uri.getPort() == -1 || uri.getPort() == 443)
                    && uri.getRawUserInfo() == null
                    && (uri.getPath() == null || uri.getPath().isEmpty() || "/".equals(uri.getPath()))
                    && uri.getRawQuery() == null && uri.getRawFragment() == null;
        } catch (URISyntaxException | NullPointerException ignored) {
            return false;
        }
    }

    static boolean isTrustedPage(String value) {
        try {
            URI uri = new URI(value);
            return "https".equals(uri.getScheme())
                    && "appassets.androidplatform.net".equals(uri.getHost())
                    && (uri.getPort() == -1 || uri.getPort() == 443)
                    && uri.getRawUserInfo() == null
                    && "/assets/web/index.html".equals(uri.getRawPath());
        } catch (URISyntaxException | NullPointerException ignored) {
            return false;
        }
    }

    static boolean isExternalLink(String value) {
        try {
            URI uri = new URI(value);
            return ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
                    && uri.getHost() != null && uri.getRawUserInfo() == null;
        } catch (URISyntaxException | NullPointerException ignored) {
            return false;
        }
    }

    static String fileName(String value) {
        String clean = value == null ? "" : value.replaceAll("[\\\\/\\p{Cntrl}]", "_").trim();
        if (clean.isEmpty() || ".".equals(clean) || "..".equals(clean)) clean = "campus-inbox.json";
        return clean.substring(0, Math.min(clean.length(), 120));
    }

    static String mime(String value) {
        return value != null && value.matches("[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+")
                && value.length() <= 100 ? value : "application/octet-stream";
    }

    static byte[] decodeChunk(String value) {
        if (value == null || value.length() > MAX_CHUNK_CHARS || value.length() % 4 != 0
                || !value.matches("[A-Za-z0-9+/]*={0,2}")) {
            throw new IllegalArgumentException("文件数据格式不正确");
        }
        return Base64.getDecoder().decode(value);
    }

    static boolean validCalendar(long start, long end) {
        return start > 0 && start <= MAX_CALENDAR_TIME && end >= start && end <= MAX_CALENDAR_TIME;
    }
}
