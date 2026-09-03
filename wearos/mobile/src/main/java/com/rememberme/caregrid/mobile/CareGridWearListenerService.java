package com.rememberme.caregrid.mobile;

import android.content.Intent;

import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

public class CareGridWearListenerService extends WearableListenerService {
    private static final String OPEN_MEMORY_CAPTURE_PATH = "/caregrid/open-memory-capture";

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        if (!OPEN_MEMORY_CAPTURE_PATH.equals(messageEvent.getPath())) {
            super.onMessageReceived(messageEvent);
            return;
        }

        String targetPath = "/memory-capture?from=watch&auto=1";
        try {
            String payload = new String(messageEvent.getData(), StandardCharsets.UTF_8);
            JSONObject json = new JSONObject(payload);
            targetPath = json.optString("target_path", targetPath);
        } catch (Exception ignored) {
            // Keep the safe default path.
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("target_path", targetPath);
        startActivity(intent);
    }
}
