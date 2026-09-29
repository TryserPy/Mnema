package app.mnema.study;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/** Напоминания: домашние задания и «пора повторить». Будильник → уведомление, даже если Мнема закрыта. */
public class Reminders extends BroadcastReceiver {
    static final String PREFS = "mnema-reminders";
    static final String CHANNEL = "mnema";
    static final int FLAG_IMMUTABLE = 67108864; // PendingIntent.FLAG_IMMUTABLE (Android 12+)

    static int code(String id) {
        return id.hashCode() & 0x7fffffff;
    }

    /** Сохранить новый список и переставить будильники. */
    static void set(Context ctx, String json) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("list", json).apply();
        scheduleAll(ctx);
    }

    static void scheduleAll(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        // старые будильники — снять
        try {
            JSONArray old = new JSONArray(p.getString("ids", "[]"));
            for (int i = 0; i < old.length(); i++) {
                PendingIntent pi = PendingIntent.getBroadcast(ctx, old.getInt(i), new Intent(ctx, Reminders.class), PendingIntent.FLAG_UPDATE_CURRENT | FLAG_IMMUTABLE);
                am.cancel(pi);
            }
        } catch (Exception ignored) {
        }
        JSONArray ids = new JSONArray();
        try {
            JSONArray list = new JSONArray(p.getString("list", "[]"));
            long now = System.currentTimeMillis();
            for (int i = 0; i < list.length() && i < 200; i++) {
                JSONObject r = list.getJSONObject(i);
                long at = r.getLong("at");
                if (at < now - 60000) continue;
                String id = r.getString("id");
                int c = code(id);
                Intent it = new Intent(ctx, Reminders.class);
                it.putExtra("id", id);
                it.putExtra("title", r.optString("title"));
                it.putExtra("body", r.optString("body"));
                it.putExtra("open", r.optString("open", "homework"));
                PendingIntent pi = PendingIntent.getBroadcast(ctx, c, it, PendingIntent.FLAG_UPDATE_CURRENT | FLAG_IMMUTABLE);
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, Math.max(at, now + 1000), pi);
                ids.put(c);
            }
        } catch (Exception ignored) {
        }
        p.edit().putString("ids", ids.toString()).apply();
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || "android.intent.action.MY_PACKAGE_REPLACED".equals(action)) {
            scheduleAll(ctx);
            if ("android.intent.action.MY_PACKAGE_REPLACED".equals(action)) {
                // После обновления Android закрывает Мнему — скажем, что всё готово, и дадим открыть одним нажатием.
                String v = "";
                try {
                    v = " " + ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
                } catch (Exception ignored) {
                }
                show(ctx, 7302, "Мнема обновлена" + v, "Нажми, чтобы открыть. Все карточки и настройки на месте.", "today");
            }
            return;
        }
        String id = intent.getStringExtra("id");
        if (id == null) return;
        show(ctx, code(id), intent.getStringExtra("title"), intent.getStringExtra("body"), intent.getStringExtra("open"));
    }

    static void show(Context ctx, int code, String title, String body, String open) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder b;
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                Class<?> ch = Class.forName("android.app.NotificationChannel");
                Object channel = ch.getConstructor(String.class, CharSequence.class, int.class).newInstance(CHANNEL, "Напоминания", 3);
                NotificationManager.class.getMethod("createNotificationChannel", ch).invoke(nm, channel);
                b = Notification.Builder.class.getConstructor(Context.class, String.class).newInstance(ctx, CHANNEL);
            } else {
                b = new Notification.Builder(ctx);
                b.setDefaults(Notification.DEFAULT_ALL);
            }
        } catch (Exception e) {
            b = new Notification.Builder(ctx);
        }
        Intent it = new Intent(ctx, AppActivity.class);
        it.putExtra("open", open == null ? "homework" : open);
        it.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, code, it, PendingIntent.FLAG_UPDATE_CURRENT | FLAG_IMMUTABLE);
        b.setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(title == null ? "Мнема" : title)
                .setContentText(body == null ? "" : body)
                .setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body))
                .setColor(0xFF3F51D8)
                .setAutoCancel(true)
                .setContentIntent(pi);
        try {
            nm.notify(code, b.build());
        } catch (SecurityException ignored) {
            // нет разрешения на уведомления
        }
    }
}
