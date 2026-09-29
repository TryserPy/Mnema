package app.mnema.study;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;

/**
 * Обновление Мнемы на телефоне: скачать APK из выпуска на GitHub, проверить, что это наша Мнема
 * (то же имя пакета, тот же ключ подписи, версия новее), и отдать системе на установку.
 * Android сам спросит «Обновить приложение?» — без этого вопроса ставить приложения нельзя.
 */
public class Updater extends BroadcastReceiver {
    interface Progress {
        void on(int percent);
    }

    static final int FLAG_MUTABLE = 33554432; // PendingIntent.FLAG_MUTABLE (Android 12+)
    static volatile Bridge bridge; // чтобы сообщить окну об ошибке установки

    static File apkFile(Context ctx) {
        File dir = new File(ctx.getCacheDir(), "update");
        dir.mkdirs();
        return new File(dir, "Mnema-update.apk");
    }

    static String err(String message) {
        try {
            return new JSONObject().put("ok", false).put("error", message).toString();
        } catch (Exception e) {
            return "{\"ok\":false}";
        }
    }

    /** Скачать APK. Разрешены только ссылки на выпуски GitHub. */
    static String download(Context ctx, String url, Progress progress) {
        if (url == null || !url.startsWith("https://github.com/")) return err("Обновления скачиваются только с GitHub");
        File out = apkFile(ctx);
        File part = new File(out.getPath() + ".part");
        HttpURLConnection conn = null;
        try {
            String current = url;
            for (int hop = 0; ; hop++) {
                conn = (HttpURLConnection) new URL(current).openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(60000);
                conn.setRequestProperty("User-Agent", "Mnema-Android");
                conn.setRequestProperty("Accept", "application/octet-stream");
                int code = conn.getResponseCode();
                if (code >= 300 && code < 400 && hop < 6) {
                    String next = conn.getHeaderField("Location");
                    conn.disconnect();
                    if (next == null || !next.startsWith("https://")) return err("GitHub прислал странную ссылку");
                    current = next;
                    continue;
                }
                if (code != 200) return err("GitHub ответил ошибкой " + code);
                break;
            }
            long total = conn.getContentLength();
            InputStream in = conn.getInputStream();
            OutputStream os = new FileOutputStream(part);
            byte[] buf = new byte[65536];
            long done = 0;
            int last = -1;
            int n;
            while ((n = in.read(buf)) > 0) {
                os.write(buf, 0, n);
                done += n;
                if (total > 0) {
                    int pct = (int) (done * 100 / total);
                    if (pct != last) {
                        last = pct;
                        progress.on(pct);
                    }
                }
            }
            os.close();
            in.close();
            if (total > 0 && done != total) return err("Файл скачался не полностью — попробуй ещё раз");
            if (out.exists()) out.delete();
            if (!part.renameTo(out)) return err("Не получилось сохранить файл");
            return check(ctx, out);
        } catch (Exception e) {
            return err("Нет интернета или GitHub недоступен");
        } finally {
            if (conn != null) conn.disconnect();
            if (part.exists()) part.delete();
        }
    }

    @SuppressWarnings("deprecation")
    static Signature[] signatures(PackageInfo p) {
        return p == null ? null : p.signatures;
    }

    /** Это точно Мнема, новее и подписана тем же ключом? Иначе Android всё равно откажет — лучше сказать понятно. */
    @SuppressWarnings("deprecation")
    static String check(Context ctx, File apk) {
        try {
            PackageManager pm = ctx.getPackageManager();
            PackageInfo file = pm.getPackageArchiveInfo(apk.getPath(), PackageManager.GET_SIGNATURES);
            if (file == null) {
                apk.delete();
                return err("Скачанный файл повреждён — попробуй ещё раз");
            }
            PackageInfo mine = pm.getPackageInfo(ctx.getPackageName(), PackageManager.GET_SIGNATURES);
            if (!ctx.getPackageName().equals(file.packageName)) {
                apk.delete();
                return err("Это не Мнема");
            }
            if (file.versionCode <= mine.versionCode) {
                apk.delete();
                return err("Эта версия не новее установленной");
            }
            Signature[] a = signatures(file);
            Signature[] b = signatures(mine);
            if (a != null && b != null && a.length > 0 && !Arrays.equals(a, b)) {
                apk.delete();
                return err("Файл подписан другим ключом — такое обновление не встанет поверх");
            }
            return new JSONObject().put("ok", true).put("version", file.versionName).toString();
        } catch (Exception e) {
            return err("Не получилось проверить файл");
        }
    }

    /** Отдать скачанный APK системе. Если Мнеме ещё не разрешено ставить приложения — открыть это разрешение. */
    static String install(Activity a) {
        File apk = apkFile(a);
        if (!apk.exists()) return err("Сначала скачай обновление");
        if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) {
            try {
                a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName())));
            } catch (Exception ignored) {
            }
            return "{\"ok\":false,\"permission\":true}";
        }
        PackageInstaller.Session session = null;
        try {
            PackageInstaller pi = a.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(a.getPackageName());
            int id = pi.createSession(params);
            session = pi.openSession(id);
            OutputStream out = session.openWrite("mnema.apk", 0, apk.length());
            InputStream in = new FileInputStream(apk);
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            session.fsync(out);
            out.close();
            Intent cb = new Intent(a, Updater.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? FLAG_MUTABLE : 0);
            PendingIntent pending = PendingIntent.getBroadcast(a, 7301, cb, flags);
            session.commit(pending.getIntentSender());
            session.close();
            return "{\"ok\":true}";
        } catch (Exception e) {
            if (session != null) session.abandon();
            return err("Не получилось начать установку");
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context ctx, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    ctx.startActivity(confirm);
                } catch (Exception ignored) {
                }
            }
            return;
        }
        if (status == PackageInstaller.STATUS_SUCCESS) return; // Мнема сейчас перезапустится уже новой
        String message = status == PackageInstaller.STATUS_FAILURE_ABORTED ? "Установка отменена"
                : status == PackageInstaller.STATUS_FAILURE_CONFLICT || status == PackageInstaller.STATUS_FAILURE_INCOMPATIBLE ? "Обновление не подходит к этой Мнеме (другой ключ подписи)"
                : status == PackageInstaller.STATUS_FAILURE_STORAGE ? "Не хватает места на телефоне"
                : "Не получилось установить";
        Bridge b = bridge;
        if (b != null) b.js("window.__mnemaUpdate && window.__mnemaUpdate(" + JSONObject.quote("{\"type\":\"error\",\"message\":" + JSONObject.quote(message) + "}") + ")");
    }
}
