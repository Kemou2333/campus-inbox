package io.github.kemou2333.campusinbox;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.CalendarContract;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebResourceErrorCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Local first host. Only bundled main-frame content receives the limited native bridge. */
public final class MainActivity extends Activity {
    private static final int PICK_FILE = 20;
    private static final int SAVE_FILE = 21;
    private static final int NOTIFICATION_PERMISSION = 22;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private WebView web;
    private FrameLayout root;
    private NativeExport exports;
    private ValueCallback<Uri[]> fileCallback;
    private volatile JavaScriptReplyProxy saveReply;
    private String saveRequest;
    private String saveToken;
    private final ArrayDeque<String> shareQueue = new ArrayDeque<>();
    private boolean bridgeAvailable;
    private boolean backPending;
    private long lastBack;
    private NativeReminders reminders;
    private String openedNotice;
    private JavaScriptReplyProxy reminderPermissionReply;
    private JSONObject reminderPermissionPayload;
    private String reminderPermissionRequest;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        reminders = new NativeReminders(this);
        reminders.restoreAfterBoot();
        try { exports = new NativeExport(getCacheDir()); } catch (IOException ignored) { exports = null; }
        if (state != null) {
            ArrayList<String> saved = state.getStringArrayList("shareQueue");
            if (saved != null) for (String text : saved) {
                if (text != null && !text.isEmpty() && text.length() <= 20_000 && shareQueue.size() < 10) shareQueue.addLast(text);
            }
            String notice = state.getString("openedNotice");
            if (NativePolicy.validReminderId(notice)) openedNotice = notice;
        } else {
            receiveShare(getIntent());
            receiveOpenedNotice(getIntent());
        }

