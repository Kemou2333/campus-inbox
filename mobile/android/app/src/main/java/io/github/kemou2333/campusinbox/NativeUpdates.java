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

/** One best-effort public metadata request per day, with no installer or background service. */
final class NativeUpdates {
    static final class Release {
        final String version;
        final String download;
        Release(String version, String download) { this.version = version; this.download = download; }
    }

    private final SharedPreferences preferences;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private volatile boolean checking;

    NativeUpdates(Context context) {
        preferences = context.getApplicationContext().getSharedPreferences("release-check", Context.MODE_PRIVATE);
    }

    void checkWhenDue(Consumer<Release> available) {
        Release cached = cachedRelease();
        if (cached != null) available.accept(cached);
        if (checking || !NativeUpdatePolicy.checkDue(System.currentTimeMillis(), preferences.getLong("lastAttempt", 0))) return;
        checking = true;
        // Persist before starting: offline failures and Activity recreation must also be throttled.
        preferences.edit().putLong("lastAttempt", System.currentTimeMillis()).apply();
        network.execute(() -> {
            try {
                Release release = fetch();
                if (release != null) available.accept(release);
            } catch (IOException | RuntimeException ignored) {
                // Checking for an optional update must never interrupt the app or leak request data.
            } finally { checking = false; }
        });
    }

    boolean shouldPrompt(Release release) {
        return NativeUpdatePolicy.newer(release.version, BuildConfig.VERSION_NAME)
                && NativeUpdatePolicy.verifiedDownload(release.download, release.version)
                && (!release.version.equals(preferences.getString("promptVersion", ""))
                || NativeUpdatePolicy.checkDue(System.currentTimeMillis(), preferences.getLong("promptTime", 0)));
    }

    void markPrompted(Release release) {
        preferences.edit().putString("promptVersion", release.version).putLong("promptTime", System.currentTimeMillis()).apply();
    }

    private Release cachedRelease() {
        String version = preferences.getString("version", ""), download = preferences.getString("download", "");
        return NativeUpdatePolicy.newer(version, BuildConfig.VERSION_NAME)
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
            if (!etag.isEmpty() && etag.length() <= 200 && !etag.contains("\r") && !etag.contains("\n")) connection.setRequestProperty("If-None-Match", etag);
            int status = connection.getResponseCode();
            if (status == HttpURLConnection.HTTP_NOT_MODIFIED) return cachedRelease();
            if (status != HttpURLConnection.HTTP_OK) return null;
            if (connection.getContentLengthLong() > NativeUpdatePolicy.MAX_RESPONSE_BYTES) return null;
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[8192];
                int count;
                while ((count = input.read(chunk)) != -1) {
                    if (bytes.size() + count > NativeUpdatePolicy.MAX_RESPONSE_BYTES) throw new IOException("Release response too large");
                    bytes.write(chunk, 0, count);
                }
                JSONObject body = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
                Release release = parseRelease(body);
                SharedPreferences.Editor editor = preferences.edit();
                if (release == null) editor.remove("version").remove("download");
                else editor.putString("version", release.version).putString("download", release.download);
                String nextEtag = connection.getHeaderField("ETag");
                if (nextEtag != null && nextEtag.length() <= 200 && !nextEtag.contains("\r") && !nextEtag.contains("\n")) editor.putString("etag", nextEtag);
                else editor.remove("etag");
                editor.apply();
                return release;
            } catch (org.json.JSONException ignored) { return null; }
        } finally { connection.disconnect(); }
    }

    private Release parseRelease(JSONObject body) {
        if (body.optBoolean("draft", true) || body.optBoolean("prerelease", true)) return null;
        String version = NativeUpdatePolicy.releaseVersion(body.optString("tag_name"));
        if (version == null || !NativeUpdatePolicy.newer(version, BuildConfig.VERSION_NAME)) return null;
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
