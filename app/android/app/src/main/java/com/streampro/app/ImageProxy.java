package com.streampro.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

/**
 * Vignettes : `/__img?url=…&w=400` renvoie l'affiche réduite à la largeur demandée.
 *
 * Les fournisseurs IPTV servent des affiches de 500 × 750 à 2000 × 3000 pixels (100 ko à 1 Mo).
 * Une box TV qui en décode des dizaines par écran, à pleine taille, devient lente et manque
 * de mémoire. Ici : téléchargement une fois, réduction (inSampleSize + redimensionnement),
 * réencodage (JPEG 82, PNG si transparence) et cache disque. Les affichages suivants
 * sont servis depuis le disque, sans réseau.
 */
final class ImageProxy {
  private static final long CACHE_MAX = 80L * 1024 * 1024;
  private static final long CACHE_TRIM_TO = 60L * 1024 * 1024;
  private static final int DOWNLOAD_MAX = 12 * 1024 * 1024;
  private static boolean trimmed;

  private ImageProxy() {}

  static WebResourceResponse serve(Context ctx, String target, int width) {
    File dir = new File(ctx.getCacheDir(), "img");
    if (!dir.exists()) dir.mkdirs();
    trimOnce(dir);
    String key = sha1(target + "@" + width);
    File jpg = new File(dir, key + ".jpg");
    File png = new File(dir, key + ".png");
    try {
      if (jpg.isFile() && jpg.length() > 0) return ok("image/jpeg", new FileInputStream(jpg), jpg.length());
      if (png.isFile() && png.length() > 0) return ok("image/png", new FileInputStream(png), png.length());
      byte[] data = download(target);
      if (data == null) return error(404, "image indisponible");
      BitmapFactory.Options bounds = new BitmapFactory.Options();
      bounds.inJustDecodeBounds = true;
      BitmapFactory.decodeByteArray(data, 0, data.length, bounds);
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
        // Format inconnu du décodeur (SVG, GIF animé…) : renvoyé tel quel.
        String mime = bounds.outMimeType != null ? bounds.outMimeType : "application/octet-stream";
        return ok(mime, new ByteArrayInputStream(data), data.length);
      }
      int sample = 1;
      while (bounds.outWidth / (sample * 2) >= width) sample *= 2;
      BitmapFactory.Options opts = new BitmapFactory.Options();
      opts.inSampleSize = sample;
      Bitmap bmp = BitmapFactory.decodeByteArray(data, 0, data.length, opts);
      if (bmp == null) return ok(bounds.outMimeType != null ? bounds.outMimeType : "image/jpeg", new ByteArrayInputStream(data), data.length);
      if (bmp.getWidth() > width) {
        int h = Math.max(1, Math.round((float) bmp.getHeight() * width / bmp.getWidth()));
        Bitmap scaled = Bitmap.createScaledBitmap(bmp, width, h, true);
        if (scaled != bmp) bmp.recycle();
        bmp = scaled;
      }
      // Transparence (PNG, WebP…) conservée ; petits logos en PNG pour rester nets.
      boolean alpha = bmp.hasAlpha() || width <= 320;
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      if (alpha) bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
      else bmp.compress(Bitmap.CompressFormat.JPEG, 82, out);
      bmp.recycle();
      byte[] bytes = out.toByteArray();
      File dest = alpha ? png : jpg;
      File tmp = new File(dir, key + ".tmp");
      try (FileOutputStream fo = new FileOutputStream(tmp)) {
        fo.write(bytes);
      }
      if (!tmp.renameTo(dest)) tmp.delete();
      return ok(alpha ? "image/png" : "image/jpeg", new ByteArrayInputStream(bytes), bytes.length);
    } catch (OutOfMemoryError e) {
      return error(502, "mémoire insuffisante pour cette image");
    } catch (Exception e) {
      return error(502, "vignette : " + e.getClass().getSimpleName());
    }
  }

  private static byte[] download(String target) throws Exception {
    HttpURLConnection c = (HttpURLConnection) new URL(target).openConnection();
    c.setConnectTimeout(10000);
    c.setReadTimeout(20000);
    c.setInstanceFollowRedirects(true);
    c.setRequestProperty("User-Agent", "VLC/3.0.20 LibVLC/3.0.20");
    c.setRequestProperty("Accept", "image/*,*/*");
    int status = c.getResponseCode();
    if (status >= 400) return null;
    try (InputStream in = c.getInputStream()) {
      ByteArrayOutputStream buf = new ByteArrayOutputStream();
      byte[] b = new byte[16384];
      int n;
      int total = 0;
      while ((n = in.read(b)) > 0) {
        total += n;
        if (total > DOWNLOAD_MAX) return null;
        buf.write(b, 0, n);
      }
      return buf.size() > 0 ? buf.toByteArray() : null;
    }
  }

  private static WebResourceResponse ok(String mime, InputStream in, long length) {
    Map<String, String> h = new HashMap<>();
    h.put("Access-Control-Allow-Origin", "*");
    h.put("Cache-Control", "max-age=604800");
    h.put("Content-Length", String.valueOf(length));
    return new WebResourceResponse(mime, null, 200, "OK", h, in);
  }

  private static WebResourceResponse error(int status, String msg) {
    return new WebResourceResponse("text/plain", "utf-8", status, status == 404 ? "Not Found" : "Bad Gateway", new HashMap<>(), new ByteArrayInputStream(msg.getBytes()));
  }

  /** Une fois par lancement : si le cache dépasse 80 Mo, on efface les plus anciens jusqu'à 60 Mo. */
  private static synchronized void trimOnce(File dir) {
    if (trimmed) return;
    trimmed = true;
    new Thread(
            () -> {
              File[] files = dir.listFiles();
              if (files == null) return;
              long total = 0;
              for (File f : files) total += f.length();
              if (total <= CACHE_MAX) return;
              Arrays.sort(files, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
              for (File f : files) {
                if (total <= CACHE_TRIM_TO) break;
                total -= f.length();
                f.delete();
              }
            })
        .start();
  }

  private static String sha1(String s) {
    try {
      MessageDigest md = MessageDigest.getInstance("SHA-1");
      byte[] d = md.digest(s.getBytes("UTF-8"));
      StringBuilder sb = new StringBuilder();
      for (byte b : d) sb.append(String.format("%02x", b));
      return sb.toString();
    } catch (Exception e) {
      return Integer.toHexString(s.hashCode());
    }
  }
}
