package live.neobattle.twa;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Default notification channel for high-priority push notifications
        createNotificationChannel();

        // Native safety timeout: ensure splash is dismissed if web fails to call SplashScreen.hide
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (getBridge() != null) {
                getBridge().eval("window.Capacitor?.Plugins?.SplashScreen?.hide({ fadeOutDuration: 250 });", null);
            }
        }, 6000);

        // Hardware back button: navigate history in WebView, exit only from root/home page
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    WebView webView = getBridge().getWebView();
                    String currentUrl = webView.getUrl();
                    boolean isHome = currentUrl == null ||
                            currentUrl.equals("https://neobattle.live") ||
                            currentUrl.equals("https://neobattle.live/") ||
                            currentUrl.startsWith("capacitor://localhost");

                    if (webView.canGoBack() && !isHome) {
                        webView.goBack();
                        return;
                    }
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    @Override
    public void onStart() {
        super.onStart();

        // 1. Black status bar and navigation bar with light/white icons
        Window window = getWindow();
        window.setStatusBarColor(Color.BLACK);
        window.setNavigationBarColor(Color.BLACK);
        WindowInsetsControllerCompat insetsController =
                WindowCompat.getInsetsController(window, window.getDecorView());
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(false); // light icons on black status bar
            insetsController.setAppearanceLightNavigationBars(false); // light icons on black navigation bar
        }

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();

            // 2. Black background on WebView to eliminate white flash
            webView.setBackgroundColor(Color.BLACK);

            // 3. Disable overscroll / pull-to-refresh bounce
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

            // 4. Configure WebSettings: disable text zoom & pinch zoom, keep inputs selectable
            WebSettings settings = webView.getSettings();
            settings.setTextZoom(100);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);

            // 5. Edge-to-edge system bars insets handling for Android 13, 14, 15+
            // Offsets WebView margins so content starts strictly below the status bar and bottom nav sits above gesture bar
            ViewCompat.setOnApplyWindowInsetsListener(webView, (v, windowInsets) -> {
                Insets insets = windowInsets.getInsets(
                        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) v.getLayoutParams();
                mlp.topMargin = insets.top;
                mlp.bottomMargin = insets.bottom;
                mlp.leftMargin = insets.left;
                mlp.rightMargin = insets.right;
                v.setLayoutParams(mlp);
                return windowInsets;
            });

            // 6. Custom BridgeWebViewClient to intercept external links and handle errors
            webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    if (uri != null) {
                        String scheme = uri.getScheme();
                        String host = uri.getHost();

                        // Keep capacitor local assets and neobattle.live internal
                        if ("capacitor".equalsIgnoreCase(scheme)) {
                            return false;
                        }
                        if (host != null && (host.equals("neobattle.live") || host.endsWith(".neobattle.live"))) {
                            return false;
                        }

                        // External link: open in system browser, never inside the WebView
                        try {
                            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(intent);
                            return true;
                        } catch (Exception e) {
                            // Fallback
                        }
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    super.onReceivedError(view, request, error);
                    // For main frame connection errors, load the bundled offline screen
                    if (request.isForMainFrame()) {
                        view.loadUrl("capacitor://localhost/offline.html");
                    }
                }
            });
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            String channelId = "neobattle_default_channel";
            CharSequence name = "NeoBattle";
            String description = "Tournament starts, results, and announcements";
            int importance = NotificationManager.IMPORTANCE_HIGH;
            NotificationChannel channel = new NotificationChannel(channelId, name, importance);
            channel.setDescription(description);
            channel.enableLights(true);
            channel.setLightColor(Color.parseColor("#F97316"));
            channel.enableVibration(true);
            channel.setShowBadge(true);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }
}
