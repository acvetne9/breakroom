package com.acvetne.breakroom;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Enable WebView debugging in debug builds
    if (android.os.Build.TYPE.equals("userdebug") || android.os.Build.TYPE.equals("eng")) {
      WebView.setWebContentsDebuggingEnabled(true);
    }
  }
}