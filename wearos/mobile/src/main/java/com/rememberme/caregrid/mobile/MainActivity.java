package com.rememberme.caregrid.mobile;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.ConsoleMessage;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceResponse;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int PERMISSION_REQUEST = 1001;
    private static final int FILE_CHOOSER_REQUEST = 1002;
    private static final int SPEECH_REQUEST = 1003;
    private static final String TAG = "CareGridMobile";

    private WebView webView;
    private FrameLayout rootView;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingPermissionRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestRuntimePermissions();
        setupWebView();
        loadCareGridUrl(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (webView != null) {
            loadCareGridUrl(intent);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        configureSystemBars();
        rootView = new FrameLayout(this);
        rootView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        rootView.setFitsSystemWindows(true);

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        rootView.addView(webView);
        setContentView(rootView);
        applySystemBarInsets();

        WebView.setWebContentsDebuggingEnabled(true);
        webView.addJavascriptInterface(new CareGridBridge(), "CareGridNative");
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        // Cache assets so community/guard pages feel snappy after first load.
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadsImagesAutomatically(true);
        settings.setBlockNetworkImage(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(false);
        }
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setUserAgentString(settings.getUserAgentString() + " RememberMeCareGridMobile/0.1");
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        // Improve tap reliability on Android WebView.
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.requestFocus(View.FOCUS_DOWN);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme();
                if ("tel".equals(scheme) || "sms".equals(scheme) || "mailto".equals(scheme)) {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    return true;
                }
                return false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    emitToWeb("WebView main-frame error: " + error.getDescription());
                    view.loadDataWithBaseURL(
                            null,
                            "<html><body style='font-family:sans-serif;background:#f7efe2;color:#24201c;padding:28px'>" +
                                    "<h2>CareGrid is offline</h2>" +
                                    "<p>Please check internet or restart the local tunnel/server.</p>" +
                                    "<p style='font-size:13px;color:#746b61'>Target: " + BuildConfig.CAREGRID_WEB_URL + "</p>" +
                                    "</body></html>",
                            "text/html",
                            "UTF-8",
                            null
                    );
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                if (request.isForMainFrame()) {
                    emitToWeb("WebView HTTP error " + errorResponse.getStatusCode() + " for " + request.getUrl());
                }
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                // Keep a warm background while Next.js client JS hydrates over the tunnel.
                view.setBackgroundColor(Color.parseColor("#f7f3eb"));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                emitToWeb("WebView page finished: " + url);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d(TAG, "console " + consoleMessage.messageLevel() + ": " + consoleMessage.message());
                return false;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    emitToWeb("WebView permission requested: " + String.join(", ", request.getResources()));
                    if (hasRuntimePermissionsFor(request.getResources())) {
                        request.grant(request.getResources());
                        emitToWeb("WebView permission granted.");
                        return;
                    }
                    pendingPermissionRequest = request;
                    requestRuntimePermissions();
                    emitToWeb("Android runtime permission requested for WebView media.");
                });
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingPermissionRequest == request) pendingPermissionRequest = null;
                emitToWeb("WebView permission request cancelled.");
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }

            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                Intent chooserIntent;
                try {
                    chooserIntent = fileChooserParams.createIntent();
                } catch (Exception error) {
                    chooserIntent = new Intent(Intent.ACTION_GET_CONTENT);
                    chooserIntent.addCategory(Intent.CATEGORY_OPENABLE);
                    chooserIntent.setType("image/*");
                    chooserIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                try {
                    startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException error) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });
    }

    private void configureSystemBars() {
        getWindow().setStatusBarColor(Color.rgb(247, 239, 226));
        getWindow().setNavigationBarColor(Color.rgb(247, 239, 226));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            int flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            getWindow().getDecorView().setSystemUiVisibility(flags);
        }
    }

    private void applySystemBarInsets() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH) {
            rootView.setOnApplyWindowInsetsListener((view, insets) -> {
                int top = insets.getSystemWindowInsetTop();
                int bottom = insets.getSystemWindowInsetBottom();
                view.setPadding(0, top, 0, bottom);
                return insets;
            });
            rootView.requestApplyInsets();
        } else {
            rootView.setPadding(0, getSystemBarHeight("status_bar_height"), 0, getSystemBarHeight("navigation_bar_height"));
        }
    }

    private int getSystemBarHeight(String resourceName) {
        int resourceId = getResources().getIdentifier(resourceName, "dimen", "android");
        return resourceId > 0 ? getResources().getDimensionPixelSize(resourceId) : 0;
    }

    private void requestRuntimePermissions() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) return;

        ArrayList<String> permissions = new ArrayList<>();
        permissions.add(Manifest.permission.CAMERA);
        permissions.add(Manifest.permission.RECORD_AUDIO);
        permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissions.add(Manifest.permission.BLUETOOTH_CONNECT);
        }

        requestPermissions(permissions.toArray(new String[0]), PERMISSION_REQUEST);
    }

    private boolean hasRuntimePermissionsFor(String[] resources) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        for (String resource : resources) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != PERMISSION_REQUEST) return;
        List<String> denied = new ArrayList<>();
        for (int index = 0; index < permissions.length; index++) {
            if (grantResults.length <= index || grantResults[index] != PackageManager.PERMISSION_GRANTED) {
                denied.add(permissions[index]);
            }
        }
        emitToWeb(denied.isEmpty() ? "Android runtime permissions granted." : "Android runtime permissions denied: " + denied);
        if (pendingPermissionRequest == null) return;
        PermissionRequest request = pendingPermissionRequest;
        pendingPermissionRequest = null;
        runOnUiThread(() -> {
            if (hasRuntimePermissionsFor(request.getResources())) {
                request.grant(request.getResources());
                emitToWeb("Pending WebView permission granted after Android permission.");
            } else {
                request.deny();
                emitToWeb("Pending WebView permission denied because Android permission is missing.");
            }
        });
    }

    private void loadCareGridUrl(Intent intent) {
        // Warm cream chrome while Next.js JS hydrates (WebView is not a native UI).
        webView.setBackgroundColor(Color.parseColor("#f7f3eb"));
        webView.loadUrl(resolveCareGridUrl(intent));
    }

    private String resolveCareGridUrl(Intent intent) {
        String targetPath = intent == null ? null : intent.getStringExtra("target_path");
        Uri data = intent == null ? null : intent.getData();
        if (targetPath == null && data != null && "rememberme".equals(data.getScheme())) {
            targetPath = "/memory-capture?from=watch&auto=1";
        }
        if (targetPath == null || targetPath.trim().isEmpty()) {
            return BuildConfig.CAREGRID_WEB_URL;
        }
        if (!targetPath.startsWith("/")) {
            targetPath = "/" + targetPath;
        }
        Uri base = Uri.parse(BuildConfig.CAREGRID_WEB_URL);
        String origin = base.getScheme() + "://" + base.getAuthority();
        return origin + targetPath;
    }

    private void emitToWeb(String message) {
        Log.d(TAG, message);
        if (webView == null) return;
        runOnUiThread(() -> webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('caregrid-native-log', { detail: '" + jsQuote(message) + "' }))",
                null
        ));
    }

    private void emitSpeechToWeb(String transcript, String error) {
        if (error != null && !error.isEmpty()) {
            Log.d(TAG, "Native speech error: " + error);
        } else {
            Log.d(TAG, "Native speech transcript: " + transcript);
        }
        if (webView == null) return;
        runOnUiThread(() -> webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('caregrid-native-speech', { detail: { transcript: '" +
                        jsQuote(transcript == null ? "" : transcript) +
                        "', error: '" +
                        jsQuote(error == null ? "" : error) +
                        "' } }))",
                null
        ));
    }

    private String jsQuote(String value) {
        return value
                .replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\r", " ")
                .replace("\n", " ");
    }

    private class CareGridBridge {
        @JavascriptInterface
        public void log(String message) {
            Log.d(TAG, "JS bridge: " + message);
        }

        @JavascriptInterface
        public void startSpeech(String prompt) {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    emitSpeechToWeb("", "Android microphone permission is missing.");
                    requestRuntimePermissions();
                    return;
                }
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault());
                intent.putExtra(RecognizerIntent.EXTRA_PROMPT, prompt == null || prompt.trim().isEmpty() ? "Speak to Lumo" : prompt);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
                try {
                    startActivityForResult(intent, SPEECH_REQUEST);
                    emitToWeb("Native Android speech input opened.");
                } catch (ActivityNotFoundException error) {
                    emitSpeechToWeb("", "No native speech input app is available on this phone.");
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == SPEECH_REQUEST) {
            if (resultCode != RESULT_OK || data == null) {
                emitSpeechToWeb("", "Native speech input was cancelled or returned no text.");
                return;
            }
            ArrayList<String> matches = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            String transcript = matches == null || matches.isEmpty() ? "" : matches.get(0);
            emitSpeechToWeb(transcript, transcript == null || transcript.trim().isEmpty() ? "Native speech input returned empty text." : "");
            return;
        }

        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;

        Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        emitToWeb(results == null || results.length == 0 ? "Android photo picker returned no file." : "Android photo picker returned " + results.length + " file(s).");
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
