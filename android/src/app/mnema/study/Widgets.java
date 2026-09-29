package app.mnema.study;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * Дополнительные виджеты Мнемы: «Повторить» (маленький), «Домашка», «Уроки».
 * Данные те же, что у главного виджета: приложение заранее кладёт их в MnemaWidget.PREFS (Bridge.setWidget).
 */
public class Widgets {
    /** Сегодня/завтра с учётом «новый день начинается в N часов» и сохранённые данные. */
    static class Day {
        JSONObject st;
        String today;
        String tomorrow;
        Calendar cal;

        Day(Context ctx) {
            String raw = ctx.getSharedPreferences(MnemaWidget.PREFS, Context.MODE_PRIVATE).getString("state", null);
            try {
                st = raw == null ? null : new JSONObject(raw);
            } catch (Exception e) {
                st = null;
            }
            cal = Calendar.getInstance();
            int startHour = st == null ? 4 : st.optInt("dayStartHour", 4);
            if (cal.get(Calendar.HOUR_OF_DAY) < startHour) cal.add(Calendar.DAY_OF_MONTH, -1);
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            today = f.format(cal.getTime());
            Calendar c2 = (Calendar) cal.clone();
            c2.add(Calendar.DAY_OF_MONTH, 1);
            tomorrow = f.format(c2.getTime());
        }

        int cardsToday() {
            if (st == null) return -1;
            JSONArray days = st.optJSONArray("days");
            if (days != null)
                for (int i = 0; i < days.length(); i++) {
                    JSONObject d = days.optJSONObject(i);
                    if (d != null && today.equals(d.optString("date"))) return d.optInt("cards", 0);
                }
            return -1;
        }
    }

    static PendingIntent open(Context ctx, String what, int code) {
        Intent i = new Intent(ctx, AppActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.putExtra("open", what);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | MnemaWidget.FLAG_IMMUTABLE);
    }

    static int parseColor(String c, int fallback) {
        try {
            return c == null || c.isEmpty() ? fallback : Color.parseColor(c);
        } catch (Exception e) {
            return fallback;
        }
    }

    /** «● Предмет: текст» — точка цветом предмета, название жирным. */
    static void line(SpannableStringBuilder sb, String subject, String color, String text) {
        if (sb.length() > 0) sb.append("\n");
        int a = sb.length();
        sb.append("● ");
        sb.setSpan(new ForegroundColorSpan(parseColor(color, 0xFF8A90A0)), a, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        if (subject != null && !subject.isEmpty()) {
            int b = sb.length();
            sb.append(subject);
            sb.setSpan(new StyleSpan(Typeface.BOLD), b, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            if (text != null && !text.isEmpty()) sb.append(": ");
        }
        if (text != null) sb.append(text);
    }

    static String cards(int n) {
        int a = n % 10, b = n % 100;
        if (a == 1 && b != 11) return n + " карточка";
        if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return n + " карточки";
        return n + " карточек";
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        Class<?>[] all = { Small.class, Homework.class, Lessons.class };
        for (Class<?> k : all) {
            int[] ids = m.getAppWidgetIds(new ComponentName(ctx, k));
            if (ids.length == 0) continue;
            if (k == Small.class) Small.update(ctx, m, ids);
            else if (k == Homework.class) Homework.update(ctx, m, ids);
            else Lessons.update(ctx, m, ids);
        }
    }

    /** Маленький: число карточек и «Повторить 5». */
    public static class Small extends AppWidgetProvider {
        @Override
        public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
            update(ctx, m, ids);
        }

        static void update(Context ctx, AppWidgetManager m, int[] ids) {
            int n = new Day(ctx).cardsToday();
            for (int id : ids) {
                RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_small);
                v.setTextViewText(R.id.ws_count, n < 0 ? "М" : n == 0 ? "✓" : String.valueOf(n));
                v.setTextViewText(R.id.ws_label, n < 0 ? "Открыть Мнему" : n == 0 ? "Всё повторено" : "▶ Повторить");
                v.setOnClickPendingIntent(R.id.ws_root, open(ctx, n > 0 ? "mini" : "today", 51));
                m.updateAppWidget(id, v);
            }
        }
    }

    /** Домашка на сегодня и завтра, просроченные — отдельно. */
    public static class Homework extends AppWidgetProvider {
        @Override
        public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
            update(ctx, m, ids);
        }

