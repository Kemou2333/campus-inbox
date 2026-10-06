package io.github.kemou2333.campusinbox;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra("campusReminderId");
        if (NativePolicy.validReminderId(id)) new NativeReminders(context).deliver(id);
    }
}
