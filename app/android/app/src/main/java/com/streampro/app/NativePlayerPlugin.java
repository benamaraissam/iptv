package com.streampro.app;

import android.graphics.Color;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.coordinatorlayout.widget.CoordinatorLayout;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.interfaces.IMedia;
import org.videolan.libvlc.util.VLCVideoLayout;

/**
 * Lecteur natif Android / Fire TV (libVLC), à la place du décodeur de la WebView.
 *
 * Il lit ce que la WebView refuse ou lit mal : MPEG-TS en direct, H.264 entrelacé (1080i),
 * audio MPEG Layer II / AC-3, MKV multi-pistes… avec le décodage matériel de l'appareil.
 *
 * La surface vidéo est placée SOUS la WebView (rendue transparente) ; le JavaScript lui
 * envoie la position de la zone vidéo (plein écran, ou l'aperçu de la TV en direct), et
 * reçoit l'état de lecture par l'événement « state ».
 */
@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {
  private LibVLC libVLC;
  private MediaPlayer player;
  private VLCVideoLayout layout;
  private boolean attached;
  private boolean live;
  private long length;
  private int width;
  private int height;
  private float buffering;
  private boolean playing;

  /** Dès le démarrage : la WebView est transparente et le fond de fenêtre prend la couleur de l'application. */
  @Override
  public void load() {
    super.load();
    getActivity()
        .runOnUiThread(
            () -> {
              WebView web = getBridge().getWebView();
              if (web == null) return;
              web.setBackgroundColor(Color.TRANSPARENT);
              if (web.getParent() instanceof View) ((View) web.getParent()).setBackgroundColor(Color.TRANSPARENT);
            });
  }

  private void ensure() {
    if (libVLC != null) return;
    ArrayList<String> opts = new ArrayList<>();
    // Même identité réseau que le proxy : beaucoup de fournisseurs n'acceptent que VLC.
    // Journal détaillé dans logcat (adb logcat -s VLC) : sortie vidéo, décodeur choisi…
    opts.add("-vv");
    opts.add("--http-user-agent=VLC/3.0.20 LibVLC/3.0.20");
    opts.add("--http-reconnect");
    opts.add("--network-caching=1500");
    opts.add("--live-caching=1500");
    // Désentrelacement automatique (chaînes 1080i).
    opts.add("--deinterlace=-1");
    opts.add("--deinterlace-mode=blend");
    opts.add("--audio-time-stretch");
    opts.add("--avcodec-skiploopfilter=0");
    opts.add("--no-drop-late-frames");
    opts.add("--no-skip-frames");
    libVLC = new LibVLC(getContext(), opts);
    player = new MediaPlayer(libVLC);
    player.setEventListener(this::onEvent);
    layout = new VLCVideoLayout(getContext());
    layout.setBackgroundColor(Color.BLACK);
    layout.setVisibility(View.GONE);
  }

  /** Surface ajoutée sous la WebView, qui devient transparente pour la laisser voir. */
  private void attach() {
    if (attached) return;
    WebView web = getBridge().getWebView();
    ViewGroup parent = (ViewGroup) web.getParent();
    if (parent == null) return;
    // La page est transparente (voir styles.css, html.native-video) : le fond de la fenêtre
    // reprend la couleur de fond de l'application, la vidéo apparaît par « transparence ».
    web.setBackgroundColor(Color.TRANSPARENT);
    parent.setBackgroundColor(Color.TRANSPARENT);
    getActivity().getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.BLACK));
    ViewGroup.MarginLayoutParams lp =
        parent instanceof CoordinatorLayout ? new CoordinatorLayout.LayoutParams(1, 1) : new FrameLayout.LayoutParams(1, 1);
    parent.addView(layout, 0, lp);
    // SurfaceView (voie standard de VLC sur Android / Fire TV ; la TextureView y échoue :
    // « failed to create video output »). La SurfaceView efface elle-même, à son emplacement,
    // tout ce qui a été dessiné avant elle (fond de fenêtre, fond de la vue parente) : la vidéo
    // apparaît là où la page, au-dessus, est transparente.
    player.attachViews(layout, null, false, false);
    player.setVideoScale(MediaPlayer.ScaleType.SURFACE_BEST_FIT);
    attached = true;
  }

  private void onEvent(MediaPlayer.Event ev) {
    String kind = null;
    switch (ev.type) {
      case MediaPlayer.Event.Opening:
        kind = "opening";
        break;
      case MediaPlayer.Event.Buffering:
        buffering = ev.getBuffering();
        kind = "buffering";
        break;
      case MediaPlayer.Event.Playing:
        playing = true;
        kind = "playing";
        break;
      case MediaPlayer.Event.Paused:
        playing = false;
        kind = "paused";
        break;
      case MediaPlayer.Event.Stopped:
        playing = false;
        kind = "stopped";
        break;
      case MediaPlayer.Event.EndReached:
        playing = false;
        kind = "ended";
        break;
      case MediaPlayer.Event.EncounteredError:
        playing = false;
        kind = "error";
        break;
      case MediaPlayer.Event.TimeChanged:
        kind = "time";
        break;
      case MediaPlayer.Event.LengthChanged:
        length = ev.getLengthChanged();
        kind = "length";
        break;
      case MediaPlayer.Event.ESAdded:
      case MediaPlayer.Event.ESDeleted:
      case MediaPlayer.Event.ESSelected:
        kind = "tracks";
        break;
      case MediaPlayer.Event.Vout:
        IMedia.VideoTrack vt = player.getCurrentVideoTrack();
        if (vt != null) {
          width = vt.width;
          height = vt.height;
        }
        kind = "vout";
        break;
      default:
        return;
    }
    notifyListeners("state", state(kind));
  }

  private JSObject state(String kind) {
    JSObject o = new JSObject();
    o.put("kind", kind);
    o.put("position", player == null ? 0 : player.getTime() / 1000.0);
    o.put("duration", length > 0 ? length / 1000.0 : 0);
    o.put("playing", playing);
    o.put("buffering", buffering);
    o.put("width", width);
    o.put("height", height);
    o.put("live", live);
    return o;
  }

  @PluginMethod
  public void load(PluginCall call) {
    String url = call.getString("url");
    if (url == null) {
      call.reject("url manquante");
      return;
    }
    final double startAt = call.getDouble("startAt", 0.0);
    live = call.getBoolean("live", false);
    getActivity()
        .runOnUiThread(
            () -> {
              try {
                ensure();
                attach();
                length = 0;
                width = 0;
                height = 0;
                buffering = 0;
                playing = false;
                player.stop();
                Media media = new Media(libVLC, android.net.Uri.parse(url));
                media.setHWDecoderEnabled(true, false);
                media.addOption(":http-user-agent=VLC/3.0.20 LibVLC/3.0.20");
                media.addOption(live ? ":network-caching=1500" : ":network-caching=3000");
                if (startAt > 0) media.addOption(":start-time=" + startAt);
                player.setMedia(media);
                media.release();
                layout.setVisibility(View.VISIBLE);
                player.play();
                call.resolve();
              } catch (Exception e) {
                call.reject("libVLC : " + e.getMessage());
              }
            });
  }

  @PluginMethod
  public void play(PluginCall call) {
    getActivity()
        .runOnUiThread(
            () -> {
              if (player != null) player.play();
              call.resolve();
            });
  }

  @PluginMethod
  public void pause(PluginCall call) {
    getActivity()
        .runOnUiThread(
            () -> {
              if (player != null && player.isPlaying()) player.pause();
              call.resolve();
            });
  }

  @PluginMethod
  public void stop(PluginCall call) {
    getActivity()
        .runOnUiThread(
            () -> {
              if (player != null) player.stop();
              if (layout != null) layout.setVisibility(View.GONE);
              playing = false;
              call.resolve();
            });
  }

  @PluginMethod
  public void seek(PluginCall call) {
    final double pos = call.getDouble("position", 0.0);
    getActivity()
        .runOnUiThread(
            () -> {
              if (player != null && player.isSeekable()) player.setTime((long) (pos * 1000));
              call.resolve();
            });
  }

  /** Zone vidéo (en pixels CSS de la WebView) ; `visible` faux → surface cachée. */
  @PluginMethod
  public void setBounds(PluginCall call) {
    final boolean visible = call.getBoolean("visible", true);
    final double x = call.getDouble("x", 0.0);
    final double y = call.getDouble("y", 0.0);
    final double w = call.getDouble("width", 0.0);
    final double h = call.getDouble("height", 0.0);
    getActivity()
        .runOnUiThread(
            () -> {
              if (layout == null) {
                call.resolve();
                return;
              }
              if (!visible || w <= 0 || h <= 0) {
                layout.setVisibility(View.GONE);
                call.resolve();
                return;
              }
              DisplayMetrics dm = getContext().getResources().getDisplayMetrics();
              float d = dm.density;
              ViewGroup.MarginLayoutParams lp = (ViewGroup.MarginLayoutParams) layout.getLayoutParams();
              lp.width = Math.max(1, Math.round((float) w * d));
              lp.height = Math.max(1, Math.round((float) h * d));
              lp.setMargins(Math.round((float) x * d), Math.round((float) y * d), 0, 0);
              layout.setLayoutParams(lp);
              layout.setVisibility(View.VISIBLE);
              call.resolve();
            });
  }

  /** Diagnostic : surface vidéo au-dessus de la WebView (vrai) ou dessous (faux, normal). */
  @PluginMethod
  public void setOnTop(PluginCall call) {
    final boolean on = call.getBoolean("on", false);
    getActivity()
        .runOnUiThread(
            () -> {
              android.view.SurfaceView sv = findSurface(layout);
              if (sv != null) sv.setZOrderOnTop(on);
              call.resolve();
            });
  }

  /** Diagnostic : ré-applique la transparence de la WebView, avec le type de calque demandé. */
  @PluginMethod
  public void setWebTransparent(PluginCall call) {
    final String layer = call.getString("layer", "none");
    getActivity()
        .runOnUiThread(
            () -> {
              WebView web = getBridge().getWebView();
              if (web != null) {
                web.setBackgroundColor(Color.TRANSPARENT);
                if ("software".equals(layer)) web.setLayerType(View.LAYER_TYPE_SOFTWARE, null);
                else if ("hardware".equals(layer)) web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
                else if ("default".equals(layer)) web.setLayerType(View.LAYER_TYPE_NONE, null);
                web.invalidate();
              }
              call.resolve();
            });
  }

  /** Diagnostic : couleur de fond de la vue parente (visible seulement si la WebView est transparente). */
  @PluginMethod
  public void setDebugBackground(PluginCall call) {
    final String color = call.getString("color", "#FF0000");
    getActivity()
        .runOnUiThread(
            () -> {
              WebView web = getBridge().getWebView();
              if (web != null && web.getParent() instanceof View) {
                try {
                  ((View) web.getParent()).setBackgroundColor(Color.parseColor(color));
                } catch (Exception e) {
                  ((View) web.getParent()).setBackgroundColor(Color.TRANSPARENT);
                }
              }
              call.resolve();
            });
  }

  /** Diagnostic : fenêtre en format translucide (composition des pixels transparents). */
  @PluginMethod
  public void setWindowTranslucent(PluginCall call) {
    final boolean on = call.getBoolean("on", true);
    getActivity()
        .runOnUiThread(
            () -> {
              getActivity().getWindow().setFormat(on ? android.graphics.PixelFormat.TRANSLUCENT : android.graphics.PixelFormat.OPAQUE);
              call.resolve();
            });
  }

  private static android.view.SurfaceView findSurface(View v) {
    if (v instanceof android.view.SurfaceView) return (android.view.SurfaceView) v;
    if (v instanceof ViewGroup) {
      ViewGroup g = (ViewGroup) v;
      for (int i = 0; i < g.getChildCount(); i++) {
        android.view.SurfaceView r = findSurface(g.getChildAt(i));
        if (r != null) return r;
      }
    }
    return null;
  }

  @PluginMethod
  public void getState(PluginCall call) {
    call.resolve(state("poll"));
  }

  @PluginMethod
  public void getTracks(PluginCall call) {
    JSObject o = new JSObject();
    JSArray audio = new JSArray();
    JSArray subs = new JSArray();
    if (player != null) {
      MediaPlayer.TrackDescription[] a = player.getAudioTracks();
      if (a != null)
        for (MediaPlayer.TrackDescription t : a) {
          if (t.id < 0) continue;
          JSObject j = new JSObject();
          j.put("id", t.id);
          j.put("name", t.name);
          audio.put(j);
        }
      MediaPlayer.TrackDescription[] s = player.getSpuTracks();
      if (s != null)
        for (MediaPlayer.TrackDescription t : s) {
          if (t.id < 0) continue;
          JSObject j = new JSObject();
          j.put("id", t.id);
          j.put("name", t.name);
          subs.put(j);
        }
      o.put("audioCurrent", player.getAudioTrack());
      o.put("subCurrent", player.getSpuTrack());
    } else {
      o.put("audioCurrent", -1);
      o.put("subCurrent", -1);
    }
    o.put("audio", audio);
    o.put("subs", subs);
    call.resolve(o);
  }

  @PluginMethod
  public void setAudioTrack(PluginCall call) {
    final int id = call.getInt("id", -1);
    getActivity()
        .runOnUiThread(
            () -> {
              if (player != null) player.setAudioTrack(id);
              call.resolve();
            });
  }

  @PluginMethod
  public void setSubtitleTrack(PluginCall call) {
    final int id = call.getInt("id", -1);
    getActivity()
        .runOnUiThread(
            () -> {
              if (player != null) player.setSpuTrack(id);
              call.resolve();
            });
  }

  @Override
  protected void handleOnPause() {
    super.handleOnPause();
    if (player != null && player.isPlaying()) player.pause();
  }

  @Override
  protected void handleOnDestroy() {
    if (player != null) {
      player.stop();
      player.detachViews();
      player.release();
      player = null;
    }
    if (libVLC != null) {
      libVLC.release();
      libVLC = null;
    }
    super.handleOnDestroy();
  }
}
