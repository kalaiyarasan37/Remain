package com.remainapp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class AppForegroundModule extends ReactContextBaseJavaModule {

    private static final String CHANNEL_ID = "wake_word_channel";
    private static final int NOTIFICATION_ID = 1001;

    public AppForegroundModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "AppForeground";
    }

    @ReactMethod
    public void bringToForeground() {
        try {
            android.util.Log.d("AppForeground", "bringToForeground called");
            ReactApplicationContext context = getReactApplicationContext();
            createNotificationChannel(context);

            Intent intent = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());

            if (intent == null) {
                android.util.Log.e("AppForeground", "Launch intent is NULL!");
                return;
            }

            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.putExtra("WAKE_WORD_TRIGGERED", true);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            PendingIntent pendingIntent = PendingIntent.getActivity(
                context, 0, intent, flags
            );

            Notification notification = new Notification.Builder(context, CHANNEL_ID)
    .setSmallIcon(android.R.drawable.ic_btn_speak_now)
    .setContentTitle("🎤 Hey RemainApp!")
    .setContentText("Tap to speak your reminder...")
    .setStyle(new Notification.BigTextStyle()
        .bigText("🎤 Listening mode ready!\n\nTap to open and speak your reminder or query."))
    .setContentIntent(pendingIntent)
    .setAutoCancel(true)
    .setFullScreenIntent(pendingIntent, true)
    .setPriority(Notification.PRIORITY_MAX)
    .setVisibility(Notification.VISIBILITY_PUBLIC)
    .setCategory(Notification.CATEGORY_CALL)
    .build();

            NotificationManager manager = (NotificationManager)
                context.getSystemService(Context.NOTIFICATION_SERVICE);
            manager.notify(NOTIFICATION_ID, notification);

            // Also try direct launch
try {
    Intent directIntent = context.getPackageManager()
        .getLaunchIntentForPackage(context.getPackageName());
    if (directIntent != null) {
        directIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK |
            Intent.FLAG_ACTIVITY_SINGLE_TOP);
        directIntent.putExtra("WAKE_WORD_TRIGGERED", true);
        context.startActivity(directIntent);
        android.util.Log.d("AppForeground", "Direct startActivity attempted");
    }
} catch (Exception ex) {
    android.util.Log.e("AppForeground", "Direct launch blocked: " + ex.getMessage());
}

            android.util.Log.d("AppForeground", "Notification shown with fullscreen intent");

        } catch (Exception e) {
            android.util.Log.e("AppForeground", "Error: " + e.getMessage());
        }
    }

    private void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
NotificationChannel channel = new NotificationChannel(
    CHANNEL_ID,
    "Wake Word Alerts",
    NotificationManager.IMPORTANCE_HIGH
);
channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
channel.setBypassDnd(true);
            channel.setDescription("RemainApp wake word notifications");
            channel.enableLights(true);
            channel.enableVibration(true);
            channel.setShowBadge(false);
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            manager.createNotificationChannel(channel);
        }
    }
     @ReactMethod
public void addListener(String eventName) {
    // Required for NativeEventEmitter
}

@ReactMethod
public void removeListeners(Integer count) {
    // Required for NativeEventEmitter
}
}
