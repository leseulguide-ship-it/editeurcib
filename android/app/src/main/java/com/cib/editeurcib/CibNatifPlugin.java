package com.cib.editeurcib;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
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
 * - fichierRecu (événement) : fichier Word ouvert avec EditeurCiB (« Ouvrir avec »)
 *   ou partagé vers EditeurCiB depuis WhatsApp, un e-mail, le gestionnaire de fichiers…
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
        if (nom == null || nom.isEmpty()) nom = "Document.docx";
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
