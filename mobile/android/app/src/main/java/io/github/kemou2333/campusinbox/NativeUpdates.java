package io.github.kemou2333.campusinbox;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/** Foreground-entry metadata checks plus an explicit settings action; no installer or background service. */
final class NativeUpdates {
    static final class Release {
        final String version;
        final String github;
        final String aliyun;
        final String download;
        Release(String version, String github, String aliyun) {
            String preferred = NativeUpdatePolicy.preferredDownload(version, github, aliyun);
            if (preferred == null) throw new IllegalArgumentException("Invalid release channel");
            this.version = version; this.github = github; this.aliyun = aliyun; this.download = preferred;
        }
        boolean acceptsDownload(String value) {
            return github.equals(value) || aliyun != null && aliyun.equals(value);
        }
    }
    static final class CheckResult {
        final String status;
        final Release release;
        CheckResult(String status, Release release) { this.status = status; this.release = release; }
    }

    private final SharedPreferences preferences;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    // A browser handoff is not proof of installation. Keep this version quiet for the current app process.
    private static volatile String downloadOpenedVersion;
    private volatile boolean checking;
    private Consumer<CheckResult> waitingManual;

    NativeUpdates(Context context) {
        preferences = context.getApplicationContext().getSharedPreferences("release-check", Context.MODE_PRIVATE);
    }

    synchronized void checkOnEntry(Consumer<Release> available) {
        if (checking || !NativeUpdatePolicy.checkDue(System.currentTimeMillis(), preferences.getLong("lastAttempt", 0))) return;
        Release cached = cachedRelease();
        if (cached != null) available.accept(cached);
        checking = true;
        // Persist only a short debounce, so Activity recreation cannot start duplicate requests.
        preferences.edit().putLong("lastAttempt", System.currentTimeMillis()).apply();
        runCheck(available);
    }

    synchronized void checkNow(Consumer<CheckResult> completed) {
        if (checking) {
            // A manual tap during the automatic request waits for that result, without another request.
            if (waitingManual == null) waitingManual = completed;
            else completed.accept(new CheckResult("busy", null));
            return;
        }
        long now = System.currentTimeMillis();
        // Reuse a successful check for 30 seconds, including the automatic check after resume.
        Release cached = cachedMetadata();
        if (cached != null && !NativeUpdatePolicy.manualCheckDue(now, preferences.getLong("lastSuccess", 0))) {
            completed.accept(result(cached)); return;
        }
        if (!NativeUpdatePolicy.manualCheckDue(now, preferences.getLong("lastManualAttempt", 0))) {
            completed.accept(new CheckResult("cooldown", null)); return;
        }
        checking = true;
        waitingManual = completed;
        // A manual request and a near-simultaneous foreground callback share the short debounce.
        preferences.edit().putLong("lastAttempt", now).putLong("lastManualAttempt", now).apply();
        runCheck(null);
    }

    private void runCheck(Consumer<Release> available) {
        network.execute(() -> {
            CheckResult outcome;
            try { outcome = result(fetch()); }
            catch (IOException | RuntimeException ignored) { outcome = new CheckResult("error", null); }
            Consumer<CheckResult> manual;
            synchronized (this) { checking = false; manual = waitingManual; waitingManual = null; }
            // Explicit settings checks render their own result instead of opening a second dialog.
            if (manual != null) manual.accept(outcome);
            else if (available != null && "available".equals(outcome.status)) available.accept(outcome.release);
        });
    }

    private CheckResult result(Release release) {
        return new CheckResult(NativeUpdatePolicy.newer(release.version, BuildConfig.VERSION_NAME) ? "available" : "current", release);
    }

    boolean shouldPrompt(Release release) {
        return NativeUpdatePolicy.newer(release.version, BuildConfig.VERSION_NAME)
                && NativeUpdatePolicy.preferredDownload(release.version, release.github, release.aliyun) != null
                && !release.version.equals(downloadOpenedVersion)
                && (!release.version.equals(preferences.getString("promptVersion", ""))
                || NativeUpdatePolicy.checkDue(System.currentTimeMillis(), preferences.getLong("promptTime", 0)));
    }

    void markPrompted(Release release) {
        preferences.edit().putString("promptVersion", release.version).putLong("promptTime", System.currentTimeMillis()).apply();
    }

    void noteDownloadOpened(String download) {
        Release cached = cachedMetadata();
        if (cached != null && cached.acceptsDownload(download)) downloadOpenedVersion = cached.version;
    }

    private Release cachedRelease() {
        Release release = cachedMetadata();
        return release != null && NativeUpdatePolicy.newer(release.version, BuildConfig.VERSION_NAME) ? release : null;
    }

    private Release cachedMetadata() {
        String version = preferences.getString("version", "");
        // Existing installs stored their verified GitHub URL as download.
        String github = preferences.getString("github", preferences.getString("download", ""));
        String aliyun = preferences.getString("aliyun", null);
        return NativeUpdatePolicy.preferredDownload(version, github, aliyun) != null
                ? new Release(version, github, aliyun) : null;
    }

