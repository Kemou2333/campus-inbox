package io.github.kemou2333.campusinbox;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicInteger;

/** Run with JDK 17; does not require an emulator, an API key or Android dependencies. */
public final class NativeHostChecks {
    private static final AtomicInteger checks = new AtomicInteger();

    public static void main(String[] args) throws Exception {
        check(NativePolicy.isTrustedOrigin(NativePolicy.ORIGIN), "exact local origin allowed");
        check(NativePolicy.isTrustedOrigin(NativePolicy.ORIGIN + ":443"), "default TLS port allowed");
        check(!NativePolicy.isTrustedOrigin("https://appassets.androidplatform.net.evil.test"), "suffix origin denied");
        check(!NativePolicy.isTrustedOrigin("http://appassets.androidplatform.net"), "cleartext origin denied");
        check(!NativePolicy.isTrustedOrigin("https://user@appassets.androidplatform.net"), "origin user info denied");
        check(!NativePolicy.isTrustedOrigin(NativePolicy.ORIGIN + ":444"), "non-default port denied");
        check(NativePolicy.isTrustedPage(NativePolicy.HOME + "?font=square#card"), "known local entry accepted");
        check(!NativePolicy.isTrustedPage(NativePolicy.ORIGIN + "/assets/web/other.html"), "other pages cannot receive bridge");
        check(!NativePolicy.isTrustedPage(NativePolicy.ORIGIN + "/assets/web/%69ndex.html"), "encoded entry alias denied");
        check(!NativePolicy.isExternalLink("javascript:alert(1)"), "script links denied");
        check(!NativePolicy.isExternalLink("intent://evil/#Intent;scheme=https;end"), "intent links denied");
        check(!NativePolicy.isExternalLink("file:///data/user/0/private"), "private file links denied");
        check(NativePolicy.isExternalLink("https://jwc.cqu.edu.cn/info/1080/6186.htm"), "official source opens externally");
        long updateNow = 1_800_000_000_000L;
        check(NativeUpdatePolicy.checkDue(updateNow, 0), "first public release check is due");
        check(NativeUpdatePolicy.checkDue(updateNow, updateNow - 60_000), "each foreground entry checks again even within the same day");
        check(!NativeUpdatePolicy.checkDue(updateNow, updateNow - 4_999), "brief duplicate foreground callbacks are coalesced");
        check(NativeUpdatePolicy.checkDue(updateNow, updateNow - NativeUpdatePolicy.CHECK_DEBOUNCE), "entry check unlocks at the short debounce boundary");
        check(!NativeUpdatePolicy.checkDue(updateNow, updateNow + 1_000), "minor clock rollback cannot cause repeated checks");
        check(NativeUpdatePolicy.checkDue(updateNow, updateNow + NativeUpdatePolicy.CHECK_DEBOUNCE + 1), "large clock correction does not block updates forever");
        check(NativeUpdatePolicy.manualCheckDue(updateNow, 0), "first manual check is allowed");
        check(!NativeUpdatePolicy.manualCheckDue(updateNow, updateNow - 29_999), "manual repeated clicks are throttled");
        check(NativeUpdatePolicy.manualCheckDue(updateNow, updateNow - 30_000), "manual check unlocks after 30 seconds");
        check(!NativeUpdatePolicy.manualCheckDue(updateNow, updateNow + 5_000), "minor clock rollback cannot bypass manual throttle");
        check(NativeUpdatePolicy.manualCheckDue(updateNow, updateNow + 30_001), "large clock rollback does not block manual checks forever");
        check("2.16.0".equals(NativeUpdatePolicy.releaseVersion("android-v2.16.0")), "fixed Android release tag accepted");
        check(NativeUpdatePolicy.releaseVersion("android-v2.16.0-beta") == null, "preview releases rejected");
        check(NativeUpdatePolicy.releaseVersion("v2.16.0") == null, "other release channels rejected");
        check(NativeUpdatePolicy.newer("2.16.0", "2.15.2"), "new stable version offered");
        check(NativeUpdatePolicy.newer("2.15.10", "2.15.9"), "version comparison is numeric");
        check(!NativeUpdatePolicy.newer("2.15.2", "2.15.2"), "installed version is not offered");
        check(!NativeUpdatePolicy.newer("2.14.0", "2.15.2"), "downgrade is not offered");
        check(!NativeUpdatePolicy.newer("999999999999.0.0", "2.15.2"), "oversized version rejected safely");
        String download = "https://github.com/Kemou2333/campus-inbox/releases/download/android-v2.16.0/campus-inbox-2.16.0.apk";
        check(NativeUpdatePolicy.verifiedDownload(download, "2.16.0"), "exact repository APK URL accepted");
        check(!NativeUpdatePolicy.verifiedDownload(download.replace("https:", "http:"), "2.16.0"), "cleartext update URL rejected");
        check(!NativeUpdatePolicy.verifiedDownload(download.replace("github.com", "github.com.evil.test"), "2.16.0"), "lookalike update host rejected");
        check(!NativeUpdatePolicy.verifiedDownload(download.replace("github.com/", "github.com:444/"), "2.16.0"), "alternate update port rejected");
        check(!NativeUpdatePolicy.verifiedDownload(download.replace("Kemou2333/", "other/"), "2.16.0"), "other repository update rejected");
        check(!NativeUpdatePolicy.verifiedDownload(download, "2.17.0"), "asset version must match release version");
        check(!NativeUpdatePolicy.verifiedDownload(download + "?redirect=evil", "2.16.0"), "update query redirects rejected");
        check(!NativeUpdatePolicy.verifiedDownload(download.replace("https://", "https://user@"), "2.16.0"), "update userinfo rejected");
        check(!NativeUpdatePolicy.verifiedDownload(download.replace(".apk", "%2eapk"), "2.16.0"), "encoded update path alias rejected");
        String aliyun = "https://123.57.30.129/downloads/android-v2.16.0/campus-inbox-2.16.0.apk";
        check(NativeUpdatePolicy.verifiedAliyunDownload(aliyun, "2.16.0"), "exact Aliyun release asset accepted");
        check(aliyun.equals(NativeUpdatePolicy.preferredDownload("2.16.0", download, aliyun)), "verified Aliyun asset is primary with matching GitHub backup");
        check(download.equals(NativeUpdatePolicy.preferredDownload("2.16.0", download, null)), "absent Aliyun leaves GitHub usable");
        check(NativeUpdatePolicy.preferredDownload("2.16.0", "", aliyun) == null, "Aliyun alone cannot bypass mandatory GitHub validation");
        check(NativeUpdatePolicy.preferredDownload("2.17.0", download, aliyun) == null, "manifest channels must agree with its version");
        check(NativeUpdatePolicy.preferredDownload("2.16.0", download, "https://example.com/app.apk") == null, "invalid optional channel invalidates the manifest");
        check(!NativeUpdatePolicy.verifiedAliyunDownload(aliyun, "2.17.0"), "Aliyun path must match release version");
        check(!NativeUpdatePolicy.verifiedAliyunDownload(aliyun.replace("https:", "http:"), "2.16.0"), "Aliyun cleartext URL rejected");
        check(!NativeUpdatePolicy.verifiedAliyunDownload(aliyun.replace("123.57.30.129", "123.57.30.129.evil.test"), "2.16.0"), "Aliyun lookalike host rejected");
        check(!NativeUpdatePolicy.verifiedAliyunDownload(aliyun.replace("https://", "https://user@"), "2.16.0"), "Aliyun userinfo rejected");
        check(!NativeUpdatePolicy.verifiedAliyunDownload(aliyun.replace("123.57.30.129", "123.57.30.129:443"), "2.16.0"), "Aliyun explicit port alias rejected");
        check(!NativeUpdatePolicy.verifiedAliyunDownload(aliyun.replace("123.57.30.129", "123.57.30.129:444"), "2.16.0"), "Aliyun alternate port rejected");
        check(!NativeUpdatePolicy.verifiedAliyunDownload(aliyun.replace(".apk", "%2eapk"), "2.16.0"), "Aliyun encoded filename alias rejected");
        check(!NativeUpdatePolicy.verifiedAliyunDownload(aliyun.replace("/downloads/", "/downloads/../downloads/"), "2.16.0"), "Aliyun dot segment alias rejected");
        check(!NativeUpdatePolicy.verifiedAliyunDownload(aliyun + "?key=not-accepted", "2.16.0"), "Aliyun query rejected");
        check(!NativeUpdatePolicy.verifiedAliyunDownload(aliyun + "#download", "2.16.0"), "Aliyun fragment rejected");
        check(!NativeUpdatePolicy.verifiedAliyunDownload(aliyun + "/", "2.16.0"), "Aliyun trailing path rejected");
        check(!NativeUpdatePolicy.verifiedAliyunDownload(null, "2.16.0"), "null Aliyun link is not independently accepted");
        check(!NativePolicy.fileName("../../folder/secret.json").contains("/"), "save names do not supply paths");
        check("application/octet-stream".equals(NativePolicy.mime("application/json\nInjected: header")), "bad MIME normalized");
        check(NativePolicy.validCalendar(1_800_000_000_000L, 1_800_003_600_000L), "explicit calendar range accepted");
        check(!NativePolicy.validCalendar(0, 100), "missing calendar time rejected");
        check(!NativePolicy.validCalendar(1_800_000_000_000L, 1), "reversed calendar time rejected");
        check(!NativePolicy.validCalendar(5_000_000_000_000L, 5_000_003_600_000L), "out of range calendar time rejected");
        check(NativePolicy.validReminder("notice-v5:1", 1_800_000_060_000L, 1_800_000_000_000L), "future reminder accepted");
        check(!NativePolicy.validReminder("notice-v5:1", 1_800_000_000_000L, 1_800_000_000_000L), "past reminder rejected");
        check(!NativePolicy.validReminder("../secret", 1_800_000_060_000L, 1_800_000_000_000L), "unsafe reminder id rejected");
        String taskAlarm = "n".repeat(150) + "::task::" + "t".repeat(150);
        check(NativePolicy.validReminderId(taskAlarm), "longest saved task alarm identity accepted");
        check(!NativePolicy.validReminderId("n".repeat(321)), "alarm identity upper limit enforced");
        check("notice-a".equals(NativePolicy.reminderNoticeId("notice-a", "")), "legacy alarm opens its original notice");
        check("notice-a".equals(NativePolicy.reminderNoticeId("notice-a::task::task-a", "notice-a")), "child alarm opens its parent notice");
        check(NativePolicy.reminderBelongsTo("notice-a::task::task-a", "notice-a", "notice-a"), "parent cancellation includes its task alarm");
        check(!NativePolicy.reminderBelongsTo("notice-a::task::task-b", "notice-a", "notice-a::task::task-a"), "task cancellation keeps sibling alarm");
        check(!NativePolicy.reminderBelongsTo("notice-ab::task::task-a", "notice-ab", "notice-a"), "parent cancellation never uses an ambiguous prefix");
        check(NativePolicy.validStoredReminder("notice-a", "notice-a", 1_800_000_000_000L), "known past record can be inspected without guessing an owner");
        check(!NativePolicy.validStoredReminder("notice-a", "other", 1_800_000_000_000L), "foreign or unknown record is preserved rather than acted upon");
        fails(() -> NativePolicy.decodeChunk("not base64!"), "invalid chunk rejected");
        fails(() -> NativePolicy.decodeChunk("A".repeat(NativePolicy.MAX_CHUNK_CHARS + 4)), "oversized chunk rejected");

        File cache = Files.createTempDirectory("campus-native-host-check-").toFile();
        NativeExport exports = new NativeExport(cache);
        byte[] content = "校园通知\n原始内容、日期和附件".getBytes(StandardCharsets.UTF_8);
        NativeExport.Session active = exports.begin("通知备份.json", "application/json", content.length);
        fails(() -> exports.begin("second.json", "application/json", 1), "one export at a time");
        fails(() -> exports.append("wrong-token", "AAAA"), "unknown session rejected");
        fails(() -> exports.seal(active.token), "incomplete export cannot be saved");
        check(exports.append(active.token, Base64.getEncoder().encodeToString(content)) == content.length, "bytes counted once");
        fails(() -> exports.append(active.token, "AAAA"), "oversized export rejected");
        exports.seal(active.token);
        fails(() -> exports.append(active.token, ""), "sealed export cannot be modified");
        fails(() -> exports.seal(active.token), "save picker cannot be replayed");
        ByteArrayOutputStream copied = new ByteArrayOutputStream();
        exports.copyTo(active.token, copied);
        check(java.util.Arrays.equals(content, copied.toByteArray()), "saved UTF-8 data unchanged");
        exports.cancel(active.token);
        check(!active.file.exists(), "temporary export deleted on cancel");
        fails(() -> exports.append(active.token, "AAAA"), "consumed token cannot be reused");
        fails(() -> exports.begin("huge.json", "application/json", NativePolicy.MAX_EXPORT_BYTES + 1), "large export rejected before writing");
        NativeExport.Session empty = exports.begin("empty.txt", "text/plain", 0);
        exports.seal(empty.token);
        exports.copyTo(empty.token, new ByteArrayOutputStream());
        exports.clear();
        check(!empty.file.exists(), "empty export supported and cleaned");
        new File(cache, "campus-exports").delete();
        cache.delete();
        System.out.println("Native host free checks passed: " + checks.get());
    }

    private static void check(boolean value, String name) {
        if (!value) throw new AssertionError(name);
        checks.incrementAndGet();
    }

    private static void fails(Attempt action, String name) throws Exception {
        try { action.run(); }
        catch (IllegalArgumentException | IllegalStateException expected) { checks.incrementAndGet(); return; }
        throw new AssertionError(name);
    }

    private interface Attempt { void run() throws Exception; }
}
