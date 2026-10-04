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
        check(!NativePolicy.fileName("../../folder/secret.json").contains("/"), "save names do not supply paths");
        check("application/octet-stream".equals(NativePolicy.mime("application/json\nInjected: header")), "bad MIME normalized");
        check(NativePolicy.validCalendar(1_800_000_000_000L, 1_800_003_600_000L), "explicit calendar range accepted");
        check(!NativePolicy.validCalendar(0, 100), "missing calendar time rejected");
        check(!NativePolicy.validCalendar(1_800_000_000_000L, 1), "reversed calendar time rejected");
        check(!NativePolicy.validCalendar(5_000_000_000_000L, 5_000_003_600_000L), "out of range calendar time rejected");
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
