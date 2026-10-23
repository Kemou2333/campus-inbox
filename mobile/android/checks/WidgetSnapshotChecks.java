package io.github.kemou2333.campusinbox;
/** Pure Java privacy/size checks, separate from the existing native host suite. */
public final class WidgetSnapshotChecks {
    public static void main(String[] args) {
        WidgetSnapshot empty = WidgetSnapshot.unknown();
        require(!empty.available && empty.title.isEmpty() && empty.noticeId.isEmpty());
        WidgetSnapshot zero = WidgetSnapshot.ready(0, "old private title", "old-id");
        require(zero.available && zero.title.isEmpty() && zero.noticeId.isEmpty());
        WidgetSnapshot clean = WidgetSnapshot.ready(3, "标题\n\u202e  合并", "notice-1");
        require(clean.count == 3 && clean.title.equals("标题 合并"));
        WidgetSnapshot emoji = WidgetSnapshot.ready(1, "😀".repeat(90), "notice-1");
        require(emoji.title.codePointCount(0, emoji.title.length()) == 80 && emoji.title.endsWith("😀"));
        bad(() -> WidgetSnapshot.ready(-1, "", "id"));
        bad(() -> WidgetSnapshot.ready(10000, "", "id"));
        bad(() -> WidgetSnapshot.ready(1, "正文".repeat(200), "id"));
        bad(() -> WidgetSnapshot.ready(1, "标题", "../../secret"));
        bad(() -> WidgetSnapshot.ready(1, null, "id"));
        System.out.println("Widget snapshot privacy checks passed: 9");
    }
    private static void require(boolean value) { if (!value) throw new AssertionError("Widget snapshot boundary"); }
    private static void bad(Runnable operation) {
        try { operation.run(); } catch (IllegalArgumentException expected) { return; }
        throw new AssertionError("Invalid widget snapshot accepted");
    }
}
