package app.mnema.study;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Мнема для Android: окно WebView, в котором работает то же приложение, что и на Windows.
 * Файлы приложения отдаются с адреса https://mnema.app/ прямо из APK (так работают модули JS и WebAssembly).
 */
public class MainActivity extends Activity {
    static final String HOST = "mnema.app";
    static final int REQ_FILE = 1;
    static final int REQ_SAVE = 2;
    static final int REQ_PERM_WEB = 3;
    static final int REQ_PERM_AUDIO = 4;
    static final int REQ_PERM_NOTIFY = 5;
    String pendingOpen;
    android.view.View fullView;
    WebChromeClient.CustomViewCallback fullCallback;

    WebView web;
    Bridge bridge;
    ValueCallback<Uri[]> fileCallback;
    PermissionRequest pendingWebPermission;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);

        bridge = new Bridge(this, web);
        web.addJavascriptInterface(bridge, "MnemaAndroid");

        pendingOpen = getIntent() != null ? getIntent().getStringExtra("open") : null;
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (pendingOpen != null) {
                    final String what = pendingOpen;
                    pendingOpen = null;
                    view.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            openInApp(what);
                        }
                    }, 900);
                }
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
                Map<String, String> headers = new HashMap<String, String>();
                headers.put("Cache-Control", "no-cache");
                try {
                    InputStream in = getAssets().open("www" + path);
                    return new WebResourceResponse(mime(path), mime(path).startsWith("text/") || path.endsWith(".js") ? "utf-8" : null, 200, "OK", headers, in);
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, new ByteArrayInputStream(new byte[0]));
                }
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri u = Uri.parse(url);
                if (HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                String type = "*/*";
                String[] accept = params.getAcceptTypes();
                boolean onlyImages = accept != null && accept.length > 0;
                if (accept != null)
                    for (String a : accept)
                        if (a == null || !(a.startsWith("image/") || a.startsWith(".jp") || a.startsWith(".png") || a.startsWith(".webp"))) onlyImages = false;
                if (onlyImages) type = "image/*";
                i.setType(type);
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(i, "Выбери файл"), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }

            // Видео на весь экран (кнопка в плеере YouTube)
            @Override
            public void onShowCustomView(android.view.View view, CustomViewCallback callback) {
                if (fullView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                fullView = view;
                fullCallback = callback;
                ((android.widget.FrameLayout) getWindow().getDecorView()).addView(view, new android.widget.FrameLayout.LayoutParams(-1, -1));
                getWindow().getDecorView().setSystemUiVisibility(0x00000004 | 0x00000002 | 0x00001000);
            }

            @Override
            public void onHideCustomView() {
                if (fullView == null) return;
                ((android.widget.FrameLayout) getWindow().getDecorView()).removeView(fullView);
                fullView = null;
                if (fullCallback != null) fullCallback.onCustomViewHidden();
                fullCallback = null;
                getWindow().getDecorView().setSystemUiVisibility(0);
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        List<String> need = new ArrayList<String>();
                        for (String r : request.getResources()) {
                            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
                                need.add(Manifest.permission.CAMERA);
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                                need.add(Manifest.permission.RECORD_AUDIO);
                        }
                        if (need.isEmpty()) {
                            request.grant(request.getResources());
                        } else {
                            pendingWebPermission = request;
                            requestPermissions(need.toArray(new String[0]), REQ_PERM_WEB);
                        }
                    }
                });
            }
        });

        setContentView(web);
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("https://" + HOST + "/index.html");
    }

    static String mime(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".gz")) return "application/gzip";
        return "application/octet-stream";
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null && clip.getItemCount() > 0) {
                    result = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) result[i] = clip.getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    result = new Uri[] { data.getData() };
                }
            }
            if (fileCallback != null) fileCallback.onReceiveValue(result);
            fileCallback = null;
            return;
        }
        if (requestCode == REQ_SAVE) {
            bridge.onSaveResult(resultCode == RESULT_OK && data != null ? data.getData() : null);
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        boolean all = grantResults.length > 0;
        for (int g : grantResults) if (g != PackageManager.PERMISSION_GRANTED) all = false;
        if (requestCode == REQ_PERM_WEB && pendingWebPermission != null) {
            if (all) pendingWebPermission.grant(pendingWebPermission.getResources());
            else pendingWebPermission.deny();
            pendingWebPermission = null;
        } else if (requestCode == REQ_PERM_AUDIO) {
            bridge.onAudioPermission(all);
        } else if (requestCode == REQ_PERM_NOTIFY) {
            bridge.onNotifyPermission(all);
        }
    }

    void openInApp(String what) {
        web.evaluateJavascript("window.__mnemaOpen && window.__mnemaOpen(" + org.json.JSONObject.quote(what) + ")", null);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String what = intent.getStringExtra("open");
        if (what != null) openInApp(what);
    }

    @Override
    public void onBackPressed() {
        if (fullView != null) {
            if (fullCallback != null) fullCallback.onCustomViewHidden();
            ((android.widget.FrameLayout) getWindow().getDecorView()).removeView(fullView);
            fullView = null;
            fullCallback = null;
            getWindow().getDecorView().setSystemUiVisibility(0);
            return;
        }
        web.evaluateJavascript("(window.__mnemaBack && window.__mnemaBack()) ? 'yes' : 'no'", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (value == null || !value.contains("yes")) moveTaskToBack(true);
            }
        });
    }

    @Override
    protected void onPause() {
        // Сохранить несохранённое, пока приложение уходит в фон.
        web.evaluateJavascript("window.__mnemaFlush && window.__mnemaFlush()", null);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        bridge.destroy();
        super.onDestroy();
    }
}
