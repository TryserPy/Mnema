package app.mnema.study;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * Виджет на рабочем столе: сколько карточек на сегодня, домашка на завтра и кнопка «Повторить 5».
 * Числа приложение заранее считает на неделю вперёд (Bridge.setWidget) — виджет только выбирает сегодняшние,
 * поэтому он верен, даже если Мнему несколько дней не открывали.
 */
public class MnemaWidget extends AppWidgetProvider {
    static final String PREFS = "mnema_widget";
    static final int FLAG_IMMUTABLE = 67108864; // PendingIntent.FLAG_IMMUTABLE (API 23)

    static void save(Context ctx, String json) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("state", json).apply();
        refresh(ctx);
    }

    static void refresh(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] ids = m.getAppWidgetIds(new ComponentName(ctx, MnemaWidget.class));
        if (ids.length > 0) update(ctx, m, ids);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        update(ctx, m, ids);
    }

    private static PendingIntent open(Context ctx, String what, int code) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.putExtra("open", what);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | FLAG_IMMUTABLE);
    }

    private static String cardsWord(int n) {
        int a = n % 10, b = n % 100;
        if (a == 1 && b != 11) return "карточка";
        if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return "карточки";
        return "карточек";
    }

    static void update(Context ctx, AppWidgetManager m, int[] ids) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = p.getString("state", null);
        int count = -1;
        String hw = "Открой Мнему — здесь появятся карточки и домашка";
        String streak = "";
        try {
            if (raw != null) {
                JSONObject st = new JSONObject(raw);
                Calendar c = Calendar.getInstance();
                int startHour = st.optInt("dayStartHour", 4);
                if (c.get(Calendar.HOUR_OF_DAY) < startHour) c.add(Calendar.DAY_OF_MONTH, -1);
                SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
                String today = f.format(c.getTime());
                c.add(Calendar.DAY_OF_MONTH, 1);
                String tomorrow = f.format(c.getTime());
                JSONArray days = st.optJSONArray("days");
                if (days != null)
                    for (int i = 0; i < days.length(); i++) {
                        JSONObject d = days.getJSONObject(i);
                        if (today.equals(d.optString("date"))) count = d.optInt("cards", 0);
                    }
                JSONArray list = st.optJSONArray("hw");
                StringBuilder sb = new StringBuilder();
                int n = 0;
                int late = 0;
                if (list != null)
                    for (int i = 0; i < list.length(); i++) {
                        JSONObject h = list.getJSONObject(i);
                        String due = h.optString("due", "");
                        if (!due.isEmpty() && due.compareTo(today) < 0) late++;
                        if (!tomorrow.equals(due)) continue;
                        if (n < 3) {
                            if (sb.length() > 0) sb.append("\n");
                            String s = h.optString("subject", "");
                            sb.append("• ").append(s.isEmpty() ? "" : s + ": ").append(h.optString("text", ""));
                        }
                        n++;
                    }
                if (n > 0) hw = "Домашка на завтра:\n" + sb;
                else hw = "Домашки на завтра нет";
                if (late > 0) hw = hw + "\nПросрочено: " + late;
                int s = st.optInt("streak", 0);
                if (s > 0) streak = "🔥 " + s;
            }
        } catch (Exception ignored) {
            // повреждённые данные — показываем заглушку
        }
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget);
            v.setTextViewText(R.id.w_count, count < 0 ? "—" : String.valueOf(count));
            v.setTextViewText(R.id.w_count_label, count == 0 ? "всё повторено ✓" : count < 0 ? "карточек на сегодня" : cardsWord(count) + " на сегодня");
            v.setTextViewText(R.id.w_hw, hw);
            v.setTextViewText(R.id.w_streak, streak);
            v.setTextViewText(R.id.w_btn, count == 0 ? "Открыть Мнему" : "▶  Повторить 5 карточек");
            v.setOnClickPendingIntent(R.id.w_root, open(ctx, "today", 41));
            v.setOnClickPendingIntent(R.id.w_hw, open(ctx, "homework", 42));
            v.setOnClickPendingIntent(R.id.w_btn, open(ctx, count == 0 ? "today" : "mini", 43));
            m.updateAppWidget(id, v);
        }
    }
}
