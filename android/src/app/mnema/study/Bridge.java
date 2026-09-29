package app.mnema.study;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.net.HttpURLConnection;
import java.net.ProtocolException;
import java.net.URL;
import java.nio.charset.Charset;
import java.security.KeyStore;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Мост между страницей (JS) и телефоном. Все методы вызываются из JS как window.MnemaAndroid.*. */
public class Bridge {
    static final Charset UTF8 = Charset.forName("UTF-8");
    static final String DATA_FILE = "mnema-data.json";
    static final String KEY_ALIAS = "mnema-secrets";
    static final int MAX_RESPONSE = 64 * 1024 * 1024;

    final MainActivity activity;
    final WebView web;
    final SharedPreferences prefs;
    final ExecutorService pool = Executors.newFixedThreadPool(4);
    final ConcurrentHashMap<String, String> results = new ConcurrentHashMap<String, String>();
    final Object saveLock = new Object();

    String saveId;
    byte[] saveBytes;
    SpeechRecognizer recognizer;
    String pendingSpeechLang;
    TextToSpeech tts;
    boolean ttsReady;
    String[] ttsPending;

    Bridge(MainActivity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        this.prefs = activity.getSharedPreferences("mnema", Context.MODE_PRIVATE);
    }

    // ---------- доставка ответов в JS ----------

