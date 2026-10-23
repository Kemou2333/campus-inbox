package io.github.kemou2333.campusinbox;

import java.net.URI;
import java.net.URISyntaxException;

/** Fixed public release channel; never accepts a download host supplied by a page. */
final class NativeUpdatePolicy {
    static final String MANIFEST_URL = "https://123.57.30.129/downloads/android-latest.json";
    static final String RELEASE_API = "https://api.github.com/repos/Kemou2333/campus-inbox/releases/latest";
    static final int CACHE_POLICY_VERSION = 2;
    static final long CHECK_DEBOUNCE = 5_000;
    static final long MANUAL_INTERVAL = 30_000;
    static final int MAX_RESPONSE_BYTES = 512 * 1024;
    static final int MAX_MANIFEST_BYTES = 32 * 1024;
    static final int NETWORK_TIMEOUT_MS = 3_000;
    static final long CHECK_TIMEOUT_MS = 14_000;

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

    static boolean currentMetadata(String candidate, String installed, String known) {
        if (releaseVersion("android-v" + candidate) == null || releaseVersion("android-v" + installed) == null) return false;
        // A response older than the installed app or a previously validated
        // release is stale, even if it came from an otherwise trusted endpoint.
        return !newer(installed, candidate) && (releaseVersion("android-v" + known) == null || !newer(known, candidate));
    }

    static boolean reusableValidator(String candidate, String installed, int cachePolicy,
                                     String verifiedBuild, String storedEndpoint, String requestedEndpoint) {
        return cachePolicy == CACHE_POLICY_VERSION && installed != null && installed.equals(verifiedBuild)
                && (MANIFEST_URL.equals(requestedEndpoint) || RELEASE_API.equals(requestedEndpoint))
                && requestedEndpoint.equals(storedEndpoint) && currentMetadata(candidate, installed, candidate);
    }

    static boolean verifiedAliyunDownload(String value, String version) {
        if (releaseVersion("android-v" + version) == null) return false;
        // Exact spelling also rejects userinfo, alternate ports, query/hash and
        // encoded path aliases before any browser or network handoff.
        return ("https://123.57.30.129/downloads/android-v" + version
                + "/campus-inbox-" + version + ".apk").equals(value);
    }

    static String preferredDownload(String version, String github, String aliyun) {
        // The independent GitHub backup must agree with the same version even
        // when a valid Aliyun primary has been advertised.
        if (!verifiedDownload(github, version)
                || aliyun != null && !verifiedAliyunDownload(aliyun, version)) return null;
        return aliyun != null ? aliyun : github;
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
