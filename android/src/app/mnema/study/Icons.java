package app.mnema.study;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;

/**
 * Значок Мнемы на рабочем столе под тему. Картинку значка у приложения нельзя поменять на ходу,
 * поэтому в манифесте есть несколько «псевдонимов» окна с разными значками, и включён ровно один.
 * Меняем, когда Мнема ушла с экрана (AppActivity.onStop).
 */
public class Icons {
    static final String PREFS = "mnema-icon";
    static final String DEFAULT = "MainActivity";
    static final String[] THEMES = { "air", "paper", "snow", "sky", "mint", "sakura", "sand", "contrast", "night", "graphite", "midnight", "ocean", "forest", "plum", "coffee" };

    static String alias(String id) {
        if (id != null) for (String t : THEMES) if (t.equals(id)) return "Icon_" + t;
        return DEFAULT;
    }

    /** Запомнить, какой значок нужен ("default" или id темы). */
    static void request(Context ctx, String id) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("want", alias(id)).apply();
    }

    static void applyPending(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String want = p.getString("want", null);
        String now = p.getString("now", DEFAULT);
        if (want == null || want.equals(now)) return;
        PackageManager pm = ctx.getPackageManager();
        String pkg = ctx.getPackageName();
        try {
            // Сначала включить новый ярлык, потом выключить остальные — чтобы Мнема ни на миг не осталась без значка.
            pm.setComponentEnabledSetting(new ComponentName(pkg, pkg + "." + want), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            String[] all = new String[THEMES.length + 1];
            all[0] = DEFAULT;
            for (int i = 0; i < THEMES.length; i++) all[i + 1] = "Icon_" + THEMES[i];
            for (String a : all) {
                if (a.equals(want)) continue;
                pm.setComponentEnabledSetting(new ComponentName(pkg, pkg + "." + a), a.equals(DEFAULT) ? PackageManager.COMPONENT_ENABLED_STATE_DISABLED : PackageManager.COMPONENT_ENABLED_STATE_DEFAULT, PackageManager.DONT_KILL_APP);
            }
            p.edit().putString("now", want).apply();
        } catch (Exception ignored) {
            // на некоторых телефонах запрещено — остаётся прежний значок
        }
    }
}