    void deliver(final String id, String json) {
        results.put(id, json);
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript("window.__mnemaNative && window.__mnemaNative.done(" + JSONObject.quote(id) + ")", null);
            }
        });
    }

    void js(final String code) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript(code, null);
            }
        });
    }

    @JavascriptInterface
    public String take(String id) {
        String r = results.remove(id);
        return r == null ? "null" : r;
    }

    @JavascriptInterface
    public String appVersion() {
        try {
            return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }

    // ---------- данные ----------

    File dataFile() {
        return new File(activity.getFilesDir(), DATA_FILE);
    }

    static String readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return new String(out.toByteArray(), UTF8);
    }

    @JavascriptInterface
    public String load() {
        synchronized (saveLock) {
            File f = dataFile();
            if (!f.exists()) return null;
            try {
                return readAll(new FileInputStream(f));
            } catch (Exception e) {
                return null;
            }
        }
    }

    /** Надёжная запись: сначала во временный файл, потом замена. Раз в день — копия в backups (храним 8 последних). */
    @JavascriptInterface
    public boolean save(String json) {
        if (json == null) return false;
        synchronized (saveLock) {
            File f = dataFile();
            File tmp = new File(activity.getFilesDir(), DATA_FILE + ".tmp");
            try {
                backupIfNeeded(f);
                FileOutputStream out = new FileOutputStream(tmp);
                out.write(json.getBytes(UTF8));
                out.flush();
                out.getFD().sync();
                out.close();
                if (!tmp.renameTo(f)) {
                    f.delete();
                    if (!tmp.renameTo(f)) return false;
                }
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }

    void backupIfNeeded(File f) {
        try {
            if (!f.exists() || f.length() == 0) return;
            File dir = new File(activity.getFilesDir(), "backups");
            if (!dir.exists()) dir.mkdirs();
            String day = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            File b = new File(dir, "mnema-" + day + ".json");
            if (b.exists()) return;
            FileInputStream in = new FileInputStream(f);
            FileOutputStream out = new FileOutputStream(b);
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            out.close();
            File[] all = dir.listFiles();
            if (all != null && all.length > 8) {
                String[] names = new String[all.length];
                for (int i = 0; i < all.length; i++) names[i] = all[i].getName();
                Arrays.sort(names);
                for (int i = 0; i < names.length - 8; i++) new File(dir, names[i]).delete();
            }
        } catch (Exception ignored) {
        }
    }

    // ---------- настройки и секреты ----------

    @JavascriptInterface
    public String prefGet(String name) {
        return prefs.getString(name, null);
    }

    @JavascriptInterface
    public void prefSet(String name, String value) {
        if (value == null || value.isEmpty()) prefs.edit().remove(name).apply();
        else prefs.edit().putString(name, value).apply();
    }

    SecretKey secretKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return kg.generateKey();
    }

    /** Шифрует ключом из защищённого хранилища телефона (ключ нельзя вытащить из устройства). */
    @JavascriptInterface
    public String encrypt(String text) {
        if (text == null || text.isEmpty()) return "";
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, secretKey());
            byte[] iv = c.getIV();
            byte[] enc = c.doFinal(text.getBytes(UTF8));
            byte[] all = new byte[1 + iv.length + enc.length];
            all[0] = (byte) iv.length;
            System.arraycopy(iv, 0, all, 1, iv.length);
            System.arraycopy(enc, 0, all, 1 + iv.length, enc.length);
            return Base64.encodeToString(all, Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }

    @JavascriptInterface
    public String decrypt(String text) {
        if (text == null || text.isEmpty()) return "";
        try {
            byte[] all = Base64.decode(text, Base64.NO_WRAP);
            int ivLen = all[0];
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, all, 1, ivLen));
            byte[] plain = c.doFinal(all, 1 + ivLen, all.length - 1 - ivLen);
            return new String(plain, UTF8);
        } catch (Exception e) {
            return "";
        }
    }

    // ---------- сеть ----------

    /** Запрос без ограничений браузера (CORS): ИИ, облако, синхронизация по Wi-Fi. Ответ приходит через __mnemaNative.done(id). */
    @JavascriptInterface
    public void http(final String id, final String reqJson) {
        pool.execute(new Runnable() {
            @Override
            public void run() {
                deliver(id, doHttp(reqJson));
            }
        });
    }

    static void setMethod(HttpURLConnection conn, String method) throws Exception {
        try {
            conn.setRequestMethod(method);
            return;
        } catch (ProtocolException e) {
            // MKCOL, PROPFIND и т. п. — HttpURLConnection их не знает; ставим напрямую.
        }
        setMethodField(conn, method);
        Class<?> k = conn.getClass();
        while (k != null) {
            try {
                Field d = k.getDeclaredField("delegate");
                d.setAccessible(true);
                Object inner = d.get(conn);
                if (inner instanceof HttpURLConnection) setMethodField((HttpURLConnection) inner, method);
                break;
            } catch (NoSuchFieldException e) {
                k = k.getSuperclass();
            }
        }
    }

    static void setMethodField(HttpURLConnection conn, String method) throws Exception {
        Field f = HttpURLConnection.class.getDeclaredField("method");
        f.setAccessible(true);
        f.set(conn, method);
    }

    String doHttp(String reqJson) {
        HttpURLConnection conn = null;
        try {
            JSONObject req = new JSONObject(reqJson);
            String url = req.getString("url");
            if (!url.startsWith("http://") && !url.startsWith("https://")) throw new Exception("Неверный адрес");
            String method = req.optString("method", "GET").toUpperCase(Locale.US);
            int timeout = req.optInt("timeout", 60000);
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(Math.min(timeout, 30000));
            conn.setReadTimeout(timeout);
            conn.setInstanceFollowRedirects(true);
            conn.setUseCaches(false);
            setMethod(conn, method);
            JSONObject headers = req.optJSONObject("headers");
            if (headers != null) {
                Iterator<String> it = headers.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    conn.setRequestProperty(k, headers.optString(k));
                }
            }
            byte[] body = null;
            if (!req.isNull("body")) {
                String b = req.optString("body", null);
                if (b != null) body = req.optBoolean("bodyBase64") ? Base64.decode(b, Base64.DEFAULT) : b.getBytes(UTF8);
            }
            if (body != null) {
                conn.setDoOutput(true);
                conn.setFixedLengthStreamingMode(body.length);
                OutputStream out = conn.getOutputStream();
                out.write(body);
                out.close();
            }
            int status = conn.getResponseCode();
            InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            String text = "";
            if (in != null) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] chunk = new byte[65536];
                int n;
                int total = 0;
                while ((n = in.read(chunk)) > 0) {
                    total += n;
                    if (total > MAX_RESPONSE) throw new Exception("Ответ слишком большой");
                    buf.write(chunk, 0, n);
                }
                in.close();
                text = new String(buf.toByteArray(), UTF8);
            }
            JSONObject res = new JSONObject();
            res.put("status", status);
            res.put("text", text);
            return res.toString();
        } catch (Throwable e) {
            try {
                JSONObject res = new JSONObject();
                res.put("status", 0);
                String msg = e.getMessage();
                res.put("error", e.getClass().getSimpleName() + (msg != null ? ": " + msg : ""));
                return res.toString();
            } catch (Exception ignored) {
                return "{\"status\":0,\"error\":\"network\"}";
            }
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    // ---------- сохранение файлов (резервная копия, экспорт) ----------

    @JavascriptInterface
    public void saveFile(final String id, final String name, final String mime, final String base64) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (saveId != null) deliver(saveId, "{\"ok\":false,\"canceled\":true}");
                try {
                    saveBytes = Base64.decode(base64, Base64.DEFAULT);
                } catch (Exception e) {
                    deliver(id, "{\"ok\":false}");
                    return;
                }
                saveId = id;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                i.putExtra(Intent.EXTRA_TITLE, name);
                try {
                    activity.startActivityForResult(i, MainActivity.REQ_SAVE);
                } catch (Exception e) {
                    saveId = null;
                    saveBytes = null;
                    deliver(id, "{\"ok\":false}");
                }
            }
        });
    }

    void onSaveResult(final Uri uri) {
        final String id = saveId;
        final byte[] bytes = saveBytes;
        saveId = null;
        saveBytes = null;
        if (id == null) return;
        if (uri == null || bytes == null) {
            deliver(id, "{\"ok\":false,\"canceled\":true}");
            return;
        }
        pool.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    OutputStream out = activity.getContentResolver().openOutputStream(uri, "w");
                    out.write(bytes);
                    out.close();
                    deliver(id, "{\"ok\":true}");
                } catch (Exception e) {
                    deliver(id, "{\"ok\":false}");
                }
            }
        });
    }

    // ---------- распознавание речи ----------

    void speechEvent(String type, String text) {
        try {
            JSONObject e = new JSONObject();
            e.put("type", type);
            if (text != null) e.put("text", text);
            js("window.__mnemaSpeech && window.__mnemaSpeech(" + e.toString() + ")");
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public String speechStart(final String lang) {
        if (!SpeechRecognizer.isRecognitionAvailable(activity))
            return "{\"ok\":false,\"error\":\"На телефоне нет распознавания речи. Установи или включи приложение Google (голосовой ввод).\"}";
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    pendingSpeechLang = lang;
                    activity.requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, MainActivity.REQ_PERM_AUDIO);
                } else {
                    startRecognizer(lang);
                }
            }
        });
        return "{\"ok\":true}";
    }

    void onAudioPermission(boolean granted) {
        String lang = pendingSpeechLang;
        pendingSpeechLang = null;
        if (lang == null) return;
        if (granted) startRecognizer(lang);
        else speechEvent("error", "Нет разрешения на микрофон. Разреши его в настройках телефона → Приложения → Мнема.");
    }

    void startRecognizer(String lang) {
        stopRecognizer(true);
        recognizer = SpeechRecognizer.createSpeechRecognizer(activity);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
            }

            @Override
            public void onBeginningOfSpeech() {
            }

            @Override
            public void onRmsChanged(float rmsdB) {
            }

            @Override
            public void onBufferReceived(byte[] buffer) {
            }

            @Override
            public void onEndOfSpeech() {
            }

            @Override
            public void onError(int error) {
                String msg;
                switch (error) {
                    case SpeechRecognizer.ERROR_NO_MATCH:
                    case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                        msg = "Не расслышал — скажи ответ ещё раз.";
                        break;
                    case SpeechRecognizer.ERROR_NETWORK:
                    case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                    case SpeechRecognizer.ERROR_SERVER:
                        msg = "Для распознавания нужен интернет (или скачай русский язык для офлайн-распознавания в настройках Google).";
                        break;
                    case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                        msg = "Нет разрешения на микрофон.";
                        break;
                    case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                        msg = "Распознавание занято — попробуй через секунду.";
                        break;
                    default:
                        msg = "Не получилось распознать речь (код " + error + ").";
                }
                speechEvent("error", msg);
                stopRecognizer(true);
            }

            @Override
            public void onResults(Bundle results) {
                ArrayList<String> list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                speechEvent("final", list != null && !list.isEmpty() ? list.get(0) : "");
                speechEvent("end", null);
                stopRecognizer(true);
            }

            @Override
            public void onPartialResults(Bundle partial) {
                ArrayList<String> list = partial.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (list != null && !list.isEmpty() && list.get(0).length() > 0) speechEvent("partial", list.get(0));
            }

            @Override
            public void onEvent(int eventType, Bundle params) {
            }
        });
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, activity.getPackageName());
        try {
            recognizer.startListening(i);
        } catch (Exception e) {
            speechEvent("error", "Не получилось включить микрофон.");
            stopRecognizer(true);
        }
    }

    void stopRecognizer(boolean destroy) {
        if (recognizer == null) return;
        try {
            if (destroy) {
                recognizer.destroy();
                recognizer = null;
            } else {
                recognizer.stopListening();
            }
        } catch (Exception ignored) {
            recognizer = null;
        }
    }

    /** Остановить запись: телефон дораспознает сказанное и пришлёт итог (final). */
    @JavascriptInterface
    public void speechStop() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                pendingSpeechLang = null;
                stopRecognizer(false);
            }
        });
    }

    // ---------- печать карточек ----------

    @JavascriptInterface
    public void print() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    android.print.PrintManager pm = (android.print.PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                    pm.print("Мнема — карточки", web.createPrintDocumentAdapter("Мнема"), new android.print.PrintAttributes.Builder().build());
                } catch (Exception ignored) {
                }
            }
        });
    }

    // ---------- напоминания ----------

    String notifyId;

    @JavascriptInterface
    public void setReminders(String json) {
        Reminders.set(activity, json == null ? "[]" : json);
    }

    /** Данные для виджета на рабочем столе (на неделю вперёд). */
    @JavascriptInterface
    public void setWidget(String json) {
        if (json != null) MnemaWidget.save(activity, json);
    }

    /** Разрешение на уведомления (Android 13+ спрашивает у человека). */
    @JavascriptInterface
    public void notifyPermission(final String id) {
        if (android.os.Build.VERSION.SDK_INT < 33 || activity.checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED) {
            deliver(id, "{\"ok\":true}");
            return;
        }
        notifyId = id;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, MainActivity.REQ_PERM_NOTIFY);
            }
        });
    }

    void onNotifyPermission(boolean ok) {
        if (notifyId != null) deliver(notifyId, ok ? "{\"ok\":true}" : "{\"ok\":false}");
        notifyId = null;
    }

    // ---------- озвучка слов (словари) ----------

    @JavascriptInterface
    public void speak(final String text, final String lang) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (tts == null) {
                    ttsPending = new String[] { text, lang };
                    tts = new TextToSpeech(activity, new TextToSpeech.OnInitListener() {
                        @Override
                        public void onInit(int status) {
                            ttsReady = status == TextToSpeech.SUCCESS;
                            if (ttsReady && ttsPending != null) sayNow(ttsPending[0], ttsPending[1]);
                            ttsPending = null;
                        }
                    });
                } else if (ttsReady) {
                    sayNow(text, lang);
                } else {
                    ttsPending = new String[] { text, lang };
                }
            }
        });
    }

    void sayNow(String text, String lang) {
        try {
            tts.setLanguage(Locale.forLanguageTag(lang));
            tts.setSpeechRate(0.92f);
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "mnema");
        } catch (Exception ignored) {
        }
    }

    void destroy() {
        if (tts != null) {
            try {
                tts.shutdown();
            } catch (Exception ignored) {
            }
        }
        stopRecognizer(true);
        pool.shutdown();
    }
}
