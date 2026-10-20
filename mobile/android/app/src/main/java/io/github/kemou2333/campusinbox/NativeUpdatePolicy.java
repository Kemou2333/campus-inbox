package io.github.kemou2333.campusinbox;

import java.net.URI;
import java.net.URISyntaxException;

/** Fixed public release channel; never accepts a download host supplied by a page. */
final class NativeUpdatePolicy {
    static final String RELEASE_API = "https://api.github.com/repos/Kemou2333/campus-inbox/releases/latest";
    static final long CHECK_DEBOUNCE = 5_000;
    static final long MANUAL_INTERVAL = 30_000;
    static final int MAX_RESPONSE_BYTES = 512 * 1024;

    private NativeUpdatePolicy() {}

    static boolean checkDue(long now, long previous) {
        // Every foreground entry checks again; only brief duplicate lifecycle callbacks are coalesced.
        return previous <= 0 || now >= previous && now - previous >= CHECK_DEBOUNCE
                || previous > now && previous - now > CHECK_DEBOUNCE;
    }

    static boolean manualCheckDue(long now, long previous) {
        return previous <= 0 || now >= previous && now - previous >= MANUAL_INTERVAL
                || previous > now && previous - now > MANUAL_INTERVAL;
    }

    static String releaseVersion(String tag) {
        if (tag == null || !tag.matches("android-v[0-9]{1,4}\\.[0-9]{1,4}\\.[0-9]{1,4}")) return null;
        return tag.substring("android-v".length());
    }

    static boolean newer(String candidate, String current) {
        if (releaseVersion("android-v" + candidate) == null || releaseVersion("android-v" + current) == null) return false;
        String[] next = candidate.split("\\."), installed = current.split("\\.");
        for (int i = 0; i < 3; i++) {
            int difference = Integer.parseInt(next[i]) - Integer.parseInt(installed[i]);
            if (difference != 0) return difference > 0;
        }
        return false;
    }

    static boolean verifiedDownload(String value, String version) {
        if (releaseVersion("android-v" + version) == null) return false;
        try {
            URI uri = new URI(value);
            return "https".equals(uri.getScheme()) && "github.com".equals(uri.getHost())
                    && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getRawUserInfo() == null
                    && ("/Kemou2333/campus-inbox/releases/download/android-v" + version
                    + "/campus-inbox-" + version + ".apk").equals(uri.getRawPath())
                    && uri.getRawQuery() == null && uri.getRawFragment() == null;
        } catch (URISyntaxException | NullPointerException ignored) {
            return false;
        }
    }
}
