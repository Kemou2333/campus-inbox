package io.github.kemou2333.campusinbox;

import android.content.Context;
import android.content.SharedPreferences;

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
        final String download;
        Release(String version, String download) { this.version = version; this.download = download; }
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
                && NativeUpdatePolicy.verifiedDownload(release.download, release.version)
                && !release.version.equals(downloadOpenedVersion)
                && (!release.version.equals(preferences.getString("promptVersion", ""))
                || NativeUpdatePolicy.checkDue(System.currentTimeMillis(), preferences.getLong("promptTime", 0)));
    }

    void markPrompted(Release release) {
        preferences.edit().putString("promptVersion", release.version).putLong("promptTime", System.currentTimeMillis()).apply();
    }

    void noteDownloadOpened(String download) {
        Release cached = cachedMetadata();
        if (cached != null && cached.download.equals(download)
                && NativeUpdatePolicy.verifiedDownload(download, cached.version)) downloadOpenedVersion = cached.version;
    }

    private Release cachedRelease() {
        Release release = cachedMetadata();
        return release != null && NativeUpdatePolicy.newer(release.version, BuildConfig.VERSION_NAME) ? release : null;
    }

    private Release cachedMetadata() {
        String version = preferences.getString("version", ""), download = preferences.getString("download", "");
        return NativeUpdatePolicy.releaseVersion("android-v" + version) != null
                && NativeUpdatePolicy.verifiedDownload(download, version) ? new Release(version, download) : null;
    }

    private Release fetch() throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(NativeUpdatePolicy.RELEASE_API).openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(6000);
            connection.setReadTimeout(6000);
            connection.setRequestProperty("Accept", "application/vnd.github+json");
            connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
            connection.setRequestProperty("User-Agent", "Campus-Inbox-Android/" + BuildConfig.VERSION_NAME);
            String etag = preferences.getString("etag", "");
            if (cachedMetadata() != null && !etag.isEmpty() && etag.length() <= 200 && !etag.contains("\r") && !etag.contains("\n")) connection.setRequestProperty("If-None-Match", etag);
            int status = connection.getResponseCode();
            if (status == HttpURLConnection.HTTP_NOT_MODIFIED) {
                Release cached = cachedMetadata();
                if (cached == null) throw new IOException("Missing release cache");
                preferences.edit().putLong("lastSuccess", System.currentTimeMillis()).apply();
                return cached;
            }
            if (status != HttpURLConnection.HTTP_OK) throw new IOException("Release check unavailable");
            if (connection.getContentLengthLong() > NativeUpdatePolicy.MAX_RESPONSE_BYTES) throw new IOException("Release response too large");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[8192];
                int count;
                while ((count = input.read(chunk)) != -1) {
                    if (bytes.size() + count > NativeUpdatePolicy.MAX_RESPONSE_BYTES) throw new IOException("Release response too large");
                    bytes.write(chunk, 0, count);
                }
                JSONObject body = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
                Release release = parseRelease(body);
                if (release == null) throw new IOException("No verified Android release");
                SharedPreferences.Editor editor = preferences.edit();
                editor.putString("version", release.version).putString("download", release.download)
                        .putLong("lastSuccess", System.currentTimeMillis());
                String nextEtag = connection.getHeaderField("ETag");
                if (nextEtag != null && nextEtag.length() <= 200 && !nextEtag.contains("\r") && !nextEtag.contains("\n")) editor.putString("etag", nextEtag);
                else editor.remove("etag");
                editor.apply();
                return release;
            } catch (org.json.JSONException ignored) { throw new IOException("Invalid release metadata"); }
        } finally { connection.disconnect(); }
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
            if (NativeUpdatePolicy.verifiedDownload(download, version)) return new Release(version, download);
        }
        return null;
    }

    void close() { network.shutdownNow(); }
}
