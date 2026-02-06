package com.acvetne.workaround;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
    );

    // Enable WebView debugging in debug builds
    if (android.os.Build.TYPE.equals("userdebug") || android.os.Build.TYPE.equals("eng")) {
      WebView.setWebContentsDebuggingEnabled(true);
    }
  }
}