# NeoBattle Android App (Capacitor Wrapper)

This directory contains the Capacitor Android native wrapper for **NeoBattle** (`live.neobattle.twa`), configured to run the remote production platform (`https://neobattle.live`) with hardware back navigation, offline fallbacks, black status bar, and zero white flash.

---

## Prerequisites (Windows)
- **Node.js** (v18+) & **npm**
- **Android Studio** (already installed on Windows at `C:\Program Files\Android\Android Studio`).
  > **Note**: Do not install a separate JDK. Android Studio already bundles a complete OpenJDK / JBR (located at `C:\Program Files\Android\Android Studio\jbr`).

---

## 1. Install Dependencies & Sync Android Platform

From the `mobile/` directory:

```powershell
cd mobile
npm install
npx cap sync android
```

This ensures plugins (`@capacitor/app`, `@capacitor/browser`, `@capacitor/network`, `@capacitor/splash-screen`, `@capacitor/status-bar`), configuration, and local offline web assets in `www/` are copied to the Android native project.

---

## 2. Open Project in Android Studio

To open the native project:

```powershell
npx cap open android
```

Alternatively, open **Android Studio** and choose **Open**, then select the directory:
```
C:\Users\hp\firearena-app\mobile\android
```
Allow Gradle to finish indexing and syncing automatically.

---

## 3. Run on a Physical Phone via USB

1. On your Android phone, enable **Developer options** and turn on **USB debugging**.
2. Connect your phone to your PC via USB cable.
3. In Android Studio's top toolbar device selector, select your connected phone.
4. Click the green **Run** (▶) button or press `Shift + F10`.
5. The debug APK will build, install, and open directly on your phone with live logcat inspection.

---

## 4. Build a Signed Release APK with Your Existing Keystore

To build a release APK without hardcoding sensitive passwords or committing your keystore into Git:

### Step 4.1: Configure Global `gradle.properties` (Outside Repository)

To keep sensitive passwords and keystore credentials completely outside the repository, configure the **GLOBAL** `gradle.properties` file on your Windows machine:

**Global path**:
`C:\Users\hp\.gradle\gradle.properties` (or `%USERPROFILE%\.gradle\gradle.properties`)

> [!IMPORTANT]
> **NEVER store passwords or signing credentials inside the repository's `gradle.properties` file!** Always use the global file located in your user profile (`C:\Users\hp\.gradle\gradle.properties`). This ensures credentials can never be accidentally staged, tracked, or pushed to Git.

Add the following block to `C:\Users\hp\.gradle\gradle.properties`:

```properties
# Global Android signing credentials for NeoBattle release builds
# (Located at C:\Users\hp\.gradle\gradle.properties - outside Git repo)
MYAPP_RELEASE_STORE_FILE=C:/Users/hp/Desktop/NeoBattle - Google Play package/signing.keystore
MYAPP_RELEASE_STORE_PASSWORD=YourStorePassword
MYAPP_RELEASE_KEY_ALIAS=YourKeyAlias
MYAPP_RELEASE_KEY_PASSWORD=YourKeyPassword
```

> **Security Note**: All `*.keystore`, `*.jks`, `local.properties`, `keystore.properties`, and `*signing*.properties` files are strictly blocked in `.gitignore`. Gradle will automatically read the global properties during `assembleRelease`.

### Step 4.2: Build the Signed Release APK via Command Line or Android Studio

#### Option A: Command Line (PowerShell)
Using the Gradle wrapper inside `mobile/android`:

```powershell
cd mobile/android
.\gradlew.bat assembleRelease
```

#### Option B: Android Studio GUI
1. In Android Studio, go to menu: **Build** > **Generate Signed Bundle / APK...**
2. Choose **APK** and click **Next**.
3. Point to your existing keystore file, enter the key alias and passwords.
4. Select the **release** build variant and click **Finish**.

---

## 5. Output Release APK Path

Once the build finishes, the signed release APK is located at:

```
mobile/android/app/build/outputs/apk/release/app-release.apk
```

You can distribute this APK directly or update your installed TWA package in place (since it shares the package ID `live.neobattle.twa` and signing key).

---

## Technical Features Included
- **Zero White Anywhere**: Android theme windowBackground, WebView canvas, status bar, and navigation bar are `#000000`.
- **Hardware Back Button**: Traverses WebView history backwards; exits only when the user is on the home page (`https://neobattle.live/`).
- **External Links in System Browser**: Any URL outside `neobattle.live` opens in the user's default browser (`@capacitor/browser` / `Intent.ACTION_VIEW`), keeping external logins and payments safe.
- **Offline Screen**: If network connection drops or DNS fails, the app renders the local `offline.html` with a Retry button and auto-reloads `https://neobattle.live` as soon as the connection returns.
- **User-Agent App Marker**: Appends `NeoBattleApp/1.0` to the WebView user-agent for automated website detection without manual query parameters.
