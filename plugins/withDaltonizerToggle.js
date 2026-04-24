const { CodeGenerator, withMainActivity } = require("@expo/config-plugins");

const { mergeContents } = CodeGenerator;
const MAIN_ACTIVITY_CLASS_ANCHOR =
  /class MainActivity\s*:\s*ReactActivity\(\)\s*{/;
const FINAL_CLASS_BRACE_ANCHOR = /^}$/;

function ensureImport(contents, importLine) {
  if (contents.includes(importLine)) {
    return contents;
  }

  const lines = contents.split("\n");
  const packageLine = lines.findIndex((line) => line.startsWith("package "));

  if (packageLine === -1) {
    return contents;
  }

  lines.splice(packageLine + 1, 0, importLine);
  return lines.join("\n");
}

module.exports = function withDaltonizerToggle(config) {
  return withMainActivity(config, (configWithMainActivity) => {
    if (configWithMainActivity.modResults.language !== "kt") {
      return configWithMainActivity;
    }

    let contents = configWithMainActivity.modResults.contents;

    contents = ensureImport(contents, "import android.provider.Settings");
    contents = ensureImport(contents, "import android.util.Log");

    if (!contents.includes("private var wasGrayscaleEnabled = false")) {
      contents = mergeContents({
        src: contents,
        newSrc: `    private var wasGrayscaleEnabled = false
    private var previousDaltonizerMode = 0
    private var didWeDisableDaltonizer = false`,
        tag: "echo-daltonizer-fields",
        anchor: MAIN_ACTIVITY_CLASS_ANCHOR,
        offset: 1,
        comment: "//",
      }).contents;
    }

    if (!contents.includes("private fun disableDaltonizer()")) {
      contents = mergeContents({
        src: contents,
        newSrc: `    override fun onResume() {
        super.onResume()
        disableDaltonizer()
    }

    override fun onPause() {
        restoreDaltonizer()
        super.onPause()
    }

    private fun disableDaltonizer() {
        val daltonizerEnabled =
            Settings.Secure.getInt(
                contentResolver,
                "accessibility_display_daltonizer_enabled",
                0,
            )

        if (daltonizerEnabled == 1) {
            val daltonizerMode =
                Settings.Secure.getInt(
                    contentResolver,
                    "accessibility_display_daltonizer",
                    0,
                )

            wasGrayscaleEnabled = true
            previousDaltonizerMode = daltonizerMode
            didWeDisableDaltonizer = true

            try {
                Settings.Secure.putInt(contentResolver, "accessibility_display_daltonizer_enabled", 0)
                Log.d("Daltonizer", "Disabled (was mode: $daltonizerMode)")
            } catch (exception: SecurityException) {
                Log.e("Daltonizer", "No permission - run: adb shell pm grant com.vandam.echo android.permission.WRITE_SECURE_SETTINGS")
            }
        }
    }

    private fun restoreDaltonizer() {
        if (didWeDisableDaltonizer && wasGrayscaleEnabled) {
            try {
                Settings.Secure.putInt(contentResolver, "accessibility_display_daltonizer", previousDaltonizerMode)
                Settings.Secure.putInt(contentResolver, "accessibility_display_daltonizer_enabled", 1)
                Log.d("Daltonizer", "Restored (mode: $previousDaltonizerMode)")
            } catch (exception: SecurityException) {
                Log.e("Daltonizer", "No permission to restore")
            }

            didWeDisableDaltonizer = false
        }
    }`,
        tag: "echo-daltonizer-methods",
        anchor: FINAL_CLASS_BRACE_ANCHOR,
        offset: 0,
        comment: "//",
      }).contents;
    }

    configWithMainActivity.modResults.contents = contents;
    return configWithMainActivity;
  });
};