        static void update(Context ctx, AppWidgetManager m, int[] ids) {
            Day d = new Day(ctx);
            SpannableStringBuilder sb = new SpannableStringBuilder();
            int late = 0, today = 0, tomorrow = 0;
            JSONArray list = d.st == null ? null : d.st.optJSONArray("hw");
            if (list != null) {
                // сначала на завтра (к чему готовиться вечером), потом на сегодня
                for (int pass = 0; pass < 2; pass++)
                    for (int i = 0; i < list.length(); i++) {
                        JSONObject h = list.optJSONObject(i);
                        if (h == null) continue;
                        String due = h.optString("due", "");
                        if (pass == 0 && !due.isEmpty() && due.compareTo(d.today) < 0) late++;
                        boolean want = pass == 0 ? d.tomorrow.equals(due) : d.today.equals(due);
                        if (!want) continue;
                        if (pass == 0) tomorrow++;
                        else today++;
                        if (tomorrow + today <= 6) line(sb, h.optString("subject"), h.optString("color"), (pass == 1 ? "(сегодня) " : "") + h.optString("text"));
                    }
            }
            String text = d.st == null ? "Открой Мнему — здесь появится домашка" : sb.length() == 0 ? "На завтра ничего не задано 🎉" : sb.toString();
            for (int id : ids) {
                RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_list);
                v.setTextViewText(R.id.wl_title, "Домашка на завтра");
                v.setTextViewText(R.id.wl_side, late > 0 ? "просрочено: " + late : "");
                v.setTextViewText(R.id.wl_list, sb.length() == 0 ? text : sb);
                v.setTextViewText(R.id.wl_btn, "+ Записать домашку");
                v.setOnClickPendingIntent(R.id.wl_root, open(ctx, "homework", 52));
                v.setOnClickPendingIntent(R.id.wl_btn, open(ctx, "homework", 53));
                m.updateAppWidget(id, v);
            }
        }
    }

    /** Уроки: до 15:00 — сегодняшние, потом — завтрашние; у каждого — сколько повторить. */
    public static class Lessons extends AppWidgetProvider {
        @Override
        public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
            update(ctx, m, ids);
        }

        static void update(Context ctx, AppWidgetManager m, int[] ids) {
            Day d = new Day(ctx);
            Calendar now = Calendar.getInstance();
            boolean evening = now.get(Calendar.HOUR_OF_DAY) >= 15;
            Calendar c = (Calendar) d.cal.clone();
            if (evening) c.add(Calendar.DAY_OF_MONTH, 1);
            int dow = c.get(Calendar.DAY_OF_WEEK) - 1; // 1 — понедельник … 6 — суббота, 0 — воскресенье
            JSONObject lessons = d.st == null ? null : d.st.optJSONObject("lessons");
            JSONArray list = lessons == null ? null : lessons.optJSONArray(String.valueOf(dow));
            SpannableStringBuilder sb = new SpannableStringBuilder();
            int total = 0;
            if (list != null)
                for (int i = 0; i < list.length(); i++) {
                    JSONObject l = list.optJSONObject(i);
                    if (l == null) continue;
                    int n = l.optInt("cards", 0);
                    total += n;
                    line(sb, (i + 1) + ". " + l.optString("name"), l.optString("color"), n > 0 && !evening ? cards(n) : "");
                }
            String empty = d.st == null ? "Открой Мнему — здесь появятся уроки" : lessons == null || lessons.length() == 0 ? "Заполни расписание в Мнеме (на «Сегодня»)" : "Уроков нет — отдыхай";
            for (int id : ids) {
                RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_list);
                v.setTextViewText(R.id.wl_title, evening ? "Уроки завтра" : "Уроки сегодня");
                v.setTextViewText(R.id.wl_side, !evening && total > 0 ? cards(total) : "");
                v.setTextViewText(R.id.wl_list, sb.length() == 0 ? empty : sb);
                v.setTextViewText(R.id.wl_btn, evening ? "▶ Подготовиться к завтра" : "▶ Повторить");
                v.setOnClickPendingIntent(R.id.wl_root, open(ctx, "today", 54));
                v.setOnClickPendingIntent(R.id.wl_btn, open(ctx, evening ? "lessons" : "mini", 55));
                m.updateAppWidget(id, v);
            }
        }
    }
}
