package io.github.kemou2333.campusinbox;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;

/** A separate small native cache; never reads or rewrites the WebView notification database. */
final class NativeHomeWidget {
    private static SharedPreferences store(Context context) {
        return context.getApplicationContext().getSharedPreferences("home-widget", Context.MODE_PRIVATE);
    }
    static void accept(Context context, JSONObject payload) {
        if (!(payload.opt("available") instanceof Boolean)) throw new IllegalArgumentException("Invalid widget state");
        WidgetSnapshot next = WidgetSnapshot.unknown();
        if (payload.optBoolean("available")) {
            Object raw = payload.opt("pendingCount");
            if (!(raw instanceof Number) || ((Number) raw).doubleValue() != ((Number) raw).intValue())
                throw new IllegalArgumentException("Invalid widget count");
            int count = ((Number) raw).intValue();
            if (count > 0 && (!(payload.opt("title") instanceof String) || !(payload.opt("noticeId") instanceof String)))
                throw new IllegalArgumentException("Invalid widget summary");
            next = WidgetSnapshot.ready(count, payload.optString("title", ""), payload.optString("noticeId", ""));
        }
        SharedPreferences prefs = store(context);
        WidgetSnapshot old = read(context);
        if (old.available == next.available && old.count == next.count && old.title.equals(next.title) && old.noticeId.equals(next.noticeId)) return;
        // Clearing the widget never clears personal notices or account state.
        SharedPreferences.Editor edit = prefs.edit().clear();
        if (next.available) edit.putBoolean("available", true).putInt("count", next.count)
                .putString("title", next.title).putString("noticeId", next.noticeId);
        edit.apply();
        HomeWidgetProvider.updateAll(context);
    }
    static WidgetSnapshot read(Context context) {
        try {
            SharedPreferences prefs = store(context);
            return prefs.getBoolean("available", false)
                    ? WidgetSnapshot.ready(prefs.getInt("count", 0), prefs.getString("title", ""), prefs.getString("noticeId", ""))
                    : WidgetSnapshot.unknown();
        } catch (RuntimeException ignored) { return WidgetSnapshot.unknown(); }
    }
}
