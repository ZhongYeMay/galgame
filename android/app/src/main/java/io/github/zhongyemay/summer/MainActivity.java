package io.github.zhongyemay.summer;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The complete, current original website runs locally in Android WebView.
 * Original /site is copied byte-for-byte into the APK by Gradle. The
 * index.html response only adds an Android-native mode bridge, which is not
 * written back to the source site/ or the user's offline saves.
 *
 * NO credentials are ever sent to website JavaScript.
 */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String START_URL = ORIGIN + "/assets/index.html";
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Map<String, List<JSONObject>> conversations = new HashMap<>();
    private final Set<String> validRoutes =
            new HashSet<>(java.util.Arrays.asList("mio", "nagi", "shiori"));

    private WebView browser;
    private WebViewAssetLoader assets;
    private String apiKey = "";
    private boolean requestBusy = false;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        immersive();
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        browser = new WebView(this);
        browser.setBackgroundColor(Color.rgb(16, 16, 31));
        browser.setOverScrollMode(View.OVER_SCROLL_NEVER);
        browser.setVerticalScrollBarEnabled(false);
        browser.setHorizontalScrollBarEnabled(false);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(16, 16, 31));
        root.addView(browser, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.CENTER));
        setContentView(root);

        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setDefaultTextEncodingName("UTF-8");
        // Original site fits 1600x900 CSS pixels to landscape device bounds.
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);

        browser.setWebChromeClient(new WebChromeClient());
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, false);

        assets = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/assets/",
                        new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        browser.setWebViewClient(new android.webkit.WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                String hostname = url.getHost();
                if ("https".equals(url.getScheme())
                        && "appassets.androidplatform.net".equals(hostname)) {
                    if ("/assets/index.html".equals(url.getPath())) {
                        return patchedOriginalIndex();
                    }
                    WebResourceResponse resource = assets.shouldInterceptRequest(url);
                    return resource != null ? resource : forbidden();
                }
                // The original design references only optional Noto web fonts.
                // They are allowed online; offline Windows/Android fonts are the
                // fallback. No remote script, iframe or game logic is loaded.
                if ("https".equals(url.getScheme())
                        && ("fonts.googleapis.com".equals(hostname)
                        || "fonts.gstatic.com".equals(hostname))) {
                    return null;
                }
                return forbidden();
            }

            @Override
            public boolean shouldOverrideUrlLoading(
                    WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                return !("https".equals(url.getScheme())
                        && "appassets.androidplatform.net".equals(url.getHost()));
            }
        });

        // Unlike addJavascriptInterface, this bridge is accessible only in
        // the exact HTTPS origin and main frame of our bundled game.
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            new AlertDialog.Builder(this)
                    .setTitle("需要更新 Android System WebView")
                    .setMessage("当前系统 WebView 不支持安全本地消息通道。请更新 Android System WebView 或 Chrome 后重新启动。")
                    .setPositiveButton("关闭", (d, w) -> finish())
                    .show();
            return;
        }
        WebViewCompat.addWebMessageListener(
                browser, "MayosNative", Collections.singleton(ORIGIN),
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (!isMainFrame || !ORIGIN.equals(sourceOrigin.toString()))
                        return;
                    String data = message.getData();
                    if (data != null) {
                        runOnUiThread(() -> handleMessage(data));
                    }
                });

        browser.loadUrl(START_URL);
    }

    private WebResourceResponse patchedOriginalIndex() {
        try {
            InputStream in = getAssets().open("index.html");
            byte[] raw = readAll(in);
            String html = new String(raw, StandardCharsets.UTF_8);
            String extra = "<script src=\"android-bridge.js\"></script>"
                    + "<script src=\"desktop-ai.js\"></script>";
            if (!html.contains("</body>") || !html.contains("src=\"game.js")) {
                return forbidden();
            }
            String patched = html.replace("</body>", extra + "</body>");
            return new WebResourceResponse("text/html", "UTF-8",
                    new ByteArrayInputStream(patched.getBytes(StandardCharsets.UTF_8)));
        } catch (IOException error) {
            return forbidden();
        }
    }

    private static byte[] readAll(InputStream input) throws IOException {
        try (InputStream in = input;
                ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
            byte[] bytes = new byte[8192];
            int count;
            while ((count = in.read(bytes)) != -1) buffer.write(bytes, 0, count);
            return buffer.toByteArray();
        }
    }

    private static WebResourceResponse forbidden() {
        return new WebResourceResponse(
                "text/plain", "UTF-8", 403, "Forbidden",
                Collections.singletonMap("Cache-Control", "no-store"),
                new ByteArrayInputStream(new byte[0]));
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) immersive();
    }

    private void send(JSONObject payload) {
        if (browser == null || isFinishing()) return;
        String json = JSONObject.quote(payload.toString());
        runOnUiThread(() -> {
            if (browser != null && !isFinishing()) {
                browser.evaluateJavascript(
                        "if(window.__mayosAndroidHostDeliver)"
                        + "window.__mayosAndroidHostDeliver(" + json + ");", null);
            }
        });
    }

    private void event(String type, int id, String route, String text) {
        try {
            JSONObject payload = new JSONObject()
                    .put("type", type).put("id", id).put("route", route);
            if (text != null) payload.put("text", text);
            send(payload);
        } catch (JSONException ignored) {}
    }

    private static String text(JSONObject json, String name, int maxLength) {
        String value = json.optString(name, "");
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    private void handleMessage(String data) {
        JSONObject request;
        try {
            request = new JSONObject(data);
        } catch (JSONException error) {
            return;
        }
        String type = text(request, "type", 40);
        String route = text(request, "route", 20);
        int id = request.optInt("id", 0);
        switch (type) {
            case "fullscreen":
                immersive();
                event("fullscreen", id, route, null);
                return;
            case "key-status":
                try {
                    send(new JSONObject().put("type", "key-status")
                            .put("ready", !apiKey.isEmpty()));
                } catch (JSONException ignored) {}
                return;
            case "set-key":
                openKeyDialog();
                return;
            case "reset":
                if (requestBusy) {
                    event("error", id, route,
                            "请先完成当前请求，再切换角色。");
                } else if (validRoutes.contains(route)) {
                    conversations.put(route, new ArrayList<>());
                    event("reset-ok", id, route, null);
                }
                return;
            case "chat":
            case "proactive":
            case "test-key":
                if (requestBusy) {
                    event("error", id, route, "上一轮仍在生成，请稍后。");
                    return;
                }
                if (apiKey.isEmpty()) {
                    event("error", id, route,
                            "请先点击「API 设置」，输入自己的 DeepSeek API Key。");
                    return;
                }
                if (!"test-key".equals(type) && !validRoutes.contains(route))
                    return;
                String player = "chat".equals(type)
                        ? text(request, "text", 800).trim() : "";
                if ("chat".equals(type) && player.isEmpty()) {
                    event("error", id, route, "请先填写回答。");
                    return;
                }
                requestBusy = true;
                final String secret = apiKey;
                final List<JSONObject> previous = new ArrayList<>(
                        conversations.getOrDefault(route, new ArrayList<>()));
                network.execute(() -> {
                    String reply = null, error = null;
                    try {
                        reply = requestDeepSeek(secret, route, type, player, previous);
                    } catch (IOException failure) {
                        error = failure.getMessage() != null
                                && failure.getMessage().equals("INVALID_KEY")
                                ? "DeepSeek API Key 无效或已过期。"
                                : "网络或 DeepSeek 服务暂不可用，请检查连接。";
                    } catch (Exception failure) {
                        error = "模型暂时无法返回有效对白。";
                    }
                    String finalReply = reply, finalError = error;
                    runOnUiThread(() -> {
                        requestBusy = false;
                        if (finalError != null) {
                            event("error", id, route, finalError);
                            return;
                        }
                        if ("test-key".equals(type)) {
                            event("test-ok", id, route, null);
                            return;
                        }
                        List<JSONObject> history = conversations.computeIfAbsent(
                                route, key -> new ArrayList<>());
                        if ("chat".equals(type)) history.add(turn("user", player));
                        history.add(turn("assistant", finalReply));
                        while (history.size() > 12) history.remove(0);
                        event("reply", id, route, finalReply);
                    });
                });
                return;
            default:
                // No generic URL, file or arbitrary native action is exposed.
        }
    }

    private static JSONObject turn(String role, String content) {
        try {
            return new JSONObject().put("role", role).put("content", content);
        } catch (JSONException error) {
            return new JSONObject();
        }
    }

    private static String characterPrompt(String route) {
        switch (route) {
            case "nagi":
                return "你是原创全年龄视觉小说《夏日未寄》的虚构角色橘凪，26岁摄影师。"
                        + "镰仓的海边、摄影和自由是主要话题。";
            case "shiori":
                return "你是原创全年龄视觉小说《夏日未寄》的虚构角色月島栞，27岁旧书店主理人。"
                        + "书籍、日常和镰仓的街景是主要话题。";
            default:
                return "你是原创全年龄视觉小说《夏日未寄》的虚构角色白石澪，25岁电台制作人。"
                        + "电台、音乐和镰仓的夏天是主要话题。";
        }
    }

    private static String requestDeepSeek(
            String key, String route, String type, String text,
            List<JSONObject> history) throws IOException, JSONException {
        JSONArray messages = new JSONArray();
        if ("test-key".equals(type)) {
            messages.put(turn("system", "只回复OK。"));
            messages.put(turn("user", "OK"));
        } else {
            messages.put(turn("system", characterPrompt(route)
                    + "用自然中文，偶尔少量日语口语，每次仅回复女主本人的1到3句对白。"
                    + "女主可主动发起话题，不替玩家回答，不列出选择题。"
                    + "保持友善、全年龄适宜，不进行露骨、性或排他性依赖对话。"));
            for (JSONObject item : history) messages.put(item);
            messages.put(turn("user", "proactive".equals(type)
                    ? "请主动提出一个与场景有关的轻松问题。" : text));
        }
        JSONObject request = new JSONObject()
                .put("model", "deepseek-flash")
                .put("max_tokens", "test-key".equals(type) ? 8 : 200)
                .put("temperature", 0.9)
                .put("stream", false)
                .put("messages", messages);

        HttpURLConnection connection = (HttpURLConnection) new URL(
                "https://api.deepseek.com/chat/completions").openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(35000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setRequestProperty("Authorization", "Bearer " + key);
        try {
            byte[] body = request.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream stream = connection.getOutputStream()) {
                stream.write(body);
            }
            int code = connection.getResponseCode();
            if (code == 401 || code == 403) throw new IOException("INVALID_KEY");
            if (code < 200 || code > 299) throw new IOException("HTTP_ERROR");
            String response = new String(readAll(connection.getInputStream()),
                    StandardCharsets.UTF_8);
            JSONObject json = new JSONObject(response);
            String answer = json.getJSONArray("choices").getJSONObject(0)
                    .getJSONObject("message").optString("content").trim();
            if (answer.isEmpty()) throw new IOException("EMPTY_REPLY");
            return answer.length() > 1500 ? answer.substring(0, 1500) : answer;
        } finally {
            connection.disconnect();
        }
    }

    private void openKeyDialog() {
        EditText input = new EditText(this);
        input.setHint("DeepSeek API Key（仅本次运行）");
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT
                | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        FrameLayout frame = new FrameLayout(this);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        int inset = (int) (24 * getResources().getDisplayMetrics().density);
        params.setMargins(inset, inset / 2, inset, 0);
        frame.addView(input, params);
        new AlertDialog.Builder(this)
                .setTitle("AI 模式 API 设置")
                .setMessage("密钥只在 Android 进程内存中使用，不会存入游戏存档或 APK。"
                        + "离线剧情模式完全不需要密钥。")
                .setView(frame)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存本次密钥", (dialog, which) -> {
                    apiKey = input.getText().toString().trim();
                    try {
                        send(new JSONObject().put("type", "key-status")
                                .put("ready", !apiKey.isEmpty()));
                    } catch (JSONException ignored) {}
                    input.setText("");
                })
                .show();
    }

    @Override
    public void onBackPressed() {
        if (browser == null) {
            super.onBackPressed();
            return;
        }
        browser.evaluateJavascript(
                "(function(){const m=document.getElementById('modal');"
                + "if(m&&!m.hidden){closeModal();return 'closed';}"
                + "const t=document.getElementById('titleScreen');"
                + "if(t&&!t.hidden)return 'exit';"
                + "goTitle();return 'title';})()", response -> {
                    if ("\"exit\"".equals(response)) finish();
                });
    }

    @Override
    protected void onDestroy() {
        apiKey = "";
        network.shutdownNow();
        if (browser != null) {
            browser.stopLoading();
            browser.destroy();
            browser = null;
        }
        super.onDestroy();
    }
}
