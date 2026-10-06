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

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Map;

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
        NotificationChannel channel = new NotificationChannel(CHANNEL, "截止提醒", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("你在校园 Inbox 中主动设置的本地提醒");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        notifications.createNotificationChannel(channel);
    }

    boolean enabled() {
        NotificationChannel channel = notifications.getNotificationChannel(CHANNEL);
        return notifications.areNotificationsEnabled()
                && (channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE);
    }

    void schedule(String id, String title, String body, long triggerMillis) throws JSONException {
        if (!NativePolicy.validReminder(id, triggerMillis, System.currentTimeMillis())) {
            throw new IllegalArgumentException("请确认提醒对应的通知和未来时间");
        }
        JSONObject record = new JSONObject().put("id", id).put("title", title)
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

    void cancel(String id) {
        alarms.cancel(alarmIntent(id));
        records.edit().remove(id).apply();
        notifications.cancel(id, 0);
    }

    void restoreAfterBoot() {
        long now = System.currentTimeMillis();
        for (Map.Entry<String, ?> item : records.getAll().entrySet()) {
            try {
                JSONObject record = new JSONObject((String) item.getValue());
                long trigger = record.getLong("triggerMillis");
                if (NativePolicy.validReminder(item.getKey(), trigger, now)) setAlarm(item.getKey(), trigger);
                else records.edit().remove(item.getKey()).apply();
            } catch (JSONException | ClassCastException error) { records.edit().remove(item.getKey()).apply(); }
        }
    }

    void deliver(String id) {
        String stored = records.getString(id, null);
        if (stored == null) return;
        try {
            JSONObject record = new JSONObject(stored);
            long trigger = record.getLong("triggerMillis");
            // A previously queued broadcast must not fire a newly postponed reminder early.
            if (trigger > System.currentTimeMillis()) { setAlarm(id, trigger); return; }
            records.edit().remove(id).apply();
            if (!enabled()) return;
            Intent open = new Intent(context, MainActivity.class)
                    .setAction(Intent.ACTION_VIEW)
                    .setData(Uri.parse("campusinbox://notice/" + Uri.encode(id)))
                    .putExtra("campusNoticeId", id)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent content = PendingIntent.getActivity(context, 0, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            String body = record.optString("body", "");
            Notification notification = new Notification.Builder(context, CHANNEL)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(record.getString("title"))
                    .setContentText(body.isEmpty() ? "打开通知，继续办理。" : body)
                    .setStyle(new Notification.BigTextStyle().bigText(body))
                    .setContentIntent(content).setAutoCancel(true)
                    .setVisibility(Notification.VISIBILITY_PRIVATE)
                    .build();
            notifications.notify(id, 0, notification);
        } catch (JSONException | SecurityException ignored) {
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
