package io.github.kemou2333.campusinbox;

/** Minimal local presentation data. Never holds original text, account data or attachments. */
final class WidgetSnapshot {
    final boolean available;
    final int count;
    final String title;
    final String noticeId;

    private WidgetSnapshot(boolean available, int count, String title, String noticeId) {
        this.available = available; this.count = count; this.title = title; this.noticeId = noticeId;
    }
    static WidgetSnapshot unknown() { return new WidgetSnapshot(false, 0, "", ""); }
    static WidgetSnapshot ready(int count, String title, String id) {
        if (count < 0 || count > 9999) throw new IllegalArgumentException("Invalid widget count");
        if (count == 0) return new WidgetSnapshot(true, 0, "", "");
        if (title == null || title.length() > 256 || id == null || !NativePolicy.validNoticeId(id))
            throw new IllegalArgumentException("Invalid widget summary");
        String clean = title.replaceAll("[\\p{Cntrl}\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069]", " ")
                .replaceAll("\\s+", " ").trim();
        int end = clean.offsetByCodePoints(0, Math.min(80, clean.codePointCount(0, clean.length())));
        return new WidgetSnapshot(true, count, clean.substring(0, end), id);
    }
}
