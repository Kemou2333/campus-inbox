package io.github.kemou2333.campusinbox;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.widget.RemoteViews;
import java.util.LinkedHashMap;
import java.util.Map;

/** Event-driven home widget: local cache only, with no scheduled work or network. */
public final class HomeWidgetProvider extends AppWidgetProvider {
    static final String OPEN = "io.github.kemou2333.campusinbox.OPEN_WIDGET";
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) update(context, manager, id, manager.getAppWidgetOptions(id));
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        update(context, manager, id, options);
    }
    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (int id : manager.getAppWidgetIds(new ComponentName(context, HomeWidgetProvider.class)))
            update(context, manager, id, manager.getAppWidgetOptions(id));
    }
    private static void update(Context context, AppWidgetManager manager, int id, Bundle options) {
        WidgetSnapshot state = NativeHomeWidget.read(context);
        if (Build.VERSION.SDK_INT >= 31) {
            Map<SizeF, RemoteViews> sizes = new LinkedHashMap<>();
            sizes.put(new SizeF(160, 128), render(context, id, state, false));
            sizes.put(new SizeF(280, 128), render(context, id, state, true));
            manager.updateAppWidget(id, new RemoteViews(sizes));
        } else manager.updateAppWidget(id, render(context, id, state,
                options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 160) >= 280));
    }
    private static RemoteViews render(Context context, int id, WidgetSnapshot state, boolean wide) {
        boolean large = context.getResources().getConfiguration().fontScale > 1.3f;
        RemoteViews views = new RemoteViews(context.getPackageName(), large ? R.layout.home_widget_large
                : wide ? R.layout.home_widget_wide : R.layout.home_widget);
        String count = !state.available ? "—" : state.count > 99 ? "99+" : Integer.toString(state.count);
        String label = context.getString(!state.available ? R.string.widget_unknown : state.count == 0 ? R.string.widget_clear : R.string.widget_pending);
        String title = context.getString(!state.available ? R.string.widget_start : state.count == 0 ? R.string.widget_calm : R.string.widget_encourage);
        if (state.available && state.count > 0 && !state.title.isEmpty()) title = state.title;
        views.setTextViewText(R.id.widget_count, count);
        views.setTextViewText(R.id.widget_label, label);
        views.setTextViewText(R.id.widget_title, title);
        String description = !state.available ? context.getString(R.string.widget_start)
                : context.getString(R.string.widget_accessible_count, state.count) + "，" + title;
        views.setContentDescription(android.R.id.background, context.getString(R.string.app_name) + "，" + description + "，" + context.getString(R.string.widget_open));
        Intent open = new Intent(context, MainActivity.class).setAction(OPEN)
                .setData(android.net.Uri.parse("campus-inbox-widget://open/" + id))
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (state.available && state.count > 0) open.putExtra("campusNoticeId", state.noticeId);
        PendingIntent pending = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(android.R.id.background, pending);
        return views;
    }
}
