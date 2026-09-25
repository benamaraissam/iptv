package com.streampro.app;

import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Android TV / Fire TV : l'application est signalée au JavaScript comme « télévision »
 * (mode 10 pieds, navigation à la télécommande) et les touches média / menu de la
 * télécommande, que la WebView ne transmet pas au JavaScript, lui sont relayées.
 *
 * Proxy réseau natif : les requêtes JavaScript vers `/__proxy?url=…` sont servies ici en
 * flux continu (HttpURLConnection → WebView), sans passer par le pont Capacitor. C'est ce
 * qui permet de charger un catalogue Xtream de plusieurs dizaines de Mo en quelques secondes
 * sur une box TV, là où le pont natif (sérialisation JSON de toute la réponse) ne finit jamais.
 */
public class MainActivity extends BridgeActivity {
  private boolean tv;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    tv = isTelevision();
    Bridge bridge = getBridge();
    if (bridge != null && bridge.getWebView() != null) {
      if (tv) {
        WebSettings s = bridge.getWebView().getSettings();
        s.setUserAgentString(s.getUserAgentString() + " StreamProTV");
      }
      bridge.setWebViewClient(new ProxyWebViewClient(bridge));
    }
  }

  private boolean isTelevision() {
    UiModeManager ui = (UiModeManager) getSystemService(Context.UI_MODE_SERVICE);
    if (ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) return true;
    PackageManager pm = getPackageManager();
    return pm.hasSystemFeature("amazon.hardware.fire_tv")
        || pm.hasSystemFeature("android.software.leanback")
        || !pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN);
  }

  @Override
  public boolean dispatchKeyEvent(KeyEvent event) {
    if (event.getAction() == KeyEvent.ACTION_DOWN) {
      String action = remoteAction(event.getKeyCode());
      if (action != null && getBridge() != null) {
        getBridge().triggerWindowJSEvent("spRemote", "{\"action\":\"" + action + "\"}");
        return true;
      }
    }
    return super.dispatchKeyEvent(event);
  }

  /** Touches de télécommande relayées telles quelles ; le D-pad, Entrée et Retour passent déjà. */
  private static String remoteAction(int keyCode) {
    switch (keyCode) {
      case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
        return "playpause";
      case KeyEvent.KEYCODE_MEDIA_PLAY:
        return "play";
      case KeyEvent.KEYCODE_MEDIA_PAUSE:
        return "pause";
      case KeyEvent.KEYCODE_MEDIA_STOP:
        return "stop";
      case KeyEvent.KEYCODE_MEDIA_REWIND:
        return "rewind";
      case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
        return "forward";
      case KeyEvent.KEYCODE_MENU:
        return "menu";
      case KeyEvent.KEYCODE_CHANNEL_UP:
        return "chup";
      case KeyEvent.KEYCODE_CHANNEL_DOWN:
        return "chdown";
      case KeyEvent.KEYCODE_PROG_RED:
        return "red";
      case KeyEvent.KEYCODE_PROG_GREEN:
        return "green";
      case KeyEvent.KEYCODE_PROG_YELLOW:
        return "yellow";
      case KeyEvent.KEYCODE_PROG_BLUE:
        return "blue";
      default:
        return null;
    }
  }

  /** Sert `/__proxy?url=…` en direct depuis le réseau, en flux ; le reste suit Capacitor. */
  static class ProxyWebViewClient extends BridgeWebViewClient {
    ProxyWebViewClient(Bridge bridge) {
      super(bridge);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
      Uri u = request.getUrl();
      if (u != null && "/__proxy".equals(u.getPath())) {
        String target = u.getQueryParameter("url");
        if (target != null && (target.startsWith("http://") || target.startsWith("https://"))) return proxy(target, request);
      }
      return super.shouldInterceptRequest(view, request);
    }

    private static WebResourceResponse proxy(String target, WebResourceRequest request) {
      try {
        HttpURLConnection c = (HttpURLConnection) new URL(target).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(60000);
        c.setInstanceFollowRedirects(true);
        // Certains serveurs IPTV refusent les navigateurs mais servent VLC.
        c.setRequestProperty("User-Agent", "VLC/3.0.20 LibVLC/3.0.20");
        c.setRequestProperty("Accept", "*/*");
        Map<String, String> reqHeaders = request.getRequestHeaders();
        if (reqHeaders != null && reqHeaders.get("Range") != null) c.setRequestProperty("Range", reqHeaders.get("Range"));
        int status = c.getResponseCode();
        String contentType = c.getContentType();
        String mime = "application/octet-stream";
        String encoding = null;
        if (contentType != null) {
          String[] parts = contentType.split(";");
          mime = parts[0].trim();
          for (int i = 1; i < parts.length; i++) {
            String p = parts[i].trim();
            if (p.toLowerCase().startsWith("charset=")) encoding = p.substring(8).trim();
          }
        }
        if (encoding == null && (mime.startsWith("text/") || mime.contains("json") || mime.contains("mpegurl"))) encoding = "utf-8";
        InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
        if (in == null) in = new ByteArrayInputStream(new byte[0]);
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "no-store");
        for (String h : new String[] {"Content-Length", "Content-Range", "Accept-Ranges", "Content-Disposition"}) {
          List<String> v = c.getHeaderFields().get(h);
          if (v != null && !v.isEmpty()) headers.put(h, v.get(0));
        }
        String reason = c.getResponseMessage();
        if (reason == null || reason.isEmpty()) reason = status >= 400 ? "Error" : "OK";
        return new WebResourceResponse(mime, encoding, status, reason, headers, in);
      } catch (Exception e) {
        String msg = "proxy: " + e.getClass().getSimpleName() + (e.getMessage() != null ? " " + e.getMessage() : "");
        return new WebResourceResponse("text/plain", "utf-8", 502, "Bad Gateway", new HashMap<>(), new ByteArrayInputStream(msg.getBytes()));
      }
    }
  }
}
