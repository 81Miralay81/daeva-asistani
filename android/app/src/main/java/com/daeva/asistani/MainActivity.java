package com.daeva.asistani;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.widget.Toast;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Daeva Asistanı - Android sürümü.
 * Arayüz assets/index.html (masaüstü sürümüyle aynı sayfa). Masaüstündeki Python köprüsünün yerini
 * bu sınıf alır: Gemini istekleri (kullanıcının kendi anahtarıyla) ve MetaBot sayfasını gizli bir
 * WebView içinde normal ziyaretçi gibi açıp okumak.
 */
public class MainActivity extends Activity {
    private static final String API = "https://generativelanguage.googleapis.com/v1beta";
    private static final String METABOT = "https://metabot.gg/en/aion-2/armory";
    private static final String RELEASES = "https://api.github.com/repos/81Miralay81/daeva-asistani/releases/latest";
    private long dlId = -1;
    private BroadcastReceiver dlReceiver;
    private String pendingApk;

    private WebView web;
    private WebView hidden;
    private SharedPreferences prefs;
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private final Object metabotLock = new Object();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private volatile CountDownLatch pageLatch;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("daeva", MODE_PRIVATE);

        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setBackgroundColor(0xFF0B0E14);
        web.addJavascriptInterface(new Bridge(), "AndroidApi");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                String u = req.getUrl().toString();
                if (u.startsWith("http://") || u.startsWith("https://")) { openUrl(u); return true; }
                return false;
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/index.html");
        if (savedInstanceState == null) pool.submit(this::checkUpdate);
    }

    // ---------------- Otomatik güncelleme (GitHub Releases) ----------------
    private int myVersion() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode; } catch (Exception e) { return 0; }
    }

    private void checkUpdate() {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(RELEASES).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestProperty("Accept", "application/vnd.github+json");
            if (c.getResponseCode() != 200) return;
            JSONObject rel = new JSONObject(readAll(c.getInputStream()));
            Matcher m = Pattern.compile("(\\d+)$").matcher(rel.optString("tag_name", ""));
            if (!m.find()) return;
            int latest = Integer.parseInt(m.group(1));
            if (latest <= myVersion()) return;
            JSONArray assets = rel.optJSONArray("assets");
            String url = null;
            if (assets != null) for (int i = 0; i < assets.length(); i++) {
                JSONObject a = assets.getJSONObject(i);
                if (a.optString("name").endsWith(".apk")) { url = a.optString("browser_download_url"); break; }
            }
            if (url == null) return;
            final String apkUrl = url, ver = rel.optString("tag_name").replaceFirst("^v", "");
            ui.post(() -> new AlertDialog.Builder(this)
                    .setTitle("Yeni sürüm var")
                    .setMessage("Daeva Asistanı " + ver + " hazır. Şimdi güncellensin mi?\n\nAyarların ve seviyelerin silinmez.")
                    .setPositiveButton("Güncelle", (d, w) -> startDownload(apkUrl, ver))
                    .setNegativeButton("Sonra", null)
                    .show());
        } catch (Exception ignored) { }
    }

    private void startDownload(String url, String ver) {
        try {
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url))
                    .setTitle("Daeva Asistanı " + ver)
                    .setDescription("Güncelleme indiriliyor")
                    .setMimeType("application/vnd.android.package-archive")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                    .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "DaevaAsistani-" + ver + ".apk");
            if (dlReceiver == null) {
                dlReceiver = new BroadcastReceiver() {
                    @Override public void onReceive(Context ctx, Intent in) {
                        if (in.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -2) != dlId) return;
                        Uri u = dm.getUriForDownloadedFile(dlId);
                        if (u == null) { Toast.makeText(MainActivity.this, "İndirme başarısız", Toast.LENGTH_LONG).show(); return; }
                        pendingApk = u.toString();
                        install();
                    }
                };
                IntentFilter f = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
                if (Build.VERSION.SDK_INT >= 33) registerReceiver(dlReceiver, f, Context.RECEIVER_EXPORTED);
                else registerReceiver(dlReceiver, f);
            }
            dlId = dm.enqueue(r);
            Toast.makeText(this, "Güncelleme indiriliyor…", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            openUrl(url);
        }
    }

    private void install() {
        if (pendingApk == null) return;
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(this, "Daeva Asistanı'na \"bilinmeyen uygulamaları yükleme\" izni ver, sonra geri dön", Toast.LENGTH_LONG).show();
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            return; // izin verilip uygulamaya dönülünce onResume tekrar dener
        }
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(Uri.parse(pendingApk), "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        pendingApk = null;
        try { startActivity(i); } catch (Exception e) { Toast.makeText(this, "Kurulum açılamadı: " + e.getMessage(), Toast.LENGTH_LONG).show(); }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (pendingApk != null && (Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls())) install();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (dlReceiver != null) try { unregisterReceiver(dlReceiver); } catch (Exception ignored) { }
        pool.shutdownNow();
        if (hidden != null) hidden.destroy();
        web.destroy();
        super.onDestroy();
    }

    private void openUrl(String u) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u))); } catch (Exception ignored) { }
    }

    private void reply(String id, String json) {
        final String js = "window.__andRes && window.__andRes(" + JSONObject.quote(id) + "," + json + ")";
        ui.post(() -> web.evaluateJavascript(js, null));
    }

    /** JS → Java. Her çağrı arka planda çalışır; sonuç window.__andRes ile döner, arayüz donmaz. */
    private class Bridge {
        @JavascriptInterface
        public void call(String id, String method, String argsJson) {
            pool.submit(() -> {
                String res;
                try {
                    res = dispatch(method, new JSONArray(argsJson == null ? "[]" : argsJson));
                } catch (Throwable t) {
                    res = errObj(0, "INTERNAL", String.valueOf(t), 0).toString();
                    try { res = new JSONObject().put("ok", false).put("error", new JSONObject(res)).toString(); } catch (Exception ignored) { }
                }
                reply(id, res);
            });
        }
    }

    private String dispatch(String m, JSONArray a) throws Exception {
        switch (m) {
            case "has_key": return String.valueOf(!key().isEmpty());
            case "save_key": {
                String k = a.optString(0, "").trim();
                if (k.isEmpty()) return new JSONObject().put("ok", false).put("error", "Anahtar boş").toString();
                prefs.edit().putString("gemini_key", k).apply();
                return new JSONObject().put("ok", true).toString();
            }
            case "delete_key": prefs.edit().remove("gemini_key").apply(); return new JSONObject().put("ok", true).toString();
            case "open_url": { String u = a.optString(0, ""); if (u.startsWith("http")) ui.post(() -> openUrl(u)); return "null"; }
            case "list_models": return listModels().toString();
            case "ask_gemini": return askGemini(a.optString(0, ""), a.optString(1, ""), a.optBoolean(2, true)).toString();
            case "metabot_get": return metabotGet(a.optString(0, "")).toString();
            case "metabot_page": return metabotPage(a.optString(0, ""), a.optString(1, "")).toString();
            case "metabot_item": return metabotItem(a.optString(0, ""), a.optString(1, ""), a.optString(2, ""), a.optString(3, ""), a.optString(4, "")).toString();
            case "app_version": return new JSONObject().put("code", myVersion()).toString();
            case "check_update": checkUpdate(); return "null";
            default: return new JSONObject().put("ok", false).put("error", "Bilinmeyen işlem: " + m).toString();
        }
    }

    private String key() { return prefs.getString("gemini_key", "").trim(); }

    // ---------------- Gemini ----------------
    private static JSONObject errObj(int code, String status, String msg, int retry) {
        JSONObject o = new JSONObject();
        try { o.put("code", code).put("status", status).put("message", msg).put("retry", retry); } catch (Exception ignored) { }
        return o;
    }

    /** {ok:true, data:...} ya da {ok:false, error:{code,status,message,retry}} */
    private JSONObject request(String method, String path, String k, JSONObject body, int timeoutMs) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(API + path).openConnection();
            c.setRequestMethod(method);
            c.setConnectTimeout(20000);
            c.setReadTimeout(timeoutMs);
            c.setRequestProperty("x-goog-api-key", k);
            c.setRequestProperty("Content-Type", "application/json");
            if (body != null) {
                c.setDoOutput(true);
                try (OutputStream os = c.getOutputStream()) { os.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            }
            int code = c.getResponseCode();
            InputStream is = code < 400 ? c.getInputStream() : c.getErrorStream();
            String txt = is == null ? "" : readAll(is);
            if (code < 400) return new JSONObject().put("ok", true).put("data", new JSONObject(txt));
            String status = "", msg = c.getResponseMessage() == null ? "" : c.getResponseMessage();
            int retry = 0;
            String ra = c.getHeaderField("Retry-After");
            if (ra != null) try { retry = Integer.parseInt(ra.trim()); } catch (Exception ignored) { }
            try {
                JSONObject err = new JSONObject(txt).optJSONObject("error");
                if (err != null) {
                    status = err.optString("status", "");
                    msg = err.optString("message", msg);
                    JSONArray det = err.optJSONArray("details");
                    if (det != null) for (int i = 0; i < det.length(); i++) {
                        Matcher mm = Pattern.compile("(\\d+(?:\\.\\d+)?)s").matcher(det.optJSONObject(i) == null ? "" : det.optJSONObject(i).optString("retryDelay", ""));
                        if (mm.find()) retry = Math.max(retry, (int) Double.parseDouble(mm.group(1)) + 1);
                    }
                }
            } catch (Exception ignored) { }
            if (code == 429 && retry == 0) {
                Matcher mm = Pattern.compile("retry in (\\d+(?:\\.\\d+)?)", Pattern.CASE_INSENSITIVE).matcher(msg);
                retry = mm.find() ? (int) Double.parseDouble(mm.group(1)) + 1 : 60;
            }
            return new JSONObject().put("ok", false).put("error", errObj(code, status, msg, retry));
        } catch (Exception e) {
            try { return new JSONObject().put("ok", false).put("error", errObj(0, "NETWORK", String.valueOf(e), 0)); } catch (Exception x) { return new JSONObject(); }
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String readAll(InputStream is) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
        return bo.toString("UTF-8");
    }

    private static double version(String n) {
        Matcher m = Pattern.compile("gemini-(\\d+(?:\\.\\d+)?)").matcher(n);
        return m.find() ? Double.parseDouble(m.group(1)) : 0;
    }

    /** {ok:true, models:[...]} — kararlı önce, sonra flash, pro, lite; yeni sürüm önce */
    private JSONObject models(String k) throws Exception {
        JSONObject r = request("GET", "/models?pageSize=1000", k, null, 30000);
        if (!r.optBoolean("ok")) return r;
        JSONArray arr = r.getJSONObject("data").optJSONArray("models");
        List<String> names = new ArrayList<>();
        String[] skip = {"embedding", "tts", "image", "live", "audio", "robotics", "computer-use"};
        if (arr != null) for (int i = 0; i < arr.length(); i++) {
            JSONObject m = arr.getJSONObject(i);
            String name = m.optString("name", "");
            JSONArray meth = m.optJSONArray("supportedGenerationMethods");
            if (!name.contains("gemini") || meth == null || !meth.toString().contains("generateContent")) continue;
            boolean bad = false;
            for (String x : skip) if (name.contains(x)) { bad = true; break; }
            if (!bad) names.add(name.substring(name.indexOf('/') + 1));
        }
        Collections.sort(names, (x, y) -> {
            int ux = unstable(x), uy = unstable(y);
            if (ux != uy) return ux - uy;
            int kx = kind(x), ky = kind(y);
            if (kx != ky) return kx - ky;
            int v = Double.compare(version(y), version(x));
            return v != 0 ? v : x.compareTo(y);
        });
        return new JSONObject().put("ok", true).put("models", new JSONArray(names));
    }

    private static int unstable(String n) { return n.contains("preview") || n.contains("exp") || n.contains("-0") || n.contains("latest") ? 1 : 0; }
    private static int kind(String n) { return n.contains("flash") && !n.contains("lite") ? 0 : n.contains("pro") ? 1 : n.contains("lite") ? 2 : 3; }

    private JSONObject listModels() throws Exception {
        String k = key();
        if (k.isEmpty()) return new JSONObject().put("ok", false).put("error", errObj(401, "NO_KEY", "API key missing", 0));
        JSONObject r = models(k);
        if (!r.optBoolean("ok")) return r;
        if (r.getJSONArray("models").length() == 0) return new JSONObject().put("ok", false).put("error", errObj(404, "NO_MODELS", "No Gemini models available", 0));
        return r;
    }

    private JSONObject askGemini(String model, String prompt, boolean search) throws Exception {
        String k = key();
        if (k.isEmpty()) return new JSONObject().put("ok", false).put("error", errObj(401, "NO_KEY", "API key missing", 0)).put("model", model);
        if (model.isEmpty()) {
            JSONObject r = models(k);
            if (!r.optBoolean("ok")) return r.put("model", model);
            JSONArray ms = r.getJSONArray("models");
            if (ms.length() == 0) return new JSONObject().put("ok", false).put("error", errObj(404, "NO_MODELS", "No Gemini models available", 0));
            model = ms.getString(0);
        }
        JSONObject body = new JSONObject()
                .put("contents", new JSONArray().put(new JSONObject().put("role", "user").put("parts", new JSONArray().put(new JSONObject().put("text", prompt)))))
                .put("generationConfig", new JSONObject().put("temperature", 0.4));
        if (search) body.put("tools", new JSONArray().put(new JSONObject().put("google_search", new JSONObject())));
        JSONObject r = request("POST", "/models/" + model + ":generateContent", k, body, 180000);
        if (!r.optBoolean("ok") && search && r.getJSONObject("error").optInt("code") == 400) {
            body.remove("tools");
            JSONObject r2 = request("POST", "/models/" + model + ":generateContent", k, body, 180000);
            if (r2.optBoolean("ok")) r = r2;
        }
        if (!r.optBoolean("ok")) return r.put("model", model);
        JSONArray cands = r.getJSONObject("data").optJSONArray("candidates");
        JSONObject cand = cands != null && cands.length() > 0 ? cands.getJSONObject(0) : new JSONObject();
        StringBuilder text = new StringBuilder();
        JSONArray parts = cand.optJSONObject("content") == null ? null : cand.getJSONObject("content").optJSONArray("parts");
        if (parts != null) for (int i = 0; i < parts.length(); i++) text.append(parts.getJSONObject(i).optString("text", ""));
        JSONArray sources = new JSONArray();
        JSONObject gm = cand.optJSONObject("groundingMetadata");
        JSONArray chunks = gm == null ? null : gm.optJSONArray("groundingChunks");
        List<String> seen = new ArrayList<>();
        if (chunks != null) for (int i = 0; i < chunks.length(); i++) {
            JSONObject w = chunks.getJSONObject(i).optJSONObject("web");
            if (w != null && !w.optString("uri").isEmpty() && !seen.contains(w.optString("uri"))) {
                seen.add(w.optString("uri"));
                sources.put(new JSONObject().put("uri", w.optString("uri")).put("title", w.optString("title", "")));
            }
        }
        if (text.length() == 0) return new JSONObject().put("ok", false).put("model", model)
                .put("error", errObj(200, "EMPTY", "Empty response (finishReason=" + cand.optString("finishReason", "") + ")", 0));
        return new JSONObject().put("ok", true).put("text", text.toString()).put("sources", sources).put("model", model);
    }

    // ---------------- MetaBot: gizli WebView (normal ziyaret gibi) ----------------
    @SuppressLint("SetJavaScriptEnabled")
    private void ensureHidden() throws Exception {
        if (hidden != null) return;
        CountDownLatch made = new CountDownLatch(1);
        pageLatch = new CountDownLatch(1);
        ui.post(() -> {
            hidden = new WebView(this);
            WebSettings hs = hidden.getSettings();
            hs.setJavaScriptEnabled(true);
            hs.setDomStorageEnabled(true);
            hs.setBlockNetworkImage(false);
            // Masaüstü görünümü: MetaBot telefon görünümünde yetenek/ekipman listelerini sayfaya koymayabiliyor
            hs.setUserAgentString("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");
            hs.setUseWideViewPort(true);
            hs.setLoadWithOverviewMode(true);
            hidden.setWebViewClient(new WebViewClient() {
                @Override public void onPageStarted(WebView v, String url, Bitmap f) { }
                @Override public void onPageFinished(WebView v, String url) { CountDownLatch l = pageLatch; if (l != null) l.countDown(); }
            });
            // Ana sayfanın ARKASINA, masaüstü boyutunda eklenir: ekranda görünmez ama sayfa tam çizilir
            hidden.setAlpha(0f);
            hidden.setFocusable(false);
            ((FrameLayout) web.getParent()).addView(hidden, 0, new FrameLayout.LayoutParams(1280, 2400));
            hidden.loadUrl(METABOT);
            made.countDown();
        });
        made.await(10, TimeUnit.SECONDS);
        pageLatch.await(40, TimeUnit.SECONDS);
        waitReady(25);
    }

    private String eval(String js, int timeoutSec) throws Exception {
        final String[] out = {null};
        CountDownLatch l = new CountDownLatch(1);
        ui.post(() -> hidden.evaluateJavascript(js, v -> { out[0] = v; l.countDown(); }));
        if (!l.await(timeoutSec, TimeUnit.SECONDS)) throw new Exception("Sayfa cevap vermedi (zaman aşımı)");
        String v = out[0];
        if (v == null || v.equals("null")) return "";
        if (v.startsWith("\"")) return new JSONArray("[" + v + "]").getString(0);
        return v;
    }

    private boolean waitReady(int sec) throws Exception {
        long end = System.currentTimeMillis() + sec * 1000L;
        while (System.currentTimeMillis() < end) {
            String t = eval("document.title + '|' + document.readyState", 10).toLowerCase();
            if (t.endsWith("complete") && !t.contains("just a moment") && !t.contains("bir dakika")) return true;
            Thread.sleep(1000);
        }
        return false;
    }

    /** Sayfanın içinden aynı siteye istek: {s:durum, t:metin} */
    private JSONObject metabotGet(String path) throws Exception {
        synchronized (metabotLock) {
            ensureHidden();
            String js = "(function(){try{var x=new XMLHttpRequest();x.open('GET'," + JSONObject.quote(path) + ",false);x.send();"
                    + "return JSON.stringify({s:x.status,t:x.responseText});}catch(e){return JSON.stringify({s:-1,t:String(e)});}})()";
            String r = eval(js, 40);
            return r.isEmpty() ? new JSONObject().put("s", -1).put("t", "boş cevap") : new JSONObject(r);
        }
    }

    /** Profil sayfasındaki eşyaya tıkla, açılan pencerenin metnini oku: {ok, lines} */
    private JSONObject metabotItem(String url, String clickJs, String readJs, String closeJs, String unused) throws Exception {
        synchronized (metabotLock) {
            ensureHidden();
            String cur = eval("location.href", 10).split("#")[0];
            if (!cur.equals(url)) {
                pageLatch = new CountDownLatch(1);
                ui.post(() -> hidden.loadUrl(url));
                pageLatch.await(40, TimeUnit.SECONDS);
                waitReady(25);
                Thread.sleep(1200);
            }
            if (!"OK".equals(eval(clickJs, 10))) return new JSONObject().put("ok", false).put("error", "Eşya MetaBot sayfasında bulunamadı (karakteri yeniden sorgula)");
            String text = "";
            for (int i = 0; i < 24; i++) {
                Thread.sleep(500);
                text = eval(readJs, 10);
                if (!text.isEmpty() && !text.toLowerCase().contains("loading item details")) break;
            }
            try { eval(closeJs, 5); } catch (Exception ignored) { }
            JSONArray lines = new JSONArray();
            for (String l : text.split("\n")) if (!l.trim().isEmpty()) lines.put(l.trim());
            return new JSONObject().put("ok", lines.length() > 0).put("lines", lines).put("error", lines.length() > 0 ? "" : "Eşya detayı okunamadı");
        }
    }

    /** Profil sayfasını aç, (varsa) verilen JS'i çalıştır, HTML'i döndür: {ok, html, extra} */
    private JSONObject metabotPage(String url, String extraJs) throws Exception {
        synchronized (metabotLock) {
            ensureHidden();
            pageLatch = new CountDownLatch(1);
            ui.post(() -> hidden.loadUrl(url));
            if (!pageLatch.await(40, TimeUnit.SECONDS)) return new JSONObject().put("ok", false).put("error", "Sayfa yüklenemedi (zaman aşımı)");
            waitReady(25);
            // yetenek ve ekipman listeleri sayfada belirene kadar bekle (en fazla ~20 sn)
            String chk = "(function(){var t=(document.body&&document.body.innerText||'').toLowerCase();"
                    + "return (document.querySelectorAll('[aria-label$=\"\\u2014 details\"]').length>0&&t.indexOf('active skills')>=0)?'1':'0';})()";
            for (int i = 0; i < 40; i++) { if ("1".equals(eval(chk, 10))) break; Thread.sleep(500); }
            Thread.sleep(600);
            String html = eval("document.documentElement.outerHTML", 40);
            String extra = extraJs.isEmpty() ? "" : eval(extraJs, 90);
            return new JSONObject().put("ok", true).put("html", html).put("extra", extra);
        }
    }
}
