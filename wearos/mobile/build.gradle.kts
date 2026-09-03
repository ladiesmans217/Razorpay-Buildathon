plugins {
    id("com.android.application")
}

android {
    namespace = "com.rememberme.caregrid.mobile"
    compileSdk = 36

    val caregridWebUrl = providers.gradleProperty("caregridWebUrl")
        .orElse("https://YOUR-HTTPS-TUNNEL.example.com/community-app")
        .get()

    defaultConfig {
        applicationId = "com.rememberme.caregrid.mobile"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "CAREGRID_WEB_URL", "\"$caregridWebUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
}