    private Release fetch() throws IOException {
        long deadline = SystemClock.elapsedRealtime() + NativeUpdatePolicy.CHECK_TIMEOUT_MS;
        try { return fetchMetadata(NativeUpdatePolicy.MANIFEST_URL, "manifest", deadline); }
        catch (IOException | RuntimeException ignored) {
            // A missing/untrusted/unavailable site manifest never sends the user
            // to another supplied host. The only fallback is the fixed API.
            return fetchMetadata(NativeUpdatePolicy.RELEASE_API, "github", deadline);
        }
    }

    private int timeout(long deadline) throws IOException {
        long remaining = deadline - SystemClock.elapsedRealtime();
        if (remaining <= 0) throw new IOException("Release check timed out");
        return (int) Math.min(NativeUpdatePolicy.NETWORK_TIMEOUT_MS, remaining);
    }

    private Release fetchMetadata(String endpoint, String source, long deadline) throws IOException {
        boolean manifest = "manifest".equals(source);
        int limit = manifest ? NativeUpdatePolicy.MAX_MANIFEST_BYTES : NativeUpdatePolicy.MAX_RESPONSE_BYTES;
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(timeout(deadline));
            connection.setReadTimeout(timeout(deadline));
            connection.setRequestProperty("Accept", manifest ? "application/json" : "application/vnd.github+json");
            if (!manifest) connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
            connection.setRequestProperty("User-Agent", "Campus-Inbox-Android/" + BuildConfig.VERSION_NAME);
            Release cached = cachedMetadata();
            // A 304 is meaningful only for the endpoint that supplied this cache.
            boolean sameSource = source.equals(preferences.getString("metadataSource", "github"));
            boolean reusable = cached != null && sameSource
                    && (!manifest || !NativeUpdatePolicy.newer(BuildConfig.VERSION_NAME, cached.version));
            String etag = preferences.getString("etag", "");
            if (reusable && validEtag(etag)) connection.setRequestProperty("If-None-Match", etag);
            int status = connection.getResponseCode();
            timeout(deadline);
            if (status == HttpURLConnection.HTTP_NOT_MODIFIED) {
                if (!reusable || !validEtag(etag)) throw new IOException("Missing release cache");
                preferences.edit().putLong("lastSuccess", System.currentTimeMillis()).apply();
                return cached;
            }
            if (status != HttpURLConnection.HTTP_OK) throw new IOException("Release check unavailable");
            if (connection.getContentLengthLong() > limit) throw new IOException("Release response too large");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[8192];
                int count;
                while (true) {
                    connection.setReadTimeout(timeout(deadline));
                    count = input.read(chunk);
                    timeout(deadline);
                    if (count == -1) break;
                    if (bytes.size() + count > limit) throw new IOException("Release response too large");
                    bytes.write(chunk, 0, count);
                }
                JSONObject body = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
                Release release = manifest ? parseManifest(body) : parseRelease(body);
                if (release == null) throw new IOException("No verified Android release");
                if (manifest && (NativeUpdatePolicy.newer(BuildConfig.VERSION_NAME, release.version)
                        || cached != null && NativeUpdatePolicy.newer(cached.version, release.version))) {
                    throw new IOException("Stale release manifest");
                }
                // Save all channels and their validator together, avoiding a
                // mixed version/URL or site/GitHub ETag after process recreation.
                SharedPreferences.Editor editor = preferences.edit();
                editor.putString("version", release.version).putString("download", release.download)
                        .putString("github", release.github).putString("metadataSource", source)
                        .putLong("lastSuccess", System.currentTimeMillis());
                if (release.aliyun == null) editor.remove("aliyun"); else editor.putString("aliyun", release.aliyun);
                String nextEtag = connection.getHeaderField("ETag");
                if (validEtag(nextEtag)) editor.putString("etag", nextEtag); else editor.remove("etag");
                editor.apply();
                return release;
            } catch (org.json.JSONException ignored) { throw new IOException("Invalid release metadata"); }
        } finally { connection.disconnect(); }
    }

    private boolean validEtag(String value) {
        return value != null && !value.isEmpty() && value.length() <= 200
                && !value.contains("\r") && !value.contains("\n");
    }

    private Release parseManifest(JSONObject body) {
        if (!(body.opt("version") instanceof String) || !(body.opt("github") instanceof String)) return null;
        Object advertised = body.opt("aliyun");
        if (advertised != null && advertised != JSONObject.NULL && !(advertised instanceof String)) return null;
        String version = body.optString("version"), github = body.optString("github");
        String aliyun = advertised instanceof String ? (String) advertised : null;
        return NativeUpdatePolicy.preferredDownload(version, github, aliyun) != null
                ? new Release(version, github, aliyun) : null;
    }

    private Release parseRelease(JSONObject body) {
        if (body.optBoolean("draft", true) || body.optBoolean("prerelease", true)) return null;
        String version = NativeUpdatePolicy.releaseVersion(body.optString("tag_name"));
        if (version == null) return null;
        JSONArray assets = body.optJSONArray("assets");
        if (assets == null) return null;
        String expectedName = "campus-inbox-" + version + ".apk";
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.optJSONObject(i);
            if (asset == null || !expectedName.equals(asset.optString("name"))
                    || !"uploaded".equals(asset.optString("state")) || asset.optLong("size", 0) <= 0) continue;
            String download = asset.optString("browser_download_url");
            if (NativeUpdatePolicy.verifiedDownload(download, version)) return new Release(version, download, null);
        }
        return null;
    }

    void close() { network.shutdownNow(); }
}
