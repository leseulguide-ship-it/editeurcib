package com.cib.editeurcib;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Module natif d'EditeurCiB (impression / PDF), enregistré avant le démarrage de Capacitor.
        registerPlugin(CibNatifPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
