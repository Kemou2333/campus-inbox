package io.github.kemou2333.campusinbox;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Map;
import java.util.ArrayList;

/** Small local reminders: no server, foreground service, exact-alarm or calendar permission. */
final class NativeReminders {
    private static final String CHANNEL = "campus-deadlines";
    private final Context context;
    private final SharedPreferences records;
    private final AlarmManager alarms;
    private final NotificationManager notifications;

    NativeReminders(Context context) {
        this.context = context.getApplicationContext();
        records = this.context.getSharedPreferences("campus-local-reminders", Context.MODE_PRIVATE);
        alarms = this.context.getSystemService(AlarmManager.class);
        notifications = this.context.getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "校园提醒", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("你在校园 Inbox 中主动设置的本地提醒");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        notifications.createNotificationChannel(channel);
    }

    boolean enabled() {
        NotificationChannel channel = notifications.getNotificationChannel(CHANNEL);
        return notifications.areNotificationsEnabled()
                && (channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE);
    }

    void schedule(String id, String noticeId, String title, String body, long triggerMillis) throws JSONException {
        if (!NativePolicy.validReminder(id, triggerMillis, System.currentTimeMillis())) {
            throw new IllegalArgumentException("请确认提醒对应的通知和未来时间");
        }
        String parent = NativePolicy.reminderNoticeId(id, noticeId);
        JSONObject record = new JSONObject().put("id", id).put("noticeId", parent).put("title", title)
                .put("body", body).put("triggerMillis", triggerMillis);
        String previous = records.getString(id, null);
        if (!records.edit().putString(id, record.toString()).commit()) {
            throw new IllegalStateException("提醒未能保存，请检查设备存储空间");
        }
        try { setAlarm(id, triggerMillis); }
        catch (RuntimeException error) {
            SharedPreferences.Editor edit = records.edit();
            if (previous == null) edit.remove(id); else edit.putString(id, previous);
            edit.commit();
            throw error;
        }
    }

    void cancel(String target) {
        ArrayList<String> ids = new ArrayList<>();
        for (Map.Entry<String, ?> item : records.getAll().entrySet()) {
            try {
                JSONObject record = new JSONObject((String) item.getValue());
                if (NativePolicy.validStoredReminder(item.getKey(), record.getString("id"), record.getLong("triggerMillis"))
                        && NativePolicy.reminderBelongsTo(item.getKey(), record.optString("noticeId", ""), target)) ids.add(item.getKey());
            } catch (JSONException | ClassCastException | IllegalArgumentException ignored) { /* Preserve unknown records. */ }
        }
        SharedPreferences.Editor edit = records.edit();
        for (String id : ids) edit.remove(id);
        if (!ids.isEmpty() && !edit.commit()) throw new IllegalStateException("提醒取消未能保存，请稍后重试");
        for (String id : ids) { alarms.cancel(alarmIntent(id)); notifications.cancel(id, 0); }
        // Old notice alarms and already-delivered child notifications still cancel exactly.
        alarms.cancel(alarmIntent(target));notifications.cancel(target, 0);
        for (StatusBarNotification active : notifications.getActiveNotifications()) {
            String parent = active.getNotification().extras.getString("campusNoticeId", "");
            if (target.equals(active.getTag()) || target.equals(parent)) notifications.cancel(active.getTag(), active.getId());
        }
    }

    void restoreAfterBoot() {
        long now = System.currentTimeMillis();
        for (Map.Entry<String, ?> item : records.getAll().entrySet()) {
            try {
                JSONObject record = new JSONObject((String) item.getValue());
                long trigger = record.getLong("triggerMillis");
                if (!NativePolicy.validStoredReminder(item.getKey(), record.getString("id"), trigger)) continue;
                NativePolicy.reminderNoticeId(item.getKey(), record.optString("noticeId", ""));
                if (trigger > now) setAlarm(item.getKey(), trigger);
                else if (now - trigger <= NativePolicy.MISSED_REMINDER_WINDOW) deliver(item.getKey());
                else records.edit().remove(item.getKey()).apply();
            } catch (JSONException | RuntimeException error) { /* Preserve unknown records and tolerate OS alarm limits. */ }
        }
    }

    void deliver(String id) {
        String stored = records.getString(id, null);
        if (stored == null) return;
        try {
            JSONObject record = new JSONObject(stored);
            long trigger = record.getLong("triggerMillis");
            if (!NativePolicy.validStoredReminder(id, record.getString("id"), trigger)) return;
            String parent = NativePolicy.reminderNoticeId(id, record.optString("noticeId", ""));
            long now = System.currentTimeMillis();
            // A previously queued broadcast must not fire a newly postponed reminder early.
            if (trigger > now) { setAlarm(id, trigger); return; }
            if (now - trigger > NativePolicy.MISSED_REMINDER_WINDOW) { records.edit().remove(id).apply(); return; }
            if (!enabled()) return;
            Intent open = new Intent(context, MainActivity.class)
                    .setAction(Intent.ACTION_VIEW)
                    .setData(Uri.parse("campusinbox://notice/" + Uri.encode(parent)))
                    .putExtra("campusNoticeId", parent)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent content = PendingIntent.getActivity(context, 0, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            String body = record.optString("body", "");
            Bundle extras = new Bundle();extras.putString("campusNoticeId", parent);
            Notification notification = new Notification.Builder(context, CHANNEL)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(record.getString("title"))
                    .setContentText(body.isEmpty() ? "打开通知，继续办理。" : body)
                    .setStyle(new Notification.BigTextStyle().bigText(body))
                    .setContentIntent(content).setAutoCancel(true)
                    .addExtras(extras)
                    .setVisibility(Notification.VISIBILITY_PRIVATE)
                    .build();
            notifications.notify(id, 0, notification);
            // Retain the record if permission was revoked between enabled() and notify().
            records.edit().remove(id).apply();
        } catch (JSONException | SecurityException | IllegalArgumentException ignored) {
            // Revoking notification permission must not crash an alarm receiver.
        }
    }

    private void setAlarm(String id, long triggerMillis) {
        // Android may batch or delay this alarm in power-saving modes.
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerMillis, alarmIntent(id));
    }

    private PendingIntent alarmIntent(String id) {
        Intent alarm = new Intent(context, ReminderReceiver.class)
                .setData(Uri.parse("campusinbox://reminder/" + Uri.encode(id)))
                .putExtra("campusReminderId", id);
        return PendingIntent.getBroadcast(context, 0, alarm,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
