package live.neobattle.twa;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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
    public void onStart() {
        super.onStart();

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();

            // 1. Black background on WebView to eliminate white flash
            webView.setBackgroundColor(Color.BLACK);

            // 2. Disable overscroll / pull-to-refresh bounce
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

            // 3. Configure WebSettings: disable text zoom & pinch zoom, keep inputs selectable
            WebSettings settings = webView.getSettings();
            settings.setTextZoom(100);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);

            // 4. Custom BridgeWebViewClient to intercept external links & network errors
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
}