        root = new FrameLayout(this);
        root.setBackgroundColor(themeColor("surface"));
        web = new WebView(this);
        web.setBackgroundColor(themeColor("surface"));
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        configureInsets(root);
        configureWeb();
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
        if (state == null || web.restoreState(state) == null) web.loadUrl(NativePolicy.HOME);
    }

    @SuppressWarnings("deprecation")
    private void configureInsets(FrameLayout root) {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
                // WebView must not reapply already handled bars/cutout insets.
                return WindowInsets.CONSUMED;
            });
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) controller.setSystemBarsAppearance(
                    isDark() ? 0 : WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        } else {
            root.setFitsSystemWindows(true);
            getWindow().getDecorView().setSystemUiVisibility(isDark() ? 0 :
                    View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
        applyAppearance(isDark());
        root.requestApplyInsets();
    }

    @SuppressWarnings("deprecation")
    private void applyAppearance(boolean dark) {
        int surface = Color.parseColor(dark ? "#111417" : "#F7F9FA");
        root.setBackgroundColor(surface);
        web.setBackgroundColor(surface);
        getWindow().setStatusBarColor(surface);
        getWindow().setNavigationBarColor(surface);
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            if (controller != null) controller.setSystemBarsAppearance(dark ? 0 : light, light);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(dark ? 0 :
                    View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
    }

    @SuppressWarnings("deprecation")
    private void configureWeb() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        final WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClientCompat() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("appassets.androidplatform.net".equals(uri.getHost())) {
                    WebResourceResponse response = assets.shouldInterceptRequest(uri);
                    return response != null ? response : missingAsset();
                }
                return null;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                String url = request.getUrl().toString();
                if (NativePolicy.isTrustedPage(url)) return false;
                if (request.hasGesture()) openExternal(url);
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!NativePolicy.isTrustedPage(url)) return;
                if (!shareQueue.isEmpty()) signalShare();
                if (openedNotice != null) signalOpenedNotice();
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceErrorCompat error) {
                if (!request.isForMainFrame()) return;
                new AlertDialog.Builder(MainActivity.this).setTitle("页面未能打开")
                        .setMessage("请重试。已经保存的通知会保留在手机中。")
                        .setPositiveButton("重试", (dialog, which) -> web.loadUrl(NativePolicy.HOME))
                        .setNegativeButton("关闭", null).show();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!NativePolicy.isTrustedPage(view.getUrl())) return false;
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType("*/*");
                picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                String[] accepted = params.getAcceptTypes();
                ArrayList<String> mimeTypes = new ArrayList<>();
                if (accepted != null) for (String type : accepted) {
                    if (type != null && type.matches("[A-Za-z0-9.+*-]+/[A-Za-z0-9.+*-]+")) mimeTypes.add(type);
                }
                if (!mimeTypes.isEmpty()) picker.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toArray(new String[0]));
                try { startActivityForResult(picker, PICK_FILE); }
                catch (ActivityNotFoundException ignored) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                    toast(getString(R.string.no_picker));
                }
                return true;
            }
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, android.os.Message message) {
                if (!gesture || !NativePolicy.isTrustedPage(view.getUrl())) return false;
                WebView popup = new WebView(MainActivity.this);
                popup.getSettings().setAllowFileAccess(false);
                popup.getSettings().setAllowContentAccess(false);
                popup.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
                popup.setWebViewClient(new WebViewClientCompat() {
                    @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                        openExternal(request.getUrl().toString());
                        v.post(v::destroy);
                        return true;
                    }
                });
                ((WebView.WebViewTransport) message.obj).setWebView(popup);
                message.sendToTarget();
                return true;
            }
        });
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
            if (NativePolicy.isExternalLink(url)) openExternal(url);
            else toast(getString(R.string.blob_download_hint));
        });
        bridgeAvailable = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER);
        if (bridgeAvailable) WebViewCompat.addWebMessageListener(web, "CampusNative",
                Collections.singleton(NativePolicy.ORIGIN), (view, message, origin, mainFrame, reply) -> {
                    if (!mainFrame || !NativePolicy.isTrustedOrigin(origin.toString())
                            || !NativePolicy.isTrustedPage(view.getUrl())
                            || message.getType() != WebMessageCompat.TYPE_STRING) return;
                    handleMessage(message.getData(), reply);
                });
    }

    private WebResourceResponse missingAsset() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(),
                new ByteArrayInputStream("Missing bundled asset".getBytes(StandardCharsets.UTF_8)));
    }

    private void handleMessage(String raw, JavaScriptReplyProxy reply) {
        String id = "";
        try {
            if (raw == null || raw.length() > NativePolicy.MAX_MESSAGE_CHARS) throw new IllegalArgumentException("请求过大");
            JSONObject message = new JSONObject(raw);
            id = message.getString("id");
            if (!id.matches("[A-Za-z0-9_.:-]{1,80}")) throw new IllegalArgumentException("请求编号不正确");
            String action = message.getString("action");
            JSONObject payload = message.optJSONObject("payload");
            if (payload == null) payload = new JSONObject();
            switch (action) {
                case "capabilities":
                    respond(reply, id, new JSONObject().put("calendar", calendarIntent().resolveActivity(getPackageManager()) != null)
                            .put("fileSave", exports != null).put("shareText", true).put("localReminders", true).put("appearance", true).put("theme", theme()));
                    break;
                case "appearance":
                    if (!(payload.opt("dark") instanceof Boolean)) throw new IllegalArgumentException("主题模式不正确");
                    applyAppearance(payload.getBoolean("dark"));
                    respond(reply, id, new JSONObject());
                    break;
                case "consumeShare":
                    String text = shareQueue.pollFirst();
                    respond(reply, id, new JSONObject().put("text", text == null ? JSONObject.NULL : text)
                            .put("remaining", shareQueue.size()));
                    break;
                case "calendar": launchCalendar(payload, reply, id); break;
                case "consumeOpenedNotice":
                    String notice = openedNotice;
                    openedNotice = null;
                    respond(reply, id, new JSONObject().put("id", notice == null ? JSONObject.NULL : notice));
                    break;
                case "scheduleReminder": scheduleReminder(payload, reply, id); break;
                case "cancelReminder":
                    String reminderId = checkedText(payload, "id", 100, true);
                    if (!NativePolicy.validReminderId(reminderId)) throw new IllegalArgumentException("通知编号不正确");
                    reminders.cancel(reminderId);
                    respond(reply, id, new JSONObject().put("status", "cancelled"));
                    break;
                case "saveBegin": case "saveChunk": case "saveFinish": case "saveCancel":
                    handleSave(action, payload, reply, id); break;
                default: throw new IllegalArgumentException("暂不支持这项操作");
            }
        } catch (Exception error) { reject(reply, id, safeError(error)); }
    }

    private Intent calendarIntent() { return new Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI); }

    private void scheduleReminder(JSONObject payload, JavaScriptReplyProxy reply, String requestId) throws JSONException {
        String id = checkedText(payload, "id", 100, true);
        checkedText(payload, "title", 200, true);
        checkedText(payload, "body", 1000, false);
        if (!NativePolicy.validReminder(id, checkedLong(payload, "triggerMillis"), System.currentTimeMillis())) {
            throw new IllegalArgumentException("请确认提醒对应的通知和未来时间");
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            if (reminderPermissionReply != null) throw new IllegalStateException("请先完成通知权限选择");
            reminderPermissionReply = reply;
            reminderPermissionPayload = payload;
            reminderPermissionRequest = requestId;
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION);
        } else completeReminder(payload, reply, requestId);
    }

    private void completeReminder(JSONObject payload, JavaScriptReplyProxy reply, String requestId) {
        try {
            if (!reminders.enabled()) {
                respond(reply, requestId, new JSONObject().put("status", "permission-denied").put("approximate", true));
                return;
            }
            reminders.schedule(checkedText(payload, "id", 100, true), checkedText(payload, "title", 200, true),
                    checkedText(payload, "body", 1000, false), checkedLong(payload, "triggerMillis"));
            respond(reply, requestId, new JSONObject().put("status", "scheduled").put("approximate", true));
        } catch (Exception error) { reject(reply, requestId, safeError(error)); }
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code != NOTIFICATION_PERMISSION || reminderPermissionReply == null) return;
        JavaScriptReplyProxy reply = reminderPermissionReply;
        JSONObject payload = reminderPermissionPayload;
        String requestId = reminderPermissionRequest;
        reminderPermissionReply = null;
        reminderPermissionPayload = null;
        reminderPermissionRequest = null;
        completeReminder(payload, reply, requestId);
    }

    private void launchCalendar(JSONObject payload, JavaScriptReplyProxy reply, String id) throws JSONException {
        String title = checkedText(payload, "title", 200, true);
        String description = checkedText(payload, "description", 6000, false);
        String location = checkedText(payload, "location", 500, false);
        long start = checkedLong(payload, "startMillis");
        boolean allDay = payload.optBoolean("allDay", false);
        long end = payload.has("endMillis") ? checkedLong(payload, "endMillis") : start + (allDay ? 86_400_000 : 3_600_000);
        if (!NativePolicy.validCalendar(start, end)) throw new IllegalArgumentException("请先确认完整的日历时间");
        Intent calendar = calendarIntent().putExtra(CalendarContract.Events.TITLE, title)
                .putExtra(CalendarContract.Events.DESCRIPTION, description)
                .putExtra(CalendarContract.Events.EVENT_LOCATION, location)
                .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start)
                .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end)
                .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, allDay);
        try {
            startActivity(calendar);
            respond(reply, id, new JSONObject().put("status", "opened").put("saved", false));
        } catch (ActivityNotFoundException ignored) { reject(reply, id, "手机上没有可用的日历应用，可以改用日历文件导出"); }
    }

    private String checkedText(JSONObject payload, String name, int max, boolean required) throws JSONException {
        Object value = payload.opt(name);
        if (value == null || value == JSONObject.NULL) {
            if (required) throw new IllegalArgumentException("请先填写日历标题");
            return "";
        }
        if (!(value instanceof String) || ((String) value).length() > max) throw new IllegalArgumentException("日历文字过长或格式不正确");
        String text = (String) value;
        if (required && text.trim().isEmpty()) throw new IllegalArgumentException("请先填写日历标题");
        return text;
    }

    private long checkedLong(JSONObject payload, String name) throws JSONException {
        Object value = payload.get(name);
        if (!(value instanceof Number)) throw new IllegalArgumentException("时间或文件大小的格式不正确");
        double number = ((Number) value).doubleValue();
        long integer = ((Number) value).longValue();
        if (!Double.isFinite(number) || number != (double) integer) throw new IllegalArgumentException("时间或文件大小的格式不正确");
        return integer;
    }

    private void handleSave(String action, JSONObject payload, JavaScriptReplyProxy reply, String id) {
        if (exports == null) { reject(reply, id, "当前无法保存文件，请重新打开应用再试"); return; }
        io.execute(() -> {
            try {
                if ("saveBegin".equals(action)) {
                    NativeExport.Session session = exports.begin(payload.getString("name"), payload.optString("mime"), checkedLong(payload, "size"));
                    respond(reply, id, new JSONObject().put("token", session.token));
                } else if ("saveChunk".equals(action)) {
                    long bytes = exports.append(payload.getString("token"), payload.getString("base64"));
                    respond(reply, id, new JSONObject().put("bytes", bytes));
                } else if ("saveFinish".equals(action)) {
                    NativeExport.Session session = exports.seal(payload.getString("token"));
                    runOnUiThread(() -> openSavePicker(session, reply, id));
                } else {
                    String token = payload.getString("token");
                    if (saveReply != null) throw new IllegalStateException("请先关闭系统保存窗口");
                    exports.cancel(token);
                    respond(reply, id, new JSONObject().put("status", "cancelled"));
                }
            } catch (Exception error) { reject(reply, id, safeError(error)); }
        });
    }

    private void openSavePicker(NativeExport.Session session, JavaScriptReplyProxy reply, String id) {
        if (isFinishing() || isDestroyed()) { io.execute(exports::clear); return; }
        if (!NativePolicy.isTrustedPage(web.getUrl())) { io.execute(exports::clear); return; }
        saveReply = reply; saveRequest = id; saveToken = session.token;
        Intent picker = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType(session.mime).putExtra(Intent.EXTRA_TITLE, session.name);
        try { startActivityForResult(picker, SAVE_FILE); }
        catch (ActivityNotFoundException ignored) {
            saveReply = null; saveRequest = null; saveToken = null;
            io.execute(exports::clear);
            reject(reply, id, "手机上没有可保存文件的应用");
        }
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == PICK_FILE && fileCallback != null) {
            ValueCallback<Uri[]> callback = fileCallback; fileCallback = null;
            ArrayList<Uri> selected = new ArrayList<>();
            if (result == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null) for (int i = 0; i < Math.min(clip.getItemCount(), 20); i++) addContentUri(selected, clip.getItemAt(i).getUri());
                else addContentUri(selected, data.getData());
            }
            callback.onReceiveValue(selected.isEmpty() ? null : selected.toArray(new Uri[0]));
        }
        if (code == SAVE_FILE && saveReply != null) {
            JavaScriptReplyProxy reply = saveReply;
            String id = saveRequest; String token = saveToken;
            saveReply = null; saveRequest = null; saveToken = null;
            Uri uri = data == null ? null : data.getData();
            io.execute(() -> {
                try {
                    if (result != RESULT_OK || uri == null) {
                        respond(reply, id, new JSONObject().put("status", "cancelled"));
                    } else {
                        if (!"content".equals(uri.getScheme())) throw new IOException("文件保存位置不受支持");
                        try (OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
                            if (output == null) throw new IOException("无法写入所选位置");
                            exports.copyTo(token, output);
                        }
                        respond(reply, id, new JSONObject().put("status", "saved"));
                    }
                } catch (Exception error) { reject(reply, id, "保存未完成，请换一个位置重试"); }
                finally { exports.clear(); }
            });
        }
    }

    private void addContentUri(ArrayList<Uri> list, Uri uri) {
        if (uri != null && "content".equals(uri.getScheme()) && !list.contains(uri)) list.add(uri);
    }

    private void receiveShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction()) || !"text/plain".equals(intent.getType())) return;
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (text != null && text.length() > 0 && text.length() <= 20_000) {
            if (shareQueue.size() < 10) shareQueue.addLast(text.toString());
            else toast("待接收的分享较多，请先整理应用内的通知后再分享");
        } else if (text != null && text.length() > 20_000) toast("分享内容过长，请复制需要的通知原文再粘贴");
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        receiveShare(intent);
        receiveOpenedNotice(intent);
        if (web != null && NativePolicy.isTrustedPage(web.getUrl())) {
            if (!shareQueue.isEmpty()) signalShare();
            if (openedNotice != null) signalOpenedNotice();
        }
    }

    private void signalShare() {
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('campus-native-share'));", null);
    }

    private void receiveOpenedNotice(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        String id = intent.getStringExtra("campusNoticeId");
        if (NativePolicy.validReminderId(id)) openedNotice = id;
    }

    private void signalOpenedNotice() {
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('campus-native-open-notice'));", null);
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        if (web != null) web.saveState(state);
        if (!shareQueue.isEmpty()) state.putStringArrayList("shareQueue", new ArrayList<>(shareQueue));
        if (openedNotice != null) state.putString("openedNotice", openedNotice);
        super.onSaveInstanceState(state);
    }

    @Override @SuppressWarnings("deprecation") public void onBackPressed() { handleBack(); }

    private void handleBack() {
        if (web == null || backPending) return;
        backPending = true;
        String script = "(()=>{const e=new CustomEvent('campus-native-back',{cancelable:true});" +
                "if(!window.dispatchEvent(e))return true;" +
                "const d=[...document.querySelectorAll('dialog[open]')].pop();" +
                "if(d){const c=new Event('cancel',{cancelable:true});if(d.dispatchEvent(c))d.close();return true;}" +
                "return false;})()";
        web.evaluateJavascript(script, result -> {
            backPending = false;
            if ("true".equals(result)) { lastBack = 0; return; }
            if (web.canGoBack()) { lastBack = 0; web.goBack(); return; }
            long now = SystemClock.elapsedRealtime();
            if (lastBack != 0 && now - lastBack < 1800) finish();
            else { lastBack = now; toast(getString(R.string.exit_hint)); }
        });
    }

    private void openExternal(String url) {
        if (!NativePolicy.isExternalLink(url)) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException ignored) { toast(getString(R.string.no_browser)); }
    }

    private boolean isDark() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    private JSONObject theme() throws JSONException {
        JSONObject result = new JSONObject().put("dark", isDark());
        for (String key : new String[]{"primary", "onPrimary", "primaryContainer", "onPrimaryContainer", "surface", "surfaceVariant", "onSurface", "outline", "secondary", "tertiary"}) {
            result.put(key, String.format(java.util.Locale.ROOT, "#%06X", themeColor(key) & 0xFFFFFF));
        }
        return result;
    }

    private int themeColor(String key) {
        boolean dark = isDark();
        if (Build.VERSION.SDK_INT >= 31) {
            int color;
            switch (key) {
                case "primary": color = dark ? android.R.color.system_accent1_200 : android.R.color.system_accent1_600; break;
                case "onPrimary": color = dark ? android.R.color.system_accent1_800 : android.R.color.system_accent1_0; break;
                case "primaryContainer": color = dark ? android.R.color.system_accent1_700 : android.R.color.system_accent1_100; break;
                case "onPrimaryContainer": color = dark ? android.R.color.system_accent1_100 : android.R.color.system_accent1_900; break;
                case "surface": color = dark ? android.R.color.system_neutral1_900 : android.R.color.system_neutral1_10; break;
                case "surfaceVariant": color = dark ? android.R.color.system_neutral2_700 : android.R.color.system_neutral2_100; break;
                case "onSurface": color = dark ? android.R.color.system_neutral1_100 : android.R.color.system_neutral1_900; break;
                case "outline": color = dark ? android.R.color.system_neutral2_400 : android.R.color.system_neutral2_500; break;
                case "secondary": color = dark ? android.R.color.system_accent2_200 : android.R.color.system_accent2_600; break;
                default: color = dark ? android.R.color.system_accent3_200 : android.R.color.system_accent3_600;
            }
            return getColor(color);
        }
        switch (key) {
            case "primary": return Color.parseColor(dark ? "#D0BCFF" : "#6750A4");
            case "onPrimary": return Color.parseColor(dark ? "#381E72" : "#FFFFFF");
            case "primaryContainer": return Color.parseColor(dark ? "#4F378B" : "#EADDFF");
            case "onPrimaryContainer": return Color.parseColor(dark ? "#EADDFF" : "#21005D");
            case "surface": return Color.parseColor(dark ? "#1C1B1F" : "#FFFBFE");
            case "surfaceVariant": return Color.parseColor(dark ? "#49454F" : "#E7E0EC");
            case "onSurface": return Color.parseColor(dark ? "#E6E1E5" : "#1C1B1F");
            case "outline": return Color.parseColor(dark ? "#938F99" : "#79747E");
            case "secondary": return Color.parseColor(dark ? "#CCC2DC" : "#625B71");
            default: return Color.parseColor(dark ? "#EFB8C8" : "#7D5260");
        }
    }

    private void respond(JavaScriptReplyProxy reply, String id, JSONObject data) {
        postReply(reply, id, data, null);
    }

    private void reject(JavaScriptReplyProxy reply, String id, String error) {
        postReply(reply, id, null, error);
    }

    private void postReply(JavaScriptReplyProxy reply, String id, JSONObject data, String error) {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed() || web == null || !NativePolicy.isTrustedPage(web.getUrl())) return;
            try {
                JSONObject response = new JSONObject().put("id", id).put("ok", error == null);
                if (error == null) response.put("data", data);
                else response.put("error", error);
                reply.postMessage(response.toString());
            } catch (JSONException | IllegalStateException ignored) { /* The requesting page may have closed. */ }
        });
    }

    private String safeError(Exception error) {
        if (error instanceof IllegalArgumentException || error instanceof IllegalStateException) {
            String message = error.getMessage();
            if (message != null && message.length() < 100 && !message.contains("/")) return message;
        }
        return "操作未完成，请检查内容后再试";
    }

    private void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_SHORT).show(); }

    @Override protected void onPause() { if (web != null) web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }

    @Override protected void onDestroy() {
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        if (web != null) { web.stopLoading(); web.destroy(); web = null; }
        if (exports != null) io.execute(exports::clear);
        io.shutdown();
        super.onDestroy();
    }
}
