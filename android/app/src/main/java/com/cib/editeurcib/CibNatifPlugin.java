package com.cib.editeurcib;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Module natif d'EditeurCiB.
 * imprimer : ouvre l'impression d'Android sur la page affichée (format A4).
 * Android propose alors une imprimante ou « Enregistrer au format PDF ».
 */
@CapacitorPlugin(name = "CibNatif")
public class CibNatifPlugin extends Plugin {

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
