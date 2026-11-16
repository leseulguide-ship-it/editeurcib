package com.cib.editeurcib;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.WebView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Module natif d'EditeurCiB.
 * - imprimer : ouvre l'impression d'Android sur la page affichée (format A4).
 *   Android propose alors une imprimante ou « Enregistrer au format PDF ».
 * - fichierRecu (événement) : document (.docx, .doc, .odt, .txt) ouvert avec EditeurCiB (« Ouvrir avec »)
 *   ou partagé vers EditeurCiB depuis WhatsApp, un e-mail, le gestionnaire de fichiers… ;
 *   un texte partagé (sans fichier) arrive dans « texte ».
 * - ouvrirReglagesDefaut : page « Ouvrir par défaut » des réglages d'EditeurCiB.
 * - etatParDefaut : pour chaque type de document, EditeurCiB l'ouvre-t-il directement ?
 */
@CapacitorPlugin(name = "CibNatif")
public class CibNatifPlugin extends Plugin {

    private static final int TAILLE_MAX = 40 * 1024 * 1024; // 40 Mo

    @Override
    public void load() {
        traiter(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        traiter(intent);
    }

    @SuppressWarnings("deprecation")
    private void traiter(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(action)) uri = intent.getData();
        else if (Intent.ACTION_SEND.equals(action)) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null && Intent.ACTION_SEND.equals(action)) {
            // Texte partagé (message WhatsApp, e-mail…) sans fichier joint.
            CharSequence texte = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (texte != null && texte.length() > 0) {
                intent.setAction(Intent.ACTION_MAIN);
                JSObject r = new JSObject();
                r.put("texte", texte.toString());
                notifyListeners("fichierRecu", r, true);
            }
            return;
        }
        if (uri == null) return;
        // Pour ne pas rouvrir le même fichier si l'application redémarre.
        intent.setAction(Intent.ACTION_MAIN);
        final Uri source = uri;
        new Thread(() -> {
            JSObject r = new JSObject();
            try {
                r.put("nom", nomDe(source));
                r.put("donnees", lire(source));
            } catch (Exception e) {
                r.put("erreur", e.getMessage() == null ? "lecture impossible" : e.getMessage());
            }
            // Conservé jusqu'à ce que la page écoute l'événement (démarrage de l'application).
            notifyListeners("fichierRecu", r, true);
        }).start();
    }

    private String nomDe(Uri uri) {
        String nom = null;
        if (ContentResolver.SCHEME_CONTENT.equals(uri.getScheme())) {
            try (Cursor c = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst()) nom = c.getString(0);
            } catch (Exception ignored) { }
        }
        if (nom == null) nom = uri.getLastPathSegment();
        if (nom == null || nom.isEmpty()) nom = "Document";
        if (nom.contains("/")) nom = nom.substring(nom.lastIndexOf('/') + 1);
        return nom;
    }

    private String lire(Uri uri) throws Exception {
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) throw new Exception("fichier introuvable");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] tampon = new byte[64 * 1024];
            int n, total = 0;
            while ((n = in.read(tampon)) != -1) {
                total += n;
                if (total > TAILLE_MAX) throw new Exception("fichier trop volumineux");
                out.write(tampon, 0, n);
            }
            return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        }
    }

    @PluginMethod
    public void ouvrirReglagesDefaut(PluginCall call) {
        Uri paquet = Uri.parse("package:" + getContext().getPackageName());
        Intent i = Build.VERSION.SDK_INT >= 31
                ? new Intent(Settings.ACTION_APP_OPEN_BY_DEFAULT_SETTINGS, paquet)
                : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, paquet);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getActivity().startActivity(i);
        } catch (Exception e) {
            Intent j = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, paquet);
            j.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { getActivity().startActivity(j); } catch (Exception e2) { call.reject("Réglages indisponibles"); return; }
        }
        call.resolve();
    }

    /** Pour chaque type : vrai si un fichier de ce type s'ouvre directement dans EditeurCiB (sans choix). */
    @PluginMethod
    public void etatParDefaut(PluginCall call) {
        String[][] types = {
            {"docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
            {"doc", "application/msword"},
            {"odt", "application/vnd.oasis.opendocument.text"},
            {"txt", "text/plain"}
        };
        JSObject r = new JSObject();
        PackageManager pm = getContext().getPackageManager();
        for (String[] t : types) {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(Uri.parse("content://com.cib.editeurcib.essai/document"), t[1]);
            ResolveInfo ri = pm.resolveActivity(i, PackageManager.MATCH_DEFAULT_ONLY);
            boolean direct = ri != null && ri.activityInfo != null && getContext().getPackageName().equals(ri.activityInfo.packageName);
            r.put(t[0], direct);
        }
        call.resolve(r);
    }

    @PluginMethod
    public void imprimer(PluginCall call) {
        final String titre = call.getString("titre", "EditeurCiB");
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager impression = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                WebView vue = getBridge().getWebView();
                PrintDocumentAdapter adaptateur = vue.createPrintDocumentAdapter(titre);
                PrintAttributes format = new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                        .build();
                impression.print(titre, adaptateur, format);
                call.resolve();
            } catch (Exception e) {
                call.reject("Impression impossible : " + e.getMessage());
            }
        });
    }
}
