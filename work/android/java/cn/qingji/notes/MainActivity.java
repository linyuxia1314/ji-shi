package cn.qingji.notes;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PersistableBundle;
import android.util.AtomicFile;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String APP_URL = "https://" + APP_HOST + "/index.html";
    private static final int CREATE_DOCUMENT = 301;
    private static final int OPEN_DOCUMENT = 302;
    private static final int MAX_VAULT_BYTES = 32 * 1024 * 1024;
    private static final int MAX_IMPORT_BYTES = 22 * 1000 * 1000;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService documentIo = Executors.newSingleThreadExecutor();
    private FrameLayout root;
    private WebView web;
    private AtomicFile vault;
    private boolean externalFlow;
    private boolean pageReady;
    private String pendingRequest;
    private byte[] pendingOutput;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        vault = new AtomicFile(new File(getFilesDir(), "notes-v1.json"));
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(247, 250, 246));
        setContentView(root);
        configureInsets();
        createWebView();
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    private void configureInsets() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsAppearance(
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS |
                    WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS |
                    WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
            }
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
                return WindowInsets.CONSUMED;
            });
            root.requestApplyInsets();
        } else {
            root.setFitsSystemWindows(true);
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
    }

    private void createWebView() {
        pageReady = false;
        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= 29) settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        if (Build.VERSION.SDK_INT >= 33) settings.setAlgorithmicDarkeningAllowed(false);
        WebView.setWebContentsDebuggingEnabled(false);
        web.addJavascriptInterface(new LocalBridge(), "QingjiAndroid");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && APP_HOST.equals(uri.getHost()) && "/index.html".equals(uri.getPath())) {
                    try {
                        return new WebResourceResponse("text/html", "UTF-8", 200, "OK",
                            Collections.singletonMap("Cache-Control", "no-store"), getAssets().open("index.html"));
                    } catch (IOException ignored) { }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null,
                    new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !APP_URL.equals(request.getUrl().toString());
            }
            @Override public void onPageFinished(WebView view, String url) {
                pageReady = APP_URL.equals(url);
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                pageReady = false;
                root.removeView(view);
                view.destroy();
                new AlertDialog.Builder(MainActivity.this).setTitle("重新打开笔记")
                    .setMessage("显示组件已关闭，已保存的笔记不受影响。")
                    .setPositiveButton("重新打开", (dialog, which) -> createWebView())
                    .setNegativeButton("退出", (dialog, which) -> finish()).setCancelable(false).show();
                return true;
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        web.loadUrl(APP_URL);
    }

    @Override public void onBackPressed() { handleBack(); }

    private void handleBack() {
        if (!pageReady || web == null) { moveTaskToBack(true); return; }
        web.evaluateJavascript("window.qingjiAndroidBack ? window.qingjiAndroidBack() : false", result -> {
            if (!"true".equals(result)) moveTaskToBack(true);
        });
    }

    @Override protected void onPause() {
        if (pageReady && !externalFlow && web != null) {
            web.evaluateJavascript("window.qingjiAndroidPause && window.qingjiAndroidPause()", null);
        }
        super.onPause();
    }

    @Override protected void onDestroy() {
        pageReady = false;
        if (web != null) { root.removeView(web); web.removeJavascriptInterface("QingjiAndroid"); web.destroy(); }
        documentIo.shutdown();
        super.onDestroy();
    }

    private void javascript(String code) {
        mainHandler.post(() -> {
            if (!isFinishing() && !isDestroyed() && pageReady && web != null) web.evaluateJavascript(code, null);
        });
    }

    private void nativeError(String message) {
        javascript("window.qingjiNativeError && window.qingjiNativeError(" + JSONObject.quote(message) + ")");
    }

    private void documentResult(String request, boolean success, String error) {
        if (request == null) return;
        javascript("window.qingjiDocumentResult && window.qingjiDocumentResult(" +
            JSONObject.quote(request) + "," + success + "," + JSONObject.quote(error == null ? "" : error) + ")");
    }

    private static byte[] readLimited(InputStream stream, int limit) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = stream.read(buffer)) != -1) {
            if (output.size() + count > limit) throw new IOException("File too large");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    public final class LocalBridge {
        @JavascriptInterface public boolean copyRecoveryCode(String code) {
            if (code == null || !code.matches("[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}(-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}){7}")) return false;
            try {
                ClipData clip = ClipData.newPlainText("轻记恢复码", code);
                PersistableBundle extras = new PersistableBundle();
                extras.putBoolean("android.content.extra.IS_SENSITIVE", true);
                clip.getDescription().setExtras(extras);
                ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (clipboard == null) return false;
                clipboard.setPrimaryClip(clip);
                return true;
            } catch (RuntimeException ignored) { return false; }
        }

        @JavascriptInterface public synchronized String readVault() {
            if (!vault.getBaseFile().exists() && !new File(vault.getBaseFile().getPath() + ".bak").exists()) return null;
            try (InputStream input = vault.openRead()) {
                return new String(readLimited(input, MAX_VAULT_BYTES), StandardCharsets.UTF_8);
            } catch (IOException ignored) {
                return "{\"nativeReadError\":true}";
            }
        }

        @JavascriptInterface public synchronized boolean writeVault(String json) {
            if (json == null || json.length() > MAX_VAULT_BYTES) return false;
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_VAULT_BYTES) return false;
            FileOutputStream output = null;
            try {
                output = vault.startWrite();
                output.write(bytes);
                output.getFD().sync();
                vault.finishWrite(output);
                return true;
            } catch (IOException ignored) {
                if (output != null) vault.failWrite(output);
                return false;
            }
        }

        @JavascriptInterface public void saveDocument(String request, String filename, String mime, String text) {
            if (text == null || text.length() > MAX_VAULT_BYTES || request == null) {
                documentResult(request, false, "导出内容过大"); return;
            }
            final byte[] output = text.getBytes(StandardCharsets.UTF_8);
            mainHandler.post(() -> {
                if (isFinishing() || pendingRequest != null || externalFlow) {
                    documentResult(request, false, "已有文件操作正在进行"); return;
                }
                pendingRequest = request;
                pendingOutput = output;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("text/plain".equals(mime) ? "text/plain" : "application/json");
                intent.putExtra(Intent.EXTRA_TITLE, filename);
                externalFlow = true;
                try { startActivityForResult(intent, CREATE_DOCUMENT); }
                catch (ActivityNotFoundException error) {
                    externalFlow = false; pendingRequest = null; pendingOutput = null;
                    documentResult(request, false, "无法打开系统文件选择器");
                }
            });
        }

        @JavascriptInterface public void openBackup() {
            mainHandler.post(() -> {
                if (isFinishing() || externalFlow) return;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES,
                    new String[]{"application/json", "text/plain", "application/octet-stream"});
                externalFlow = true;
                try { startActivityForResult(intent, OPEN_DOCUMENT); }
                catch (ActivityNotFoundException error) { externalFlow = false; nativeError("无法打开系统文件选择器"); }
            });
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent result) {
        super.onActivityResult(requestCode, resultCode, result);
        if (requestCode != CREATE_DOCUMENT && requestCode != OPEN_DOCUMENT) return;
        externalFlow = false;
        Uri uri = result == null ? null : result.getData();
        if (requestCode == CREATE_DOCUMENT) {
            final String request = pendingRequest;
            final byte[] output = pendingOutput;
            pendingRequest = null; pendingOutput = null;
            if (resultCode != RESULT_OK || uri == null) { documentResult(request, false, null); return; }
            if (output == null) { nativeError("导出已中断，请重新导出"); return; }
            documentIo.execute(() -> {
                try (OutputStream stream = getContentResolver().openOutputStream(uri, "wt")) {
                    if (stream == null) throw new IOException("No output stream");
                    stream.write(output);
                    stream.flush();
                    documentResult(request, true, null);
                } catch (Exception error) { documentResult(request, false, "文件保存失败，请换一个位置重试"); }
            });
        } else if (resultCode == RESULT_OK && uri != null) {
            documentIo.execute(() -> {
                try (InputStream stream = getContentResolver().openInputStream(uri)) {
                    if (stream == null) throw new IOException("No input stream");
                    String text = new String(readLimited(stream, MAX_IMPORT_BYTES), StandardCharsets.UTF_8);
                    javascript("window.qingjiReceiveBackup && window.qingjiReceiveBackup(" + JSONObject.quote(text) + ",\"轻记备份.json\")");
                } catch (Exception error) { nativeError("备份无法读取或超过 22 MB"); }
            });
        }
    }
}
