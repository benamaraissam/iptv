package com.streampro.app;

import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

/**
 * Android TV / Fire TV : l'application est signalée au JavaScript comme « télévision »
 * (mode 10 pieds, navigation à la télécommande) et les touches média / menu de la
 * télécommande, que la WebView ne transmet pas au JavaScript, lui sont relayées.
 */
public class MainActivity extends BridgeActivity {
  private boolean tv;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    tv = isTelevision();
    if (tv && getBridge() != null && getBridge().getWebView() != null) {
      WebSettings s = getBridge().getWebView().getSettings();
      s.setUserAgentString(s.getUserAgentString() + " StreamProTV");
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
}
